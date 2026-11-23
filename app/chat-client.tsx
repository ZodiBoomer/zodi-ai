"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { signOutAction } from "./logout-action";

type Message = { role: "user" | "assistant"; content: string };
type Health = {
  ok?: boolean;
  aiConfigured?: boolean;
  provider?: string;
  providers?: string[];
  model?: string;
  modelFallbacks?: string[];
};

export default function ChatClient({ email }: { email: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Salut ! Je suis Zodi. Tu peux discuter avec moi ici." }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Vérification de la configuration cloud…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json() as Health;
        const connected = Boolean(data.ok && data.aiConfigured && data.provider && data.provider !== "none");
        setReady(connected);
        if (!connected) {
          setStatus("Aucun fournisseur IA cloud configuré");
          return;
        }
        const providerName = data.provider === "openrouter" ? "OpenRouter" : "OpenAI";
        const fallbackCount = data.modelFallbacks?.length || 0;
        const providerFallbackCount = Math.max(0, (data.providers?.length || 0) - 1);
        const backupText = [
          fallbackCount ? fallbackCount + " modèles de secours" : "",
          providerFallbackCount ? providerFallbackCount + " fournisseur(s) secondaire(s)" : ""
        ].filter(Boolean).join(" · ");
        setStatus("Configuration cloud OK · " + providerName + " · " + data.model + (backupText ? " · " + backupText : ""));
      })
      .catch(() => {
        setReady(false);
        setStatus("Impossible de vérifier la configuration du serveur");
      });
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const conversation = [...messages.slice(1), { role: "user" as const, content: text }].slice(-10);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: conversation.slice(0, -1) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur inconnue");
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
      setReady(true);
      setStatus((data.provider === "openrouter" ? "OpenRouter" : "OpenAI") + " connecté · modèle " + data.model);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Impossible de contacter les fournisseurs IA."
      }]);
      setReady(false);
      setStatus("La requête n'a pas abouti");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="header app-header">
        <div className="brand">
          <div className="logo">✦</div>
          <div><h1>Zodi AI</h1><p className="sub">Assistant conversationnel · IA cloud</p></div>
        </div>
        <nav className="account-nav">
          <span className="account-email">{email}</span>
          <Link href="/connections">Connexions Google</Link>
          <form action={signOutAction}><button className="secondary-button" type="submit">Quitter</button></form>
        </nav>
      </header>
      <section className="panel">
        <div className="status"><span className={`dot ${ready ? "ok" : ""}`} />{status}</div>
        <div className="chat" aria-live="polite">
          {messages.map((message, index) => (
            <div className={`message ${message.role}`} key={index}>{message.content}</div>
          ))}
          {busy && <div className="message assistant">Zodi réfléchit…</div>}
        </div>
        <form onSubmit={send}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à Zodi…" aria-label="Message" />
          <button disabled={busy || !input.trim()}>{busy ? "…" : "Envoyer"}</button>
        </form>
        <p className="hint">Tes clés IA restent côté serveur. Les connexions Google sont gérées séparément dans le centre de connexions.</p>
      </section>
    </main>
  );
}
