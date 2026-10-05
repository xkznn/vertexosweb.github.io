import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { MonitorSmartphone, Plus, RotateCcw, Trash2, X } from "lucide-react";

export type LockAppInstance = { id: string; appId: string; x: number; y: number };
export type RecentApp = { id: string; title: string };

const APPS_KEY = "vertex-lock-apps-v1";
const RECENT_KEY = "vertex-recent-apps-v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

function loadApps(): LockAppInstance[] {
  const raw = readJson<unknown>(APPS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .filter((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.appId === "string")
    .map((item) => ({
      id: String(item.id),
      appId: String(item.appId),
      x: typeof item.x === "number" ? item.x : 0.5,
      y: typeof item.y === "number" ? item.y : 0.8,
    }));
}

function loadRecent(): RecentApp[] {
  const raw = readJson<unknown>(RECENT_KEY, []);
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .filter((item) => item && typeof item === "object" && typeof item.id === "string")
    .map((item) => ({ id: String(item.id), title: typeof item.title === "string" ? item.title : String(item.id) }));
}

let lockApps: LockAppInstance[] = loadApps();
const appListeners = new Set<() => void>();
let recentApps: RecentApp[] = loadRecent();
const recentListeners = new Set<() => void>();
let seq = 0;

function commitApps(next: LockAppInstance[]): void {
  lockApps = next;
  writeJson(APPS_KEY, next);
  appListeners.forEach((listener) => { try { listener(); } catch { /* noop */ } });
}
function commitRecent(next: RecentApp[]): void {
  recentApps = next;
  writeJson(RECENT_KEY, next);
  recentListeners.forEach((listener) => { try { listener(); } catch { /* noop */ } });
}

export function getLockApps(): LockAppInstance[] { return lockApps; }
export function subscribeLockApps(listener: () => void): () => void {
  appListeners.add(listener);
  return () => { appListeners.delete(listener); };
}
export function addLockApp(appId: string): void {
  if (!appId || lockApps.some((item) => item.appId === appId)) return;
  seq += 1;
  const count = lockApps.length;
  const x = 0.16 + ((count * 0.16) % 0.68);
  const y = 0.7 + ((count * 0.08) % 0.18);
  commitApps([...lockApps, { id: `la-${Date.now().toString(36)}-${seq}`, appId, x, y }]);
}
export function removeLockApp(id: string): void { commitApps(lockApps.filter((item) => item.id !== id)); }
export function updateLockApp(id: string, patch: { x?: number; y?: number }): void {
  commitApps(lockApps.map((item) => (item.id === id ? { ...item, x: patch.x ?? item.x, y: patch.y ?? item.y } : item)));
}
export function resetLockApps(): void { commitApps([]); }

export function getRecentApps(): RecentApp[] { return recentApps; }
export function subscribeRecentApps(listener: () => void): () => void {
  recentListeners.add(listener);
  return () => { recentListeners.delete(listener); };
}
export function recordRecentApp(id: string, title: string): void {
  if (!id) return;
  const next = [{ id, title: title || id }, ...recentApps.filter((item) => item.id !== id)].slice(0, 8);
  commitRecent(next);
}

function useLockApps(): LockAppInstance[] {
  const [value, setValue] = useState<LockAppInstance[]>(() => getLockApps());
  useEffect(() => subscribeLockApps(() => setValue(getLockApps())), []);
  return value;
}
function useRecentApps(): RecentApp[] {
  const [value, setValue] = useState<RecentApp[]>(() => getRecentApps());
  useEffect(() => subscribeRecentApps(() => setValue(getRecentApps())), []);
  return value;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function LockAppTile({ item, title, icon, onLaunch }: { item: LockAppInstance; title: string; icon: ReactNode; onLaunch: (appId: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const rootRef = useRef<HTMLButtonElement>(null);

  const style = { left: `${item.x * 100}%`, top: `${item.y * 100}%` } as CSSProperties;

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if ((event.target as HTMLElement).closest(".la-x")) return;
    event.stopPropagation();
    movedRef.current = false;
    dragRef.current = { px: event.clientX, py: event.clientY, x: item.x, y: item.y };
    setDragging(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* noop */ }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragRef.current;
    const parent = rootRef.current?.parentElement;
    if (!start || !parent) return;
    if (Math.abs(event.clientX - start.px) > 4 || Math.abs(event.clientY - start.py) > 4) movedRef.current = true;
    const rect = parent.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    updateLockApp(item.id, {
      x: clamp(start.x + (event.clientX - start.px) / rect.width, 0.04, 0.96),
      y: clamp(start.y + (event.clientY - start.py) / rect.height, 0.05, 0.95),
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    setDragging(false);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  };

  return (
    <button
      ref={rootRef}
      type="button"
      className={`la-app ${dragging ? "is-dragging" : ""}`}
      style={style}
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        event.stopPropagation();
        if (movedRef.current) { movedRef.current = false; return; }
        onLaunch(item.appId);
      }}
      data-testid={`lock-app-${item.appId}`}
    >
      <span className="la-icon">{icon}</span>
      <span className="la-name">{title}</span>
      <span
        className="la-x"
        role="button"
        aria-label={`Remove ${title}`}
        onClick={(event) => { event.stopPropagation(); event.preventDefault(); removeLockApp(item.id); }}
      >
        <X size={11} />
      </span>
    </button>
  );
}

export function LockAppsLayer({ catalog, renderIcon, onLaunch }: {
  catalog: { id: string; title: string }[];
  renderIcon: (appId: string) => ReactNode;
  onLaunch: (appId: string) => void;
}) {
  const items = useLockApps();
  if (!items.length) return null;
  const titleOf = (id: string) => catalog.find((entry) => entry.id === id)?.title ?? id;
  return (
    <div className="la-layer la-layer--lock">
      {items.map((item) => (
        <LockAppTile key={item.id} item={item} title={titleOf(item.appId)} icon={renderIcon(item.appId)} onLaunch={onLaunch} />
      ))}
    </div>
  );
}

export function LockAppsManager({ catalog }: { catalog: { id: string; title: string }[] }) {
  const items = useLockApps();
  const recents = useRecentApps();
  const [pick, setPick] = useState<string>(() => catalog[0]?.id ?? "");
  const titleOf = (id: string) => catalog.find((entry) => entry.id === id)?.title ?? id;

  return (
    <div className="la-manager">
      <section className="win-settings-card">
        <div className="setting-group"><MonitorSmartphone size={13} /> Lock screen apps</div>
        <p className="win-settings-sub">Pin apps to your lock screen. Drag them anywhere you like, and click to open them straight from the lock screen.</p>
        <div className="win-settings-inline wrap">
          <select className="setting-select" value={pick} onChange={(event) => setPick(event.target.value)} aria-label="Choose an app">
            {catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
          </select>
          <button className="outline-button" onClick={() => addLockApp(pick)} disabled={!pick}><Plus size={13} /> Add to lock screen</button>
          <button className="outline-button" onClick={() => resetLockApps()}><RotateCcw size={13} /> Clear all</button>
        </div>
        {recents.length > 0 && (
          <div className="la-recent">
            <span className="la-recent-label">Recent apps</span>
            <div className="la-recent-chips">
              {recents.map((entry) => <button key={entry.id} className="la-chip" onClick={() => addLockApp(entry.id)}><Plus size={11} /> {entry.title}</button>)}
            </div>
          </div>
        )}
      </section>
      <section className="win-settings-card">
        <div className="setting-group"><MonitorSmartphone size={13} /> On your lock screen ({items.length})</div>
        {items.length ? items.map((item) => (
          <div className="la-manage-item" key={item.id}>
            <span className="la-manage-name">{titleOf(item.appId)}</span>
            <button className="outline-button" onClick={() => removeLockApp(item.id)}><Trash2 size={13} /> Remove</button>
          </div>
        )) : <p className="win-settings-sub">None yet — add one above.</p>}
      </section>
    </div>
  );
}
