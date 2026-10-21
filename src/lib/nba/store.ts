/**
 * 浏览器端数据层（GitHub Pages 纯前端版）。
 *
 * 所有 NBA 数据直接从 ESPN 公开接口抓取（已验证 CORS 全部开放），
 * 缓存落在当前浏览器的 localStorage，无需任何后端 / 数据库：
 * - 比分：按北京时间日期缓存；按比赛状态分级，近期完赛与不完整统计保持短缓存
 * - 新闻：12 小时自动刷新（北京时间 00:00 / 12:00 边界槽位）、10 天有效期、
 *   完全重复筛查（标题+描述归一化）；手动刷新只更新当前页面预览，不写本地库
 * - 数据榜：30 分钟缓存；球员当季：5 分钟；历史赛季：24 小时，按赛季自动滚动
 * - 草稿箱：localStorage 持久化（每个浏览器各自一份）
 */

import {
  currentNbaSeasonYear,
  fetchAthlete,
  fetchAthleteOverview,
  fetchAthleteCurrentSeason,
  fetchAthleteSeasonGameLog,
  fetchEspnLeaders,
  fetchEspnPlayerSeasonHistory,
  fetchGameSummary,
  fetchNews,
  fetchScoreboard,
  fetchRecentScheduleDates,
  searchAthletes,
  seasonLabel,
} from "./espn";
import { normalizeDate, shiftDate, todayIso } from "./dates";
import { gameDetailTtl, isGameDetailIncomplete, scoreboardTtl } from "./freshness";
import { PLAYER_ZH as playerZhMap, STAR_PICKS, playerZh, teamZh } from "./teams";
import type {
  DataSource,
  GameDetail,
  GameDetailResult,
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

export type RefreshOptions = { force?: boolean };

function readCacheBox<T>(key: string): CacheBox<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const box = JSON.parse(raw) as CacheBox<T>;
    return Number.isFinite(box.at) && box.at <= Date.now() && box.value != null ? box : null;
  } catch { return null; }
}

const scoreboardInflight = new Map<string, Promise<ScoreboardResult>>();

export async function getScoreboard(input: string, options: RefreshOptions = {}): Promise<ScoreboardResult> {
  const date = normalizeDate(input);
  // 新版本只读北京时间缓存，旧日期口径的缓存自然失效，不影响草稿等数据。
  const key = `nba:games:v2:beijing:${date}`;
  const cached = readCacheBox<GameSummary[]>(key);
  if (!options.force && cached && Date.now() - cached.at < scoreboardTtl(cached.value, date)) {
    return { date, source: "cache", games: cached.value, fetchedAt: new Date(cached.at).toISOString() };
  }
  const pending = scoreboardInflight.get(date);
  if (pending) return pending;
  const request = (async (): Promise<ScoreboardResult> => {
    try {
      const games = await fetchScoreboard(date);
      cacheSet(key, games); // 成功的空结果同样是有效数据。
      return { date, source: "live", games, fetchedAt: nowIso() };
    } catch {
      return {
        date, source: cached ? "cache" : "offline", games: cached?.value ?? [],
        fetchedAt: cached ? new Date(cached.at).toISOString() : null,
        stale: Boolean(cached), error: "比分数据获取失败，请稍后重试。",
      };
    }
  })();
  scoreboardInflight.set(date, request);
  request.finally(() => scoreboardInflight.delete(date)).catch(() => {});
  return request;
}

/** 先逐日回查最近三天，再利用赛程日历定位；不使用不受支持的区间查询。 */
export async function getRecentBoard(options: RefreshOptions = {}): Promise<ScoreboardResult> {
  const today = todayIso();
  const todayBoard = await getScoreboard(today, options);
  if (todayBoard.games.length || todayBoard.error) return todayBoard;
  const checked = new Set([today]);
  const tryDay = async (date: string) => {
    checked.add(date);
    const result = await getScoreboard(date, options);
    return result.games.length || result.error ? result : null;
  };
  for (let offset = 1; offset <= 3; offset++) {
    const result = await tryDay(shiftDate(today, -offset));
    if (result) return result;
  }
  try {
    const candidates = (await fetchRecentScheduleDates(today)).filter((date) => !checked.has(date)).slice(0, 4);
    for (const date of candidates) {
      const result = await tryDay(date);
      if (result) return result;
    }
  } catch {
    return { ...todayBoard, error: "当日无比赛，但最近赛程查询失败，请重试或手动选择日期。" };
  }
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

/**
 * 同一 ESPN 稿件的更新版本会共用同一个 id（按需求：内容有更新的版本要同时保留）。
 * 给第 2、3… 个重复 id 追加 ~2、~3 后缀，保证列表渲染 key 与选中逻辑唯一。
 */
function ensureUniqueNewsIds(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const n = (seen.get(item.id) ?? 0) + 1;
    seen.set(item.id, n);
    return n === 1 ? item : { ...item, id: `${item.id}~${n}` };
  });
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

  const items = ensureUniqueNewsIds(sortNews(live)).slice(0, limit);
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
  const items = ensureUniqueNewsIds(mergeNews(live.items, stored)).slice(0, limit);
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

