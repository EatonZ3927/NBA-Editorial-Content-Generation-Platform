import { getPlayerProfile } from "@/lib/nba/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ espnId: string }> },
) {
  const { espnId } = await params;
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  try {
    const profile = await getPlayerProfile(espnId, { forceRefresh: refresh });
    return Response.json(profile);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
