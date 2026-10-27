const { contextBridge, ipcRenderer } = require("electron");

// The only things the web page can ask the main process to do.
contextBridge.exposeInMainWorld("api", {
  load: () => ipcRenderer.invoke("store:load"),
  save: (json) => ipcRenderer.invoke("store:save", json),
  exportFile: (opts) => ipcRenderer.invoke("file:export", opts),
  importFile: () => ipcRenderer.invoke("file:import"),
});
