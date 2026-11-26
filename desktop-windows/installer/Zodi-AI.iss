#define MyAppName "ZODIX"
#ifndef MyAppVersion
  #define MyAppVersion "0.3.0"
#endif
#define MyAppPublisher "ZodiBoomer"
#define MyAppExeName "ZodiAI.exe"

[Setup]
AppId={{C8E3B44E-3C4F-4E56-9B6B-3B2A6E0B90F1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ZODIX
DefaultGroupName=ZODIX
OutputDir=..\..\release
OutputBaseFilename=Zodi-AI-Setup-x64
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\ZodiAI\Assets\zodix-logo.ico
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le bureau"; GroupDescription: "Raccourcis supplémentaires :"; Flags: unchecked

[Files]
Source: "..\..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ZODIX"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\ZODIX"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Lancer ZODIX"; Flags: postinstall nowait skipifsilent
