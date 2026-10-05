import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  answerCall,
  callsReady,
  connect,
  disconnect,
  endCall,
  getLocalStream,
  getMediaConn,
  isOnline,
  isContact,
  onNet,
  placeCall,
  prepareMessagesDirectory,
  reconnectNow,
  createGroup as netCreateGroup,
  decideContactRequest,
  decideGroupInvitation,
  deleteMessage as netDeleteMessage,
  editMessage as netEditMessage,
  groupKey,
  markMessagesRead,
  sendMedia as netSendMedia,
  sendContactRequest,
  sendText as netSendText,
  setProfile as netSetProfile,
  unsendMessage as netUnsendMessage,
  messagesBackendConfigured,
  type NetGroup,
  type NetRequest,
  type NetProfile,
  type NetStatus,
} from "./vertexnet";

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const SITE_LOGO = `${base}${new Date().getMonth() === 9 ? "vertex-hub-logo-halloween.png" : "vertex-hub-logo.png"}`;

const PROF_KEY = "vertex-msgs-profile-v2";
const DMS_KEY = "vertex-msgs-dms-v3";
const SEEN_KEY = "vertex-msgs-seen-v3";
const REG_KEY = "vertex-msgs-usernames-v1";
const CUSTOMS_KEY = "vertex-msgs-customs-v1";
const ACTIVE_KEY = "vertex-msgs-active-v1";

type Status = "online" | "idle" | "offline";
type AvSource = { kind: "preset"; id: number } | { kind: "custom"; data: string };

interface Profile {
  username: string;
  name: string;
  avatar: AvSource;
  status: Status;
}

interface MediaItem {
  kind: "image" | "video";
  url: string;
  name: string;
}

interface Msg {
  id: string;
  from: string;
  text: string;
  at: number;
  media?: MediaItem;
  pending?: boolean;
  failed?: boolean;
  edited?: boolean;
  deleted?: boolean;
  seen?: boolean;
  seenAt?: number;
  readByMe?: boolean;
}

interface RosterUser {
  username: string;
  name: string;
  preset: number;
  system?: boolean;
  verified?: boolean;
  live?: boolean;
  status?: Status;
  avatar?: AvSource;
  group?: boolean;
  members?: string[];
}

interface CallState {
  peer: string;
  kind: "voice" | "video";
  stage: "connecting" | "active";
  incoming: boolean;
  startedAt: number;
  muted: boolean;
  camOff: boolean;
}

const PRESETS: { a: string; b: string; glyph: string }[] = [
  { a: "#ff9a9e", b: "#fad0c4", glyph: "🌸" },
  { a: "#a18cd1", b: "#fbc2eb", glyph: "🐸" },
  { a: "#84fab0", b: "#8fd3f4", glyph: "🚀" },
  { a: "#f6d365", b: "#fda085", glyph: "🍊" },
  { a: "#a1c4fd", b: "#c2e9fb", glyph: "🌊" },
  { a: "#fbc2eb", b: "#fed6e3", glyph: "💖" },
  { a: "#43cea2", b: "#185a9d", glyph: "🍕" },
  { a: "#ffecd2", b: "#fcb69f", glyph: "🌙" },
  { a: "#fddb92", b: "#d1fdff", glyph: "✨" },
  { a: "#cfd9df", b: "#e2ebf0", glyph: "🐻" },
  { a: "#f093fb", b: "#f5576c", glyph: "⚡" },
  { a: "#5ee7df", b: "#b490ca", glyph: "🛸" },
];

const hashPreset = (u: string) => [...u].reduce((s, ch) => (s * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 0) % PRESETS.length;
const nameCap = (u: string) => u.replace(/^[a-z]/, (c) => c.toUpperCase());

const SYSTEM_USER: RosterUser = { username: "Vertex", name: "Vertex", preset: -1, system: true, verified: true };

const toNetProfile = (p: Profile): NetProfile => ({
  username: p.username.toLowerCase(),
  name: p.name,
  status: p.status,
  avatarKind: p.avatar.kind,
  avatarId: p.avatar.kind === "preset" ? p.avatar.id : hashPreset(p.username),
});

const fromNetProfile = (n: NetProfile): RosterUser => ({
  username: n.username,
  name: n.name || nameCap(n.username),
  preset: n.avatarKind === "custom" ? hashPreset(n.username) : n.avatarId,
  live: n.status !== "offline",
  status: n.status,
  ...(n.avatarKind === "custom" && n.avatarData ? { avatar: { kind: "custom" as const, data: n.avatarData } } : {}),
});

const read = <T,>(k: string, d: T): T => {
  try {
    const r = localStorage.getItem(k);
    return r ? (JSON.parse(r) as T) : d;
  } catch {
    return d;
  }
};

const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* noop */
  }
};

const regRead = (): string[] => {
  try {
    const r = localStorage.getItem(REG_KEY);
    const parsed = r ? (JSON.parse(r) as string[]) : [];
    return Array.isArray(parsed) ? parsed.map((x) => x.toLowerCase()) : [];
  } catch {
    return [];
  }
};

