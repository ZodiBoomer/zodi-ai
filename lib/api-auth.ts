import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getAuthenticatedUserId(request: Request) {
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const rawToken = authorization.slice(7).trim();
  if (!rawToken || rawToken.length > 200) return null;

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const record = await prisma.nativeToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { userId: true }
  });
  return record?.userId || null;
}
