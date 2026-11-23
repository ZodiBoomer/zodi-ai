# Zodi AI Core

Noyau conversationnel de Zodi AI, construit avec Next.js et des fournisseurs IA cloud.

## Connexion et comptes

- Authentification Google via Auth.js ; comptes et sessions stockés dans PostgreSQL.
- Le chat et son API nécessitent une session authentifiée.
- La connexion initiale demande uniquement `openid email profile`.
- Gmail, Drive, Agenda et Contacts sont autorisés séparément depuis `/connections`.
- Les jetons de rafraîchissement Google sont chiffrés en AES-256-GCM avant stockage.
- Aucun jeton Google ni secret OAuth n'est renvoyé au navigateur.

## Base de données PostgreSQL

1. Créer une base Neon depuis le Vercel Marketplace et la connecter au projet `zodi-ai-core`.
2. Vérifier que `DATABASE_URL` est disponible dans les environnements nécessaires.
3. Appliquer le schéma avec `npm run db:deploy`.
4. Déployer de nouveau le projet.

## Google Cloud Console

Créer un identifiant OAuth de type application Web. Ajouter les URI de redirection suivantes :

- Production Auth.js : `https://zodi-ai-core.vercel.app/api/auth/callback/google`
- Production services : `https://zodi-ai-core.vercel.app/api/google/callback`
- Local Auth.js : `http://localhost:3000/api/auth/callback/google`
- Local services : `http://localhost:3000/api/google/callback`

Activer les API Google nécessaires : Gmail API, Google Drive API, Google Calendar API et People API.

Variables Vercel à définir côté serveur :

- `DATABASE_URL` : URL PostgreSQL Neon avec pooler, rôle applicatif `zodi_app` limité au CRUD.
- `DIRECT_URL` : URL PostgreSQL Neon directe, rôle propriétaire réservé aux migrations Prisma. Les builds exécutent `prisma migrate deploy` avant la compilation.
- `AUTH_SECRET` : secret de session Auth.js.
- `AUTH_GOOGLE_ID` et `AUTH_GOOGLE_SECRET` : identifiants du client OAuth Google.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` : clé AES de 32 octets encodée en base64.
- `GOOGLE_SERVICES_REDIRECT_URI` : `https://zodi-ai-core.vercel.app/api/google/callback`.

Générer deux secrets indépendants avec `openssl rand -base64 32` (une fois pour `AUTH_SECRET`, une fois pour `GOOGLE_TOKEN_ENCRYPTION_KEY`). Ne jamais envoyer ces valeurs dans un chat ni les placer dans Git.

## Autorisations Google progressives

- Connexion : `openid email profile`.
- Gmail : lecture seule (`gmail.readonly`).
- Drive : fichiers explicitement ouverts ou créés par l'application (`drive.file`).
- Agenda : lecture seule (`calendar.events.readonly`).
- Contacts : lecture seule (`contacts.readonly`).

Google peut exiger la vérification de l'application OAuth avant de rendre certains scopes sensibles ou restreints disponibles à tous les utilisateurs. Pendant les tests, ajouter les comptes concernés aux utilisateurs de test Google Cloud.

Désactiver un service dans Zodi AI empêche son utilisation par l'application, mais ne révoque pas à lui seul le consentement Google. La révocation complète s'effectue dans les paramètres de sécurité du compte Google.

## Fournisseurs IA et endpoints

- OpenRouter est utilisé avec ses mécanismes de secours ; OpenAI direct peut être configuré en fournisseur secondaire.
- Aucune IA locale, aucun Ollama et aucune réponse locale de substitution.
- `GET /api/health` expose uniquement l'état de configuration IA, sans secret.
- `POST /api/chat` nécessite une session authentifiée.
- `GET /api/google/connections` renvoie les connexions du compte courant sans jeton.
- `DELETE /api/google/connections` désactive un service pour un compte Google.

## Variables IA

- `OPENROUTER_API_KEY`, `OPENAI_DIRECT_API_KEY`, `OPENAI_API_KEY`
- `ZODI_AI_PROVIDER`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODELS`, `OPENAI_MODEL`
- `ZODI_AI_OPENROUTER_TIMEOUT_MS`, `ZODI_AI_OPENAI_TIMEOUT_MS`

Ne jamais placer une clé dans GitHub, dans le navigateur, dans une variable `NEXT_PUBLIC_*` ou dans une conversation.

## Déploiement Vercel

- Les fonctions Vercel sont configurées en région `fra1` pour rester proches de la base Neon `aws-eu-central-1`.
- Les variables sensibles sont stockées dans les environnements Vercel Production et Preview, jamais dans Git.
- Chaque build exécute les migrations Prisma avant de générer le client et de compiler Next.js.

## Développement

```bash
npm install
npm run dev
``

Pour le développement local, placer les secrets dans `.env.local`, qui ne doit jamais être commitée.
