import { Suspense } from "react";
import GameDetailView from "@/components/GameDetailView";

export const metadata = { title: "比赛详情 · NBA 编辑工作台" };

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <div className="panel flex items-center justify-center gap-3 p-12 text-sm text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
          正在加载…
        </div>
      }
    >
      <GameDetailView />
    </Suspense>
  );
}
