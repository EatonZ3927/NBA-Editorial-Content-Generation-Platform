import type { Metadata } from "next";
import type { ReactNode } from "react";
import KeyGate from "@/components/KeyGate";
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
        {/* 主题必须在首帧绘制前确定：
            1. 用原生 <script> 而非 next/script——后者在 App Router 下会延迟到水合阶段执行，导致先深后浅的闪烁；
            2. 用户手动选择过（localStorage.theme）则尊重选择；未选择过则按本机时间 9:00-18:00 默认日间，其余时段夜间。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){var h=new Date().getHours();t=h>=9&&h<18?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}',
          }}
        />
      </head>
      <body className="antialiased">
        <KeyGate />
        <SiteNav />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-center text-xs leading-relaxed text-slate-500 sm:px-6">
          <p>
            数据源：比分、新闻、联盟数据榜与球员历史数据均由你的浏览器直连 ESPN 公开接口获取。
            AI 文案由你自己配置的 DashScope Key 驱动，生成内容发布前请人工核对。
          </p>
          <p className="mt-1">NBA 编辑工作台 · 仅用于内容创作辅助，非 NBA 官方产品</p>
        </footer>
      </body>
    </html>
  );
}
