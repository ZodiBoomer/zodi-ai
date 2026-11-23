import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export async function POST(request: Request) {
  // Vercel injects an OIDC token into deployments. A Gateway API key is
  // supported as a fallback for local development or external environments.
  const credential =
    process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;

  if (!credential) {
    return NextResponse.json(
      { error: "Authentification AI Gateway absente. Vérifie OIDC ou AI_GATEWAY_API_KEY dans Vercel." },
      { status: 503 }
    );
  }

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "Le message doit contenir entre 1 et 4000 caractères." }, { status: 400 });
  }

  const model = process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL;

  try {
    const upstream = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credential}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Tu es Zodi AI, un assistant personnel utile, clair et prudent. Réponds en français sauf demande contraire."
          },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      }),
      signal: AbortSignal.timeout(25000)
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const providerMessage =
        typeof data?.error?.message === "string"
          ? data.error.message
          : `AI Gateway a répondu avec le statut ${upstream.status}.`;
      return NextResponse.json({ error: providerMessage }, { status: 502 });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json({ error: "Le modèle n’a pas renvoyé de réponse exploitable." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      reply: reply.trim(),
      model: data.model || model
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre Vercel AI Gateway. Réessaie dans un instant." },
      { status: 502 }
    );
  }
}
