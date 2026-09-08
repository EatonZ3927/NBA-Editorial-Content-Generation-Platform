import { searchPlayers } from "@/lib/nba/service";
import { STAR_PICKS } from "@/lib/nba/teams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return Response.json({ query: "", results: STAR_PICKS.map((p) => ({ ...p, zhName: null, headshot: null, cached: false })) });
  }
  try {
    const results = await searchPlayers(q);
    return Response.json({ query: q, results });
  } catch (error) {
    return Response.json({ query: q, results: [], error: (error as Error).message });
  }
}
