const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('set-config', cfg),

  // Worker control
  startWorker: () => ipcRenderer.invoke('start-worker'),
  stopWorker: () => ipcRenderer.invoke('stop-worker'),
  openFacebookSession: () => ipcRenderer.invoke('open-facebook-session'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  // Utils
  selectChromeDir: () => ipcRenderer.invoke('select-chrome-dir'),
  quitApp: () => ipcRenderer.invoke('quit-app'),

  // Events from main
  onStatus: (callback) => ipcRenderer.on('worker-status', (_event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('worker-log', (_event, data) => callback(data)),

  // Cleanup
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
