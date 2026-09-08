import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import SiteNav from "@/components/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "NBA 编辑工作台｜文案生成 · 球星历史数据 · 比分与新闻",
  description:
    "面向体育编辑的 NBA 内容生产工具：自动生成赛事文案、检索球星历史数据、查看当日比分与相关新闻。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {'try{document.documentElement.dataset.theme=localStorage.getItem("theme")==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}'}
        </Script>
      </head>
      <body className="antialiased">
        <SiteNav />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-center text-xs leading-relaxed text-slate-500 sm:px-6">
          <p>
            数据源：比分与新闻经 nba-data 技能抓取（ESPN 公开数据），球员档案来自 ESPN 公开接口，历史数据榜来自 NBA 官方联盟数据。
            生成内容为模板辅助创作，发布前请人工核对。
          </p>
          <p className="mt-1">NBA 编辑工作台 · 仅用于内容创作辅助，非 NBA 官方产品</p>
        </footer>
      </body>
    </html>
  );
}
