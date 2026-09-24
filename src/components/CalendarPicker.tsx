"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 月历弹窗日期选择器：点击触发按钮后弹出一个小日历窗口，
 * 带打开/收起动画；选中日期后回调 onSelect 并自动关闭。
 * 所有日期计算使用 UTC，与服务端 YYYY-MM-DD 口径一致。
 *
 * 弹窗通过 React Portal 挂载到 document.body 并使用 position: fixed 定位 +
 * 顶层 z-index，确保始终渲染在页面最上层（父级 .panel 的 backdrop-filter
 * 会形成层叠上下文，普通 absolute + z-index 会被其囚禁而压在下层）。
 * 应用中所有月历小窗（比分中心、文案工作台等）共用本组件，行为自动同步。
 */

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const CLOSE_ANIMATION_MS = 140;
const POPOVER_WIDTH = 264;
const ESTIMATED_HEIGHT = 340;
const VIEWPORT_MARGIN = 8;
/** 弹窗层级：高于站点所有 sticky/面板层级，保证月历永远在最上层 */
const POPOVER_Z_INDEX = 1000;

function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map((v) => Number(v));
  return { y: y || 1970, m: (m || 1) - 1, d: d || 1 };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function CalendarPicker({
  date,
  onSelect,
  label = "选择日期",
}: {
  date: string;
  onSelect: (date: string) => void;
  label?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [view, setView] = useState(() => {
    const { y, m } = parseDate(date);
    return { y, m };
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setPos(null);
    }, CLOSE_ANIMATION_MS);
  }, []);

  // 依据触发按钮的视口位置计算弹窗的 fixed 坐标：
  // 优先放在按钮下方，下方空间不足且上方能放下时翻到上方；水平方向夹取在视口内。
  const updatePosition = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pop = popRef.current;
    const width = pop?.offsetWidth || POPOVER_WIDTH;
    const height = pop?.offsetHeight || ESTIMATED_HEIGHT;
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));
    let top = rect.bottom + VIEWPORT_MARGIN;
    const fitsBelow = top + height <= window.innerHeight - VIEWPORT_MARGIN;
    const fitsAbove = rect.top - VIEWPORT_MARGIN - height >= VIEWPORT_MARGIN;
    if (!fitsBelow && fitsAbove) {
      top = rect.top - VIEWPORT_MARGIN - height;
    }
    setPos({ left, top });
  }, []);

  const toggle = () => {
    if (open) {
      close();
    } else {
      const { y, m } = parseDate(date);
      setView({ y, m });
      setOpen(true);
    }
  };

  // 弹窗挂载后（含切换月份导致高度变化时）测量真实尺寸并定位
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, view, updatePosition]);

  // 打开期间跟随页面滚动 / 视口缩放重新定位，保持与按钮贴合
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  // 点击外部 / 按 Escape 关闭（弹窗在 Portal 中，需要同时判断 popRef）
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  };

  const pick = (day: number) => {
    onSelect(`${view.y}-${pad(view.m + 1)}-${pad(day)}`);
    close();
  };

  // 周一开头：getUTCDay() 周日=0 → 周一=0
  const firstWeekday = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7;
  const totalDays = daysInMonth(view.y, view.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const selected = parseDate(date);
  const isSelected = (day: number) =>
    selected.y === view.y && selected.m === view.m && selected.d === day;
  const isToday = (day: number) => {
    const t = parseDate(today);
    return t.y === view.y && t.m === view.m && t.d === day;
  };

  const popover = open ? (
    <div
      ref={popRef}
      role="dialog"
      aria-label="日历"
      className={`calendar-popover panel w-[264px] p-3 shadow-2xl shadow-black/40 ${
        closing ? "calendar-popover-leave" : ""
      }`}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: POPOVER_Z_INDEX,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="btn btn-ghost !rounded-lg !px-2 !py-1 !text-xs"
          aria-label="上个月"
        >
          ‹
        </button>
        <span className="text-[13px] font-bold text-slate-100">
          {view.y}年{view.m + 1}月
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="btn btn-ghost !rounded-lg !px-2 !py-1 !text-xs"
          aria-label="下个月"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-500">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) =>
          day === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <button
              key={day}
              type="button"
              onClick={() => pick(day)}
              className={`h-8 rounded-lg text-[12px] tabular-nums transition ${
                isSelected(day)
                  ? "bg-orange-500 font-bold text-slate-900 shadow shadow-orange-500/40"
                  : isToday(day)
                    ? "font-bold text-orange-300 ring-1 ring-orange-500/50 hover:bg-white/10"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {day}
            </button>
          ),
        )}
      </div>

      <div className="mt-2 flex justify-end border-t border-white/5 pt-2">
        <button
          type="button"
          onClick={() => {
            onSelect(today);
            close();
          }}
          className="text-[11px] font-semibold text-orange-300 hover:text-orange-200"
        >
          回到今天
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={label}
        className="btn btn-ghost !px-2.5 !py-1.5 !text-xs font-semibold tabular-nums"
      >
        📅 {date}
      </button>

      {popover && typeof document !== "undefined" ? createPortal(popover, document.body) : null}
    </div>
  );
}
