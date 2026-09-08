import type { LeaderRow, PlayerSeasonStat } from "./types";

const BASE = "https://stats.nba.com/stats/leagueLeaders";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

export const STAT_CATEGORIES = {
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  stl: "STL",
  blk: "BLK",
  fg3m: "FG3M",
  fgp: "FG_PCT",
  min: "MIN",
  eff: "EFF",
} as const;

export type StatCategoryKey = keyof typeof STAT_CATEGORIES;

type LeaderResponse = {
  resultSet?: { headers?: string[]; rowSet?: (string | number)[][] };
};

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchLeagueLeaders(options: {
  seasonYear: number;
  statCategory?: StatCategoryKey;
  perMode?: "PerGame" | "Totals";
  seasonType?: "Regular Season" | "Playoffs";
}): Promise<LeaderRow[]> {
  const {
    seasonYear,
    statCategory = "pts",
    perMode = "PerGame",
    seasonType = "Regular Season",
  } = options;
  const season = `${seasonYear}-${String((seasonYear + 1) % 100).padStart(2, "0")}`;
  const url =
    `${BASE}?LeagueID=00&PerMode=${encodeURIComponent(perMode)}` +
    `&Scope=S&Season=${encodeURIComponent(season)}` +
    `&SeasonType=${encodeURIComponent(seasonType)}` +
    `&StatCategory=${encodeURIComponent(STAT_CATEGORIES[statCategory])}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`nba stats ${res.status}`);
    const data = (await res.json()) as LeaderResponse;
    const rows = data.resultSet?.rowSet ?? [];
    return rows.map((row) => ({
      rank: toNum(row[1]) ?? 0,
      espnId: String(row[0]),
      playerName: String(row[2]),
      teamAbbr: row[4] ? String(row[4]) : null,
      gp: toNum(row[5]),
      min: toNum(row[6]),
      fgp: toNum(row[9]),
      tpp: toNum(row[12]),
      ftp: toNum(row[15]),
      reb: toNum(row[18]),
      ast: toNum(row[19]),
      stl: toNum(row[20]),
      blk: toNum(row[21]),
      tov: toNum(row[22]),
      pts: toNum(row[24]),
    }));
  } finally {
    clearTimeout(timer);
  }
}

/** 在某个赛季的联盟数据表中查找指定球员 */
function findPlayer(rows: LeaderRow[], fullName: string): LeaderRow | null {
  const target = normalizeName(fullName);
  if (!target) return null;
  return rows.find((row) => normalizeName(row.playerName) === target) ?? null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

function rowToSeasonStat(
  row: LeaderRow,
  seasonYear: number,
  seasonType: "regular" | "playoffs",
  perMode: "PerGame" | "Totals",
): PlayerSeasonStat {
  const label = `${seasonYear}-${String((seasonYear + 1) % 100).padStart(2, "0")}`;
  return {
    seasonLabel: label,
    seasonYear,
    seasonType,
    teamAbbr: row.teamAbbr,
    gp: row.gp,
    min: perMode === "PerGame" ? row.min : row.gp ? Math.round((row.min ?? 0) / row.gp) : null,
    pts: row.pts,
    reb: row.reb,
    ast: row.ast,
    stl: row.stl,
    blk: row.blk,
    tov: row.tov,
    fgp: row.fgp,
    tpp: row.tpp,
    ftp: row.ftp,
    source: "live",
  };
}

/** 拉取一名球员从 debutYear 到最新赛季的分赛季数据（常规赛+季后赛） */
export async function fetchPlayerSeasonHistory(
  fullName: string,
  fromYear: number,
  toYear: number,
): Promise<PlayerSeasonStat[]> {
  const start = Math.max(1979, fromYear);
  const end = Math.min(toYear, new Date().getUTCFullYear());
  const years: number[] = [];
  for (let y = end; y >= start; y -= 1) years.push(y);

  const out: PlayerSeasonStat[] = [];
  await mapLimit(years, 6, async (year) => {
    const [reg, post] = await Promise.allSettled([
      fetchLeagueLeaders({ seasonYear: year, statCategory: "pts", perMode: "PerGame" }),
      fetchLeagueLeaders({
        seasonYear: year,
        statCategory: "pts",
        perMode: "PerGame",
        seasonType: "Playoffs",
      }),
    ]);
    if (reg.status === "fulfilled") {
      const hit = findPlayer(reg.value, fullName);
      if (hit) out.push(rowToSeasonStat(hit, year, "regular", "PerGame"));
    }
    if (post.status === "fulfilled") {
      const hit = findPlayer(post.value, fullName);
      if (hit) out.push(rowToSeasonStat(hit, year, "playoffs", "PerGame"));
    }
  });
  out.sort((a, b) => b.seasonYear - a.seasonYear || (a.seasonType === "regular" ? -1 : 1));
  return out;
}
