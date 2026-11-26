# ZODIX Core

Noyau conversationnel de ZODIX, construit avec Next.js et des fournisseurs IA cloud.

## Fiabilité et routage

- OpenRouter est utilisé avec son basculement automatique entre fournisseurs d'hébergement.
- En cas d'indisponibilité complète du modèle principal, OpenRouter peut essayer les modèles de secours définis dans `OPENROUTER_FALLBACK_MODELS`.
- Par défaut, les modèles de secours sont `openai/gpt-5-mini` puis `google/gemini-2.5-flash`.
- Si une seconde clé OpenAI directe est configurée, l'application essaie automatiquement cet autre fournisseur si OpenRouter échoue.
- Aucune IA locale, aucun Ollama et aucune réponse locale de substitution.

## Variables d'environnement Vercel

- `OPENROUTER_API_KEY` : clé OpenRouter recommandée.
- `OPENAI_DIRECT_API_KEY` : clé API OpenAI directe indépendante, utilisée comme fournisseur secondaire.
- `OPENAI_API_KEY` : compatibilité avec l'ancienne configuration. Si la valeur est une clé OpenRouter, elle est traitée comme telle ; sinon elle peut servir à OpenAI direct.
- `ZODI_AI_PROVIDER` : fournisseur prioritaire facultatif (`openrouter` ou `openai`). Les autres fournisseurs configurés restent disponibles en secours.
- `OPENROUTER_MODEL` : modèle OpenRouter principal (défaut : `openai/gpt-5`).
- `OPENROUTER_FALLBACK_MODELS` : liste facultative de modèles de secours séparés par des virgules.
- `OPENAI_MODEL` : modèle OpenAI direct (défaut : `gpt-5.5`).
- `ZODI_AI_OPENROUTER_TIMEOUT_MS` : délai maximal OpenRouter (défaut : 36000 ms, plafond : 36000 ms).
- `ZODI_AI_OPENAI_TIMEOUT_MS` : délai maximal par appel OpenAI direct (défaut : 10000 ms, plafond : 10000 ms).

Ne jamais placer une clé dans GitHub, dans le navigateur, dans une variable `NEXT_PUBLIC_*` ou dans une conversation.

## Endpoints

- `GET /api/health` expose uniquement l'état de configuration et les chemins de secours, sans révéler de secret. Ce n'est pas un test d'inférence en direct.
- `POST /api/chat` reçoit `{ "message": "Bonjour", "history": [] }` et renvoie une réponse IA cloud.
- Le chat transmet les 10 derniers messages au maximum.
- Les erreurs de fournisseur sont journalisées côté serveur sans écrire de clé API dans les logs.

## Développement

```bash
npm install
npm run dev
npm run build
```

Pour le développement local, placer les clés dans `.env.local`, qui ne doit jamais être commitée.

## Mises à jour des applications

- Les clients Windows et Linux vérifient le manifeste stable public au démarrage et via le bouton « Mettre à jour ».
- Le client Android vérifie le même manifeste au démarrage et via le bouton « Mettre à jour », télécharge l'APK publié et vérifie son empreinte SHA-256.
- Android conserve la confirmation d'installation imposée par le système ; ZODIX ne tente pas d'installer un APK silencieusement.
- Les releases stables et le manifeste central sont publiés dans le dépôt `ZodiBoomer/zodi-ai-releases-publique`.
