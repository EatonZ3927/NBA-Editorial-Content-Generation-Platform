import { Suspense } from "react";
import EditorClient from "@/components/EditorClient";

export const metadata = { title: "文案工作台 · NBA 编辑工作台" };

export default function EditorPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-white">✍️ 文案工作台</h1>
        <p className="text-sm text-slate-400">
          选好素材 → 挑文体与语气 → 一键生成中文稿件。所有比分、生涯数据、命中率均实时抓取并附引用，方便发布前核对。
        </p>
      </header>
      <Suspense
        fallback={
          <div className="panel flex items-center justify-center gap-3 p-10 text-sm text-slate-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
            正在准备工作台数据…
          </div>
        }
      >
        <EditorClient />
      </Suspense>
    </div>
  );
}
