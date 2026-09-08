"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * 日间 / 夜览切换按钮（固定在右上角导航栏）。
 * 主题持久化到 localStorage("theme")，并写到 <html data-theme>，
 * globals.css 依据该属性切换整套配色。
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    let initial: Theme = "dark";
    try {
      initial = window.localStorage.getItem("theme") === "light" ? "light" : "dark";
    } catch {
      // localStorage 不可用时保持默认夜览
    }
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
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
      aria-label={theme === "dark" ? "切换到日间模式" : "切换到夜览模式"}
      title={theme === "dark" ? "切换到日间模式" : "切换到夜览模式"}
      className="btn btn-ghost shrink-0 !px-2.5 !py-1.5 !text-xs"
    >
      {theme === "dark" ? "☀️ 日间" : "🌙 夜览"}
    </button>
  );
}
