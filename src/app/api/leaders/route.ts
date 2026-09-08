import { currentNbaSeasonYear } from "@/lib/nba/espn";
import { getLeagueLeaders } from "@/lib/nba/service";
import type { StatCategoryKey } from "@/lib/nba/nbaStats";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season") ?? currentNbaSeasonYear());
  const stat = (url.searchParams.get("stat") ?? "pts") as StatCategoryKey;
  try {
    const data = await getLeagueLeaders(
      Number.isFinite(season) ? season : currentNbaSeasonYear(),
      stat,
    );
    return Response.json(data);
  } catch (error) {
    return Response.json({ rows: [], source: "offline", error: (error as Error).message });
  }
}
