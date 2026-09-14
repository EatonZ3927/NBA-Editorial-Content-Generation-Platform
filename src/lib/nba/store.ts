/**
 * 浏览器端数据层（GitHub Pages 纯前端版）。
 *
 * 所有 NBA 数据直接从 ESPN 公开接口抓取（已验证 CORS 全部开放），
 * 缓存落在当前浏览器的 localStorage，无需任何后端 / 数据库：
 * - 比分：按日期缓存；历史日期长缓存（结果不变），当天/进行中短缓存
 * - 新闻：12 小时自动刷新（北京时间 00:00 / 12:00 边界槽位）、10 天有效期、
 *   完全重复筛查（标题+描述归一化）；手动刷新只更新当前页面预览，不写本地库
 * - 数据榜 / 球员档案与生涯数据：30 分钟缓存
 * - 草稿箱：localStorage 持久化（每个浏览器各自一份）
 */

import {
  currentNbaSeasonYear,
  fetchAthlete,
  fetchAthleteOverview,
  fetchEspnLeaders,
  fetchEspnPlayerSeasonHistory,
  fetchNews,
  fetchScoreboard,
  fetchScoreboardRange,
  searchAthletes,
  seasonLabel,
} from "./espn";
import { PLAYER_ZH as playerZhMap, STAR_PICKS, playerZh, teamZh } from "./teams";
import type {
  DataSource,
  GameSummary,
  LeaderRow,
  NewsItem,
  NewsResult,
  PlayerProfile,
  PlayerSeasonStat,
  ScoreboardResult,
  StatSplit,
} from "./types";

/* ------------------------------ 本地缓存基建 ------------------------------ */

type CacheBox<T> = { at: number; value: T };

function cacheGet<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const box = JSON.parse(raw) as CacheBox<T>;
    if (typeof box.at !== "number") return null;
    if (Date.now() - box.at > ttlMs) return null;
    return box.value;
  } catch {
    return null;
  }
}

/** 不看 TTL 直接读（用于离线兜底） */
function cacheGetStale<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as CacheBox<T>).value;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), value } satisfies CacheBox<T>));
  } catch {
    // 存储满 / 隐私模式下静默失败，不影响展示
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/* ------------------------------ 比分 ------------------------------ */

const GAMES_TTL_LIVE_MS = 3 * 60 * 1000; // 当天/未来：3 分钟
const GAMES_TTL_PAST_MS = 7 * 24 * 3600 * 1000; // 历史日期：7 天（结果不会再变）

export async function getScoreboard(date: string): Promise<ScoreboardResult> {
  const today = new Date().toISOString().slice(0, 10);
  const ttl = date < today ? GAMES_TTL_PAST_MS : GAMES_TTL_LIVE_MS;
  const key = `nba:games:${date}`;

  const fresh = cacheGet<GameSummary[]>(key, ttl);
  if (fresh && fresh.length > 0) {
    return { date, source: "cache", games: fresh, fetchedAt: nowIso() };
  }
  try {
    const games = await fetchScoreboard(date);
    if (games.length > 0) {
      cacheSet(key, games);
      return { date, source: "live", games, fetchedAt: nowIso() };
    }
  } catch {
    // 落入下方缓存兜底
  }
  const stale = cacheGetStale<GameSummary[]>(key) ?? [];
  return { date, source: stale.length ? "cache" : "offline", games: stale, fetchedAt: nowIso() };
}

/**
 * 最近一个有比赛的日期：先看今天，没有则一次性拉取过去 160 天的区间数据，
 * 取最新比赛日（自动跨过休赛期/空档日）。
 */
export async function getRecentBoard(): Promise<ScoreboardResult> {
  const today = new Date().toISOString().slice(0, 10);
  const todayBoard = await getScoreboard(today);
  if (todayBoard.games.length > 0) return todayBoard;

  const pointerKey = "nba:games:latest-date";
  const pointer = cacheGet<string>(pointerKey, 3600 * 1000);
  if (pointer && pointer !== today) return getScoreboard(pointer);

  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 160);
  try {
    const range = await fetchScoreboardRange(from.toISOString().slice(0, 10), today);
    if (range.length > 0) {
      const latestDate = range.reduce((max, g) => (g.gameDate > max ? g.gameDate : max), range[0].gameDate);
      const latest = range.filter((g) => g.gameDate === latestDate);
      cacheSet(`nba:games:${latestDate}`, latest);
      cacheSet(pointerKey, latestDate);
      return { date: latestDate, source: "live", games: latest, fetchedAt: nowIso() };
    }
  } catch {
    // 落入下方兜底
  }
  const stalePointer = cacheGetStale<string>(pointerKey);
  if (stalePointer && stalePointer !== today) return getScoreboard(stalePointer);
  return todayBoard;
}

