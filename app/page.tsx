"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

type Health = {
  ok?: boolean;
  aiConfigured?: boolean;
  provider?: string;
  providers?: string[];
  model?: string;
  modelFallbacks?: string[];
  failoverEnabled?: boolean;
  localAI?: boolean;
};

export default function Home() {
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
        const data = (await response.json()) as Health;
        const connected = Boolean(data.ok && data.aiConfigured && data.provider && data.provider !== "none");
        setReady(connected);
        if (!connected) {
          setStatus("Aucun fournisseur IA cloud configuré");
          return;
        }

        const providerName = data.provider === "openrouter" ? "OpenRouter" : "OpenAI";
        const modelFallbackCount = data.modelFallbacks?.length || 0;
        const providerFallbackCount = Math.max(0, (data.providers?.length || 0) - 1);
        const backupText = [
          modelFallbackCount ? modelFallbackCount + " modèles de secours" : "",
          providerFallbackCount ? providerFallbackCount + " fournisseur(s) secondaire(s)" : ""
        ].filter(Boolean).join(" · ");
        setStatus(
          "Configuration cloud OK · " + providerName + " · " + data.model +
          (backupText ? " · " + backupText : "")
        );
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
      const providerName = data.provider === "openrouter" ? "OpenRouter" : "OpenAI";
      setStatus(providerName + " connecté · modèle " + data.model);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Impossible de contacter les fournisseurs IA."
      }]);
      setReady(false);
      setStatus("Tous les fournisseurs configurés ont échoué");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="header">
        <div className="logo">✦</div>
        <div><h1>Zodi AI</h1><p className="sub">Assistant conversationnel · IA cloud résiliente</p></div>
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
        <p className="hint">IA hébergée dans le cloud uniquement. Routage automatique vers des modèles de secours et, si configuré, un second fournisseur. Aucune IA locale ni Ollama. Les clés API restent côté serveur.</p>
      </section>
    </main>
  );
}