const regAdd = (u: string) => {
  try {
    const l = regRead();
    const v = u.trim().toLowerCase();
    if (!v || l.includes(v)) return;
    localStorage.setItem(REG_KEY, JSON.stringify([...l, v]));
  } catch {
    /* noop */
  }
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const t = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const y = new Date(t);
  y.setDate(t.getDate() - 1);
  if (same(d, t)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

function seedDms(now: number): Record<string, Msg[]> {
  return {
    Vertex: [{ id: "sys-welcome", from: "Vertex", text: "Welcome to Messages! Hope you enjoy the app!", at: now }],
  };
}

function initialState() {
  const now = Date.now();
  const profile = read<Profile | null>(PROF_KEY, null);
  if (profile) regAdd(profile.username);
  return {
    profile,
    dms: read<Record<string, Msg[]>>(DMS_KEY, seedDms(now)),
    seen: read<Record<string, number>>(SEEN_KEY, {}),
    active: read<string | null>(ACTIVE_KEY, null),
  };
}

function VerifiedBadge({ size = 15 }: { size?: number }) {
  return (
    <span className="msgs-verified" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" fill="none" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)}>
        <path d="M6.5 12.6l3.4 3.4 7.6-8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function GlyphAvatar({ src, size, username, verified, status, statusSize, className }: {
  src: AvSource;
  size: number;
  username: string;
  verified?: boolean;
  status?: Status;
  statusSize?: number;
  className?: string;
}) {
  const isPreset = src.kind === "preset" && src.id >= 0;
  const preset = isPreset ? PRESETS[src.id] : null;
  return (
    <span className={`msgs-avatar ${className ?? ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}>
      {isPreset ? (
        <span className="msgs-avatar-preset" style={{ background: `linear-gradient(135deg, ${preset!.a}, ${preset!.b})` }}>
          {preset!.glyph}
        </span>
      ) : (
        <img className="msgs-avatar-img" src={src.kind === "custom" ? src.data : SITE_LOGO} alt={username} />
      )}
      {verified && <VerifiedBadge />}
      {status && <span className={`msgs-status-dot msgs-status-${status}`} style={statusSize ? { width: statusSize, height: statusSize } : undefined} />}
    </span>
  );
}

function rosterAvatar(user: { username: string; system?: boolean; preset: number }): AvSource {
  if (user.system) return { kind: "custom", data: SITE_LOGO };
  return { kind: "preset", id: user.preset };
}

const systemUser = (username: string): RosterUser | undefined =>
  username.toLowerCase() === "vertex" ? SYSTEM_USER : undefined;

const isTakenName = (u: string, current?: string | null, live: string[] = []) => {
  const v = u.trim().toLowerCase();
  if (!v) return false;
  if (current && v === current.toLowerCase()) return false;
  if (v === "vertex") return true;
  return live.includes(v) || regRead().includes(v);
};

const MAX_IMAGE_BYTES = 8_000_000;
const MAX_VIDEO_BYTES = 40_000_000;

function processFile(f: File, onErr: (m: string) => void): Promise<{ kind: "image" | "video"; blob: Blob; name: string } | null> {
  return new Promise((resolve) => {
    const isVideo = /^video\//i.test(f.type);
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type) && !/^video\/(mp4|webm|quicktime|mov|x-matroska)$/i.test(f.type)) {
      onErr("Only images or videos are supported.");
      resolve(null);
      return;
    }
    if (isVideo) {
      if (f.size > MAX_VIDEO_BYTES) {
        onErr("That video is too large (max 40 MB).");
        resolve(null);
        return;
      }
      resolve({ kind: "video", blob: f, name: f.name || "clip.mp4" });
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      onErr("That image is too large (max 8 MB).");
      resolve(null);
      return;
    }
    const fr = new FileReader();
    fr.onerror = () => {
      onErr("Couldn't read that file.");
      resolve(null);
    };
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const max = 1600;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        c.width = Math.max(1, Math.round(img.width * sc));
        c.height = Math.max(1, Math.round(img.height * sc));
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? resolve({ kind: "image", blob: b, name: f.name || "photo.jpg" }) : resolve(null)), "image/jpeg", 0.85);
      };
      img.onerror = () => {
        onErr("Couldn't decode that image.");
        resolve(null);
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(f);
  });
}

interface RequestItem {
  username: string;
  at: number;
}

function SetupModal({ onDone, live }: { onDone: (p: Profile) => void; live: string[] }) {
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState<AvSource>({ kind: "preset", id: 7 });
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("online");
  const [usernameErr, setUsernameErr] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const validateUsername = (u: string): string | null => {
    if (!/^[a-zA-Z0-9_]{2,16}$/.test(u)) return "Use 2-16 letters, numbers or underscores.";
    if (isTakenName(u, null, live)) return "That username is already taken.";
    return null;
  };

  const roll = () => {
    const chars = "abcdefghkmnpqrstuvwxyz23456789";
    let u = "";
    let guard = 0;
    do {
      const a = chars[Math.floor(Math.random() * chars.length)];
      const b = chars[Math.floor(Math.random() * chars.length)];
      const n = String(10 + Math.floor(Math.random() * 90));
      u = `${a}${b}${n}`;
      guard += 1;
    } while (isTakenName(u, null, live) && guard < 60);
    setUsername(u);
    setUsernameErr(null);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) {
      setAvatarErr("Only images are supported.");
      return;
    }
    setAvatarErr(null);
    processFile(f, (m) => setAvatarErr(m)).then((media) => {
      if (!media) return;
      const fr = new FileReader();
      fr.onload = () => setAvatar({ kind: "custom", data: fr.result as string });
      fr.readAsDataURL(media.blob);
    });
  };

  const failStep = () => {
    setShake((s) => s + 1);
    setTimeout(() => setShake(0), 450);
  };

  const next = () => {
    if (step === 1) {
      const err = validateUsername(username);
      if (err) {
        setUsernameErr(err);
        failStep();
        return;
      }
    }
    if (step === 2) {
      const p: Profile = { username, name: username, avatar, status };
      regAdd(username);
      write(PROF_KEY, p);
      onDone(p);
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="msgs-modal-overlay">
      <div className={`msgs-setup ${shake ? "msgs-shake" : ""}`}>
        <div className="msgs-setup-dots">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        <div className="msgs-step-anim" key={step}>
          {step === 0 && (
            <>
              <div className="msgs-setup-preview">
                <GlyphAvatar src={avatar} size={54} username={username || "you"} status={status} statusSize={13} />
              </div>
              <h2 className="msgs-setup-h">SETUP PROFILE</h2>
              <h3 className="msgs-setup-sub">Choose your profile picture</h3>
              <div className="msgs-setup-grid">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`msgs-preset ${avatar.kind === "preset" && avatar.id === i ? "sel" : ""}`}
                    style={{ background: `linear-gradient(135deg, ${p.a}, ${p.b})` }}
                    onClick={() => {
                      setAvatar({ kind: "preset", id: i });
                      setAvatarErr(null);
                    }}
                  >
                    <span>{p.glyph}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="msgs-setup-upload" onClick={() => fileRef.current?.click()}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" strokeLinecap="round" />
                </svg>
                Upload photo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={onFile}
              />
              {avatarErr && <p className="msgs-setup-err">{avatarErr}</p>}
            </>
          )}
          {step === 1 && (
            <>
              <div className="msgs-setup-preview">
                <GlyphAvatar src={avatar} size={54} username={username || "you"} status={status} statusSize={13} />
              </div>
              <h2 className="msgs-setup-h">SETUP PROFILE</h2>
              <h3 className="msgs-setup-sub">Pick your username</h3>
              <p className="msgs-setup-tip">Roll a unique one or type your own. Taken names can't be reused.</p>
              <div className={`msgs-setup-user ${usernameErr ? "msgs-setup-user-err" : ""}`}>
                <span className="msgs-at">@</span>
                <input
                  value={username}
                  maxLength={16}
                  autoFocus
                  spellCheck={false}
                  onChange={(e) => {
                    setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""));
                    setUsernameErr(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="username"
                />
                <button type="button" className="msgs-roll" onClick={roll} title="Roll a unique username">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
                    <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Roll
                </button>
              </div>
              {usernameErr ? (
                <p className="msgs-setup-err">{usernameErr}</p>
              ) : (
                username && <p className="msgs-setup-ok">@{username} is available</p>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="msgs-setup-preview">
                <GlyphAvatar src={avatar} size={54} username={username} status={status} statusSize={13} />
              </div>
              <h2 className="msgs-setup-h">SETUP PROFILE</h2>
              <h3 className="msgs-setup-sub">How do you want to appear?</h3>
              <div className="msgs-setup-statuses">
                {(
                  [
                    ["online", "#34c759"],
                    ["idle", "#ffcc00"],
                    ["offline", "#8e8e93"],
                  ] as [Status, string][]
                ).map(([s, color]) => (
                  <button
                    key={s}
                    type="button"
                    className={`msgs-setup-status ${status === s ? "sel" : ""}`}
                    onClick={() => setStatus(s)}
                  >
                    <span className="msgs-status-dot-glow" style={{ background: color }} />
                    <span style={{ textTransform: "capitalize" }}>{s}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="msgs-setup-actions">
          {step > 0 ? (
            <button type="button" className="msgs-setup-back" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="msgs-setup-next" onClick={next}>
            {step === 2 ? "Start chatting" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewChatModal({ people, me, onPick, onCreate, onClose }: {
  people: RosterUser[];
  me: string;
  onPick: (username: string) => void;
  onCreate?: (username: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const candidates = people
    .filter((r) => r.username.toLowerCase() !== me)
    .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.username.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const notFound = needle !== "" && candidates.length === 0;
  return (
    <div className="msgs-modal-overlay" onClick={onClose}>
      <div className="msgs-newchat" onClick={(e) => e.stopPropagation()}>
        <div className="msgs-newchat-head">
          <h3>New message</h3>
          <button type="button" className="msgs-close-x" onClick={onClose}>✕</button>
        </div>
        <div className="msgs-search msgs-search-wide">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Messages users"
          />
        </div>
        <div className="msgs-newchat-list">
          {candidates.map((r) => (
            <button
              key={r.username}
              type="button"
              className="msgs-newchat-row"
              onClick={() => onPick(r.username)}
            >
              <GlyphAvatar src={r.avatar ?? { kind: "preset", id: r.preset }} size={42} username={r.username} status={r.status ?? "offline"} />
              <span className="msgs-newchat-meta">
                <span className="msgs-newchat-name">{r.name}</span>
                <span className="msgs-newchat-user">@{r.username}</span>
              </span>
            </button>
          ))}
          {notFound && onCreate ? (
            <button type="button" className="msgs-newchat-row msgs-newchat-create" onClick={() => onCreate(needle)}>
              <span className="msgs-newchat-meta">
                <span className="msgs-newchat-name">Message</span>
                <span className="msgs-newchat-user">@{needle}</span>
              </span>
            </button>
          ) : notFound ? (
            <p className="msgs-newchat-empty">No Messages users match @{needle}.</p>
          ) : (
            candidates.length === 0 && <p className="msgs-newchat-empty">No other Messages users yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateGroupModal({ people, onCreate, onClose }: {
  people: RosterUser[];
  onCreate: (title: string, usernames: string[]) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div className="msgs-modal-overlay" onClick={onClose}>
      <div className="msgs-newchat msgs-group-modal" onClick={(e) => e.stopPropagation()}>
        <div className="msgs-newchat-head">
          <h3>New group chat</h3>
          <button type="button" className="msgs-close-x" onClick={onClose}>✕</button>
        </div>
        <input className="msgs-input msgs-group-title" autoFocus maxLength={64} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group name" />
        <div className="msgs-newchat-list">
          {people.map((person) => {
            const checked = selected.includes(person.username);
            return (
              <button key={person.username} type="button" className="msgs-newchat-row" onClick={() => setSelected((xs) => checked ? xs.filter((x) => x !== person.username) : [...xs, person.username])}>
                <GlyphAvatar src={person.avatar ?? { kind: "preset", id: person.preset }} size={40} username={person.username} />
                <span className="msgs-newchat-meta"><span className="msgs-newchat-name">{person.name}</span><span className="msgs-newchat-user">@{person.username}</span></span>
                <span className={`msgs-group-check ${checked ? "on" : ""}`}>{checked ? "✓" : ""}</span>
              </button>
            );
          })}
          {people.length === 0 && <p className="msgs-newchat-empty">Add and accept at least one contact first.</p>}
        </div>
        <div className="msgs-group-footer">
          <span>{selected.length} selected</span>
          <button type="button" className="msgs-add-btn" disabled={!title.trim() || selected.length === 0} onClick={() => onCreate(title, selected)}>Create group</button>
        </div>
      </div>
    </div>
  );
}

// A camera track only counts as "live" when it came from a real device. The
// canvas placeholder track that getLocalStream() adds when the camera is blocked
// has no deviceId, so it must never be rendered as if it were a person.
const hasLiveCamera = (stream: MediaStream | null | undefined): boolean =>
  !!stream && stream.getVideoTracks().some((t) => t.readyState === "live" && Boolean(t.getSettings().deviceId));

// A track that arrived from the peer is judged on the receiver's own state: a
// remote track reports no deviceId, so asking for one would hide their video.
const hasRemoteVideo = (stream: MediaStream | null | undefined): boolean =>
  !!stream && stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);

// Autoplay can be refused before the first user gesture, which leaves the video
// black even though srcObject is set, so every play is retried on interaction.
const safePlay = (el: HTMLVideoElement | null) => {
  if (!el || !el.srcObject || !el.paused) return;
  el.play().catch(() => { /* retried by the gesture listener below */ });
};

function CallOverlay({ call, onEnd, onActive, resolve }: {
  call: CallState;
  onEnd: () => void;
  onActive: () => void;
  resolve: (u: string) => RosterUser;
}) {
  const [tick, setTick] = useState(0);
  const [muted, setMuted] = useState(call.muted);
  const [camOff, setCamOff] = useState(call.camOff);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [screenErr, setScreenErr] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [waitErr, setWaitErr] = useState<string | null>(null);
  const [remoteSlow, setRemoteSlow] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [mediaRev, setMediaRev] = useState(0);
  const [accepted, setAccepted] = useState(!call.incoming);
  const localRef = useRef<MediaStream | null>(null);
  const pendingAcquire = useRef<Promise<MediaStream | null> | null>(null);
  const localVid = useRef<HTMLVideoElement | null>(null);
  const localVidStage = useRef<HTMLVideoElement | null>(null);
  const remoteVid = useRef<HTMLVideoElement | null>(null);
  const remoteAud = useRef<HTMLAudioElement | null>(null);
  const dialed = useRef(false);
  const alive = useRef(true);
  const wired = useRef<WeakSet<object>>(new WeakSet());
  const originalVideo = useRef<MediaStreamTrack | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number; ox: number; oy: number } | null>(null);
  const pipSizeRef = useRef(96);
  const [pipAt, setPipAt] = useState<{ x: number; y: number } | null>(null);
  const [me] = useState<Profile | null>(() => read<Profile | null>(PROF_KEY, null));

  const user = resolve(call.peer);
  const live = call.stage === "active";
  const ringing = call.incoming && !accepted;
  // Tracks can be added or unmuted long after the stream event fires, so the
  // camera flags are re-read on every bump of `mediaRev` instead of once.
  const remoteLive = live && hasRemoteVideo(remote);
  const selfLive = !!screen || (hasLiveCamera(local) && !camOff);
  const selfName = me?.name || me?.username || "You";
  const selfAvatar = me?.avatar ?? rosterAvatar({ username: selfName, preset: hashPreset(selfName) });
  const peerAvatar = rosterAvatar({ username: user.username, system: !!user.system, preset: user.preset });
  // Ringing video calls mirror WhatsApp: you check your own framing full screen
  // while the caller sits in the corner, then the roles swap once you answer.
  const bigIsSelf = ringing && call.kind === "video";
  const selfStream = screen ?? local;

  const bumpMedia = useCallback(() => setMediaRev((n) => n + 1), []);

  // Any track that arrives, mutes or ends after the call started has to trigger
  // a repaint, otherwise a camera that switches on late shows an empty tile.
  const watchStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.addEventListener("addtrack", bumpMedia);
    stream.addEventListener("removetrack", bumpMedia);
    for (const track of stream.getTracks()) {
      track.addEventListener("unmute", bumpMedia);
      track.addEventListener("mute", bumpMedia);
      track.addEventListener("ended", bumpMedia);
    }
  }, [bumpMedia]);

  const bindVideo = useCallback((el: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) safePlay(el);
  }, []);

  const setLocalVideo = useCallback((el: HTMLVideoElement | null) => {
    localVid.current = el;
    bindVideo(el, selfStream);
  }, [bindVideo, selfStream]);

  const setLocalVideoStage = useCallback((el: HTMLVideoElement | null) => {
    localVidStage.current = el;
    bindVideo(el, selfStream);
  }, [bindVideo, selfStream]);

  const setRemoteVideo = useCallback((el: HTMLVideoElement | null) => {
    remoteVid.current = el;
    bindVideo(el, remote);
  }, [bindVideo, remote]);


  useEffect(() => {
    if (!live && !ringing) return;
    const t = setInterval(() => {
      setTick((x) => x + 1);
      // PeerJS keeps the stream it received on the connection, so this catches a
      // stream that arrived while nobody was listening for the event yet.
      const conn = getMediaConn(call.peer);
      const received = conn?.remoteStream;
      if (received && received.getTracks().length) {
        setRemote((prev) => (prev === received ? prev : received));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [live, ringing, call.peer]);

  useEffect(() => {
    // Only the caller waits for an answer; an incoming ring never times out here.
    if (call.stage === "active" || waitErr || call.incoming) return;
    const t = setTimeout(() => setWaitErr("No answer yet. Check that they are online and try again."), 35_000);
    return () => clearTimeout(t);
  }, [call.stage, waitErr, call.incoming]);

  useEffect(() => {
    if (call.kind !== "video" || !live || remoteLive) {
      setRemoteSlow(false);
      return;
    }
    const t = setTimeout(() => setRemoteSlow(true), 8_000);
    return () => clearTimeout(t);
  }, [call.kind, live, remoteLive, mediaRev]);

  const dur = live ? Math.max(0, Math.floor((Date.now() - call.startedAt) / 1000)) : 0;
  const durStr = `${String(Math.floor(dur / 60)).padStart(2, "0")}:${String(dur % 60).padStart(2, "0")}`;

  const acquire = useCallback(async (): Promise<MediaStream | null> => {
    if (localRef.current) return localRef.current;
    // Answering while the permission prompt is still open used to fire a second
    // getUserMedia, which left two cameras running and the preview on the wrong
    // one. Everyone shares the same request instead.
    if (pendingAcquire.current) return pendingAcquire.current;
    const request = (async () => {
      try {
        const s = await getLocalStream(call.kind);
        if (!alive.current) {
          s.getTracks().forEach((t) => t.stop());
          return null;
        }
        localRef.current = s;
        setLocal(s);
        setCamOff(!hasLiveCamera(s));
        setDenied(false);
        watchStream(s);
        return s;
      } catch {
        setDenied(true);
        return null;
      } finally {
        pendingAcquire.current = null;
      }
    })();
    pendingAcquire.current = request;
    return request;
  }, [call.kind, watchStream]);

  // Both sides of the call need the same handlers, and the answering side needs
  // them before the answer is sent, otherwise the first media event is missed.
  const wire = useCallback((conn: ReturnType<typeof getMediaConn>) => {
    if (!conn || wired.current.has(conn)) return;
    wired.current.add(conn);
    conn.on("stream", (st: MediaStream) => {
      watchStream(st);
      setRemote(st);
      onActive();
    });
    const pc = conn.peerConnection;
    pc?.addEventListener("track", (ev) => {
      const stream = ev.streams[0];
      if (stream) {
        watchStream(stream);
        setRemote(stream);
      } else {
        setRemote((prev) => {
          const next = prev ?? new MediaStream();
          if (!next.getTracks().includes(ev.track)) next.addTrack(ev.track);
          return next;
        });
      }
      bumpMedia();
      onActive();
    });
  }, [bumpMedia, onActive, watchStream]);

  useEffect(() => {
    if (call.incoming || dialed.current) return;
    dialed.current = true;
    void (async () => {
      const s = await acquire();
      if (!s) return;
      try {
        const conn = await placeCall(call.peer, call.kind, s);
        wire(conn);
      } catch {
        setWaitErr(`@${user.name} didn't pick up.`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.incoming, call.peer, call.kind]);

  // Ring with your own camera already up so the person being called can check
  // their framing before they pick up, the way WhatsApp does.
  useEffect(() => {
    if (call.kind !== "video" || accepted || localRef.current) return;
    void acquire();
  }, [call.kind, accepted, acquire, denied]);

  useEffect(() => {
    if (!call.incoming) return;
    wire(getMediaConn(call.peer));
  }, [call.incoming, call.peer, wire]);

  useEffect(() => {
    if (remote && remoteAud.current) remoteAud.current.srcObject = remote;
  }, [remote, accepted]);

  useEffect(() => {
    const retry = () => {
      for (const el of [remoteVid.current, localVid.current, localVidStage.current]) safePlay(el);
    };
    window.addEventListener("pointerdown", retry, true);
    window.addEventListener("keydown", retry, true);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("pointerdown", retry, true);
      window.removeEventListener("keydown", retry, true);
      document.removeEventListener("visibilitychange", retry);
    };
  }, []);

  useEffect(() => {
    localRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [muted, local]);

  useEffect(() => {
    localRef.current?.getVideoTracks().forEach((t) => {
      // Canvas placeholder tracks keep the video sender negotiated for screen share.
      t.enabled = !t.getSettings().deviceId || !camOff;
    });
  }, [camOff, local]);

  const stopScreenShare = useCallback(async () => {
    const conn = getMediaConn(call.peer);
    const replacement = originalVideo.current;
    const sender = conn?.peerConnection?.getSenders().find((item) => item.track?.kind === "video");
    try { if (sender && replacement) await sender.replaceTrack(replacement); } catch { /* the call may have ended */ }
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    originalVideo.current = null;
    setScreen(null);
    setScreenErr(null);
    if (localRef.current) setLocal(localRef.current);
  }, [call.peer]);

  const startScreenShare = async () => {
    setScreenErr(null);
    try {
      const conn = getMediaConn(call.peer);
      const sender = conn?.peerConnection?.getSenders().find((item) => item.track?.kind === "video");
      if (!sender) throw new Error("Screen sharing is available in video calls. Start a video call first.");
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) throw new Error("No screen was selected.");
      originalVideo.current = sender.track;
      await sender.replaceTrack(track);
      screenRef.current = display;
      setScreen(display);
      setLocal(new MediaStream([...(localRef.current?.getAudioTracks() ?? []), track]));
      track.onended = () => { void stopScreenShare(); };
    } catch (error) {
      setScreenErr(error instanceof Error ? error.message : "Could not share your screen.");
    }
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      screenRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      endCall(call.peer);
    };
  }, [call.peer]);

  const accept = async () => {
    const s = await acquire();
    if (!s) return;
    const conn = answerCall(call.peer, s);
    if (!conn) {
      setWaitErr("That call already ended.");
      return;
    }
    wire(conn);
    setAccepted(true);
  };

  // A blocked camera used to leave the caller stuck on an avatar for the whole
  // call. The new track replaces the placeholder on the live connection, which
  // needs no renegotiation, so both sides see each other right away.
  const startCamera = async () => {
    setCamErr(null);
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      const track = cam.getVideoTracks()[0];
      if (!track) throw new Error("No camera was found on this device.");
      const base = localRef.current ?? new MediaStream();
      if (!base.getAudioTracks().length) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          mic.getAudioTracks().forEach((t) => base.addTrack(t));
        } catch { /* carry on with video only */ }
      }
      const next = new MediaStream([...base.getAudioTracks(), track]);
      for (const old of base.getVideoTracks()) if (old !== track) old.stop();
      localRef.current = next;
      setLocal(next);
      setCamOff(false);
      setDenied(false);
      watchStream(next);
      const conn = getMediaConn(call.peer);
      const sender = conn?.peerConnection?.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      else conn?.peerConnection?.addTrack(track, next);
      safePlay(localVid.current);
      safePlay(localVidStage.current);
    } catch (error) {
      setCamErr(error instanceof Error ? error.message : "Could not start the camera.");
    }
  };

  const hangUp = () => {
    endCall(call.peer);
    onEnd();
  };

  // WhatsApp-style draggable self view. The pip is 96px in CSS; JS only needs it
  // to clamp the drag inside the stage.
  const placePip = (px: number, py: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const size = pipSizeRef.current;
    const maxX = Math.max(8, stage.clientWidth - size - 8);
    const maxY = Math.max(8, stage.clientHeight - size - 8);
    setPipAt({ x: Math.min(Math.max(px, 8), maxX), y: Math.min(Math.max(py, 8), maxY) });
  };

  const onPipDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const box = event.currentTarget.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    pipSizeRef.current = box.width || 96;
    setPipAt(pipAt ?? { x: Math.max(8, stage.clientWidth - box.width - 12), y: 12 });
    dragRef.current = {
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      ox: stageBox.left,
      oy: stageBox.top,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    event.preventDefault();
  };

  const onPipMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    placePip(event.clientX - drag.ox - drag.dx, event.clientY - drag.oy - drag.dy);
  };

  const onPipUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* nothing captured */ }
  };

  const statusText = waitErr ?? (ringing ? `Incoming ${call.kind} call` : live ? durStr : "Calling…");

  // A person who is not sending video gets a labelled tile instead of a bare
  // avatar, so a camera that is off never looks like a broken call.
  const peerNote = ringing
    ? "Incoming video call"
    : remoteSlow
      ? "Their camera is still connecting…"
      : live
        ? "Camera is off"
        : "Calling…";
  const peerTile = (
    <div className={`msgs-video-tile${remoteLive ? " off" : ""}`}>
      <GlyphAvatar src={peerAvatar} size={live ? 72 : 96} username={user.username} verified={!!user.verified} />
      <span className="msgs-video-tile-name">{user.name}</span>
      <span className="msgs-video-tile-note">{peerNote}</span>
    </div>
  );

  const stageError = waitErr ? (
    <div className="msgs-cam-err">
      <span>{waitErr}</span>
      <button type="button" onClick={hangUp}>Close</button>
    </div>
  ) : null;

  const endIcon = (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M12 9c-2.7 0-5.2.9-7.3 2.4-.6.4-.7 1.2-.2 1.8l1.4 1.6c.4.5 1 .7 1.6.5l2-.6c.6-.2 1-.8 1-1.4v-2c1-.2 2-.3 3-.3s2 .1 3 .3v2c0 .6.4 1.2 1 1.4l2 .6c.6.2 1.2 0 1.6-.5l1.4-1.6c.5-.6.4-1.4-.2-1.8A12.5 12.5 0 0 0 12 9z" />
    </svg>
  );

  const micBtn = (
    <button type="button" className={`msgs-call-btn ${muted ? "off" : ""}`} onClick={() => setMuted((v) => !v)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M12 16a5 5 0 0 0 5-5V7a5 5 0 0 0-10 0v4a5 5 0 0 0 5 5z" strokeLinejoin="round" />
        {muted && <path d="M4 4l16 16" strokeLinecap="round" />}
        <path d="M19 11a7 7 0 0 1-7 7v0a0 0 1 0-1-2.29M5 11a7 7 0 0 0 .6 2.85" strokeLinecap="round" />
      </svg>
    </button>
  );

  const camBtn = (
    <button type="button" className={`msgs-call-btn ${camOff ? "off" : ""}`} onClick={() => setCamOff((v) => !v)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9">
        <rect x="3" y="6" width="13" height="12" rx="2.5" />
        <path d="M16 10l5-3v10l-5-3" strokeLinejoin="round" />
        {camOff && <path d="M4 4l16 16" strokeLinecap="round" />}
      </svg>
    </button>
  );

  const ringControls = (
    <div className="msgs-call-controls">
      <button type="button" className="msgs-call-btn end" onClick={hangUp}>{endIcon}</button>
      <button type="button" className="msgs-call-btn accept" onClick={() => void accept()}>{endIcon}</button>
    </div>
  );

  const liveControls = (
    <div className="msgs-call-controls">
      {micBtn}
      {call.kind === "video" && camBtn}
      {call.kind === "video" && (
        <button type="button" className={`msgs-call-btn ${screen ? "off" : ""}`} title={screen ? "Stop sharing" : "Share screen"} onClick={() => screen ? void stopScreenShare() : void startScreenShare()}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4m-3-9 3-3 3 3m-3-3v7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}
      <button type="button" className="msgs-call-btn end" onClick={hangUp}>{endIcon}</button>
    </div>
  );

  const camGlyph = (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="M16 10l5-3v10l-5-3" strokeLinejoin="round" />
    </svg>
  );

  // Why the self view is not a live picture, plus the one button that fixes it.
  const selfFallback = selfLive ? null : denied ? (
    <button type="button" className="msgs-cam-start" onClick={() => void acquire()} title="Camera or mic is blocked. Allow access for this site in your browser, then retry.">
      {camGlyph}
      <span>Retry</span>
    </button>
  ) : camErr ? (
    <button type="button" className="msgs-cam-start" onClick={() => void startCamera()} title={camErr}>
      {camGlyph}
      <span>Retry</span>
    </button>
  ) : !local ? (
    <>
      <GlyphAvatar src={selfAvatar} size={40} username={selfName} />
      <span className="msgs-pip-wait">Starting your camera…</span>
    </>
  ) : (
    <button type="button" className="msgs-cam-start" onClick={() => void startCamera()} title="Turn your camera on">
      {camGlyph}
      <span>Start</span>
    </button>
  );

  const selfPip = (
    <div
      className={`msgs-call-pip self${selfLive ? " live" : " idle"}`}
      style={pipAt ? { left: pipAt.x, top: pipAt.y, right: "auto" } : undefined}
      onPointerDown={onPipDown}
      onPointerMove={onPipMove}
      onPointerUp={onPipUp}
      onPointerCancel={onPipUp}
      title="Drag to move your camera"
    >
      <video ref={setLocalVideo} className={`msgs-pip-video${selfLive ? " on" : ""}`} autoPlay playsInline muted draggable={false} />
      <div className={`msgs-pip-fallback${selfLive ? " off" : ""}`}>{selfFallback}</div>
      <span className="msgs-pip-tag">{screen ? "Your screen" : "You"}</span>
    </div>
  );

  const peerPip = (
    <div className={`msgs-call-pip peer${bigIsSelf ? " on" : ""}`}>
      <GlyphAvatar src={peerAvatar} size={38} username={user.username} verified={!!user.verified} />
      <span className="msgs-pip-tag">{user.name}</span>
    </div>
  );

  // Incoming call before it is answered: show an Apple-style notification at the
  // top of the screen and keep the real accept()/hangUp() signalling intact.
  if (ringing) {
    return createPortal(
      <div className="msgs-banner msgs-banner--call">
        <GlyphAvatar src={peerAvatar} size={44} username={user.username} verified={!!user.verified} />
        <div className="msgs-banner-body">
          <span className="msgs-banner-name">{user.name}</span>
          <span className="msgs-banner-sub">{call.kind === "video" ? "Incoming video call…" : "Incoming call…"}</span>
        </div>
        <div className="msgs-banner-actions">
          <button type="button" className="msgs-banner-btn msgs-banner-btn--decline" title="Decline" onClick={hangUp}>✕</button>
          <button type="button" className="msgs-banner-btn msgs-banner-btn--accept" title="Answer" onClick={() => void accept()}>{call.kind === "video" ? "🎥" : "📞"}</button>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className="msgs-call-overlay">
      <div className={`msgs-call-card ${call.kind === "video" ? "video" : ""}`}>
        <audio ref={remoteAud} autoPlay />
        {call.kind === "video" ? (
          <>
            <div ref={stageRef} className={`msgs-call-stage ${remoteLive && !bigIsSelf ? "has-cam" : "no-cam"}`}>
              <video
                ref={setRemoteVideo}
                className={`msgs-cam-video${remoteLive && !bigIsSelf ? " on" : ""}`}
                autoPlay
                playsInline
                draggable={false}
              />
              <video
                ref={setLocalVideoStage}
                className={`msgs-cam-video self${bigIsSelf && selfLive ? " on" : ""}`}
                autoPlay
                playsInline
                muted
                draggable={false}
              />
              {bigIsSelf ? peerPip : <>{peerTile}{selfPip}</>}
              {stageError}
            </div>
            <div className="msgs-call-meta">
              <span className="msgs-call-name">{user.name}</span>
              <span className="msgs-call-state">{screen ? "Sharing your screen" : camOff ? `${statusText} · your camera is off` : statusText}</span>
              {camErr && <span className="msgs-call-screen-error">{camErr}</span>}
              {screenErr && <span className="msgs-call-screen-error">{screenErr}</span>}
            </div>
            {ringing ? ringControls : liveControls}
          </>
        ) : (
          <>
            <div className="msgs-call-avatar-wrap">
              <GlyphAvatar src={peerAvatar} size={120} username={user.username} verified={!!user.verified} />
              <span className="msgs-call-ring" />
              <span className="msgs-call-ring r2" />
            </div>
            <div className="msgs-call-meta">
              <span className="msgs-call-name">{user.name}</span>
              <span className="msgs-call-state">{statusText}</span>
            </div>
            {ringing ? ringControls : liveControls}
          </>
        )}
      </div>
    </div>
  );
}

export function MessagesSurface() {
  const [state] = useState(initialState);
  const [profile, setProfile] = useState<Profile | null>(state.profile);
  const [dms, setDms] = useState<Record<string, Msg[]>>(state.dms);
  const [seen, setSeen] = useState<Record<string, number>>(state.seen);
  const [active, setActive] = useState<string | null>(() => state.active && (state.dms[state.active] || state.active.startsWith("group:")) ? state.active : (state.dms.Vertex ? "Vertex" : null));
  const [tab, setTab] = useState<"chats" | "people">("chats");
  const [query, setQuery] = useState("");
  const [statusMenu, setStatusMenu] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [call, setCall] = useState<CallState | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [customs, setCustoms] = useState<Record<string, RosterUser>>(() => read<Record<string, RosterUser>>(CUSTOMS_KEY, {}));
  const [people, setPeople] = useState<RosterUser[]>([]);
  const [contacts, setContacts] = useState<string[]>([]);
  const [requests, setRequests] = useState<NetRequest[]>([]);
  const [groups, setGroups] = useState<NetGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [net, setNet] = useState<NetStatus>("offline");
  const [netNote, setNetNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ user: string; kind: "voice" | "video" | "text"; text: string } | null>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const readPending = useRef(new Set<string>());
  const lastWakeRef = useRef(0);
  const activeRef = useRef<string | null>(active);
  activeRef.current = active;
  const noticeTimer = useRef(0);

  const getUser = useCallback(
    (u: string): RosterUser | undefined => {
      const v = u.toLowerCase();
      if (v.startsWith("group:")) {
        const group = groups.find((item) => groupKey(item.id) === v);
        return group ? { username: v, name: group.title, preset: hashPreset(v), group: true, members: group.members } : { username: v, name: "Group chat", preset: hashPreset(v), group: true };
      }
      return systemUser(v) ?? people.find((p) => p.username === v) ?? customs[v];
    },
    [people, customs, groups],
  );

  const saveCustom = (contact: RosterUser) => {
    setCustoms((c) => {
      const nx = { ...c, [contact.username]: contact };
      write(CUSTOMS_KEY, nx);
      return nx;
    });
  };

  useEffect(() => {
    if (dms.Vertex && dms.Vertex[0]) {
      const last = dms.Vertex[dms.Vertex.length - 1];
      const t = new Date(last.at);
      const today = new Date();
      if (t.getFullYear() !== today.getFullYear() || t.getMonth() !== today.getMonth() || t.getDate() !== today.getDate()) {
        const w: Msg = { id: `sys-w-${uid()}`, from: "Vertex", text: "Welcome to Messages! Hope you enjoy the app!", at: Date.now() };
        setDms((d) => ({ ...d, Vertex: [w] }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active && dms.Vertex) setActive("Vertex");
    else if (active && !active.startsWith("group:") && !dms[active] && dms.Vertex) setActive("Vertex");
  }, [active, dms]);

  useEffect(() => { write(ACTIVE_KEY, active); }, [active]);

  useEffect(() => {
    if (!profile) return;
    setNet(messagesBackendConfigured ? "connecting" : "offline");
    setNetNote(messagesBackendConfigured ? null : "Messages needs a free Supabase project. Follow MESSAGES_SETUP.md to connect it.");
    connect(profile.username);
    return () => disconnect();
  }, [profile?.username]);

  // Any blip (tab in the background, wifi sleep, a dropped call) used to latch the app
  // into a permanent "offline" that only a refresh could clear. Wake and heal instead.
  useEffect(() => {
    const wake = () => {
      if (net === "online" && callsReady()) return;
      if (Date.now() - lastWakeRef.current < 10000) return;
      lastWakeRef.current = Date.now();
      reconnectNow();
    };
    const onVisible = () => { if (document.visibilityState === "visible") wake(); };
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [net]);

  useEffect(() => {
    if (!profile) void prepareMessagesDirectory();
  }, [profile]);

  useEffect(() => {
    if (profile) netSetProfile(toNetProfile(profile));
  }, [profile]);

  useEffect(() => {
    write(DMS_KEY, dms);
  }, [dms]);
  useEffect(() => {
    write(SEEN_KEY, seen);
  }, [seen]);
  useEffect(() => {
    write(CUSTOMS_KEY, customs);
  }, [customs]);
  useEffect(() => {
    if (profile) write(PROF_KEY, profile);
  }, [profile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [active, dms]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const openChat = (u: string) => {
    setActive(u);
    setSeen((s) => ({ ...s, [u]: Date.now() }));
  };

  const pushMsg = (u: string, msg: Msg) => {
    setDms((d) => {
      const thread = d[u] ?? [];
      const existing = thread.findIndex((m) => m.id === msg.id);
      const next = existing >= 0
        ? thread.map((m, i) => (i === existing ? { ...m, ...msg, pending: false, failed: false } : m))
        : [...thread, msg];
      next.sort((a, b) => a.at - b.at);
      return { ...d, [u]: next };
    });
  };

  const patchMsg = (u: string, id: string, patch: Partial<Msg>) => {
    setDms((d) => ({ ...d, [u]: (d[u] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  };

  useEffect(() => {
    if (!active) return;
    const unread = (dms[active] ?? []).filter((m) => m.from !== "me" && !m.readByMe && !readPending.current.has(m.id));
    if (!unread.length) return;
    const ids = unread.map((m) => m.id);
    ids.forEach((id) => readPending.current.add(id));
    void markMessagesRead(ids).then(() => {
      setDms((current) => ({ ...current, [active]: (current[active] ?? []).map((m) => ids.includes(m.id) ? { ...m, readByMe: true } : m) }));
    }).catch(() => { /* a transient network failure can retry when the chat changes */ }).finally(() => ids.forEach((id) => readPending.current.delete(id)));
  }, [active, dms]);

  useEffect(() =>
    onNet((e) => {
      switch (e.t) {
        case "status":
          setNet(e.status);
          setNetNote(e.detail ?? null);
          break;
        case "presence":
          setPeople((current) => {
            const statusByUser = new Map(e.users.map((u) => [u.username, u.status]));
            return current.map((u) => ({ ...u, status: statusByUser.get(u.username) ?? "offline", live: statusByUser.get(u.username) !== undefined && statusByUser.get(u.username) !== "offline" }));
          });
          break;
        case "directory":
          setPeople(
            e.users
              .filter((u) => u.username !== profile?.username.toLowerCase())
              .map(fromNetProfile)
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
          break;
        case "message":
          pushMsg(e.message.peer, {
            id: e.message.id,
            from: e.message.from,
            text: e.message.text,
            at: e.message.at,
            edited: e.message.edited,
            deleted: e.message.deleted,
            seen: e.message.seen,
            seenAt: e.message.seenAt,
            readByMe: e.message.readByMe,
            ...(e.message.media ? { media: e.message.media } : {}),
          });
          if (e.message.from !== "me" && e.message.peer !== activeRef.current) {
            setNotice({ user: e.message.peer, kind: "text", text: e.message.text || "Sent an attachment" });
          }
          break;
        case "message-removed":
          setDms((current) => Object.fromEntries(Object.entries(current).map(([key, thread]) => [key, thread.filter((m) => m.id !== e.id)])));
          break;
        case "message-seen":
          setDms((current) => Object.fromEntries(Object.entries(current).map(([key, thread]) => [key, thread.map((m) => m.id === e.id ? { ...m, seen: true, seenAt: e.at } : m)])));
          break;
        case "connections":
          setContacts(e.contacts);
          setRequests(e.requests.filter((request) => request.kind === "group" || !e.contacts.includes(request.username)));
          setGroups(e.groups);
          setDms((current) => {
            const next = { ...current };
            for (const group of e.groups) next[groupKey(group.id)] ??= [];
            return next;
          });
          break;
        case "incoming-call":
          setCall((c) => c ?? { peer: e.from, kind: e.kind, stage: "connecting", incoming: true, startedAt: Date.now(), muted: false, camOff: false });
          break;
        case "call-ended":
          setCall((c) => (c && c.peer === e.from ? null : c));
          break;
        default:
          break;
      }
    }),
    [profile?.username],
  );

  useEffect(() => {
    if (!notice || notice.kind !== "text") return;
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(noticeTimer.current);
  }, [notice]);

  const send = () => {
    const text = draft.trim();
    if (!active || active === "Vertex" || !text) return;
    const id = uid();
    pushMsg(active, { id, from: "me", text, at: Date.now(), pending: true });
    setDraft("");
    const who = active;
    void netSendText(who, id, text)
      .then(() => patchMsg(who, id, { pending: false }))
      .catch((error: unknown) => {
        patchMsg(who, id, { pending: false, failed: true });
        flash(error instanceof Error ? error.message : `Couldn't send that to @${who}.`);
      });
  };

  const sendMedia = async (f: File) => {
    const media = await processFile(f, (m) => flash(m));
    if (!media || !active || active === "Vertex") return;
    const id = uid();
    const who = active;
    pushMsg(who, { id, from: "me", text: draft.trim(), at: Date.now(), pending: true, media: { kind: media.kind, url: URL.createObjectURL(media.blob), name: media.name } });
    setDraft("");
    void netSendMedia(who, id, media.blob, media.kind, media.name, draft.trim())
      .then(() => patchMsg(who, id, { pending: false }))
      .catch((error: unknown) => {
        patchMsg(who, id, { pending: false, failed: true });
        flash(error instanceof Error ? error.message : `Couldn't send that to @${who}.`);
      });
  };

  const onAttach = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void sendMedia(f);
    e.target.value = "";
  };

  const startCall = (peer: string, kind: "voice" | "video") => {
    if (active === "Vertex") return;
    if (!callsReady()) {
      reconnectNow();
      flash("Calls are reconnecting — try again in a moment.");
      return;
    }
    if (!isOnline(peer)) {
      reconnectNow();
      flash(`@${peer} isn't online right now.`);
      return;
    }
    setCall({ peer, kind, stage: "connecting", incoming: false, startedAt: Date.now(), muted: false, camOff: false });
  };

  const startChat = (u: string) => {
    const v = u.trim().toLowerCase();
    setNewChat(false);
    if (v === "vertex" || contacts.includes(v) || isContact(v)) {
      if (!getUser(v)) saveCustom({ username: v, name: nameCap(v), preset: hashPreset(v) });
      setDms((d) => (d[v] ? d : { ...d, [v]: [] }));
      openChat(v);
      return;
    }
    void sendContactRequest(v).then((result) => {
      flash(result === "accepted" ? `@${v} is already a contact.` : `Contact request sent to @${v}. They need to accept before you can chat.`);
    }).catch((error: unknown) => flash(error instanceof Error ? error.message : "Could not send that contact request."));
  };

  const addByUsername = () => {
    const v = addName.trim().toLowerCase();
    if (!v) return;
    if (profile && v === profile.username.toLowerCase()) {
      setAddErr("That's you!");
      return;
    }
    setAddErr(null);
    setAddName("");
    startChat(v);
  };

  const acceptRequest = async (request: NetRequest) => {
    try {
      if (request.kind === "group" && request.groupId) {
        await decideGroupInvitation(request.id, request.groupId, true);
        const key = groupKey(request.groupId);
        setDms((d) => d[key] ? d : { ...d, [key]: [] });
        openChat(key);
        flash(`You joined ${request.name}.`);
      } else {
        await decideContactRequest(request.id, true);
        setDms((d) => d[request.username] ? d : { ...d, [request.username]: [] });
        flash(`You and @${request.username} are contacts now.`);
      }
    } catch (error) { flash(error instanceof Error ? error.message : "Could not accept that request."); }
  };

  const declineRequest = async (request: NetRequest) => {
    try {
      if (request.kind === "group" && request.groupId) await decideGroupInvitation(request.id, request.groupId, false);
      else await decideContactRequest(request.id, false);
      flash(request.kind === "group" ? `Declined the invitation to ${request.name}.` : `Declined @${request.username}'s request.`);
    }
    catch (error) { flash(error instanceof Error ? error.message : "Could not decline that request."); }
  };

  const createGroupChat = async (title: string, usernames: string[]) => {
    try {
      const group = await netCreateGroup(title, usernames);
      const key = groupKey(group.id);
      setGroups((items) => [...items.filter((item) => item.id !== group.id), group]);
      setDms((d) => d[key] ? d : { ...d, [key]: [] });
      setNewGroup(false);
      openChat(key);
      flash(`Created ${group.title}.`);
    } catch (error) { flash(error instanceof Error ? error.message : "Could not create that group."); }
  };

  const saveEdit = async (message: Msg) => {
    if (!active || !editDraft.trim()) return;
    try {
      await netEditMessage(message.id, editDraft);
      patchMsg(active, message.id, { text: editDraft.trim(), edited: true });
      setEditingId(null);
      setEditDraft("");
    } catch (error) { flash(error instanceof Error ? error.message : "Could not edit that message."); }
  };

  const unsend = async (message: Msg) => {
    if (!active) return;
    try {
      await netUnsendMessage(message.id);
      patchMsg(active, message.id, { text: "", media: undefined, deleted: true });
    } catch (error) { flash(error instanceof Error ? error.message : "Could not unsend that message."); }
  };

  const removeMessage = async (message: Msg) => {
    if (!active) return;
    try {
      await netDeleteMessage(message.id);
      setDms((d) => ({ ...d, [active]: (d[active] ?? []).filter((m) => m.id !== message.id) }));
    } catch (error) { flash(error instanceof Error ? error.message : "Could not delete that message."); }
  };

  const chatKeys = useMemo(() => Object.keys(dms), [dms]);

  const chatList = useMemo(() => {
    return chatKeys
      .map((u) => {
        const last = dms[u][dms[u].length - 1];
        const sys = u === "Vertex";
        const unread = dms[u].filter((m) => m.from !== "me" && m.at > (seen[u] ?? 0)).length;
        return { u, sys, last, unread };
      })
      .filter((r) => {
        if (!query) return true;
        const ru = getUser(r.u);
        const name = ru ? ru.name : r.u;
        return name.toLowerCase().includes(query.toLowerCase()) || r.u.toLowerCase().includes(query.toLowerCase());
      })
      .sort((a, b) => {
        if (a.sys !== b.sys) return a.sys ? -1 : 1;
        return (b.last?.at ?? 0) - (a.last?.at ?? 0);
      });
  }, [chatKeys, dms, query, seen]);

  const activeUser = active ? getUser(active) ?? (active === "Vertex"
    ? SYSTEM_USER
    : active.startsWith("group:")
      ? { username: active, name: "Group chat", preset: hashPreset(active), group: true }
      : { username: active, name: nameCap(active), preset: hashPreset(active) }) : undefined;
  const activeMsgs = active ? dms[active] ?? [] : [];

  if (!profile) {
    return <SetupModal live={people.map((p) => p.username)} onDone={(p) => setProfile(p)} />;
  }

  return (
    <div className="msgs-app">
      {(netNote || net !== "online") && (
        <div className="msgs-net-note">
          <span>{messagesBackendConfigured
            ? netNote ?? (net === "connecting" ? "Connecting to the Messages server…" : "Disconnected — retrying automatically.")
            : "Messages needs a free Supabase project. Follow MESSAGES_SETUP.md to connect this app."}</span>
          {net !== "online" && <button type="button" className="msgs-net-retry" onClick={() => { lastWakeRef.current = Date.now(); reconnectNow(); }}>Reconnect now</button>}
        </div>
      )}
      <div className="msgs-shell">
        <aside className="msgs-sidebar">
          <div className="msgs-sidebar-head">
            <h1 className="msgs-logo">Messages</h1>
            <button type="button" className="msgs-compose-btn" title="New group chat" onClick={() => setNewGroup(true)}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 8h5m-2.5-2.5v5" strokeLinecap="round"/>
              </svg>
            </button>
            <button type="button" className="msgs-compose-btn" title="New message" onClick={() => setNewChat(true)}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="msgs-me">
            <GlyphAvatar src={profile.avatar} size={46} username={profile.username} status={profile.status} statusSize={15} verified={profile.username.toLowerCase() === "vertex"} />
            <div className="msgs-me-meta">
              <span className="msgs-me-name">{profile.name}</span>
              <span className="msgs-me-user">@{profile.username}</span>
            </div>
            <button
              type="button"
              className="msgs-status-chip"
              onClick={(e) => {
                e.stopPropagation();
                setStatusMenu((v) => !v);
              }}
            >
              <i className={`msgs-status-dot msgs-status-${profile.status}`} />
              <span style={{ textTransform: "capitalize" }}>{profile.status}</span>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {statusMenu && (
              <>
                <div className="msgs-ghost-overlay" onClick={() => setStatusMenu(false)} />
                <div className="msgs-status-menu">
                  {(["online", "idle", "offline"] as Status[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={profile.status === s ? "sel" : ""}
                      onClick={() => {
                        setProfile({ ...profile, status: s });
                        setStatusMenu(false);
                      }}
                    >
                      <span className={`msgs-status-dot msgs-status-${s}`} />
                      <span style={{ textTransform: "capitalize" }}>{s}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="msgs-search">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
            />
          </div>

          <div className="msgs-segmented">
            <button type="button" className={tab === "chats" ? "on" : ""} onClick={() => setTab("chats")}>
              Chats
            </button>
            <button type="button" className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>
              People{requests.filter((r) => r.direction === "incoming").length ? ` · ${requests.filter((r) => r.direction === "incoming").length}` : people.length > 0 ? ` · ${people.length}` : ""}
            </button>
          </div>

          <div className="msgs-conv-list">
            {tab === "people" && (
              <div className="msgs-addrow">
                <span className="msgs-at">@</span>
                <input
                  value={addName}
                  onChange={(e) => {
                    setAddName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""));
                    setAddErr(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && addByUsername()}
                  maxLength={16}
                  spellCheck={false}
                  placeholder="Message by username"
                />
                <button type="button" className="msgs-add-btn" onClick={addByUsername}>Go</button>
              </div>
            )}
            {addErr && tab === "people" && <p className="msgs-setup-err msgs-add-err">{addErr}</p>}
            {tab === "people" && requests.some((request) => request.direction === "incoming") && (
              <div className="msgs-req-sent">
                <div className="msgs-req-sent-title">Contact requests</div>
                {requests.filter((request) => request.direction === "incoming").map((request) => (
                  <div key={request.id} className="msgs-contact-request">
                    <div><strong>{request.kind === "group" ? request.name : request.name}</strong><span>{request.kind === "group" ? `Group invite · from @${request.username}` : `@${request.username} wants to chat`}</span></div>
                    <button type="button" className="msgs-request-accept" title="Accept" onClick={() => void acceptRequest(request)}>✓</button>
                    <button type="button" className="msgs-request-decline" title="Decline" onClick={() => void declineRequest(request)}>×</button>
                  </div>
                ))}
              </div>
            )}
            {tab === "people" && people.length > 0 && (
              <div className="msgs-req-sent">
                <div className="msgs-req-sent-title">Messages users</div>
                {people.map((p) => (
                  <div key={p.username} className="msgs-person-row">
                    <button type="button" className="msgs-req-row msgs-newchat-row" onClick={() => contacts.includes(p.username) ? startChat(p.username) : void startChat(p.username)}>
                      <GlyphAvatar src={p.avatar ?? { kind: "preset", id: p.preset }} size={40} username={p.username} status={p.status ?? "offline"} />
                      <span className="msgs-row-meta"><span className="msgs-row-name">{p.name}</span><span className="msgs-row-preview">@{p.username} · {p.status ?? "offline"}</span></span>
                    </button>
                    {contacts.includes(p.username) ? <button type="button" className="msgs-person-action" onClick={() => startChat(p.username)}>Chat</button> : requests.some((r) => r.kind === "contact" && r.username === p.username) ? <span className="msgs-person-pending">Pending</span> : <button type="button" className="msgs-person-action" onClick={() => void startChat(p.username)}>Add</button>}
                  </div>
                ))}
              </div>
            )}
            {tab === "chats" &&
              chatList.map(({ u, sys, last, unread }) => {
                const ru = getUser(u);
                const name = sys ? "Vertex" : ru?.name ?? u;
                const preview = last?.media
                  ? last.media.kind === "image"
                    ? "Photo"
                    : "Video"
                  : sys
                    ? "Messages · official"
                    : last?.failed
                      ? "Not delivered"
                      : `${last?.from === "me" ? "You: " : ""}${last?.text ?? "Say hi"}`;
                const time = last ? (dayLabel(last.at) === "Today" ? fmtTime(last.at) : shortDate(last.at)) : "";
                return (
                  <button
                    key={u}
                    type="button"
                    className={`msgs-row ${active === u ? "on" : ""}`}
                    onClick={() => {
                      setTab("chats");
                      openChat(u);
                    }}
                  >
                    <GlyphAvatar
                      src={ru?.avatar ?? rosterAvatar({ username: u, system: sys, preset: ru?.preset ?? 0 })}
                      size={46}
                      username={u}
                      verified={sys}
                      status={sys ? undefined : isOnline(u) ? (ru?.status === "idle" ? "idle" : "online") : "offline"}
                    />
                    <span className="msgs-row-meta">
                      <span className="msgs-row-name">
                        {name}
                        {sys && <VerifiedBadge />}
                      </span>
                      <span className="msgs-row-preview">{preview}</span>
                    </span>
                    <span className="msgs-row-side">
                      {time && <span className="msgs-row-time">{time}</span>}
                      {unread > 0 && <span className="msgs-row-unread">{unread}</span>}
                    </span>
                  </button>
                );
              })}
            {tab === "chats" && chatList.length === 0 && (
              <p className="msgs-empty">No conversations yet. Tap + to find someone online.</p>
            )}
            {tab === "people" && people.length === 0 && !addErr && (
              <p className="msgs-empty">
                {net === "online" ? "No other Messages users yet. Share the site so friends can join." : "Connecting to the Messages server…"}
              </p>
            )}
          </div>
        </aside>

        <section className="msgs-conv">
          {activeUser ? (
            <>
              <header className="msgs-conv-head">
                <button type="button" className="msgs-back-btn" onClick={() => setActive(null)}>
                  ‹
                </button>
                <GlyphAvatar src={rosterAvatar({ username: activeUser.username, system: activeUser.system, preset: activeUser.preset })} size={40} username={activeUser.username} verified={activeUser.verified} />
                <div className="msgs-conv-head-meta">
                  <span className="msgs-conv-name">
                    {activeUser.name}
                    {activeUser.verified && <VerifiedBadge />}
                  </span>
                  <span className="msgs-conv-sub">
                    {activeUser.system ? "Official system channel" : activeUser.group ? `${activeUser.members?.length ?? 0} members` : `@${activeUser.username} · ${isOnline(activeUser.username) ? activeUser.status ?? "online" : "offline"}`}
                  </span>
                </div>
                {!activeUser.system && !activeUser.group && !!active && contacts.includes(active) && isOnline(active) && (
                  <div className="msgs-head-actions">
                    <button type="button" title="Call" onClick={() => startCall(activeUser.username, "voice")}>
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9z" />
                      </svg>
                    </button>
                    <button type="button" title="Video call" onClick={() => startCall(activeUser.username, "video")}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <rect x="3" y="6" width="13" height="12" rx="2.5" />
                        <path d="M16 10l5-3v10l-5-3" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </header>

              <div className="msgs-msgs">
                  {activeMsgs.map((m, i) => {
                  const prevDay = i > 0 ? dayLabel(activeMsgs[i - 1].at) : null;
                  const dLabel = dayLabel(m.at);
                  const showDay = i === 0 || prevDay !== dLabel;
                  const mine = m.from === "me";
                  const med = m.media;
                  return (
                    <div key={m.id}>
                      {showDay && <div className="msgs-day">{dLabel}</div>}
                      <div className={`msgs-bubble-row ${mine ? "mine" : "theirs"}`}>
                        {!mine && (
                          <GlyphAvatar src={rosterAvatar({ username: activeUser.group ? m.from : activeUser.username, system: activeUser.system, preset: activeUser.group ? (getUser(m.from)?.preset ?? hashPreset(m.from)) : activeUser.preset })} size={30} username={activeUser.group ? m.from : activeUser.username} />
                        )}
                        <div className={`msgs-bubble-wrap ${activeUser.system ? "system" : ""} ${mine ? "mine" : ""}`}>
                          {activeUser.group && <div className="msgs-bubble-name"><span>{mine ? "You" : getUser(m.from)?.name ?? m.from}</span><span className="msgs-bubble-time">{fmtTime(m.at)}</span></div>}
                          {activeUser.system && (
                            <div className="msgs-bubble-name">
                              <span>Vertex</span>
                              <VerifiedBadge />
                              <span className="msgs-bubble-time">{fmtTime(m.at)}</span>
                            </div>
                          )}
                          {editingId === m.id ? (
                            <form className="msgs-edit-form" onSubmit={(e) => { e.preventDefault(); void saveEdit(m); }}>
                              <input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} maxLength={4000} autoFocus />
                              <button type="submit" disabled={!editDraft.trim()}>Save</button>
                              <button type="button" onClick={() => { setEditingId(null); setEditDraft(""); }}>Cancel</button>
                            </form>
                          ) : (
                            <div className={`msgs-bubble ${mine ? "mine" : ""} ${m.deleted ? "deleted" : ""}`}>
                              {!m.deleted && med?.kind === "image" && <img className="msgs-media-img" src={med.url} alt={med.name} onClick={() => setLightbox(med.url)} />}
                              {!m.deleted && med?.kind === "video" && <video className="msgs-media-vid" src={med.url} controls preload="metadata" />}
                              {m.deleted ? <p>This message was unsent.</p> : m.text && <p>{m.text}</p>}
                            </div>
                          )}
                          {!activeUser.system && <div className="msgs-message-meta"><span className="msgs-time-under">{fmtTime(m.at)}{m.edited && !m.deleted ? " · edited" : ""}</span>{mine && m.seen && <span className="msgs-seen-label">Seen{m.seenAt ? ` · ${fmtTime(m.seenAt)}` : ""}</span>}</div>}
                          {mine && !m.deleted && !m.pending && !m.failed && editingId !== m.id && (
                            <div className="msgs-message-actions">
                              {m.text && <button type="button" onClick={() => { setEditingId(m.id); setEditDraft(m.text); }}>Edit</button>}
                              <button type="button" onClick={() => void removeMessage(m)}>Delete</button>
                              <button type="button" onClick={() => void unsend(m)}>Unsend</button>
                            </div>
                          )}
                          {activeUser.system && <div className="msgs-official-tag">Official announcement channel</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {activeUser.system ? (
                <div className="msgs-locked">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
                  </svg>
                  This is an official system announcement channel.
                </div>
              ) : !activeUser.group && !contacts.includes(active ?? "") ? (
                <div className="msgs-locked msgs-req-pending">Accept the contact request before sending messages. Use People to accept or decline requests.</div>
              ) : (
                <>
                  {active && !activeUser.group && contacts.includes(active) && !isOnline(active) && (
                    <div className="msgs-locked msgs-req-pending">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v4.5" strokeLinecap="round" />
                        <path d="M12 15.6v.6" strokeLinecap="round" />
                      </svg>
                      @{activeUser.username} is offline — your message will be waiting when they open Messages.
                    </div>
                  )}
                <div className="msgs-composer">
                  <input
                    ref={attachRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-matroska"
                    style={{ display: "none" }}
                    onChange={onAttach}
                  />
                  <button type="button" className="msgs-attach-btn" title="Send photo or video" onClick={() => attachRef.current?.click()}>
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    className="msgs-input"
                    placeholder={activeMsgs.length === 0 ? `Message ${activeUser.group ? activeUser.name : `@${active}`}...` : "Message..."}
                  />
                  <button type="button" className="msgs-send-btn" onClick={send} disabled={!draft.trim() || (!activeUser.group && !contacts.includes(active ?? ""))}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
                      <path d="M3 20.5L22 12 3 3.5v6.6L15.5 12 3 13.9z" />
                    </svg>
                  </button>
                </div>
                </>
              )}
            </>
          ) : (
            <div className="msgs-conv-empty">
              <span className="msgs-conv-empty-logo">V</span>
              <h2>Messages</h2>
              <p>Select a conversation to start chatting.</p>
            </div>
          )}
        </section>
      </div>

      {notice && !call && createPortal((() => {
        const u = getUser(notice.user) ?? { username: notice.user, name: nameCap(notice.user), preset: hashPreset(notice.user) };
        return (
          <div className="msgs-banner msgs-banner--text" role="button" onClick={() => { setNotice(null); if (activeRef.current !== notice.user) setActive(notice.user); }}>
            <GlyphAvatar src={rosterAvatar({ username: u.username, system: !!(u as RosterUser).system, preset: u.preset })} size={44} username={u.username} />
            <div className="msgs-banner-body">
              <span className="msgs-banner-name">{u.name}</span>
              <span className="msgs-banner-sub">{notice.text}</span>
            </div>
          </div>
        );
      })(), document.body)}
      {toast && <div className="msgs-toast">{toast}</div>}
      {newChat && <NewChatModal people={people} me={profile.username.toLowerCase()} onPick={startChat} onCreate={startChat} onClose={() => setNewChat(false)} />}
      {newGroup && <CreateGroupModal people={people.filter((person) => contacts.includes(person.username))} onCreate={(title, usernames) => void createGroupChat(title, usernames)} onClose={() => setNewGroup(false)} />}
      {call && <CallOverlay call={call} onEnd={() => setCall(null)} onActive={() => setCall((c) => (c ? { ...c, stage: "active", startedAt: Date.now() } : c))} resolve={(u) => getUser(u) ?? { username: u, name: nameCap(u), preset: hashPreset(u) }} />}
      {lightbox && (
        <div className="msgs-modal-overlay msgs-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="attachment" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="msgs-lightbox-x" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

export default MessagesSurface;
