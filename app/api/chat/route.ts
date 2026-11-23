import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

type ProviderResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string; output_text?: string }> }>;
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string; type?: string; code?: string };
};

const OPENAI_DEFAULT_MODEL = "gpt-5.5";
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-5";
const MAX_HISTORY_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 4000;
const REQUEST_TIMEOUT_MS = Math.min(55_000, Math.max(15_000, Number(process.env.OPENAI_TIMEOUT_MS) || 55_000));

function isOpenRouterConfigured() {
  const key = String(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const base = String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || "").trim();
  return /^sk-or-/i.test(key) || /openrouter\.ai/i.test(base);
}

function getProvider(): "openai" | "openrouter" | "unsupported" {
  const configured = String(process.env.ZODI_AI_PROVIDER || "").trim().toLowerCase();
  if (["local", "ollama", "offline", "none"].includes(configured)) return "unsupported";
  if (configured === "openrouter") return "openrouter";
  if (configured === "openai") return "openai";
  return isOpenRouterConfigured() ? "openrouter" : "openai";
}

function getApiKey(provider: "openai" | "openrouter") {
  return provider === "openrouter"
    ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
    : process.env.OPENAI_API_KEY;
}

function getBaseUrl(provider: "openai" | "openrouter") {
  const configured = String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return provider === "openrouter"
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1";
}

function getModel(provider: "openai" | "openrouter") {
  return String(process.env.OPENAI_MODEL || "").trim() ||
    (provider === "openrouter" ? OPENROUTER_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL);
}

function getSystemPrompt() {
  const date = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeZone: "Europe/Paris"
  }).format(new Date());

  return [
    "Tu es Zodi, un assistant personnel intégré à Zodi AI.",
    "Tu réponds en français, de façon naturelle, simple, chaleureuse et directe, sauf demande contraire.",
    "Les messages peuvent contenir des fautes d'orthographe, de frappe ou d'écriture phonétique : comprends l'intention avant de répondre.",
    "Ne réponds pas à côté. Si la question est claire, réponds d'abord à la question.",
    "Si l'utilisateur exprime un besoin, une demande ou un avis, réponds directement au lieu de lancer un questionnaire.",
    "Reste sur le sujet en cours. Si une précision manque, pose une seule question courte.",
    "Ne pose jamais plusieurs questions d'un coup.",
    "N'invente pas un fait technique ou une information précise si tu n'es pas sûr.",
    "Date actuelle : " + date + " (fuseau Europe/Paris).",
    "Fais des réponses plutôt courtes à moyennes, sauf si l'utilisateur demande plus de détail."
  ].join("\n");
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChatMessage =>
      Boolean(item) &&
      typeof item === "object" &&
      ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
      typeof (item as ChatMessage).content === "string"
    )
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, MAX_MESSAGE_LENGTH) }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

function buildResponsesInput(history: ChatMessage[]) {
  return history.map((item) =>
    (item.role === "user" ? "Utilisateur" : "Zodi") + " : " + item.content
  ).join("\n\n");
}

async function postJson(
  provider: "openai" | "openrouter",
  route: string,
  payload: Record<string, unknown>
): Promise<ProviderResponse> {
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new Error("MISSING_KEY:" + provider);

  const baseUrl = getBaseUrl(provider);
  const url = baseUrl + "/" + route.replace(/^\/+/, "");
  const headers: Record<string, string> = {
    Authorization: "Bearer " + apiKey,
    "Content-Type": "application/json"
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL || "https://zodi-ai-core.vercel.app";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "Zodi AI";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store"
  });

  const data = (await response.json().catch(() => ({}))) as ProviderResponse;
  if (!response.ok) {
    throw new Error("PROVIDER_HTTP_" + response.status + ":" + (data.error?.code || data.error?.type || "unknown"));
  }
  return data;
}

function extractResponsesText(data: ProviderResponse) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || part.output_text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractChatText(data: ProviderResponse) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
  }
  return "";
}

