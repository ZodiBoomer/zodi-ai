import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const memories = await prisma.userMemory.findMany({
    where: { userId: userId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, content: true, category: true, createdAt: true, updatedAt: true }
  });
  return NextResponse.json({ memories }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  let body: { content?: unknown; category?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 1000) : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 40) : "general";
  if (!content) return NextResponse.json({ error: "La mémoire ne peut pas être vide." }, { status: 400 });
  const memory = await prisma.userMemory.create({
    data: { userId: userId, content, category: category || "general" },
    select: { id: true, content: true, category: true, createdAt: true }
  });
  return NextResponse.json({ memory }, { status: 201 });
}

export async function DELETE(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  const result = await prisma.userMemory.deleteMany({ where: { id, userId: userId } });
  if (!result.count) return NextResponse.json({ error: "Mémoire introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
