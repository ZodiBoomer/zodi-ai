"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; messages: Message[]; createdAt: number; updatedAt: number };
type Health = { ok?: boolean; aiConfigured?: boolean; provider?: string; providers?: string[]; model?: string; modelFallbacks?: string[] };

const STORAGE_KEY = "zodi-ai-conversations-v1";
const WELCOME: Message = { role: "assistant", content: "Salut ! Je suis Zodi. Que veux-tu faire aujourd'hui ?" };

function createConversation(): Conversation {
  const now = Date.now();
  return { id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(now) + Math.random().toString(36).slice(2), title: "Nouvelle conversation", messages: [WELCOME], createdAt: now, updatedAt: now };
}
function makeTitle(value: string) {
  const title = value.replace(/\s+/g, " ").trim();
  return title.length > 42 ? title.slice(0, 39) + "…" : title || "Nouvelle conversation";
}
function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createConversation()];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [createConversation()];
    const valid = parsed.filter((item): item is Conversation => Boolean(item) && typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.messages) && typeof item.updatedAt === "number")
      .map((item) => ({ ...item, messages: item.messages.filter((message: unknown): message is Message => Boolean(message) && typeof message === "object" && ((message as Message).role === "user" || (message as Message).role === "assistant") && typeof (message as Message).content === "string") }));
    return valid.length ? valid.sort((a, b) => b.updatedAt - a.updatedAt) : [createConversation()];
  } catch { return [createConversation()]; }
}
function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Vérification de la configuration cloud…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadConversations();
    setConversations(saved);
    const savedId = localStorage.getItem(STORAGE_KEY + "-active");
    setActiveId(saved.some((item) => item.id === savedId) ? savedId as string : saved[0].id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      localStorage.setItem(STORAGE_KEY + "-active", activeId);
    } catch {
      setStatus("Stockage local indisponible : les conversations ne seront pas conservées.");
    }
  }, [conversations, activeId, hydrated]);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Health check failed");
      const data = await response.json() as Health;
      const connected = Boolean(data.ok && data.aiConfigured && data.provider && data.provider !== "none");
      setReady(connected);
      if (!connected) { setStatus("Aucun fournisseur IA cloud configuré"); return; }
      const provider = data.provider === "openrouter" ? "OpenRouter" : "OpenAI";
      const extras = [data.modelFallbacks?.length ? data.modelFallbacks.length + " modèles de secours" : "", (data.providers?.length || 0) > 1 ? (data.providers!.length - 1) + " fournisseur(s) secondaire(s)" : ""].filter(Boolean).join(" · ");
      setStatus("Configuration cloud OK · " + provider + " · " + data.model + (extras ? " · " + extras : ""));
    }).catch(() => { setReady(false); setStatus("Impossible de vérifier la configuration du serveur"); });
  }, []);

  const active = conversations.find((item) => item.id === activeId) || null;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).filter((item) => !query || item.title.toLocaleLowerCase("fr").includes(query));
  }, [conversations, search]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [activeId, active?.messages.length, busy]);

  function newConversation() {
    const item = createConversation();
    setConversations((current) => [item, ...current]);
    setActiveId(item.id); setInput(""); setSearch(""); setSidebarOpen(false);
  }
  function renameConversation(item: Conversation) {
    const value = window.prompt("Nouveau nom de la conversation :", item.title);
    if (value === null) return;
    setConversations((current) => current.map((entry) => entry.id === item.id ? { ...entry, title: makeTitle(value), updatedAt: Date.now() } : entry));
  }
  function deleteConversation(item: Conversation) {
    if (!window.confirm("Supprimer « " + item.title + " » ? Cette action est définitive sur cet appareil.")) return;
    const remaining = conversations.filter((entry) => entry.id !== item.id);
    if (!remaining.length) { const fresh = createConversation(); setConversations([fresh]); setActiveId(fresh.id); return; }
    setConversations(remaining);
    if (activeId === item.id) setActiveId([...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || !active) return;
    const previous = active.messages.filter((message) => !(active.messages.length === 1 && message.content === WELCOME.content));
    const now = Date.now();
    const outgoing = [...previous, { role: "user" as const, content: text }];
    setConversations((current) => current.map((item) => item.id === activeId ? { ...item, title: item.title === "Nouvelle conversation" ? makeTitle(text) : item.title, messages: outgoing, updatedAt: now } : item));
    setInput(""); setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history: previous }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur inconnue");
      setConversations((current) => current.map((item) => item.id === activeId ? { ...item, messages: [...item.messages, { role: "assistant", content: data.reply }], updatedAt: Date.now() } : item));
      setReady(true); setStatus((data.provider === "openrouter" ? "OpenRouter" : "OpenAI") + " connecté · modèle " + data.model);
    } catch (error) {
      setConversations((current) => current.map((item) => item.id === activeId ? { ...item, messages: [...item.messages, { role: "assistant", content: error instanceof Error ? error.message : "Impossible de contacter les fournisseurs IA." }], updatedAt: Date.now() } : item));
      setReady(false); setStatus("Tous les fournisseurs configurés ont échoué");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Fermer le menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={"sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="sidebar-brand"><div className="brand-mark">✦</div><span>Zodi AI</span><button className="icon-button sidebar-close" aria-label="Fermer le menu" onClick={() => setSidebarOpen(false)}>×</button></div>
        <button className="new-chat-button" onClick={newConversation}><span className="new-chat-plus">＋</span> Nouvelle conversation</button>
        <label className="conversation-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une conversation" /></label>
        <div className="history-label">RÉCENT</div>
        <nav className="conversation-list" aria-label="Historique des conversations">
          {filtered.map((item) => <div className={"conversation-row " + (item.id === activeId ? "conversation-active" : "")} key={item.id}>
            <button className="conversation-select" onClick={() => { setActiveId(item.id); setSidebarOpen(false); }}><span className="conversation-title">{item.title}</span><span className="conversation-date">{formatDate(item.updatedAt)}</span></button>
            <div className="conversation-actions"><button className="mini-action" aria-label={"Options pour " + item.title} title="Options">···</button><div className="action-menu"><button onClick={() => renameConversation(item)}>Renommer</button><button onClick={() => deleteConversation(item)}>Supprimer</button></div></div>
          </div>)}
          {filtered.length === 0 && <p className="empty-history">Aucune conversation trouvée.</p>}
        </nav>
        <div className="sidebar-footer"><div className="profile-avatar">Z</div><div className="profile-copy"><strong>Zodi AI</strong><span>Assistant personnel</span></div><span className="online-indicator" title="Application prête" /></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Ouvrir l'historique" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="topbar-title"><strong>{active?.title || "Zodi AI"}</strong><span><i className={"status-dot " + (ready ? "status-ready" : "")} />{status}</span></div>
          <button className="topbar-new" onClick={newConversation}>＋ <span>Nouveau</span></button>
        </header>
        <div className="chat-scroll"><div className="chat-content" aria-live="polite">
          {active?.messages.map((message, index) => <div className={"message-line " + message.role} key={activeId + "-" + index}>
            {message.role === "assistant" && <div className="assistant-avatar">✦</div>}
            <div className="message-bubble">{message.content}</div>
          </div>)}
          {busy && <div className="message-line assistant"><div className="assistant-avatar">✦</div><div className="message-bubble typing">Zodi réfléchit…</div></div>}
          <div ref={endRef} />
        </div></div>
        <div className="composer-area">
          <form className="composer" onSubmit={send}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Écris un message à Zodi…" aria-label="Message" rows={1} />
            <button className="send-button" disabled={busy || !input.trim()} aria-label="Envoyer le message">{busy ? "…" : "↑"}</button>
          </form>
          <p className="composer-note">Zodi peut faire des erreurs. Pense à vérifier les informations importantes.</p>
          <p className="storage-note">Tes conversations sont enregistrées sur cet appareil, dans ce navigateur.</p>
        </div>
      </section>
    </main>
  );
}
