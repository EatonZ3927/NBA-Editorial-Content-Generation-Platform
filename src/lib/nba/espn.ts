import type {
  GameLeader,
  GameSummary,
  GameTeam,
  LeaderRow,
  NewsItem,
  PlayerGameLogEntry,
  PlayerProfile,
  PlayerSeasonStat,
  StatSplit,
} from "./types";

const ESPN_SITE = "https://site.web.api.espn.com";
const ESPN_CORE = "https://sports.core.api.espn.com";
const ESPN_CONTENT = "https://content.core.api.espn.com";

type Json = Record<string, unknown>;

async function getJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // 纯前端浏览器直连：不设置 User-Agent（非 CORS safelisted，会触发 preflight；
    // 浏览器本就会带真实 UA），保持 simple request 以命中 ESPN 的 ACAO:*。
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstream ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ 比分 ------------------------------ */

export function espnDateParam(date: string): string {
  return date.replace(/-/g, "");
}

export async function fetchScoreboard(date: string): Promise<GameSummary[]> {
  const url = `${ESPN_SITE}/apis/site/v2/sports/basketball/nba/scoreboard?dates=${espnDateParam(date)}&lang=en`;
  const data = await getJson<{ events?: Json[] }>(url);
  const events = data.events ?? [];
  return events.map((event) => mapEvent(event, date));
}

