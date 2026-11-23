# Zodi AI Core

Prototype du noyau conversationnel de Zodi AI, construit avec Next.js pour Vercel.

## Fonctions du prototype
- Interface de chat minimale en français.
- Route de santé `GET /api/health`.
- Route de conversation `POST /api/chat`.
- Clé API conservée exclusivement côté serveur.

## Variables d'environnement Vercel
- `AI_API_KEY` : clé privée du fournisseur IA.
- `AI_BASE_URL` : base URL compatible OpenAI (facultative, défaut : `https://api.openai.com/v1`).
- `AI_MODEL` : identifiant du modèle (facultatif, défaut : `gpt-4o-mini`).

Ne jamais commiter de clé API, de fichier `.env` ou de secret.

## Développement
```bash
npm install
npm run dev
npm run build
```

## Endpoints
- `GET /api/health` indique si le serveur fonctionne et si une clé est configurée, sans exposer sa valeur.
- `POST /api/chat` reçoit `{ "message": "Bonjour" }` et renvoie `{ "ok": true, "reply": "..." }`.
