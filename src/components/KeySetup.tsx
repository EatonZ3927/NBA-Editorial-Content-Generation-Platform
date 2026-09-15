"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const KEY_STORAGE = "dashscope_api_key";
const DISMISS_STORAGE = "dashscope_key_dismissed";

export function getUserApiKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

/**
 * DashScope API Key 设置页（纯前端 BYOK）：
 * key 只保存在用户自己的浏览器 localStorage 中；
 * 生成文案时由本浏览器直接请求 DashScope，不经过任何中转服务器。
 */
export default function KeySetup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const existing = window.localStorage.getItem(KEY_STORAGE);
      if (existing) setSaved(existing);
    } catch {
      // localStorage 不可用时按未设置处理
    }
    setReady(true);
  }, []);

  const save = () => {
    const key = value.trim();
    if (!/^sk-[A-Za-z0-9-]{8,64}$/.test(key)) {
      setError("Key 格式不正确：应以 sk- 开头，长度为 11~67 位（字母、数字、短横线）");
      return;
    }
    try {
      window.localStorage.setItem(KEY_STORAGE, key);
      window.localStorage.removeItem(DISMISS_STORAGE);
    } catch {
      setError("浏览器存储不可用，请检查隐私模式设置");
      return;
    }
    router.replace("/");
  };

  const skip = () => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE, "1");
    } catch {
      // 忽略
    }
    router.replace("/");
  };

  const clear = () => {
    try {
      window.localStorage.removeItem(KEY_STORAGE);
    } catch {
      // 忽略
    }
    setSaved(null);
    setValue("");
  };

  if (!ready) return null;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center pt-10">
      <div className="panel w-full space-y-5 p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-300 text-2xl shadow-lg shadow-orange-500/25">
            🔑
          </span>
          <h1 className="text-xl font-black text-white">设置 DashScope API Key</h1>
          <p className="text-[13px] leading-relaxed text-slate-400">
            AI 文案生成由阿里云 DashScope 驱动。填入你自己的 Key 后即可使用；
            比分、新闻、球员数据等浏览功能无需 Key。
          </p>
        </div>

        {saved ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-[13px] font-medium text-emerald-950">
            <span>✅ 已保存 Key</span>
            <button
              type="button"
              onClick={clear}
              className="text-[12px] text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
            >
              清除
            </button>
          </div>
        ) : null}

        <div className="space-y-2">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={saved ? "输入新 Key 以更换" : "sk-xxxxxxxxxxxxxxxx"}
            className="field font-mono !text-[13px]"
            autoComplete="off"
            spellCheck={false}
          />
          {error ? <p className="text-[12px] text-rose-400">{error}</p> : null}
          <p className="text-[11px] leading-relaxed text-slate-500">
            Key 仅保存在你自己的浏览器（localStorage）中；点击「生成文案」时由你的浏览器直接请求
            DashScope，不经过任何中转服务器，本站也不存储。没有 Key？{" "}
            <a
              href="https://bailian.console.aliyun.com/?apiKey=1#/api-key"
              target="_blank"
              rel="noreferrer"
              className="text-orange-300 underline underline-offset-2 hover:text-orange-200"
            >
              前往阿里云百炼控制台免费获取 ↗
            </a>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button type="button" onClick={save} className="btn btn-primary w-full">
            保存并进入工作台
          </button>
          <button type="button" onClick={skip} className="btn btn-ghost w-full !text-[13px]">
            暂不设置，先随便逛逛 →
          </button>
        </div>
      </div>
    </div>
  );
}
