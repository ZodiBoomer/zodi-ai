import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const authenticated = Boolean(
    process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY
  );

  return NextResponse.json({
    ok: true,
    app: "zodi-ai-core",
    provider: "vercel-ai-gateway",
    aiConfigured: authenticated,
    authMode: process.env.VERCEL_OIDC_TOKEN
      ? "vercel-oidc"
      : process.env.AI_GATEWAY_API_KEY
        ? "gateway-api-key"
        : "missing",
    model: process.env.AI_GATEWAY_MODEL || "openai/gpt-4o-mini"
  });
}
