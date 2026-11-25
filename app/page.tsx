"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ImageAttachment = { dataUrl: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; name: string };
type Message = { role: "user" | "assistant"; content: string; images?: ImageAttachment[] };
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
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyQuery, setHistoryQuery] = useState("");
  const [updateStatus, setUpdateStatus] = useState("Vérifier les mises à jour");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, "like" | "dislike">>({});
  const checkingUpdateRef = useRef(false);
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
      setFeedback((all) => { const next = { ...all }; delete next[index]; return next; });
    } catch (error) {
      updateConversation(active.id, (item) => ({ ...item, messages: [...item.messages, { role: "assistant", content: error instanceof Error ? error.message : "Erreur pendant la régénération." }], updatedAt: Date.now() }));
    } finally { setBusy(false); }
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
          <div className="topbar-right"><span className={`connection-label ${statusTone}`} title={status}><i />{ready ? "En ligne" : "Connexion…"}</span><button className="icon-button" type="button" onClick={renameActiveChat} disabled={!active || busy} title="Renommer la conversation" aria-label="Renommer la conversation">✎</button><button className="icon-button" type="button" onClick={deleteActiveChat} disabled={!active || busy} title="Supprimer la conversation" aria-label="Supprimer la conversation">⌫</button><button className="icon-button" type="button" onClick={() => void checkForUpdates(true)} disabled={checkingUpdate} title={updateStatus} aria-label={updateStatus}>↻</button></div>
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
                <div className="message-body">
                  <div className={`message-content ${message.role}`}>
                    {message.images?.length ? <div className="message-images">{message.images.map((image, imageIndex) => <img key={imageIndex} src={image.dataUrl} alt={image.name || "Image jointe"} />)}</div> : null}
                    {message.content}
                  </div>
                  {message.role === "assistant" && index > 0 && <div className="message-actions" aria-label="Actions sur la réponse">
                    <button type="button" onClick={() => void copyMessage(message.content)} title="Copier la réponse" aria-label="Copier la réponse">▢</button>
                    <button type="button" className={feedback[index] === "like" ? "selected" : ""} onClick={() => setFeedback((all) => ({ ...all, [index]: all[index] === "like" ? undefined as never : "like" }))} title="J'aime" aria-label="J'aime">👍</button>
                    <button type="button" className={feedback[index] === "dislike" ? "selected" : ""} onClick={() => setFeedback((all) => ({ ...all, [index]: all[index] === "dislike" ? undefined as never : "dislike" }))} title="Je n'aime pas" aria-label="Je n'aime pas">👎</button>
                    <button type="button" onClick={() => void regenerate(index)} disabled={busy} title="Régénérer la réponse" aria-label="Régénérer la réponse">↻</button>
                    <button type="button" onClick={() => void shareMessage(message.content)} title="Partager la réponse" aria-label="Partager la réponse">↗</button>
                  </div>}
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
            <textarea id="message-input" value={input} onChange={(event) => setInput(event.target.value)} onInput={(event) => { const field = event.currentTarget; field.style.height = "auto"; field.style.height = `${Math.min(field.scrollHeight, 190)}px`; }} onFocus={(event) => { window.setTimeout(() => event.currentTarget.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80); }} placeholder="Écris un message à Zodi" rows={1} aria-label="Message à Zodi" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="composer-actions"><span>Entrée pour envoyer · Maj + Entrée pour un saut de ligne</span><button type="button" onClick={() => imageInputRef.current?.click()} disabled={busy || pendingImages.length >= 4} aria-label="Ajouter des photos" title="Ajouter des photos">＋</button><button className="send-button" disabled={busy || (!input.trim() && !pendingImages.length)} type="submit" aria-label="Envoyer le message" title="Envoyer">↑</button></div>
          </form>
          <p className="disclaimer">Zodi AI peut faire des erreurs. Pense à vérifier les informations importantes.</p>
        </div>
      </section>
    </main>
  );
}
