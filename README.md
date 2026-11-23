# Zodi AI Core

Prototype du noyau conversationnel de Zodi AI, construit avec Next.js pour Vercel AI Gateway.

## Fonctions
- Interface de chat minimale en français.
- Route de santé `GET /api/health`.
- Route de conversation `POST /api/chat`.
- Vercel AI Gateway via l'API compatible OpenAI.
- Authentification OIDC automatique sur Vercel, avec `AI_GATEWAY_API_KEY` comme solution de repli pour le développement local.

## Configuration
- `AI_GATEWAY_MODEL` : identifiant exact du modèle Gateway (défaut : `openai/gpt-4o-mini`).
- `AI_GATEWAY_API_KEY` : clé API AI Gateway facultative pour les environnements sans OIDC.
- Sur Vercel, `VERCEL_OIDC_TOKEN` est utilisé automatiquement lorsque l'OIDC du projet est activé.

Endpoint Gateway : `https://ai-gateway.vercel.sh/v1`.

Ne jamais commiter de clé API, de fichier `.env` ou de secret. Ne jamais exposer ces valeurs avec un préfixe `NEXT_PUBLIC_`.

## Développement
```bash
npm install
npm run dev
npm run build
```

Pour le développement local, ajoute `AI_GATEWAY_API_KEY` à `.env.local` sans le commiter.

## Endpoints
- `GET /api/health` indique l'état du serveur, le mode d'authentification et le modèle, sans exposer le jeton.
- `POST /api/chat` reçoit `{ "message": "Bonjour" }` et renvoie `{ "ok": true, "reply": "..." }`.
