import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(process.env.OPENAI_API_KEY);

  return NextResponse.json({
    ok: true,
    app: "zodi-ai-core",
    provider: "openai",
    aiConfigured: configured,
    authMode: configured ? "openai-api-key" : "missing",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  });
}
