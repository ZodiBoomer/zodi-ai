"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function RegisterForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de créer le compte.");
      await signIn("credentials", { email, password, redirectTo: "/" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>Nom (facultatif)<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
      <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Mot de passe<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label>Confirmer le mot de passe<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Création du compte…" : "Créer mon compte Zodi"}</button>
      <p className="fine-print">10 caractères minimum. Utilise un mot de passe unique que tu ne réutilises pas ailleurs.</p>
      <p className="fine-print">Tu as déjà un compte ? <Link href="/login">Se connecter</Link></p>
    </form>
  );
}
