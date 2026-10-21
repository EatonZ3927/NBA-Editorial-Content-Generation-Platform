"use client";

import Link from "next/link";
import { useState } from "react";
import type { GameSummary } from "@/lib/nba/types";
import { gameTimeEn } from "@/lib/nba/dates";

/**
 * 本场热点球员标签：两队得分王优先，篮板/助攻王补充，去重后最多 3 个。
 * 统一显示完整英文名（名 + 姓）。
 */
function hotPlayers(game: GameSummary): string[] {
  const names: string[] = [];
  const push = (side: "home" | "away", kind: string) => {
    const leader = game[side].leaders.find((l) => l.name === kind);
    if (leader && !names.includes(leader.athleteName)) names.push(leader.athleteName);
  };
  push("away", "points");
  push("home", "points");
  for (const kind of ["rebounds", "assists"]) {
    push("away", kind);
    push("home", kind);
  }
  return names.slice(0, 3);
}

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
  const finished = game.completed && game.statusState === "post";
  const hasWinner = game.home.winner !== game.away.winner;
  const scoresKnown = game.home.score !== null && game.away.score !== null;
  const homeWin = finished && (hasWinner ? game.home.winner : scoresKnown && game.home.score! > game.away.score!);
  const awayWin = finished && (hasWinner ? game.away.winner : scoresKnown && game.away.score! > game.home.score!);

  return (
    <article className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="chip">
          {live ? "🔴 直播中" : pre ? "🕒 未开赛" : "🏁 已结束"}
        </span>
        <time dateTime={game.date} title="Beijing Time (GMT+8)" className="text-right text-slate-500">{gameTimeEn(game.date)}</time>
      </div>
      {!pre && game.statusDetail ? <p className="text-[11px] text-slate-500">{game.statusDetail}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <TeamRow
          name={game.away.name || game.away.abbr}
          abbr={game.away.abbr}
          logo={game.away.logo}
          side="away"
          score={game.away.score}
          record={game.away.record}
          win={awayWin}
          dim={pre}
        />
        <span className="shrink-0 px-1 text-[11px] font-semibold text-slate-600">VS</span>
        <TeamRow
          name={game.home.name || game.home.abbr}
          abbr={game.home.abbr}
          logo={game.home.logo}
          side="home"
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
            <span className="text-slate-500">{game.away.name || game.away.abbr} 核心：</span>
            <span className="text-slate-200">{leaderText(game, "away")}</span>
          </div>
          <div className="panel-soft px-2.5 py-2">
            <span className="text-slate-500">{game.home.name || game.home.abbr} 核心：</span>
            <span className="text-slate-200">{leaderText(game, "home")}</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        {hotPlayers(game).map((name) => (
          <span key={name} className="chip">
            🔥 {name}
          </span>
        ))}
        {game.venue ? <span className="chip">📍 {game.venue}</span> : null}
        {game.series ? <span className="chip text-orange-300">{game.series}</span> : null}
        {game.odds?.overUnder ? <span className="chip">Σ {game.odds.overUnder}</span> : null}
      </div>

      <div className="flex gap-2">
        {!pre ? (
          <Link
            href={`/game?id=${game.id}&date=${game.gameDate}`}
            className="btn btn-ghost flex-1 !py-1.5 !text-[12px]"
          >
            📊 比赛详情
          </Link>
        ) : null}
        <Link
          href={`/editor?gameId=${game.id}&gameDate=${game.gameDate}`}
          className="btn btn-ghost flex-1 !py-1.5 !text-[12px]"
        >
          ✍️ 生成文案
        </Link>
      </div>
    </article>
  );
}

function TeamRow({
  name,
  abbr,
  logo,
  side,
  score,
  record,
  win,
  align = "left",
  dim,
}: {
  name: string;
  abbr: string;
  logo: string | null;
  side: "home" | "away";
  score: number | null;
  record: string | null;
  win: boolean;
  align?: "left" | "right";
  dim?: boolean;
}) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="flex w-9 shrink-0 flex-col items-center gap-1">
        <span
          title={win ? `${name} · Winner` : name}
          className={`grid h-9 w-9 place-items-center rounded-lg bg-slate-700/40 text-[11px] font-bold text-slate-300 ${
            win ? "ring-2 ring-inset ring-green-500" : ""
          }`}
        >
          {logo && failedLogo !== logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${name} logo`} className="h-full w-full object-contain p-1" onError={() => setFailedLogo(logo)} />
          ) : abbr}
        </span>
        <span className="text-[9px] font-semibold leading-none tracking-wide text-slate-500">{side === "home" ? "HOME" : "AWAY"}</span>
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
