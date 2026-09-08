import { desc } from "drizzle-orm";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import DraftList, { type DraftItem } from "@/components/DraftList";

export const dynamic = "force-dynamic";
export const metadata = { title: "草稿箱 · NBA 编辑工作台" };

export default async function DraftsPage() {
  const rows = await db.select().from(drafts).orderBy(desc(drafts.createdAt)).limit(100).catch(() => []);
  const items: DraftItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    templateName: row.templateName,
    tone: row.tone,
    length: row.length,
    tags: (row.tags as string[] | null) ?? [],
    wordCount: row.wordCount,
    sourceSummary: row.sourceSummary,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-white">🗂️ 草稿箱</h1>
        <p className="text-sm text-slate-400">共 {items.length} 篇已保存稿件，可展开查看全文、复制或删除。</p>
      </header>
      <DraftList initial={items} />
    </div>
  );
}