/* ------------------------------ 新闻 ------------------------------ */

const NEWS_AUTO_REFRESH_MS = 12 * 3600 * 1000;
const GMT8_OFFSET_MS = 8 * 3600 * 1000;
const NEWS_MAX_AGE_DAYS = 10;
const NEWS_ITEMS_KEY = "nba:news:items";
const NEWS_SLOT_KEY = "nba:news:slot";

/** 当前所处的 12 小时槽位（按北京时间对齐，边界 00:00 / 12:00） */
function newsRefreshSlot(now = Date.now()): number {
  return Math.floor((now + GMT8_OFFSET_MS) / NEWS_AUTO_REFRESH_MS);
}

/** 下一次自动刷新的时间点（ISO 字符串，供页面展示） */
function nextAutoRefreshAt(now = Date.now()): string {
  const nextUtcMs = (newsRefreshSlot(now) + 1) * NEWS_AUTO_REFRESH_MS - GMT8_OFFSET_MS;
  return new Date(nextUtcMs).toISOString();
}

function isFreshNews(item: NewsItem, now = Date.now()): boolean {
  if (!item.publishedAt) return false;
  const ts = new Date(item.publishedAt).getTime();
  if (Number.isNaN(ts)) return false;
  const dayMs = 24 * 3600 * 1000;
  return ts <= now + dayMs && ts >= now - NEWS_MAX_AGE_DAYS * dayMs;
}

