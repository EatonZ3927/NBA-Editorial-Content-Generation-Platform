const KEY_STORAGE = "dashscope_api_key";
let activeKey = "";
let lifecycleBound = false;

function purgeLegacyStorage(): void {
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try { window[name].removeItem(KEY_STORAGE); } catch { /* 不向不可用的存储写入密钥 */ }
  }
}

/** 只做输入完整性检查；实际有效性由服务商鉴权确认，不限定旧版密钥长度。 */
export function normalizeApiKey(value: string): string {
  const key = value.trim();
  if (key.length < 11 || !/^sk-[\x21-\x7e]+$/.test(key) || /\*/.test(key)) {
    throw new Error("请输入完整 API Key（支持 sk-、sk-ws- 长密钥），不要包含空白、中文或掩码。");
  }
  return key;
}

export function getUserApiKey(): string {
  if (typeof window === "undefined") return "";
  purgeLegacyStorage();
  return activeKey;
}

export function saveUserApiKey(value: string): void {
  const key = normalizeApiKey(value);
  if (typeof window === "undefined") throw new Error("请在浏览器页面中设置密钥。");
  purgeLegacyStorage();
  activeKey = key;
  if (!lifecycleBound) {
    // 离开文档时清除，包含进入往返缓存的情况；不依赖该事件清理持久存储。
    window.addEventListener("pagehide", () => { activeKey = ""; });
    lifecycleBound = true;
  }
}

export function clearUserApiKey(): void {
  activeKey = "";
  // 两个存储均尝试清理，即使其中一个不可用。
  let failed = false;
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try { window[name].removeItem(KEY_STORAGE); } catch { failed = true; }
  }
  if (failed) throw new Error("未能完全清除密钥，请检查浏览器存储设置。");
}
