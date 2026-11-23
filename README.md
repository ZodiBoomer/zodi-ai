# Zodi AI Core

Prototype du noyau conversationnel de Zodi AI, construit avec Next.js et Vercel AI Gateway.

## Fonctions
- Interface de chat minimale en français.
- Route de santé `GET /api/health`.
- Route de conversation `POST /api/chat`.
- Vercel AI Gateway via le SDK officiel Vercel AI SDK.
- Authentification par Vercel Access Token (optionnel) ou OIDC automatique sur les déploiements Vercel.

## Configuration Vercel
- `AI_GATEWAY_MODEL` : identifiant du modèle Gateway (défaut : `openai/gpt-4o-mini`).
- `VERCEL_ACCESS_TOKEN` : jeton d'accès personnel Vercel facultatif, à stocker comme variable chiffrée côté serveur. Il est transmis au SDK Gateway avec le scope d'équipe `zodi4`.
- Si `VERCEL_ACCESS_TOKEN` n'est pas défini, le SDK utilise l'authentification OIDC automatique de Vercel (si activée pour le projet).

Ajouter le jeton dans Vercel → Project → Settings → Environment Variables, clé `VERCEL_ACCESS_TOKEN`, type Secret/Encrypted, pour Preview, Production et Development. Ne jamais le mettre dans GitHub, dans le code, dans une variable `NEXT_PUBLIC_*`, ni dans une conversation.

## Développement
```bash
npm install
npm run dev
npm run build
```

Pour le développement local, utiliser un jeton dans un fichier `.env.local` non commité, ou utiliser `vercel env pull` pour obtenir les variables locales liées au projet.

## Endpoints
- `GET /api/health` indique le mode d'authentification prévu et le modèle, sans révéler de secret.
- `POST /api/chat` reçoit `{ "message": "Bonjour" }` et renvoie `{ "ok": true, "reply": "..." }`.
