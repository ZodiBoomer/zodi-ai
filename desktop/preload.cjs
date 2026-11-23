const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zodiDesktop", {
  retryConnection: () => ipcRenderer.invoke("zodi:retry-connection")
});
