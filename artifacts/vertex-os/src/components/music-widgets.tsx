import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Music2, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { getMediaSession, subscribeMediaSession, type MediaSession } from "../now-playing";

export type WidgetSurface = "desktop" | "lock";
export type WidgetSize = "sm" | "md" | "lg";
export type WidgetShape = "squircle" | "round" | "card";

export type MusicWidgetStyle = {
  size: WidgetSize;
  shape: WidgetShape;
  accent: string;
  opacity: number;
  showArtist: boolean;
  showProgress: boolean;
  glow: boolean;
};

export type MusicWidgetInstance = {
  id: string;
  surface: WidgetSurface;
  x: number;
  y: number;
  style: MusicWidgetStyle;
};

const STORE_KEY = "vertex-music-widgets-v2";
const AUTOSHOW_KEY = "vertex-music-widgets-autoshow";
const ACCENTS = ["#8de6ff", "#b98cff", "#ff7ab6", "#7dffb0", "#ffb057", "#ff6b6b", "#ffe066", "#5b8cff"];

const DEFAULT_STYLE: MusicWidgetStyle = {
  size: "md",
  shape: "squircle",
  accent: "#8de6ff",
  opacity: 1,
  showArtist: true,
  showProgress: true,
  glow: true,
};

function defaultWidgets(): MusicWidgetInstance[] {
  return [{ id: "mw-default", surface: "desktop", x: 0.82, y: 0.3, style: { ...DEFAULT_STYLE } }];
}

function loadWidgets(): MusicWidgetInstance[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultWidgets();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultWidgets();
    return (parsed as Array<Record<string, unknown>>)
      .filter((item) => item && typeof item === "object" && typeof item.id === "string")
      .map((item) => ({
        id: String(item.id),
        surface: item.surface === "lock" ? ("lock" as const) : ("desktop" as const),
        x: typeof item.x === "number" ? item.x : 0.5,
        y: typeof item.y === "number" ? item.y : 0.5,
        style: { ...DEFAULT_STYLE, ...((item.style as Partial<MusicWidgetStyle>) ?? {}) },
      }));
  } catch {
    return defaultWidgets();
  }
}

let widgets: MusicWidgetInstance[] = loadWidgets();
const listeners = new Set<() => void>();

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(widgets)); } catch { /* noop */ }
}
function commit(next: MusicWidgetInstance[]) {
  widgets = next;
  persist();
  listeners.forEach((listener) => { try { listener(); } catch { /* noop */ } });
}

