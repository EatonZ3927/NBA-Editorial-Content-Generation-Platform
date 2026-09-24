"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 进门拦截：首次打开应用且既未保存 Key 也未选择跳过时，
 * 先跳转到 /setup-key 引导设置 DashScope Key（只出现一次）。
 */
export default function KeyGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/setup-key") return;
    try {
      const key = window.localStorage.getItem("dashscope_api_key");
      const dismissed = window.localStorage.getItem("dashscope_key_dismissed");
      if (!key && !dismissed) router.replace("/setup-key");
    } catch {
      // localStorage 不可用时不拦截
    }
  }, [pathname, router]);

  return null;
}
