import DraftList from "@/components/DraftList";

export const metadata = { title: "草稿箱 · NBA 编辑工作台" };

export default function DraftsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-white">🗂️ 草稿箱</h1>
        <p className="text-sm text-slate-400">
          草稿保存在你自己的浏览器中（localStorage），可展开查看全文、复制或删除。
        </p>
      </header>
      <DraftList />
    </div>
  );
}
