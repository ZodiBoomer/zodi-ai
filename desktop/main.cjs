const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("node:path");

const APP_URL = "https://zodi-ai-core.vercel.app";
const APP_ORIGIN = new URL(APP_URL).origin;

let mainWindow;

function openExternalSafely(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed or unsupported URLs.
  }
  return Promise.resolve();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: "Zodi AI",
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN) {
        event.preventDefault();
        void openExternalSafely(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && mainWindow && !mainWindow.isDestroyed()) {
      void mainWindow.loadFile(path.join(__dirname, "offline.html"));
    }
  });

  void mainWindow.loadURL(APP_URL);
}

ipcMain.handle("zodi:retry-connection", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.loadURL(APP_URL);
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId("fr.zodi.ai");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
