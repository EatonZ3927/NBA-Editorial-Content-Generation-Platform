import type {
  GameLeader,
  GameSummary,
  GameTeam,
  NewsItem,
  PlayerGameLogEntry,
  PlayerProfile,
  StatSplit,
} from "./types";

const ESPN_SITE = "https://site.web.api.espn.com";
const ESPN_CORE = "https://sports.core.api.espn.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type Json = Record<string, unknown>;

async function getJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
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
    series: series ? str(series.summary) : null,
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
