/* Vertex Browser - chrome UI (tabs, toolbar, address bar, settings, window controls) */

const $ = (id) => document.getElementById(id);

const IC = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  min: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  max: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="14" rx="1.5"/></svg>',
  restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="7" width="12" height="12" rx="1.5"/><path d="M8 4h10a2 2 0 0 1 2 2v10"/></svg>',
  shieldOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5" stroke-width="2.2"/></svg>',
  shieldOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M9 10l6 6M15 10l-6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

function setSVG(id, str) {
  const n = $(id);
  if (n) n.innerHTML = str;
}

let tabsList = [];
let config = { adblock: true, searchEngine: 'google', theme: 'dark' };
let engineName = 'Google';
let maximized = false;
let lastUrl = '';

const urlInput = $('url');
const suggestBox = $('suggest');
let sugRows = [];
let sugSel = -1;
let sugTimer = null;

/* ---------------- boot ---------------- */

setSVG('back', IC.back);
setSVG('fwd', IC.fwd);
setSVG('reload', IC.reload);
setSVG('home', IC.home);
setSVG('newtab', IC.plus);
setSVG('win-min', IC.min);
setSVG('win-max', IC.max);
setSVG('win-close', IC.close);
setSVG('shield', IC.shieldOn);
setSVG('settings', IC.gear);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function renderShield(st) {
  const sh = $('shield');
  const on = !!(st && st.enabled);
  sh.innerHTML = on ? IC.shieldOn : IC.shieldOff;
  sh.classList.toggle('on', on);
  sh.title = on ? 'Ad blocker: on' : 'Ad blocker: off';
  const c = $('adcount');
  if (c) c.textContent = on && st.count ? `${st.count.toLocaleString()} filters active` : '';
}

function renderTabs(list) {
  tabsList = list || [];
  const host = $('tabs');
  host.innerHTML = '';
  for (const t of tabsList) {
    const el = document.createElement('div');
    el.className = `tab${t.active ? ' active' : ''}`;
    el.title = t.title;
    const fav = t.icon
      ? `<div class="fav"><img src="${t.icon}" alt="" /></div>`
      : `<div class="fav">${(t.title.trim()[0] || '∅').toUpperCase()}</div>`;
    const right = t.loading
      ? '<div class="spin"></div><div class="t-close">' + IC.close + '</div>'
      : '<div class="t-close">' + IC.close + '</div>';
    el.innerHTML = `${fav}<div class="t-title"></div>${right}`;
    el.querySelector('.t-title').textContent = t.title || 'New Tab';
    el.addEventListener('click', () => window.vertex.activateTab(t.id));
    el.querySelector('.t-close').addEventListener('click', (e) => {
      e.stopPropagation();
      window.vertex.closeTab(t.id);
    });
    host.appendChild(el);
  }
}

function displayUrl(url) {
  if (!url || url === 'vertex://start') return '';
  return url
    .replace(/^https:\/\//, '')
    .replace(/^http:\/\//, '')
    .replace(/\/$/, '');
}

function renderChrome(st) {
  if (!st) return;
  lastUrl = st.url || '';
  const isStart = !st.url || st.url === 'vertex://start';
  if (document.activeElement !== urlInput) {
    urlInput.value = isStart ? '' : displayUrl(st.url);
  }
  $('back').disabled = !st.canGoBack;
  $('fwd').disabled = !st.canGoForward;
  const secure = /^https:\/\//.test(st.url) || isStart;
  const lockEl = $('scheme');
  lockEl.innerHTML = secure ? IC.lock : IC.globe;
  lockEl.classList.toggle('secure', secure);
  const reloadBtn = $('reload');
  if (st.loading) {
    reloadBtn.innerHTML = IC.stop;
    reloadBtn.title = 'Stop';
  } else {
    reloadBtn.innerHTML = IC.reload;
    reloadBtn.title = 'Reload (F5)';
  }
}

function showToast(text, kind) {
  const t = $('toast');
  t.textContent = text;
  t.className = kind === 'error' ? 'err' : '';
  t.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.hidden = true; }, 4200);
}

/* ---------------- window controls ---------------- */

function switchMaxIcon() {
  setSVG('win-max', maximized ? IC.restore : IC.max);
  $('win-max').title = maximized ? 'Restore down' : 'Maximize';
}

$('win-min').addEventListener('click', () => window.vertex.minimize());
$('win-max').addEventListener('click', () => window.vertex.maximize());
$('win-close').addEventListener('click', () => window.vertex.close());

for (const d of document.querySelectorAll('.drag')) {
  d.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    window.vertex.maximize();
  });
}

/* ---------------- nav buttons ---------------- */

$('back').addEventListener('click', () => window.vertex.back());
$('fwd').addEventListener('click', () => window.vertex.fwd());
$('reload').addEventListener('click', () => {
  const loading = tabsList.find((t) => t.active)?.loading;
  loading ? window.vertex.stop() : window.vertex.reload();
});
$('home').addEventListener('click', () => window.vertex.goHome());
$('newtab').addEventListener('click', () => window.vertex.newTab());

/* ---------------- address bar + suggestions ---------------- */

