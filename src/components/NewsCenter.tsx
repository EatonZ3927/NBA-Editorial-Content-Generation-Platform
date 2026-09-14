"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { relativeZh } from "@/lib/nba/dates";
import { getNews, refreshNewsForUser } from "@/lib/nba/store";
import type { NewsItem } from "@/lib/nba/types";

/** 与服务端 newsContentKey 一致的归一化，用于统计本次刷新「新增条数」 */
function contentKey(item: Pick<NewsItem, "headline" | "description">): string {
  const n = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${n(item.headline)}|${n(item.description)}`;
}

/** ISO 时间 → 北京时间 MM-DD HH:mm */
function fmtBeijing(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const b = new Date(d.getTime() + 8 * 3600 * 1000);
  const mm = String(b.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(b.getUTCDate()).padStart(2, "0");
  const hh = String(b.getUTCHours()).padStart(2, "0");
  const mi = String(b.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

/**
 * 新闻中心（纯前端版）：
 * 打开页面时由本浏览器执行 12 小时自动机制（北京时间 00:00 / 12:00 边界起），
 * 库存在本浏览器 localStorage，10 天有效期内持续显示；
 * 右上角「刷新」按钮触发手动实时抓取，结果只更新当前页面预览，不写本地库。
 */
export default function NewsCenter() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [source, setSource] = useState<string>("");
  const [nextAuto, setNextAuto] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 首次打开：执行自动机制（槽位过期才实时抓取，否则读本浏览器库存）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getNews(40);
        if (!alive) return;
        setItems(data.items);
        setSource(data.source);
        setNextAuto(data.nextAutoRefreshAt ?? "");
      } catch {
        // 保持空列表
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 提示气泡 6 秒后自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setNotice(null);
    try {
      const data = await refreshNewsForUser(40);
      const before = new Set(items.map(contentKey));
      const added = data.items.filter((item) => !before.has(contentKey(item))).length;
      setItems(data.items);
      setSource(data.source);
      if (data.nextAutoRefreshAt) setNextAuto(data.nextAutoRefreshAt);
      setNotice(added > 0 ? `新增 ${added} 条（仅本页预览）` : "已是最新");
    } catch {
      setNotice("刷新失败，请检查网络");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-white">📰 NBA 新闻中心</h1>
          <p className="text-sm text-slate-400">
            每 12 小时自动更新一次（北京时间 00:00 / 12:00 起），实时收录 ESPN 最新资讯。
          </p>
          <p className="text-sm text-slate-400">
            已抓取的新闻在最近 10 天内持续显示，过期自动移除，可直接改写为中文快讯通稿。
          </p>
          <p className="text-xs text-slate-500">
            数据源 {source === "live" ? "ESPN 实时" : source === "cache" ? "本机缓存" : "…"} · 共 {items.length} 条
            {nextAuto ? ` · 下次自动更新 ${fmtBeijing(nextAuto)}（北京时间）` : ""}
          </p>
        </div>
        <div className="relative shrink-0 self-start">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="btn btn-primary shrink-0 !px-3.5 !py-1.5 !text-xs"
            title="手动实时抓取最新新闻，仅更新你当前看到的页面"
          >
            {refreshing ? "⏳ 抓取中…" : "🔄 刷新"}
          </button>
          {notice ? (
            <p className="panel-soft absolute right-0 top-full z-20 mt-1.5 w-max max-w-52 px-2.5 py-1.5 text-[11px] leading-snug text-slate-400 shadow-lg">
              {notice}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
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
        {items.length === 0 ? (
          <p className="panel p-8 text-center text-sm text-slate-500">
            {loading ? "正在抓取最新新闻…" : "暂无新闻数据"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
