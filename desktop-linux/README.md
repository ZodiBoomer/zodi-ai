# Zodi AI pour Linux
Client de bureau natif Avalonia/.NET 8. Il se connecte à https://zodi-ai-core.vercel.app/api/chat ; aucune clé API n'est embarquée.

## Fonctions
- Plusieurs conversations : création, sélection, renommage et suppression.
- Historique local dans ~/.config/zodi-ai/conversations.json.
- Même moteur IA que le site et les autres clients.
- Exécutable Linux x64 autonome avec runtime .NET inclus.

## Installation
Télécharger le paquet Debian .deb pour Ubuntu/Debian ou l'archive .tar.gz pour les autres distributions. Une connexion Internet est nécessaire pour les réponses IA.

Les conversations locales ne sont pas encore synchronisées entre appareils.

## Validation CI

Le packaging Linux x64 (`.deb` et `.tar.gz`) est vérifié par le workflow GitHub Actions `Zodi AI Desktop Builds`.
