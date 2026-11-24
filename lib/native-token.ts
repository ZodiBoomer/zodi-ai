import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function createNativeToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.nativeToken.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt
    }
  });
  return { token, expiresAt };
}
