import { NextResponse } from "next/server";
import { verifyPassword, normalizeEmail } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createNativeToken } from "@/lib/native-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 128) {
    return NextResponse.json({ error: "Adresse e-mail ou mot de passe incorrect." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true }
  });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Adresse e-mail ou mot de passe incorrect." }, { status: 401 });
  }

  const session = await createNativeToken(user.id);
  return NextResponse.json({ ...session, user: { id: user.id, email: user.email, name: user.name } }, {
    headers: { "Cache-Control": "no-store" }
  });
}
