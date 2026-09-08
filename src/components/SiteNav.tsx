"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/", label: "首页", icon: "🏠" },
  { href: "/scores", label: "比分中心", icon: "🏀" },
  { href: "/players", label: "球星检索", icon: "🔎" },
  { href: "/news", label: "新闻中心", icon: "📰" },
  { href: "/editor", label: "文案工作台", icon: "✍️" },
  { href: "/drafts", label: "草稿箱", icon: "🗂️" },
];

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="site-header sticky top-0 z-40 border-b border-white/10 bg-[#060a14]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-300 text-lg shadow-lg shadow-orange-500/25">
            🏀
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-wide text-white">NBA 编辑工作台</span>
            <span className="block text-[11px] text-slate-400">文案生成 · 历史数据 · 比分与新闻</span>
          </span>
        </Link>
        <nav className="scroll-thin -mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-xl px-3 py-2 text-[13px] font-medium transition ${
                  active
                    ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                <span className="mr-1">{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
