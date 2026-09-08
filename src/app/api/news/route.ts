import { getNews } from "@/lib/nba/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(60, Math.max(5, Number(url.searchParams.get("limit") ?? 30)));
  try {
    const news = await getNews(limit);
    return Response.json(news);
  } catch (error) {
    return Response.json({ items: [], source: "offline", error: (error as Error).message });
  }
}
