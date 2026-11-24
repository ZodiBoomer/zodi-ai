import { prisma } from "@/lib/prisma";
import { hashPassword, isValidEmail, isValidPassword, normalizeEmail } from "@/lib/password";

export async function createUserAccount(input: { email: unknown; password: unknown; name?: unknown }) {
  const email = normalizeEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";

  if (!isValidEmail(email)) return { ok: false as const, status: 400, error: "Adresse e-mail invalide." };
  if (!isValidPassword(password)) return { ok: false as const, status: 400, error: "Le mot de passe doit contenir entre 10 et 128 caractères." };

  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name || null },
      select: { id: true, email: true, name: true }
    });
    return { ok: true as const, user };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { ok: false as const, status: 409, error: "Un compte existe déjà avec cette adresse e-mail." };
    }
    throw error;
  }
}
