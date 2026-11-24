"use client";

import { useState } from "react";

export function DisconnectButton({ googleAccountId, service }: { googleAccountId: string; service: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function disconnect() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/google/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleAccountId, service })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Déconnexion impossible");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="secondary-button" type="button" onClick={disconnect} disabled={busy}>
        {busy ? "Déconnexion…" : "Désactiver"}
      </button>
      {message && <p className="error">{message}</p>}
    </div>
  );
}
