import { prisma } from "@/lib/prisma";
import { decryptGoogleToken } from "@/lib/google-token-crypto";
import type { GoogleService } from "@/lib/google-services";

type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string };

export async function getGoogleAccessToken(
  userId: string,
  service: GoogleService,
  googleAccountId?: string
) {
  const connection = await prisma.googleConnection.findFirst({
    where: {
      userId,
      services: { has: service },
      ...(googleAccountId ? { googleAccountId } : {})
    },
    orderBy: { connectedAt: "desc" }
  });
  if (!connection) throw new Error("GOOGLE_SERVICE_NOT_CONNECTED");

  const refreshToken = decryptGoogleToken(connection.refreshTokenEncrypted);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID || "",
      client_secret: process.env.AUTH_GOOGLE_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });
  const data = await response.json() as GoogleTokenResponse;
  if (!response.ok || !data.access_token) {
    console.error("Google access-token refresh failed:", data.error || response.status);
    throw new Error("GOOGLE_ACCESS_TOKEN_REFRESH_FAILED");
  }
  return {
    accessToken: data.access_token,
    email: connection.email,
    googleAccountId: connection.googleAccountId
  };
}
