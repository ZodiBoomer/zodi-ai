# Zodi AI — moteur central

Dépôt principal du projet **Zodi AI**, assistant personnel à architecture hybride (local + distant).

## Responsabilités
- Architecture générale et moteur de l'assistant.
- API serveur, orchestration et gestion des agents.
- Couche de sécurité, authentification et autorisations.
- Contrats d'intégration avec les applications clientes et services externes.
- Documentation technique de référence.

## Architecture cible
- **Local** : capacités exécutées sur les appareils de l'utilisateur, selon les permissions accordées.
- **Distant** : services hébergés et API lorsque cela est nécessaire.
- **Android** : client mobile dans https://github.com/ZodiBoomer/zodi-ai-android.
- **Linux** : environnement et scripts système dans https://github.com/ZodiBoomer/zodi-linux.
- **Outils** : utilitaires partagés dans https://github.com/ZodiBoomer/zodi-tools.

## État initial
Ce dépôt contient la structure documentaire initiale. Le code source réel du déploiement Vercel doit être identifié et vérifié avant toute importation ou liaison. Aucun secret, jeton ou fichier .env ne doit être commité.

## Sécurité
- Dépôt privé.
- Secrets uniquement dans le gestionnaire de secrets du fournisseur ou les GitHub Actions Secrets.
- Toute action à fort impact doit respecter le modèle d'autorisations et de validation humaine du projet.
- Documenter les permissions minimales nécessaires à chaque intégration.

## Démarrage
Les instructions d'installation et de développement seront ajoutées après validation de la pile technique et récupération du code source existant.
