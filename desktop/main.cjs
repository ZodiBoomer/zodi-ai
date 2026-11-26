const { app, BrowserWindow, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const APP_URL = process.env.ZODI_DESKTOP_URL || "https://zodi-ai-core.vercel.app";
const APP_HOST = new URL(APP_URL).hostname;
const AUTH_HOSTS = ["accounts.google.com", "google.com", "composio.dev"];

let mainWindow = null;
let updateCheckTimer = null;

function isTrustedHost(hostname) {
  if (hostname === APP_HOST) return true;
  return AUTH_HOSTS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

function openExternalSafely(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:" || url.protocol === "mailto:") {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed or unsupported external URLs.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#10131a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, rawUrl) => {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || !isTrustedHost(url.hostname)) {
        event.preventDefault();
        openExternalSafely(rawUrl);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(APP_URL);
}

function configureUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("error", (error) => {
    console.error("[Zodi AI updater]", error.message);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Mise à jour de Zodi AI",
      message: `La version ${info.version} est prête à être installée.`,
      detail: "Tu peux l'installer maintenant ou continuer. Elle sera installée à la fermeture de Zodi AI.",
      buttons: ["Mettre à jour maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  const checkForUpdates = () => {
    if (app.isReady() && app.isPackaged) {
      void autoUpdater.checkForUpdates().catch((error) => {
        console.error("[Zodi AI update check]", error.message);
      });
    }
  };

  setTimeout(checkForUpdates, 8000);
  updateCheckTimer = setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
}

app.setAppUserModelId("fr.zodi.ai.desktop");

app.whenReady().then(() => {
  createWindow();
  configureUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});