"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Salut ! Je suis le noyau de Zodi AI. Envoie-moi un message pour tester la connexion au modèle." }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Vérification du serveur…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        const data = await r.json();
        setReady(Boolean(data.ok && data.aiConfigured));
        setStatus(data.aiConfigured ? "Serveur prêt · clé API détectée" : "Serveur prêt · clé API à configurer");
      })
      .catch(() => setStatus("Serveur inaccessible"));
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur inconnue");
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
      setReady(true);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Impossible de contacter le modèle."
      }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="header">
        <div className="logo">✦</div>
        <div><h1>Zodi AI</h1><p className="sub">Prototype · noyau conversationnel</p></div>
      </header>
      <section className="panel">
        <div className="status"><span className={`dot ${ready ? "ok" : ""}`} />{status}</div>
        <div className="chat" aria-live="polite">
          {messages.map((message, index) => (
            <div className={`message ${message.role}`} key={index}>{message.content}</div>
          ))}
        </div>
        <form onSubmit={send}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à Zodi AI…" aria-label="Message" />
          <button disabled={busy || !input.trim()}>{busy ? "…" : "Envoyer"}</button>
        </form>
        <p className="hint">Prototype privé. La clé API reste côté serveur et n’est jamais envoyée au navigateur.</p>
      </section>
    </main>
  );
}
