import { runGenerate, type GenerateInput } from "@/lib/copy/generate";
import {
  LENGTHS,
  TEMPLATES,
  TONES,
  type LengthId,
  type TemplateId,
  type ToneId,
} from "@/lib/copy/engine";
import { isAiConfigured } from "@/lib/copy/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    templates: TEMPLATES,
    tones: TONES,
    lengths: LENGTHS,
    aiConfigured: isAiConfigured(),
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const template = (TEMPLATES.find((t) => t.id === payload.template)?.id ?? "game-recap") as TemplateId;
  const tone = (TONES.find((t) => t.id === payload.tone)?.id ?? "hot") as ToneId;
  const length = (LENGTHS.find((l) => l.id === payload.length)?.id ?? "mid") as LengthId;

  const input: GenerateInput = {
    template,
    tone,
    length,
    keywords: typeof payload.keywords === "string" ? payload.keywords.slice(0, 200) : "",
    variant: Number(payload.variant ?? 1) || 1,
    espnId: typeof payload.espnId === "string" && payload.espnId ? payload.espnId : null,
    gameId: typeof payload.gameId === "string" && payload.gameId ? payload.gameId : null,
    gameDate: typeof payload.gameDate === "string" ? payload.gameDate : null,
    newsId: typeof payload.newsId === "string" && payload.newsId ? payload.newsId : null,
    seasonYear: Number(payload.seasonYear ?? 0) || null,
    useAi: typeof payload.useAi === "boolean" ? payload.useAi : undefined,
  };

  try {
    const result = await runGenerate(input);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
