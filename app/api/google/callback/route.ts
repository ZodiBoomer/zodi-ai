import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptGoogleToken } from "@/lib/google-token-crypto";
import { GOOGLE_SERVICES, isGoogleService } from "@/lib/google-services";

export const runtime = "nodejs";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (url.searchParams.has("error")) {
    return NextResponse.redirect(new URL("/connections?error=google-consent-denied", request.url));
  }
  if (!state || !code) {
    return NextResponse.redirect(new URL("/connections?error=invalid-google-callback", request.url));
  }

  const stateHash = createHash("sha256").update(state).digest("hex");
  const savedState = await prisma.googleOAuthState.findUnique({ where: { stateHash } });
  await prisma.googleOAuthState.deleteMany({ where: { stateHash } });
  if (!savedState || savedState.expiresAt < new Date() || !isGoogleService(savedState.service)) {
    return NextResponse.redirect(new URL("/connections?error=expired-google-state", request.url));
  }

  const session = await auth();
  if (!session?.user?.id || session.user.id !== savedState.userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  const redirectUri = process.env.GOOGLE_SERVICES_REDIRECT_URI ||
    (process.env.AUTH_URL || process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "http://localhost:3000")) + "/api/google/callback";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/connections?error=google-not-configured", request.url));
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: savedState.codeVerifier
    }),
    cache: "no-store"
  });
  const token = await tokenResponse.json() as GoogleTokenResponse;
  if (!tokenResponse.ok || !token.access_token) {
    console.error("Google OAuth token exchange failed:", token.error || tokenResponse.status);
    return NextResponse.redirect(new URL("/connections?error=google-token-exchange", request.url));
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: "Bearer " + token.access_token },
    cache: "no-store"
  });
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean };
  if (!profileResponse.ok || !profile.sub || !profile.email || !profile.email_verified) {
    return NextResponse.redirect(new URL("/connections?error=google-profile-invalid", request.url));
  }

  const existing = await prisma.googleConnection.findUnique({
    where: { userId_googleAccountId: { userId: savedState.userId, googleAccountId: profile.sub } }
  });
  const refreshToken = token.refresh_token
    ? encryptGoogleToken(token.refresh_token)
    : existing?.refreshTokenEncrypted;

  if (!refreshToken) {
    return NextResponse.redirect(new URL("/connections?error=google-refresh-token-missing", request.url));
  }

  const scopes = (token.scope || "").split(" ").filter(Boolean);
  const serviceScopes = GOOGLE_SERVICES[savedState.service].scopes;
  if (!serviceScopes.every((scope) => scopes.includes(scope)) && !existing?.services.includes(savedState.service)) {
    return NextResponse.redirect(new URL("/connections?error=google-scope-missing", request.url));
  }

  await prisma.googleConnection.upsert({
    where: { userId_googleAccountId: { userId: savedState.userId, googleAccountId: profile.sub } },
    create: {
      userId: savedState.userId,
      googleAccountId: profile.sub,
      email: profile.email,
      refreshTokenEncrypted: refreshToken,
      scopes,
      services: [savedState.service]
    },
    update: {
      email: profile.email,
      refreshTokenEncrypted: refreshToken,
      scopes: Array.from(new Set([...(existing?.scopes || []), ...scopes])),
      services: Array.from(new Set([...(existing?.services || []), savedState.service]))
    }
  });

  return NextResponse.redirect(new URL("/connections?connected=" + savedState.service, request.url));
}
