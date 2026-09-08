"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Hit = {
  espnId: string;
  name: string;
  zhName?: string | null;
  team?: string | null;
  headshot?: string | null;
};

export default function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/players?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { results?: Hit[]; error?: string };
        setHits(data.results ?? []);
        if (data.error) setError(data.error);
      } catch {
        setError("搜索请求失败，请稍后重试");
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <label className="text-xs font-semibold text-slate-400">输入中英文球员姓名（如 Curry / 字母哥 / 东契奇）</label>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Stephen Curry、LeBron James、Wembanyama…"
            className="field"
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {loading
            ? "检索中…"
            : query.trim().length === 0
              ? "默认展示常用球星，输入姓名后自动检索 ESPN 球员库"
              : `共 ${hits.length} 条结果`}
        </p>
        {error ? <p className="mt-1 text-[11px] text-rose-400">{error}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hits.map((hit) => (
          <Link
            key={hit.espnId}
            href={`/players/${hit.espnId}`}
            className="panel group flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-orange-500/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hit.headshot || `https://a.espncdn.com/i/headshots/nba/players/full/${hit.espnId}.png`}
              alt={hit.name}
              className="h-12 w-12 rounded-full bg-slate-800 object-cover"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-slate-100 group-hover:text-orange-200">
                {hit.zhName ? `${hit.zhName} · ${hit.name}` : hit.name}
              </span>
              <span className="block truncate text-[11px] text-slate-500">{hit.team || "NBA"}</span>
            </span>
            <span className="text-slate-600 group-hover:text-orange-300">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
