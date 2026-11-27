import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE_NAME = "zodix_file_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;
  const sessionId = existing && UUID_PATTERN.test(existing) ? existing : crypto.randomUUID();
  const response = NextResponse.json({ sessionId }, { headers: { "Cache-Control": "no-store" } });
  if (sessionId !== existing) {
    response.cookies.set(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    });
  }
  return response;
}
