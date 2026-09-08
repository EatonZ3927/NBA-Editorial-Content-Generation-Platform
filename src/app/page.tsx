import Link from "next/link";
import GameCard from "@/components/GameCard";
import { currentNbaSeasonYear, seasonLabel } from "@/lib/nba/espn";
import { getLeagueLeaders, getNews, getRecentBoard } from "@/lib/nba/service";
import { STAR_PICKS } from "@/lib/nba/teams";
import { formatDateZh, relativeZh } from "@/lib/nba/dates";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function n1(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10);
}

export default async function HomePage() {
  const season = currentNbaSeasonYear();
  const [board, news, leaders, recentDrafts] = await Promise.all([
    getRecentBoard(),
    getNews(6).catch(() => ({ items: [], source: "offline" as const, fetchedAt: "" })),
    getLeagueLeaders(season, "pts").catch(() => ({ rows: [], source: "offline" as const })),
    db.select().from(drafts).orderBy(desc(drafts.createdAt)).limit(4).catch(() => []),
  ]);

  const sourceBadge =
    board.source === "live" ? "实时数据" : board.source === "cache" ? "本地缓存" : "离线";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="panel relative overflow-hidden p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative">
          <span className="chip">Sports Desk · 编辑效率工具</span>
          <h1 className="mt-4 max-w-3xl text-[clamp(1.8rem,4vw,2.9rem)] font-black leading-tight text-white">
            一站式 NBA 内容工作台：
            <span className="bg-gradient-to-r from-orange-400 to-sky-300 bg-clip-text text-transparent">
              自动写文案、查球星历史数据、盯当日比分与新闻
            </span>
          </h1>
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
            <Stat label="草稿箱" value={String(recentDrafts.length)} unit="条最新" />
          </dl>
        </div>
      </section>

      {/* 比分 */}
      <section className="space-y-4">
        <SectionHead
          title="最近比赛比分"
          desc={`${formatDateZh(board.date)} · 共 ${board.games.length} 场 · ${sourceBadge}`}
          href="/scores"
          action="进入比分中心"
        />
        {board.games.length === 0 ? (
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
            title={`${seasonLabel(season)} 赛季得分榜`}
            desc={`NBA 官方联盟数据 · 前 ${Math.min(10, leaders.rows.length)} 名`}
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
                {leaders.rows.slice(0, 10).map((row) => (
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
                {leaders.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      数据源暂不可用
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* 新闻 */}
        <section className="space-y-4">
          <SectionHead title="NBA 相关新闻" desc="ESPN 实时抓取" href="/news" action="更多新闻" />
          <div className="panel divide-y divide-white/5">
            {news.items.map((item) => (
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
            {news.items.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">暂无新闻数据</p>
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
              href={`/players/${star.espnId}`}
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
