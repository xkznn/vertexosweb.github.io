const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
} = require('electron');
const { ElectronBlocker, fetchLists, fetchResources, fullLists } = require('@cliqz/adblocker-electron');

const IS_SMOKE = process.argv.includes('--smoke-test');
const CHROME_HEIGHT = 98; // must match CSS: 40px tab strip + 58px toolbar

const SEARCH_ENGINES = {
  google: { name: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  duck: { name: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  bing: { name: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  startpage: { name: 'Startpage', url: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}` },
};

const DEFAULTS = {
  adblock: true,
  searchEngine: 'google',
  homepage: 'vertex', // 'vertex' = custom start page, otherwise a URL
  theme: 'dark',
};

let win = null;
let blocker = null;
let activeId = null;
let nextTabId = 1;
const tabs = new Map();
const adState = { ready: false, enabled: false, count: 0, error: null };
let config = { ...DEFAULTS };
let history = [];

const cfgPath = () => path.join(app.getPath('userData'), 'config.json');
const histPath = () => path.join(app.getPath('userData'), 'history.json');

function loadJSON(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return fallback;
  }
}
function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}
function loadConfig() {
  config = loadJSON(cfgPath(), DEFAULTS);
}
function saveConfig() {
  saveJSON(cfgPath(), config);
}
function loadHistory() {
  try {
    history = JSON.parse(fs.readFileSync(histPath(), 'utf8')) || [];
  } catch {
    history = [];
  }
}
function pushHistory(url, title) {
  if (!url || url.startsWith('file:')) return;
  history = history.filter((h) => h.url !== url);
  history.unshift({ url, title: title || url, ts: Date.now() });
  if (history.length > 80) history.pop();
  saveJSON(histPath(), history);
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

const isUrlish = (input) =>
  /^(\w[\w+.-]*):\/\//.test(input) ||
  /^localhost(:\d+)?([/?#]|$)/i.test(input) ||
  /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?([/?#]|$)/i.test(input);

function resolveInput(raw) {
  const input = (raw || '').trim();
  if (!input) return { type: 'home' };
  if (input === 'vertex://start' || input.toLowerCase() === 'vertex start') return { type: 'home' };
  if (isUrlish(input)) {
    const url = input.includes('://') ? input : `https://${input}`;
    return { type: 'url', url };
  }
  return { type: 'search', query: input };
}

function homeUrl() {
  return config.homepage === 'vertex' ? null : config.homepage;
}

function getViewBounds() {
  const [w, h] = win.getContentSize();
  return { x: 0, y: CHROME_HEIGHT, width: w, height: Math.max(h - CHROME_HEIGHT, 0) };
}

function layout() {
  const bounds = getViewBounds();
  for (const t of tabs.values()) {
    t.view.setBounds(bounds);
    t.view.setVisible(t.id === activeId);
  }
}

function emitTabs() {
  const list = [...tabs.values()].map((t) => ({
    id: t.id,
    title: t.title,
    url: t.url,
    icon: t.icon,
    loading: t.loading,
    active: t.id === activeId,
  }));
  send('event:tabs', list);
}

function emitChrome() {
  const t = tabs.get(activeId);
  send('event:chrome', t
    ? { url: t.url, title: t.title, loading: t.loading, canGoBack: t.view.webContents.navigationHistory.canGoBack(), canGoForward: t.view.webContents.navigationHistory.canGoForward() }
    : { url: '', title: '', loading: false, canGoBack: false, canGoForward: false });
}

function emitAd() {
  send('event:ad', { ...adState });
}

function hookContents(id, contents) {
  contents.setWindowOpenHandler(({ url }) => {
    createTab(url || undefined, { activate: true });
    return { action: 'deny' };
  });

  contents.on('did-start-loading', () => {
    const t = tabs.get(id);
    if (t) { t.loading = true; emitTabs(); emitChrome(); }
  });
  contents.on('did-stop-loading', () => {
    const t = tabs.get(id);
    if (t) { t.loading = false; emitTabs(); emitChrome(); }
  });
  contents.on('did-navigate', (_e, url) => {
    const t = tabs.get(id);
    if (!t) return;
    t.url = url;
    t.title = contents.getTitle() || url;
    pushHistory(url, t.title);
    emitTabs();
    emitChrome();
  });
  contents.on('did-navigate-in-page', (_e, url) => {
    const t = tabs.get(id);
    if (!t) return;
    t.url = url;
    emitTabs();
    emitChrome();
  });
  contents.on('page-title-updated', (_e, title) => {
    const t = tabs.get(id);
    if (t) { t.title = title; emitTabs(); emitChrome(); win.setTitle(title ? `${title} - Vertex` : 'Vertex Browser'); }
  });
  contents.on('page-favicon-updated', (_e, favicons) => {
    const t = tabs.get(id);
    if (t && favicons && favicons[0]) { t.icon = favicons[0]; emitTabs(); }
  });
  contents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3) return;
    send('event:toast', { text: `Could not load ${url} (${desc})`, kind: 'error' });
  });
  contents.on('render-process-gone', (_e, details) => {
    send('event:toast', { text: `This page crashed (${details.reason})`, kind: 'error' });
  });

  contents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = (input.key || '').toLowerCase();
    if (ctrl && key === 'l') return send('ui:focus-url');
    if (ctrl && key === 't') return createTab(undefined, { activate: true });
    if (ctrl && key === 'w') return closeTab(activeId);
    if (ctrl && key === 'tab') return cycleTab(input.shift ? -1 : 1);
    if (ctrl && /^[1-9]$/.test(key)) {
      const order = [...tabs.keys()];
      const t = tabs.get(order[Number(key) - 1]);
      if (t) activateTab(t.id);
      return;
    }
    if (ctrl && key === 'r') return reloadTab(activeId);
    if (ctrl && key === 'h') return navigateActive(null);
    if (input.alt && input.key === 'ArrowLeft') return goBack();
    if (input.alt && input.key === 'ArrowRight') return goForward();
    if (key === 'f5') return reloadTab(activeId);
  });
}

