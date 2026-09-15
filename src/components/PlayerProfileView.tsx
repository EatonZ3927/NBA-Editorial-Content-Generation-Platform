"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPlayerProfile } from "@/lib/nba/store";
import type { PlayerProfile, StatSplit } from "@/lib/nba/types";

function n1(v: number | null | undefined) {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : String(Math.round(v * 10) / 10);
}
function pct(v: number | null | undefined) {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;
}

/**
 * 球员详情（纯前端版）：档案与生涯数据由本浏览器直连 ESPN 抓取，
 * 结果缓存到本机 localStorage（30 分钟）。
 */
export default function PlayerProfileView({ espnId }: { espnId: string }) {
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPlayer(null);
    getPlayerProfile(espnId)
      .catch(() => null)
      .then((p) => {
        if (!alive) return;
        setPlayer(p);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [espnId]);

  if (loading) {
    return (
      <div className="panel flex items-center justify-center gap-3 p-12 text-sm text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        正在抓取球员档案与生涯数据…
      </div>
    );
  }

  const bogus = !player || (!player.fullName && player.seasons.length === 0);
  if (bogus) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-sm text-slate-300">未找到该球员的数据。</p>
        <p className="mt-2 text-xs text-slate-500">
          可能是 ESPN ID 无效或数据源暂时不可用，请返回{" "}
          <Link href="/players" className="text-orange-300 hover:text-orange-200">
            球星检索
          </Link>{" "}
          重新选择。
        </p>
      </div>
    );
  }

  const regular = player.seasons.filter((s) => s.seasonType === "regular");
  const playoffs = player.seasons.filter((s) => s.seasonType === "playoffs");
  const name = player.zhName ? `${player.zhName} · ${player.fullName}` : player.fullName;

  const quickTemplates = [
    { id: "player-night", label: "🔥 球星之夜" },
    { id: "player-career", label: "📖 生涯图鉴" },
    { id: "data-drop", label: "📊 数据盘点" },
    { id: "social-post", label: "💬 社媒短文案" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/players" className="hover:text-orange-300">
          球星检索
        </Link>
        <span>/</span>
        <span className="text-slate-300">{player.fullName}</span>
      </div>

      {/* 档案 */}
      <section className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={player.headshot ?? ""}
          alt={player.fullName}
          className="h-24 w-24 shrink-0 rounded-2xl bg-slate-800 object-cover ring-1 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-white sm:text-2xl">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="chip">{player.teamZh ?? player.teamName ?? "NBA"}</span>
            {player.position ? <span className="chip">位置 {player.position}</span> : null}
            {player.height ? <span className="chip">身高 {player.height}</span> : null}
            {player.weight ? <span className="chip">体重 {player.weight}</span> : null}
            {player.age ? <span className="chip">年龄 {player.age}</span> : null}
            {player.debutYear ? <span className="chip">{player.debutYear} 年进入联盟</span> : null}
            {player.draftText ? <span className="chip">选秀 {player.draftText}</span> : null}
            {player.college ? <span className="chip">大学 {player.college}</span> : null}
            <span className="chip">数据源 {player.source === "live" ? "实时" : "缓存"}</span>
          </div>
          {player.note ? (
            <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-slate-400">{player.note}</p>
          ) : null}
        </div>
      </section>

      {/* 一键生成 */}
      <section className="panel flex flex-wrap items-center gap-2 p-4">
        <span className="text-xs font-semibold text-slate-400">用该球员数据快速生成：</span>
        {quickTemplates.map((t) => (
          <Link
            key={t.id}
            href={`/editor?espnId=${player.espnId}&template=${t.id}`}
            className="btn btn-ghost !py-1.5 !text-xs"
          >
            {t.label}
          </Link>
        ))}
      </section>

      {/* 数据卡 */}
      <section className="grid gap-4 lg:grid-cols-3">
        <SplitCard title="最近赛季" split={player.currentSeason} accent />
        <SplitCard title="生涯常规赛" split={player.careerRegular} />
        <SplitCard title="生涯季后赛" split={player.careerPlayoffs} />
      </section>

      {/* 分赛季数据 */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-base font-bold text-white">📈 分赛季历史数据</h2>
          <span className="text-[11px] text-slate-500">
            常规赛 {regular.length} 季{playoffs.length > 0 ? ` · 季后赛 ${playoffs.length} 次` : ""}
          </span>
        </div>
        <div className="panel table-wrap p-2">
          <table className="data">
            <thead>
              <tr>
                <th>赛季</th>
                <th>类型</th>
                <th>球队</th>
                <th>场次</th>
                <th>时间</th>
                <th>得分</th>
                <th>篮板</th>
                <th>助攻</th>
                <th>抢断</th>
                <th>盖帽</th>
                <th>投篮%</th>
                <th>三分%</th>
                <th>罚球%</th>
              </tr>
            </thead>
            <tbody>
              {player.seasons.map((s) => (
                <tr key={`${s.seasonLabel}-${s.seasonType}`}>
                  <td className="font-semibold text-slate-100">{s.seasonLabel}</td>
                  <td className={s.seasonType === "playoffs" ? "text-orange-300" : "text-slate-500"}>
                    {s.seasonType === "playoffs" ? "季后赛" : "常规赛"}
                  </td>
                  <td className="text-slate-400">{s.teamAbbr ?? "—"}</td>
                  <td>{s.gp ?? "—"}</td>
                  <td>{n1(s.min)}</td>
                  <td className="font-bold text-orange-300">{n1(s.pts)}</td>
                  <td>{n1(s.reb)}</td>
                  <td>{n1(s.ast)}</td>
                  <td>{n1(s.stl)}</td>
                  <td>{n1(s.blk)}</td>
                  <td>{pct(s.fgp)}</td>
                  <td>{pct(s.tpp)}</td>
                  <td>{pct(s.ftp)}</td>
                </tr>
              ))}
              {player.seasons.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-500">
                    暂未抓取到分赛季数据（可能该球员无 NBA 常规赛出场记录，或数据源暂时不可用）。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 近期表现 */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-white">🕒 近期出场</h2>
          <div className="panel table-wrap p-2">
            <table className="data">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>对手</th>
                  <th>结果</th>
                  <th>时间</th>
                  <th>投篮%</th>
                  <th>篮板</th>
                  <th>助攻</th>
                  <th>得分</th>
                </tr>
              </thead>
              <tbody>
                {player.recentGames.map((g, i) => (
                  <tr key={`${g.date}-${i}`}>
                    <td className="text-slate-400">{g.date}</td>
                    <td>{g.opponent}</td>
                    <td className={g.result.startsWith("W") ? "text-emerald-300" : "text-rose-300"}>
                      {g.result}
                    </td>
                    <td>{g.minutes ?? "—"}</td>
                    <td>{g.fg ?? "—"}</td>
                    <td>{g.reb ?? "—"}</td>
                    <td>{g.ast ?? "—"}</td>
                    <td className="font-bold text-orange-300">{g.pts ?? "—"}</td>
                  </tr>
                ))}
                {player.recentGames.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      暂无近期比赛数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* 荣誉 */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-white">🏆 荣誉与备注</h2>
          <div className="panel space-y-3 p-4">
            {player.awards.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {player.awards.map((award) => (
                  <span key={award} className="chip text-orange-200">
                    {award}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">暂无荣誉数据</p>
            )}
            <div className="border-t border-white/5 pt-3 text-[12px] leading-relaxed text-slate-400">
              <p>
                生涯共收录 {player.careerRegular?.gp ?? "—"} 场常规赛
                {player.careerPlayoffs?.gp ? `、${player.careerPlayoffs.gp} 场季后赛` : ""}数据。
              </p>
              <p className="mt-1">
                抓取时间 {new Date(player.fetchedAt).toLocaleString("zh-CN")} · ESPN ID {player.espnId}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SplitCard({ title, split, accent }: { title: string; split: StatSplit | null; accent?: boolean }) {
  const items: [string, string][] = split
    ? [
        ["场次", n1(split.gp)],
        ["时间", n1(split.min)],
        ["得分", n1(split.pts)],
        ["篮板", n1(split.reb)],
        ["助攻", n1(split.ast)],
        ["抢断", n1(split.stl)],
        ["盖帽", n1(split.blk)],
        ["投篮%", pct(split.fgp)],
        ["三分%", pct(split.tpp)],
        ["罚球%", pct(split.ftp)],
      ]
    : [];
  return (
    <div className={`panel p-4 ${accent ? "ring-1 ring-orange-500/30" : ""}`}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      {split ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {items.map(([label, value]) => (
            <div key={label} className="panel-soft px-2 py-1.5 text-center">
              <div className="text-[10px] text-slate-500">{label}</div>
              <div className="text-[13px] font-bold text-slate-100">{value}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">暂无数据</p>
      )}
    </div>
  );
}
