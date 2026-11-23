import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé API absente. Ajoute AI_API_KEY dans les variables d’environnement Vercel." },
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

  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Tu es Zodi AI, un assistant personnel utile, clair et prudent. Réponds en français sauf demande contraire." },
          { role: "user", content: message }
        ],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(25000)
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error?.message || `Le fournisseur IA a répondu avec le statut ${upstream.status}.` },
        { status: 502 }
      );
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json({ error: "Le modèle n’a pas renvoyé de réponse exploitable." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, reply: reply.trim(), model });
  } catch {
    return NextResponse.json({ error: "Impossible de joindre le fournisseur IA. Vérifie l’URL et la disponibilité du service." }, { status: 502 });
  }
}
