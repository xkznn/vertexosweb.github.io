const { contextBridge, ipcRenderer } = require('electron');

function ipc(channel, data) {
  return ipcRenderer.invoke(channel, data);
}

contextBridge.exposeInMainWorld('vertex', {
  minimize: () => ipc('win:min'),
  maximize: () => ipc('win:max'),
  close: () => ipc('win:close'),
  winState: () => ipc('win:state'),
  commit: (raw) => ipc('nav:commit', raw),
  goHome: () => ipc('nav:home'),
  back: () => ipc('nav:back'),
  fwd: () => ipc('nav:fwd'),
  reload: () => ipc('nav:reload'),
  stop: () => ipc('nav:stop'),
  newTab: (url) => ipc('tab:create', { url }),
  closeTab: (id) => ipc('tab:close', id),
  activateTab: (id) => ipc('tab:activate', id),
  suggest: (q) => ipc('sugg:query', q),
  getConfig: () => ipc('config:get'),
  setConfig: (patch) => ipc('config:set', patch),
  toggleAdblock: () => ipc('ad:toggle'),
  clearData: () => ipc('data:clear'),
  getStartData: () => ipc('start:data'),
  on: (channel, cb) => ipcRenderer.on(channel, (_e, data) => cb(data)),
});