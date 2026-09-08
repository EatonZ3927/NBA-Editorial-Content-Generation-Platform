import CopyStudio from "@/components/CopyStudio";
import { getRecentBoard, getScoreboard } from "@/lib/nba/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "文案工作台 · NBA 编辑工作台" };

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ espnId?: string; gameId?: string; gameDate?: string; newsId?: string; template?: string }>;
}) {
  const sp = await searchParams;
  const board = sp.gameDate
    ? await getScoreboard(sp.gameDate)
    : await getRecentBoard().catch(() => null);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-white">✍️ 文案工作台</h1>
        <p className="text-sm text-slate-400">
          选好素材 → 挑文体与语气 → 一键生成中文稿件。所有比分、生涯数据、命中率均实时抓取并附引用，方便发布前核对。
        </p>
      </header>
      <CopyStudio
        initial={{
          ...sp,
          gameDate: board?.date,
          games: board?.games ?? [],
        }}
      />
    </div>
  );
}
