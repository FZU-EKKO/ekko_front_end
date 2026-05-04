const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getAutoLaunch: () => ipcRenderer.invoke("app:get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("app:set-auto-launch", enabled),
  setView: (view) => ipcRenderer.invoke("app:set-view", view),
  setMinimizeOnClose: (enabled) => ipcRenderer.invoke("app:set-minimize-on-close", enabled),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
});
