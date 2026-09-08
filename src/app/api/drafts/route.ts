import { desc } from "drizzle-orm";
import { db } from "@/db";
import { drafts } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(drafts).orderBy(desc(drafts.createdAt)).limit(100);
  return Response.json({ drafts: rows });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 300) : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return Response.json({ error: "正文不能为空" }, { status: 400 });

  const [row] = await db
    .insert(drafts)
    .values({
      title: title || "未命名草稿",
      body,
      templateId: typeof payload.templateId === "string" ? payload.templateId : null,
      templateName: typeof payload.templateName === "string" ? payload.templateName : null,
      tone: typeof payload.tone === "string" ? payload.tone : null,
      length: typeof payload.length === "string" ? payload.length : null,
      tags: Array.isArray(payload.tags) ? (payload.tags as string[]).slice(0, 20) : [],
      wordCount: body.replace(/\s/g, "").length,
      sourceSummary: typeof payload.sourceSummary === "string" ? payload.sourceSummary.slice(0, 500) : null,
      sourceData: (payload.sourceData ?? null) as Record<string, unknown> | null,
    })
    .returning();

  return Response.json({ draft: row }, { status: 201 });
}