/** 文本归一化：去首尾空白、压缩连续空白、转小写，用于「完全一致」判定 */
function normalizeNewsText(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 完全重复判定键：标题 + 描述归一化后完全一致，才算同一条内容。
 * 近似标题、或标题相同但描述有更新（以前内容基础上的更新）不算重复，可同时保留。
 */
function newsContentKey(item: Pick<NewsItem, "headline" | "description">): string {
  return `${normalizeNewsText(item.headline)}|${normalizeNewsText(item.description)}`;
}

function sortNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function readStoredNews(): NewsItem[] {
  const items = cacheGetStale<NewsItem[]>(NEWS_ITEMS_KEY) ?? [];
  return items.filter((item) => isFreshNews(item));
}

/** 抓取实时新闻（直连 ESPN），去重 + 过滤出 10 天有效期内的新鲜内容 */
async function fetchLiveNews(limit: number): Promise<{ items: NewsItem[]; ok: boolean }> {
  try {
    const live = await fetchNews(limit);
    const seen = new Set<string>();
    const items = live.filter((item) => {
      if (!item.headline) return false;
      const key = newsContentKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return isFreshNews(item);
    });
    return { items, ok: true };
  } catch {
    return { items: [], ok: false };
  }
}

/** 合并入库：新抓取的优先（时间节点以最新抓取为准），内容完全一致的只保留一份 */
function mergeNews(live: NewsItem[], stored: NewsItem[]): NewsItem[] {
  const seen = new Set(live.map((item) => newsContentKey(item)));
  return sortNews([...live, ...stored.filter((item) => !seen.has(newsContentKey(item)))]);
}

let newsInflight: Promise<void> | null = null;

/**
 * 新闻获取（新闻中心打开/刷新、文案工作台加载、AI 生成文案时调用）：
 * 1) 每 12 小时（北京时间 00:00 / 12:00 边界起）的第一次打开实时抓取并写入本浏览器的本地库；
 * 2) 其余时间直接使用库中已累积的 10 天有效期内的新闻；
 * 3) 超过 10 天的旧闻自动移除。
 */
export async function getNews(limit = 30): Promise<NewsResult> {
  let fetched = false;
  let live: NewsItem[] = [];

  const savedSlotRaw = cacheGetStale<number>(NEWS_SLOT_KEY);
  const slotStale = savedSlotRaw === null || savedSlotRaw < newsRefreshSlot();
  if (slotStale) {
    if (!newsInflight) {
      newsInflight = (async () => {
        const result = await fetchLiveNews(60);
        if (result.ok) {
          const merged = mergeNews(result.items, readStoredNews());
          cacheSet(NEWS_ITEMS_KEY, merged);
          cacheSet(NEWS_SLOT_KEY, newsRefreshSlot());
        }
      })();
      newsInflight.finally(() => { newsInflight = null; }).catch(() => {});
    }
    await newsInflight;
    fetched = true;
    live = readStoredNews(); // 已包含本轮抓取结果
  } else {
    live = readStoredNews();
  }

  const items = sortNews(live).slice(0, limit);
  const source: DataSource = fetched && items.length > 0 ? "live" : items.length > 0 ? "cache" : "offline";
  return { source, items, fetchedAt: nowIso(), nextAutoRefreshAt: nextAutoRefreshAt() };
}

/**
 * 手动刷新（新闻中心「刷新」按钮）：实时抓取并与本地库合并后返回给当前页面，
 * 但不写入本地库——属于本次页面预览行为。
 */
export async function refreshNewsForUser(limit = 40): Promise<NewsResult> {
  const live = await fetchLiveNews(limit);
  const stored = readStoredNews();
  const items = mergeNews(live.items, stored).slice(0, limit);
  const source: DataSource = live.ok && live.items.length > 0 ? "live" : items.length > 0 ? "cache" : "offline";
  return { source, items, fetchedAt: nowIso(), nextAutoRefreshAt: nextAutoRefreshAt(), manual: true };
}

/* ------------------------------ 联盟数据榜 ------------------------------ */

const LEADERS_TTL_MS = 30 * 60 * 1000;

export async function getLeagueLeaders(
  seasonYear: number,
  statCategory = "pts",
): Promise<{ source: DataSource; season: number; stat: string; rows: LeaderRow[] }> {
  const key = `nba:leaders:${seasonYear}:${statCategory}`;
  const cached = cacheGet<LeaderRow[]>(key, LEADERS_TTL_MS);
  if (cached) return { source: "cache", season: seasonYear, stat: statCategory, rows: cached };

  try {
    let rows = await fetchEspnLeaders({ seasonYear, statCategory });
    let usedSeason = seasonYear;
    // 新赛季尚未开打时，自动回退到上一个已完赛赛季
    if (rows.length === 0) {
      rows = await fetchEspnLeaders({ seasonYear: seasonYear - 1, statCategory });
      usedSeason = seasonYear - 1;
    }
    const top = rows.slice(0, 20);
    cacheSet(key, top);
    cacheSet(`nba:leaders:${usedSeason}:${statCategory}`, top);
    return { source: "live", season: usedSeason, stat: statCategory, rows: top };
  } catch {
    const stale = cacheGetStale<LeaderRow[]>(key);
    if (stale) return { source: "cache", season: seasonYear, stat: statCategory, rows: stale };
    return { source: "offline", season: seasonYear, stat: statCategory, rows: [] };
  }
}

/* ------------------------------ 球员检索 ------------------------------ */

export type PlayerSearchHit = {
  espnId: string;
  name: string;
  zhName: string | null;
  team: string;
  headshot: string | null;
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
  // 空查询：返回常用球星快捷列表
  if (!q) {
    return STAR_PICKS.map((p) => ({ espnId: p.espnId, name: p.name, zhName: null, team: p.team, headshot: null }));
  }
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
  }));
}

/* ------------------------------ 球员档案 ------------------------------ */

const PROFILE_TTL_MS = 30 * 60 * 1000;

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

/** overview 接口的命中率是百分制（46.8），统一压成 0-1 小数 */
function normalizeSplitPct(s: StatSplit): StatSplit {
  const fix = (v: number | null) => (v !== null && v > 1.5 ? v / 100 : v);
  return { ...s, fgp: fix(s.fgp), tpp: fix(s.tpp), ftp: fix(s.ftp) };
}

