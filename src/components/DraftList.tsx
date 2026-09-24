"use client";

import { useEffect, useState } from "react";
import { deleteDraft, listDrafts, type DraftRecord } from "@/lib/nba/store";

export type DraftItem = DraftRecord;

/**
 * 草稿箱（纯前端版）：草稿保存在本浏览器 localStorage，
 * 挂载时读取，删除即时生效；每个使用者的浏览器各自一份。
 */
export default function DraftList() {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const drafts = listDrafts();
    setItems(drafts);
    setOpenId(drafts[0]?.id ?? null);
    setReady(true);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const remove = (id: number) => {
    deleteDraft(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    flash("已删除");
  };

  if (!ready) {
    return <div className="panel p-10 text-center text-sm text-slate-500">正在读取本机草稿…</div>;
  }

  const copy = async (item: DraftItem) => {
    try {
      await navigator.clipboard.writeText(`${item.title}\n\n${item.body}`);
      flash("已复制全文");
    } catch {
      flash("复制失败");
    }
  };

  if (items.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-sm text-slate-300">草稿箱还是空的。</p>
        <p className="mt-2 text-xs text-slate-500">去「文案工作台」生成一篇，点击「保存草稿」即可在这里看到。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <article key={item.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold leading-snug text-white">{item.title}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                  {item.templateName ? <span className="chip">{item.templateName}</span> : null}
                  {item.tone ? <span className="chip">语气 {item.tone}</span> : null}
                  {item.length ? <span className="chip">篇幅 {item.length}</span> : null}
                  <span className="chip">{item.wordCount} 字</span>
                  <span className="chip">{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn btn-ghost !py-1.5 !text-xs" onClick={() => setOpenId(open ? null : item.id)}>
                  {open ? "收起" : "展开"}
                </button>
                <button className="btn btn-ghost !py-1.5 !text-xs" onClick={() => copy(item)}>
                  📋 复制
                </button>
                <button
                  className="btn btn-ghost !py-1.5 !text-xs hover:!border-rose-500/60 hover:!text-rose-300"
                  onClick={() => remove(item.id)}
                >
                  🗑️ 删除
                </button>
              </div>
            </div>

            {open ? (
              <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
                <pre className="scroll-thin max-h-96 overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">
                  {item.body}
                </pre>
                {item.tags && item.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span key={tag} className="chip">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {item.sourceSummary ? (
                  <p className="text-[11px] text-slate-500">数据来源：{item.sourceSummary}</p>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-orange-500 px-5 py-2 text-[13px] font-bold text-slate-900 shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
