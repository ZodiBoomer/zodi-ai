import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GOOGLE_SERVICES, isGoogleService } from "@/lib/google-services";
import { encryptGoogleToken } from "@/lib/google-token-crypto";

export const runtime = "nodejs";

function getBaseUrl() {
  if (process.env.GOOGLE_SERVICES_REDIRECT_URI) {
    return process.env.GOOGLE_SERVICES_REDIRECT_URI.replace(/\/api\/google\/callback\/?$/, "");
  }
  return (process.env.AUTH_URL || process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "http://localhost:3000")).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", request.url));

  const service = new URL(request.url).searchParams.get("service") || "";
  if (!isGoogleService(service)) {
    return NextResponse.redirect(new URL("/connections?error=unknown-service", request.url));
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId || !process.env.AUTH_GOOGLE_SECRET) {
    return NextResponse.redirect(new URL("/connections?error=google-not-configured", request.url));
  }

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  await prisma.googleOAuthState.create({
    data: {
      stateHash: createHash("sha256").update(state).digest("hex"),
      userId: session.user.id,
      service,
      codeVerifier: encryptGoogleToken(codeVerifier),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  const scopes = ["openid", "email", "profile", ...GOOGLE_SERVICES[service].scopes];
  const callback = process.env.GOOGLE_SERVICES_REDIRECT_URI ||
    getBaseUrl() + "/api/google/callback";
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();

  return NextResponse.redirect(authorization);
}
