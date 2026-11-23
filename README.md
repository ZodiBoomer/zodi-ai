# Zodi AI Core

Prototype du noyau conversationnel de Zodi AI, construit avec Next.js et l'API officielle OpenAI.

## Fonctions
- Interface de chat minimale en français.
- Route de santé `GET /api/health`.
- Route de conversation `POST /api/chat`.
- Appels directs à l'API OpenAI depuis le serveur.
- Clé API conservée dans les variables d'environnement serveur.

## Configuration Vercel
- `OPENAI_API_KEY` : clé API OpenAI, à stocker comme variable Secret dans Vercel pour Production (et Preview/Development si ces environnements sont utilisés).
- `OPENAI_MODEL` : identifiant du modèle OpenAI (facultatif, défaut : `gpt-4o-mini`).

La clé API ne doit jamais être ajoutée à GitHub, au code, à une variable `NEXT_PUBLIC_*` ou à une conversation.

## Développement
```bash
npm install
npm run dev
npm run build
```

Pour le développement local, placer la clé dans `.env.local`, qui ne doit pas être commitée.

## Endpoints
- `GET /api/health` indique le fournisseur, le modèle et si la clé est configurée, sans révéler de secret.
- `POST /api/chat` reçoit `{ "message": "Bonjour" }` et renvoie `{ "ok": true, "reply": "..." }`.