const PROFILE_TTL_MS = 5 * 60 * 1000;
const PROFILE_HISTORY_TTL_MS = 24 * 3600 * 1000;
const profileInflight = new Map<string, Promise<PlayerProfile>>();

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

/** 赛季键每年自动滚动；当季短缓存，历史赛季独立长缓存。 */
export async function getPlayerProfile(espnId: string, options: RefreshOptions = {}): Promise<PlayerProfile> {
  const year = currentNbaSeasonYear();
  const cacheKey = `nba:player:v2:${year}:${espnId}`;
  const box = readCacheBox<PlayerProfile>(cacheKey);
  const stale = box?.value ?? null;
  const ttl = stale?.active === false ? 30 * 60000 : stale?.currentSeasonStatus === "pending" ? 60000 : PROFILE_TTL_MS;
  const cached = !options.force && box && Date.now() - box.at < ttl ? box.value : null;
  if (cached) return { ...cached, source: "cache" };
  const pending = profileInflight.get(cacheKey);
  if (pending) return pending;
  const request = loadPlayerProfile(espnId, year, cacheKey, stale, options);
  profileInflight.set(cacheKey, request);
  request.finally(() => profileInflight.delete(cacheKey)).catch(() => {});
  return request;
}

async function loadPlayerProfile(
  espnId: string, year: number, cacheKey: string, stale: PlayerProfile | null, options: RefreshOptions,
): Promise<PlayerProfile> {
  try {
    const [athlete, overview, officialResult, logResult, playoffResult] = await Promise.all([
      fetchAthlete(espnId),
      fetchAthleteOverview(espnId, year).catch(() => null),
      fetchAthleteCurrentSeason(espnId, year).then(
        (value) => ({ value, failed: false }), () => ({ value: null, failed: true }),
      ),
      fetchAthleteSeasonGameLog(espnId, year).then(
        (value) => ({ value, failed: false }), () => ({ value: null, failed: true }),
      ),
      fetchAthleteCurrentSeason(espnId, year, 3).then(
        (value) => ({ value, failed: false }), () => ({ value: null, failed: true }),
      ),
    ]);
    const fullName = athlete.fullName ?? stale?.fullName ?? "";
    const historyKey = `nba:player-history:v2:${year}:${espnId}`;
    let history = options.force ? null : cacheGet<PlayerSeasonStat[]>(historyKey, PROFILE_HISTORY_TTL_MS);
    let historyFailed = false;
    if (!history) {
      try {
        history = await fetchEspnPlayerSeasonHistory(espnId, athlete.debutYear ?? 1979, year - 1);
        cacheSet(historyKey, history);
      } catch {
        historyFailed = true;
        history = cacheGetStale<PlayerSeasonStat[]>(historyKey) ?? stale?.seasons.filter((row) => row.seasonYear < year) ?? [];
      }
    }
    const official = officialResult.value;
    const fromLog = logResult.value?.season ?? null;
    // 汇总已发布但场次落后时继续使用更完整的逐场记录；相同场次优先官方汇总。
    let current = official && (!fromLog || (official.gp ?? 0) >= (fromLog.gp ?? 0)) ? official : fromLog;
    const playoffLog = logResult.value?.playoffs ?? null;
    let currentPlayoffs = playoffResult.value && (!playoffLog || (playoffResult.value.gp ?? 0) >= (playoffLog.gp ?? 0)) ? playoffResult.value : playoffLog;
    const errors: string[] = [];
    if (!current && (officialResult.failed || logResult.failed)) errors.push("当季统计获取失败，请稍后重试。");
    if (!current) {
      const saved = stale?.seasons.find((row) => row.seasonYear === year && row.seasonType === "regular");
      if (saved) {
        current = { ...saved, source: "cache" };
        errors.push("上游当季统计暂未更新，保留上次成功抓取的数据。");
      }
    }
    if (historyFailed) errors.push("历史赛季获取不完整，已保留可用缓存。");
    if (!currentPlayoffs) {
      const saved = stale?.seasons.find((row) => row.seasonYear === year && row.seasonType === "playoffs");
      if (saved) {
        currentPlayoffs = { ...saved, source: "cache" };
        errors.push("当季季后赛统计暂未更新，已保留缓存。");
      }
    }
    const teamAbbr = athlete.teamAbbr ?? current?.teamAbbr ?? stale?.teamAbbr ?? history[0]?.teamAbbr ?? null;
    const seasons = [...history, ...[current, currentPlayoffs].filter((row): row is PlayerSeasonStat => row !== null)
      .map((row) => ({ ...row, teamAbbr: row.teamAbbr ?? teamAbbr }))]
      .sort((a, b) => b.seasonYear - a.seasonYear || (a.seasonType === "regular" ? -1 : 1));
    const latestRegular = seasons.find((row) => row.seasonType === "regular");
    const currentSeason: StatSplit | null = latestRegular ? {
      label: latestRegular.seasonLabel, gp: latestRegular.gp, min: latestRegular.min,
      pts: latestRegular.pts, reb: latestRegular.reb, ast: latestRegular.ast, stl: latestRegular.stl,
      blk: latestRegular.blk, fgp: latestRegular.fgp, tpp: latestRegular.tpp, ftp: latestRegular.ftp,
    } : null;
    const regularSeasons = seasons.filter((row) => row.seasonType === "regular");
    const playoffSeasons = seasons.filter((row) => row.seasonType === "playoffs");
    const profile: PlayerProfile = {
      espnId, fullName, shortName: athlete.shortName ?? null, zhName: playerZh(fullName),
      teamAbbr, teamName: stale?.teamName ?? null, teamZh: teamZh(teamAbbr) || null,
      position: athlete.position ?? null,
      headshot: athlete.headshot ?? `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`,
      height: athlete.height ?? null, weight: athlete.weight ?? null, age: athlete.age ?? null,
      debutYear: athlete.debutYear ?? null, draftText: athlete.draftText ?? null, college: athlete.college ?? null,
      experience: athlete.experience ?? null, active: athlete.active ?? true,
      currentSeason, requestedSeasonYear: year, currentSeasonYear: latestRegular?.seasonYear ?? null,
      currentSeasonStatus: current ? current.provenance === "game-log" ? "game-log" : "official" :
        officialResult.failed || logResult.failed ? "error" : "pending",
      careerRegular: regularSeasons.length ? aggregate(regularSeasons) : null,
      careerPlayoffs: playoffSeasons.length ? aggregate(playoffSeasons) : null,
      seasons, recentGames: logResult.value?.recentGames.length ? logResult.value.recentGames : stale?.recentGames ?? [],
      awards: overview?.awards ?? stale?.awards ?? [], note: overview?.note ?? stale?.note ?? null,
      source: "live", fetchedAt: current?.source === "cache" && stale ? stale.fetchedAt : nowIso(),
      ...(errors.length ? { error: errors.join(" ") } : {}),
    };
    // 失败不能刷新成功缓存的时间戳，也不把“暂不可用”长期缓存。
    if (fullName && !profile.error) cacheSet(cacheKey, profile);
    return profile;
  } catch {
    if (stale) return { ...stale, source: "cache", error: "球员数据更新失败，当前展示上次成功获取的缓存。" };
    return {
      espnId, fullName: "", shortName: null, zhName: null, teamAbbr: null, teamName: null,
      teamZh: null, position: null, headshot: null, height: null, weight: null, age: null,
      debutYear: null, draftText: null, college: null, experience: null, active: true,
      currentSeason: null, requestedSeasonYear: year, currentSeasonYear: null, currentSeasonStatus: "error",
      careerRegular: null, careerPlayoffs: null, seasons: [], recentGames: [], awards: [], note: null,
      source: "offline", fetchedAt: nowIso(), error: "球员数据暂时无法获取，请稍后重试。",
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

/* ------------------------------ 比赛详情 ------------------------------ */

/**
 * 单场详情（逐节比分 / boxscore / 球队数据对比）。
 * 按比赛状态分级缓存；网络失败时回退到过期缓存，再没有则离线。
 */
const detailInflight = new Map<string, Promise<GameDetailResult>>();

export async function getGameDetail(gameId: string, options: RefreshOptions = {}): Promise<GameDetailResult> {
  const key = `nba:game-detail:v4:beijing:${gameId}`;
  const cached = readCacheBox<GameDetail>(key);
  if (!options.force && cached && Date.now() - cached.at < gameDetailTtl(cached.value)) {
    return { detail: cached.value, source: "cache", fetchedAt: new Date(cached.at).toISOString(),
      incomplete: isGameDetailIncomplete(cached.value) };
  }
  const pending = detailInflight.get(gameId);
  if (pending) return pending;
  const request = (async (): Promise<GameDetailResult> => {
    try {
      const detail = await fetchGameSummary(gameId);
      cacheSet(key, detail);
      return { detail, source: "live", fetchedAt: nowIso(), incomplete: isGameDetailIncomplete(detail) };
    } catch {
      return { detail: cached?.value ?? null, source: cached ? "cache" : "offline",
        fetchedAt: cached ? new Date(cached.at).toISOString() : null, stale: Boolean(cached),
        error: "暂时无法获取比赛详情，请稍后重试。",
        incomplete: cached ? isGameDetailIncomplete(cached.value) : undefined };
    }
  })();
  detailInflight.set(gameId, request);
  request.finally(() => detailInflight.delete(gameId)).catch(() => {});
  return request;
}
