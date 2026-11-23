import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getProvider(): "openai" | "openrouter" | "unsupported" {
  const configured = String(process.env.ZODI_AI_PROVIDER || "").trim().toLowerCase();
  if (["local", "ollama", "offline", "none"].includes(configured)) return "unsupported";
  if (configured === "openrouter") return "openrouter";
  if (configured === "openai") return "openai";

  const key = String(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const base = String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || "").trim();
  return /^sk-or-/i.test(key) || /openrouter\\.ai/i.test(base) ? "openrouter" : "openai";
}

export async function GET() {
  const provider = getProvider();
  const apiKey = provider === "openrouter"
    ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
    : process.env.OPENAI_API_KEY;
  const configured = Boolean(apiKey);
  const model = String(process.env.OPENAI_MODEL || "").trim() ||
    (provider === "openrouter" ? "openai/gpt-5" : "gpt-5.5");

  return NextResponse.json({
    ok: true,
    app: "zodi-ai-core",
    provider,
    aiConfigured: configured && provider !== "unsupported",
    authMode: configured ? "api-key" : "missing",
    model,
    fallback: provider === "openrouter" ? "openrouter/free" : "chat-completions",
    localAI: false
  });
}
