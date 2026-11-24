import { NextResponse } from "next/server";
import { createUserAccount } from "@/lib/create-user";
import { createNativeToken } from "@/lib/native-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; name?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const result = await createUserAccount(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const session = await createNativeToken(result.user.id);
  return NextResponse.json({ ...session, user: result.user }, {
    status: 201,
    headers: { "Cache-Control": "no-store" }
  });
}
