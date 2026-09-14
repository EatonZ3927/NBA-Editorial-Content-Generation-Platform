"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GameCard from "@/components/GameCard";
import { currentNbaSeasonYear, seasonLabel } from "@/lib/nba/espn";
import {
  getLeagueLeaders,
  getNews,
  getRecentBoard,
  listDrafts,
} from "@/lib/nba/store";
import { STAR_PICKS } from "@/lib/nba/teams";
import { formatDateZh, relativeZh } from "@/lib/nba/dates";
import type { LeaderRow, NewsItem, ScoreboardResult } from "@/lib/nba/types";

function n1(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10);
}

export default function HomePage() {
  const season = currentNbaSeasonYear();
  const [board, setBoard] = useState<ScoreboardResult | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [leaders, setLeaders] = useState<{ rows: LeaderRow[]; season: number } | null>(null);
  const [draftCount, setDraftCount] = useState(0);

  // 纯前端版：所有数据在本浏览器内抓取（ESPN 公开接口 + localStorage 缓存）
  useEffect(() => {
    let alive = true;
    setDraftCount(listDrafts().length);
    (async () => {
      const [b, n, l] = await Promise.all([
        getRecentBoard().catch(() => null),
        getNews(6).catch(() => null),
        getLeagueLeaders(season, "pts").catch(() => null),
      ]);
      if (!alive) return;
      setBoard(b);
      setNews(n?.items ?? []);
      setLeaders(l ? { rows: l.rows, season: l.season } : { rows: [], season });
    })();
    return () => {
      alive = false;
    };
  }, [season]);

  const sourceBadge = !board
    ? "加载中"
    : board.source === "live"
      ? "实时数据"
      : board.source === "cache"
        ? "本机缓存"
        : "离线";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="panel relative overflow-hidden p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative">
          <span className="chip">Sports Desk · 编辑效率工具</span>
          <h1 className="mt-4 max-w-3xl text-[clamp(1.8rem,4vw,2.9rem)] font-black leading-tight text-white">
            一站式 NBA 内容工作台
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[clamp(1rem,2vw,1.4rem)] font-bold tracking-wide">
            <span className="bg-gradient-to-r from-orange-400 to-sky-300 bg-clip-text text-transparent">
              自动写文案
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500" />
            <span className="bg-gradient-to-r from-orange-400 to-sky-300 bg-clip-text text-transparent">
              查球星历史数据
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500" />
            <span className="bg-gradient-to-r from-orange-400 to-sky-300 bg-clip-text text-transparent">
              盯当日比分与新闻
            </span>
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            选择比赛或球员，系统自动抽取真实比分、分赛季数据、命中率与近期状态，按 9 种文体 × 5 种语气 × 3 种篇幅
            生成可直接发布的中文稿件，并可一键存入草稿箱。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/editor" className="btn btn-primary">
              ✍️ 开始生成文案
            </Link>
            <Link href="/scores" className="btn btn-ghost">
              🏀 查看当日比分
            </Link>
            <Link href="/players" className="btn btn-ghost">
              🔎 检索球星历史数据
            </Link>
          </div>
          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="文案模板" value="9" unit="种" />
            <Stat label="语气/篇幅" value="5 / 3" unit="组合" />
            <Stat label="赛季跨度" value="1979-今" unit="" />
            <Stat label="草稿箱" value={String(draftCount)} unit="条本机" />
          </dl>
        </div>
      </section>

      {/* 比分 */}
      <section className="space-y-4">
        <SectionHead
          title="最近比赛比分"
          desc={board ? `${formatDateZh(board.date)} · 共 ${board.games.length} 场 · ${sourceBadge}` : "正在加载…"}
          href="/scores"
          action="进入比分中心"
        />
        {!board ? (
          <p className="panel p-6 text-sm text-slate-400">正在抓取最新比分…</p>
        ) : board.games.length === 0 ? (
          <p className="panel p-6 text-sm text-slate-400">当前日期暂无比赛数据，可前往比分中心手动选择日期。</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {board.games.slice(0, 6).map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* 数据榜 */}
        <section className="space-y-4">
          <SectionHead
            title={`${seasonLabel(leaders?.season ?? season)} 赛季得分榜`}
            desc={`ESPN 联盟数据榜 · 前 ${Math.min(10, leaders?.rows.length ?? 0)} 名`}
            href="/players"
            action="检索球员"
          />
          <div className="panel table-wrap p-2">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>球员</th>
                  <th>球队</th>
                  <th>场次</th>
                  <th>得分</th>
                  <th>篮板</th>
                  <th>助攻</th>
                  <th>命中率</th>
                </tr>
              </thead>
              <tbody>
                {(leaders?.rows ?? []).slice(0, 10).map((row) => (
                  <tr key={row.espnId + row.rank}>
                    <td className="text-slate-500">{row.rank}</td>
                    <td className="font-semibold text-slate-100">{row.playerName}</td>
                    <td className="text-slate-400">{row.teamAbbr}</td>
                    <td>{row.gp ?? "—"}</td>
                    <td className="font-bold text-orange-300">{n1(row.pts)}</td>
                    <td>{n1(row.reb)}</td>
                    <td>{n1(row.ast)}</td>
                    <td>{row.fgp ? `${(row.fgp * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
                {(leaders?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      {leaders ? "数据源暂不可用" : "正在加载…"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* 新闻 */}
        <section className="space-y-4">
          <SectionHead title="NBA 相关新闻" desc="每 12 小时自动更新" href="/news" action="更多新闻" />
          <div className="panel divide-y divide-white/5">
            {news.map((item) => (
              <a
                key={item.id}
                href={item.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex gap-3 p-3 transition hover:bg-white/5"
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-lg object-cover opacity-90"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-[13px] font-semibold leading-snug text-slate-100">
                    {item.headline}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {relativeZh(item.publishedAt)}
                    {item.categories.length ? ` · ${item.categories.slice(0, 2).join(" / ")}` : ""}
                  </span>
                </span>
              </a>
            ))}
            {news.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">正在加载新闻…</p>
            ) : null}
          </div>
        </section>
      </div>

      {/* 球星快捷 */}
      <section className="space-y-4">
        <SectionHead title="常用球星" desc="点击查看分赛季历史数据与生涯档案" href="/players" action="全部检索" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAR_PICKS.map((star) => (
            <Link
              key={star.espnId}
              href={`/player?id=${star.espnId}`}
              className="panel group flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-orange-500/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://a.espncdn.com/i/headshots/nba/players/full/${star.espnId}.png`}
                alt={star.name}
                className="h-11 w-11 rounded-full bg-slate-800 object-cover"
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-slate-100 group-hover:text-orange-200">
                  {star.name}
                </span>
                <span className="block text-[11px] text-slate-500">{star.team}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="panel-soft px-3 py-2.5">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-lg font-bold text-white">
        {value}
        {unit ? <span className="ml-1 text-[11px] font-normal text-slate-500">{unit}</span> : null}
      </dd>
    </div>
  );
}

function SectionHead({
  title,
  desc,
  href,
  action,
}: {
  title: string;
  desc?: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-bold text-white">{title}</h2>
        {desc ? <p className="mt-0.5 text-xs text-slate-500">{desc}</p> : null}
      </div>
      <Link href={href} className="text-xs font-semibold text-orange-300 hover:text-orange-200">
        {action} →
      </Link>
    </div>
  );
}
