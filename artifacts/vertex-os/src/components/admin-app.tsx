import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  AppWindow,
  BarChart3,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  Languages,
  LayoutDashboard,
  Lock,
  LogOut,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  TriangleAlert,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { getRecentApps } from "./lock-apps";
import {
  analyticsConfigured,
  fetchAnalytics,
  subscribeActiveUsers,
  type AnalyticsCount,
  type AnalyticsStats,
} from "../analytics";

const ADMIN_USER = "vertex-os";
const ITER = 210000;
const DEFAULT_HASH =
  "pbkdf2$210000$9f3c1a7d54b28e60af31c9d24b7ee015$ef3b9515ad2493d9a2c21d845f15abe929fc845174fb6fa7cb9c1be12e6b1c6b";

const K = {
  hash: "vertex-admin-hash-v1",
  logins: "vertex-admin-logins-v1",
  attempts: "vertex-admin-attempts-v1",
  prefs: "vertex-admin-prefs-v1",
  activity: "vertex-admin-activity-v1",
  session: "vertex-admin-session",
};

const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;
const DEFAULT_SESSION_MIN = 30;

type Prefs = { remember: boolean; sessionMinutes: number };
const DEFAULT_PREFS: Prefs = { remember: false, sessionMinutes: DEFAULT_SESSION_MIN };
type LoginRecord = { at: number; ok: boolean; user: string };
type ActivityRecord = { at: number; id: string; title: string };
type Session = { user: string; at: number; exp: number };
type Tab = "dashboard" | "analytics" | "security" | "settings";

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}
function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(K.session);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function fallbackHash(password: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce89;
  for (let i = 0; i < password.length; i += 1) {
    const c = password.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return `fnv:${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(buf));
}
async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex) as unknown as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function subtleAvailable(): boolean {
  try {
    return typeof crypto !== "undefined" && !!crypto.subtle;
  } catch {
    return false;
  }
}

async function makeHash(password: string): Promise<string> {
  if (!subtleAvailable()) return fallbackHash(password);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = bytesToHex(salt);
  const hash = await pbkdf2Hex(password, saltHex, ITER);
  return `pbkdf2$${ITER}$${saltHex}$${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  try {
    if (stored.startsWith("pbkdf2$")) {
      const parts = stored.split("$");
      const iterations = Number(parts[1]) || ITER;
      const saltHex = parts[2];
      const expected = parts[3];
      if (!saltHex || !expected) return false;
      if (!subtleAvailable()) return false;
      return (await pbkdf2Hex(password, saltHex, iterations)) === expected;
    }
    if (stored.startsWith("fnv:")) return fallbackHash(password) === stored;
    if (subtleAvailable()) return (await sha256Hex(password)) === stored;
  } catch {
    return false;
  }
  return false;
}

function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 12) score += 1;
  if (pw.length >= 16) score += 1;
  if (pw.length >= 20) score += 1;
  if (/[a-z]/.test(pw)) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 7);
}
const PASSWORD_MIN_SCORE = 6;

const scoreLabel = ["Very weak", "Very weak", "Weak", "Fair", "Okay", "Good", "Strong", "Excellent"];

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
function fmtAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function fmtNum(n: number): string {
  return n >= 1000 ? n.toLocaleString() : String(n);
}
function storageBytes(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? "";
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    return total;
  } catch {
    return 0;
  }
}

function Chart({ data }: { data: AnalyticsStats["daily"] }) {
  const w = 620;
  const h = 170;
  const pad = 14;
  if (data.length === 0) {
    return <div className="vadmin-empty"><Activity size={20} /> No traffic recorded yet.</div>;
  }
  const max = Math.max(1, ...data.map((d) => Math.max(d.views, d.visitors)));
  const n = data.length;
  const x = (i: number) => pad + (n <= 1 ? 0 : (i * (w - 2 * pad)) / (n - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const line = (sel: (d: AnalyticsStats["daily"][number]) => number) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(sel(d)).toFixed(1)}`).join(" ");
  const area = `${line((d) => d.views)} L${x(n - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="vadmin-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="vafill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={pad + f * (h - 2 * pad)} y2={pad + f * (h - 2 * pad)} className="vadmin-gridline" />
      ))}
      <path d={area} fill="url(#vafill)" />
      <path d={line((d) => d.visitors)} fill="none" stroke="#8b5cf6" strokeWidth="1.6" />
      <path d={line((d) => d.views)} fill="none" stroke="#3b82f6" strokeWidth="2" />
    </svg>
  );
}

function HourBars({ data }: { data: AnalyticsStats["hourly"] }) {
  const byHour = new Map(data.map((d) => [d.hour, d.views]));
  const max = Math.max(1, ...data.map((d) => d.views));
  return (
    <div className="vadmin-bars">
      {Array.from({ length: 24 }, (_, hr) => {
        const v = byHour.get(hr) ?? 0;
        return (
          <div className="vadmin-bars-col" key={hr} title={`${hr}:00 — ${v} views`}>
            <i style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
            {hr % 6 === 0 && <span>{hr}</span>}
          </div>
        );
      })}
    </div>
  );
}

