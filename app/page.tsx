"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type ImageAttachment = { dataUrl: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; name: string };
type Message = { role: "user" | "assistant"; content: string; images?: ImageAttachment[] };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };
type Health = { ok?: boolean; aiConfigured?: boolean; provider?: string; providers?: string[]; model?: string; modelFallbacks?: string[] };
const BUILD_ID = process.env.NEXT_PUBLIC_ZODI_BUILD_ID ?? "local";
const welcome = (): Message[] => [{ role: "assistant", content: "Salut ! Je suis Zodi. Comment puis-je t'aider aujourd'hui ?" }];
const createConversation = (): Conversation => ({ id: crypto.randomUUID(), title: "Nouvelle discussion", messages: welcome(), updatedAt: Date.now() });


type IconName = "menu" | "plus" | "edit" | "trash" | "refresh" | "copy" | "share" | "image" | "send" | "sparkles" | "message-square";
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <><path d="m15 5 4 4M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
    share: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
    send: <><path d="m5 12 14-7-4 14-3-6-7-1Z" /><path d="m12 13 7-8" /></>,
    sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    "message-square": <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.5-3A7.5 7.5 0 1 1 20 11.5Z" /></>
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function inlineMarkdown(text: string): ReactNode[] {
  const codeMark = String.fromCharCode(96);
  const token = new RegExp("(" + codeMark + "[^" + codeMark + "]+"+ codeMark + "|\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|\\[[^\\]]+\\]\\(https?:\\/\\/[^)]+\\))","g");
  return text.split(token).filter(Boolean).map((part, index) => {
    if (part.startsWith(codeMark) && part.endsWith(codeMark)) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}

function AssistantContent({ content }: { content: string }) {
  const fence = String.fromCharCode(96).repeat(3);
  const blocks: Array<{ kind: "text" | "code"; value: string }> = [];
  let buffer: string[] = [];
  let codeBuffer: string[] = [];
  let inCode = false;
  const flushText = () => {
    if (buffer.length) { blocks.push({ kind: "text", value: buffer.join("\n") }); buffer = []; }
  };
  for (const line of content.split("\n")) {
    if (line.trimStart().startsWith(fence)) {
      if (inCode) { blocks.push({ kind: "code", value: codeBuffer.join("\n") }); codeBuffer = []; inCode = false; }
      else { flushText(); inCode = true; }
      continue;
    }
    if (inCode) codeBuffer.push(line);
    else if (!line.trim()) flushText();
    else buffer.push(line);
  }
  if (inCode) blocks.push({ kind: "code", value: codeBuffer.join("\n") });
  else flushText();

  return <div className="rich-content">{blocks.map((item, index) => {
    if (item.kind === "code") return <pre key={index}><code>{item.value}</code></pre>;
    const lines = item.value.split("\n");
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0]);
    if (heading) {
      if (heading[1].length === 1) return <h2 key={index}>{inlineMarkdown(heading[2])}</h2>;
      if (heading[1].length === 2) return <h3 key={index}>{inlineMarkdown(heading[2])}</h3>;
      return <h4 key={index}>{inlineMarkdown(heading[2])}</h4>;
    }
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) return <ul key={index}>{lines.map((line, i) => <li key={i}>{inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>;
    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) return <ol key={index}>{lines.map((line, i) => <li key={i}>{inlineMarkdown(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
    if (lines.every((line) => line.startsWith(">"))) return <blockquote key={index}>{inlineMarkdown(lines.map((line) => line.replace(/^>\s?/, "")).join(" "))}</blockquote>;
    return <p key={index}>{inlineMarkdown(item.value.replace(/\n/g, " "))}</p>;
  })}</div>;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Connexion au service…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyQuery, setHistoryQuery] = useState("");
  const [updateStatus, setUpdateStatus] = useState("Vérifier les mises à jour");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const checkingUpdateRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const active = conversations.find((item) => item.id === activeId);
  const messages = active?.messages ?? [];
  const visibleConversations = conversations.filter((item) => item.title.toLowerCase().includes(historyQuery.trim().toLowerCase()) || item.messages.some((message) => message.content.toLowerCase().includes(historyQuery.trim().toLowerCase())));
  const statusTone = /échec|impossible|erreur|indisponible/i.test(status) ? "danger" : ready ? "success" : /vérification|recherche/i.test(status) ? "info" : "warning";

  useEffect(() => {
    let stored: Conversation[] = [];
    try { stored = JSON.parse(localStorage.getItem("zodi-conversations-v2") || "[]"); } catch {}
    const initial = stored.length ? stored : [createConversation()];
    setConversations(initial); setActiveId(initial[0].id);
  }, []);
  useEffect(() => { if (conversations.length) localStorage.setItem("zodi-conversations-v2", JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncViewport = () => document.documentElement.style.setProperty("--zodi-visual-height", `${Math.round(viewport.height)}px`);
    syncViewport();
    viewport.addEventListener("resize", syncViewport);
    viewport.addEventListener("scroll", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      viewport.removeEventListener("resize", syncViewport);
      viewport.removeEventListener("scroll", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
      document.documentElement.style.removeProperty("--zodi-visual-height");
    };
  }, []);
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
    setConversations((all) => [item, ...all]);
    setActiveId(item.id);
    setInput("");
    setPendingImages([]);
    if (window.matchMedia("(max-width: 720px)").matches) setSidebarOpen(false);
  }
  function updateConversation(id: string, transform: (item: Conversation) => Conversation) {
    setConversations((all) => all.map((item) => item.id === id ? transform(item) : item).sort((a, b) => b.updatedAt - a.updatedAt));
  }
  function renameActiveChat() {
    if (!active || busy) return;
    const value = window.prompt("Nouveau nom de la conversation :", active.title);
    if (value?.trim()) updateConversation(active.id, (item) => ({ ...item, title: value.trim(), updatedAt: Date.now() }));
  }
  function deleteActiveChat() {
    if (!active || busy || !window.confirm("Supprimer cette conversation de cet appareil ?")) return;
    const remaining = conversations.filter((item) => item.id !== active.id);
    const next = remaining.length ? remaining : [createConversation()];
    setConversations(next);
    setActiveId(next[0].id);
    setInput("");
    setPendingImages([]);
  }
  async function addImages(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files).filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    if (selected.length !== files.length) setStatus("Formats acceptés : JPG, PNG et WEBP.");
    if (pendingImages.length + selected.length > 4) { setStatus("Tu peux joindre 4 images maximum."); return; }
    const converted: ImageAttachment[] = [];
    for (const file of selected) {
      try {
        const source = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Lecture impossible")); reader.readAsDataURL(file);
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Image illisible")); image.src = source;
        });
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const context = canvas.getContext("2d"); if (!context) throw new Error("Conversion image impossible");
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        let quality = 0.72;
        while (dataUrl.length > 950000 && quality > 0.4) { dataUrl = canvas.toDataURL("image/jpeg", quality); quality -= 0.1; }
        if (dataUrl.length > 950000) throw new Error("Image trop volumineuse après compression.");
        const imageBytes = Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4);
        const usedBytes = [...pendingImages, ...converted].reduce((sum, image) => sum + Math.floor((image.dataUrl.length - image.dataUrl.indexOf(",") - 1) * 3 / 4), 0);
        if (usedBytes + imageBytes > 2 * 1024 * 1024) throw new Error("Les photos jointes ne doivent pas dépasser 2 Mo au total.");
        converted.push({ dataUrl, mimeType: "image/jpeg", name: file.name });
      } catch (error) { setStatus(error instanceof Error ? error.message : "Image invalide."); }
    }
    setPendingImages((current) => [...current, ...converted].slice(0, 4));
    if (imageInputRef.current) imageInputRef.current.value = "";
  }
  async function copyMessage(content: string) {
    try { await navigator.clipboard.writeText(content); setStatus("Réponse copiée"); }
    catch { setStatus("Copie impossible depuis ce navigateur"); }
  }
  async function shareMessage(content: string) {
    try {
      if (navigator.share) await navigator.share({ title: "Réponse de Zodi AI", text: content });
      else await navigator.clipboard.writeText(content);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") setStatus("Partage indisponible");
    }
  }
  async function regenerate(index: number) {
    if (!active || busy) return;
    const prior = active.messages.slice(0, index);
    const lastUser = prior.map((message, i) => message.role === "user" ? i : -1).filter((i) => i >= 0).at(-1);
    if (lastUser === undefined) return;
    const history = prior.slice(0, lastUser).slice(-10);
    const userMessage = prior[lastUser];
    setBusy(true);
    updateConversation(active.id, (item) => ({ ...item, messages: item.messages.slice(0, index), updatedAt: Date.now() }));
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content, history, images: (userMessage.images || []).map(({ dataUrl, mimeType }) => ({ dataUrl, mimeType })) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de régénérer la réponse");
      updateConversation(active.id, (item) => ({ ...item, messages: [...item.messages, { role: "assistant", content: data.reply }], updatedAt: Date.now() }));
    } catch (error) {
      updateConversation(active.id, (item) => ({ ...item, messages: [...item.messages, { role: "assistant", content: error instanceof Error ? error.message : "Erreur pendant la régénération." }], updatedAt: Date.now() }));
    } finally { setBusy(false); }
  }

  async function send(event?: FormEvent<HTMLFormElement>, suggestedText?: string) {
    event?.preventDefault();
    const text = (suggestedText ?? input).trim();
    if ((!text && !pendingImages.length) || busy || !active) return;
    const images = pendingImages;
    const id = active.id, history = active.messages.slice(-10);
    const latestImageMessage = images.length ? -1 : history.reduce((last, message, index) => message.images?.length ? index : last, -1);
    const requestHistory = history.map((message, index) => ({ ...message, images: index === latestImageMessage ? message.images : undefined }));
    const userMessages = [...active.messages, { role: "user" as const, content: text || "Analyse cette image.", images }];
    updateConversation(id, (item) => ({ ...item, title: item.title === "Nouvelle discussion" ? text.slice(0, 38) + (text.length > 38 ? "…" : "") : item.title, messages: userMessages, updatedAt: Date.now() }));
    setInput(""); setPendingImages([]); setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history: requestHistory, images: images.map(({ dataUrl, mimeType }) => ({ dataUrl, mimeType })) }) });
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
    <main
      className={`chatgpt-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}
      onTouchStart={(event) => {
        if (window.matchMedia("(min-width: 721px)").matches) return;
        const touch = event.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, target: event.target };
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start || window.matchMedia("(min-width: 721px)").matches) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dy) > 85 || Math.abs(dx) < 70) return;
        const target = start.target;
        if (target instanceof HTMLElement && target.closest("button,input,textarea,a,[contenteditable=true]")) return;
        if (sidebarOpen && dx < -70) setSidebarOpen(false);
        else if (!sidebarOpen && start.x >= 28 && start.x <= 64 && dx > 75) setSidebarOpen(true);
      }}
    >
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="icon-button" type="button" onClick={() => setSidebarOpen(false)} aria-label="Réduire le menu" title="Réduire le menu"><Icon name="menu" /></button>
          <button className="icon-button" type="button" onClick={startNewChat} aria-label="Nouvelle discussion" title="Nouvelle discussion"><Icon name="plus" /></button>
        </div>
        <input className="history-search" type="search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Rechercher une conversation…" aria-label="Rechercher dans l'historique" />
        <nav className="conversation-list" aria-label="Historique des conversations">
          {visibleConversations.length ? visibleConversations.map((item) => <button key={item.id} type="button" className={`conversation-item ${item.id === activeId ? "active" : ""}`} onClick={() => setActiveId(item.id)} title={item.title}><Icon name="message-square" size={15} /><span className="conversation-title">{item.title}</span></button>) : <p className="history-empty">Aucune conversation trouvée.</p>}
        </nav>
        
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Revenir à la discussion" onClick={() => setSidebarOpen(false)} />}
      <section className="main-chat">
        <header className="chat-topbar">
          <div className="topbar-left">
            <button className="icon-button" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Ouvrir ou fermer le menu" title="Menu"><Icon name="menu" /></button><span className="topbar-brand">Zodi</span>
          </div>
          <div className="topbar-right"><span className={`connection-label ${statusTone}`} title={status}><i />{ready ? "En ligne" : "Connexion…"}</span><button className="icon-button" type="button" onClick={renameActiveChat} disabled={!active || busy} title="Renommer la conversation" aria-label="Renommer la conversation"><Icon name="edit" /></button><button className="icon-button" type="button" onClick={deleteActiveChat} disabled={!active || busy} title="Supprimer la conversation" aria-label="Supprimer la conversation"><Icon name="trash" /></button><button className="icon-button" type="button" onClick={() => void checkForUpdates(true)} disabled={checkingUpdate} title={updateStatus} aria-label={updateStatus}><Icon name="refresh" /></button></div>
        </header>
        <div className="conversation-viewport">
          <div className={`messages-container ${messages.length <= 1 ? "welcome-state" : ""}`}>
            {messages.length <= 1 ? <div className="welcome-panel">
              <h1>Que puis-je faire pour toi ?</h1><p>Pose une question, partage une idée ou lance un projet.</p>
              <div className="suggestion-grid">
                <button type="button" disabled={busy} onClick={() => void send(undefined, "Aide-moi à organiser ma journée")}><strong>Organiser ma journée</strong><span>Planifier et prioriser mes tâches</span></button>
                <button type="button" disabled={busy} onClick={() => void send(undefined, "Explique-moi un sujet simplement")}><strong>Apprendre quelque chose</strong><span>Comprendre un sujet étape par étape</span></button>
                <button type="button" disabled={busy} onClick={() => void send(undefined, "Aide-moi à écrire un texte")}><strong>Écrire un texte</strong><span>Rédiger, corriger ou reformuler</span></button>
                <button type="button" disabled={busy} onClick={() => void send(undefined, "Aide-moi sur mon projet")}><strong>Faire avancer un projet</strong><span>Réfléchir et passer à l&apos;action</span></button>
              </div>
            </div> : <div className="message-stack">
              {messages.map((message, index) => <article className={`message-row ${message.role}`} key={index}>
                
                <div className="message-body">
                  {message.images?.length ? <div className={`message-images ${message.role}`} aria-label="Images envoyées">{message.images.map((image, imageIndex) => <img key={imageIndex} src={image.dataUrl} alt={image.name || "Image jointe"} />)}</div> : null}
                  <div className={`message-content ${message.role}`}>
                    {message.role === "assistant" ? <AssistantContent content={message.content} /> : message.content}
                  </div>
                  {message.role === "assistant" && index > 0 && <div className="message-actions" aria-label="Actions sur la réponse">
                    <button type="button" onClick={() => void copyMessage(message.content)} title="Copier la réponse" aria-label="Copier la réponse"><Icon name="copy" size={15} /></button>
                    <button type="button" onClick={() => void regenerate(index)} disabled={busy} title="Régénérer la réponse" aria-label="Régénérer la réponse"><Icon name="refresh" size={15} /></button>
                    <button type="button" onClick={() => void shareMessage(message.content)} title="Partager la réponse" aria-label="Partager la réponse"><Icon name="share" size={15} /></button>
                  </div>}
                  {message.role === "assistant" && index > 0 && <div className="response-prompts" aria-label="Suggestions de suivi">
                    <button type="button" onClick={() => { setInput("Peux-tu approfondir ta réponse précédente ?"); document.getElementById("message-input")?.focus(); }}><Icon name="sparkles" size={13} /> Approfondir</button>
                    <button type="button" onClick={() => { setInput("Donne-moi un exemple concret de ta réponse précédente."); document.getElementById("message-input")?.focus(); }}>Exemple</button>
                    <button type="button" onClick={() => { setInput("Résume ta réponse précédente en quelques points."); document.getElementById("message-input")?.focus(); }}>Résumé</button>
                  </div>}
                </div>
              </article>)}
              {busy && <div className="message-row assistant"><div className="thinking">Zodi réfléchit…</div></div>}
              <div ref={chatEndRef} />
            </div>}
          </div>
        </div>
        <div className="composer-area">
          <form className="chat-composer" onSubmit={send}>
            <label className="sr-only" htmlFor="message-input">Message à Zodi</label>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void addImages(event.target.files)} />
            {pendingImages.length > 0 && <div style={{ display: "flex", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>{pendingImages.map((image, index) => <div key={index} style={{ position: "relative" }}><img src={image.dataUrl} alt={image.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} /><button type="button" aria-label="Retirer l'image" onClick={() => setPendingImages((all) => all.filter((_, i) => i !== index))} style={{ position: "absolute", right: -6, top: -6 }}>×</button></div>)}</div>}
            <textarea id="message-input" value={input} onChange={(event) => setInput(event.target.value)} onInput={(event) => { const field = event.currentTarget; field.style.height = "auto"; field.style.height = `${Math.min(field.scrollHeight, 190)}px`; }} onFocus={(event) => { window.setTimeout(() => event.currentTarget.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80); }} placeholder="Écris un message à Zodi" rows={1} aria-label="Message à Zodi" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="composer-actions"><button type="button" onClick={() => imageInputRef.current?.click()} disabled={busy || pendingImages.length >= 4} aria-label="Ajouter des photos" title="Ajouter des photos"><Icon name="image" /></button><button className="send-button" disabled={busy || (!input.trim() && !pendingImages.length)} type="submit" aria-label="Envoyer le message" title="Envoyer"><Icon name="send" size={18} /></button></div>
          </form>
        </div>
      </section>
    </main>
  );
}
