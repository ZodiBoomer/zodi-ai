import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const conversations = await prisma.conversation.findMany({
    where: { userId: userId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, createdAt: true, updatedAt: true }
  });
  return NextResponse.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const conversation = await prisma.conversation.create({
    data: { userId: userId, title: "Nouvelle conversation" },
    select: { id: true, title: true, createdAt: true, updatedAt: true }
  });
  return NextResponse.json({ conversation }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
