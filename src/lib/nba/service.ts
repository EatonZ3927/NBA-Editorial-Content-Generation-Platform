import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, newsItems, playerSeasons, players } from "@/db/schema";
import {
  currentNbaSeasonYear,
  fetchAthlete,
  fetchAthleteOverview,
  fetchNews,
  fetchScoreboard,
  fetchScoreboardRange,
  searchAthletes,
} from "./espn";
import { fetchLeagueLeaders, fetchPlayerSeasonHistory, type StatCategoryKey } from "./nbaStats";
import { fetchNewsViaSkill, fetchScoreboardViaSkill } from "./nbaData";
import type {
  DataSource,
  GameSummary,
  LeaderRow,
  NewsItem,
  PlayerProfile,
  PlayerSeasonStat,
  ScoreboardResult,
  StatSplit,
} from "./types";
import { PLAYER_ZH as playerZhMap, playerZh, teamZh } from "./teams";

const CACHE_TTL_MS = 1000 * 60 * 30;

function nowIso() {
  return new Date().toISOString();
}

/* ----------------------------- 今日比分 ----------------------------- */

export async function getScoreboard(date: string): Promise<ScoreboardResult> {
  // 比分抓取优先走 nba-data skill（sports-skills CLI 封装，见 lib/nba/nbaData.ts），
  // 同时并行直连 ESPN，用来补充 leaders / odds 等字段并作为 skill 不可用时的兜底。
  const [skill, espn] = await Promise.allSettled([
    fetchScoreboardViaSkill(date),
    fetchScoreboard(date),
  ]);
  const skillGames = skill.status === "fulfilled" ? skill.value : null;
  const espnGames = espn.status === "fulfilled" ? espn.value : null;
  const attempted = skillGames !== null || espnGames !== null;

  let live: GameSummary[] = [];
  if (skillGames && skillGames.length > 0) {
    const espnById = new Map((espnGames ?? []).map((g) => [g.id, g]));
    live = skillGames.map((game) => {
      const extra = espnById.get(game.id);
      if (!extra) return game;
      return {
        ...game,
        home: { ...game.home, leaders: extra.home.leaders },
        away: { ...game.away, leaders: extra.away.leaders },
        series: extra.series ?? game.series,
        odds: extra.odds ?? game.odds,
        link: extra.link ?? game.link,
      };
    });
  } else if (espnGames && espnGames.length > 0) {
    live = espnGames;
  }

  if (live.length > 0) {
    await Promise.allSettled(live.map((game) => upsertGame(game)));
    return { date, source: "live", games: live, fetchedAt: nowIso() };
  }
  const cached = await readGames(date);
  return {
    date,
    source: cached.length ? "cache" : attempted ? "live" : "cache",
    games: cached,
    fetchedAt: nowIso(),
  };
}

/**
 * 最近一个有比赛的日期：
 * 先看今天，没有则一次性拉取过去 160 天的区间数据，取最新比赛日（自动跨过休赛期/空档日）。
 */
export async function getRecentBoard(): Promise<ScoreboardResult> {
  const today = new Date().toISOString().slice(0, 10);
  const todayBoard = await getScoreboard(today);
  if (todayBoard.games.length > 0) return todayBoard;

  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 160);
  try {
    const range = await fetchScoreboardRange(from.toISOString().slice(0, 10), today);
    if (range.length > 0) {
      const latestDate = range.reduce((max, g) => (g.gameDate > max ? g.gameDate : max), range[0].gameDate);
      const latest = range.filter((g) => g.gameDate === latestDate);
      await Promise.allSettled(latest.map((game) => upsertGame(game)));
      return { date: latestDate, source: "live", games: latest, fetchedAt: nowIso() };
    }
  } catch {
    // 区间接口失败时回退到数据库缓存
  }

  const last = await db
    .select({ gameDate: games.gameDate })
    .from(games)
    .orderBy(desc(games.gameDate))
    .limit(1);
  if (last[0]?.gameDate && last[0].gameDate !== today) {
    return getScoreboard(last[0].gameDate);
  }
  return todayBoard;
}

