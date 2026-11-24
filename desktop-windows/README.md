# Zodi IA — application Windows native

Ce client est une application Windows native construite en C#/.NET 8 et WinUI 3 (Windows App SDK). Il ne repose ni sur Electron, ni sur une WebView, ni sur un site encapsulé.

## Fonctionnement

- Interface et fenêtre natives WinUI 3.
- Appels HTTPS au backend Zodi IA : `https://zodi-ai-core.vercel.app/api/chat`.
- Aucune clé API n'est intégrée dans l'application.
- Connexion Internet nécessaire pour les réponses IA.
- Installateur Windows x64 généré avec Inno Setup.

## Compilation locale

Sur Windows 10/11 avec le SDK .NET 8 et les composants Windows App SDK :

```powershell
dotnet restore desktop-windows/ZodiAI/ZodiAI.csproj -r win-x64
dotnet publish desktop-windows/ZodiAI/ZodiAI.csproj -c Release -r win-x64 --self-contained true -p:WindowsAppSDKSelfContained=true -o publish
choco install innosetup -y
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" desktop-windows/installer/Zodi-AI.iss
```

L'installateur final est créé dans `release/Zodi-AI-Setup-0.2.0-x64.exe`.

## Limites de cette première version

Le client dispose d'une conversation dans la session en cours. L'authentification Google, la synchronisation de l'historique multi-conversations et la mémoire du compte doivent être raccordées au flux OAuth/API du backend avant d'être considérées comme disponibles dans ce client natif.
