"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Health = {
  ok?: boolean; aiConfigured?: boolean; provider?: string; providers?: string[];
  model?: string; modelFallbacks?: string[]; failoverEnabled?: boolean; localAI?: boolean;
};
const BUILD_ID = process.env.NEXT_PUBLIC_ZODI_BUILD_ID ?? "local";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Salut ! Je suis Zodi. Tu peux discuter avec moi ici." }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Vérification de la configuration cloud…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("Vérifier les mises à jour");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const checkingUpdateRef = useRef(false);

  const checkForUpdates = useCallback(async (reloadWhenAvailable = false) => {
    if (checkingUpdateRef.current) return;
    checkingUpdateRef.current = true;
    setCheckingUpdate(true);
    setUpdateStatus("Vérification…");
    try {
      const response = await fetch("/api/version", { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (!response.ok) throw new Error("Service de version indisponible");
      const data = (await response.json()) as { buildId?: string };
      const latestBuild = data.buildId ?? "unknown";
      const available = latestBuild !== "unknown" && BUILD_ID !== "local" && latestBuild !== BUILD_ID;
      if (available) {
        setUpdateStatus("Mise à jour disponible · Recharger");
        if (reloadWhenAvailable) window.location.reload();
      } else setUpdateStatus("Zodi AI est à jour");
    } catch {
      setUpdateStatus("Vérification impossible · Réessayer");
    } finally {
      checkingUpdateRef.current = false;
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed");
        const data = (await response.json()) as Health;
        const connected = Boolean(data.ok && data.aiConfigured && data.provider && data.provider !== "none");
        setReady(connected);
        if (!connected) { setStatus("Aucun fournisseur IA cloud configuré"); return; }
        const providerName = data.provider === "openrouter" ? "OpenRouter" : "OpenAI";
        const modelFallbackCount = data.modelFallbacks?.length || 0;
        const providerFallbackCount = Math.max(0, (data.providers?.length || 0) - 1);
        const backupText = [
          modelFallbackCount ? modelFallbackCount + " modèles de secours" : "",
          providerFallbackCount ? providerFallbackCount + " fournisseur(s) secondaire(s)" : ""
        ].filter(Boolean).join(" · ");
        setStatus("Configuration cloud OK · " + providerName + " · " + data.model + (backupText ? " · " + backupText : ""));
      })
      .catch(() => { setReady(false); setStatus("Impossible de vérifier la configuration du serveur"); });
    void checkForUpdates(false);
    const interval = window.setInterval(() => void checkForUpdates(false), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [checkForUpdates]);

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
        method: "POST", headers: { "Content-Type": "application/json" },
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
        role: "assistant", content: error instanceof Error ? error.message : "Impossible de contacter les fournisseurs IA."
      }]);
      setReady(false);
      setStatus("Tous les fournisseurs configurés ont échoué");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-shell">
      <aside className="brand-rail" aria-label="Identité Zodi">
        <div className="brand-mark" aria-hidden="true">✦</div>
        <div className="brand-copy"><span className="eyebrow">ASSISTANT INTELLIGENT</span><h1>Zodi <span>AI</span></h1><p>Ton espace de conversation</p></div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">ESPACE PERSONNEL</span><h2>Discussion</h2></div>
          <div className="topbar-actions">
            <span className="platform-label">ZODI AI · CLOUD</span>
            <button className="button button-quiet update-button" type="button" onClick={() => void checkForUpdates(true)} disabled={checkingUpdate} aria-live="polite">
              <span aria-hidden="true">↻</span>{checkingUpdate ? "Vérification…" : updateStatus}
            </button>
          </div>
        </header>
        <section className="chat-panel" aria-label="Conversation avec Zodi">
          <div className="chat-heading">
            <div className="avatar">✦</div>
            <div className="chat-heading-copy"><h3>Zodi</h3><p>Assistant personnel</p></div>
            <div className="connection-pill"><span className={`connection-dot ${ready ? "is-ready" : ""}`} />{ready ? "En ligne" : "Connexion…"}</div>
          </div>
          <div className="status-line" role="status"><span className={`status-indicator ${ready ? "is-ready" : ""}`} />{status}</div>
          <div className="chat" aria-live="polite" aria-relevant="additions text">
            {messages.map((message, index) => (
              <div className={`message-row ${message.role}`} key={index}>
                {message.role === "assistant" && <div className="message-avatar" aria-hidden="true">✦</div>}
                <div className={`message ${message.role}`}>{message.content}</div>
              </div>
            ))}
            {busy && <div className="message-row assistant"><div className="message-avatar" aria-hidden="true">✦</div><div className="message assistant typing"><span></span><span></span><span></span><em>Zodi réfléchit…</em></div></div>}
          </div>
          <form className="composer" onSubmit={send}>
            <label className="sr-only" htmlFor="message-input">Message à Zodi</label>
            <textarea id="message-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à Zodi…" aria-label="Message" rows={1} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <button className="button button-primary send-button" disabled={busy || !input.trim()} type="submit"><span>{busy ? "…" : "Envoyer"}</span><span aria-hidden="true">↗</span></button>
            <p className="composer-hint">Entrée pour envoyer · Maj + Entrée pour un saut de ligne</p>
          </form>
        </section>
        <footer className="app-footer"><span><span className="footer-shield">◆</span> Connexion sécurisée · Les clés API restent côté serveur.</span><span>Propulsé par Zodi AI</span></footer>
      </section>
    </main>
  );
}
