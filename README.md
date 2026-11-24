# Zodi AI Core

Noyau conversationnel de Zodi AI, construit avec Next.js et des fournisseurs IA cloud.

## Comptes Zodi

- Inscription et connexion avec adresse e-mail et mot de passe.
- Les mots de passe sont hachés avec bcrypt ; ils ne sont jamais stockés en clair.
- Les sessions Web utilisent des jetons Auth.js signés.
- Les applications natives utilisent des jetons Bearer aléatoires, hachés en base et révocables.
- PostgreSQL conserve les comptes, conversations, messages et mémoires.
- Aucun fournisseur d'identité externe ni service Google n'est requis.

## Base de données PostgreSQL

1. Configurer `DATABASE_URL` et `DIRECT_URL` côté serveur.
2. Déployer les migrations avec `npm run db:deploy`.
3. Générer Prisma avec `npx prisma generate`.
4. Déployer l'application.

## API native

- `POST /api/mobile/auth/register` : crée un compte et retourne un jeton natif.
- `POST /api/mobile/auth/login` : authentifie un compte et retourne un jeton natif.
- `POST /api/mobile/auth/logout` : révoque le jeton présenté.
- Les routes de conversations, mémoire et chat acceptent une session Web ou `Authorization: Bearer <token>`.

## Fournisseurs IA et endpoints

- OpenRouter est utilisé avec ses mécanismes de secours ; OpenAI direct peut être configuré en fournisseur secondaire.
- Aucune IA locale, aucun Ollama et aucune réponse locale de substitution.
- `GET /api/health` expose uniquement l'état de configuration IA, sans secret.
- `POST /api/chat` nécessite une session authentifiée et un `conversationId`.

## Sécurité

- Ne jamais commiter de mot de passe, jeton, clé API ou fichier d'environnement.
- Utiliser HTTPS en production.
- Les jetons natifs expirent après 30 jours et peuvent être révoqués.
- Les mots de passe doivent contenir entre 10 et 128 caractères.
