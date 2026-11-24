import { NextResponse } from "next/server";
import { createUserAccount } from "@/lib/create-user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.email !== "string" || typeof payload.password !== "string") {
    return NextResponse.json(
      { error: "Une adresse e-mail et un mot de passe sont requis." },
      { status: 400 }
    );
  }

  const result = await createUserAccount({
    email: payload.email,
    password: payload.password,
    name: payload.name
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ user: result.user }, { status: 201 });
}
