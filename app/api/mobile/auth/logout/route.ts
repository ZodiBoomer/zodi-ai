import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Session introuvable." }, { status: 401 });
  }
  const token = authorization.slice(7).trim();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.nativeToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return NextResponse.json({ ok: true });
}
