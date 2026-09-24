"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDateZh } from "@/lib/nba/dates";
import { getGameDetail } from "@/lib/nba/store";
import type {
  BoxscorePlayer,
  GameDetail,
  GameDetailResult,
  GameDetailTeam,
} from "@/lib/nba/types";

const SEASON_TYPE_LABEL = { pre: "季前赛", regular: "常规赛", post: "季后赛" } as const;

const DNP_REASON_ZH: [string, string][] = [
  ["COACH'S DECISION", "教练决定"],
  ["REST", "轮休"],
  ["INJURY", "伤病"],
  ["ILLNESS", "生病"],
  ["PERSONAL", "个人原因"],
  ["SUSPENSION", "禁赛"],
  ["NOT WITH TEAM", "未随队"],
  ["G LEAGUE", "发展联盟"],
];

function dnpReasonZh(reason: string | null): string {
  if (!reason) return "未出场";
  const upper = reason.toUpperCase();
  for (const [key, zh] of DNP_REASON_ZH) {
    if (upper.includes(key)) return zh;
  }
  return reason;
}

function fmtPlusMinus(v: number | null): string {
  if (v === null) return "—";
  return v > 0 ? `+${v}` : String(v);
}

/** 焦点球员：该队出场球员中得分最高者（同分比正负值） */
function pickFocus(players: BoxscorePlayer[]): BoxscorePlayer | null {
  const played = players.filter((p) => !p.didNotPlay && p.pts !== null);
  if (played.length === 0) return null;
  return played.reduce((best, p) => {
    const pPts = p.pts ?? 0;
    const bPts = best.pts ?? 0;
    if (pPts !== bPts) return pPts > bPts ? p : best;
    return (p.plusMinus ?? -999) > (best.plusMinus ?? -999) ? p : best;
  });
}

export default function GameDetailView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const date = params.get("date") ?? "";
  // state 记录结果对应的 id：渲染时用「state.id === 当前 id」派生当前结果，
  // 切换比赛时旧数据自然失效，无需在 effect 里同步重置 state
  const [state, setState] = useState<{ id: string; result: GameDetailResult } | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const r = await getGameDetail(id);
        if (!alive) return;
        setState({ id, result: r });
        // 直播中的比赛每 30 秒自动刷新
        if (r.detail?.statusState === "in") {
          timer = window.setTimeout(load, 30000);
        }
      } catch {
        if (alive) {
          setState({
            id,
            result: { detail: null, source: "offline", fetchedAt: new Date().toISOString() },
          });
        }
      }
    };
    load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  const result = state && state.id === id ? state.result : null;

  if (!id) {
    return (
      <div className="panel mx-auto max-w-3xl p-8 text-center text-sm text-slate-400">
        缺少比赛 id。请从<Link href="/scores" className="text-orange-300 underline">比分中心</Link>选择一场比赛。
      </div>
    );
  }

  if (!result) {
    return (
      <div className="panel mx-auto flex max-w-3xl items-center justify-center gap-3 p-12 text-sm text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        正在抓取比赛详情…
      </div>
    );
  }

  const detail = result.detail;
  if (!detail) {
    return (
      <div className="panel mx-auto max-w-3xl p-8 text-center">
        <p className="text-sm text-slate-300">暂时无法加载这场比赛的详细数据（网络异常且本机无缓存）。</p>
        <Link href={date ? `/scores?date=${date}` : "/scores"} className="btn btn-ghost mt-4 inline-block !py-1.5 !text-[12px]">
          ← 返回比分中心
        </Link>
      </div>
    );
  }

  const displayDate = date || detail.gameDate;
  const live = detail.statusState === "in";
  const pre = detail.statusState === "pre";
  const focusAway = pickFocus(detail.away.players);
  const focusHome = pickFocus(detail.home.players);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={date ? `/scores?date=${date}` : "/scores"} className="text-[12px] text-slate-500 hover:text-orange-300">
            ← 返回比分中心
          </Link>
          <h1 className="mt-1 text-2xl font-black text-white">
            {detail.away.name || detail.away.abbr} @ {detail.home.name || detail.home.abbr}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {displayDate ? formatDateZh(displayDate) : "日期待定"} · {SEASON_TYPE_LABEL[detail.seasonType]} · 数据源{" "}
            {result.source === "live" ? "ESPN 实时" : result.source === "cache" ? "本机缓存" : "离线"}
            {live ? " · 每 30 秒自动刷新" : ""}
          </p>
        </div>
        <span className="chip">
          {live ? "🔴 直播中" : pre ? "🕒 未开赛" : "🏁 已结束"}
        </span>
      </header>

      <ScoreHero detail={detail} />

      {pre ? (
        <div className="panel p-6 text-center text-sm text-slate-400">
          比赛尚未开始，详细数据（boxscore、球队对比）将在开赛后自动生成。
        </div>
      ) : null}

      {detail.quarters.length > 0 ? <QuarterTable detail={detail} /> : null}
      {detail.teamStats.length > 0 ? <TeamCompare detail={detail} /> : null}
      {focusAway && focusHome ? (
        <FocusCompare away={focusAway} home={focusHome} detail={detail} />
      ) : null}
      {detail.away.players.length > 0 || detail.home.players.length > 0 ? (
        <BoxscorePanel detail={detail} />
      ) : null}

      <Link
        href={`/editor?gameId=${detail.id}&gameDate=${displayDate}`}
        className="btn btn-ghost block w-full !py-2 text-center !text-[13px]"
      >
        ✍️ 用这场比赛生成文案
      </Link>
    </div>
  );
}

