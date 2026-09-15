"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import CalendarPicker from "@/components/CalendarPicker";
import { formatDateZh, shiftDate } from "@/lib/nba/dates";

export default function DateNavigator({ date, basePath = "/scores" }: { date: string; basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const go = (next: string) => {
    start(() => {
      const query = new URLSearchParams(params.toString());
      query.set("date", next);
      router.push(`${basePath}?${query.toString()}`);
    });
  };

  return (
    <div className="panel flex flex-wrap items-center gap-2 p-2">
      <button className="btn btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={() => go(shiftDate(date, -1))}>
        ← 前一天
      </button>
      <CalendarPicker date={date} onSelect={go} />
      <button className="btn btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={() => go(shiftDate(date, 1))}>
        后一天 →
      </button>
      <button className="btn btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={() => go(new Date().toISOString().slice(0, 10))}>
        今天
      </button>
      <span className="ml-auto text-xs text-slate-400">
        {pending ? "加载中…" : formatDateZh(date)}
      </span>
    </div>
  );
}
