ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

CREATE TABLE "NativeToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NativeToken_tokenHash_key" ON "NativeToken"("tokenHash");
CREATE INDEX "NativeToken_userId_expiresAt_idx" ON "NativeToken"("userId", "expiresAt");

ALTER TABLE "NativeToken" ADD CONSTRAINT "NativeToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "GoogleOAuthState";
DROP TABLE IF EXISTS "GoogleConnection";
DROP TABLE IF EXISTS "Account";
DROP TABLE IF EXISTS "Session";
DROP TABLE IF EXISTS "VerificationToken";
