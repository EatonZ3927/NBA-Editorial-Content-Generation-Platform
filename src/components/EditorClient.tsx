"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import CopyStudio, { type CopyStudioInitial } from "@/components/CopyStudio";
import { getRecentBoard, getScoreboard } from "@/lib/nba/store";

/**
 * 文案工作台入口（纯前端版）：
 * 从 URL 读取 espnId / gameId / gameDate / newsId / template，
 * 比赛列表由本浏览器直连 ESPN 抓取后再挂载 CopyStudio（initial 只在挂载时读取一次）。
 */
export default function EditorClient() {
  const params = useSearchParams();
  const espnId = params.get("espnId") ?? undefined;
  const gameId = params.get("gameId") ?? undefined;
  const gameDate = params.get("gameDate") ?? undefined;
  const newsId = params.get("newsId") ?? undefined;
  const template = params.get("template") ?? undefined;

  const [initial, setInitial] = useState<CopyStudioInitial | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const board = gameDate
        ? await getScoreboard(gameDate).catch(() => null)
        : await getRecentBoard().catch(() => null);
      if (!alive) return;
      setInitial({
        espnId,
        gameId,
        gameDate: board?.date ?? gameDate,
        newsId,
        template,
        games: board?.games ?? [],
      });
    })();
    return () => {
      alive = false;
    };
    // 仅在 URL 参数变化时重取
  }, [espnId, gameId, gameDate, newsId, template]);

  if (!initial) {
    return (
      <div className="panel flex items-center justify-center gap-3 p-10 text-sm text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        正在准备工作台数据…
      </div>
    );
  }
  return <CopyStudio initial={initial} />;
}
