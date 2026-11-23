import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-4o-mini";
const SYSTEM_PROMPT =
  "Tu es Zodi AI, un assistant personnel utile, clair et prudent. Réponds en français sauf demande contraire.";

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export async function POST(request: Request) {
  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return NextResponse.json(
      { error: "Le message doit contenir entre 1 et 4000 caractères." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La clé API OpenAI n’est pas configurée sur le serveur." },
      { status: 503 }
    );
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        max_completion_tokens: 500
      }),
      signal: AbortSignal.timeout(25000),
      cache: "no-store"
    });

    const data = (await response.json().catch(() => ({}))) as OpenAIChatResponse;

    if (!response.ok) {
      console.error("OpenAI API request failed:", {
        status: response.status,
        type: data.error?.type,
        code: data.error?.code
      });
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 502;
      return NextResponse.json(
        {
          error:
            response.status === 401
              ? "OpenAI a refusé la clé API. Vérifie la clé configurée dans Vercel."
              : response.status === 429
                ? "La limite ou le quota OpenAI est atteint. Vérifie la facturation et les limites du projet OpenAI."
                : "OpenAI n’a pas pu traiter la demande. Consulte les journaux du serveur pour le diagnostic."
        },
        { status }
      );
    }

    const content = data.choices?.[0]?.message?.content;
    const reply =
      typeof content === "string"
        ? content.trim()
        : Array.isArray(content)
          ? content
              .filter((part) => part.type === "text" && typeof part.text === "string")
              .map((part) => part.text)
              .join("")
              .trim()
          : "";

    if (!reply) {
      return NextResponse.json(
        { error: "OpenAI n’a pas renvoyé de réponse exploitable." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, reply, provider: "openai", model });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    console.error("OpenAI API connection failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      {
        error: isTimeout
          ? "OpenAI met trop de temps à répondre. Réessaie dans un instant."
          : "Impossible de joindre l’API OpenAI depuis le serveur."
      },
      { status: 502 }
    );
  }
}
