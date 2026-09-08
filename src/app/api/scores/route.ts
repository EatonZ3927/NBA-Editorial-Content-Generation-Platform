import { normalizeDate } from "@/lib/nba/dates";
import { getRecentBoard, getScoreboard } from "@/lib/nba/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("date");
  try {
    if (!requested) {
      const recent = await getRecentBoard();
      return Response.json(recent);
    }
    const board = await getScoreboard(normalizeDate(requested));
    return Response.json(board);
  } catch (error) {
    return Response.json(
      {
        date: normalizeDate(requested),
        games: [],
        source: "offline",
        error: (error as Error).message,
      },
      { status: 200 },
    );
  }
}
