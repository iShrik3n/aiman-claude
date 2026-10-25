/**
 * Desktop bridge for the frameless aiman window.
 *
 * The renderer never gets Node access. It only receives the tiny window-control
 * API and a theme hint so Electron can keep the native window background in
 * sync with the selected app theme.
 */
const { contextBridge, ipcRenderer } = require("electron");

function markDesktop() {
  try {
    document.documentElement.dataset.desktop = "1";
  } catch {}
}

markDesktop();
window.addEventListener("DOMContentLoaded", markDesktop);

contextBridge.exposeInMainWorld("aimanDesktop", {
  isDesktop: true,
  platform: process.platform,
  electron: process.versions.electron,
  minimize: () => ipcRenderer.invoke("aiman:window", "minimize"),
  toggleMaximize: () => ipcRenderer.invoke("aiman:window", "toggle-maximize"),
  close: () => ipcRenderer.invoke("aiman:window", "close"),
  setTheme: (theme) => ipcRenderer.send("aiman:theme", theme),
  onState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("aiman:window-state", listener);
    return () => ipcRenderer.removeListener("aiman:window-state", listener);
  },
});
