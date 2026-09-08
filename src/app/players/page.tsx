import PlayerSearch from "@/components/PlayerSearch";

export const metadata = { title: "球星检索 · NBA 编辑工作台" };

export default function PlayersPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-white">🔎 球星历史数据检索</h1>
        <p className="text-sm text-slate-400">
          自动抓取 ESPN 球员档案与 NBA 官方联盟数据榜，生成从新秀赛季到本赛季的分赛季数据、生涯场均、命中率曲线与近况。
        </p>
      </header>
      <PlayerSearch />
    </div>
  );
}