function makeView(id) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  hookContents(id, view.webContents);
  return view;
}

function loadInTab(id, target) {
  const t = tabs.get(id);
  if (!t) return;
  if (!target) {
    t.url = 'vertex://start';
    t.title = 'New Tab';
    t.icon = null;
    t.view.webContents.loadFile(path.join(__dirname, 'app', 'startpage.html'));
    emitTabs();
    emitChrome();
    return;
  }
  t.view.webContents.loadURL(target);
}

function createTab(url, ops = {}) {
  const { activate = true, select = true } = ops;
  const id = nextTabId++;
  const view = makeView(id);
  tabs.set(id, { id, view, url: '', title: 'New Tab', icon: null, loading: false });
  win.contentView.addChildView(view);
  if (activate) activateTab(id);
  loadInTab(id, url || (select ? homeUrl() : null));
  emitTabs();
  return id;
}

function activateTab(id) {
  if (!tabs.has(id) || id === activeId) return;
  activeId = id;
  for (const t of tabs.values()) t.view.setVisible(t.id === id);
  layout();
  const t = tabs.get(id);
  if (t) t.view.webContents.focus();
  emitTabs();
  emitChrome();
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  const order = [...tabs.keys()];
  const idx = order.indexOf(id);
  if (id === activeId) {
    activeId = null;
    const next = order[idx + 1] ?? order[idx - 1];
    if (next) activateTab(next);
  }
  win.contentView.removeChildView(t.view);
  t.view.webContents.close();
  tabs.delete(id);
  if (tabs.size === 0) {
    createTab(undefined, { activate: true });
    return;
  }
  emitTabs();
  emitChrome();
}

function cycleTab(dir) {
  const order = [...tabs.keys()];
  if (order.length < 2) return;
  const idx = activeId ? order.indexOf(activeId) : 0;
  const next = order[(idx + dir + order.length) % order.length];
  activateTab(next);
}

function navigateActive(raw, ops) {
  const resolved = resolveInput(raw);
  const t = tabs.get(activeId);
  if (!t) return;
  if (resolved.type === 'url') loadInTab(t.id, resolved.url);
  else if (resolved.type === 'search') loadInTab(t.id, SEARCH_ENGINES[config.searchEngine].url(resolved.query));
  else loadInTab(t.id, homeUrl());
}

function goBack() { const t = tabs.get(activeId); if (t && t.view.webContents.navigationHistory.canGoBack()) t.view.webContents.goBack(); }
function goForward() { const t = tabs.get(activeId); if (t && t.view.webContents.navigationHistory.canGoForward()) t.view.webContents.goForward(); }
function reloadTab(id) { const t = tabs.get(id); if (t) t.view.webContents.reload(); }
function stopTab(id) { const t = tabs.get(id); if (t) t.view.webContents.stop(); }

async function buildBlocker() {
  const cacheFile = path.join(app.getPath('userData'), 'adblock-cache.bin');
  const caching = {
    path: cacheFile,
    read: (p) => fs.promises.readFile(p),
    write: (p, buf) => fs.promises.writeFile(p, buf),
  };
  const lists = await fetchLists(fetch, fullLists);
  const resources = await fetchResources(fetch);
  return ElectronBlocker.fromLists(
    fetch,
    lists,
    { enableCompression: true, loadNetworkFilters: true },
    caching,
  );
}