const isUrlish = (v) =>
  /^(\w[\w+.-]*):\/\//.test(v) ||
  /^localhost(:\d+)?([/?#]|$)/i.test(v) ||
  /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?([/?#]|$)/i.test(v);

function commit(raw) {
  hideSuggest();
  urlInput.blur();
  window.vertex.commit(raw || urlInput.value);
}

function hideSuggest() {
  suggestBox.hidden = true;
  sugRows = [];
  sugSel = -1;
}

function engineSearch(q) {
  const urls = {
    google: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    duck: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    bing: `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    startpage: `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`,
  };
  return urls[config.searchEngine] || urls.google;
}

function buildSuggest(q, hits) {
  sugRows = [];
  suggestBox.innerHTML = '';
  if (isUrlish(q) && !q.includes(' ') && !q.startsWith('http')) {
    sugRows.push({ label: q, value: q, type: 'url', hint: 'Visit site' });
  }
  sugRows.push({ label: q, value: engineSearch(q), type: 'search', hint: `Search on ${engineName}` });
  for (const h of hits || []) {
    if (sugRows.length >= 9) break;
    sugRows.push({ label: h, value: engineSearch(h), type: 'q', hint: 'Search' });
  }
  suggestBox.innerHTML = '';
  const mk = (r) => {
    const el = document.createElement('div');
    el.className = 'sug-row';
    const ic = r.type === 'url' ? IC.globe : r.type === 'search' && sugRows.length === 1 ? IC.search : IC.clock;
    el.innerHTML = `<div class="s-ic">${ic}</div><div class="s-txt"></div><div class="s-hint"></div>`;
    el.querySelector('.s-txt').textContent = r.label;
    el.querySelector('.s-hint').textContent = r.hint;
    el.addEventListener('click', () => commit(r.value));
    return el;
  };
  sugRows.forEach((r) => suggestBox.appendChild(mk(r)));
  suggestBox.hidden = false;
  sugSel = -1;
}

urlInput.addEventListener('input', () => {
  clearTimeout(sugTimer);
  const q = urlInput.value.trim();
  if (!q) { hideSuggest(); return; }
  sugTimer = setTimeout(async () => {
    const hits = await window.vertex.suggest(q);
    if (urlInput.value.trim() !== q) return;
    buildSuggest(q, hits);
  }, 140);
});

urlInput.addEventListener('focus', () => {
  if (!urlInput.value.trim()) return;
  urlInput.select();
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (sugSel >= 0 && sugRows[sugSel]) commit(sugRows[sugSel].value);
    else commit();
  } else if (e.key === 'Escape') {
    hideSuggest();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (suggestBox.hidden) return;
    sugSel = (sugSel + 1) % sugRows.length;
    highlightSug();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (suggestBox.hidden) return;
    sugSel = (sugSel - 1 + sugRows.length) % sugRows.length;
    highlightSug();
  }
});

function highlightSug() {
  [...suggestBox.children].forEach((n, i) => n.classList.toggle('sel', i === sugSel));
}

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#searchwrap')) hideSuggest();
});

/* ---------------- settings ---------------- */

function openPanel() {
  $('settings-panel').hidden = !$('settings-panel').hidden;
}

$('settings').addEventListener('click', openPanel);
$('shield').addEventListener('click', async () => {
  const st = await window.vertex.toggleAdblock();
  renderShield(st);
  showToast(st.enabled ? 'Ad blocker is now ON' : 'Ad blocker is now OFF');
});
$('ad-toggle').addEventListener('change', async () => {
  window.vertex.toggleAdblock();
});
$('engine').addEventListener('change', (e) => {
  window.vertex.setConfig({ searchEngine: e.target.value });
  showToast(`Search engine: ${e.target.selectedOptions[0].textContent}`);
});
$('homepage').addEventListener('change', (e) => {
  const v = e.target.value;
  $('custom-home-row').hidden = v !== 'custom';
  if (v === 'vertex') window.vertex.setConfig({ homepage: 'vertex' });
  if (v === 'current' && lastUrl) window.vertex.setConfig({ homepage: lastUrl });
});
$('custom-home').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  if (v) window.vertex.setConfig({ homepage: v.startsWith('http') ? v : `https://${v}` });
});
$('theme').addEventListener('change', (e) => {
  applyTheme(e.target.value);
  window.vertex.setConfig({ theme: e.target.value });
});
$('clear-data').addEventListener('click', async () => {
  await window.vertex.clearData();
  showToast('Browsing data cleared');
});
$('url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commit();
  if (e.key === 'Escape') urlInput.blur();
});

/* ---------------- events from main ---------------- */

window.vertex.on('event:tabs', renderTabs);
window.vertex.on('event:chrome', renderChrome);
window.vertex.on('event:ad', renderShield);
window.vertex.on('event:config', (c) => applyTheme(c.theme));
window.vertex.on('event:winstate', (w) => {
  maximized = !!w.maximized;
  switchMaxIcon();
});
window.vertex.on('ui:focus-url', () => {
  urlInput.focus();
  urlInput.select();
});
window.vertex.on('event:toast', (d) => showToast(d.text, d.kind));

/* ---------------- init ---------------- */

(async () => {
  const cfg = await window.vertex.getConfig();
  config = cfg.config;
  engineName = configName(config.searchEngine);
  applyTheme(config.theme);
  $('ad-toggle').checked = !!config.adblock;
  $('engine').value = config.searchEngine;
  const homeMode = config.homepage === 'vertex' ? 'vertex' : /^https?:/.test(config.homepage) ? 'custom' : 'current';
  $('homepage').value = homeMode;
  $('custom-home-row').hidden = homeMode !== 'custom';
  $('custom-home').value = config.homepage !== 'vertex' ? config.homepage : '';
  if (cfg.app) {
    $('app-version').textContent = cfg.app.version;
    $('chrome-version').textContent = cfg.app.chrome;
  }
  const w = await window.vertex.winState();
  maximized = !!w.maximized;
  switchMaxIcon();
})();

function configName(key) {
  const m = { google: 'Google', duck: 'DuckDuckGo', bing: 'Bing', startpage: 'Startpage' };
  return m[key] || key;
}