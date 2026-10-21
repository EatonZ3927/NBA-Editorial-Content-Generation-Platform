"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 单次请求串行执行；离开页面取消后续更新，回到前台强制补抓。 */
export function useLiveResult<T extends { error?: string; incomplete?: boolean }>(
  key: string,
  load: (force: boolean) => Promise<T>,
  refreshMs: (result: T) => number | null,
) {
  const [state, setState] = useState<{ key: string; result: T } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const action = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    let busy = false;
    let forcePending = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (force = false) => {
      if (!alive) return;
      if (busy) { forcePending ||= force; return; }
      busy = true;
      clearTimeout(timer);
      await Promise.resolve();
      if (!alive) { busy = false; return; }
      setRefreshing(true);
      try {
        const result = await load(force);
        if (!alive) return;
        setState({ key, result });
        retries = result.error || result.incomplete ? retries + 1 : 0;
        const delay = refreshMs(result);
        // 上游一直缺统计或断网时最多自动补抓五次，仍可手动刷新或回前台重试。
        if (delay !== null && retries < 6) {
          timer = setTimeout(() => { if (!document.hidden) void run(); }, delay);
        }
      } finally {
        busy = false;
        if (alive) {
          setRefreshing(false);
          if (forcePending) { forcePending = false; void run(true); }
        }
      }
    };
    const refresh = () => { retries = 0; void run(true); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    action.current = refresh;
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    void run();
    return () => {
      alive = false;
      action.current = null;
      clearTimeout(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, load, refreshMs]);

  const refresh = useCallback(() => action.current?.(), []);
  return { result: state?.key === key ? state.result : null, refreshing, refresh };
}
