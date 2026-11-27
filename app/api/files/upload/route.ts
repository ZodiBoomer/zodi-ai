import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE_NAME = "zodix_file_session";
const MAX_FILE_BYTES = 80 * 1024 * 1024;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine de requête refusée." }, { status: 403 });
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;

  let body: HandleUploadBody;
  try {
    body = await request.json() as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Demande d’envoi invalide." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { sessionId?: string } = {};
        try { payload = JSON.parse(clientPayload || "{}") as { sessionId?: string }; } catch {}
        if (!sessionId || payload.sessionId !== sessionId || !pathname.startsWith("sessions/" + sessionId + "/")) {
          throw new Error("Session de fichiers invalide.");
        }
        return {
          allowedContentTypes: ["image/*", "video/*", "audio/*", "application/*", "text/*", "font/*", "model/*"],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ sessionId })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as { sessionId?: string };
        if (!payload.sessionId || !blob.pathname.startsWith("sessions/" + payload.sessionId + "/")) {
          throw new Error("La validation de la pièce jointe a échoué.");
        }
      }
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Envoi du fichier impossible." }, { status: 400 });
  }
}
