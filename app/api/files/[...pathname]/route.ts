import { issueSignedToken, presignUrl } from "@vercel/blob";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const COOKIE_NAME = "zodix_file_session";
const SIGNED_URL_LIFETIME_MS = 24 * 60 * 60 * 1000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ pathname: string[] }> }
) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  const { pathname } = await context.params;
  if (!sessionId || pathname.length < 3 || pathname[0] !== "sessions" || pathname[1] !== sessionId) {
    return new Response("Fichier introuvable.", { status: 404 });
  }

  try {
    const blobPath = pathname.join("/");
    const token = await issueSignedToken({ operations: ["get"] });
    const { presignedUrl } = await presignUrl(token, {
      pathname: blobPath,
      operation: "get",
      access: "private",
      validUntil: Date.now() + SIGNED_URL_LIFETIME_MS
    });
    return Response.redirect(presignedUrl, 307);
  } catch {
    return new Response("Lecture du fichier impossible.", { status: 404 });
  }
}
