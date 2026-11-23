"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

type Health = {
  ok?: boolean;
  aiConfigured?: boolean;
  provider?: string;
  model?: string;
  localAI?: boolean;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Salut ! Je suis Zodi. Tu peux discuter avec moi ici." }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Vérification du serveur…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed");
        const data = (await response.json()) as Health;
        const connected = Boolean(data.ok && data.aiConfigured && data.provider && data.provider !== "unsupported");
        setReady(connected);
        setStatus(
          connected
            ? `${data.provider === "openrouter" ? "OpenRouter" : "OpenAI"} prêt · modèle ${data.model}`
            : "Serveur accessible · clé API cloud à configurer"
        );
      })
      .catch(() => {
        setReady(false);
        setStatus("Serveur inaccessible");
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
      setStatus(`${data.provider === "openrouter" ? "OpenRouter" : "OpenAI"} connecté · modèle ${data.model}`);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Impossible de contacter le fournisseur IA."
      }]);
      setReady(false);
      setStatus("Échec de la génération IA");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="header">
        <div className="logo">✦</div>
        <div><h1>Zodi AI</h1><p className="sub">Assistant conversationnel · IA cloud</p></div>
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
        <p className="hint">IA hébergée dans le cloud uniquement. Aucune IA locale ni Ollama n’est utilisé. La clé API reste côté serveur.</p>
      </section>
    </main>
  );
}
