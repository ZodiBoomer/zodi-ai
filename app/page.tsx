"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ImageAttachment = { dataUrl: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; name: string };
type Message = { role: "user" | "assistant"; content: string; images?: ImageAttachment[]; choices?: string[] };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };
type Health = { ok?: boolean; aiConfigured?: boolean; provider?: string; providers?: string[]; model?: string; modelFallbacks?: string[] };
const BUILD_ID = process.env.NEXT_PUBLIC_ZODI_BUILD_ID ?? "local";
const welcome = (): Message[] => [{ role: "assistant", content: "Salut ! Je suis Zodi. Comment puis-je t'aider aujourd'hui ?" }];
const createConversation = (): Conversation => ({ id: crypto.randomUUID(), title: "Nouvelle discussion", messages: welcome(), updatedAt: Date.now() });

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Connexion au service…");
  const [ready, setReady] = useState(false);\n  const [healthTone, setHealthTone] = useState<"checking" | "ok" | "warning" | "error">("checking");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyQuery, setHistoryQuery] = useState("");
  const [updateStatus, setUpdateStatus] = useState("Vérifier les mises à jour");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const checkingUpdateRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const active = conversations.find((item) => item.id === activeId);
  const messages = active?.messages ?? [];
  const visibleConversations = conversations.filter((item) => item.title.toLowerCase().includes(historyQuery.trim().toLowerCase()) || item.messages.some((message) => message.content.toLowerCase().includes(historyQuery.trim().toLowerCase())));

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
      setHealthTone(connected ? "ok" : "warning");
      if (!connected) { setStatus("Aucun fournisseur IA cloud configuré"); return; }
      const provider = data.provider === "openrouter" ? "OpenRouter" : "OpenAI";
      setStatus(provider + " connecté · " + data.model);
    }).catch(() => { setReady(false); setHealthTone("error"); setStatus("Impossible de vérifier la connexion"); });
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
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
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
      updateConversation(id, (item) => ({ ...item, messages: [...item.messages, { role: "assistant", content: data.reply, choices: Array.isArray(data.choices) ? data.choices.filter((choice: unknown) => typeof choice === "string").slice(0, 4) : [] }], updatedAt: Date.now() }));
      setHealthTone("ok");
      setReady(true); setStatus((data.provider === "openrouter" ? "OpenRouter" : "OpenAI") + " connecté · modèle " + data.model);
    } catch (error) {
      updateConversation(id, (item) => ({ ...item, messages: [...item.messages, { role: "assistant", content: error instanceof Error ? error.message : "Impossible de contacter les fournisseurs IA." }], updatedAt: Date.now() }));
      setHealthTone("error");\n      setHealthTone("error");
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
        <input className="history-search" type="search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Rechercher une conversation…" aria-label="Rechercher dans l'historique" />
        <nav className="conversation-list" aria-label="Historique des conversations">
          {visibleConversations.length ? visibleConversations.map((item) => <button key={item.id} type="button" className={`conversation-item ${item.id === activeId ? "active" : ""}`} onClick={() => setActiveId(item.id)} title={item.title}><span>◌</span><span className="conversation-title">{item.title}</span></button>) : <p className="history-empty">Aucune conversation trouvée.</p>}
        </nav>
        <div className="sidebar-bottom"><div className="profile-avatar">Z</div><div className="profile-copy"><strong>Zodi AI</strong><span>Assistant personnel</span></div><i className={ready ? "online-dot" : "offline-dot"} /></div>
      </aside>
      <section className="main-chat">
        <header className="chat-topbar">
          <div className="topbar-left">
            {!sidebarOpen && <button className="icon-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Afficher le menu">☰</button>}
            <button className="model-selector" type="button">Zodi <span>AI</span>　⌄</button>
          </div>
          <div className="topbar-right"><span className={`connection-label tone-${healthTone}`} title={status}><i />{healthTone === "ok" ? "Opérationnel" : healthTone === "warning" ? "Attention" : healthTone === "error" ? "Problème" : "Vérification…"}</span><button className="icon-button" type="button" onClick={renameActiveChat} disabled={!active || busy} title="Renommer la conversation" aria-label="Renommer la conversation">✎</button><button className="icon-button" type="button" onClick={deleteActiveChat} disabled={!active || busy} title="Supprimer la conversation" aria-label="Supprimer la conversation">⌫</button><button className="icon-button" type="button" onClick={() => void checkForUpdates(true)} disabled={checkingUpdate} title={updateStatus} aria-label={updateStatus}>↻</button></div>
        </header>
        <div className="conversation-viewport">
          <div className={`messages-container ${messages.length <= 1 ? "welcome-state" : ""}`}>
            {messages.length <= 1 ? <div className="welcome-panel">
              <div className="welcome-mark">✳</div><h1>Que puis-je faire pour toi ?</h1><p>Pose une question, partage une idée ou lance un projet.</p>
              <div className="suggestion-grid">
                <button type="button" onClick={() => setInput("Aide-moi à organiser ma journée")}><strong>Organiser ma journée</strong><span>Planifier et prioriser mes tâches</span></button>
                <button type="button" onClick={() => setInput("Explique-moi un sujet simplement")}><strong>Apprendre quelque chose</strong><span>Comprendre un sujet étape par étape</span></button>
                <button type="button" onClick={() => setInput("Aide-moi à écrire un texte")}><strong>Écrire un texte</strong><span>Rédiger, corriger ou reformuler</span></button>
                <button type="button" onClick={() => setInput("Aide-moi sur mon projet")}><strong>Faire avancer un projet</strong><span>Réfléchir et passer à l&apos;action</span></button>
              </div>
            </div> : <div className="message-stack">
              {messages.map((message, index) => <article className={`message-row ${message.role}`} key={index}>
                {message.role === "assistant" && <div className="assistant-mark">✳</div>}
                <div className={`message-content ${message.role}`}>
                  {message.images?.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>{message.images.map((image, imageIndex) => <img key={imageIndex} src={image.dataUrl} alt={image.name || "Image jointe"} style={{ maxWidth: 220, maxHeight: 220, objectFit: "contain", borderRadius: 12 }} />)}</div> : null}
                  {message.content}
                  {message.role === "assistant" && message.choices?.length ? <div className="quick-replies" aria-label="Suggestions de réponse">{message.choices.map((choice, choiceIndex) => <button type="button" key={choiceIndex} onClick={() => { setInput(choice); document.getElementById("message-input")?.focus(); }} title="Utiliser cette réponse">{choice}</button>)}</div> : null}
                  {message.role === "assistant" && message.content ? <button className="message-copy" type="button" onClick={() => { void navigator.clipboard?.writeText(message.content).then(() => setStatus("Réponse copiée")).catch(() => setStatus("Copie impossible")); }} aria-label="Copier la réponse" title="Copier la réponse">Copier</button> : null}
                </div>
              </article>)}
              {busy && <div className="message-row assistant"><div className="assistant-mark">✳</div><div className="thinking">Zodi réfléchit…</div></div>}
              <div ref={chatEndRef} />
            </div>}
          </div>
        </div>
        <div className="composer-area">
          <form className="chat-composer" onSubmit={send}>
            <label className="sr-only" htmlFor="message-input">Message à Zodi</label>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void addImages(event.target.files)} />
            {pendingImages.length > 0 && <div style={{ display: "flex", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>{pendingImages.map((image, index) => <div key={index} style={{ position: "relative" }}><img src={image.dataUrl} alt={image.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} /><button type="button" aria-label="Retirer l'image" onClick={() => setPendingImages((all) => all.filter((_, i) => i !== index))} style={{ position: "absolute", right: -6, top: -6 }}>×</button></div>)}</div>}
            <textarea id="message-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à Zodi" rows={1} aria-label="Message à Zodi" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="composer-actions"><span>Entrée pour envoyer · Maj + Entrée pour un saut de ligne</span><button type="button" onClick={() => imageInputRef.current?.click()} disabled={busy || pendingImages.length >= 4} aria-label="Ajouter des photos" title="Ajouter des photos">＋</button><button className="send-button" disabled={busy || (!input.trim() && !pendingImages.length)} type="submit" aria-label="Envoyer le message" title="Envoyer">↑</button></div>
          </form>
          <p className="disclaimer">Zodi AI peut faire des erreurs. Pense à vérifier les informations importantes.</p>
        </div>
      </section>
    </main>
  );
}