function BarList({ title, icon: Icon, data, empty }: { title: string; icon: LucideIcon; data: AnalyticsCount[]; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="vadmin-panel">
      <h3><span className="vadmin-h-ic"><Icon size={14} /> {title}</span></h3>
      {data.length === 0 ? (
        <span className="vadmin-muted">{empty ?? "No data yet."}</span>
      ) : (
        <div className="vadmin-barlist">
          {data.map((d) => (
            <div key={d.label}>
              <div className="vadmin-row">
                <span className="vadmin-ellipsis">{d.label}</span>
                <span className="vadmin-muted">{fmtNum(d.count)}</span>
              </div>
              <div className="vadmin-bar"><i style={{ width: `${(d.count / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, unit, tone }: { icon: LucideIcon; label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className={`vadmin-kpi ${tone ?? ""}`}>
      <span className="vadmin-kpi-ic"><Icon size={15} /></span>
      <span className="vadmin-kpi-k">{label}</span>
      <span className="vadmin-kpi-v">{value}{unit ? <small>{unit}</small> : null}</span>
    </div>
  );
}

const CSS = `
.vadmin { width:100%; height:100%; display:flex; flex-direction:column; font-family:inherit; color:var(--va-fg,#e8eefb); position:relative; overflow:hidden;
  background:radial-gradient(130% 120% at 100% -20%, #18294a 0%, #0a1020 42%, #06080f 100%); }
.vadmin * { box-sizing:border-box; }
.vadmin ::-webkit-scrollbar { width:10px; height:10px; }
.vadmin ::-webkit-scrollbar-thumb { background:rgba(120,150,210,.22); border-radius:8px; border:2px solid transparent; background-clip:content-box; }
.vadmin ::-webkit-scrollbar-thumb:hover { background:rgba(120,150,210,.4); background-clip:content-box; }
.vadmin-orb { position:absolute; border-radius:50%; filter:blur(70px); opacity:.5; pointer-events:none; }
.vadmin-orb.a { width:380px; height:380px; background:#1d4ed8; top:-160px; right:-80px; }
.vadmin-orb.b { width:300px; height:300px; background:#7c3aed; bottom:-160px; left:-60px; opacity:.35; }

/* ---------- login ---------- */
.vadmin-lock { flex:1; display:flex; align-items:center; justify-content:center; padding:26px; position:relative; z-index:1; }
.vadmin-lock-card { display:grid; grid-template-columns:1.02fr 1fr; width:100%; max-width:820px; border-radius:22px; overflow:hidden;
  border:1px solid rgba(120,170,255,.16); background:rgba(12,18,32,.72); backdrop-filter:blur(14px); box-shadow:0 40px 120px rgba(0,0,0,.55); }
.vadmin-lock-brand { padding:34px 30px; display:flex; flex-direction:column; gap:16px; position:relative;
  background:linear-gradient(150deg, rgba(37,99,235,.22), rgba(124,58,237,.16) 60%, transparent); border-right:1px solid rgba(120,170,255,.12); }
.vadmin-seal { width:56px; height:56px; border-radius:16px; display:grid; place-items:center; color:#fff;
  background:linear-gradient(145deg,#3b82f6,#8b5cf6); box-shadow:0 14px 34px rgba(59,130,246,.42); }
.vadmin-lock-brand h1 { font-size:19px; margin:2px 0 0; letter-spacing:-.3px; }
.vadmin-lock-brand p { margin:0; color:#93a4c4; font-size:12.5px; line-height:1.55; }
.vadmin-lock-points { display:flex; flex-direction:column; gap:9px; margin-top:auto; }
.vadmin-lock-points span { display:flex; align-items:center; gap:8px; font-size:12px; color:#aebbd4; }
.vadmin-lock-points svg { color:#60a5fa; }
.vadmin-lock-form { padding:32px 30px; display:flex; flex-direction:column; justify-content:center; }
.vadmin-lock-form h2 { margin:0 0 4px; font-size:16px; }
.vadmin-lock-form .vadmin-sub { margin:0 0 18px; }
@media (max-width:640px){ .vadmin-lock-card { grid-template-columns:1fr; } .vadmin-lock-brand { display:none; } }

/* ---------- shell ---------- */
.vadmin-shell { flex:1; display:flex; min-height:0; position:relative; z-index:1; }
.vadmin-nav { width:208px; flex-shrink:0; padding:16px 12px; border-right:1px solid rgba(120,170,255,.09);
  background:linear-gradient(180deg, rgba(9,13,24,.72), rgba(7,10,18,.6)); display:flex; flex-direction:column; gap:3px; }
.vadmin-brand { display:flex; align-items:center; gap:10px; padding:6px 8px 14px; }
.vadmin-brand-ic { width:34px; height:34px; border-radius:10px; display:grid; place-items:center; color:#fff; flex-shrink:0;
  background:linear-gradient(145deg,#3b82f6,#8b5cf6); box-shadow:0 8px 20px rgba(59,130,246,.35); }
.vadmin-brand-t { font-size:13px; font-weight:700; letter-spacing:-.2px; }
.vadmin-brand-s { font-size:10px; color:#6f7f9e; letter-spacing:.06em; text-transform:uppercase; }
.vadmin-nav button { display:flex; align-items:center; gap:10px; width:100%; padding:10px 11px; border-radius:11px; border:1px solid transparent;
  background:transparent; color:#a9b6cd; font-size:12.5px; font-weight:500; cursor:pointer; text-align:left; transition:background .15s; }
.vadmin-nav button svg { opacity:.85; }
.vadmin-nav button:hover { background:rgba(255,255,255,.05); color:#fff; }
.vadmin-nav button.on { background:linear-gradient(100deg, rgba(59,130,246,.22), rgba(139,92,246,.14)); border-color:rgba(59,130,246,.35); color:#fff; }
.vadmin-nav .nav-sec { font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:#5c6b88; padding:14px 11px 6px; }
.vadmin-nav .spacer { flex:1; }
.vadmin-nav .vadmin-nav-foot { border-top:1px solid rgba(120,170,255,.1); margin-top:10px; padding-top:10px; display:flex; flex-direction:column; gap:3px; }
.vadmin-signout { color:#f0a8a8 !important; }
.vadmin-signout:hover { background:rgba(239,68,68,.14) !important; color:#fff !important; }

.vadmin-main { flex:1; min-width:0; display:flex; flex-direction:column; }
.vadmin-topbar { display:flex; align-items:center; gap:14px; padding:14px 22px; border-bottom:1px solid rgba(120,170,255,.09);
  background:rgba(9,13,24,.4); backdrop-filter:blur(8px); }
.vadmin-topbar h2 { margin:0; font-size:15px; }
.vadmin-topbar .vadmin-sub { margin:1px 0 0; }
.vadmin-topbar-actions { margin-left:auto; display:flex; align-items:center; gap:10px; }
.vadmin-pill { display:flex; align-items:center; gap:7px; padding:6px 11px; border-radius:999px; font-size:11.5px; font-weight:600;
  border:1px solid rgba(120,170,255,.18); background:rgba(255,255,255,.04); color:#cdd8ec; }
.vadmin-pill.live { border-color:rgba(34,197,94,.35); background:rgba(34,197,94,.1); color:#b6f0cd; }
.vadmin-pill.warn { border-color:rgba(250,204,21,.3); background:rgba(250,204,21,.08); color:#f3dd9a; }
.vadmin-content { flex:1; min-height:0; overflow:auto; padding:20px 22px 34px; }

/* ---------- inputs / buttons ---------- */
.vadmin-field { margin-bottom:14px; }
.vadmin-field label { display:block; font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:#7f90b2; margin-bottom:7px; }
.vadmin-input { width:100%; padding:11px 13px; border-radius:11px; border:1px solid rgba(120,170,255,.2);
  background:rgba(6,9,16,.72); color:#eef3fc; font-size:13px; outline:none; transition:border-color .15s ease, box-shadow .15s ease; }
.vadmin-input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.18); }
.vadmin-input.sm { padding:9px 11px; font-size:12.5px; }
.vadmin-input::placeholder { color:#5d6b87; }
.vadmin-input-wrap { position:relative; display:flex; align-items:center; }
.vadmin-input.with-ic { padding-left:38px; }
.vadmin-input-icon { position:absolute; left:12px; color:#6b7a97; pointer-events:none; display:flex; }
.vadmin-eye { position:absolute; right:6px; border:0; background:transparent; color:#8595b5; cursor:pointer; padding:7px; border-radius:9px; display:flex; }
.vadmin-eye:hover { color:#fff; background:rgba(255,255,255,.06); }
.vadmin-btn { border:0; border-radius:12px; padding:11px 16px; font-size:13px; font-weight:600; color:#fff; display:inline-flex; align-items:center;
  justify-content:center; gap:8px; background:linear-gradient(140deg,#3b82f6,#6366f1); cursor:pointer; transition:filter .15s, transform .12s, box-shadow .15s;
  box-shadow:0 10px 24px rgba(59,130,246,.28); }
.vadmin-btn:hover { filter:brightness(1.08); }
.vadmin-btn:active { transform:scale(.985); }
.vadmin-btn:disabled { opacity:.5; cursor:not-allowed; box-shadow:none; }
.vadmin-btn.wide { width:100%; }
.vadmin-btn.sm { padding:9px 13px; font-size:12.5px; border-radius:10px; }
.vadmin-btn.ghost { background:rgba(255,255,255,.06); border:1px solid rgba(120,170,255,.2); color:#dbe6fb; box-shadow:none; }
.vadmin-btn.ghost:hover { background:rgba(255,255,255,.1); }
.vadmin-btn.danger { background:linear-gradient(140deg,#ef4444,#b91c1c); box-shadow:0 10px 24px rgba(239,68,68,.24); }
.vadmin-field-inline { display:flex; gap:8px; }
.vadmin-input-wrap { position:relative; display:block; }
.vadmin-input-ic { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:#7f90b2; display:flex; pointer-events:none; }
.vadmin-err { display:flex; align-items:center; gap:7px; color:#fca5a5; font-size:12px; min-height:16px; margin:2px 0 12px; }
.vadmin-hint { color:#75839f; font-size:11.5px; line-height:1.5; }
.vadmin-note { display:flex; align-items:center; gap:7px; }

/* ---------- panels / kpis ---------- */
.vadmin-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(158px,1fr)); gap:12px; margin:16px 0; }
.vadmin-kpi { position:relative; background:linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.02));
  border:1px solid rgba(120,170,255,.12); border-radius:15px; padding:14px 15px; overflow:hidden; transition:border-color .15s, transform .15s; }
.vadmin-kpi:hover { border-color:rgba(120,170,255,.26); transform:translateY(-1px); }
.vadmin-kpi-ic { position:absolute; top:12px; right:12px; width:30px; height:30px; border-radius:9px; display:grid; place-items:center;
  color:#9dc0ff; background:rgba(59,130,246,.14); border:1px solid rgba(59,130,246,.22); }
.vadmin-kpi-k { font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:#7f90b2; display:block; }
.vadmin-kpi-v { font-size:23px; font-weight:700; margin-top:8px; letter-spacing:-.5px; display:block; }
.vadmin-kpi-v small { font-size:11px; font-weight:600; color:#8595b5; margin-left:5px; }
.vadmin-kpi.live .vadmin-kpi-ic { color:#b6f0cd; background:rgba(34,197,94,.14); border-color:rgba(34,197,94,.3); }
.vadmin-kpi.live .vadmin-kpi-v { color:#b6f0cd; }
.vadmin-kpi.gold .vadmin-kpi-ic { color:#f3dd9a; background:rgba(250,204,21,.14); border-color:rgba(250,204,21,.3); }
.vadmin-kpi.bad .vadmin-kpi-ic { color:#fca5a5; background:rgba(239,68,68,.14); border-color:rgba(239,68,68,.3); }

.vadmin-panel { background:linear-gradient(160deg, rgba(255,255,255,.045), rgba(255,255,255,.018)); border:1px solid rgba(120,170,255,.12);
  border-radius:16px; padding:16px 17px; margin-top:14px; }
.vadmin-panel h3 { margin:0 0 13px; font-size:13px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.vadmin-panel h3 .hint { display:flex; align-items:center; gap:6px; color:#8595b5; font-size:11px; font-weight:500; }
.vadmin-h-ic { display:inline-flex; align-items:center; gap:7px; }
.vadmin-h-ic svg { color:#7ea8ff; }
.vadmin-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
@media (max-width:760px){ .vadmin-grid2 { grid-template-columns:1fr; } }
.vadmin-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px solid rgba(255,255,255,.05); font-size:12.5px; }
.vadmin-panel .vadmin-row:last-child { border-bottom:0; }
.vadmin-muted { color:#7f90b2; font-size:12px; }
.vadmin-ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:78%; }
.vadmin-ok { color:#6ee7a8; } .vadmin-bad { color:#fca5a5; }
.vadmin-empty { display:flex; align-items:center; justify-content:center; gap:9px; color:#6f7f9e; font-size:12.5px; padding:30px 0; }
.vadmin-bar { height:7px; border-radius:5px; background:rgba(255,255,255,.08); overflow:hidden; margin-top:6px; }
.vadmin-bar > i { display:block; height:100%; border-radius:5px; background:linear-gradient(90deg,#3b82f6,#8b5cf6); }
.vadmin-barlist { display:flex; flex-direction:column; gap:11px; }
.vadmin-barlist .vadmin-row { border:0; padding:0; }
.vadmin-svg { width:100%; height:170px; display:block; }
.vadmin-gridline { stroke:rgba(255,255,255,.07); stroke-width:1; }
.vadmin-bars { display:flex; align-items:flex-end; gap:3px; height:96px; }
.vadmin-bars-col { flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; height:100%; }
.vadmin-bars-col > i { width:100%; border-radius:3px 3px 0 0; background:linear-gradient(180deg,#60a5fa,#3b82f6); min-height:2px; transition:filter .12s; }
.vadmin-bars-col:hover > i { filter:brightness(1.3); }
.vadmin-bars-col > span { font-size:9px; color:#6f7f9e; margin-top:5px; }
.vadmin-launch { display:grid; grid-template-columns:repeat(auto-fill,minmax(116px,1fr)); gap:9px; }
.vadmin-launch button { display:flex; align-items:center; gap:8px; padding:11px; border-radius:11px; border:1px solid rgba(120,170,255,.16);
  background:rgba(255,255,255,.035); color:#cfd8ea; font-size:11.5px; font-weight:500; cursor:pointer; text-transform:capitalize; transition:background .15s, border-color .15s; }
.vadmin-launch button:hover { background:rgba(59,130,246,.16); border-color:rgba(59,130,246,.32); color:#fff; }
.vadmin-launch button svg { color:#8fb4ff; flex-shrink:0; }
.vadmin-feed { display:flex; flex-direction:column; }
.vadmin-feed-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid rgba(255,255,255,.05); font-size:12.5px; }
.vadmin-feed-row:last-child { border-bottom:0; }
.vadmin-feed-left { display:flex; align-items:center; gap:9px; min-width:0; }
.vadmin-avatar { width:26px; height:26px; border-radius:8px; display:grid; place-items:center; font-size:11px; font-weight:700; color:#fff; flex-shrink:0;
  background:linear-gradient(145deg,#3b82f6,#8b5cf6); text-transform:uppercase; }
.vadmin-strength { display:flex; gap:5px; margin:2px 0 4px; align-items:center; }
.vadmin-strength i { height:6px; flex:1; border-radius:4px; background:rgba(255,255,255,.09); }
.vadmin-strength i.on { background:linear-gradient(90deg,#3b82f6,#8b5cf6); }
.vadmin-stat-block { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.05); font-size:12.5px; }
.vadmin-stat-block:last-child { border-bottom:0; }
.vadmin-about { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
.vadmin-about > div { background:rgba(255,255,255,.03); border:1px solid rgba(120,170,255,.1); border-radius:12px; padding:11px 12px; }
.vadmin-about .k { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#7f90b2; }
.vadmin-about .v { font-size:13px; margin-top:5px; font-weight:600; word-break:break-word; }
.vadmin-live-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 0 rgba(34,197,94,.6); animation:vpulse 1.8s infinite; display:inline-block; }
@keyframes vpulse { 0%{box-shadow:0 0 0 0 rgba(34,197,94,.6);} 70%{box-shadow:0 0 0 8px rgba(34,197,94,0);} 100%{box-shadow:0 0 0 0 rgba(34,197,94,0);} }
.vadmin-warnbox { display:flex; align-items:center; gap:9px; }
`;

function LockScreen({
  user,
  pass,
  showPass,
  error,
  busy,
  locked,
  lockSeconds,
  onUser,
  onPass,
  onToggleShow,
  onSubmit,
}: {
  user: string;
  pass: string;
  showPass: boolean;
  error: string;
  busy: boolean;
  locked: boolean;
  lockSeconds: number;
  onUser: (v: string) => void;
  onPass: (v: string) => void;
  onToggleShow: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className="vadmin">
      <style>{CSS}</style>
      <div className="vadmin-orb a" />
      <div className="vadmin-orb b" />
      <div className="vadmin-lock">
        <div className="vadmin-lock-card">
          <div className="vadmin-lock-brand">
            <span className="vadmin-seal"><Crown size={26} /></span>
            <div>
              <h1>Vertex-OS Control Panel</h1>
              <p>Restricted administration surface. Authorised personnel only.</p>
            </div>
            <div className="vadmin-lock-points">
              <span><ShieldCheck size={15} /> PBKDF2-HMAC-SHA256 · 210k iterations</span>
              <span><Lock size={15} /> Auto-lock &amp; brute-force protection</span>
              <span><Radio size={15} /> Live traffic &amp; engagement analytics</span>
            </div>
          </div>
          <form className="vadmin-lock-form" onSubmit={onSubmit}>
            <h2>Unlock</h2>
            <p className="vadmin-sub">Enter your credentials to continue</p>
            <div className="vadmin-field">
              <label>Account</label>
              <div className="vadmin-input-wrap">
                <span className="vadmin-input-ic"><Users size={15} /></span>
                <input
                  className="vadmin-input"
                  style={{ paddingLeft: 38 }}
                  value={user}
                  onChange={(e) => onUser(e.target.value)}
                  placeholder="Vertex-OS"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="vadmin-field">
              <label>Password</label>
              <div className="vadmin-input-wrap">
                <span className="vadmin-input-ic"><KeyRound size={15} /></span>
                <input
                  className="vadmin-input"
                  style={{ paddingLeft: 38, paddingRight: 40 }}
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => onPass(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="off"
                />
                <button type="button" className="vadmin-eye" onClick={onToggleShow} title={showPass ? "Hide" : "Show"}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <p className="vadmin-err">
              {error || (locked ? <><TriangleAlert size={13} /> Locked — {lockSeconds}s remaining.</> : "")}
            </p>
            <button className="vadmin-btn wide" type="submit" disabled={busy || locked || !user || !pass}>
              {busy ? <><RefreshCw size={15} className="vadmin-spin" /> Verifying…</> : <><KeyRound size={15} /> Unlock panel</>}
            </button>
            <p className="vadmin-hint vadmin-note" style={{ justifyContent: "center", marginTop: 14 }}>
              <Info size={13} /> Press Ctrl + Alt + A anywhere to reopen this panel.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Shell({
  tab,
  setTab,
  live,
  sessionLeft,
  onSignOut,
  onReset,
  children,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  live: number;
  sessionLeft: number;
  onSignOut: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const items: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "security", label: "Security", icon: ShieldCheck },
    { id: "settings", label: "Settings", icon: Settings },
  ];
  return (
    <div className="vadmin">
      <style>{CSS}</style>
      <div className="vadmin-orb a" />
      <div className="vadmin-orb b" />
      <div className="vadmin-shell">
        <nav className="vadmin-nav">
          <div className="vadmin-brand">
            <span className="vadmin-brand-ic"><Crown size={18} /></span>
            <div>
              <div className="vadmin-brand-t">Control Panel</div>
              <div className="vadmin-brand-s">vertex-os</div>
            </div>
          </div>
          {items.map((it) => (
            <button key={it.id} className={tab === it.id ? "on" : ""} onClick={() => setTab(it.id)}>
              <it.icon size={16} /> {it.label}
            </button>
          ))}
          <div className="spacer" />
          <div className="vadmin-nav-foot">
            <div className="vadmin-pill live" style={{ margin: "0 4px 6px" }}><span className="vadmin-live-dot" /> {live} live now</div>
            <div className="vadmin-pill warn" style={{ margin: "0 4px 8px" }}><Timer size={13} /> {fmtClock(sessionLeft)} left</div>
            <button onClick={onSignOut}><LogOut size={16} /> Sign out</button>
            <button className="vadmin-signout" onClick={onReset}><Trash2 size={16} /> Reset panel data</button>
          </div>
        </nav>
        {children}
      </div>
    </div>
  );
}

export function AdminSurface() {
  const [authed, setAuthed] = useState(() => {
    const s = readSession();
    return !!s && s.exp > Date.now();
  });
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<Tab>("dashboard");
  const [prefs, setPrefs] = useState<Prefs>(() => readStore<Prefs>(K.prefs, DEFAULT_PREFS));
  const [logins, setLogins] = useState<LoginRecord[]>(() => readStore<LoginRecord[]>(K.logins, []));
  const [activity, setActivity] = useState<ActivityRecord[]>(() => readStore<ActivityRecord[]>(K.activity, []));
  const [lockUntil, setLockUntil] = useState<number>(() => readStore<number>(K.attempts, 0));
  const [failed, setFailed] = useState(0);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [live, setLive] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const s = readSession();
    if (!s || s.exp <= now) {
      sessionStorage.removeItem(K.session);
      setAuthed(false);
    }
  }, [now, authed]);

  useEffect(() => {
    if (!authed) return;
    return subscribeActiveUsers(setLive);
  }, [authed]);

  async function loadStats() {
    setLoadingStats(true);
    const data = await fetchAnalytics();
    if (data) {
      setStats(data);
      setStatsErr(null);
      setUpdatedAt(Date.now());
    } else {
      setStatsErr(
        analyticsConfigured
          ? "No analytics yet — apply the supabase/migrations/20261011000000_analytics.sql migration, then reload."
          : "Analytics backend is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).",
      );
    }
    setLoadingStats(false);
  }

  useEffect(() => {
    if (!authed || tab !== "analytics") return;
    void loadStats();
    const id = window.setInterval(() => void loadStats(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, tab]);

  const recent = useMemo(() => {
    void now;
    try {
      return getRecentApps();
    } catch {
      return [];
    }
  }, [now]);

  function persistLogins(next: LoginRecord[]) {
    setLogins(next);
    writeStore(K.logins, next);
  }

  function openSession() {
    const minutes = Math.max(5, Math.min(720, prefs.sessionMinutes || DEFAULT_SESSION_MIN));
    const session: Session = { user: ADMIN_USER, at: Date.now(), exp: Date.now() + minutes * 60000 };
    sessionStorage.setItem(K.session, JSON.stringify(session));
    setAuthed(true);
  }

  function launch(id: string, title: string) {
    try {
      window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: id }));
    } catch {
      /* noop */
    }
    const next = [{ at: Date.now(), id, title }, ...activity].slice(0, 60);
    setActivity(next);
    writeStore(K.activity, next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (lockUntil > Date.now()) {
      setError(`Locked. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`);
      return;
    }
    setBusy(true);
    setError("");
    const okUser = user.trim().toLowerCase() === ADMIN_USER;
    const stored = readStore<string>(K.hash, DEFAULT_HASH);
    const okPass = await verifyPassword(pass, stored);
    const ok = okUser && okPass;
    persistLogins([{ at: Date.now(), ok, user: user.trim().toLowerCase() || "unknown" }, ...logins].slice(0, 40));
    if (ok) {
      openSession();
      setFailed(0);
      setLockUntil(0);
      writeStore(K.attempts, 0);
      setUser("");
      setPass("");
    } else {
      const nextFailed = failed + 1;
      setFailed(nextFailed);
      if (nextFailed >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCK_MS;
        setLockUntil(until);
        writeStore(K.attempts, until);
        setFailed(0);
        setError(`Too many attempts. Locked for ${Math.round(LOCK_MS / 1000)}s.`);
      } else {
        setError("Invalid account or password.");
      }
    }
    setBusy(false);
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    const stored = readStore<string>(K.hash, DEFAULT_HASH);
    if (!(await verifyPassword(curPw, stored))) {
      setPwMsg({ tone: "err", text: "Current password is incorrect." });
      return;
    }
    if (passwordScore(newPw) < PASSWORD_MIN_SCORE) {
      setPwMsg({ tone: "err", text: "Password too weak — use 12+ chars with upper, lower, number and symbol." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ tone: "err", text: "Passwords do not match." });
      return;
    }
    writeStore(K.hash, await makeHash(newPw));
    setCurPw("");
    setNewPw("");
    setConfirmPw("");
    setPwMsg({ tone: "ok", text: "Password updated (PBKDF2, 210,000 iterations)." });
  }

  function updatePrefs(next: Partial<Prefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    writeStore(K.prefs, merged);
  }

  function signOut() {
    sessionStorage.removeItem(K.session);
    setAuthed(false);
  }

  function resetAdmin() {
    try {
      localStorage.removeItem(K.hash);
      localStorage.removeItem(K.logins);
      localStorage.removeItem(K.activity);
      localStorage.removeItem(K.attempts);
      localStorage.removeItem(K.prefs);
      sessionStorage.removeItem(K.session);
    } catch {
      /* noop */
    }
    setLogins([]);
    setActivity([]);
    setPrefs(DEFAULT_PREFS);
    setAuthed(false);
  }

  const locked = lockUntil > Date.now();
  const session = readSession();
  const sessionLeft = session ? Math.max(0, Math.floor((session.exp - now) / 1000)) : 0;
  const t = stats?.totals;
  const r = stats?.recent;

  if (!authed) {
    return (
      <LockScreen
        user={user}
        pass={pass}
        showPass={showPass}
        error={error}
        busy={busy}
        locked={locked}
        lockSeconds={Math.ceil((lockUntil - now) / 1000)}
        onUser={setUser}
        onPass={setPass}
        onToggleShow={() => setShowPass((v) => !v)}
        onSubmit={submit}
      />
    );
  }

  const navMeta: Record<Tab, { title: string; sub: string }> = {
    dashboard: { title: "Dashboard", sub: "Overview of this deployment and the panel" },
    analytics: { title: "Analytics", sub: "Real traffic from every visitor to this deployment" },
    security: { title: "Security", sub: "Credentials, hashing and login history" },
    settings: { title: "Settings", sub: "Panel preferences and maintenance" },
  };

  return (
    <Shell tab={tab} setTab={setTab} live={live} sessionLeft={sessionLeft} onSignOut={signOut} onReset={resetAdmin}>
      <div className="vadmin-main">
        <header className="vadmin-topbar">
          <div>
            <h2>{navMeta[tab].title}</h2>
            <p className="vadmin-sub">{navMeta[tab].sub}</p>
          </div>
          <div className="vadmin-topbar-actions">
            <span className="vadmin-pill live"><span className="vadmin-live-dot" /> {live} live</span>
            <span className="vadmin-pill"><Timer size={13} /> {fmtClock(sessionLeft)}</span>
            {tab === "analytics" && (
              <button className="vadmin-btn ghost sm" onClick={() => void loadStats()} disabled={loadingStats}>
                <RefreshCw size={14} /> {loadingStats ? "Refreshing…" : "Refresh"}
              </button>
            )}
          </div>
        </header>

        <div className="vadmin-content">
          {tab === "dashboard" && (
            <>
              <div className="vadmin-kpis">
                <Kpi icon={Radio} label="Live now" value={String(live)} tone="live" />
                <Kpi icon={Users} label="Unique visitors" value={t ? fmtNum(t.visitors) : "—"} />
                <Kpi icon={Eye} label="Page views" value={t ? fmtNum(t.views) : "—"} />
                <Kpi icon={Timer} label="Session left" value={(sessionLeft / 60).toFixed(1)} unit="min" />
                <Kpi icon={HardDrive} label="Storage used" value={(storageBytes() / 1024).toFixed(1)} unit="KB" />
                <Kpi icon={XCircle} label="Failed logins" value={String(failed)} tone={failed ? "bad" : undefined} />
              </div>

              <div className="vadmin-panel">
                <h3><span className="vadmin-h-ic"><AppWindow size={14} /> Quick launch</span></h3>
                <div className="vadmin-launch">
                  {["settings", "browser", "terminal", "roblox", "minecraft", "vcloud", "links", "spicetify", "discord", "verai", "vertube", "games"].map((id) => (
                    <button key={id} onClick={() => launch(id, id)}><Sparkles size={14} /> {id}</button>
                  ))}
                </div>
              </div>

              <div className="vadmin-grid2">
                <div className="vadmin-panel">
                  <h3><span className="vadmin-h-ic"><Clock size={14} /> Recently opened apps</span></h3>
                  <div className="vadmin-feed">
                    {recent.length === 0 && <span className="vadmin-hint">No recent apps.</span>}
                    {recent.map((item, i) => (
                      <div className="vadmin-feed-row" key={`${item.id}-${i}`}>
                        <span className="vadmin-feed-left">
                          <span className="vadmin-avatar">{item.title.slice(0, 1)}</span>
                          <span className="vadmin-ellipsis">{item.title}</span>
                        </span>
                        <span className="vadmin-muted">recent</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="vadmin-panel">
                  <h3><span className="vadmin-h-ic"><Activity size={14} /> Panel activity</span></h3>
                  <div className="vadmin-feed">
                    {activity.length === 0 && <span className="vadmin-hint">Nothing launched from the panel yet.</span>}
                    {activity.slice(0, 8).map((a, i) => (
                      <div className="vadmin-feed-row" key={i}>
                        <span className="vadmin-feed-left"><AppWindow size={14} /> {a.title}</span>
                        <span className="vadmin-muted">{fmtAgo(a.at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "analytics" && (
            <>
              {statsErr && <div className="vadmin-panel vadmin-warnbox"><TriangleAlert size={16} color="#facc15" /><span className="vadmin-muted">{statsErr}</span></div>}

              <div className="vadmin-kpis">
                <Kpi icon={Radio} label="Live now" value={String(live)} tone="live" />
                <Kpi icon={Users} label="Visitors" value={t ? fmtNum(t.visitors) : "—"} />
                <Kpi icon={Eye} label="Page views" value={t ? fmtNum(t.views) : "—"} />
                <Kpi icon={Activity} label="Sessions" value={t ? fmtNum(t.sessions) : "—"} />
                <Kpi icon={Eye} label="Views · 24h" value={r ? fmtNum(r.last24h) : "—"} />
                <Kpi icon={Users} label="Visitors · 24h" value={r ? fmtNum(r.unique24h) : "—"} />
                <Kpi icon={Timer} label="Avg session" value={t ? fmtDuration(t.avg_duration_ms) : "—"} />
                <Kpi icon={Sparkles} label="Events" value={t ? fmtNum(t.events) : "—"} />
              </div>

              <div className="vadmin-panel">
                <h3>
                  <span className="vadmin-h-ic"><BarChart3 size={14} /> Traffic — last 30 days</span>
                  <span className="hint">
                    <span style={{ color: "#3b82f6" }}>●</span> views
                    <span style={{ color: "#8b5cf6", marginLeft: 8 }}>●</span> visitors
                    {updatedAt ? <span style={{ marginLeft: 10 }}>· {fmtAgo(updatedAt)}</span> : null}
                  </span>
                </h3>
                <Chart data={stats?.daily ?? []} />
              </div>

              <div className="vadmin-panel">
                <h3><span className="vadmin-h-ic"><Clock size={14} /> Views by hour — last 24h</span></h3>
                <HourBars data={stats?.hourly ?? []} />
              </div>

              <div className="vadmin-grid2">
                <BarList title="Top pages" icon={Globe} data={stats?.pages ?? []} />
                <BarList title="Referrers" icon={Globe} data={stats?.referrers ?? []} />
                <BarList title="Languages" icon={Languages} data={stats?.languages ?? []} />
                <BarList title="Apps opened" icon={AppWindow} data={stats?.apps ?? []} />
                <BarList title="Devices" icon={MonitorSmartphone} data={stats?.devices ?? []} />
                <BarList title="Browsers" icon={Globe} data={stats?.browsers ?? []} />
                <BarList title="Operating systems" icon={MonitorSmartphone} data={stats?.os ?? []} />
                <div className="vadmin-panel">
                  <h3><span className="vadmin-h-ic"><Sparkles size={14} /> Engagement</span></h3>
                  <div className="vadmin-stat-block"><span>Live viewers</span><span className="vadmin-ok">{live}</span></div>
                  <div className="vadmin-stat-block"><span>Active last 5 min (sessions)</span><span>{r ? fmtNum(r.unique5m) : "—"}</span></div>
                  <div className="vadmin-stat-block"><span>Events last 5 min</span><span>{r ? fmtNum(r.last5m) : "—"}</span></div>
                  <div className="vadmin-stat-block"><span>Views per visitor</span><span>{t && t.visitors ? (t.views / t.visitors).toFixed(2) : "—"}</span></div>
                  <div className="vadmin-stat-block"><span>Views per session</span><span>{t && t.sessions ? (t.views / t.sessions).toFixed(2) : "—"}</span></div>
                </div>
              </div>
            </>
          )}

          {tab === "security" && (
            <>
              <div className="vadmin-grid2">
                <div className="vadmin-panel">
                  <h3><span className="vadmin-h-ic"><KeyRound size={14} /> Change password</span></h3>
                  <p className="vadmin-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                    Stored as PBKDF2-HMAC-SHA256, 210,000 iterations · salted. Requires 12+ chars with upper, lower, number &amp; symbol.
                  </p>
                  <form onSubmit={changePassword}>
                    <input className="vadmin-input sm" style={{ marginBottom: 9 }} type="password" value={curPw} onChange={(ev) => setCurPw(ev.target.value)} placeholder="Current password" autoComplete="off" />
                    <input className="vadmin-input sm" style={{ marginBottom: 0 }} type="password" value={newPw} onChange={(ev) => setNewPw(ev.target.value)} placeholder="New password" autoComplete="off" />
                    <div className="vadmin-strength">
                      <i className={passwordScore(newPw) >= 1 ? "on" : ""} />
                      <i className={passwordScore(newPw) >= 3 ? "on" : ""} />
                      <i className={passwordScore(newPw) >= 5 ? "on" : ""} />
                      <i className={passwordScore(newPw) >= 7 ? "on" : ""} />
                      <span className="vadmin-hint" style={{ flexShrink: 0, width: 66, textAlign: "right" }}>{scoreLabel[passwordScore(newPw)]}</span>
                    </div>
                    <input className="vadmin-input sm" style={{ margin: "6px 0 10px" }} type="password" value={confirmPw} onChange={(ev) => setConfirmPw(ev.target.value)} placeholder="Confirm new password" autoComplete="off" />
                    {pwMsg && (
                      <p className="vadmin-err" style={{ color: pwMsg.tone === "ok" ? "#86efac" : "#fca5a5" }}>
                        {pwMsg.tone === "ok" ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {pwMsg.text}
                      </p>
                    )}
                    <button className="vadmin-btn sm" type="submit"><ShieldCheck size={14} /> Update password</button>
                  </form>
                </div>
                <div className="vadmin-panel">
                  <h3><span className="vadmin-h-ic"><ShieldCheck size={14} /> Hardening</span></h3>
                  <div className="vadmin-stat-block"><span>Password hashing</span><span className="vadmin-ok">PBKDF2 · 210k</span></div>
                  <div className="vadmin-stat-block"><span>Brute-force lockout</span><span>{MAX_ATTEMPTS} tries / {Math.round(LOCK_MS / 1000)}s</span></div>
                  <div className="vadmin-stat-block"><span>Session length</span><span>{prefs.sessionMinutes} min</span></div>
                  <div className="vadmin-stat-block"><span>Current session</span><span className="vadmin-ok">{fmtClock(sessionLeft)} left</span></div>
                  <div className="vadmin-stat-block"><span>Storage isolation</span><span>sessionStorage</span></div>
                </div>
              </div>
              <div className="vadmin-panel">
                <h3><span className="vadmin-h-ic"><Clock size={14} /> Login history</span></h3>
                <div className="vadmin-feed">
                  {logins.length === 0 && <span className="vadmin-hint">No logins recorded.</span>}
                  {logins.slice(0, 14).map((l, i) => (
                    <div className="vadmin-feed-row" key={i}>
                      <span className={`vadmin-feed-left ${l.ok ? "vadmin-ok" : "vadmin-bad"}`}>
                        {l.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {l.user}
                      </span>
                      <span className="vadmin-muted">{fmtTime(l.at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "settings" && (
            <>
              <div className="vadmin-panel">
                <h3><span className="vadmin-h-ic"><Settings size={14} /> Panel preferences</span></h3>
                <div className="vadmin-row">
                  <span>Session length</span>
                  <span className="vadmin-field-inline">
                    <input className="vadmin-input sm" style={{ width: 80 }} type="number" min={5} max={720} value={prefs.sessionMinutes} onChange={(ev) => updatePrefs({ sessionMinutes: Number(ev.target.value) })} />
                    <span className="vadmin-muted" style={{ alignSelf: "center" }}>min</span>
                  </span>
                </div>
                <div className="vadmin-row">
                  <span>Keep me signed in on this device</span>
                  <input type="checkbox" checked={prefs.remember} onChange={(ev) => updatePrefs({ remember: ev.target.checked })} />
                </div>
              </div>
              <div className="vadmin-panel">
                <h3><span className="vadmin-h-ic"><Info size={14} /> About this build</span></h3>
                <div className="vadmin-about">
                  <div><div className="k">System</div><div className="v">Vertex-OS</div></div>
                  <div><div className="k">Panel account</div><div className="v">{ADMIN_USER}</div></div>
                  <div><div className="k">Platform</div><div className="v">{typeof navigator !== "undefined" ? navigator.platform || "web" : "web"}</div></div>
                  <div><div className="k">Screen</div><div className="v">{typeof window !== "undefined" ? `${window.screen.width}×${window.screen.height}` : "—"}</div></div>
                  <div><div className="k">Language</div><div className="v">{typeof navigator !== "undefined" ? navigator.language : "—"}</div></div>
                  <div><div className="k">Network</div><div className="v vadmin-note">{typeof navigator !== "undefined" && navigator.onLine ? <><Wifi size={13} /> Online</> : <><WifiOff size={13} /> Offline</>}</div></div>
                </div>
              </div>
              <div className="vadmin-panel" style={{ borderColor: "rgba(239,68,68,.28)" }}>
                <h3 style={{ color: "#fca5a5" }}><span className="vadmin-h-ic"><TriangleAlert size={14} /> Danger zone</span></h3>
                <p className="vadmin-hint">Clears the custom password, login history and activity log, restoring the built-in default password.</p>
                <button className="vadmin-btn danger sm" onClick={resetAdmin} style={{ marginTop: 10 }}><Trash2 size={14} /> Reset panel data</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
