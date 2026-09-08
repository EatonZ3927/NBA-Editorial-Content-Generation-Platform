import Link from "next/link";
import type { GameSummary } from "@/lib/nba/types";
import { teamShort, teamZh } from "@/lib/nba/teams";

function leaderText(game: GameSummary, side: "home" | "away", kind = "points") {
  const team = game[side];
  const leader = team.leaders.find((l) => l.name === kind) ?? team.leaders[0];
  if (!leader) return "—";
  const label = kind === "rebounds" ? "板" : kind === "assists" ? "助" : "分";
  return `${leader.athleteName.split(" ").slice(-1)[0]} ${leader.displayValue}${label}`;
}

export default function GameCard({ game }: { game: GameSummary }) {
  const live = game.statusState === "in";
  const pre = game.statusState === "pre";
  const homeWin = (game.home.score ?? 0) > (game.away.score ?? 0);
  const awayWin = (game.away.score ?? 0) > (game.home.score ?? 0);

  return (
    <article className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="chip">
          {live ? "🔴 直播中" : pre ? "🕒 未开赛" : "🏁 已结束"}
        </span>
        <span className="truncate text-slate-500">{game.statusDetail}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <TeamRow
          name={teamZh(game.away.abbr)}
          abbr={game.away.abbr}
          score={game.away.score}
          record={game.away.record}
          win={awayWin}
          dim={pre}
        />
        <span className="shrink-0 px-1 text-[11px] font-semibold text-slate-600">VS</span>
        <TeamRow
          name={teamZh(game.home.abbr)}
          abbr={game.home.abbr}
          score={game.home.score}
          record={game.home.record}
          win={homeWin}
          align="right"
          dim={pre}
        />
      </div>

      {!pre ? (
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
          <div className="panel-soft px-2.5 py-2">
            <span className="text-slate-500">{teamShort(game.away.abbr)} 核心：</span>
            <span className="text-slate-200">{leaderText(game, "away")}</span>
          </div>
          <div className="panel-soft px-2.5 py-2">
            <span className="text-slate-500">{teamShort(game.home.abbr)} 核心：</span>
            <span className="text-slate-200">{leaderText(game, "home")}</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        {game.broadcast ? <span className="chip">📺 {game.broadcast}</span> : null}
        {game.venue ? <span className="chip">📍 {game.venue}</span> : null}
        {game.series ? <span className="chip text-orange-300">{game.series}</span> : null}
        {game.odds?.overUnder ? <span className="chip">Σ {game.odds.overUnder}</span> : null}
      </div>

      <Link
        href={`/editor?gameId=${game.id}&gameDate=${game.gameDate}`}
        className="btn btn-ghost w-full !py-1.5 !text-[12px]"
      >
        ✍️ 用这场比赛生成文案
      </Link>
    </article>
  );
}

function TeamRow({
  name,
  abbr,
  score,
  record,
  win,
  align = "left",
  dim,
}: {
  name: string;
  abbr: string;
  score: number | null;
  record: string | null;
  win: boolean;
  align?: "left" | "right";
  dim?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${
          win ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40" : "bg-slate-700/40 text-slate-300"
        }`}
      >
        {abbr}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-slate-100">{name}</span>
        <span className="block text-[11px] text-slate-500">{record ?? (dim ? "待定" : "—")}</span>
      </span>
      <span className={`text-xl font-black tabular-nums ${win ? "text-white" : "text-slate-400"}`}>
        {score ?? "—"}
      </span>
    </div>
  );
}
