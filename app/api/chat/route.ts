import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };
type CloudProvider = "openai" | "openrouter";

type ProviderResponse = {
  model?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string; output_text?: string }> }>;
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string; type?: string; code?: string };
};

type ProviderConfig = {
  name: CloudProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const OPENAI_DEFAULT_MODEL = "gpt-5.5";
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-5";
const DEFAULT_OPENROUTER_FALLBACKS = ["openai/gpt-5-mini", "google/gemini-2.5-flash"];
const MAX_HISTORY_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 4000;
// Three OpenRouter model attempts must fit inside Vercel's 60-second function limit.
const OPENROUTER_TIMEOUT_MS = Math.min(
  15_000,
  Math.max(8_000, Number(process.env.ZODI_AI_OPENROUTER_TIMEOUT_MS) || 15_000)
);
const OPENAI_TIMEOUT_MS = Math.min(
  10_000,
  Math.max(5_000, Number(process.env.ZODI_AI_OPENAI_TIMEOUT_MS) || 10_000)
);

function isOpenRouterKey(value: string) {
  return /^sk-or-/i.test(value.trim());
}

function isOpenRouterUrl(value: string) {
  return /openrouter\.ai/i.test(value);
}

function getProviderConfigs(): ProviderConfig[] {
  const openRouterKey = String(
    process.env.OPENROUTER_API_KEY ||
    (isOpenRouterKey(String(process.env.OPENAI_API_KEY || "")) ? process.env.OPENAI_API_KEY : "") ||
    (isOpenRouterUrl(String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || ""))
      ? process.env.OPENAI_API_KEY
      : "")
  ).trim();

  const openAiKey = String(
    process.env.OPENAI_DIRECT_API_KEY ||
    (!isOpenRouterKey(String(process.env.OPENAI_API_KEY || "")) &&
      !isOpenRouterUrl(String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || ""))
      ? process.env.OPENAI_API_KEY
      : "")
  ).trim();

  const openRouterModel =
    String(process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "").trim() ||
    OPENROUTER_DEFAULT_MODEL;
  const openAiModel = String(process.env.OPENAI_MODEL || "").trim() || OPENAI_DEFAULT_MODEL;

  const configs: ProviderConfig[] = [];
  if (openRouterKey) {
    const legacyBase = String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || "").trim();
    configs.push({
      name: "openrouter",
      apiKey: openRouterKey,
      baseUrl: String(process.env.OPENROUTER_BASE_URL || (isOpenRouterUrl(legacyBase) ? legacyBase : "") || "https://openrouter.ai/api/v1").trim().replace(/\/+$/, ""),
      model: openRouterModel
    });
  }

  if (openAiKey) {
    const legacyBase = String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || "").trim();
    configs.push({
      name: "openai",
      apiKey: openAiKey,
      baseUrl: String(process.env.OPENAI_DIRECT_BASE_URL || (!isOpenRouterUrl(legacyBase) ? legacyBase : "") || "https://api.openai.com/v1").trim().replace(/\/+$/, ""),
      model: openAiModel
    });
  }

  const preferred = String(process.env.ZODI_AI_PROVIDER || "").trim().toLowerCase();
  if (preferred === "openai" || preferred === "openrouter") {
    configs.sort((a, b) => Number(b.name === preferred) - Number(a.name === preferred));
  }

  return configs;
}

