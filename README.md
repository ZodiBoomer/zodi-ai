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
- Preview Auth.js : `https://zodi-ai-core-git-feat-google-auth-connections-zodi4.vercel.app/api/auth/callback/google`
- Preview services : `https://zodi-ai-core-git-feat-google-auth-connections-zodi4.vercel.app/api/google/callback`
- Local Auth.js : `http://localhost:3000/api/auth/callback/google`
- Local services : `http://localhost:3000/api/google/callback`

Activer les API Google nécessaires : Gmail API, Google Drive API, Google Calendar API et People API.

### Publication OAuth et durée des autorisations

- En mode **Testing** avec un type d'utilisateur External, seuls les comptes ajoutés à la liste Test users peuvent autoriser l'application.
- Google fait expirer les refresh tokens après 7 jours pour une application External en Testing qui demande des scopes autres que l'identité de base. Ce mode convient aux essais, pas à une connexion durable.
- Pour une utilisation personnelle durable, prévoir le passage de l'application en **In production** après les tests. Tant que l'application n'est pas vérifiée, Google peut afficher un avertissement et appliquer une limite d'utilisateurs ; les scopes Gmail sensibles/restreints peuvent nécessiter la vérification Google avant une diffusion publique.
- Le code gère le cas où Google révoque ou expire un refresh token et demande alors de reconnecter le service.

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
- `GET /api/google/gmail` lit les derniers messages (métadonnées et extrait), avec recherche Gmail et pagination.
- `GET /api/google/drive` liste les fichiers accessibles à l'application, avec filtre Drive et pagination.
- `GET /api/google/calendar` lit les événements sur une période limitée à 90 jours.
- `GET /api/google/contacts` lit les noms, adresses email, téléphones et organisations, avec pagination.
- Toutes les routes Google exigent une session utilisateur, contrôlent le service connecté et n'exposent jamais les jetons OAuth.

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
