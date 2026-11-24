import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const { id } = await context.params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: userId, archivedAt: null },
    select: {
      id: true, title: true, createdAt: true, updatedAt: true,
      messages: { orderBy: { createdAt: "asc" }, take: 500, select: { id: true, role: true, content: true, createdAt: true } }
    }
  });
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  return NextResponse.json({ conversation }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: Context) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const { id } = await context.params;
  let body: { title?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
  if (!title) return NextResponse.json({ error: "Le titre ne peut pas être vide." }, { status: 400 });
  const result = await prisma.conversation.updateMany({
    where: { id, userId: userId, archivedAt: null },
    data: { title }
  });
  if (!result.count) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true, title });
}

export async function DELETE(request: Request, context: Context) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const { id } = await context.params;
  const result = await prisma.conversation.updateMany({
    where: { id, userId: userId, archivedAt: null },
    data: { archivedAt: new Date() }
  });
  if (!result.count) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