async function initAdblock() {
  if (!config.adblock) {
    adState.ready = true;
    adState.enabled = false;
    emitAd();
    return;
  }
  try {
    blocker = await buildBlocker();
    blocker.enableBlockingInSession(session.defaultSession);
    adState.ready = true;
    adState.enabled = true;
    adState.count = blocker.engine.getFilters().length;
    adState.error = null;
  } catch (err) {
    adState.ready = false;
    adState.enabled = false;
    adState.error = String((err && err.message) || err);
  }
  emitAd();
  console.log('[vertex] adblock:', JSON.stringify(adState));
}

async function toggleAdblock() {
  config.adblock = !config.adblock;
  saveConfig();
  if (config.adblock) {
    if (!blocker) await initAdblock();
    else {
      blocker.enableBlockingInSession(session.defaultSession);
      adState.enabled = true;
      adState.ready = true;
      emitAd();
    }
  } else if (blocker) {
    blocker.disableBlockingInSession(session.defaultSession);
    adState.enabled = false;
    emitAd();
  }
  return { ...adState };
}

async function suggestQuery(q) {
  const query = (q || '').trim();
  if (!query) return [];
  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

function registerIpc() {
  ipcMain.handle('win:min', () => win.minimize());
  ipcMain.handle('win:max', () => {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });
  ipcMain.handle('win:close', () => win.close());
  ipcMain.handle('win:state', () => ({ maximized: win.isMaximized() }));
  ipcMain.handle('nav:commit', (_e, raw) => navigateActive(raw));
  ipcMain.handle('nav:home', () => navigateActive(null));
  ipcMain.handle('nav:back', () => goBack());
  ipcMain.handle('nav:fwd', () => goForward());
  ipcMain.handle('nav:reload', () => reloadTab(activeId));
  ipcMain.handle('nav:stop', () => stopTab(activeId));
  ipcMain.handle('tab:create', (_e, { url } = {}) => createTab(url, { activate: true }));
  ipcMain.handle('tab:close', (_e, id) => closeTab(id));
  ipcMain.handle('tab:activate', (_e, id) => activateTab(id));
  ipcMain.handle('sugg:query', (_e, q) => suggestQuery(q));
  ipcMain.handle('config:get', () => ({ config, app: { version: app.getVersion(), chrome: process.versions.chrome, electron: process.versions.electron } }));
  ipcMain.handle('config:set', (_e, patch) => {
    config = { ...config, ...patch };
    saveConfig();
    if (patch.theme) applyTheme();
    return config;
  });
  ipcMain.handle('ad:toggle', () => toggleAdblock());
  ipcMain.handle('data:clear', async () => {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
    history = [];
    saveJSON(histPath(), history);
    return true;
  });
  ipcMain.handle('start:data', () => {
    const engines = Object.fromEntries(Object.entries(SEARCH_ENGINES).map(([k, v]) => [k, v.url('__QUERY__')]));
    return {
      config,
      engineName: SEARCH_ENGINES[config.searchEngine].name,
      engines,
      recent: history.slice(0, 12),
      app: { version: app.getVersion() },
    };
  });
}

function applyTheme() {
  // forwarded to both the chrome UI and can be read by start page later
  send('event:config', config);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    backgroundColor: '#0a0f1a',
    title: 'Vertex Browser',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('resize', layout);
  win.on('maximize', () => { layout(); send('event:winstate', { maximized: true }); });
  win.on('unmaximize', () => { layout(); send('event:winstate', { maximized: false }); });
  win.on('closed', () => { win = null; });

  registerIpc();

  const firstId = createTab(undefined);
  if (IS_SMOKE) runSmoke(firstId);
}

function runSmoke(firstTabId) {
  const t = tabs.get(firstTabId);
  const contents = t.view.webContents;
  const done = setTimeout(() => {
    console.log('SMOKE-TEST-FAIL timeout');
    app.exit(2);
  }, 30000);
  t.view.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      clearTimeout(done);
      console.log(`SMOKE-TEST-OK url=${contents.getURL()} adblock=${JSON.stringify(adState)}`);
      app.exit(0);
    }, 800);
  });
  t.view.webContents.loadURL('https://example.com/');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      createTab(process.argv.slice(1).find((a) => /^https?:\/\//.test(a)), { activate: true });
    }
  });

  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.setName('Vertex Browser');
  app.setAppUserModelId('com.vertex.browser');

  app.whenReady().then(async () => {
    loadConfig();
    loadHistory();
    await initAdblock();
    applyTheme();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}