function getOpenRouterFallbackModels(primary: string) {
  const configured = String(process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const candidates = configured.length ? configured : DEFAULT_OPENROUTER_FALLBACKS;
  return [...new Set(candidates)].filter((model) => model !== primary).slice(0, 3);
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
  config: ProviderConfig,
  route: string,
  payload: Record<string, unknown>
): Promise<ProviderResponse> {
  const headers: Record<string, string> = {
    Authorization: "Bearer " + config.apiKey,
    "Content-Type": "application/json"
  };

  if (config.name === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL || "https://zodi-ai-core.vercel.app";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "Zodi AI";
  }

  const timeoutMs = typeof payload.__timeoutMs === "number"
    ? Math.min(OPENROUTER_TIMEOUT_MS, payload.__timeoutMs)
    : config.name === "openrouter" ? OPENROUTER_TIMEOUT_MS : OPENAI_TIMEOUT_MS;
  const requestPayload = { ...payload };
  delete requestPayload.__timeoutMs;

  const response = await fetch(config.baseUrl + "/" + route.replace(/^\/+/, ""), {
    method: "POST",
    headers,
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(timeoutMs),
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
      .filter((part) =>
        (part.type === "text" || part.type === "output_text") &&
        typeof part.text === "string"
      )
      .map((part) => part.text)
      .join("")
      .trim();
  }
  return "";
}

function shouldTryChatCompletions(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("EMPTY_PROVIDER_RESPONSE") ||
    message.includes("PROVIDER_HTTP_400") ||
    message.includes("PROVIDER_HTTP_404") ||
    message.includes("PROVIDER_HTTP_405");
}

async function generateWithProvider(config: ProviderConfig, history: ChatMessage[]) {
  const system = getSystemPrompt();
  const messages = [
    { role: "system" as const, content: system },
    ...history.map((item) => ({ role: item.role, content: item.content }))
  ];

  if (config.name === "openrouter") {
    const models = [config.model, ...getOpenRouterFallbackModels(config.model)];
    let lastError: unknown;

    // Try models one by one. OpenRouter also switches hosting providers for each model.
    // This catches successful HTTP responses that contain no user-visible text.
    for (const model of models) {
      try {
        const response = await postJson(config, "chat/completions", {
          model,
          messages,
          max_completion_tokens: 4096,
          provider: { allow_fallbacks: true },
          __timeoutMs: OPENROUTER_TIMEOUT_MS
        });
        const reply = extractChatText(response);
        if (reply) return { reply, model: response.model || model };
        lastError = new Error("EMPTY_PROVIDER_RESPONSE");
        console.warn("Zodi AI received an empty completion; trying the next cloud model.", {
          provider: config.name,
          model,
          finishReason: (response as ProviderResponse & { choices?: Array<{ finish_reason?: string }> })
            .choices?.[0]?.finish_reason || "unknown"
        });
      } catch (error) {
        lastError = error;
        console.error("Zodi AI model attempt failed; trying the next cloud model.", {
          provider: config.name,
          model,
          error: error instanceof Error ? error.message : "UnknownError"
        });
        const message = error instanceof Error ? error.message : "";
        if (
          message.includes("PROVIDER_HTTP_401") ||
          message.includes("PROVIDER_HTTP_402") ||
          message.includes("PROVIDER_HTTP_403")
        ) {
          break;
        }
      }
    }

    throw lastError || new Error("ALL_OPENROUTER_MODELS_FAILED");
  }

  try {
    const response = await postJson(config, "responses", {
      model: config.model,
      instructions: system,
      input: buildResponsesInput(history),
      max_output_tokens: 4096
    });
    const reply = extractResponsesText(response);
    if (reply) return { reply, model: response.model || config.model };
    throw new Error("EMPTY_PROVIDER_RESPONSE");
  } catch (error) {
    if (!shouldTryChatCompletions(error)) throw error;
    console.warn("Zodi AI Responses API incompatible or empty; trying Chat Completions.", {
      provider: config.name,
      model: config.model
    });
  }

  const response = await postJson(config, "chat/completions", {
    model: config.model,
    messages,
    max_completion_tokens: 4096
  });
  const reply = extractChatText(response);
  if (!reply) throw new Error("EMPTY_PROVIDER_RESPONSE");
  return { reply, model: response.model || config.model };
}

function getPublicError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("MISSING_KEY:")) {
    return "Aucune clé API cloud valide n'est configurée dans Vercel.";
  }
  if (message.includes("PROVIDER_HTTP_401")) {
    return "Le fournisseur IA a refusé sa clé API. Vérifie la clé configurée dans Vercel.";
  }
  if (message.includes("PROVIDER_HTTP_402") || message.includes("PROVIDER_HTTP_429")) {
    return "Les fournisseurs IA ont atteint une limite de crédit, de quota ou de débit. Vérifie leur facturation.";
  }
  if (message.includes("PROVIDER_HTTP_403")) {
    return "L'accès aux modèles IA est refusé par les fournisseurs configurés.";
  }
  if (message.includes("PROVIDER_HTTP_404")) {
    return "Aucun des modèles de secours configurés n'est disponible actuellement.";
  }
  if (message.includes("EMPTY_PROVIDER_RESPONSE")) {
    return "Les modèles cloud n'ont renvoyé aucun texte malgré les tentatives de secours. Réessaie dans quelques secondes ; l'incident est enregistré pour diagnostic.";
  }
  if (message.includes("TimeoutError") || message.includes("AbortError")) {
    return "Les modèles cloud mettent trop de temps à répondre malgré les tentatives de secours. Réessaie dans un instant.";
  }
  return "Aucun fournisseur IA cloud configuré n'a réussi à répondre. Le détail technique est enregistré dans les journaux Vercel.";
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

  const providers = getProviderConfigs();
  if (!providers.length) {
    return NextResponse.json(
      { error: "Aucune clé API cloud n'est configurée. Ajoute OPENROUTER_API_KEY ou OPENAI_DIRECT_API_KEY dans Vercel." },
      { status: 503 }
    );
  }

  const history = [...normalizeHistory(body.history), { role: "user" as const, content: message }]
    .slice(-MAX_HISTORY_MESSAGES);

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const result = await generateWithProvider(provider, history);
      return NextResponse.json({
        ok: true,
        reply: result.reply,
        provider: provider.name,
        model: result.model,
        failoverAvailable: providers.length > 1 || provider.name === "openrouter"
      });
    } catch (error) {
      lastError = error;
      console.error("Zodi AI cloud provider attempt failed:", {
        provider: provider.name,
        model: provider.model,
        error: error instanceof Error ? error.message : "UnknownError"
      });
    }
  }

  return NextResponse.json({
    error: getPublicError(lastError),
    providersTried: providers.map((provider) => provider.name)
  }, { status: 502 });
}
