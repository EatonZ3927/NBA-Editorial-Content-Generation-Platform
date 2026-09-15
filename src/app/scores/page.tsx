import { Suspense } from "react";
import ScoresBoard from "@/components/ScoresBoard";

export const metadata = { title: "比分中心 · NBA 编辑工作台" };

export default function ScoresPage() {
  return (
    <Suspense fallback={<div className="panel p-8 text-center text-sm text-slate-400">正在加载…</div>}>
      <ScoresBoard />
    </Suspense>
  );
}
