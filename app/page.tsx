"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };
type Health = { ok?: boolean; aiConfigured?: boolean; provider?: string; providers?: string[]; model?: string; modelFallbacks?: string[] };
const BUILD_ID = process.env.NEXT_PUBLIC_ZODI_BUILD_ID ?? "local";
const welcome = (): Message[] => [{ role: "assistant", content: "Salut ! Je suis Zodi. Comment puis-je t'aider aujourd'hui ?" }];
const createConversation = (): Conversation => ({ id: crypto.randomUUID(), title: "Nouvelle discussion", messages: welcome(), updatedAt: Date.now() });

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Connexion au service…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [updateStatus, setUpdateStatus] = useState("Vérifier les mises à jour");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const checkingUpdateRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const active = conversations.find((item) => item.id === activeId);
  const messages = active?.messages ?? [];

  useEffect(() => {
    let stored: Conversation[] = [];
    try { stored = JSON.parse(localStorage.getItem("zodi-conversations-v2") || "[]"); } catch {}
    const initial = stored.length ? stored : [createConversation()];
    setConversations(initial); setActiveId(initial[0].id);
  }, []);
  useEffect(() => { if (conversations.length) localStorage.setItem("zodi-conversations-v2", JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, busy]);

  const checkForUpdates = useCallback(async (reload = false) => {
    if (checkingUpdateRef.current) return;
    checkingUpdateRef.current = true; setCheckingUpdate(true); setUpdateStatus("Vérification…");
    try {
      const response = await fetch("/api/version", { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (!response.ok) throw new Error();
      const data = await response.json() as { buildId?: string };
      const available = Boolean(data.buildId && data.buildId !== "unknown" && BUILD_ID !== "local" && data.buildId !== BUILD_ID);
      if (available) { setUpdateStatus("Mise à jour disponible · Recharger"); if (reload) window.location.reload(); }
      else setUpdateStatus("Zodi AI est à jour");
    } catch { setUpdateStatus("Vérification impossible · Réessayer"); }
    finally { checkingUpdateRef.current = false; setCheckingUpdate(false); }
  }, []);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json() as Health;
      const connected = Boolean(data.ok && data.aiConfigured && data.provider && data.provider !== "none");
      setReady(connected);
      if (!connected) { setStatus("Aucun fournisseur IA cloud configuré"); return; }
      const provider = data.provider === "openrouter" ? "OpenRouter" : "OpenAI";
      setStatus(provider + " connecté · " + data.model);
    }).catch(() => { setReady(false); setStatus("Impossible de vérifier la connexion"); });
    void checkForUpdates(false);
    const timer = window.setInterval(() => void checkForUpdates(false), 300000);
    return () => window.clearInterval(timer);
  }, [checkForUpdates]);

  function startNewChat() {
    const item = createConversation();
    setConversations((all) => [item, ...all]); setActiveId(item.id); setInput("");
  }
  function updateConversation(id: string, transform: (item: Conversation) => Conversation) {
    setConversations((all) => all.map((item) => item.id === id ? transform(item) : item).sort((a, b) => b.updatedAt - a.updatedAt));
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || !active) return;
    const id = active.id, history = active.messages.slice(-10);
    const userMessages = [...active.messages, { role: "user" as const, content: text }];
    updateConversation(id, (item) => ({ ...item, title: item.title === "Nouvelle discussion" ? text.slice(0, 38) + (text.length > 38 ? "…" : "") : item.title, messages: userMessages, updatedAt: Date.now() }));
    setInput(""); setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur inconnue");
      updateConversation(id, (item) => ({ ...item, messages: [...item.messages, { role: "assistant", content: data.reply }], updatedAt: Date.now() }));
      setReady(true); setStatus((data.provider === "openrouter" ? "OpenRouter" : "OpenAI") + " connecté · modèle " + data.model);
    } catch (error) {
      updateConversation(id, (item) => ({ ...item, messages: [...item.messages, { role: "assistant", content: error instanceof Error ? error.message : "Impossible de contacter les fournisseurs IA." }], updatedAt: Date.now() }));
      setReady(false); setStatus("Échec de la connexion IA");
    } finally { setBusy(false); }
  }

  return (
    <main className={`chatgpt-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="icon-button" type="button" onClick={() => setSidebarOpen(false)} aria-label="Réduire le menu" title="Réduire le menu">☰</button>
          <button className="icon-button" type="button" onClick={startNewChat} aria-label="Nouvelle discussion" title="Nouvelle discussion">＋</button>
        </div>
        <button className="new-chat-button" type="button" onClick={startNewChat}>＋　Nouvelle discussion</button>
        <div className="history-label">Historique</div>
        <nav className="conversation-list" aria-label="Historique des conversations">
          {conversations.map((item) => <button key={item.id} type="button" className={`conversation-item ${item.id === activeId ? "active" : ""}`} onClick={() => setActiveId(item.id)} title={item.title}><span>◌</span><span className="conversation-title">{item.title}</span></button>)}
        </nav>
        <div className="sidebar-bottom"><div className="profile-avatar">Z</div><div className="profile-copy"><strong>Zodi AI</strong><span>Assistant personnel</span></div><i className={ready ? "online-dot" : "offline-dot"} /></div>
      </aside>
      <section className="main-chat">
        <header className="chat-topbar">
          <div className="topbar-left">
            {!sidebarOpen && <button className="icon-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Afficher le menu">☰</button>}
            <button className="model-selector" type="button">Zodi <span>AI</span>　⌄</button>
          </div>
          <div className="topbar-right"><span className={`connection-label ${ready ? "online" : ""}`}><i />{ready ? "En ligne" : "Connexion…"}</span><button className="icon-button" type="button" onClick={() => void checkForUpdates(true)} disabled={checkingUpdate} title={updateStatus} aria-label={updateStatus}>↻</button></div>
        </header>
        <div className="conversation-viewport">
          <div className={`messages-container ${messages.length <= 1 ? "welcome-state" : ""}`}>
            {messages.length <= 1 ? <div className="welcome-panel">
              <div className="welcome-mark">✳</div><h1>Que puis-je faire pour toi ?</h1><p>Pose une question, partage une idée ou lance un projet.</p>
              <div className="suggestion-grid">
                <button type="button" onClick={() => setInput("Aide-moi à organiser ma journée")}><strong>Organiser ma journée</strong><span>Planifier et prioriser mes tâches</span></button>
                <button type="button" onClick={() => setInput("Explique-moi un sujet simplement")}><strong>Apprendre quelque chose</strong><span>Comprendre un sujet étape par étape</span></button>
                <button type="button" onClick={() => setInput("Aide-moi à écrire un texte")}><strong>Écrire un texte</strong><span>Rédiger, corriger ou reformuler</span></button>
                <button type="button" onClick={() => setInput("Aide-moi sur mon projet")}><strong>Faire avancer un projet</strong><span>Réfléchir et passer à l'action</span></button>
              </div>
            </div> : <div className="message-stack">
              {messages.map((message, index) => <article className={`message-row ${message.role}`} key={index}>
                {message.role === "assistant" && <div className="assistant-mark">✳</div>}
                <div className={`message-content ${message.role}`}>{message.content}</div>
              </article>)}
              {busy && <div className="message-row assistant"><div className="assistant-mark">✳</div><div className="thinking">Zodi réfléchit…</div></div>}
              <div ref={chatEndRef} />
            </div>}
          </div>
        </div>
        <div className="composer-area">
          <form className="chat-composer" onSubmit={send}>
            <label className="sr-only" htmlFor="message-input">Message à Zodi</label>
            <textarea id="message-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à Zodi" rows={1} aria-label="Message à Zodi" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="composer-actions"><span>Entrée pour envoyer · Maj + Entrée pour un saut de ligne</span><button className="send-button" disabled={busy || !input.trim()} type="submit" aria-label="Envoyer le message" title="Envoyer">↑</button></div>
          </form>
          <p className="disclaimer">Zodi AI peut faire des erreurs. Pense à vérifier les informations importantes.</p>
        </div>
      </section>
    </main>
  );
}
