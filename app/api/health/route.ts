import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isOpenRouterKey(value: string) {
  return /^sk-or-/i.test(value.trim());
}

function isOpenRouterUrl(value: string) {
  return /openrouter\.ai/i.test(value);
}

function getConfiguredProviders() {
  const legacyBase = String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || "");
  const openRouterKey = Boolean(
    process.env.OPENROUTER_API_KEY ||
    (isOpenRouterKey(String(process.env.OPENAI_API_KEY || "")) ? process.env.OPENAI_API_KEY : "") ||
    (isOpenRouterUrl(legacyBase) ? process.env.OPENAI_API_KEY : "")
  );
  const openAiKey = Boolean(
    process.env.OPENAI_DIRECT_API_KEY ||
    (!isOpenRouterKey(String(process.env.OPENAI_API_KEY || "")) && !isOpenRouterUrl(legacyBase)
      ? process.env.OPENAI_API_KEY
      : "")
  );

  return [
    ...(openRouterKey ? ["openrouter"] : []),
    ...(openAiKey ? ["openai"] : [])
  ];
}

export async function GET() {
  const providers = getConfiguredProviders();
  const primary = String(process.env.ZODI_AI_PROVIDER || "").trim().toLowerCase();
  const orderedProviders = primary === "openai" || primary === "openrouter"
    ? [...providers].sort((a, b) => Number(b === primary) - Number(a === primary))
    : providers;
  const isConfigured = orderedProviders.length > 0;
  const provider = orderedProviders[0] || "none";
  const model = provider === "openrouter"
    ? String(process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "").trim() || "openai/gpt-5"
    : String(process.env.OPENAI_MODEL || "").trim() || "gpt-5.5";
  const fallbacks = String(process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const modelFallbacks = fallbacks.length
    ? fallbacks
    : ["openai/gpt-5-mini", "google/gemini-2.5-flash"];

  return NextResponse.json({
    ok: true,
    app: "zodi-ai-core",
    status: isConfigured ? "configured" : "unconfigured",
    provider,
    providers: orderedProviders,
    aiConfigured: isConfigured,
    model,
    modelFallbacks: provider === "openrouter" ? modelFallbacks.filter((item) => item !== model).slice(0, 3) : [],
    failoverEnabled: isConfigured && (orderedProviders.length > 1 || provider === "openrouter"),
    localAI: false
  });
}
