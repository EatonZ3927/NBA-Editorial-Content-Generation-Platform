import Link from "next/link";
import { getNews } from "@/lib/nba/service";
import { relativeZh } from "@/lib/nba/dates";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const news = await getNews(40).catch(() => ({ items: [], source: "offline" as const, fetchedAt: "" }));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-white">📰 NBA 新闻中心</h1>
        <p className="text-sm text-slate-400">
          每次打开或刷新本页都会经 nba-data 技能实时抓取约过去 24 小时的最新资讯；已抓取的新闻在最近 10 天内持续显示，过期自动移除，可直接改写为中文快讯通稿。
          数据源 {news.source === "live" ? "nba-data 实时" : "本地缓存"} · 共 {news.items.length} 条
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {news.items.map((item) => (
          <article key={item.id} className="panel flex flex-col overflow-hidden">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" className="h-40 w-full object-cover opacity-90" />
            ) : null}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h2 className="line-clamp-3 text-[14px] font-bold leading-snug text-slate-100">{item.headline}</h2>
              <p className="line-clamp-3 text-[12px] leading-relaxed text-slate-400">{item.description}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 text-[10px]">
                {item.categories.slice(0, 3).map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-3 text-[11px] text-slate-500">
                <span>{relativeZh(item.publishedAt)}</span>
                <span className="flex gap-2">
                  <Link
                    href={`/editor?newsId=${encodeURIComponent(item.id)}&template=news-brief`}
                    className="font-semibold text-orange-300 hover:text-orange-200"
                  >
                    改写成快讯
                  </Link>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-slate-200">
                      原文 ↗
                    </a>
                  ) : null}
                </span>
              </div>
            </div>
          </article>
        ))}
        {news.items.length === 0 ? (
          <p className="panel p-8 text-center text-sm text-slate-500">暂无新闻数据</p>
        ) : null}
      </div>
    </div>
  );
}
