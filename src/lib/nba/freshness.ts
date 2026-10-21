import { shiftDate, todayIso } from "./dates";
import type { GameDetail, GameDetailResult, GameSummary, ScoreboardResult } from "./types";

export function scoreboardTtl(games: GameSummary[], date: string): number {
  if (games.some((game) => game.statusState === "in")) return 30000;
  if (games.some((game) => !game.completed || game.home.score === null || game.away.score === null)) return 60000;
  if (date >= shiftDate(todayIso(), -1)) return 60000;
  return games.length ? 7 * 24 * 3600000 : 3600000;
}

export function isGameDetailIncomplete(detail: GameDetail): boolean {
  if (detail.statusState === "pre") return false;
  return detail.home.score === null || detail.away.score === null ||
    !detail.quarters.length || !detail.teamStats.length ||
    [detail.home, detail.away].some((team) => !team.players.some(
      (player) => !player.didNotPlay && player.pts !== null && player.minutes !== null,
    ));
}

export function gameDetailTtl(detail: GameDetail): number {
  if (detail.statusState === "in") return 30000;
  if (detail.statusState !== "post" || !detail.completed || isGameDetailIncomplete(detail) ||
      detail.gameDate >= shiftDate(todayIso(), -1)) return 60000;
  return 24 * 3600000;
}

/** 缓存过期和页面定时刷新使用相同间隔，避免轮询反复命中旧缓存。 */
export function scoreboardRefreshMs(result: ScoreboardResult): number | null {
  if (result.error) return 30000;
  if (result.date >= shiftDate(todayIso(), -1) || result.games.some(
    (game) => !game.completed || game.home.score === null || game.away.score === null,
  )) {
    return scoreboardTtl(result.games, result.date);
  }
  return null;
}

export function gameDetailRefreshMs(result: GameDetailResult): number | null {
  if (result.error || !result.detail) return 30000;
  const ttl = gameDetailTtl(result.detail);
  return ttl < 24 * 3600000 ? ttl : null;
}