/** 拉取一段日期区间内的全部比赛（ESPN 支持 dates=YYYYMMDD-YYYYMMDD） */
export async function fetchScoreboardRange(from: string, to: string): Promise<GameSummary[]> {
  const url =
    `${ESPN_SITE}/apis/site/v2/sports/basketball/nba/scoreboard` +
    `?dates=${espnDateParam(from)}-${espnDateParam(to)}&limit=300&lang=en`;
  const data = await getJson<{ events?: Json[] }>(url, 12000);
  const events = data.events ?? [];
  return events.map((event) => mapEvent(event, str(event.date)?.slice(0, 10) ?? to));
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function mapLeader(raw: Json): GameLeader {
  const leaders = (raw.leaders as Json[] | undefined) ?? [];
  const top = leaders[0] ?? {};
  const athlete = (top.athlete as Json | undefined) ?? {};
  return {
    name: str(raw.name) ?? "points",
    athleteId: str(athlete.id) ?? "",
    athleteName: str(athlete.fullName) ?? str(athlete.displayName) ?? "",
    value: num(top.value) ?? 0,
    displayValue: str(top.displayValue) ?? "",
    headshot: str(athlete.headshot),
  };
}

function mapTeam(raw: Json): GameTeam {
  const team = (raw.team as Json | undefined) ?? {};
  const records = (raw.records as Json[] | undefined) ?? [];
  return {
    abbr: str(team.abbreviation) ?? "",
    name: str(team.shortDisplayName) ?? str(team.name) ?? "",
    displayName: str(team.displayName) ?? str(team.name) ?? "",
    score: num(raw.score),
    record: records.length ? str(records[0].summary) : null,
    winner: Boolean(raw.winner),
    logo: str(team.logo) ?? str(team.logos),
    leaders: ((raw.leaders as Json[] | undefined) ?? []).map(mapLeader),
  };
}

function mapEvent(event: Json, fallbackDate: string): GameSummary {
  const comp = ((event.competitions as Json[] | undefined) ?? [])[0] ?? {};
  const status = ((event.status as Json | undefined) ?? {}) as Json;
  const type = (status.type as Json | undefined) ?? {};
  const competitors = (comp.competitors as Json[] | undefined) ?? [];
  const mapped = competitors.map(mapTeam);
  const home = mapped.find((t) => (t as GameTeam & { homeAway?: string }).homeAway === "home") ?? mapped[0];
  const away =
    mapped.find((t) => (t as GameTeam & { homeAway?: string }).homeAway === "away") ?? mapped[1];
  const odds = (comp.odds as Json[] | undefined)?.[0] ?? null;
  const broadcasts = (comp.broadcasts as Json[] | undefined) ?? [];
  const broadcastNames = broadcasts
    .flatMap((b) => ((b.names as string[] | undefined) ?? []))
    .slice(0, 3)
    .join(" / ");
  const series = (comp.series as Json | undefined) ?? null;
  // 赛季阶段：ESPN event.season.type 1=季前赛 2=常规赛 3=季后赛
  // 常规赛也存在"赛季交手战绩"字段，直接展示会被误读为季后赛系列赛，故仅季后赛保留 series
  const seasonRaw = (event.season as Json | undefined) ?? {};
  const seasonTypeNum = num(seasonRaw.type);
  const seasonSlug = str(seasonRaw.slug) ?? "";
  const seasonType: GameSummary["seasonType"] =
    seasonTypeNum === 3 || seasonSlug.includes("post")
      ? "post"
      : seasonTypeNum === 1 || seasonSlug.includes("pre")
        ? "pre"
        : "regular";
  const links = (event.links as Json[] | undefined) ?? [];

  return {
    id: str(event.id) ?? "",
    date: str(event.date) ?? "",
    gameDate: fallbackDate,
    shortName: str(event.shortName) ?? "",
    name: str(event.name) ?? "",
    statusState: (str(type.state) ?? "pre") as GameSummary["statusState"],
    statusDetail: str(type.detail) ?? str(type.description) ?? "",
    completed: Boolean(type.completed),
    home,
    away,
    venue: str((comp.venue as Json | undefined)?.fullName),
    broadcast: broadcastNames || null,
    series: seasonType === "post" && series ? str(series.summary) : null,
    seasonType,
    odds: odds
      ? {
          detail: str(odds.details) ?? "",
          overUnder: num(odds.overUnder),
        }
      : null,
    link: str(links[0]?.href),
  };
}

/* ------------------------------ 新闻 ------------------------------ */

export async function fetchNews(limit = 30): Promise<NewsItem[]> {
  const url = `${ESPN_SITE}/apis/site/v2/sports/basketball/nba/news?limit=${limit}&lang=en`;
  const data = await getJson<{ articles?: Json[] }>(url);
  const articles = data.articles ?? [];
  return articles.map((article) => ({
    id: str(article.nowId) ?? str(article.id) ?? crypto.randomUUID(),
    headline: str(article.headline) ?? "NBA 资讯",
    description: str(article.description),
    url:
      str(((article.links as Json | undefined)?.web as Json | undefined)?.href) ??
      str((article.links as Json | undefined)?.mobile),
    imageUrl: str((article.images as Json[] | undefined)?.[0]?.url),
    publishedAt: str(article.published) ?? str(article.lastModified),
    categories: ((article.categories as Json[] | undefined) ?? [])
      .map((c) => str(c.description))
      .filter((c): c is string => Boolean(c))
      .slice(0, 4),
  }));
}

/** 把 ESPN 文章 HTML 转成纯文本段落（去标签、去掉视频/图片占位，保留段落分隔） */
function storyHtmlToText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,iframe,figure,aside,video1,photo1").forEach((el) => el.remove());
    const paras = Array.from(doc.querySelectorAll("p"))
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (paras.length > 0) return paras.join("\n\n");
    return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 抓取新闻完整全文（ESPN content API；GET 为 simple request，返回 ACAO:*，浏览器可直连）。
 * 兼容 nowId（如 1-49590770）与纯数字 id。失败返回 null，调用方回退到新闻摘要。
 */
export async function fetchNewsStory(articleId: string): Promise<string | null> {
  const numericId = articleId.split("~")[0].split("-").pop() ?? articleId;
  if (!/^\d+$/.test(numericId)) return null;
  try {
    const data = await getJson<{ headlines?: Json[] }>(
      `${ESPN_CONTENT}/v1/sports/news/${numericId}`,
      12000,
    );
    const story = str((data.headlines?.[0] as Json | undefined)?.story);
    if (!story) return null;
    const text = storyHtmlToText(story);
    return text.length >= 40 ? text : null;
  } catch {
    return null;
  }
}

/* ------------------------------ 球员 ------------------------------ */

type AthleteSearchItem = {
  id: string;
  displayName: string;
  subtitle: string;
  image: string;
};

export async function searchAthletes(query: string, limit = 8): Promise<AthleteSearchItem[]> {
  const url = `${ESPN_SITE}/apis/search/v2?query=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await getJson<{ results?: Json[] }>(url);
  const group = (data.results ?? []).find((r) => r.type === "player") as Json | undefined;
  const contents = (group?.contents as Json[] | undefined) ?? [];
  return contents
    .map((item) => ({
      id: (str(item.uid)?.split("~a:")[1] ?? str(item.id) ?? "").trim(),
      displayName: str(item.displayName) ?? "",
      subtitle: str(item.subtitle) ?? "",
      image: str((item.image as Json | undefined)?.default) ?? "",
    }))
    .filter((item) => item.id.length > 0 && item.displayName.length > 0);
}

export async function fetchAthlete(espnId: string): Promise<Partial<PlayerProfile>> {
  const url = `${ESPN_CORE}/v2/sports/basketball/leagues/nba/athletes/${espnId}`;
  const data = await getJson<Json>(url);
  return {
    espnId,
    fullName: str(data.displayName) ?? str(data.fullName) ?? "",
    shortName: str(data.shortName),
    position: str((data.position as Json | undefined)?.abbreviation),
    headshot: str(data.headshot) ?? `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`,
    height: str(data.displayHeight),
    weight: str(data.displayWeight),
    age: num(data.age),
    debutYear: num(data.debutYear),
    draftText: str((data.draft as Json | undefined)?.displayText),
    college: str((data.college as Json | undefined)?.name),
    experience: str(data.experience)?.replace(" years", " 年") ?? null,
    active: data.active !== false,
  };
}

function mapSplit(split: Json): StatSplit {
  const stats = (split.stats as string[] | undefined) ?? [];
  const toNum = (v: string | undefined) => (v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    label: str(split.displayName) ?? "",
    gp: toNum(stats[0]),
    min: toNum(stats[1]),
    fgp: toNum(stats[2]),
    tpp: toNum(stats[3]),
    ftp: toNum(stats[4]),
    reb: toNum(stats[5]),
    ast: toNum(stats[6]),
    blk: toNum(stats[7]),
    stl: toNum(stats[8]),
    pts: toNum(stats[11]),
  };
}

type AthleteOverview = {
  seasonSplits: StatSplit[];
  careerSplits: StatSplit[];
  recentGames: PlayerGameLogEntry[];
  awards: string[];
  note: string | null;
  seasonYear: number | null;
};

export async function fetchAthleteOverview(espnId: string, season?: number): Promise<AthleteOverview> {
  const year = season ?? currentNbaSeasonYear();
  const url = `${ESPN_SITE}/apis/common/v3/sports/basketball/nba/athletes/${espnId}/overview?season=${year}`;
  const data = await getJson<Json>(url);
  const statistics = (data.statistics as Json | undefined) ?? {};
  const splits = (statistics.splits as Json[] | undefined) ?? [];
  const gameLog = (data.gameLog as Json | undefined) ?? {};
  const events = (gameLog.events as Json[] | undefined) ?? [];
  const rotowire = (data.rotowire as Json | undefined) ?? {};
  const awards = (data.awards as Json[] | undefined) ?? [];

  const recentGames: PlayerGameLogEntry[] = events.slice(0, 10).map((entry) => {
    const stats = (entry.stats as string[] | undefined) ?? [];
    const event = (entry.event as Json | undefined) ?? {};
    const atVs = str(event.atVsText) ?? "";
    const homeAway = str(event.homeAway) ?? "";
    const result = str(event.gameResult) ?? "";
    const score = str(event.score) ?? "";
    return {
      date: str(event.gameDate) ?? "",
      opponent: atVs.replace("vs", "").replace("@", "").trim() || str(event.opponent) || "",
      homeAway: homeAway || (atVs.includes("@") ? "away" : "home"),
      result: result ? `${result} ${score}`.trim() : score,
      minutes: stats[0] ?? null,
      pts: stats[10] ?? null,
      reb: stats[4] ?? null,
      ast: stats[5] ?? null,
      fg: stats[1] ?? null,
      detail: null,
    };
  });

  return {
    seasonSplits: splits.map(mapSplit),
    careerSplits: [],
    recentGames,
    awards: awards
      .map((a) => str((a.award as Json | undefined)?.name) ?? str(a.name))
      .filter((a): a is string => Boolean(a))
      .slice(0, 12),
    note: str(rotowire.injuryNews) ?? str(rotowire.news) ?? null,
    seasonYear: year,
  };
}

/* ------------------------------ 联盟数据榜 ------------------------------ */

/**
 * ESPN 数据榜各类别对应的服务端排序键（均为场均口径）。
 * eff（效率值）ESPN 未提供，本地用 PTS+REB+AST+STL+BLK-TOV 估算。
 */
const ESPN_LEADER_SORTS: Record<string, string> = {
  pts: "offensive.avgPoints",
  reb: "general.avgRebounds",
  ast: "offensive.avgAssists",
  stl: "defensive.avgSteals",
  blk: "defensive.avgBlocks",
  fg3m: "offensive.avgThreePointFieldGoalsMade",
  fgp: "offensive.fieldGoalPct",
  min: "general.avgMinutes",
};

type EspnLeaderEntry = {
  athlete?: {
    id?: string | number;
    displayName?: string;
    teamShortName?: string;
    teams?: { abbreviation?: string }[];
  };
  categories?: { name?: string; values?: (number | null)[] }[];
};

/**
 * ESPN 官方数据榜（byathlete 接口，CORS 开放，纯前端亦可直连）。
 * 一次请求返回每名球员的完整数据行（出场/场均时间/得分/篮板/助攻/抢断/盖帽/失误/三项命中率），
 * 本地按索引取值；命中率字段换算为 0-1 小数，与 nbaStats 的 LeaderRow 约定一致。
 */
export async function fetchEspnLeaders(options: {
  seasonYear: number;
  statCategory?: string;
  /** 2 = 常规赛，3 = 季后赛 */
  seasonType?: 2 | 3;
  limit?: number;
}): Promise<LeaderRow[]> {
  const { seasonYear, statCategory = "pts", seasonType = 2, limit = 50 } = options;
  const sortKey = ESPN_LEADER_SORTS[statCategory] ?? ESPN_LEADER_SORTS.pts;
  // 注意 ESPN 赛季编号 = 赛季结束年份：season=2026 即 2025-26 赛季，
  // 而应用内 seasonYear=2026 表示 2026-27，故请求时需 +1
  const url =
    `${ESPN_SITE}/apis/common/v3/sports/basketball/nba/statistics/byathlete` +
    `?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=${limit}` +
    `&season=${seasonYear + 1}&seasontype=${seasonType}` +
    `&sort=${encodeURIComponent(`${sortKey}:desc`)}`;
  const data = await getJson<{
    categories?: { name?: string; names?: string[] }[];
    athletes?: EspnLeaderEntry[];
  }>(url, 12000);

  // 顶层 categories 给出每个板块的字段顺序，运动员行的 values 与之平行
  const index = new Map<string, number>();
  for (const cat of data.categories ?? []) {
    (cat.names ?? []).forEach((name, i) => index.set(`${cat.name}.${name}`, i));
  }

  const rows: LeaderRow[] = [];
  for (const entry of data.athletes ?? []) {
    const cats = entry.categories ?? [];
    const value = (key: string): number | null => {
      const i = index.get(key);
      if (i === undefined) return null;
      const catName = key.split(".")[0];
      const v = cats.find((c) => c.name === catName)?.values?.[i];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const pct = (key: string): number | null => {
      const v = value(key);
      return v === null ? null : v / 100;
    };
    const athlete = entry.athlete ?? {};
    const id = athlete.id === undefined || athlete.id === null ? "" : String(athlete.id);
    const name = athlete.displayName ?? "";
    if (!id || !name) continue;
    rows.push({
      rank: 0,
      espnId: id,
      playerName: name,
      teamAbbr: athlete.teamShortName ?? athlete.teams?.[0]?.abbreviation ?? null,
      gp: value("general.gamesPlayed"),
      min: value("general.avgMinutes"),
      fgp: pct("offensive.fieldGoalPct"),
      tpp: pct("offensive.threePointFieldGoalPct"),
      ftp: pct("offensive.freeThrowPct"),
      reb: value("general.avgRebounds"),
      ast: value("offensive.avgAssists"),
      stl: value("defensive.avgSteals"),
      blk: value("defensive.avgBlocks"),
      tov: value("offensive.avgTurnovers"),
      pts: value("offensive.avgPoints"),
    });
  }

  if (statCategory === "eff") {
    const eff = (r: LeaderRow) =>
      (r.pts ?? 0) + (r.reb ?? 0) + (r.ast ?? 0) + (r.stl ?? 0) + (r.blk ?? 0) - (r.tov ?? 0);
    rows.sort((a, b) => eff(b) - eff(a));
  }
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

/* ---------------------------- 球员生涯赛季数据 ---------------------------- */

/**
 * ESPN 球队 id → 标准缩写。id 随队史迁徙延续（如 17 含新泽西网时期、25 含超音速时期），
 * 因此历史赛季的球队一律显示为现今对应球队的缩写。
 */
const ESPN_TEAM_ABBR: Record<string, string> = {
  "1": "ATL", "2": "BOS", "3": "NOP", "4": "CHI", "5": "CLE",
  "6": "DAL", "7": "DEN", "8": "DET", "9": "GSW", "10": "HOU",
  "11": "IND", "12": "LAC", "13": "LAL", "14": "MIA", "15": "MIL",
  "16": "MIN", "17": "BKN", "18": "NYK", "19": "ORL", "20": "PHI",
  "21": "PHX", "22": "POR", "23": "SAC", "24": "SAS", "25": "OKC",
  "26": "UTA", "27": "WAS", "28": "TOR", "29": "MEM", "30": "CHA",
};

type AthleteSeasonLogEntry = { year: number; hasPlayoffs: boolean; teamAbbr: string | null };

/**
 * 球员生涯赛季清单：哪些赛季有数据、该季是否打了季后赛、当季所属球队。
 * statisticslog 每赛季一条；其 "total" 统计引用指向该季最高赛事级别
 * （types/3 = 该季有季后赛，types/2 = 仅常规赛），球队引用 URL 末段即球队 id。
 */
export async function fetchAthleteSeasonLog(espnId: string): Promise<AthleteSeasonLogEntry[]> {
  const url =
    `${ESPN_CORE}/v2/sports/basketball/leagues/nba/athletes/${espnId}/statisticslog` +
    `?lang=en&region=us&limit=100`;
  const data = await getJson<{ entries?: Json[] }>(url);
  const out: AthleteSeasonLogEntry[] = [];
  for (const entry of data.entries ?? []) {
    const seasonRef = str((entry.season as Json | undefined)?.$ref) ?? "";
    const year = Number(seasonRef.match(/\/seasons\/(\d+)/)?.[1]);
    if (!Number.isFinite(year)) continue;
    const stats = (entry.statistics as Json[] | undefined) ?? [];
    const total = stats.find((s) => s.type === "total") as Json | undefined;
    const totalRef = str((total?.statistics as Json | undefined)?.$ref) ?? "";
    const team = stats.find((s) => s.type === "team") as Json | undefined;
    const teamRef = str((team?.team as Json | undefined)?.$ref) ?? "";
    const teamId = teamRef.match(/\/teams\/(\d+)/)?.[1] ?? "";
    out.push({
      year,
      hasPlayoffs: totalRef.includes("/types/3/"),
      teamAbbr: ESPN_TEAM_ABBR[teamId] ?? null,
    });
  }
  return out;
}

type SeasonAverages = Omit<
  PlayerSeasonStat,
  "seasonLabel" | "seasonYear" | "seasonType" | "teamAbbr" | "source"
>;

/** 球员单季场均数据（type 2=常规赛 / 3=季后赛）；该季未参赛时上游返回 404，归一化为 null */
async function fetchAthleteSeasonAverages(
  espnId: string,
  year: number,
  seasonType: 2 | 3,
): Promise<SeasonAverages | null> {
  const url =
    `${ESPN_CORE}/v2/sports/basketball/leagues/nba/seasons/${year}` +
    `/types/${seasonType}/athletes/${espnId}/statistics/0?lang=en&region=us`;
  let data: { splits?: { categories?: { name?: string; stats?: { name?: string; value?: number }[] }[] } };
  try {
    data = await getJson(url);
  } catch {
    return null; // 404 = 该季该阶段未参赛
  }
  const map = new Map<string, number>();
  for (const cat of data.splits?.categories ?? []) {
    for (const s of cat.stats ?? []) {
      if (s.name && typeof s.value === "number" && Number.isFinite(s.value) && !map.has(s.name)) {
        map.set(s.name, s.value);
      }
    }
  }
  if (!map.has("gamesPlayed")) return null;
  const num = (key: string): number | null => map.get(key) ?? null;
  const pct = (key: string): number | null => {
    const v = map.get(key);
    return v === undefined ? null : v / 100; // 上游为百分制，统一为 0-1 小数
  };
  return {
    gp: num("gamesPlayed"),
    min: num("avgMinutes"),
    pts: num("avgPoints"),
    reb: num("avgRebounds"),
    ast: num("avgAssists"),
    stl: num("avgSteals"),
    blk: num("avgBlocks"),
    tov: num("avgTurnovers"),
    fgp: pct("fieldGoalPct"),
    tpp: pct("threePointPct"),
    ftp: pct("freeThrowPct"),
  };
}

async function mapLimitLocal<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const settled = await Promise.allSettled(chunk.map(fn));
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
    }
  }
  return results;
}

/**
 * 球员生涯分赛季数据（常规赛 + 季后赛），全程 ESPN core API：
 * CORS 开放、按球员 id 精确查询，不受 stats.nba.com 的「达标球员」过滤影响
 * （因此新秀季、伤病缩水季也不会缺）。Pages 纯前端版可直接使用。
 */
export async function fetchEspnPlayerSeasonHistory(
  espnId: string,
  fromYear: number,
  toYear: number,
): Promise<PlayerSeasonStat[]> {
  const start = Math.max(1979, fromYear);
  const end = Math.min(toYear, currentNbaSeasonYear());
  // statisticslog 的年份同样是「赛季结束年份」，减 1 后才是应用内的赛季起始年
  const log = (await fetchAthleteSeasonLog(espnId)).filter(
    (entry) => entry.year - 1 >= start && entry.year - 1 <= end,
  );

  const rows = await mapLimitLocal(log, 6, async (entry): Promise<PlayerSeasonStat[]> => {
    const seasonYear = entry.year - 1;
    const tasks: Promise<PlayerSeasonStat | null>[] = [
      fetchAthleteSeasonAverages(espnId, entry.year, 2).then((avg) =>
        avg
          ? {
              ...avg,
              seasonLabel: seasonLabel(seasonYear),
              seasonYear,
              seasonType: "regular",
              teamAbbr: entry.teamAbbr,
              source: "live" as const,
            }
          : null,
      ),
    ];
    if (entry.hasPlayoffs) {
      tasks.push(
        fetchAthleteSeasonAverages(espnId, entry.year, 3).then((avg) =>
          avg
            ? {
                ...avg,
                seasonLabel: seasonLabel(seasonYear),
                seasonYear,
                seasonType: "playoffs",
                teamAbbr: entry.teamAbbr,
                source: "live" as const,
              }
            : null,
        ),
      );
    }
    const settled = await Promise.all(tasks);
    return settled.filter((r): r is PlayerSeasonStat => r !== null);
  });

  return rows
    .flat()
    .sort((a, b) => b.seasonYear - a.seasonYear || (a.seasonType === "regular" ? -1 : 1));
}

/** ESPN 赛季标签：2026 年秋开始的赛季记作 2026-27 */
export function currentNbaSeasonYear(now = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 8 ? year : year - 1;
}

export function seasonLabel(year: number): string {
  const next = String((year + 1) % 100).padStart(2, "0");
  return `${year}-${next}`;
}
