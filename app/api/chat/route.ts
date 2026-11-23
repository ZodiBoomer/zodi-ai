import { createGateway, generateText } from "ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const gateway = process.env.VERCEL_ACCESS_TOKEN
  ? createGateway({
      apiKey: process.env.VERCEL_ACCESS_TOKEN,
      teamIdOrSlug: "zodi4"
    })
  : undefined;

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

  const modelId = process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL;

  try {
    const result = await generateText({
      model: gateway ? gateway(modelId) : modelId,
      system: "Tu es Zodi AI, un assistant personnel utile, clair et prudent. Réponds en français sauf demande contraire.",
      prompt: message,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(25000)
    });

    if (!result.text.trim()) {
      return NextResponse.json(
        { error: "Le modèle n’a pas renvoyé de réponse exploitable." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      reply: result.text.trim(),
      model: modelId
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue du fournisseur IA.";
    console.error("Zodi AI Gateway request failed:", message);
    return NextResponse.json(
      { error: "La connexion à Vercel AI Gateway a échoué. Vérifie le jeton Vercel, les autorisations AI Gateway et les crédits de l’équipe." },
      { status: 502 }
    );
  }
}
