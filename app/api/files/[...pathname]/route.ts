import { get } from "@vercel/blob";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const COOKIE_NAME = "zodix_file_session";

export async function GET(
  request: Request,
  context: { params: Promise<{ pathname: string[] }> }
) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  const { pathname } = await context.params;
  if (!sessionId || pathname.length < 3 || pathname[0] !== "sessions" || pathname[1] !== sessionId) {
    return new Response("Fichier introuvable.", { status: 404 });
  }

  try {
    const result = await get(pathname.join("/"), {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined
    });
    if (!result) return new Response("Fichier introuvable.", { status: 404 });
    if (result.statusCode === 304) {
      return new Response(null, {
        status: 304,
        headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" }
      });
    }

    const headers = new Headers({
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-cache",
      ETag: result.blob.etag
    });
    if (typeof result.blob.size === "number") headers.set("Content-Length", String(result.blob.size));
    return new Response(result.stream, { headers });
  } catch {
    return new Response("Lecture du fichier impossible.", { status: 404 });
  }
}
