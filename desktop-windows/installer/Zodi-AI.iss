#define MyAppName "Zodi IA"
#define MyAppVersion "0.2.0"
#define MyAppPublisher "ZodiBoomer"
#define MyAppExeName "ZodiAI.exe"

[Setup]
AppId={{C8E3B44E-3C4F-4E56-9B6B-3B2A6E0B90F1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Zodi IA
DefaultGroupName=Zodi IA
OutputDir=..\..\release
OutputBaseFilename=Zodi-AI-Setup-0.2.0-x64
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le bureau"; GroupDescription: "Raccourcis supplémentaires :"; Flags: unchecked

[Files]
Source: "..\..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Zodi IA"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Zodi IA"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Lancer Zodi IA"; Flags: postinstall nowait skipifsilent
