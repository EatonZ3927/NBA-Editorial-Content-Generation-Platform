"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PlayerProfileView from "@/components/PlayerProfileView";

/** 读取 ?id=<espnId> 并渲染球员详情；ID 缺失/非法时给出返回入口 */
export default function PlayerPageClient() {
  const params = useSearchParams();
  const espnId = params.get("id") ?? "";

  if (!/^\d+$/.test(espnId)) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-sm text-slate-300">缺少有效的球员 ID。</p>
        <p className="mt-2 text-xs text-slate-500">
          请返回{" "}
          <Link href="/players" className="text-orange-300 hover:text-orange-200">
            球星检索
          </Link>{" "}
          选择一位球员。
        </p>
      </div>
    );
  }
  return <PlayerProfileView espnId={espnId} />;
}
