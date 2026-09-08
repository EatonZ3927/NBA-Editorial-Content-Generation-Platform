/**
 * nba-data 技能封装（sports-skills CLI）。
 *
 * 本模块把本地安装的 nba-data skill（sports-skills 命令行）封装为应用内的
 * TypeScript 数据访问层：通过子进程调用 CLI，把输出的 JSON 映射为应用统一的
 * GameSummary / NewsItem 类型。CLI 不可用时返回 null，由调用方回退到直连
 * ESPN 的抓取路径，保证页面始终可用。
 *
 * 环境变量 NBA_DATA_CLI 可覆盖 CLI 路径（默认 ~/.local/bin/sports-skills）。
 */
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { GameStatusState, GameSummary, GameTeam, NewsItem } from "./types";

const DEFAULT_CLI = path.join(os.homedir(), ".local", "bin", "sports-skills");
const CLI = process.env.NBA_DATA_CLI?.trim() || DEFAULT_CLI;
const TIMEOUT_MS = 20_000;

/** 短 TTL 进程内缓存，避免同一页面多次 shell 调用 */
const cache = new Map<string, { at: number; value: unknown }>();
const SCOREBOARD_TTL_MS = 60_000;
const NEWS_TTL_MS = 5 * 60_000;

function cached<T>(key: string, ttl: number): T | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  return null;
}

function store(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 300) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

type CliResult<T> = { status: boolean; data: T | null; message?: string };

function runCli<T>(args: string[]): Promise<T | null> {
  return new Promise((resolve) => {
    execFile(
      CLI,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as CliResult<T>;
          if (!parsed.status || parsed.data == null) {
            resolve(null);
            return;
          }
          resolve(parsed.data);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

/* ------------------------------ 比分 ------------------------------ */

type SkillCompetitor = {
  team?: { id?: string; name?: string; abbreviation?: string; logo?: string };
  home_away?: string;
  score?: string | number | null;
  period_scores?: number[];
  record?: string | null;
  winner?: boolean;
};

type SkillEvent = {
  id?: string;
  name?: string;
  short_name?: string;
  status?: string;
  status_detail?: string;
  start_time?: string;
  venue?: { name?: string; city?: string; state?: string } | null;
  competitors?: SkillCompetitor[];
  odds?: unknown;
  broadcasts?: string[];
};

function mapStatus(event: SkillEvent): GameStatusState {
  const raw = `${event.status ?? ""} ${event.status_detail ?? ""}`.toLowerCase();
  if (/(final|closed|post|completed|full time)/.test(raw)) return "post";
  if (/(in progress|live|\bin\b|halftime|quarter|q[1-4]|ot\b)/.test(raw)) return "in";
  return "pre";
}

function mapTeam(competitor: SkillCompetitor | undefined): GameTeam {
  const score =
    competitor?.score == null || competitor.score === ""
      ? null
      : Number.isFinite(Number(competitor.score))
        ? Number(competitor.score)
        : null;
  return {
    abbr: competitor?.team?.abbreviation ?? "???",
    name: competitor?.team?.name ?? "未知球队",
    displayName: competitor?.team?.name ?? "未知球队",
    score,
    record: competitor?.record ?? null,
    winner: Boolean(competitor?.winner),
    logo: competitor?.team?.logo ?? null,
    leaders: [], // skill 的比分接口不带球员数据，leaders 由 ESPN 直连补充（若可用）
  };
}

function mapEvent(event: SkillEvent, date: string): GameSummary | null {
  if (!event.id) return null;
  const home = event.competitors?.find((c) => c.home_away === "home");
  const away = event.competitors?.find((c) => c.home_away === "away");
  if (!home || !away) return null;
  const state = mapStatus(event);
  return {
    id: event.id,
    date: event.start_time ?? `${date}T12:00:00Z`,
    gameDate: date,
    shortName: event.short_name ?? "",
    name: event.name ?? event.short_name ?? "",
    statusState: state,
    statusDetail: event.status_detail ?? "",
    completed: state === "post",
    home: mapTeam(home),
    away: mapTeam(away),
    venue: event.venue?.name
      ? `${event.venue.name}${event.venue.city ? ` · ${event.venue.city}` : ""}`
      : null,
    broadcast: event.broadcasts?.length ? event.broadcasts.join(" / ") : null,
    series: null,
    odds: null,
    link: null,
  };
}

/** 通过 nba-data skill 抓取某日比分；失败（CLI 缺失/超时/无数据）返回 null */
export async function fetchScoreboardViaSkill(date: string): Promise<GameSummary[] | null> {
  const key = `board:${date}`;
  const hit = cached<GameSummary[]>(key, SCOREBOARD_TTL_MS);
  if (hit) return hit;
  const data = await runCli<{ events?: SkillEvent[] }>(["nba", "get_scoreboard", `--date=${date}`]);
  if (!data?.events) return null;
  const games = data.events
    .map((event) => mapEvent(event, date))
    .filter((g): g is GameSummary => Boolean(g));
  store(key, games);
  return games;
}

/* ------------------------------ 新闻 ------------------------------ */

type SkillArticle = {
  headline?: string;
  description?: string | null;
  published?: string | null;
  type?: string;
  link?: string;
  images?: string[];
};

const TYPE_ZH: Record<string, string> = {
  story: "专题",
  headlinenews: "要闻",
  analysis: "分析",
  recap: "战报",
};

function articleId(article: SkillArticle): string | null {
  const fromLink = article.link?.match(/\/id\/(\d+)/)?.[1];
  if (fromLink) return fromLink;
  if (!article.headline) return null;
  let hash = 0;
  for (const ch of article.headline) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `skill-${hash.toString(36)}`;
}

function mapArticle(article: SkillArticle): NewsItem | null {
  if (!article.headline) return null;
  const id = articleId(article);
  if (!id) return null;
  const typeKey = (article.type ?? "").toLowerCase();
  const category = TYPE_ZH[typeKey] ?? (article.type || null);
  return {
    id,
    headline: article.headline,
    description: article.description ?? null,
    url: article.link ?? null,
    imageUrl: article.images?.[0] ?? null,
    publishedAt: article.published ?? null,
    categories: category ? [category, "NBA"] : ["NBA"],
  };
}

/** 通过 nba-data skill 抓取最新新闻；失败返回 null */
export async function fetchNewsViaSkill(): Promise<NewsItem[] | null> {
  const key = "news:latest";
  const hit = cached<NewsItem[]>(key, NEWS_TTL_MS);
  if (hit) return hit;
  const data = await runCli<{ articles?: SkillArticle[] }>(["nba", "get_news"]);
  if (!data?.articles) return null;
  const items = data.articles
    .map(mapArticle)
    .filter((n): n is NewsItem => Boolean(n));
  store(key, items);
  return items;
}