export function getWidgets(): MusicWidgetInstance[] { return widgets; }
export function subscribeWidgets(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let seq = 0;
export function addWidget(surface: WidgetSurface): void {
  seq += 1;
  const id = `mw-${Date.now().toString(36)}-${seq}`;
  const count = widgets.filter((item) => item.surface === surface).length;
  const x = surface === "desktop" ? 0.78 : 0.5;
  const y = surface === "desktop" ? 0.28 + ((count * 0.12) % 0.4) : 0.3 + ((count * 0.14) % 0.4);
  commit([...widgets, { id, surface, x, y, style: { ...DEFAULT_STYLE } }]);
}
export function removeWidget(id: string): void { commit(widgets.filter((item) => item.id !== id)); }
export function updateWidget(id: string, patch: { x?: number; y?: number; style?: Partial<MusicWidgetStyle> }): void {
  commit(widgets.map((item) => (item.id === id
    ? { ...item, x: patch.x ?? item.x, y: patch.y ?? item.y, style: patch.style ? { ...item.style, ...patch.style } : item.style }
    : item)));
}
export function resetWidgets(): void { commit(defaultWidgets()); }

function readAutoShow(): boolean {
  try { const raw = localStorage.getItem(AUTOSHOW_KEY); return raw === null ? true : raw === "1"; } catch { return true; }
}
let autoShow = readAutoShow();
const autoListeners = new Set<() => void>();
export function getAutoShow(): boolean { return autoShow; }
export function setAutoShow(value: boolean): void {
  autoShow = value;
  try { localStorage.setItem(AUTOSHOW_KEY, value ? "1" : "0"); } catch { /* noop */ }
  autoListeners.forEach((listener) => { try { listener(); } catch { /* noop */ } });
}
export function subscribeAutoShow(listener: () => void): () => void {
  autoListeners.add(listener);
  return () => { autoListeners.delete(listener); };
}

function useWidgets(): MusicWidgetInstance[] {
  const [items, setItems] = useState<MusicWidgetInstance[]>(() => getWidgets());
  useEffect(() => subscribeWidgets(() => setItems(getWidgets())), []);
  return items;
}

function useSession(): MediaSession | null {
  const [session, setSession] = useState<MediaSession | null>(() => getMediaSession());
  useEffect(() => subscribeMediaSession(() => setSession(getMediaSession())), []);
  return session;
}

function useAutoShow(): boolean {
  const [value, setValue] = useState<boolean>(() => getAutoShow());
  useEffect(() => subscribeAutoShow(() => setValue(getAutoShow())), []);
  return value;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function StyleControls({ value, onChange }: { value: MusicWidgetStyle; onChange: (patch: Partial<MusicWidgetStyle>) => void }) {
  const sizes: WidgetSize[] = ["sm", "md", "lg"];
  const shapes: WidgetShape[] = ["squircle", "round", "card"];
  return (
    <div className="mw-controls">
      <div className="mw-ctl-row">
        <span>Size</span>
        <div className="mw-ctl-seg">{sizes.map((size) => <button key={size} className={value.size === size ? "active" : ""} onClick={() => onChange({ size })}>{size.toUpperCase()}</button>)}</div>
      </div>
      <div className="mw-ctl-row">
        <span>Shape</span>
        <div className="mw-ctl-seg">{shapes.map((shape) => <button key={shape} className={value.shape === shape ? "active" : ""} onClick={() => onChange({ shape })}>{shape === "squircle" ? "Squircle" : shape === "round" ? "Round" : "Card"}</button>)}</div>
      </div>
      <div className="mw-ctl-row">
        <span>Accent</span>
        <div className="mw-swatches">{ACCENTS.map((color) => <button key={color} type="button" className={value.accent === color ? "active" : ""} style={{ background: color }} onClick={() => onChange({ accent: color })} aria-label={`Accent ${color}`} />)}</div>
      </div>
      <label className="mw-ctl-row">
        <span>Opacity</span>
        <input type="range" min={0.4} max={1} step={0.05} value={value.opacity} onChange={(event) => onChange({ opacity: Number(event.target.value) })} />
      </label>
      <div className="mw-ctl-toggles">
        <button className={value.showArtist ? "active" : ""} onClick={() => onChange({ showArtist: !value.showArtist })}>Artist</button>
        <button className={value.showProgress ? "active" : ""} onClick={() => onChange({ showProgress: !value.showProgress })}>Progress</button>
        <button className={value.glow ? "active" : ""} onClick={() => onChange({ glow: !value.glow })}>Glow</button>
      </div>
    </div>
  );
}

function WidgetCard({ item }: { item: MusicWidgetInstance }) {
  const session = useSession();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => tick((count) => (count + 1) % 1000), 800);
    return () => window.clearInterval(id);
  }, [session]);

  const dur = session && Number.isFinite(session.duration) && session.duration > 0 ? session.duration : 0;
  const progRaw = session && Number.isFinite(session.progress) ? session.progress : 0;
  const prog = dur ? Math.min(progRaw, dur) : progRaw;
  const pct = dur ? Math.min(100, (prog / dur) * 100) : 0;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input, select, label")) return;
    event.stopPropagation();
    dragRef.current = { px: event.clientX, py: event.clientY, x: item.x, y: item.y };
    setDragging(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* noop */ }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    const parent = rootRef.current?.parentElement;
    if (!start || !parent) return;
    const rect = parent.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = clamp(start.x + (event.clientX - start.px) / rect.width, 0.05, 0.95);
    const ny = clamp(start.y + (event.clientY - start.py) / rect.height, 0.06, 0.94);
    updateWidget(item.id, { x: nx, y: ny });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  };

  const style = {
    left: `${item.x * 100}%`,
    top: `${item.y * 100}%`,
    opacity: item.style.opacity,
    "--mw-accent": item.style.accent,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`mw mw--${item.style.size} mw--${item.style.shape} ${item.style.glow ? "mw--glow" : ""} ${dragging ? "is-dragging" : ""}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => event.stopPropagation()}
      data-testid={`music-widget-${item.id}`}
    >
      <div className="mw-art">
        {session?.artwork ? <img src={session.artwork} alt="" draggable={false} /> : <span className="mw-art-ph"><Music2 size={item.style.size === "lg" ? 30 : 20} /></span>}
        <span className={`mw-eq ${session?.playing ? "on" : ""}`} aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="mw-meta">
        <span className={`mw-now ${session?.playing ? "on" : ""}`}>{session ? (session.playing ? "NOW PLAYING" : "PAUSED") : "MUSIC"}</span>
        <strong className="mw-title">{session?.title || "Nothing playing"}</strong>
        {item.style.showArtist && <span className="mw-artist">{session ? (session.artist || "Unknown artist") : "Open Spicetify or VerTube"}</span>}
        {item.style.showProgress && dur > 0 && <span className="mw-progress"><i style={{ width: `${pct}%` }} /></span>}
      </div>
      <div className="mw-actions">
        {session && (
          <button className="mw-act" onClick={(event) => { event.stopPropagation(); session.onToggle?.(); }} aria-label={session.playing ? "Pause" : "Play"}>
            {session.playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
        )}
        <button className="mw-act" onClick={(event) => { event.stopPropagation(); setEditing((value) => !value); }} aria-label="Style widget"><SlidersHorizontal size={13} /></button>
        <button className="mw-act mw-act--danger" onClick={(event) => { event.stopPropagation(); removeWidget(item.id); }} aria-label="Remove widget"><X size={13} /></button>
      </div>
      {editing && (
        <div className="mw-panel" onClick={(event) => event.stopPropagation()}>
          <StyleControls value={item.style} onChange={(patch) => updateWidget(item.id, { style: patch })} />
        </div>
      )}
    </div>
  );
}

export function MusicWidgetLayer({ surface }: { surface: WidgetSurface }) {
  const items = useWidgets();
  const session = useSession();
  const autoShow = useAutoShow();
  if (autoShow && !session) return null;
  const list = items.filter((item) => item.surface === surface);
  if (!list.length) return null;
  return <div className={`mw-layer mw-layer--${surface}`}>{list.map((item) => <WidgetCard key={item.id} item={item} />)}</div>;
}

export function MusicWidgetManager() {
  const items = useWidgets();
  const autoShow = useAutoShow();
  const desktop = items.filter((item) => item.surface === "desktop");
  const lock = items.filter((item) => item.surface === "lock");
  const renderList = (list: MusicWidgetInstance[]) => list.length
    ? list.map((item) => (
      <div className="mw-manage-item" key={item.id}>
        <div className="mw-manage-head"><strong>Music widget</strong><button className="outline-button" onClick={() => removeWidget(item.id)}><Trash2 size={13} /> Remove</button></div>
        <StyleControls value={item.style} onChange={(patch) => updateWidget(item.id, { style: patch })} />
      </div>
    ))
    : <p className="win-settings-sub">None yet — add one above.</p>;

  return (
    <div className="mw-manager">
      <section className="win-settings-card">
        <div className="setting-group"><Music2 size={13} /> Song widgets</div>
        <p className="win-settings-sub">Apple-style music widgets that show the song artwork and name. Drag them anywhere on the desktop or lock screen, and style them however you like.</p>
        <div className="win-settings-inline wrap">
          <button className="outline-button" onClick={() => addWidget("desktop")}><Plus size={13} /> Add desktop widget</button>
          <button className="outline-button" onClick={() => addWidget("lock")}><Plus size={13} /> Add lock screen widget</button>
          <button className="outline-button" onClick={() => resetWidgets()}><RotateCcw size={13} /> Reset widgets</button>
        </div>
      </section>
      <section className="win-settings-card">
        <div className="setting-group"><Music2 size={13} /> Auto now-playing</div>
        <p className="win-settings-sub">Show your widgets automatically every time something plays, then hide them when nothing is playing.</p>
        <div className="win-settings-inline wrap">
          <button className={`outline-button${autoShow ? " is-on" : ""}`} onClick={() => setAutoShow(!autoShow)}>Auto-show when playing: {autoShow ? "On" : "Off"}</button>
        </div>
      </section>
      <section className="win-settings-card">
        <div className="setting-group"><SlidersHorizontal size={13} /> Desktop widgets ({desktop.length})</div>
        {renderList(desktop)}
      </section>
      <section className="win-settings-card">
        <div className="setting-group"><SlidersHorizontal size={13} /> Lock screen widgets ({lock.length})</div>
        {renderList(lock)}
      </section>
    </div>
  );
}
