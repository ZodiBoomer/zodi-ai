# Zodi AI — Applications de bureau

Les applications Electron ouvrent l'interface officielle hébergée sur
https://zodi-ai-core.vercel.app dans une fenêtre de bureau dédiée.

## Générer l'installateur Windows

Prérequis : Node.js 22 ou supérieur et npm.

```powershell
cd desktop
npm install
npm run desktop:dist
```

L'installateur NSIS Windows x64 est créé dans `desktop/release/`.

## Générer les paquets Linux

Prérequis : Node.js 22 ou supérieur et npm.

```bash
cd desktop
npm install
npm run desktop:dist:linux
```

La compilation Linux x64 produit deux formats dans `desktop/release/` :

- `Zodi-AI-0.1.0-x64.AppImage` — format portable, adapté à de nombreuses distributions Linux.
- `Zodi-AI-0.1.0-x64.deb` — paquet pour Debian, Ubuntu, Linux Mint et distributions compatibles.

L'AppImage peut nécessiter la prise en charge FUSE 2 sur certaines distributions. Le paquet
`.deb` s'installe avec le gestionnaire de paquets de la distribution, par exemple
`sudo apt install ./Zodi-AI-0.1.0-x64.deb`.

## Fonctionnement

- Une fenêtre de bureau dédiée, avec session persistante gérée par Chromium/Electron.
- Le moteur IA et les clés API restent sur le serveur ; aucun secret n'est embarqué.
- Une connexion Internet est nécessaire.
- Les liens externes HTTP(S) s'ouvrent dans le navigateur par défaut.
- En cas d'indisponibilité du serveur, une page hors ligne permet de réessayer.

## Sécurité

L'intégration Node.js est désactivée dans la page distante, l'isolation de contexte
et le sandbox sont activés. La navigation est limitée à l'origine de Zodi AI.

## Cibles de compilation

- Windows : NSIS x64 (`npm run desktop:dist`).
- Linux : AppImage x64 et Debian package x64 (`npm run desktop:dist:linux`).
