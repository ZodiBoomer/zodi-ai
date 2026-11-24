import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { signInWithPassword } from "./actions";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="logo">✦</div>
        <h1>Bienvenue sur Zodi AI</h1>
        <p>Connecte-toi avec ton compte Zodi.</p>
        <form className="auth-form" action={signInWithPassword}>
          <label>Adresse e-mail<input type="email" name="email" autoComplete="email" required /></label>
          <label>Mot de passe<input type="password" name="password" autoComplete="current-password" required /></label>
          <button className="primary-button" type="submit">Se connecter</button>
        </form>
        <p className="fine-print">Pas encore de compte ? <Link href="/register">Créer un compte Zodi</Link></p>
        <p className="fine-print">Tes conversations et ta mémoire sont associées à ton compte Zodi, sans dépendre d'un fournisseur tiers.</p>
      </section>
    </main>
  );
}
