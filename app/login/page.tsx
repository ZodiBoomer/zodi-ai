import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signInWithGoogle } from "./actions";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="logo">✦</div>
        <h1>Bienvenue sur Zodi AI</h1>
        <p>Connecte-toi avec ton compte Google pour accéder à ton assistant.</p>
        <form action={signInWithGoogle}>
          <button className="primary-button" type="submit">Continuer avec Google</button>
        </form>
        <p className="fine-print">Zodi AI utilise uniquement les informations de profil nécessaires à la connexion. Les accès à Gmail, Drive, Agenda et Contacts seront demandés séparément, uniquement si tu les actives.</p>
      </section>
    </main>
  );
}
