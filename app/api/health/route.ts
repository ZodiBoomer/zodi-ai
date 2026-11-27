import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const isConfigured = Boolean(String(process.env.OPENROUTER_API_KEY || "").trim());
  const model = String(process.env.OPENROUTER_MODEL || "").trim() || "openrouter/free";
  const fallbacks = String(process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const modelFallbacks = fallbacks.length
    ? fallbacks
    : [
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "baidu/ernie-5.5-flash-preview:free",
      "nvidia/nemotron-3.5-super-vl:free"
    ];

  return NextResponse.json({
    ok: true,
    app: "zodi-ai-core",
    status: isConfigured ? "configured" : "unconfigured",
    provider: isConfigured ? "openrouter" : "none",
    providers: isConfigured ? ["openrouter"] : [],
    aiConfigured: isConfigured,
    model,
    modelFallbacks: isConfigured ? modelFallbacks.filter((item) => item !== model).slice(0, 3) : [],
    failoverEnabled: isConfigured,
    localAI: false
  });
}
