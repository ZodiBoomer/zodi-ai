import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const explicitCredential = Boolean(
    process.env.VERCEL_ACCESS_TOKEN ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN
  );
  const onVercel = process.env.VERCEL === "1";

  return NextResponse.json({
    ok: true,
    app: "zodi-ai-core",
    provider: "vercel-ai-gateway",
    aiConfigured: explicitCredential || onVercel,
    authMode: process.env.VERCEL_ACCESS_TOKEN
      ? "vercel-access-token"
      : process.env.AI_GATEWAY_API_KEY
        ? "gateway-api-key"
        : process.env.VERCEL_OIDC_TOKEN || onVercel
          ? "vercel-oidc"
          : "missing",
    model: process.env.AI_GATEWAY_MODEL || "openai/gpt-4o-mini"
  });
}
