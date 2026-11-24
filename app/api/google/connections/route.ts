import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isGoogleService } from "@/lib/google-services";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  const connections = await prisma.googleConnection.findMany({
    where: { userId: session.user.id },
    select: { id: true, googleAccountId: true, email: true, services: true, scopes: true, connectedAt: true }
  });
  return NextResponse.json({ connections }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  let body: { googleAccountId?: unknown; service?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (typeof body.googleAccountId !== "string" || typeof body.service !== "string" || !isGoogleService(body.service)) {
    return NextResponse.json({ error: "Compte ou service invalide." }, { status: 400 });
  }

  const connection = await prisma.googleConnection.findUnique({
    where: { userId_googleAccountId: { userId: session.user.id, googleAccountId: body.googleAccountId } }
  });
  if (!connection) return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });

  const services = connection.services.filter((service) => service !== body.service);
  if (services.length === 0) {
    await prisma.googleConnection.delete({ where: { id: connection.id } });
  } else {
    await prisma.googleConnection.update({ where: { id: connection.id }, data: { services } });
  }
  return NextResponse.json({ ok: true });
}
