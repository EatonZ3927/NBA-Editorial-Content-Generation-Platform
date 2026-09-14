"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * 日间 / 夜间切换按钮（固定在右上角导航栏）。
 * 首帧主题由 layout.tsx 的内联脚本在绘制前决定（手动选择 > 时段默认），
 * 这里只同步按钮状态；用户点击后把显式选择持久化到 localStorage("theme")，
 * globals.css 依据 <html data-theme> 切换整套配色。
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      // 忽略持久化失败
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "切换到日间模式" : "切换到夜间模式"}
      title={theme === "dark" ? "切换到日间模式" : "切换到夜间模式"}
      className="btn btn-ghost shrink-0 !px-2.5 !py-1.5 !text-xs"
    >
      {theme === "dark" ? "☀️ 日间" : "🌙 夜间"}
    </button>
  );
}
