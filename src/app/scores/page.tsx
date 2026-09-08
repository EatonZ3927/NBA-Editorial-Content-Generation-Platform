import GameCard from "@/components/GameCard";
import DateNavigator from "@/components/DateNavigator";
import { formatDateZh, normalizeDate, todayIso } from "@/lib/nba/dates";
import { getRecentBoard, getScoreboard } from "@/lib/nba/service";
import { teamZh } from "@/lib/nba/teams";

export const dynamic = "force-dynamic";

export default async function ScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const requested = sp.date;
  const date = normalizeDate(requested ?? todayIso());
  const board = requested ? await getScoreboard(date) : await getRecentBoard();

  const finished = board.games.filter((g) => g.statusState === "post");
  const live = board.games.filter((g) => g.statusState === "in");
  const upcoming = board.games.filter((g) => g.statusState === "pre");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-white">🏀 比分中心</h1>
        <p className="text-sm text-slate-400">
          {formatDateZh(date)} · 数据源 {board.source === "live" ? "nba-data 实时" : board.source === "cache" ? "本地缓存" : "离线"}
          {board.games.length > 0
            ? ` · 直播 ${live.length} 场 / 已结束 ${finished.length} 场 / 未开赛 ${upcoming.length} 场`
            : " · 本日暂无比赛安排"}
        </p>
      </header>

      <DateNavigator date={date} />

      {board.games.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-slate-300">这一天没有 NBA 比赛（可能是休赛期或空档日）。</p>
          <p className="mt-2 text-xs text-slate-500">
            提示：NBA 常规赛通常在 10 月中旬至次年 4 月进行，可切换日期查看历史比分。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {board.games.length > 0 ? (
        <section className="panel p-5">
          <h2 className="text-sm font-bold text-white">⚡ 当日速览（可用于快讯导语）</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-300">
            {board.games.map((game) => {
              const home = game.home.score ?? 0;
              const away = game.away.score ?? 0;
              const winner = home >= away ? game.home : game.away;
              const loser = home >= away ? game.away : game.home;
              const margin = Math.abs(home - away);
              const top = winner.leaders.find((l) => l.name === "points");
              return (
                <li key={`${game.id}-line`} className="panel-soft px-3 py-2">
                  {game.statusState === "post" ? (
                    <>
                      <span className="font-semibold text-orange-200">{teamZh(winner.abbr)}</span>{" "}
                      {margin} 分战胜 {teamZh(loser.abbr)}（{away}-{home} 客主比分）
                      {top ? `，${top.athleteName} ${top.displayValue} 分` : ""}。
                    </>
                  ) : (
                    <>
                      {teamZh(game.away.abbr)} 客场挑战 {teamZh(game.home.abbr)}，{game.statusDetail}
                      {game.broadcast ? `，转播：${game.broadcast}` : ""}。
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