async function upsertGame(game: GameSummary) {
  await db
    .insert(games)
    .values({
      espnEventId: game.id,
      gameDate: game.gameDate,
      awayAbbr: game.away.abbr,
      homeAbbr: game.home.abbr,
      awayName: game.away.displayName,
      homeName: game.home.displayName,
      awayScore: game.away.score,
      homeScore: game.home.score,
      awayRecord: game.away.record,
      homeRecord: game.home.record,
      statusState: game.statusState,
      statusDetail: game.statusDetail,
      venue: game.venue,
      broadcast: game.broadcast,
      series: game.series,
      payload: game as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: games.espnEventId,
      set: {
        awayScore: game.away.score,
        homeScore: game.home.score,
        statusState: game.statusState,
        statusDetail: game.statusDetail,
        series: game.series,
        payload: game as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
}

async function readGames(date: string): Promise<GameSummary[]> {
  const rows = await db
    .select()
    .from(games)
    .where(eq(games.gameDate, date))
    .orderBy(desc(games.updatedAt));
  return rows
    .map((row) => row.payload as unknown as GameSummary)
    .filter(Boolean)
    .map((game) => ({ ...game, gameDate: date }));
}

/* ------------------------------- 新闻 ------------------------------- */

/** 新闻只保留最近 10 天内的真实内容，杜绝过期数据与"幻觉新闻" */
const NEWS_MAX_AGE_DAYS = 10;

function isFreshTimestamp(publishedAt: string | null, now = Date.now()): boolean {
  if (!publishedAt) return false;
  const ts = new Date(publishedAt).getTime();
  if (Number.isNaN(ts)) return false;
  const dayMs = 24 * 3600 * 1000;
  return ts <= now + dayMs && ts >= now - NEWS_MAX_AGE_DAYS * dayMs;
}

function isFreshNews(item: NewsItem, now = Date.now()): boolean {
  return isFreshTimestamp(item.publishedAt, now);
}

/** 同一篇报道在 skill / ESPN / 本地库中的 id 可能不同，按「标题 + 发布日期」去重 */
function newsDedupeKey(item: NewsItem): string {
  return `${(item.headline ?? "").trim().toLowerCase()}|${(item.publishedAt ?? "").slice(0, 10)}`;
}

function sortNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/**
 * 新闻获取（新闻中心每次打开/刷新、文案工作台加载时都会调用）：
 * 1) 实时抓取最新新闻——nba-data skill 为主、直连 ESPN 为补充，数据源最新流≈过去 24 小时；
 * 2) 抓到的新鲜新闻写入本地库累积保存，10 天有效期内持续存在并显示；
 * 3) 返回「本次新抓 + 库中仍在有效期」的并集，超过 10 天的旧闻自动从页面移除并清出数据库。
 * 数据库不可用时不影响本次实时抓取结果的展示。
 */
export async function getNews(limit = 30): Promise<{ source: DataSource; items: NewsItem[]; fetchedAt: string }> {
  const [skill, espn] = await Promise.allSettled([fetchNewsViaSkill(), fetchNews(limit)]);
  const sources = [
    skill.status === "fulfilled" ? skill.value : null,
    espn.status === "fulfilled" ? espn.value : null,
  ];
  const liveSeen = new Set<string>();
  const live: NewsItem[] = [];
  for (const list of sources) {
    for (const item of list ?? []) {
      const key = newsDedupeKey(item);
      if (!item.headline || liveSeen.has(key)) continue;
      liveSeen.add(key);
      live.push(item);
    }
  }
  const liveFresh = live.filter((item) => isFreshNews(item));

  // 新抓到的新闻入库累积（写入失败不影响本次展示）
  if (liveFresh.length > 0) {
    await Promise.allSettled(liveFresh.map((item) => upsertNews(item)));
  }

  // 读取库中仍在 10 天有效期内的历史新闻，同时把过期旧闻清出数据库；
  // 数据库不可用时退化为仅使用本次实时抓取的内容。
  let stored: NewsItem[] = [];
  try {
    const rows = await db
      .select()
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt))
      .limit(500);
    const freshRows = rows.filter((row) => isFreshTimestamp(row.publishedAt));
    stored = freshRows.map((row) => ({
      id: row.espnId,
      headline: row.headline,
      description: row.description,
      url: row.url,
      imageUrl: row.imageUrl,
      publishedAt: row.publishedAt,
      categories: (row.categories as string[] | null) ?? [],
    }));
    const freshRowIds = new Set(freshRows.map((row) => row.id));
    const staleRowIds = rows.filter((row) => !freshRowIds.has(row.id)).map((row) => row.id);
    if (staleRowIds.length > 0) {
      await db.delete(newsItems).where(inArray(newsItems.id, staleRowIds));
    }
  } catch {
    stored = [];
  }

  // 合并：本次新抓优先（字段最新），库中历史新闻补充，统一按发布时间倒序
  const seen = new Set(liveFresh.map((item) => newsDedupeKey(item)));
  const merged = [...liveFresh, ...stored.filter((item) => !seen.has(newsDedupeKey(item)))];
  const items = sortNews(merged).slice(0, limit);
  const source: DataSource = liveFresh.length > 0 ? "live" : items.length > 0 ? "cache" : "offline";
  return { source, items, fetchedAt: nowIso() };
}

async function upsertNews(item: NewsItem) {
  await db
    .insert(newsItems)
    .values({
      espnId: item.id,
      headline: item.headline,
      description: item.description,
      url: item.url,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      categories: item.categories,
    })
    .onConflictDoUpdate({
      target: newsItems.espnId,
      set: {
        headline: item.headline,
        description: item.description,
        imageUrl: item.imageUrl,
        publishedAt: item.publishedAt,
        createdAt: new Date(),
      },
    });
}

/* ------------------------------- 球员 ------------------------------- */

export type PlayerSearchHit = {
  espnId: string;
  name: string;
  zhName: string | null;
  team: string;
  headshot: string | null;
  cached: boolean;
};

/** 中文查询 → 反查英文名（例如「字母哥」「库里」） */
function cjkToEnglish(query: string): string | null {
  const q = query.trim();
  if (!/[\u4e00-\u9fa5]/.test(q)) return null;
  const direct = Object.entries(playerZhMap).find(([, zh]) => zh === q || zh.includes(q));
  if (direct) return direct[0];
  const nick: Record<string, string> = {
    字母哥: "Giannis Antetokounmpo",
    浓眉: "Anthony Davis",
    老詹: "LeBron James",
    詹皇: "LeBron James",
    库里: "Stephen Curry",
    杜兰特: "Kevin Durant",
    约老师: "Nikola Jokic",
    东契奇: "Luka Doncic",
    恩比德: "Joel Embiid",
    哈登: "James Harden",
    文班: "Victor Wembanyama",
    爱德华兹: "Anthony Edwards",
    塔图姆: "Jayson Tatum",
  };
  return nick[q] ?? null;
}

export async function searchPlayers(query: string): Promise<PlayerSearchHit[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  try {
    let hits = await searchAthletes(q, 10);
    if (hits.length === 0) {
      const english = cjkToEnglish(q);
      if (english) hits = await searchAthletes(english, 10);
    }
    return hits.map((hit) => ({
      espnId: hit.id,
      name: hit.displayName,
      zhName: playerZh(hit.displayName),
      team: hit.subtitle,
      headshot: hit.image || null,
      cached: false,
    }));
  } catch {
    const rows = await db
      .select()
      .from(players)
      .where(sql`lower(${players.fullName}) like ${`%${q.toLowerCase()}%`}`)
      .limit(10);
    return rows.map((row) => ({
      espnId: row.espnId,
      name: row.fullName,
      zhName: playerZh(row.fullName),
      team: row.teamAbbr ?? "",
      headshot: row.headshot,
      cached: true,
    }));
  }
}

function emptySplit(): StatSplit {
  return { label: "", gp: null, min: null, pts: null, reb: null, ast: null, stl: null, blk: null, fgp: null, tpp: null, ftp: null };
}

function aggregate(seasons: PlayerSeasonStat[]): StatSplit {
  const rows = seasons.filter((s) => s.gp && s.gp > 0);
  if (rows.length === 0) return emptySplit();
  const gp = rows.reduce((sum, r) => sum + (r.gp ?? 0), 0);
  const avg = (pick: (r: PlayerSeasonStat) => number | null) => {
    const total = rows.reduce((sum, r) => sum + (pick(r) ?? 0) * (r.gp ?? 0), 0);
    return gp ? Math.round((total / gp) * 10) / 10 : null;
  };
  return {
    label: "Career",
    gp,
    min: avg((r) => r.min),
    pts: avg((r) => r.pts),
    reb: avg((r) => r.reb),
    ast: avg((r) => r.ast),
    stl: avg((r) => r.stl),
    blk: avg((r) => r.blk),
    fgp: avg((r) => r.fgp),
    tpp: avg((r) => r.tpp),
    ftp: avg((r) => r.ftp),
  };
}

export async function getPlayerProfile(
  espnId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<PlayerProfile> {
  const cachedBio = await readPlayerCache(espnId);
  let bio: Partial<PlayerProfile> = {};
  let overview: Awaited<ReturnType<typeof fetchAthleteOverview>> | null = null;
  let source: DataSource = "live";

  try {
    const [athlete, ov] = await Promise.all([
      fetchAthlete(espnId),
      fetchAthleteOverview(espnId).catch(() => null),
    ]);
    bio = athlete;
    overview = ov;
  } catch {
    source = "cache";
    if (cachedBio) {
      bio = {
        espnId: cachedBio.espnId,
        fullName: cachedBio.fullName,
        shortName: cachedBio.displayName,
        position: cachedBio.position,
        headshot: cachedBio.headshot,
        height: cachedBio.height,
        weight: cachedBio.weight,
        age: cachedBio.age,
        debutYear: cachedBio.debutYear,
        draftText: cachedBio.draftText,
        college: cachedBio.college,
        experience: cachedBio.experience,
        active: cachedBio.active ?? true,
      };
    }
  }

  if (!bio.fullName) {
    bio = { espnId, fullName: cachedBio?.fullName ?? `球员 #${espnId}` };
    source = cachedBio ? "cache" : "offline";
  }

  const fullName = bio.fullName ?? "";

  // 历史分赛季数据：优先缓存（30 分钟内），否则抓取联盟数据表
  const historyCache = await readSeasonsCache(espnId);
  let seasons: PlayerSeasonStat[] = historyCache.seasons;
  if (
    options.forceRefresh ||
    historyCache.seasons.length === 0 ||
    Date.now() - historyCache.updatedAt > CACHE_TTL_MS
  ) {
    try {
      const from = bio.debutYear ?? cachedBio?.debutYear ?? new Date().getUTCFullYear() - 6;
      const live = await fetchPlayerSeasonHistory(fullName, from, currentNbaSeasonYear());
      if (live.length > 0) {
        seasons = live;
        await saveSeasonsCache(espnId, fullName, live);
      } else if (historyCache.seasons.length > 0) {
        seasons = historyCache.seasons;
      }
    } catch {
      if (historyCache.seasons.length > 0) seasons = historyCache.seasons;
    }
  }

  // 球队归属：优先取最近一个常规赛赛季的官方球队，其次取缓存
  const latestRegular = seasons.find((s) => s.seasonType === "regular");
  const teamAbbr = latestRegular?.teamAbbr ?? cachedBio?.teamAbbr ?? null;

  const seasonRegular =
    overview?.seasonSplits.find((s) => s.label === "Regular Season" && (s.gp ?? 0) > 0) ??
    (latestRegular
      ? {
          label: latestRegular.seasonLabel,
          gp: latestRegular.gp,
          min: latestRegular.min,
          pts: latestRegular.pts,
          reb: latestRegular.reb,
          ast: latestRegular.ast,
          stl: latestRegular.stl,
          blk: latestRegular.blk,
          fgp: latestRegular.fgp,
          tpp: latestRegular.tpp,
          ftp: latestRegular.ftp,
        }
      : null);
  const careerFromOverview = overview?.seasonSplits.find((s) => s.label === "Career") ?? null;
  const careerRegular =
    careerFromOverview && careerFromOverview.gp
      ? careerFromOverview
      : seasons.filter((s) => s.seasonType === "regular").length
        ? aggregate(seasons.filter((s) => s.seasonType === "regular"))
        : null;
  const careerPlayoffs =
    seasons.filter((s) => s.seasonType === "playoffs").length > 0
      ? aggregate(seasons.filter((s) => s.seasonType === "playoffs"))
      : null;

  const profile: PlayerProfile = {
    espnId,
    fullName,
    shortName: bio.shortName ?? null,
    zhName: playerZh(fullName),
    teamAbbr,
    teamName: cachedBio?.teamName ?? null,
    teamZh: teamZh(teamAbbr) || null,
    position: bio.position ?? null,
    headshot:
      bio.headshot ?? `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`,
    height: bio.height ?? null,
    weight: bio.weight ?? null,
    age: bio.age ?? null,
    debutYear: bio.debutYear ?? null,
    draftText: bio.draftText ?? null,
    college: bio.college ?? null,
    experience: bio.experience ?? null,
    active: bio.active ?? true,
    currentSeason: seasonRegular,
    careerRegular,
    careerPlayoffs,
    seasons,
    recentGames: overview?.recentGames ?? [],
    awards: overview?.awards ?? [],
    note: overview?.note ?? null,
    source,
    fetchedAt: nowIso(),
  };

  await savePlayerCache(profile);
  return profile;
}

async function readPlayerCache(espnId: string) {
  const rows = await db.select().from(players).where(eq(players.espnId, espnId)).limit(1);
  return rows[0] ?? null;
}

async function savePlayerCache(profile: PlayerProfile) {
  const values = {
    espnId: profile.espnId,
    fullName: profile.fullName,
    displayName: profile.shortName,
    teamAbbr: profile.teamAbbr,
    teamName: profile.teamName,
    position: profile.position,
    headshot: profile.headshot,
    height: profile.height,
    weight: profile.weight,
    age: profile.age,
    debutYear: profile.debutYear,
    draftText: profile.draftText,
    college: profile.college,
    experience: profile.experience,
    active: profile.active,
    careerSummary: {
      regular: profile.careerRegular,
      playoffs: profile.careerPlayoffs,
    } as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
  await db
    .insert(players)
    .values(values)
    .onConflictDoUpdate({
      target: players.espnId,
      set: {
        fullName: values.fullName,
        displayName: values.displayName,
        position: values.position,
        headshot: values.headshot,
        height: values.height,
        weight: values.weight,
        age: values.age,
        debutYear: values.debutYear,
        draftText: values.draftText,
        college: values.college,
        experience: values.experience,
        careerSummary: values.careerSummary,
        updatedAt: new Date(),
      },
    });
}

async function readSeasonsCache(espnId: string) {
  const rows = await db
    .select()
    .from(playerSeasons)
    .where(eq(playerSeasons.espnId, espnId))
    .orderBy(desc(playerSeasons.seasonYear));
  if (rows.length === 0) return { seasons: [] as PlayerSeasonStat[], updatedAt: 0 };
  const updatedAt = rows.reduce((max, row) => Math.max(max, row.updatedAt?.getTime() ?? 0), 0);
  const seasons: PlayerSeasonStat[] = rows.map((row) => ({
    seasonLabel: row.seasonLabel,
    seasonYear: row.seasonYear,
    seasonType: row.seasonType as "regular" | "playoffs",
    teamAbbr: row.teamAbbr,
    gp: row.gp,
    min: row.min,
    pts: row.pts,
    reb: row.reb,
    ast: row.ast,
    stl: row.stl,
    blk: row.blk,
    tov: row.tov,
    fgp: row.fgp,
    tpp: row.tpp,
    ftp: row.ftp,
    source: "cache",
  }));
  return { seasons, updatedAt };
}

async function saveSeasonsCache(espnId: string, playerName: string, seasons: PlayerSeasonStat[]) {
  if (seasons.length === 0) return;
  await db
    .insert(playerSeasons)
    .values(
      seasons.map((season) => ({
        uniqueKey: `${espnId}:${season.seasonYear}:${season.seasonType}`,
        espnId,
        playerName,
        seasonLabel: season.seasonLabel,
        seasonYear: season.seasonYear,
        seasonType: season.seasonType,
        teamAbbr: season.teamAbbr,
        gp: season.gp,
        min: season.min,
        pts: season.pts,
        reb: season.reb,
        ast: season.ast,
        stl: season.stl,
        blk: season.blk,
        tov: season.tov,
        fgp: season.fgp,
        tpp: season.tpp,
        ftp: season.ftp,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: playerSeasons.uniqueKey,
      set: {
        gp: sql`excluded.gp`,
        min: sql`excluded.min`,
        pts: sql`excluded.pts`,
        reb: sql`excluded.reb`,
        ast: sql`excluded.ast`,
        stl: sql`excluded.stl`,
        blk: sql`excluded.blk`,
        tov: sql`excluded.tov`,
        fgp: sql`excluded.fgp`,
        tpp: sql`excluded.tpp`,
        ftp: sql`excluded.ftp`,
        updatedAt: new Date(),
      },
    });
}

/* ----------------------------- 联盟数据榜 ----------------------------- */

const leaderCache = new Map<string, { rows: LeaderRow[]; at: number }>();

export async function getLeagueLeaders(
  seasonYear: number,
  statCategory: StatCategoryKey = "pts",
): Promise<{ source: DataSource; season: number; stat: string; rows: LeaderRow[] }> {
  const key = `${seasonYear}:${statCategory}`;
  const cached = leaderCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { source: "cache", season: seasonYear, stat: statCategory, rows: cached.rows };
  }
  try {
    let rows = await fetchLeagueLeaders({ seasonYear, statCategory });
    let usedSeason = seasonYear;
    // 新赛季尚未开打时，自动回退到上一个已完赛赛季
    if (rows.length === 0) {
      rows = await fetchLeagueLeaders({ seasonYear: seasonYear - 1, statCategory });
      usedSeason = seasonYear - 1;
    }
    const top = rows.slice(0, 20);
    leaderCache.set(key, { rows: top, at: Date.now() });
    leaderCache.set(`${usedSeason}:${statCategory}`, { rows: top, at: Date.now() });
    return { source: "live", season: usedSeason, stat: statCategory, rows: top };
  } catch {
    if (cached) return { source: "cache", season: seasonYear, stat: statCategory, rows: cached.rows };
    return { source: "offline", season: seasonYear, stat: statCategory, rows: [] };
  }
}

export async function getCachedPlayerBySeason(
  espnId: string,
  seasonYear: number,
): Promise<PlayerSeasonStat | null> {
  const rows = await db
    .select()
    .from(playerSeasons)
    .where(and(eq(playerSeasons.espnId, espnId), eq(playerSeasons.seasonYear, seasonYear)))
    .limit(2);
  const regular = rows.find((r) => r.seasonType === "regular") ?? rows[0];
  if (!regular) return null;
  return {
    seasonLabel: regular.seasonLabel,
    seasonYear: regular.seasonYear,
    seasonType: "regular",
    teamAbbr: regular.teamAbbr,
    gp: regular.gp,
    min: regular.min,
    pts: regular.pts,
    reb: regular.reb,
    ast: regular.ast,
    stl: regular.stl,
    blk: regular.blk,
    tov: regular.tov,
    fgp: regular.fgp,
    tpp: regular.tpp,
    ftp: regular.ftp,
    source: "cache",
  };
}
