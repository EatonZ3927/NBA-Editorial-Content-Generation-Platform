"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearUserApiKey, getUserApiKey, saveUserApiKey } from "@/lib/copy/key-storage";

const DISMISS_STORAGE = "dashscope_key_dismissed";

/**
 * DashScope API Key 设置页（纯前端 BYOK）：
 * key 只保存在当前页面内存中；
 * 生成文案时由本浏览器直接请求 DashScope，不经过任何中转服务器。
 */
export default function KeySetup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    // 客户端挂载完成后读取浏览器存储，避免服务端与首帧不一致。
    queueMicrotask(() => {
      if (!active) return;
      setSaved(Boolean(getUserApiKey()));
      setReady(true);
    });
    const onPageHide = () => { setSaved(false); setValue(""); };
    window.addEventListener("pagehide", onPageHide);
    return () => { active = false; window.removeEventListener("pagehide", onPageHide); };
  }, []);

  const save = () => {
    try {
      saveUserApiKey(value);
    } catch (e) {
      setError(e instanceof Error && e.name === "Error" ? e.message : "浏览器会话存储不可用，请检查隐私设置");
      return;
    }
    setValue("");
    try { window.localStorage.removeItem(DISMISS_STORAGE); } catch { /* 不影响已保存的会话密钥 */ }
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
      clearUserApiKey();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setSaved(false);
    setValue("");
    setError(null);
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
            <span>✅ Key 仅保存在当前页面内存中</span>
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
            type="password"
            aria-label="DashScope API Key"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={saved ? "输入完整新 Key 以更换" : "sk-… 或 sk-ws-…（支持长密钥）"}
            className="field font-mono !text-[13px]"
            autoComplete="off"
            spellCheck={false}
          />
          {error ? <p className="text-[12px] text-rose-400">{error}</p> : null}
          <p className="text-[11px] leading-relaxed text-slate-500">
            Key 仅保存在当前页面内存中，不写入浏览器存储。刷新、关闭标签页或离开本站后需重新填写。
            站内切换页面可继续使用；清除按钮可立即移除。页面内运行的恶意脚本或浏览器扩展仍可能读取使用中的密钥。
            生成时仅通过 HTTPS 直接发送给 DashScope。没有 Key？{" "}
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
