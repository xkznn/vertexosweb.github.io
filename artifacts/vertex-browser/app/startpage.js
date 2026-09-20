/* Vertex start page */

const $ = (id) => document.getElementById(id);

const ICONS = {
  watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9.5l5.5 2.5-5.5 2.5z" fill="currentColor"/></svg>',
  games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="4"/><path d="M7 11v4M5 13h4" stroke-width="2.2"/><circle cx="16.5" cy="11" r=".8" fill="currentColor"/><circle cx="18.5" cy="13" r=".8" fill="currentColor"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a3 3 0 0 0 6 0 3 3 0 0 0 5 0 3 3 0 0 0 5 0"/><path d="M5 11v9h14v-9"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 15h10"/></svg>',
  social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 8a3 3 0 1 0-2-2.8V7c0 1.4-.6 2.3-1.5 3.2A6 6 0 0 0 9 6H4m12 4v2a5 5 0 0 1-5 5H8m4 1v0a9 9 0 0 0 9-9"/></svg>',
};

const CARDS = [
  { name: 'Watch', icon: 'watch', q: 'best trending videos this week' },
  { name: 'Play', icon: 'games', q: 'best free online games' },
  { name: 'Music', icon: 'music', q: 'top albums and new music' },
  { name: 'Shop', icon: 'shop', q: 'best deals and discounts today' },
  { name: 'News', icon: 'news', q: 'latest technology news' },
  { name: 'Social', icon: 'social', q: 'trending social media today' },
];

let engines = {}; // engineKey -> url template with __QUERY__
let engineKey = 'google';

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function faviconUrl(host) {
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

function tileHTML(name, url) {
  const host = (url || '').replace(/^https?:\/\//, '').split('/')[0];
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<a class="tile" href="#" data-url="${url}">
    <div class="mono"><img src="${faviconUrl(host)}" alt="" onerror="this.outerHTML='${letter}'" /><span class="fallback" hidden>${letter}</span></div>
    <div class="dnm">${name}</div></a>`;
}

function loadDial() {
  const saved = JSON.parse(localStorage.getItem('vertex.dial') || 'null') || [
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Twitch', url: 'https://www.twitch.tv' },
    { name: 'Reddit', url: 'https://www.reddit.com' },
    { name: 'GitHub', url: 'https://github.com' },
    { name: 'Gmail', url: 'https://mail.google.com' },
    { name: 'Spotify', url: 'https://open.spotify.com' },
  ];
  const dial = $('dial');
  dial.innerHTML = saved.map((d) => tileHTML(d.name, d.url)).join('') +
    `<div class="tile add" id="dial-add"><div class="mono">+</div><div class="dnm">Add</div></div>`;
  dial.querySelectorAll('.tile:not(#dial-add)').forEach((n) => {
    n.addEventListener('click', (e) => {
      e.preventDefault();
      window.vertex.commit(n.dataset.url);
    });
  });
  $('dial-add').addEventListener('click', () => {
    const name = prompt('Name:');
    if (!name) return;
    const url = prompt('Address (e.g. example.com):');
    if (!url) return;
    const cleanUrl = /^https?:\/\//.test(url) ? url : `https://${url}`;
    const saved2 = JSON.parse(localStorage.getItem('vertex.dial') || 'null') || [];
    saved2.push({ name, url: cleanUrl });
    localStorage.setItem('vertex.dial', JSON.stringify(saved2));
    loadDial();
  });
}

/* ---- search box ---- */

let sugRows = [];
let sugSel = -1;

function searchUrl(q) {
  const tpl = (engines[engineKey] || 'https://www.google.com/search?q=__QUERY__').replace('__QUERY__', encodeURIComponent(q));
  return tpl;
}

function commit(raw) {
  hideSuggest();
  window.vertex.commit(raw || $('q').value);
}

function buildSuggest(q, hits) {
  sugRows = [];
  const box = $('suggest');
  box.innerHTML = '';
  const mk = (label, value, hint) => {
    const el = document.createElement('div');
    el.className = 'sug-row';
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><div class="t"></div><div class="h"></div>`;
    el.querySelector('.t').textContent = label;
    el.querySelector('.h').textContent = hint;
    el.addEventListener('click', () => commit(value));
    return el;
  };
  sugRows.push({ el: mk(q, searchUrl(q), `Search web`), value: searchUrl(q) });
  (hits || []).slice(0, 8).forEach((h) => sugRows.push({ el: mk(h, searchUrl(h), 'Search'), value: searchUrl(h) }));
  box.innerHTML = '';
  sugRows.forEach((r) => box.appendChild(r.el));
  box.hidden = false;
  sugSel = -1;
}

function hideSuggest() {
  $('suggest').hidden = true;
  sugRows = [];
  sugSel = -1;
}

$('q').addEventListener('input', () => {
  const q = $('q').value.trim();
  if (!q) { hideSuggest(); return; }
  clearTimeout(hideSuggest._t);
  hideSuggest._t = setTimeout(async () => {
    const hits = await window.vertex.suggest(q);
    if ($('q').value.trim() !== q) return;
    buildSuggest(q, hits);
  }, 140);
});
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (sugSel >= 0 && sugRows[sugSel]) commit(sugRows[sugSel].value);
    else commit();
  } else if (e.key === 'Escape') {
    hideSuggest();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if ($('suggest').hidden) return;
    e.preventDefault();
    sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + sugRows.length) % sugRows.length;
    sugRows.forEach((r, i) => r.el.classList.toggle('sel', i === sugSel));
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#box')) hideSuggest();
});

/* ---- recent ---- */

function renderRecent(recent) {
  const list = $('recent');
  list.innerHTML = '';
  if (!recent || !recent.length) { $('rec-title').hidden = true; return; }
  $('rec-title').hidden = false;
  for (const r of recent.slice(0, 8)) {
    const li = document.createElement('li');
    li.textContent = r.title || r.url;
    li.title = r.url;
    li.addEventListener('click', () => window.vertex.commit(r.url));
    list.appendChild(li);
  }
}

/* ---- boot ---- */

(async () => {
  const data = await window.vertex.getStartData();
  engines = data.engines || {};
  engineKey = data.config.searchEngine || 'google';
  document.documentElement.dataset.theme = data.config.theme || 'dark';

  const cards = $('cards');
  CARDS.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="ico">${ICONS[c.icon]}</div><div class="nm">${c.name}</div>`;
    el.addEventListener('click', () => window.vertex.commit(searchUrl(c.q)));
    cards.appendChild(el);
  });

  loadDial();
  renderRecent(data.recent);
})();

window.vertex.on('event:config', (c) => {
  document.documentElement.dataset.theme = c.theme || 'dark';
});