/* ------------------------------ 比分横幅 ------------------------------ */

function ScoreHero({ detail }: { detail: GameDetail }) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <HeroTeam team={detail.away} align="left" />
        <div className="flex shrink-0 flex-col items-center gap-1 px-1">
          <span className="text-[11px] font-semibold text-slate-600">VS</span>
          {detail.statusDetail ? (
            <span className="max-w-32 text-center text-[11px] text-slate-500">{detail.statusDetail}</span>
          ) : null}
          {detail.series ? <span className="chip text-orange-300">{detail.series}</span> : null}
        </div>
        <HeroTeam team={detail.home} align="right" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        <span className="chip">{SEASON_TYPE_LABEL[detail.seasonType]}</span>
        {detail.venue ? <span className="chip">📍 {detail.venue}</span> : null}
        {detail.attendance ? <span className="chip">👥 上座 {detail.attendance.toLocaleString("zh-CN")}</span> : null}
        {detail.home.record || detail.away.record ? (
          <span className="chip">
            战绩 {detail.away.record ?? "—"} / {detail.home.record ?? "—"}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function HeroTeam({ team, align }: { team: GameDetailTeam; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {team.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt={team.abbr} className="h-12 w-12 shrink-0 object-contain" />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-700/40 text-[12px] font-bold text-slate-300">
          {team.abbr}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-slate-100">{team.name || team.abbr}</span>
        <span className="block text-[11px] text-slate-500">
          {team.abbr} · {team.record ?? "—"}
        </span>
      </span>
      <span className={`text-3xl font-black tabular-nums ${team.winner ? "text-orange-300" : "text-slate-400"}`}>
        {team.score ?? "—"}
      </span>
    </div>
  );
}

/* ------------------------------ 逐节比分 ------------------------------ */

function QuarterTable({ detail }: { detail: GameDetail }) {
  const awayTotal = detail.away.score ?? 0;
  const homeTotal = detail.home.score ?? 0;
  return (
    <section className="panel p-5">
      <h2 className="text-sm font-bold text-white">🕐 逐节比分</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-80 text-center text-[12px] tabular-nums">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1.5 text-left font-medium">球队</th>
              {detail.quarters.map((q) => (
                <th key={q.label} className="px-2 py-1.5 font-medium">{q.label}</th>
              ))}
              <th className="px-2 py-1.5 font-medium">总分</th>
            </tr>
          </thead>
          <tbody>
            {([
              { team: detail.away, values: detail.quarters.map((q) => q.away), total: awayTotal, won: awayTotal > homeTotal },
              { team: detail.home, values: detail.quarters.map((q) => q.home), total: homeTotal, won: homeTotal > awayTotal },
            ]).map((row) => (
              <tr key={row.team.abbr} className="border-t border-slate-800/60">
                <td className="py-2 text-left font-semibold text-slate-200">{row.team.name || row.team.abbr}</td>
                {row.values.map((v, i) => (
                  <td key={i} className="px-2 py-2 text-slate-300">{v ?? "—"}</td>
                ))}
                <td className={`px-2 py-2 font-black ${row.won ? "text-orange-300" : "text-slate-300"}`}>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------ 通用对比行 ------------------------------ */

function CompareRow({
  label,
  awayDisplay,
  homeDisplay,
  awayValue,
  homeValue,
  lowerIsBetter,
  percent,
}: {
  label: string;
  awayDisplay: string;
  homeDisplay: string;
  awayValue: number | null;
  homeValue: number | null;
  lowerIsBetter?: boolean;
  percent?: boolean;
}) {
  const a = awayValue ?? 0;
  const h = homeValue ?? 0;
  const max = Math.max(a, h, 1e-6);
  const comparable = awayValue !== null && homeValue !== null;
  const awayBetter = comparable && (lowerIsBetter ? a < h : a > h);
  const homeBetter = comparable && (lowerIsBetter ? h < a : h > a);
  // 条长设计：百分比指标用绝对刻度（46% 即 46% 长），计数指标用幂次曲线
  // 放大差距（0.85 的比值压到 ~0.74），避免每行都出现顶满的长条
  const widthOf = (v: number): number => {
    if (percent) return Math.max(3, Math.min(100, v));
    return Math.max(3, Math.pow(v / max, 1.4) * 100);
  };
  return (
    <div className="flex items-center justify-center gap-2 py-1.5">
      <span className={`w-28 shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums ${awayBetter ? "font-bold text-sky-300" : "text-slate-400"}`}>
        {awayDisplay}
      </span>
      <div className="flex h-1.5 min-w-8 max-w-44 flex-1 justify-end">
        <div
          className={`h-full rounded-full ${awayBetter ? "bg-sky-400" : "bg-sky-400/30"}`}
          style={{ width: `${widthOf(a)}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-center text-[11px] text-slate-500">{label}</span>
      <div className="flex h-1.5 min-w-8 max-w-44 flex-1">
        <div
          className={`h-full rounded-full ${homeBetter ? "bg-orange-400" : "bg-orange-400/30"}`}
          style={{ width: `${widthOf(h)}%` }}
        />
      </div>
      <span className={`w-28 shrink-0 whitespace-nowrap text-[12px] tabular-nums ${homeBetter ? "font-bold text-orange-300" : "text-slate-400"}`}>
        {homeDisplay}
      </span>
    </div>
  );
}

/** 无条形的文本对比行（投篮出手、正负值等） */
function CompareTextRow({
  label,
  awayDisplay,
  homeDisplay,
  awayTone,
  homeTone,
}: {
  label: string;
  awayDisplay: string;
  homeDisplay: string;
  awayTone?: "good" | "bad" | "plain";
  homeTone?: "good" | "bad" | "plain";
}) {
  const tone = (t?: "good" | "bad" | "plain") =>
    t === "good" ? "font-bold text-emerald-300" : t === "bad" ? "font-bold text-rose-300" : "text-slate-300";
  // 数值贴着中间标签两侧、整组居中，与上方彩条行的中线对齐
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <span className={`w-24 shrink-0 text-right text-[12px] tabular-nums ${tone(awayTone)}`}>{awayDisplay}</span>
      <span className="w-20 shrink-0 text-center text-[11px] text-slate-500">{label}</span>
      <span className={`w-24 shrink-0 text-[12px] tabular-nums ${tone(homeTone)}`}>{homeDisplay}</span>
    </div>
  );
}

/* ------------------------------ 球队数据对比 ------------------------------ */

function TeamCompare({ detail }: { detail: GameDetail }) {
  return (
    <section className="panel p-5">
      <h2 className="text-sm font-bold text-white">📊 球队数据对比</h2>
      <div className="mt-2 flex items-center justify-between border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2">
          {detail.away.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.away.logo} alt={detail.away.abbr} className="h-6 w-6 object-contain" />
          ) : null}
          <span className="text-base font-bold text-sky-300">{detail.away.name || detail.away.abbr}</span>
          <span className="text-[11px] text-slate-500">（客）</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">（主）</span>
          <span className="text-base font-bold text-orange-300">{detail.home.name || detail.home.abbr}</span>
          {detail.home.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.home.logo} alt={detail.home.abbr} className="h-6 w-6 object-contain" />
          ) : null}
        </div>
      </div>
      <div className="mt-1 divide-y divide-slate-800/40">
        {detail.teamStats.map((row) => (
          <CompareRow
            key={row.key}
            label={row.label}
            awayDisplay={row.awayDisplay}
            homeDisplay={row.homeDisplay}
            awayValue={row.away}
            homeValue={row.home}
            lowerIsBetter={row.lowerIsBetter}
            percent={row.key.endsWith("Pct")}
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ 焦点球员对比 ------------------------------ */

function FocusCompare({
  away,
  home,
  detail,
}: {
  away: BoxscorePlayer;
  home: BoxscorePlayer;
  detail: GameDetail;
}) {
  const awayBest =
    (away.pts ?? 0) > (home.pts ?? 0) ||
    ((away.pts ?? 0) === (home.pts ?? 0) && (away.plusMinus ?? -999) > (home.plusMinus ?? -999));
  const rows: { label: string; key: keyof BoxscorePlayer; lowerIsBetter?: boolean }[] = [
    { label: "得分", key: "pts" },
    { label: "篮板", key: "reb" },
    { label: "助攻", key: "ast" },
    { label: "抢断", key: "stl" },
    { label: "盖帽", key: "blk" },
    { label: "失误", key: "tov", lowerIsBetter: true },
    { label: "出场时间", key: "minutes" },
  ];
  return (
    <section className="panel p-5">
      <h2 className="text-sm font-bold text-white">⭐ 焦点球员对决</h2>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <FocusCard player={away} teamName={detail.away.name || detail.away.abbr} best={awayBest} align="left" />
        <span className="text-[11px] font-semibold text-slate-600">VS</span>
        <FocusCard player={home} teamName={detail.home.name || detail.home.abbr} best={!awayBest} align="right" />
      </div>
      <div className="mt-4 divide-y divide-slate-800/40">
        {rows.map((row) => {
          const av = away[row.key] as number | null;
          const hv = home[row.key] as number | null;
          return (
            <CompareRow
              key={row.key}
              label={row.label}
              awayDisplay={av === null ? "—" : String(av)}
              homeDisplay={hv === null ? "—" : String(hv)}
              awayValue={av}
              homeValue={hv}
              lowerIsBetter={row.lowerIsBetter}
            />
          );
        })}
        <CompareTextRow label="投篮" awayDisplay={away.fg ?? "—"} homeDisplay={home.fg ?? "—"} />
        <CompareTextRow label="三分" awayDisplay={away.tp ?? "—"} homeDisplay={home.tp ?? "—"} />
        <CompareTextRow label="罚球" awayDisplay={away.ft ?? "—"} homeDisplay={home.ft ?? "—"} />
        <CompareTextRow
          label="正负值"
          awayDisplay={fmtPlusMinus(away.plusMinus)}
          homeDisplay={fmtPlusMinus(home.plusMinus)}
          awayTone={away.plusMinus === null ? "plain" : away.plusMinus > 0 ? "good" : away.plusMinus < 0 ? "bad" : "plain"}
          homeTone={home.plusMinus === null ? "plain" : home.plusMinus > 0 ? "good" : home.plusMinus < 0 ? "bad" : "plain"}
        />
      </div>
    </section>
  );
}

function FocusCard({
  player,
  teamName,
  best,
  align,
}: {
  player: BoxscorePlayer;
  teamName: string;
  best: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${align === "right" ? "items-end text-right" : ""}`}>
      <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {player.headshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.headshot}
            alt={player.name}
            className="h-14 w-14 rounded-full bg-slate-800 object-cover"
          />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-700/40 text-sm font-bold text-slate-300">
            {player.name.slice(0, 1)}
          </span>
        )}
        {best ? <span className="chip text-orange-300">🔥 本场最佳</span> : null}
      </div>
      <Link href={`/player?id=${player.athleteId}`} className="text-[14px] font-bold text-slate-100 hover:text-orange-300">
        {player.name}
      </Link>
      <span className="text-[11px] text-slate-500">
        {teamName}
        {player.position ? ` · ${player.position}` : ""}
        {player.starter ? " · 首发" : " · 替补"}
      </span>
    </div>
  );
}

/* ------------------------------ 完整技术统计 ------------------------------ */

type BoxSortKey =
  | "minutes" | "pts" | "reb" | "ast" | "stl" | "blk" | "tov" | "pf" | "plusMinus"
  | "fg" | "tp" | "ft";

const BOX_COLUMNS: { key: BoxSortKey; label: string }[] = [
  { key: "minutes", label: "MIN" },
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "tov", label: "TO" },
  { key: "pf", label: "PF" },
  { key: "plusMinus", label: "+/-" },
  { key: "fg", label: "FG" },
  { key: "tp", label: "3PT" },
  { key: "ft", label: "FT" },
];

/** 投篮串 "8-13" → 命中率（0-0 视为无数据，排序时沉底） */
function shotPct(value: string | null): number | null {
  const m = value?.match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  const attempted = Number(m[2]);
  return attempted > 0 ? Number(m[1]) / attempted : null;
}

function boxValue(player: BoxscorePlayer, key: BoxSortKey): number | null {
  if (key === "fg") return shotPct(player.fg);
  if (key === "tp") return shotPct(player.tp);
  if (key === "ft") return shotPct(player.ft);
  return player[key];
}

function BoxscorePanel({ detail }: { detail: GameDetail }) {
  const [side, setSide] = useState<"away" | "home">("away");
  const [sort, setSort] = useState<{ key: BoxSortKey; dir: "desc" | "asc" } | null>(null);
  const team = side === "away" ? detail.away : detail.home;
  const played = team.players.filter((p) => !p.didNotPlay && p.minutes !== null);
  const dnp = team.players.filter((p) => p.didNotPlay || p.minutes === null);
  const firstBench = played.findIndex((p) => !p.starter);

  /** 点击表头循环：未排序 → 从高到低 → 从低到高 → 恢复默认（首发/替补） */
  const toggleSort = (key: BoxSortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  };

  const rows = sort
    ? [...played].sort((x, y) => {
        const xv = boxValue(x, sort.key);
        const yv = boxValue(y, sort.key);
        if (xv === null && yv === null) return 0;
        if (xv === null) return 1; // 无数据恒沉底
        if (yv === null) return -1;
        return sort.dir === "desc" ? yv - xv : xv - yv;
      })
    : played;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">📋 完整技术统计</h2>
        <div className="flex gap-1.5">
          {(["away", "home"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`chip cursor-pointer transition ${
                side === s ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {s === "away"
                ? `${detail.away.name || detail.away.abbr}（客）`
                : `${detail.home.name || detail.home.abbr}（主）`}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {sort
          ? `正按 ${BOX_COLUMNS.find((c) => c.key === sort.key)?.label} ${sort.dir === "desc" ? "从高到低" : "从低到高"} 排列 · 再次点击切换方向，第三次点击恢复默认`
          : "点击表头英文列可按该项排序（从高到低 / 从低到高）"}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12px] tabular-nums">
          <thead>
            <tr className="text-slate-500">
              <th
                className="cursor-pointer select-none py-1.5 text-left font-medium hover:text-slate-300"
                title="点击恢复默认顺序（首发在前）"
                onClick={() => setSort(null)}
              >
                首发{sort ? <span className="ml-1 text-slate-600">↺</span> : null}
              </th>
              {BOX_COLUMNS.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    title={active ? (sort.dir === "desc" ? "当前：从高到低，点击切换为从低到高" : "当前：从低到高，点击恢复默认") : "点击按该项从高到低排序"}
                    className={`cursor-pointer select-none px-1.5 py-1.5 text-right font-medium transition hover:text-slate-300 ${
                      active ? "text-orange-300" : ""
                    }`}
                  >
                    {col.label}
                    {active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <BoxscoreRow
                key={p.athleteId || p.name}
                player={p}
                divider={!sort && firstBench >= 0 && i === firstBench}
              />
            ))}
          </tbody>
        </table>
      </div>
      {dnp.length > 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          未出场：{dnp.map((p) => `${p.name}（${dnpReasonZh(p.reason)}）`).join("、")}
        </p>
      ) : null}
    </section>
  );
}

function BoxscoreRow({ player: p, divider }: { player: BoxscorePlayer; divider: boolean }) {
  return (
    <>
      {divider ? (
        <tr>
          <td colSpan={13} className="border-t border-slate-700/60 py-1 text-[10px] font-semibold tracking-wider text-slate-500">
            替补
          </td>
        </tr>
      ) : null}
      <tr className="border-t border-slate-800/60">
        <td className="py-2 pr-2 text-left">
          <Link href={`/player?id=${p.athleteId}`} className="font-semibold text-slate-200 hover:text-orange-300">
            {p.name}
          </Link>
          <span className="ml-1 text-[10px] text-slate-500">{p.position ?? ""}</span>
        </td>
        <td className="px-1.5 py-2 text-right text-slate-300">{p.minutes ?? "—"}</td>
        <td className="px-1.5 py-2 text-right font-bold text-slate-100">{p.pts ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-300">{p.reb ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-300">{p.ast ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-300">{p.stl ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-300">{p.blk ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-300">{p.tov ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-300">{p.pf ?? "—"}</td>
        <td className={`px-1.5 py-2 text-right ${p.plusMinus !== null && p.plusMinus > 0 ? "text-emerald-300" : p.plusMinus !== null && p.plusMinus < 0 ? "text-rose-300" : "text-slate-300"}`}>
          {fmtPlusMinus(p.plusMinus)}
        </td>
        <td className="px-1.5 py-2 text-right text-slate-400">{p.fg ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-400">{p.tp ?? "—"}</td>
        <td className="px-1.5 py-2 text-right text-slate-400">{p.ft ?? "—"}</td>
      </tr>
    </>
  );
}