async function generateWithModel(
  provider: "openai" | "openrouter",
  model: string,
  history: ChatMessage[]
) {
  const system = getSystemPrompt();

  // Comme le bot Discord : OpenAI Responses d'abord, puis Chat Completions.
  // OpenRouter utilise directement Chat Completions.
  if (provider === "openai") {
    try {
      const response = await postJson(provider, "responses", {
        model,
        instructions: system,
        input: buildResponsesInput(history),
        max_output_tokens: 260
      });
      const reply = extractResponsesText(response);
      if (reply) return reply;
    } catch (error) {
      console.error("Zodi AI Responses API failed; trying Chat Completions:", {
        provider,
        model,
        error: error instanceof Error ? error.message : "UnknownError"
      });
    }
  }

  const messages = [
    { role: "system", content: system },
    ...history.map((item) => ({ role: item.role, content: item.content }))
  ];
  const payload: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: 260
  };

  if (provider === "openrouter") {
    payload.max_tokens = payload.max_completion_tokens;
    delete payload.max_completion_tokens;
  }

  const response = await postJson(provider, "chat/completions", payload);
  const reply = extractChatText(response);
  if (!reply) throw new Error("EMPTY_PROVIDER_RESPONSE");
  return reply;
}

function getPublicError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("MISSING_KEY:")) {
    return "La clé API du fournisseur IA choisi n'est pas configurée dans Vercel.";
  }
  if (message.includes("PROVIDER_HTTP_401")) {
    return "Le fournisseur IA a refusé la clé API. Vérifie la clé configurée dans Vercel.";
  }
  if (message.includes("PROVIDER_HTTP_402") || message.includes("PROVIDER_HTTP_429")) {
    return "Le quota, le crédit ou la limite de dépenses du fournisseur IA est atteint. Vérifie sa facturation.";
  }
  if (message.includes("PROVIDER_HTTP_403")) {
    return "Le fournisseur IA refuse l'accès à ce modèle ou à ce projet. Vérifie les autorisations.";
  }
  if (message.includes("PROVIDER_HTTP_404")) {
    return "Le modèle ou l'endpoint demandé n'est pas disponible avec cette configuration.";
  }
  if (message.includes("TimeoutError") || message.includes("AbortError")) {
    return "Le fournisseur IA met trop de temps à répondre. Réessaie dans un instant.";
  }
  return "Aucun fournisseur IA cloud n'a pu répondre. Consulte les journaux Vercel pour le diagnostic.";
}

export async function POST(request: Request) {
  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: "Le message doit contenir entre 1 et 4000 caractères." },
      { status: 400 }
    );
  }

  const provider = getProvider();
  if (provider === "unsupported") {
    return NextResponse.json(
      { error: "La configuration locale est désactivée. Choisis OpenAI ou OpenRouter dans ZODI_AI_PROVIDER." },
      { status: 503 }
    );
  }

  if (!getApiKey(provider)) {
    return NextResponse.json(
      { error: "La clé API du fournisseur IA choisi n'est pas configurée dans Vercel." },
      { status: 503 }
    );
  }

  const history = [...normalizeHistory(body.history), { role: "user" as const, content: message }].slice(-MAX_HISTORY_MESSAGES);
  const configuredModel = getModel(provider);
  const candidateModels = provider === "openrouter"
    ? [...new Set([configuredModel, "openrouter/free"])]
    : [configuredModel];

  let lastError: unknown;
  for (const model of candidateModels) {
    try {
      const reply = await generateWithModel(provider, model, history);
      return NextResponse.json({ ok: true, reply, provider, model });
    } catch (error) {
      lastError = error;
      console.error("Zodi AI cloud provider attempt failed:", {
        provider,
        model,
        error: error instanceof Error ? error.message : "UnknownError"
      });
    }
  }

  return NextResponse.json({ error: getPublicError(lastError) }, { status: 502 });
}
