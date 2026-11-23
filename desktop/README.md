# Zodi AI Desktop

Application de bureau Windows et Linux. Le client Electron ouvre l'application Zodi AI hébergée sur `https://zodi-ai-core.vercel.app` : l'interface, les comptes et le moteur IA restent centralisés. Une connexion Internet est donc nécessaire ; cette version n'embarque pas de modèle IA local.

## Formats distribués

- Windows x64 : installateur `.exe` NSIS, avec raccourcis Bureau et menu Démarrer.
- Linux x64 : `.AppImage` (format portable recommandé), `.deb` (Debian/Ubuntu) et `.rpm` (Fedora et distributions compatibles).

## Développement

Prérequis : Node.js 24 et npm.

```bash
cd desktop
npm install
npm start
```

Pour ouvrir un environnement de développement avec une autre URL :

```bash
ZODI_DESKTOP_URL=https://zodi-ai-core.vercel.app npm start
```

## Compiler localement

```bash
npm run build:win
npm run build:linux
```

Les artefacts sont placés dans `desktop/dist/`. La compilation Windows NSIS doit être exécutée sur Windows ; la compilation Linux sur Linux.

## Publication et mises à jour

Les versions publiques sont publiées dans les GitHub Releases du dépôt `ZodiBoomer/zodi-ai`. Les clients vérifient les mises à jour 8 secondes après le démarrage, puis toutes les 6 heures. Les fichiers sont téléchargés en arrière-plan. Une boîte de dialogue propose « Mettre à jour maintenant » ; si l'utilisateur choisit « Plus tard », la mise à jour téléchargée est installée à la fermeture de l'application.

Pour publier une version :

1. Incrémenter `version` dans `desktop/package.json`.
2. Créer et pousser le tag Git correspondant, au format `vX.Y.Z`.
3. GitHub Actions prépare une Release brouillon, compile Windows et Linux sur leurs runners natifs, puis publie la Release quand les deux builds ont réussi.

### Secret de signature obligatoire

Les manifestes de mise à jour doivent être signés Ed25519. Générer une seule paire de clés avec :

```bash
npx electron-builder create-update-key
```

Conserver le fichier privé `update-private-key.pem` hors du dépôt et enregistrer son contenu encodé en base64 dans le secret GitHub Actions `ELECTRON_BUILDER_UPDATE_SIGN_KEY`. Ne jamais publier la clé privée, la committer ou la placer dans l'application. La clé publique correspondante est intégrée automatiquement aux builds.

Le workflow utilise également le `GITHUB_TOKEN` fourni par GitHub Actions avec le droit `contents: write`. Aucun jeton GitHub n'est embarqué dans l'application.

## Sécurité

- Pas de Node.js exposé au contenu web (`nodeIntegration: false`).
- Isolation du contexte et sandbox activés.
- Seuls le domaine Zodi AI et les domaines d'authentification Google/Composio sont autorisés dans la fenêtre principale.
- Les liens externes HTTPS et mailto s'ouvrent dans le navigateur système.
- Les manifestes de mise à jour sont signés et vérifiés avant téléchargement/installation.

## Limites actuelles

- Première cible : Windows x64 et Linux x64. ARM64 pourra être ajouté ensuite.
- Une connexion Internet est nécessaire pour utiliser le chat et les services cloud.
- La signature de manifeste protège les mises à jour. Un certificat de signature de code Windows peut encore être ajouté pour afficher un éditeur vérifié et réduire les avertissements SmartScreen lors de l'installation.