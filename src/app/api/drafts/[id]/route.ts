import { eq } from "drizzle-orm";
import { db } from "@/db";
import { drafts } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return Response.json({ error: "无效 ID" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const body = typeof payload.body === "string" ? payload.body : null;
  const title = typeof payload.title === "string" ? payload.title.slice(0, 300) : null;
  const [row] = await db
    .update(drafts)
    .set({
      ...(title ? { title } : {}),
      ...(body ? { body, wordCount: body.replace(/\s/g, "").length } : {}),
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, numericId))
    .returning();

  if (!row) return Response.json({ error: "草稿不存在" }, { status: 404 });
  return Response.json({ draft: row });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return Response.json({ error: "无效 ID" }, { status: 400 });
  const [row] = await db.delete(drafts).where(eq(drafts.id, numericId)).returning();
  if (!row) return Response.json({ error: "草稿不存在" }, { status: 404 });
  return Response.json({ ok: true, id: numericId });
}
