# Zodi AI pour Windows

Cette application Electron ouvre l'interface officielle hébergée sur
https://zodi-ai-core.vercel.app dans une fenêtre de bureau dédiée.

## Générer l'installateur Windows

Prérequis : Node.js 22 ou supérieur et npm.

```powershell
cd desktop
npm install
npm run desktop:dist
```

L'installateur NSIS x64 est créé dans `desktop/release/Zodi-AI-Setup-0.1.0.exe`.

## Fonctionnement

- Une fenêtre de bureau dédiée, avec session persistante gérée par Chromium/Electron.
- Le moteur IA et les clés API restent sur le serveur ; aucun secret n'est embarqué.
- Une connexion Internet est nécessaire.
- Les liens externes HTTP(S) s'ouvrent dans le navigateur par défaut.
- En cas d'indisponibilité du serveur, une page hors ligne permet de réessayer.

## Sécurité

L'intégration Node.js est désactivée dans la page distante, l'isolation de contexte
et le sandbox sont activés. La navigation est limitée à l'origine de Zodi AI.
