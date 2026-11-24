"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { signOutAction } from "./logout-action";

type Message = { id?: string; role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; updatedAt: string };
type Memory = { id: string; content: string; category: string };

type Health = {
  ok?: boolean; aiConfigured?: boolean; provider?: string; providers?: string[];
  model?: string; modelFallbacks?: string[];
};

export default function ChatClient({ email }: { email: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Chargement de tes conversations…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryInput, setMemoryInput] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossible de charger les conversations.");
    setConversations(data.conversations || []);
    return data.conversations as Conversation[];
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    const response = await fetch("/api/conversations/" + encodeURIComponent(id), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossible d'ouvrir cette conversation.");
    setMessages((data.conversation.messages || []).map((item: Message) => ({
      id: item.id, role: item.role, content: item.content
    })));
  }, []);

  const createConversation = useCallback(async () => {
    const response = await fetch("/api/conversations", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossible de créer une conversation.");
    const conversation = data.conversation as Conversation;
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setMessages([]);
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadConversations();
        if (cancelled) return;
        if (list.length) {
          await openConversation(list[0].id);
        } else {
          await createConversation();
        }
        if (!cancelled) setStatus("Conversations synchronisées");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Erreur de chargement");
      }
    })();
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json() as Health;
        const connected = Boolean(data.ok && data.aiConfigured && data.provider && data.provider !== "none");
        setReady(connected);
        if (connected) setStatus("IA cloud connectée · " + (data.provider === "openrouter" ? "OpenRouter" : "OpenAI") + " · " + data.model);
        else setStatus("Aucun fournisseur IA cloud configuré");
      })
      .catch(() => { setReady(false); setStatus("Impossible de vérifier la configuration IA"); });
    return () => { cancelled = true; };
  }, [createConversation, loadConversations, openConversation]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || !activeId) return;
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: activeId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur inconnue");
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
      setReady(true);
      setStatus((data.provider === "openrouter" ? "OpenRouter" : "OpenAI") + " connecté · modèle " + data.model);
      await loadConversations();
      if (/^(Retiens|Souviens-toi|Mémorise)/i.test(text)) await refreshMemories();
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

  async function refreshMemories() {
    const response = await fetch("/api/memories", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setMemories(data.memories || []);
  }

  async function toggleMemory() {
    const next = !memoryOpen;
    setMemoryOpen(next);
    if (next) await refreshMemories();
  }

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = memoryInput.trim();
    if (!content || memoryBusy) return;
    setMemoryBusy(true);
    try {
      const response = await fetch("/api/memories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible d'enregistrer la mémoire.");
      setMemories((current) => [data.memory, ...current]);
      setMemoryInput("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erreur mémoire");
    } finally { setMemoryBusy(false); }
  }

  async function deleteMemory(id: string) {
    const response = await fetch("/api/memories?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (response.ok) setMemories((current) => current.filter((item) => item.id !== id));
  }

  async function archiveConversation(id: string) {
    const response = await fetch("/api/conversations/" + encodeURIComponent(id), { method: "DELETE" });
    if (!response.ok) return;
    const next = conversations.filter((item) => item.id !== id);
    setConversations(next);
    if (activeId === id) {
      if (next.length) await openConversation(next[0].id);
      else await createConversation();
    }
  }

  return (
    <main className="app-shell">
      <aside className={"sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="sidebar-top">
          <div className="brand"><div className="logo">✦</div><div><h1>Zodi AI</h1><p className="sub">Tes conversations</p></div></div>
          <button className="new-chat-button" onClick={createConversation} disabled={busy}>+ Nouvelle discussion</button>
        </div>
        <div className="conversation-list">
          {conversations.map((item) => (
            <div className={"conversation-item " + (activeId === item.id ? "active" : "")} key={item.id}>
              <button className="conversation-select" onClick={() => openConversation(item.id)} disabled={busy}>
                <span>{item.title}</span>
              </button>
              <button className="archive-button" title="Archiver la conversation" aria-label="Archiver la conversation" onClick={() => archiveConversation(item.id)} disabled={busy}>×</button>
            </div>
          ))}
          {!conversations.length && <p className="muted">Aucune discussion enregistrée.</p>}
        </div>
        <div className="sidebar-bottom">
          <button className="memory-button" onClick={toggleMemory}>🧠 Mémoire de Zodi</button>
          <span className="account-email">{email}</span>
          <Link href="/connections">Connexions Google</Link>
          <form action={signOutAction}><button className="secondary-button" type="submit">Déconnexion</button></form>
        </div>
      </aside>

      <section className="chat-area">
        <header className="chat-topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Ouvrir les conversations">☰</button>
          <div><strong>{conversations.find((item) => item.id === activeId)?.title || "Nouvelle discussion"}</strong><p className="sub">{status}</p></div>
          <span className={"dot " + (ready ? "ok" : "")} />
        </header>
        <section className="chat-panel">
          <div className="chat" aria-live="polite">
            {!messages.length && <div className="welcome-message"><h2>Bonjour !</h2><p>Que souhaites-tu faire aujourd'hui ?</p></div>}
            {messages.map((message, index) => (
              <div className={"message " + message.role} key={message.id || index}>{message.content}</div>
            ))}
            {busy && <div className="message assistant">Zodi réfléchit…</div>}
            <div ref={chatEnd} />
          </div>
          <form className="composer" onSubmit={send}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à Zodi…" aria-label="Message" />
            <button disabled={busy || !input.trim() || !activeId}>{busy ? "…" : "Envoyer"}</button>
          </form>
          <p className="hint">Tes conversations et ta mémoire sont sauvegardées sur ton compte. Seul ton compte Google peut y accéder.</p>
        </section>
      </section>

      {memoryOpen && (
        <div className="memory-overlay" role="dialog" aria-modal="true" aria-label="Mémoire de Zodi">
          <section className="memory-card">
            <div className="memory-heading"><div><h2>Mémoire de Zodi</h2><p className="muted">Les informations enregistrées pour mieux te répondre.</p></div><button className="secondary-button" onClick={() => setMemoryOpen(false)}>Fermer</button></div>
            <form className="memory-form" onSubmit={saveMemory}>
              <textarea value={memoryInput} onChange={(event) => setMemoryInput(event.target.value)} placeholder="Ajouter une information à retenir…" aria-label="Nouvelle mémoire" />
              <button disabled={memoryBusy || !memoryInput.trim()}>{memoryBusy ? "…" : "Enregistrer"}</button>
            </form>
            <div className="memory-list">
              {memories.map((item) => <div className="memory-item" key={item.id}><p>{item.content}</p><button className="archive-button" onClick={() => deleteMemory(item.id)} aria-label="Supprimer cette mémoire">×</button></div>)}
              {!memories.length && <p className="muted">Aucune mémoire enregistrée. Tu peux en ajouter ici ou dire « Retiens que… » dans une discussion.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
