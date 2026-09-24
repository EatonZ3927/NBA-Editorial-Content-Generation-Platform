import { Suspense } from "react";
import PlayerPageClient from "@/components/PlayerPageClient";

export const metadata = { title: "球员详情 · NBA 编辑工作台" };

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="panel flex items-center justify-center gap-3 p-12 text-sm text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
          正在加载…
        </div>
      }
    >
      <PlayerPageClient />
    </Suspense>
  );
}