export async function getPlayerProfile(espnId: string): Promise<PlayerProfile> {
  const cacheKey = `nba:player:${espnId}`;
  const cached = cacheGet<PlayerProfile>(cacheKey, PROFILE_TTL_MS);
  if (cached) return cached;
  const stale = cacheGetStale<PlayerProfile>(cacheKey);

  try {
    const [athlete, overview] = await Promise.all([
      fetchAthlete(espnId),
      fetchAthleteOverview(espnId).catch(() => null),
    ]);
    const fullName = athlete.fullName ?? stale?.fullName ?? "";
    const from = athlete.debutYear ?? new Date().getUTCFullYear() - 6;
    const seasons = await fetchEspnPlayerSeasonHistory(espnId, from, currentNbaSeasonYear()).catch(
      () => stale?.seasons ?? [],
    );

    const latestRegular = seasons.find((s) => s.seasonType === "regular");
    const teamAbbr = latestRegular?.teamAbbr ?? stale?.teamAbbr ?? null;

    const overviewRegular = overview?.seasonSplits.find((s) => s.label === "Regular Season" && (s.gp ?? 0) > 0) ?? null;
    const currentSeason: StatSplit | null = overviewRegular
      ? normalizeSplitPct(overviewRegular)
      : latestRegular
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
        : null;
    const regularSeasons = seasons.filter((s) => s.seasonType === "regular");
    const playoffSeasons = seasons.filter((s) => s.seasonType === "playoffs");

    const profile: PlayerProfile = {
      espnId,
      fullName,
      shortName: athlete.shortName ?? null,
      zhName: playerZh(fullName),
      teamAbbr,
      teamName: stale?.teamName ?? null,
      teamZh: teamZh(teamAbbr) || null,
      position: athlete.position ?? null,
      headshot: athlete.headshot ?? `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`,
      height: athlete.height ?? null,
      weight: athlete.weight ?? null,
      age: athlete.age ?? null,
      debutYear: athlete.debutYear ?? null,
      draftText: athlete.draftText ?? null,
      college: athlete.college ?? null,
      experience: athlete.experience ?? null,
      active: athlete.active ?? true,
      currentSeason,
      careerRegular: regularSeasons.length ? aggregate(regularSeasons) : null,
      careerPlayoffs: playoffSeasons.length ? aggregate(playoffSeasons) : null,
      seasons,
      recentGames: overview?.recentGames ?? [],
      awards: overview?.awards ?? [],
      note: overview?.note ?? null,
      source: "live",
      fetchedAt: nowIso(),
    };
    if (fullName) cacheSet(cacheKey, profile);
    return profile;
  } catch {
    if (stale) return { ...stale, source: "cache" };
    return {
      espnId,
      fullName: "",
      shortName: null,
      zhName: null,
      teamAbbr: null,
      teamName: null,
      teamZh: null,
      position: null,
      headshot: null,
      height: null,
      weight: null,
      age: null,
      debutYear: null,
      draftText: null,
      college: null,
      experience: null,
      active: true,
      currentSeason: null,
      careerRegular: null,
      careerPlayoffs: null,
      seasons: [],
      recentGames: [],
      awards: [],
      note: null,
      source: "offline",
      fetchedAt: nowIso(),
    };
  }
}

/* ------------------------------ 草稿箱 ------------------------------ */

export type DraftRecord = {
  id: number;
  title: string;
  body: string;
  templateName: string | null;
  tone: string | null;
  length: string | null;
  tags: string[] | null;
  wordCount: number;
  sourceSummary: string | null;
  createdAt: string;
};

const DRAFTS_KEY = "nba:drafts";

export function listDrafts(): DraftRecord[] {
  const items = cacheGetStale<DraftRecord[]>(DRAFTS_KEY) ?? [];
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveDraft(
  input: Omit<DraftRecord, "id" | "createdAt" | "wordCount">,
): DraftRecord {
  const items = listDrafts();
  const draft: DraftRecord = {
    ...input,
    id: Date.now() + Math.floor(Math.random() * 1000),
    wordCount: input.body.length,
    createdAt: nowIso(),
  };
  cacheSet(DRAFTS_KEY, [draft, ...items].slice(0, 200));
  return draft;
}

export function deleteDraft(id: number): void {
  cacheSet(DRAFTS_KEY, listDrafts().filter((item) => item.id !== id));
}

export { currentNbaSeasonYear, seasonLabel };
