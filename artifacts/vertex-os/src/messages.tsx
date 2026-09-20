import { useEffect, useMemo, useRef, useState } from "react";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
if (import.meta.env.DEV) (window as unknown as { __VertexPeer?: typeof Peer }).__VertexPeer = Peer;

const dbg = (...msgs: unknown[]) => {
  if (!import.meta.env.DEV) return;
  try {
    const w = window as unknown as { __dbg?: string[] };
    if (!w.__dbg) w.__dbg = [];
    w.__dbg.push(`${new Date().toISOString().slice(11, 19)} ${msgs.join(" ")}`);
    if (w.__dbg.length > 400) w.__dbg = w.__dbg.slice(-300);
  } catch { /* ignore */ }
};
import {
  ArrowLeft, Ban, Camera, Check, Copy, Crown, DoorOpen, Gamepad2, Info, KeyRound, MessageCircle, Paperclip, Pin, PinOff, Plus,
  Send, SendHorizontal, ShieldCheck, Smile, Trash2, UserMinus, UserPlus, UserRound, Users, X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

type Role = "owner" | "admin" | "member";
type Media = { kind: "image" | "video"; url: string };
type Self = { code: string; n1: string; n2: string; avatar?: string; bio?: string; status?: string };
type DmRow = { code: string; n1: string; n2: string; avatar?: string; bio?: string; pinned?: boolean; status?: string; playing?: string };
type Member = { code: string; n1: string; n2: string; role: Role; avatar?: string; bio?: string; status?: string };
type Group = { id: string; name: string; role: Role; ownerCode: string; members: Member[]; blocked: string[] };
type Msg = { id: string; from: string; code: string; name: string; text: string; ts: number; media?: Media | null };
type Invite = { gid: string; gname: string; ownerName: string; ownerCode: string; ts: number };

type Packet =
  | { type: "msg"; id: string; from: string; code: string; name: string; text: string; ts: number; media?: Media | null }
  | { type: "join"; code: string; n1: string; n2: string; avatar?: string; bio?: string; status?: string; playing?: string }
  | { type: "read"; id: string; code: string; ts: number }
  | { type: "sync"; messages: Msg[] }
  | { type: "members"; members: Member[] }
  | { type: "invite"; gid: string; gname: string; ownerName: string; ownerCode: string; ts: number }
  | { type: "kicked"; gid: string }
  | { type: "left"; code: string }
  | { type: "friend-req"; code: string; n1: string; n2?: string; status?: string; ts: number }
  | { type: "friend-accept"; code: string; n1: string; n2?: string; status?: string; ts: number };

/* ------------------------------------------------------------------ */
/* helpers / storage                                                   */
/* ------------------------------------------------------------------ */

const EMOJIS = ["🙂", "😂", "😎", "😍", "🥳", "😭", "😡", "👍", "👎", "🔥", "❤️", "💀", "✨", "🎉", "🤝", "🤔"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UID_KEY = "vertex-uid";
const NAME1_KEY = "vertex-msgs-name";
const NAME2_KEY = "vertex-msgs-name2";
const AVATAR_KEY = "vertex-msgs-avatar";
const BIO_KEY = "vertex-msgs-bio";
const STATUS_KEY = "vertex-msgs-status";
const DMS_KEY = "vertex-dms";
const GROUPS_KEY = "vertex-groups";
const INVITES_KEY = "vertex-invites";
const BLOCKED_KEY = "vertex-msgs-blocked";
const REQS_IN_KEY = "vertex-friend-reqs-in";
const REQS_OUT_KEY = "vertex-friend-reqs-out";
const USERNAME_RE = /^[a-z0-9]{3,16}$/;

type FriendReqEntry = { code: string; n1: string; n2?: string; ts: number };

const NOW_PLAYING_KEY = "vertex-now-playing";

function readNowPlaying(): string {
  try { return (localStorage.getItem(NOW_PLAYING_KEY) ?? "").trim().slice(0, 40); } catch { return ""; }
}

export function publishNowPlaying(name: string) {
  try { localStorage.setItem(NOW_PLAYING_KEY, name); } catch { /* noop */ }
  try { window.dispatchEvent(new CustomEvent("vertex-now-playing", { detail: name })); } catch { /* noop */ }
}

const read = <T,>(k: string, d: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

function uid(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (const x of b) s += CODE_CHARS[x % CODE_CHARS.length];
  return s;
}
function readPs5Account(): { username?: string; displayName?: string; dob?: string } | null {
  try {
    const raw = localStorage.getItem("vertex-ps5-account");
    if (!raw) return null;
    const acc = JSON.parse(raw) as { username?: string; displayName?: string; dob?: string };
    if (!acc || !acc.username || !USERNAME_RE.test(acc.username)) return null;
    return acc;
  } catch {
    return null;
  }
}

function ensureSelf(): Self {
  const acc = readPs5Account();
  if (acc) {
    return {
      code: acc.username as string,
      n1: acc.displayName || (acc.username as string),
      n2: "",
      avatar: "",
      bio: "",
      status: localStorage.getItem(STATUS_KEY) ?? "online",
    };
  }
  let code = localStorage.getItem(UID_KEY) ?? "";
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    code = uid();
    localStorage.setItem(UID_KEY, code);
  }
  return {
    code,
    n1: localStorage.getItem(NAME1_KEY) ?? "You",
    n2: localStorage.getItem(NAME2_KEY) ?? "",
    avatar: localStorage.getItem(AVATAR_KEY) ?? "",
    bio: localStorage.getItem(BIO_KEY) ?? "",
    status: localStorage.getItem(STATUS_KEY) ?? "online",
  };
}
const selfName = (s: Self) => [s.n1, s.n2].filter(Boolean).join(" ").trim() || s.code;
const selfHub = (code: string) => `vertex-u-${code.toLowerCase()}`;
const groupHub = (gid: string) => `vertex-g-${gid}`;
const stripHub = (peer: string) => peer.replace(/^vertex-u-/, "").toLowerCase();

function mkMsg(s: Self, text: string, media?: Media | null): Msg {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: selfName(s),
    code: s.code,
    name: selfName(s),
    text,
    ts: Date.now(),
    media: media ?? undefined,
  };
}
function clock(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const readFileData = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ""));
    r.onerror = () => rej();
    r.readAsDataURL(file);
  });

function fileToMedia(file: File): Promise<Media> {
  return new Promise((res, rej) => {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); rej(); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        res({ kind: "image", url: canvas.toDataURL("image/jpeg", 0.85) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(); };
      img.src = url;
    } else if (file.type.startsWith("video/")) {
      if (file.size > 2_500_000) { rej(new Error("Video too big — keep it under 2.5 MB.")); return; }
      readFileData(file).then((data) => res({ kind: "video", url: data })).catch(rej);
    } else {
      rej(new Error("Only images and videos are supported."));
    }
  });
}

function Lightbox({ media, onClose }: { media: Media; onClose: () => void }) {
  return (
    <div className="msgs-lightbox" onClick={onClose}>
      <button className="msgs-lightbox-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      {media.kind === "image"
        ? <img src={media.url} alt="" onClick={(e) => e.stopPropagation()} />
        : <video src={media.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

const pairKey = (a: string, b: string) => {
  const s = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${s[0]}:${s[1]}`;
};
const dmHistKey = (a: string, b: string) => `vertex-chat:${pairKey(a, b)}`;
const groupHistKey = (gid: string) => `vertex-gchat:${gid}`;
const loadMsgs = (k: string): Msg[] => read<Msg[]>(k, []);
const saveMsgs = (k: string, msgs: Msg[]) => {
  const capped = msgs.slice(-300);
  write(k, capped);
  return capped;
};

const RECEIPTS_KEY = "vertex-msgs-receipts";
const receiptsCache = new Map<string, Map<string, number>>();
const loadReceipts = () => {
  const raw = read<Record<string, Record<string, number>>>(RECEIPTS_KEY, {});
  for (const [id, m] of Object.entries(raw)) {
    const mm = new Map<string, number>();
    for (const [code, ts] of Object.entries(m)) mm.set(code, ts);
    receiptsCache.set(id, mm);
  }
};
const persistReceipts = () => {
  const out: Record<string, Record<string, number>> = {};
  receiptsCache.forEach((m, id) => {
    out[id] = {};
    m.forEach((ts, code) => { out[id][code] = ts; });
  });
  write(RECEIPTS_KEY, out);
};
loadReceipts();

/* ------------------------------------------------------------------ */
/* small UI                                                            */
/* ------------------------------------------------------------------ */

function Avatar({ name, size = 38, dim = false, src }: { name: string; size?: number; dim?: boolean; src?: string }) {
  return (
    <span className={`msgs-avatar ${dim ? "msgs-avatar-pending" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {src ? <img className="msgs-avatar-img" src={src} alt="" /> : (name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

function Composer({ onSend, disabled, focusOrigin, placeholder = "Type a message…" }: { onSend: (text: string, media?: Media | null) => void; disabled?: boolean; focusOrigin?: string; placeholder?: string }) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [media, setMedia] = useState<Media | null>(null);
  const [fileErr, setFileErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText("");
    setMedia(null);
    setFileErr("");
  }, [focusOrigin]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || disabled) return;
    try {
      setMedia(await fileToMedia(f));
      setFileErr("");
    } catch (err) {
      setMedia(null);
      setFileErr(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const t = text.trim();
    if (!t && !media) return;
    onSend(t, media);
    setText("");
    setMedia(null);
    setShowEmoji(false);
    setFileErr("");
    inputRef.current?.focus();
  };

  return (
    <div className="msgs-composer-wrap">
      {showEmoji && (
        <div className="msgs-emoji">
          {EMOJIS.map((em) => (
            <button key={em} type="button" onClick={() => { setText((t) => t + em); inputRef.current?.focus(); }}>{em}</button>
          ))}
        </div>
      )}
      {fileErr && <div className="msgs-hint msgs-file-err">{fileErr}</div>}
      {media && (
        <div className="msgs-pending">
          {media.kind === "image" ? <img src={media.url} alt="" /> : <video src={media.url} muted playsInline preload="metadata" />}
          <span>{media.kind === "image" ? "Photo ready" : "Video ready"}</span>
          <button type="button" onClick={() => setMedia(null)} aria-label="Remove attachment"><X size={14} /></button>
        </div>
      )}
      <form className="msgs-composer" onSubmit={submit}>
        <button type="button" className="msgs-emoji-btn" onClick={() => setShowEmoji((s) => !s)} aria-label="Emoji"><Smile size={17} /></button>
        <button type="button" className="msgs-emoji-btn" onClick={() => fileRef.current?.click()} aria-label="Attach photo or video"><Paperclip size={17} /></button>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onFile} aria-label="Attach photo or video" />
        <input ref={inputRef} className="msgs-input msgs-composer-input" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} aria-label="Message" />
        <button type="submit" className="msgs-send" disabled={disabled || (!text.trim() && !media)} aria-label="Send"><Send size={16} /></button>
      </form>
    </div>
  );
}

type ChatScope = { kind: "dm"; code: string } | { kind: "group"; id: string };

function ChatLog({ eng, msgs, myCode, empty, scope }: { eng: Engine; msgs: Msg[]; myCode: string; empty: string; scope: ChatScope }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<Media | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; m: Msg } | null>(null);
  const [delConfirm, setDelConfirm] = useState(false);
  const [info, setInfo] = useState<Msg | null>(null);
  const [fwd, setFwd] = useState<Msg | null>(null);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs]);

  const scopeKey = scope.kind === "dm" ? eng.dmHistKey(eng.self.code, scope.code) : eng.groupHistKey(scope.id);

  const nameOf = (code: string) => {
    if (code === eng.self.code) return [eng.self.n1, eng.self.n2].filter(Boolean).join(" ").trim() || eng.self.n1;
    const infoRow = eng.whatIs(code);
    return infoRow.name;
  };
  const avOf = (code: string) => {
    const row = eng.dms.find((x) => x.code === code);
    if (row && row.avatar) return row.avatar;
    if (scope.kind === "group") {
      const g = eng.groups.find((x) => x.id === scope.id);
      const mem = g?.members.find((x) => x.code === code);
      if (mem && mem.avatar) return mem.avatar;
    }
    return "";
  };

  const openMenu = (m: Msg, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDelConfirm(false);
    setInfo(null);
    setFwd(null);
    setMenu({ m, x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 190) });
  };

  const copyMsg = (m: Msg) => {
    const text = m.text || (m.media ? m.media.url : "");
    navigator.clipboard?.writeText(text).then(() => setMenu(null)).catch(() => setMenu(null));
  };

  const deleteMsg = (m: Msg) => {
    const id = m.id;
    setMenu(null);
    setDelConfirm(false);
    eng.deleteMsg(scopeKey, id);
  };

  const forward = (m: Msg, target: { kind: "dm"; code: string } | { kind: "group"; id: string }) => {
    setFwd(null);
    if (target.kind === "dm") eng.sendDm(target.code, m.text, m.media);
    else eng.sendGroup(target.id, m.text, m.media);
  };

  const infoFor = (m: Msg) => {
    const reads = eng.readsFor(m.id);
    let all: string[] = [];
    if (scope.kind === "dm") all = [eng.self.code, scope.code];
    else {
      const g = eng.groups.find((x) => x.id === scope.id);
      all = (g?.members ?? []).map((x) => x.code);
    }
    const read = reads.filter((r) => all.includes(r.code)).sort((a, b) => a.ts - b.ts);
    const notRead = all.filter((c) => c !== m.code && !read.some((r) => r.code === c));
    return { read, notRead };
  };

  return (
    <>
      <div className="msgs-list" ref={listRef}>
        {msgs.length === 0 && <div className="msgs-empty">{empty}</div>}
        {msgs.map((m) => {
          const mine = m.code === myCode;
          const reads = eng.readsFor(m.id);
          const readBySomeone = scope.kind === "dm"
            ? reads.some((r) => r.code !== eng.self.code && r.code !== m.code)
            : reads.some((r) => r.code !== eng.self.code);
          const nm = m.name || nameOf(m.code) || m.code;
          const av = avOf(m.code);
          return (
            <div key={m.id} onContextMenu={(e) => openMenu(m, e)} className={`msgs-bubble ${mine ? "mine" : ""} ${m.media ? "msgs-bubble-media" : ""}`} data-testid="message">
              {m.media ? (
                m.media.kind === "image"
                  ? <button className="msgs-media-btn" onClick={() => setFull(m.media ?? null)} aria-label="Open image"><img className="msgs-media" src={m.media.url} alt="" loading="lazy" /></button>
                  : <video className="msgs-media msgs-video" src={m.media.url} controls muted playsInline preload="metadata" />
              ) : (
                <div className="msgs-bubble-text">{m.text}</div>
              )}
              <div className="msgs-bubble-meta">
                <Avatar name={nm} size={16} src={av || undefined} />
                <span className="msgs-bubble-name">{nm}</span>
                <span className="msgs-bubble-time">{clock(m.ts)}</span>
                {mine && <span className={`msgs-checks ${readBySomeone ? "read" : ""}`}>{readBySomeone ? "✓✓" : "✓"}</span>}
              </div>
            </div>
          );
        })}
        {full && <Lightbox media={full} onClose={() => setFull(null)} />}
      </div>

      {menu && (
        <>
          <div className="msgs-menu-backdrop" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="msgs-menu" style={{ left: menu.x, top: menu.y }}>
            <button onClick={() => copyMsg(menu.m)}><Copy size={14} /> Copy</button>
            <button onClick={() => { setDelConfirm(true); }}><Trash2 size={14} /> Delete</button>
            <button onClick={() => { setFwd(menu.m); setMenu(null); }}><SendHorizontal size={14} /> Resend to other person</button>
            <button onClick={() => { setInfo(menu.m); setMenu(null); }}><Info size={14} /> Info</button>
            {delConfirm && (
              <button className="msgs-menu-danger" onClick={() => deleteMsg(menu.m)}><Trash2 size={14} /> Delete for sure?</button>
            )}
          </div>
        </>
      )}

      {fwd && (
        <>
          <div className="msgs-menu-backdrop" onMouseDown={() => setFwd(null)} onContextMenu={(e) => { e.preventDefault(); setFwd(null); }} />
          <div className="msgs-fwd">
            <strong className="msgs-fwd-title"><SendHorizontal size={14} /> Resend to…</strong>
            {eng.dms.map((r) => (
              <button key={`d:${r.code}`} className="msgs-fwd-row" onClick={() => forward(fwd, { kind: "dm", code: r.code })}>
                <Avatar name={eng.whatIs(r.code).name} size={26} src={r.avatar || undefined} />
                <span>{eng.whatIs(r.code).name}</span>
              </button>
            ))}
            {eng.groups.map((g) => (
              <button key={`g:${g.id}`} className="msgs-fwd-row" onClick={() => forward(fwd, { kind: "group", id: g.id })}>
                <Avatar name={g.name} size={26} />
                <span>{g.name}<em> group</em></span>
              </button>
            ))}
            {eng.dms.length === 0 && eng.groups.length === 0 && <div className="msgs-fwd-empty">No chats to resend to.</div>}
          </div>
        </>
      )}

      {info && (
        <>
          <div className="msgs-menu-backdrop" onMouseDown={() => setInfo(null)} onContextMenu={(e) => { e.preventDefault(); setInfo(null); }} />
          <div className="msgs-info">
            <header className="msgs-info-head">
              <strong>Message info</strong>
              <span>{info.name || nameOf(info.code)} · {clock(info.ts)}</span>
            </header>
            <div className="msgs-info-row"><em>From</em><span>{info.name || nameOf(info.code)}</span></div>
            {info.media && <div className="msgs-info-row"><em>Type</em><span>{info.media.kind === "image" ? "📷 Photo" : "🎥 Video"}</span></div>}
            <div className="msgs-info-read">
              <strong>Read by</strong>
              {infoFor(info).read.length === 0 && <span className="msgs-info-none">No one yet</span>}
              {infoFor(info).read.map((r) => (
                <div key={r.code} className="msgs-info-person">
                  <Avatar name={nameOf(r.code)} size={22} src={avOf(r.code) || undefined} />
                  <span>{nameOf(r.code)}</span>
                  <time>{clock(r.ts)}</time>
                </div>
              ))}
            </div>
            <div className="msgs-info-read">
              <strong>Not read by</strong>
              {infoFor(info).notRead.length === 0 && <span className="msgs-info-none">Everyone read it</span>}
              {infoFor(info).notRead.map((c) => (
                <div key={c} className="msgs-info-person">
                  <Avatar name={nameOf(c)} size={22} src={avOf(c) || undefined} />
                  <span>{nameOf(c)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

type View =
  | { kind: "home" }
  | { kind: "new-chat" }
  | { kind: "new-group" }
  | { kind: "profile" }
  | { kind: "peer"; code: string }
  | { kind: "dm"; code: string }
  | { kind: "group"; id: string };

function useMessagesEngine() {
  const [self, setSelf] = useState<Self>(ensureSelf);
  const [dms, setDms] = useState<DmRow[]>(() => read<DmRow[]>(DMS_KEY, []));
  const [groups, setGroups] = useState<Group[]>(() => read<Group[]>(GROUPS_KEY, []));
  const [invites, setInvites] = useState<Invite[]>(() => read<Invite[]>(INVITES_KEY, []));
  const [blocked, setBlockedState] = useState<string[]>(() => read<string[]>(BLOCKED_KEY, []));
  const [nowPlaying, setNowPlaying] = useState<string>(() => readNowPlaying());
  const [reqsIn, setReqsIn] = useState<FriendReqEntry[]>(() => read<FriendReqEntry[]>(REQS_IN_KEY, []));
  const [reqsOut, setReqsOut] = useState<FriendReqEntry[]>(() => read<FriendReqEntry[]>(REQS_OUT_KEY, []));
  const [active, setActive] = useState<View>({ kind: "home" });
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const S = useRef<{ self: Self; dms: DmRow[]; groups: Group[]; invites: Invite[]; blocked: string[]; reqsIn: FriendReqEntry[]; reqsOut: FriendReqEntry[]; active: View }>({ self, dms, groups, invites, blocked, reqsIn, reqsOut, active });
  useEffect(() => {
    S.current = { self, dms, groups, invites, blocked, reqsIn, reqsOut, active };
  }, [self, dms, groups, invites, blocked, reqsIn, reqsOut, active]);

  useEffect(() => {
    const fromStorage = (e: StorageEvent) => { if (e.key === NOW_PLAYING_KEY) setNowPlaying((e.newValue ?? "").trim().slice(0, 40)); };
    const fromSignal = (e: Event) => setNowPlaying(String((e as CustomEvent).detail ?? "").trim().slice(0, 40));
    window.addEventListener("storage", fromStorage);
    window.addEventListener("vertex-now-playing", fromSignal);
    return () => {
      window.removeEventListener("storage", fromStorage);
      window.removeEventListener("vertex-now-playing", fromSignal);
    };
  }, []);

  useEffect(() => {
    broadcastProfile();
  }, [nowPlaying]);

  const cancelled = useRef(false);
  const peerSelf = useRef<Peer | null>(null);
  const dmConns = useRef(new Map<string, DataConnection>());
  const groupConns = useRef(new Map<string, DataConnection>());   // member side: gid -> conn to owner hub
  const groupHosts = useRef(new Map<string, Peer>());             // owner side: gid -> hub peer
  const hostConns = useRef(new Map<string, Map<string, DataConnection>>()); // owner side: gid -> code -> conn
  const hist = useRef(new Map<string, Msg[]>());
  const seenTs = useRef(new Map<string, number>());
  const unreadRef = useRef<Record<string, number>>({});

  const loadHist = (k: string) => {
    let h = hist.current.get(k);
    if (!h) {
      h = loadMsgs(k);
      hist.current.set(k, h);
    }
    return h;
  };
  const storeHist = (k: string, h: Msg[]) => {
    const capped = saveMsgs(k, h);
    hist.current.set(k, capped);
    return capped;
  };

  const notify = (text: string) => {
    setToast({ text, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id > 2500 ? null : t)), 2600);
  };

  /* --- persistence helpers ---------------------------------------- */

  const saveDms = (next: DmRow[]) => {
    write(DMS_KEY, next);
    S.current.dms = next;
    setDms(next);
  };
  const saveGroups = (next: Group[]) => {
    write(GROUPS_KEY, next);
    S.current.groups = next;
    setGroups(next);
  };
  const saveReqsIn = (next: FriendReqEntry[]) => {
    write(REQS_IN_KEY, next);
    S.current.reqsIn = next;
    setReqsIn(next);
  };
  const saveReqsOut = (next: FriendReqEntry[]) => {
    write(REQS_OUT_KEY, next);
    S.current.reqsOut = next;
    setReqsOut(next);
  };

  const isFriend = (code: string) => S.current.dms.some((r) => r.code === code);
  const isPending = (code: string) => S.current.reqsIn.some((r) => r.code === code) || S.current.reqsOut.some((r) => r.code === code);

  const upsertDm = (code: string, patch: Partial<Pick<DmRow, "n1" | "n2" | "avatar" | "bio" | "status" | "playing">>) => {
    if (code === S.current.self.code) return;
    const cur = S.current.dms;
    const idx = cur.findIndex((r) => r.code === code);
    if (idx >= 0) {
      saveDms(cur.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
      return;
    }
    const row: DmRow = { code, ...patch, n1: patch.n1 ?? "", n2: patch.n2 ?? "" };
    saveDms([...cur, row]);
  };

  const bumpUnread = (key: string) => {
    unreadRef.current = { ...unreadRef.current, [key]: (unreadRef.current[key] ?? 0) + 1 };
  };
  const clearUnread = (key: string) => {
    unreadRef.current = { ...unreadRef.current, [key]: 0 };
    setUnread(unreadRef.current);
  };
  const refreshUnread = () => setUnread({ ...unreadRef.current });

  /* --- identity peer ---------------------------------------------- */

  const ensureSelfPeer = () => {
    if (cancelled.current) return;
    if (peerSelf.current && !peerSelf.current.destroyed) return;
    const p = new Peer(selfHub(S.current.self.code), { debug: 0 });
    peerSelf.current = p;
    p.on("open", () => { dbg("self-open", p.id as string); });
    p.on("connection", (conn) => handleIncoming(conn));
    p.on("disconnected", () => {
      dbg("self-disconnected");
      try { p.reconnect(); } catch { /* noop */ }
    });
    p.on("error", (err) => {
      dbg("self-err", err.type);
      if (err.type === "unavailable-id") {
        try { p.destroy(); } catch { /* noop */ }
        peerSelf.current = null;
      }
    });
  };

  const sendToConn = (conn: DataConnection | undefined, pkt: Packet) => {
    if (conn && conn.open) conn.send(pkt);
  };

  /* --- history helpers -------------------------------------------- */

  const dmHist = (code: string) => loadHist(dmHistKey(S.current.self.code, code));

  const flushDm = (code: string, conn: DataConnection) => {
    const till = seenTs.current.get(`d:${pairKey(S.current.self.code, code)}`) ?? 0;
    for (const m of dmHist(code).filter((x) => x.code === S.current.self.code && x.ts > till)) {
      if (!conn.open) break;
      conn.send({ type: "msg", ...m } as Packet);
    }
    setTick((t) => t + 1);
  };
  const pushDmMsg = (code: string, m: Msg, isMine: boolean) => {
    if (m.code === S.current.self.code) return;
    const k = dmHistKey(S.current.self.code, code);
    const h = loadHist(k);
    if (h.some((x) => x.id === m.id)) return;
    const next = storeHist(k, [...h.slice(-299), m]);
    if (isMine) clearUnread(`d:${code}`);
    else if (!(S.current.active.kind === "dm" && S.current.active.code === code)) bumpUnread(`d:${code}`);
    const cur = seenTs.current.get(`d:${pairKey(S.current.self.code, code)}`) ?? 0;
    seenTs.current.set(`d:${pairKey(S.current.self.code, code)}`, Math.max(cur, m.ts));
  };
  const pushGroupMsg = (gid: string, m: Msg, isMine: boolean) => {
    if (m.code === S.current.self.code) return;
    const k = groupHistKey(gid);
    const h = loadHist(k);
    if (h.some((x) => x.id === m.id)) return;
    const next = storeHist(k, [...h.slice(-299), m]);
    void next;
    if (isMine) clearUnread(`g:${gid}`);
    else if (!(S.current.active.kind === "group" && S.current.active.id === gid)) bumpUnread(`g:${gid}`);
    const cur = seenTs.current.get(`g:${gid}`) ?? 0;
    seenTs.current.set(`g:${gid}`, Math.max(cur, m.ts));
  };

  /* --- read receipts ------------------------------------------------ */

  const recordReceipt = (id: string, code: string, ts: number) => {
    const cur = receiptsCache.get(id);
    if (!cur) receiptsCache.set(id, new Map([[code, ts]]));
    else {
      if ((cur.get(code) ?? 0) >= ts) return;
      cur.set(code, ts);
    }
    persistReceipts();
    setTick((t) => t + 1);
  };

  const markDmReads = (code: string) => {
    if (S.current.blocked.includes(code)) return;
    const h = loadHist(dmHistKey(S.current.self.code, code));
    const now = Date.now();
    const ids: string[] = [];
    for (const m of h) {
      if (m.code === S.current.self.code) continue;
      const cur = receiptsCache.get(m.id);
      if (cur && (cur.get(S.current.self.code) ?? 0) > 0) continue;
      if (!cur) receiptsCache.set(m.id, new Map());
      receiptsCache.get(m.id)!.set(S.current.self.code, now);
      ids.push(m.id);
    }
    if (!ids.length) return;
    persistReceipts();
    setTick((t) => t + 1);
    const c = dmConns.current.get(code);
    if (c && c.open) for (const id of ids) sendToConn(c, { type: "read", id, code: S.current.self.code, ts: now } as Packet);
  };

  const markGroupReads = (gid: string) => {
    const g = S.current.groups.find((x) => x.id === gid);
    if (!g) return;
    const h = loadHist(groupHistKey(gid));
    const now = Date.now();
    const ids: string[] = [];
    for (const m of h) {
      if (m.code === S.current.self.code) continue;
      const cur = receiptsCache.get(m.id);
      if (cur && (cur.get(S.current.self.code) ?? 0) > 0) continue;
      if (!cur) receiptsCache.set(m.id, new Map());
      receiptsCache.get(m.id)!.set(S.current.self.code, now);
      ids.push(m.id);
    }
    if (!ids.length) return;
    persistReceipts();
    setTick((t) => t + 1);
    if (g.role === "owner") {
      for (const id of ids) broadcastGroup(gid, { type: "read", id, code: S.current.self.code, ts: now } as Packet);
    } else {
      const c = groupConns.current.get(gid);
      if (c && c.open) for (const id of ids) c.send({ type: "read", id, code: S.current.self.code, ts: now } as Packet);
    }
  };

  const deleteMsg = (key: string, id: string) => {
    const h = loadHist(key);
    storeHist(key, h.filter((x) => x.id !== id));
    receiptsCache.delete(id);
    persistReceipts();
    setTick((t) => t + 1);
  };

  const readsFor = (id: string): { code: string; ts: number }[] =>
    [...(receiptsCache.get(id)?.entries() ?? [])].map(([code, ts]) => ({ code, ts }));

  /* --- DM direction ------------------------------------------------ */

  const onDmPacket = (code: string, raw: unknown) => {
    if (S.current.blocked.includes(code)) return;
    const pkt = raw as Packet;
    if (pkt.type === "join") {
      if (isFriend(code) || isPending(code)) upsertDm(code, { n1: pkt.n1, n2: pkt.n2 ?? "", avatar: pkt.avatar, bio: pkt.bio, status: pkt.status, playing: pkt.playing });
      return;
    }
    if (pkt.type === "read") {
      recordReceipt(pkt.id, pkt.code, pkt.ts);
      return;
    }
    if (pkt.type === "friend-req") {
      const c = pkt.code;
      if (c === S.current.self.code) return;
      if (isFriend(c)) return;
      if (S.current.reqsIn.some((r) => r.code === c)) return;
      const next = [...S.current.reqsIn, { code: c, n1: pkt.n1 || c, n2: pkt.n2 ?? "", ts: pkt.ts }];
      saveReqsIn(next);
      notify(`${pkt.n1 || c} wants to be your friend`);
      return;
    }
    if (pkt.type === "friend-accept") {
      const c = pkt.code;
      if (isFriend(c)) return;
      upsertDm(c, { n1: pkt.n1 || c, n2: pkt.n2 ?? "" });
      saveReqsOut(S.current.reqsOut.filter((r) => r.code !== c));
      ensureDm(c);
      notify(`${pkt.n1 || c} accepted your request — you can chat now`);
      setTick((t) => t + 1);
      return;
    }
    if (pkt.type === "msg") {
      if (!isFriend(code)) return;
      pushDmMsg(code, pkt, false);
      return;
    }
    if (pkt.type === "invite") {
      receiveInvite(pkt);
      return;
    }
  };

  const receiveInvite = (pkt: Extract<Packet, { type: "invite" }>) => {
    dbg("invite-recv", pkt.gname);
    const next = S.current.invites.some((i) => i.gid === pkt.gid)
      ? S.current.invites
      : [...S.current.invites, { gid: pkt.gid, gname: pkt.gname, ownerName: pkt.ownerName, ownerCode: pkt.ownerCode, ts: pkt.ts }];
    S.current.invites = next;
    write(INVITES_KEY, next);
    setInvites(next);
    notify(`You were invited to "${pkt.gname}"`);
  };

  const handleIncoming = (conn: DataConnection) => {
    if (cancelled.current) return;
    const code = stripHub(conn.peer);
    dbg("self-incoming", conn.peer, code);
    if (!USERNAME_RE.test(code) || code === S.current.self.code || conn.peer.startsWith("vertex-g") || S.current.blocked.includes(code)) {
      conn.close();
      return;
    }
    const existing = dmConns.current.get(code);
    if (existing && existing.open) {
      sendToConn(existing, { type: "join", code: S.current.self.code, n1: S.current.self.n1, n2: S.current.self.n2, avatar: S.current.self.avatar, bio: S.current.self.bio, status: S.current.self.status, playing: readNowPlaying() || nowPlaying } as Packet);
      conn.on("data", (raw) => {
        const pkt = raw as Packet;
        if (pkt.type === "invite") receiveInvite(pkt);
      });
      setTimeout(() => { try { conn.close(); } catch { /* noop */ } }, 900);
      return;
    }
    if (existing && !existing.open) {
      dbg("incoming-replace", code);
      try { existing.close(); } catch { /* noop */ }
      dmConns.current.delete(code);
    }
    dmConns.current.set(code, conn);
    conn.on("data", (raw) => onDmPacket(code, raw));
    conn.on("close", () => { dbg("incoming-close", code); if (dmConns.current.get(code) === conn) dmConns.current.delete(code); });
    conn.on("error", (e) => { dbg("incoming-err", code, e.type); if (dmConns.current.get(code) === conn) dmConns.current.delete(code); });
    sendToConn(conn, { type: "join", code: S.current.self.code, n1: S.current.self.n1, n2: S.current.self.n2, avatar: S.current.self.avatar, bio: S.current.self.bio, status: S.current.self.status, playing: readNowPlaying() || nowPlaying });
    flushDm(code, conn);
    setTick((t) => t + 1);
  };

  const ensureDm = (code: string) => {
    if (cancelled.current || code === S.current.self.code || S.current.blocked.includes(code)) return;
    if (dmConns.current.has(code)) return;
    dbg("dm-connect", code);
    const c = peerSelf.current?.connect(selfHub(code), { reliable: true });
    if (!c) return;
    dmConns.current.set(code, c);
    const openTimer = setTimeout(() => {
      if (!c.open && dmConns.current.get(code) === c) {
        dbg("dm-timeout", code);
        dmConns.current.delete(code);
        try { c.close(); } catch { /* noop */ }
        setTick((t) => t + 1);
      }
    }, 9000);
    c.on("open", () => {
      clearTimeout(openTimer);
      dbg("dm-open", code, c.peer as string);
      sendToConn(c, { type: "join", code: S.current.self.code, n1: S.current.self.n1, n2: S.current.self.n2, avatar: S.current.self.avatar, bio: S.current.self.bio, status: S.current.self.status, playing: readNowPlaying() || nowPlaying } as Packet);
      flushDm(code, c);
    });
    c.on("data", (raw) => onDmPacket(code, raw));
    c.on("close", () => { dbg("dm-close", code); if (dmConns.current.get(code) === c) dmConns.current.delete(code); setTick((t) => t + 1); });
    c.on("error", (e) => { dbg("dm-err", code, e.type); if (dmConns.current.get(code) === c) dmConns.current.delete(code); setTick((t) => t + 1); });
  };

  const sendDm = (code: string, text: string, media?: Media | null) => {
    if (S.current.blocked.includes(code)) { notify("You blocked this person — unblock to message them"); return; }
    if (!isFriend(code)) { notify("You can only message friends — add them by username first"); return; }
    const m = mkMsg(S.current.self, text, media);
    const k = dmHistKey(S.current.self.code, code);
    const h = loadHist(k);
    storeHist(k, [...h.slice(-299), m]);
    let c = dmConns.current.get(code);
    if (c && c.open) {
      c.send({ type: "msg", ...m } as Packet);
    } else {
      notify(`Saved — will deliver ${c ? "as soon as they're reachable" : "when you're both online"}`);
      ensureDm(code);
    }
    setTick((t) => t + 1);
  };

  /* --- friends ------------------------------------------------------ */

  const reqBusy = useRef(new Set<string>());

  const ensureReqConn = (username: string) => {
    if (cancelled.current || reqBusy.current.has(username) || username === S.current.self.code) return;
    if (!S.current.reqsOut.some((r) => r.code === username)) return;
    const existing = dmConns.current.get(username);
    if (existing && existing.open) {
      sendToConn(existing, { type: "friend-req", code: S.current.self.code, n1: S.current.self.n1, ts: Date.now() } as Packet);
      return;
    }
    reqBusy.current.add(username);
    const c = peerSelf.current?.connect(selfHub(username), { reliable: true });
    if (!c) { reqBusy.current.delete(username); return; }
    const t = setTimeout(() => {
      reqBusy.current.delete(username);
      try { c.close(); } catch { /* noop */ }
      setTick((x) => x + 1);
    }, 7000);
    c.on("open", () => {
      clearTimeout(t);
      sendToConn(c, { type: "friend-req", code: S.current.self.code, n1: S.current.self.n1, ts: Date.now() } as Packet);
      setTimeout(() => { try { c.close(); } catch { /* noop */ } }, 700);
    });
    c.on("close", () => { reqBusy.current.delete(username); });
    c.on("error", () => { reqBusy.current.delete(username); try { c.close(); } catch { /* noop */ } });
  };

  const sendFriendRequest = (username: string) => {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) { notify("Usernames are 3–16 letters or numbers"); return; }
    if (u === S.current.self.code) { notify("That's your own username"); return; }
    if (isFriend(u)) { notify("You're already friends"); return; }
    if (S.current.reqsOut.some((r) => r.code === u)) { notify("Friend request already sent"); return; }
    saveReqsOut([...S.current.reqsOut, { code: u, n1: "", ts: Date.now() }]);
    notify("Friend request sent — they'll see it once you're both online");
    ensureReqConn(u);
    setActive({ kind: "home" });
  };

  const acceptFriend = (r: FriendReqEntry) => {
    saveReqsIn(S.current.reqsIn.filter((x) => x.code !== r.code));
    upsertDm(r.code, { n1: r.n1 || r.code, n2: r.n2 ?? "" });
    const c = peerSelf.current?.connect(selfHub(r.code), { reliable: true });
    if (!c) { notify("Accepted — they'll see it when they're online"); return; }
    c.on("open", () => {
      sendToConn(c, { type: "friend-accept", code: S.current.self.code, n1: S.current.self.n1, ts: Date.now() } as Packet);
      setTimeout(() => { try { c.close(); } catch { /* noop */ } }, 700);
    });
    c.on("error", () => { try { c.close(); } catch { /* noop */ } });
    ensureDm(r.code);
    notify(`You and ${r.n1 || r.code} are now friends`);
    setTick((t) => t + 1);
  };

  const declineFriend = (code: string) => {
    saveReqsIn(S.current.reqsIn.filter((x) => x.code !== code));
    notify("Friend request declined");
  };

  /* --- groups : member side ---------------------------------------- */

  const onGroupPacket = (gid: string, _conn: DataConnection, raw: unknown) => {
    const pkt = raw as Packet;
    if (pkt.type === "sync") {
      hist.current.set(groupHistKey(gid), storeHist(groupHistKey(gid), pkt.messages));
      setTick((t) => t + 1);
      return;
    }
    if (pkt.type === "members") {
      const cur = S.current.groups;
      const g = cur.find((x) => x.id === gid);
      if (g) {
        const next = cur.map((x) => (x.id === gid ? { ...x, members: pkt.members, role: (pkt.members.find((m) => m.code === S.current.self.code)?.role ?? "member") as Role } : x));
        saveGroups(next);
      }
      setTick((t) => t + 1);
      return;
    }
    if (pkt.type === "msg") {
      pushGroupMsg(gid, pkt, false);
      setTick((t) => t + 1);
      return;
    }
    if (pkt.type === "read") {
      recordReceipt(pkt.id, pkt.code, pkt.ts);
      return;
    }
    if (pkt.type === "kicked") {
      const next = S.current.groups.filter((x) => x.id !== gid);
      write(GROUPS_KEY, next);
      setGroups(next);
      groupConns.current.delete(gid);
      notify("You were removed from that group");
      if (S.current.active.kind === "group" && S.current.active.id === gid) setActive({ kind: "home" });
      setTick((t) => t + 1);
      return;
    }
  };

  const ensureGroupConn = (g: Group) => {
    if (cancelled.current || g.role === "owner") return;
    if (groupConns.current.has(g.id)) return;
    dbg("gconnect", g.id);
    const c = peerSelf.current?.connect(groupHub(g.id), { reliable: true });
    if (!c) return;
    groupConns.current.set(g.id, c);
    const openTimer = setTimeout(() => {
      if (!c.open) {
        dbg("g-timeout", g.id);
        groupConns.current.delete(g.id);
        try { c.close(); } catch { /* noop */ }
        setTick((t) => t + 1);
      }
    }, 9000);
    c.on("open", () => {
      clearTimeout(openTimer);
      dbg("g-open", g.id);
      sendToConn(c, { type: "join", code: S.current.self.code, n1: S.current.self.n1, n2: S.current.self.n2, avatar: S.current.self.avatar, bio: S.current.self.bio, status: S.current.self.status, playing: readNowPlaying() || nowPlaying } as Packet);
      const till = seenTs.current.get(`g:${g.id}`) ?? 0;
      const pend = loadHist(groupHistKey(g.id)).filter(
        (x) => x.code === S.current.self.code && x.ts > till
      );
      if (pend.length) dbg("g-resend", g.id, pend.length);
      for (const m of pend) {
        if (c.open) c.send({ type: "msg", ...m } as Packet);
      }
      setTick((t) => t + 1);
    });
    c.on("data", (raw) => onGroupPacket(g.id, c, raw));
    c.on("close", () => { dbg("g-close", g.id); groupConns.current.delete(g.id); setTick((t) => t + 1); });
    c.on("error", (e) => { dbg("g-err", g.id, e.type); groupConns.current.delete(g.id); setTick((t) => t + 1); });
  };

  /* --- groups : owner side ----------------------------------------- */

  const broadcastGroup = (gid: string, pkt: Packet) => {
    const conns = hostConns.current.get(gid);
    if (!conns) return;
    conns.forEach((c) => sendToConn(c, pkt));
  };

  const handleGroupMember = (gid: string, conn: DataConnection) => {
    const code = stripHub(conn.peer);
    const g = S.current.groups.find((x) => x.id === gid);
    if (!g || conn.peer.startsWith("vertex-g")) {
      conn.close();
      return;
    }
    if (g.blocked.includes(code)) {
      dbg("gmember-blocked", code);
      conn.close();
      return;
    }
    if (!g.members.some((m) => m.code === code)) {
      dbg("gmember-unknown", code);
      conn.close();
      return;
    }
    const hostConnsFor = hostConns.current.get(gid) ?? new Map<string, DataConnection>();
    hostConns.current.set(gid, hostConnsFor);
    hostConnsFor.set(code, conn);
    conn.on("data", (raw) => {
      const pkt = raw as Packet;
      if (pkt.type === "msg" && pkt.code === code) {
        dbg("gmember-msg", gid, code, pkt.text);
        const h = loadHist(groupHistKey(gid));
        if (!h.some((x) => x.id === pkt.id)) {
          storeHist(groupHistKey(gid), [...h.slice(-299), pkt]);
          broadcastGroup(gid, pkt as Packet);
          setTick((t) => t + 1);
        }
      } else if (pkt.type === "join") {
        const gNow = S.current.groups.find((x) => x.id === gid);
        if (gNow && !gNow.members.some((m) => m.code === code)) {
          const next = S.current.groups.map((x) =>
            x.id === gid
              ? { ...x, members: [...x.members, { code, n1: pkt.n1, n2: pkt.n2 ?? "", avatar: pkt.avatar, bio: pkt.bio, status: pkt.status, role: "member" as Role }] }
              : x
          );
          saveGroups(next);
        } else if (gNow) {
          const next = S.current.groups.map((x) =>
            x.id === gid
              ? { ...x, members: x.members.map((m) => (m.code === code ? { ...m, n1: pkt.n1, n2: pkt.n2 ?? "", avatar: pkt.avatar, bio: pkt.bio, status: pkt.status } : m)) }
              : x
          );
          saveGroups(next);
        }
        broadcastGroup(gid, { type: "members", members: S.current.groups.find((x) => x.id === gid)?.members ?? [] } as Packet);
      } else if (pkt.type === "left" && pkt.code === code) {
        const next = S.current.groups.map((x) => (x.id === gid ? { ...x, members: x.members.filter((m) => m.code !== code) } : x));
        saveGroups(next);
        broadcastGroup(gid, { type: "members", members: S.current.groups.find((x) => x.id === gid)?.members ?? [] } as Packet);
      } else if (pkt.type === "read") {
        recordReceipt(pkt.id, pkt.code, pkt.ts);
        broadcastGroup(gid, pkt as Packet);
      }
    });
    conn.on("close", () => hostConnsFor.delete(code));
    conn.on("error", () => hostConnsFor.delete(code));
    broadcastGroup(gid, { type: "members", members: g.members } as Packet);
    const h = loadHist(groupHistKey(gid));
    sendToConn(conn, { type: "sync", messages: h } as Packet);
    sendToConn(conn, { type: "members", members: g.members } as Packet);
  };

  const ensureGroupHost = (g: Group) => {
    if (cancelled.current || g.role !== "owner") return;
    if (groupHosts.current.has(g.id)) return;
    dbg("ghost", g.id);
    const p = new Peer(groupHub(g.id), { debug: 0 });
    groupHosts.current.set(g.id, p);
    if (!hostConns.current.get(g.id)) hostConns.current.set(g.id, new Map());
    p.on("open", () => { dbg("ghost-open", g.id); setTick((t) => t + 1); });
    p.on("connection", (conn) => { dbg("ghost-conn", g.id, conn.peer as string); handleGroupMember(g.id, conn); });
    p.on("disconnected", () => { dbg("ghost-disc", g.id); try { p.reconnect(); } catch { /* noop */ } });
    p.on("error", (err) => {
      dbg("ghost-err", g.id, err.type);
      if (err.type === "unavailable-id") {
        try { p.destroy(); } catch { /* noop */ }
        groupHosts.current.delete(g.id);
        setTick((t) => t + 1);
      }
    });
  };

  /* --- tick loop ---------------------------------------------------- */

  useEffect(() => {
    ensureSelfPeer();
    const iv = setInterval(() => {
      ensureSelfPeer();
      S.current.dms.forEach((r) => ensureDm(r.code));
      S.current.reqsOut.forEach((r) => ensureReqConn(r.code));
      S.current.groups.forEach((g) => {
        if (g.role === "owner") ensureGroupHost(g);
        else ensureGroupConn(g);
      });
      refreshUnread();
      setTick((t) => t + 1);
    }, 4000);
    return () => {
      cancelled.current = true;
      clearInterval(iv);
      dmConns.current.forEach((c) => { try { c.close(); } catch { /* noop */ } });
      groupConns.current.forEach((c) => { try { c.close(); } catch { /* noop */ } });
      hostConns.current.forEach((m) => m.forEach((c) => { try { c.close(); } catch { /* noop */ } }));
      groupHosts.current.forEach((p) => { try { p.destroy(); } catch { /* noop */ } });
      try { peerSelf.current?.destroy(); } catch { /* noop */ }
    };
  }, []);

  /* --- actions ------------------------------------------------------ */

  const online = useMemo(() => {
    const dm = new Set<string>();
    dmConns.current.forEach((c, code) => { if (c.open) dm.add(code); });
    const grp = new Set<string>();
    groupConns.current.forEach((c, id) => { if (c.open) grp.add(id); });
    groupHosts.current.forEach((p, id) => { if (p.open) grp.add(id); });
    return { dm, grp };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const dmRow = (code: string) => {
    const r = S.current.dms.find((x) => x.code === code);
    return r ?? S.current.dms.find((x) => x.code === code);
  };

  const saveNames = (n1: string, n2: string) => saveProfile({ n1, n2 });

  const saveStatus = (status: string) => {
    const st = (["online", "idle", "offline"] as const).includes(status as "online" | "idle" | "offline") ? status : "online";
    localStorage.setItem(STATUS_KEY, st);
    setSelf((s) => ({ ...s, status: st }));
    S.current.self = { ...S.current.self, status: st };
    broadcastProfile();
  };

  const statusOf = (code: string): string => {
    const r = S.current.dms.find((x) => x.code === code);
    if (r && r.status) {
      return ["online", "idle", "offline"].includes(r.status) ? r.status : "online";
    }
    return dmConns.current.has(code) && dmConns.current.get(code)!.open ? "online" : "offline";
  };

  const saveProfile = (p: { n1?: string; n2?: string; bio?: string; avatar?: string }) => {
    if (p.n1 !== undefined) localStorage.setItem(NAME1_KEY, p.n1.trim() || "You");
    if (p.n2 !== undefined) localStorage.setItem(NAME2_KEY, p.n2.trim());
    if (p.bio !== undefined) localStorage.setItem(BIO_KEY, p.bio.trim());
    if (p.avatar !== undefined) {
      if (p.avatar) localStorage.setItem(AVATAR_KEY, p.avatar);
      else localStorage.removeItem(AVATAR_KEY);
    }
    setSelf((s) => ({
      ...s,
      n1: p.n1 !== undefined ? p.n1.trim() || "You" : s.n1,
      n2: p.n2 !== undefined ? p.n2.trim() : s.n2,
      bio: p.bio !== undefined ? p.bio.trim() : s.bio,
      avatar: p.avatar !== undefined ? p.avatar : s.avatar,
    }));
    S.current.self = {
      ...S.current.self,
      n1: p.n1 !== undefined ? p.n1.trim() || "You" : S.current.self.n1,
      n2: p.n2 !== undefined ? p.n2.trim() : S.current.self.n2,
      bio: p.bio !== undefined ? p.bio.trim() : S.current.self.bio,
      avatar: p.avatar !== undefined ? p.avatar : S.current.self.avatar,
    };
    broadcastProfile();
  };

  const buildJoin = (): Packet => {
    const s = S.current.self;
    return { type: "join", code: s.code, n1: s.n1, n2: s.n2 ?? "", avatar: s.avatar, bio: s.bio, status: s.status, playing: readNowPlaying() || nowPlaying };
  };
  const broadcastProfile = () => {
    const pkt = buildJoin();
    dmConns.current.forEach((c) => { if (c.open) sendToConn(c, pkt); });
    groupConns.current.forEach((c) => { if (c.open) sendToConn(c, pkt); });
    hostConns.current.forEach((m) => m.forEach((c) => { if (c.open) sendToConn(c, pkt); }));
  };

  const addContact = (code: string, n1: string, n2: string) => {
    upsertDm(code, { n1: n1.trim() || code, n2: n2.trim() });
  };

  const openDm = (code: string) => {
    upsertDm(code, { n1: dmRow(code)?.n1 ?? "", n2: dmRow(code)?.n2 ?? "" });
    clearUnread(`d:${code}`);
    ensureDm(code);
    setActive({ kind: "dm", code });
  };

  const sendGroup = (gid: string, text: string, media?: Media | null) => {
    const m = mkMsg(S.current.self, text, media);
    const g = S.current.groups.find((x) => x.id === gid);
    if (!g) return;
    const h = loadHist(groupHistKey(gid));
    storeHist(groupHistKey(gid), [...h.slice(-299), m]);
    if (g.role === "owner") broadcastGroup(gid, { type: "msg", ...m } as Packet);
    else {
      const c = groupConns.current.get(gid);
      if (c && c.open) c.send({ type: "msg", ...m } as Packet);
      else { notify("Group owner offline — message saved, will send when they return"); dbg("qsave", gid, text); }
    }
    setTick((t) => t + 1);
  };

  const createGroup = (name: string, picks: { code: string; n1: string; n2: string }[]) => {
    const gid = uid().slice(0, 6);
    const g: Group = {
      id: gid,
      name: name.trim() || "New group",
      role: "owner",
      ownerCode: S.current.self.code,
      members: [{ code: S.current.self.code, n1: S.current.self.n1, n2: S.current.self.n2, role: "owner" }],
      blocked: [],
    };
    const next = [...S.current.groups, g];
    saveGroups(next);
    picks.forEach((t) => addGroupMember(gid, t.code, t.n1 !== t.code ? t.n1 : undefined, t.n2));
    setActive({ kind: "group", id: gid });
    notify(`Group "${g.name}" created`);
    return gid;
  };

  const findGroup = (gid: string) => S.current.groups.find((x) => x.id === gid);

  const inviteSent = (gid: string, code: string) => {
    const g = S.current.groups.find((x) => x.id === gid);
    if (!g) return;
    const pkt = { type: "invite", gid, gname: g.name, ownerName: selfName(S.current.self), ownerCode: S.current.self.code, ts: Date.now() } as Packet;
    const existing = dmConns.current.get(code);
    if (existing && existing.open) {
      sendToConn(existing, pkt);
      notify("Invite sent — they need to be online to see it");
      return;
    }
    const c = peerSelf.current?.connect(selfHub(code), { reliable: true });
    if (!c) { notify("Can't reach that person right now"); return; }
    c.on("open", () => {
      sendToConn(c, pkt);
      setTimeout(() => { try { c.close(); } catch { /* noop */ } }, 700);
    });
    c.on("error", () => { try { c.close(); } catch { /* noop */ } });
    notify("Invite sent — they need to be online to see it");
  };

  const addGroupMember = (gid: string, code: string, n1?: string, n2?: string) => {
    const g = findGroup(gid);
    if (!g || g.role !== "owner") return;
    if (code === g.ownerCode) return;
    const existing = g.members.find((m) => m.code === code);
    if (existing) {
      if (n1 || n2) {
        const next = S.current.groups.map((x) => (x.id === gid ? { ...x, members: x.members.map((m) => (m.code === code ? { ...m, n1: n1 || m.n1, n2: n2 || m.n2 } : m)) } : x));
        saveGroups(next);
      }
      inviteSent(gid, code);
      return;
    }
    const next = S.current.groups.map((x) => (x.id === gid ? { ...x, members: [...x.members, { code, n1: n1 || code, n2: n2 || "", role: "member" as Role }] } : x));
    saveGroups(next);
    inviteSent(gid, code);
  };

  const acceptInvite = (inv: Invite) => {
    const exists = S.current.groups.some((x) => x.id === inv.gid);
    const nextInvites = S.current.invites.filter((i) => i.gid !== inv.gid);
    S.current.invites = nextInvites;
    write(INVITES_KEY, nextInvites);
    setInvites(nextInvites);
    if (!exists) {
      const g: Group = {
        id: inv.gid,
        name: inv.gname,
        role: "member",
        ownerCode: inv.ownerCode,
        members: [{ code: inv.ownerCode, n1: inv.ownerName, n2: "", role: "owner" }],
        blocked: [],
      };
      write(GROUPS_KEY, [...S.current.groups, g]);
      setGroups([...S.current.groups, g]);
      notify(`Joined "${inv.gname}"`);
      setActive({ kind: "group", id: inv.gid });
    } else {
      setActive({ kind: "group", id: inv.gid });
    }
  };

  const declineInvite = (gid: string) => {
    const next = S.current.invites.filter((i) => i.gid !== gid);
    S.current.invites = next;
    write(INVITES_KEY, next);
    setInvites(next);
  };

  const kickMember = (gid: string, code: string) => {
    const g = findGroup(gid);
    if (!g) return;
    const isAdmin = g.role === "admin";
    const target = g.members.find((m) => m.code === code);
    if (!target || target.role === "owner" || (target.role === "admin" && !isAdmin && g.role !== "owner")) return;
    const next = S.current.groups.map((x) => (x.id === gid ? { ...x, members: x.members.filter((m) => m.code !== code) } : x));
    saveGroups(next);
    const host = hostConns.current.get(gid);
    const tc = host?.get(code);
    if (tc && tc.open) {
      tc.send({ type: "kicked", gid } as Packet);
      setTimeout(() => { try { tc.close(); } catch { /* noop */ } }, 300);
      host?.delete(code);
    }
    broadcastGroup(gid, { type: "members", members: S.current.groups.find((x) => x.id === gid)?.members ?? [] } as Packet);
    notify("Member kicked");
  };

  const blockMember = (gid: string, code: string) => {
    const g = findGroup(gid);
    if (!g) return;
    const target = g.members.find((m) => m.code === code);
    if (!target || target.role === "owner") return;
    const next = S.current.groups.map((x) => (x.id === gid ? { ...x, members: x.members.filter((m) => m.code !== code), blocked: [...x.blocked, code] } : x));
    saveGroups(next);
    const host = hostConns.current.get(gid);
    const tc = host?.get(code);
    if (tc && tc.open) { tc.send({ type: "kicked", gid } as Packet); setTimeout(() => { try { tc.close(); } catch { /* noop */ } }, 300); host?.delete(code); }
    broadcastGroup(gid, { type: "members", members: S.current.groups.find((x) => x.id === gid)?.members ?? [] } as Packet);
    notify("Member blocked");
  };

  const unblockMember = (gid: string, code: string) => {
    const next = S.current.groups.map((x) => (x.id === gid && x.blocked.includes(code) ? { ...x, blocked: x.blocked.filter((b) => b !== code) } : x));
    saveGroups(next);
    notify("Unblocked");
  };

  const setRole = (gid: string, code: string, role: Role) => {
    const g = findGroup(gid);
    if (!g || g.role !== "owner") return;
    const next = S.current.groups.map((x) => (x.id === gid ? { ...x, members: x.members.map((m) => (m.code === code ? { ...m, role } : m)) } : x));
    saveGroups(next);
    broadcastGroup(gid, { type: "members", members: S.current.groups.find((x) => x.id === gid)?.members ?? [] } as Packet);
    notify(role === "admin" ? "Promoted to admin" : "Demoted to member");
  };

  const leaveGroup = (gid: string) => {
    const g = findGroup(gid);
    if (!g) return;
    const c = groupConns.current.get(gid) ?? (g.role === "owner" ? hostConns.current.get(gid)?.get(S.current.self.code) : undefined);
    if (c && c.open) c.send({ type: "left", code: S.current.self.code } as Packet);
    const next = S.current.groups.filter((x) => x.id !== gid);
    write(GROUPS_KEY, next);
    setGroups(next);
    S.current.groups = next;
    groupConns.current.delete(gid);
    if (g.role === "owner") {
      const hp = groupHosts.current.get(gid);
      if (hp) { try { hp.destroy(); } catch { /* noop */ } }
      groupHosts.current.delete(gid);
      hostConns.current.delete(gid);
    }
    if (S.current.active.kind === "group" && S.current.active.id === gid) setActive({ kind: "home" });
    notify("You left the group");
  };

  const whatIs = (code: string) => {
    const row = S.current.dms.find((x) => x.code === code) ?? { code, n1: "", n2: "", avatar: "", bio: "" };
    return {
      name: [row.n1, row.n2].filter(Boolean).join(" ") || `User ${code.slice(0, 4)}`,
      avatar: row.avatar,
      bio: row.bio,
      playing: row.playing ?? "",
      isContact: !!(row.n1 && (row.n1 !== code)),
    };
  };

  const peerProfile = (code: string): DmRow => {
    const row = S.current.dms.find((x) => x.code === code);
    return row ?? { code, n1: "", n2: "", avatar: "", bio: "" };
  };

  const openPeer = (code: string) => setActive({ kind: "peer", code });

  const saveBlocked = (next: string[]) => {
    write(BLOCKED_KEY, next);
    S.current.blocked = next;
    setBlockedState(next);
  };

  const blockContact = (code: string) => {
    if (S.current.blocked.includes(code)) return;
    saveBlocked([...S.current.blocked, code]);
    const c = dmConns.current.get(code);
    if (c && c.open) { try { c.close(); } catch { /* noop */ } }
    dmConns.current.delete(code);
    notify("Contact blocked");
  };

  const unblockContact = (code: string) => {
    if (!S.current.blocked.includes(code)) return;
    saveBlocked(S.current.blocked.filter((b) => b !== code));
    notify("Contact unblocked");
  };

  const isBlocked = (code: string) => S.current.blocked.includes(code);

  const pinDm = (code: string) => {
    const next = S.current.dms.map((r) => (r.code === code ? { ...r, pinned: !r.pinned } : r));
    saveDms(next);
    setTick((t) => t + 1);
  };

  const deleteDm = (code: string) => {
    saveDms(S.current.dms.filter((r) => r.code !== code));
    try { localStorage.removeItem(dmHistKey(S.current.self.code, code)); } catch { /* noop */ }
    clearUnread(`d:${code}`);
    if (S.current.active.kind === "dm" && S.current.active.code === code) setActive({ kind: "home" });
    setTick((t) => t + 1);
  };

  return {
    self,
    dms,
    groups,
    invites,
    reqsIn,
    reqsOut,
    nowPlaying,
    active,
    setActive,
    toast,
    tick,
    unread,
    online,
    whatIs,
    peerProfile,
    openPeer,
    blockContact,
    unblockContact,
    isBlocked,
    isFriend,
    isPending,
    sendFriendRequest,
    acceptFriend,
    declineFriend,
    pinDm,
    deleteDm,
    deleteMsg,
    readsFor,
    markDmReads,
    markGroupReads,
    saveNames,
    saveProfile,
    saveStatus,
    statusOf,
    addContact,
    openDm,
    sendDm,
    createGroup,
    addGroupMember,
    acceptInvite,
    declineInvite,
    kickMember,
    blockMember,
    unblockMember,
    setRole,
    leaveGroup,
    sendGroup,
    groupHistKey,
    dmHistKey,
    loadHist,
  };
}
type Engine = ReturnType<typeof useMessagesEngine>;

/* ------------------------------------------------------------------ */
/* views                                                               */
/* ------------------------------------------------------------------ */

function Home({ eng }: { eng: Engine }) {
  const { self, dms, groups, invites, online, unread, whatIs, openDm, setActive, isBlocked } = eng;
  const [tab, setTab] = useState<"chats" | "you">("chats");
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState<{ code: string; x: number; y: number } | null>(null);
  const [delConfirm, setDelConfirm] = useState(false);
  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);

  const rows = useMemo(() => {
    const out: { key: string; kind: "dm" | "group"; code: string; name: string; avatar?: string; preview: string; ts: number; online: boolean; st: string; unread: number; pinned: boolean; blocked: boolean; playing: string; groupId?: string }[] = [];
    dms.forEach((r) => {
      const h = eng.loadHist(eng.dmHistKey(self.code, r.code));
      const last = h[h.length - 1];
      const info = whatIs(r.code);
      const st = eng.statusOf(r.code);
      out.push({
        key: `d:${r.code}`,
        kind: "dm",
        code: r.code,
        name: info.name,
        avatar: r.avatar,
        preview: last ? `${last.code === self.code ? "You: " : ""}${last.media ? (last.media.kind === "image" ? "📷 Photo" : "🎥 Video") : last.text}` : "Say hi 👋",
        ts: last?.ts ?? 0,
        online: online.dm.has(r.code),
        st,
        unread: unread[`d:${r.code}`] ?? 0,
        pinned: r.pinned ?? false,
        blocked: isBlocked(r.code),
        playing: r.playing ?? "",
      });
    });
    groups.forEach((g) => {
      const h = eng.loadHist(eng.groupHistKey(g.id));
      const last = h[h.length - 1];
      out.push({
        key: `g:${g.id}`,
        kind: "group",
        code: "",
        name: g.name,
        preview: last ? `${last.code === self.code ? "You: " : ""}${last.media ? (last.media.kind === "image" ? "📷 Photo" : "🎥 Video") : last.text}` : "Group created",
        ts: last?.ts ?? 0,
        online: online.grp.has(g.id),
        st: online.grp.has(g.id) ? (g.role === "owner" ? "online" : "online") : "offline",
        unread: unread[`g:${g.id}`] ?? 0,
        pinned: false,
        blocked: false,
        playing: "",
        groupId: g.id,
      });
    });
    return out.sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || b.ts - a.ts);
  }, [dms, groups, eng, self, online, unread, isBlocked]);

  const menuTarget = menu ? dms.find((r) => r.code === menu.code) : undefined;
  const openMenu = (r: { code: string; kind: "dm" | "group" }, e: React.MouseEvent) => {
    if (r.kind !== "dm") return;
    e.preventDefault();
    setDelConfirm(false);
    setMenu({ code: r.code, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 170) });
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(self.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => undefined);
  };

  return (
    <div className="msgs-home">
      <header className="msgs-app-header">
        <div className="msgs-brand"><MessageCircle size={17} /> Messages</div>
      </header>

      <div className="msgs-tabsbar" role="tablist">
        <button className={`msgs-tab ${tab === "chats" ? "active" : ""}`} onClick={() => setTab("chats")} data-testid="tab-chats">Chats{totalUnread > 0 && <span className="msgs-badge msgs-tab-badge">{totalUnread}</span>}</button>
        <button className={`msgs-tab ${tab === "you" ? "active" : ""}`} onClick={() => setTab("you")} data-testid="tab-you">You</button>
      </div>

      {tab === "chats" ? (
        <div className="msgs-chats">

        {(eng.reqsIn.length > 0 || eng.reqsOut.length > 0) && (
          <div className="msgs-invite-card">
            <div className="msgs-invite-card-title"><UserPlus size={15} /> Friends</div>
            {eng.reqsIn.map((r) => (
              <div key={r.code} className="msgs-invite-row">
                <Avatar name={r.n1 || r.code} />
                <div className="msgs-room-info">
                  <strong>{r.n1 || r.code}</strong>
                  <span>wants to be your friend</span>
                </div>
                <button className="msgs-invite-btn" onClick={() => eng.acceptFriend(r)}>Accept</button>
                <button className="outline-button msgs-icon-btn" onClick={() => eng.declineFriend(r.code)} aria-label="Decline"><X size={14} /></button>
              </div>
            ))}
            {eng.reqsOut.map((r) => (
              <div key={r.code} className="msgs-invite-row">
                <Avatar name={r.code} dim />
                <div className="msgs-room-info">
                  <strong>{r.code}</strong>
                  <span>friend request sent — waiting for them to accept</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {invites.length > 0 && (
          <div className="msgs-invite-card">
            <div className="msgs-invite-card-title"><Users size={15} /> Group invites</div>
            {invites.map((iv) => (
              <div key={iv.gid} className="msgs-invite-row">
                <Avatar name={iv.gname} />
                <div className="msgs-room-info">
                  <strong>{iv.gname}</strong>
                  <span>invited by {iv.ownerName}</span>
                </div>
                <button className="msgs-invite-btn" onClick={() => eng.acceptInvite(iv)}>Join</button>
                <button className="outline-button msgs-icon-btn" onClick={() => eng.declineInvite(iv.gid)} aria-label="Decline"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="msgs-actions">
          <button className="msgs-invite-btn" onClick={() => setActive({ kind: "new-chat" })}><UserPlus size={14} /> Add friend</button>
          <button className="outline-button msgs-icon-btn" onClick={() => setActive({ kind: "new-group" })}><Users size={14} /> New group</button>
        </div>

        <div className="msgs-rooms">
          {rows.map((r) => (
            <button key={r.key} className={`msgs-room-card ${r.kind === "dm" ? "msgs-room-card-dm" : ""} ${r.pinned ? "is-pinned" : ""}`} onClick={() => (r.kind === "dm" ? openDm(r.key.slice(2)) : setActive({ kind: "group", id: r.groupId! }))} onContextMenu={(e) => openMenu(r, e)}>
              {r.kind === "dm" ? <Avatar name={r.name} dim={r.st === "offline" || r.blocked} src={r.avatar || undefined} /> : <Avatar name={r.name} />}
              <div className="msgs-room-info">
                <strong>{r.name} {r.pinned && <Pin size={11} className="msgs-pin-mark" />} {r.blocked && <Ban size={11} className="msgs-block-mark" />} {r.kind === "group" && <span className="msgs-rolechip">group</span>}</strong>
                <span>{r.blocked ? "Blocked — messages won't arrive" : r.preview}</span>
                <span className={`msgs-playing ${r.online && r.playing ? "on" : ""}`}>{r.online && r.playing ? <>🎮 Playing {r.playing}</> : "\u00A0"}</span>
              </div>
              {r.unread > 0 && <span className="msgs-badge">{r.unread}</span>}
              <span className={`msgs-dot ${r.st === "idle" ? "idle" : r.st === "online" ? "on" : "off"}`} title={r.st} />
            </button>
          ))}
          {rows.length === 0 && (
            <div className="msgs-empty" style={{ padding: "30px 0" }}>
              <MessageCircle size={26} />
              <strong>No chats yet</strong>
              <div>Add friends by username — you can only message people who accept your request.</div>
            </div>
          )}
        </div>

        {menu && (
          <>
            <div className="msgs-menu-backdrop" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
            <div className="msgs-menu" style={{ left: menu.x, top: menu.y }}>
              <button onClick={() => { eng.pinDm(menu.code); setMenu(null); }}>{menuTarget?.pinned ? <><PinOff size={14} /> Unpin</> : <><Pin size={14} /> Pin</>}</button>
              <button onClick={() => { setMenu(null); eng.openPeer(menu.code); }}><UserRound size={14} /> View profile</button>
              {eng.isBlocked(menu.code)
                ? <button onClick={() => { eng.unblockContact(menu.code); setMenu(null); }}><Ban size={14} /> Unblock</button>
                : <button onClick={() => { eng.blockContact(menu.code); setMenu(null); }}><Ban size={14} /> Block</button>}
              <button className="msgs-menu-danger" onClick={() => { const c = menu.code; setMenu(null); eng.deleteDm(c); }}><UserMinus size={14} /> Remove friend</button>
            </div>
          </>
        )}

        <div className="msgs-honest" style={{ marginTop: 22 }}>
          <strong>Heads up</strong> — chats are live: your friend has to have Messages open to receive.
          Usernames are unique, so only one person owns each. Friend requests arrive while both of you are online.
        </div>
      </div>
      ) : (
        <div className="msgs-chats msgs-you">
          <div className="msgs-you-card">
            <div className="msgs-you-avatar">
              <Avatar name={self.n1} size={92} />
              <span className="msgs-you-edit"><UserRound size={12} /> Account</span>
            </div>
            <strong className="msgs-you-name">{self.n1}</strong>
            <span className="msgs-you-username">@{self.code}</span>
            {self.bio && <p className="msgs-you-bio">{self.bio}</p>}
            {eng.nowPlaying ? (
              <div className="msgs-playing-banner"><Gamepad2 size={15} /> <span>Playing <strong>{eng.nowPlaying}</strong> — your friends can see this</span></div>
            ) : null}
            <div className="msgs-statusboard">
              <span className="msgs-statusboard-label">Status</span>
              <div className="msgs-statuspicker" role="radiogroup" aria-label="Your status" data-testid="status-picker">
                {(["online", "idle", "offline"] as const).map((st) => (
                  <button key={st} role="radio" aria-checked={(self.status ?? "online") === st} className={`msgs-statusopt ${(self.status ?? "online") === st ? "active" : ""}`} onClick={() => eng.saveStatus(st)} data-testid={`status-${st}`}>
                    <span className={`msgs-dot ${st === "idle" ? "idle" : st === "online" ? "on" : "off"}`} /> {st}
                  </button>
                ))}
              </div>
            </div>
            <div className="msgs-you-code">
              <KeyRound size={15} />
              <span>Your username</span>
              <code className="msgs-code">@{self.code}</code>
              <button className="outline-button msgs-icon-btn" onClick={copyCode}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileView({ eng }: { eng: Engine }) {
  const { self, setActive } = eng;
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard?.writeText(self.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => undefined);
  };

  return (
    <div className="msgs-room msgs-profile-room">
      <header className="msgs-room-header">
        <button className="outline-button msgs-icon-btn" onClick={() => setActive({ kind: "home" })} aria-label="Back"><ArrowLeft size={15} /></button>
        <div className="msgs-room-title">
          <strong>Profile</strong>
          <span>your account</span>
        </div>
      </header>
      <div className="msgs-profile">
        <div className="msgs-profile-avatar sm" data-testid="button-change-photo">
          <Avatar name={self.n1} size={96} />
        </div>
        <p className="msgs-profile-hint">Profile pictures come from your account — display name and username are set when you create your PS5 account.</p>
        <label className="msgs-field"><span>Display name</span><div className="msgs-input msgs-readonly">{self.n1}</div></label>
        <label className="msgs-field"><span>Username</span><div className="msgs-input msgs-readonly">@{self.code}</div></label>
        <div className="msgs-profile-code">
          <KeyRound size={15} />
          <span>Your username</span>
          <code className="msgs-code">@{self.code}</code>
          <button className="outline-button msgs-icon-btn" onClick={copyCode} data-testid="button-copy-code">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
        </div>
        <button className="msgs-invite-btn msgs-profile-save" onClick={() => setActive({ kind: "home" })} data-testid="button-save-profile">Done</button>
      </div>
    </div>
  );
}

function NewChat({ eng }: { eng: Engine }) {
  const { self } = eng;
  const [username, setUsername] = useState("");
  const [err, setErr] = useState("");

  const save = () => {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) return setErr("Usernames are 3–16 letters or numbers (no spaces).");
    if (u === self.code) return setErr("That's your own username.");
    if (eng.isFriend(u)) return setErr("You're already friends.");
    if (eng.isPending(u)) return setErr("A friend request with that username is already pending.");
    eng.sendFriendRequest(u);
  };

  return (
    <div className="msgs-home">
      <header className="msgs-app-header">
        <button className="outline-button msgs-icon-btn" onClick={() => eng.setActive({ kind: "home" })} aria-label="Back"><ArrowLeft size={15} /></button>
        <div className="msgs-brand">Add friend</div>
      </header>
      <div className="msgs-chats">
        <div className="msgs-card">
          <strong>Add a friend</strong>
          <p className="msgs-hint">Type your friend's username. They get a friend request — once they accept, you can text, share photos and videos.</p>
          {err && <div className="msgs-error">{err}</div>}
          <div className="msgs-open-row">
            <UserPlus size={15} />
            <input className="msgs-input" placeholder="Their username (e.g. onirifalx)" maxLength={16} value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Their username" autoFocus />
          </div>
          <div className="msgs-create-btns">
            <button className="msgs-invite-btn" onClick={save}><UserPlus size={14} /> Send friend request</button>
          </div>
        </div>
        <div className="msgs-hint" style={{ maxWidth: 440 }}>
          You can only message people who accept your request. Usernames are unique — they arrive as @{self.code} on your friend's device.
        </div>
      </div>
    </div>
  );
}

function Dm({ eng, code }: { eng: Engine; code: string }) {
  const { self, online, whatIs } = eng;
  const history = eng.loadHist(eng.dmHistKey(self.code, code));
  const info = whatIs(code);
  const on = online.dm.has(code);
  const st = eng.statusOf(code);
  const blockedHere = eng.isBlocked(code);
  const friendHere = eng.isFriend(code);
  const needsFriend = !friendHere && USERNAME_RE.test(code);
  const [editing, setEditing] = useState(false);
  const [a1, setA1] = useState(info.name);
  const [a2, setA2] = useState("");

  useEffect(() => {
    eng.markDmReads(code);
  }, [history, code, eng.tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="msgs-room">
      {blockedHere && (
        <div className="msgs-blocked-banner">
          <Ban size={14} />
          <span>You blocked this person — their messages won't arrive.</span>
          <button onClick={() => eng.unblockContact(code)}>Unblock</button>
        </div>
      )}
      {needsFriend && (
        <div className="msgs-blocked-banner">
          <UserPlus size={14} />
          <span>You can't message yet — wait until they accept your friend request.</span>
          <button onClick={() => eng.setActive({ kind: "home" })}>Back</button>
        </div>
      )}
      <header className="msgs-room-header">
        <button className="outline-button msgs-icon-btn" onClick={() => eng.setActive({ kind: "home" })} aria-label="Back"><ArrowLeft size={15} /></button>
        <button className="msgs-peer-btn" onClick={() => eng.openPeer(code)} aria-label="View profile"><Avatar name={info.name} size={32} dim={st === "offline"} src={info.avatar || undefined} /></button>
        <div className="msgs-room-title">
          <strong>{info.name}</strong>
          <span className={`msgs-status ${on ? "msgs-status-host" : ""}`}><span className={`msgs-dot ${st === "idle" ? "idle" : st === "online" ? "on" : "off"}`} /> {st}</span>
        </div>
        <button className="outline-button msgs-icon-btn" onClick={() => setEditing((s) => !s)} aria-label="Save contact">{info.isContact ? <Check size={15} /> : <UserPlus size={15} />}</button>
      </header>

      {editing && (
        <div className="msgs-adminpanel">
          <div className="msgs-members-head">Save this person</div>
          <input className="msgs-input" placeholder="Name" value={a1} onChange={(e) => setA1(e.target.value)} maxLength={20} />
          <input className="msgs-input" placeholder="Second name" value={a2} onChange={(e) => setA2(e.target.value)} maxLength={20} />
          <button className="msgs-invite-btn" onClick={() => { eng.addContact(code, a1 || info.name, a2); setEditing(false); }}>Save contact</button>
        </div>
      )}

      <ChatLog eng={eng} msgs={history} myCode={self.code} empty={`No messages yet with ${info.name}.\n\nMessages only arrive when you both have the app open.`} scope={{ kind: "dm", code }} />
      <Composer onSend={(t, media) => eng.sendDm(code, t, media)} disabled={blockedHere || needsFriend} focusOrigin={`d:${code}`} placeholder={needsFriend ? "Add @… and wait for them to accept" : "Type a message…"} />
    </div>
  );
}

function GroupView({ eng, id }: { eng: Engine; id: string }) {
  const { self, online } = eng;
  const g = eng.groups.find((x) => x.id === id);
  const [showAdmin, setShowAdmin] = useState(false);
  const [invCode, setInvCode] = useState("");
  const [invN1, setInvN1] = useState("");
  const [invN2, setInvN2] = useState("");
  const [err, setErr] = useState("");

  if (!g) {
    return (
      <div className="msgs-room">
        <div className="msgs-empty" style={{ flex: 1 }}>This group is no longer on this device.<br /><br /><button className="outline-button" onClick={() => eng.setActive({ kind: "home" })}>Back</button></div>
      </div>
    );
  }

  const history = eng.loadHist(eng.groupHistKey(g.id));
  const live = online.grp.has(g.id);

  useEffect(() => {
    eng.markGroupReads(g.id);
  }, [history, g.id, eng.tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="msgs-room">
      <header className="msgs-room-header">
        <button className="outline-button msgs-icon-btn" onClick={() => eng.setActive({ kind: "home" })} aria-label="Back"><ArrowLeft size={15} /></button>
        <Avatar name={g.name} size={32} />
        <div className="msgs-room-title">
          <strong>{g.name}</strong>
          <span><span className={`msgs-dot ${live ? "on" : "off"}`} /> {live ? (g.role === "owner" ? "live · hosted by you" : "live") : g.role === "owner" ? "hosting…" : "owner offline"} · {g.members.length} member{g.members.length === 1 ? "" : "s"}</span>
        </div>
        <button className="outline-button msgs-icon-btn" onClick={() => setShowAdmin((s) => !s)} aria-label="Manage group"><Users size={15} /></button>
      </header>

      {showAdmin && (
        <div className="msgs-adminpanel">
          <div className="msgs-members-head"><Users size={14} /> Members</div>
          {g.members.map((m) => {
            const isMe = m.code === self.code;
            const meAdmin = g.role === "admin";
            const meOwner = g.role === "owner";
            const canKick = meOwner || (meAdmin && m.role !== "admin" && m.role !== "owner");
            return (
              <div key={m.code} className="msgs-member">
                <Avatar name={[m.n1, m.n2].filter(Boolean).join(" ") || m.code} size={30} src={m.avatar || undefined} />
                <div className="msgs-member-info">
                  <strong>{[m.n1, m.n2].filter(Boolean).join(" ") || m.code} {isMe ? "(you)" : ""}</strong>
                  <span>{m.code}{m.role !== "member" && ` · ${m.role}`}</span>
                </div>
                {m.role === "owner" && <Crown size={14} />}
                {m.role === "admin" && <ShieldCheck size={14} />}
                {canKick && !isMe && (
                  <>
                    {meOwner && m.role !== "owner" && (
                      <button className="msgs-kick" onClick={() => eng.setRole(g.id, m.code, m.role === "admin" ? "member" : "admin")}>
                        {m.role === "admin" ? "Member" : "Admin"}
                      </button>
                    )}
                    {m.role !== "owner" && <button className="msgs-kick" onClick={() => eng.kickMember(g.id, m.code)}><UserMinus size={13} /> Kick</button>}
                    {m.role !== "owner" && <button className="msgs-kick" onClick={() => eng.blockMember(g.id, m.code)}><Ban size={13} /> Block</button>}
                  </>
                )}
              </div>
            );
          })}

          {g.role === "owner" && (
            <>
              <div className="msgs-members-head" style={{ marginTop: 14 }}>Add people</div>
              {err && <div className="msgs-error">{err}</div>}
              <div className="msgs-open-row">
                <KeyRound size={15} />
                <input className="msgs-input" placeholder="Their username" maxLength={16} value={invCode} onChange={(e) => setInvCode(e.target.value.toLowerCase())} aria-label="Their username" />
              </div>
              <button className="msgs-invite-btn" onClick={() => {
                const c = invCode.trim().toLowerCase();
                if (!USERNAME_RE.test(c)) return setErr("Usernames are 3–16 letters or numbers (no spaces).");
                if (c === self.code) return setErr("That's your own username.");
                if (g.members.some((m) => m.code === c)) return setErr("Already in the group.");
                eng.addGroupMember(g.id, c);
                setInvCode(""); setInvN1(""); setInvN2(""); setErr("");
              }}><UserPlus size={14} /> Invite</button>

              {g.blocked.length > 0 && (
                <>
                  <div className="msgs-members-head" style={{ marginTop: 14 }}>Blocked</div>
                  {g.blocked.map((b) => (
                    <div key={b} className="msgs-member">
                      <div className="msgs-member-info"><strong>{b}</strong><span>blocked</span></div>
                      <button className="msgs-kick" onClick={() => eng.unblockMember(g.id, b)}>Unblock</button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          <div className="msgs-create-btns" style={{ marginTop: 12 }}>
            <button className="outline-button msgs-icon-btn" onClick={() => eng.leaveGroup(g.id)}><DoorOpen size={14} /> Leave group</button>
          </div>
        </div>
      )}

      <ChatLog eng={eng} msgs={history} myCode={self.code} empty={`"${g.name}" is open. Only the owner adds people — grab them and invite them here.`} scope={{ kind: "group", id: g.id }} />
      <Composer onSend={(t, media) => eng.sendGroup(g.id, t, media)} disabled={g.role === "member" && !online.grp.has(g.id)} focusOrigin={`g:${g.id}`} placeholder={g.role === "member" && !online.grp.has(g.id) ? "Owner is offline…" : "Type a message…"} />
    </div>
  );
}

function PeerProfileView({ eng, code }: { eng: Engine; code: string }) {
  const { online } = eng;
  const p = eng.peerProfile(code);
  const on = online.dm.has(code);
  const st = eng.statusOf(code);
  const name = [p.n1, p.n2].filter(Boolean).join(" ").trim() || `User ${code.slice(0, 4)}`;
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="msgs-room msgs-profile-room">
      <header className="msgs-room-header">
        <button className="outline-button msgs-icon-btn" onClick={() => eng.setActive({ kind: "dm", code })} aria-label="Back"><ArrowLeft size={15} /></button>
        <div className="msgs-room-title">
          <strong>Profile</strong>
          <span className={`msgs-status ${on ? "msgs-status-host" : ""}`}><span className={`msgs-dot ${st === "idle" ? "idle" : st === "online" ? "on" : "off"}`} /> {st}</span>
        </div>
      </header>
      <div className="msgs-profile">
        {p.avatar ? (
          <button className="msgs-profile-avatar" onClick={() => setBig(true)} aria-label="View full picture">
            <Avatar src={p.avatar} name={p.n1 || code} size={96} />
          </button>
        ) : (
          <Avatar name={name} size={96} />
        )}
        <p className="msgs-profile-hint">This is how they see their own profile — tap the photo for the full picture.</p>
        <strong className="msgs-you-name">{name}</strong>
        <span className="msgs-you-username">{p.n2 ? `@${p.n2}` : code}</span>
        <p className="msgs-you-statusline"><span className={`msgs-dot ${st === "idle" ? "idle" : st === "online" ? "on" : "off"}`} /> {st}</p>
        {on && p.playing ? (
          <div className="msgs-playing-banner"><Gamepad2 size={15} /> <span>Playing <strong>{p.playing}</strong></span></div>
        ) : null}
        {p.bio && <p className="msgs-you-bio">{p.bio}</p>}
        <div className="msgs-profile-code">
          <KeyRound size={15} />
          <span>Code</span>
          <code className="msgs-code">{code}</code>
          <button className="outline-button msgs-icon-btn" onClick={() => { navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => undefined); }} aria-label="Copy code">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
        </div>
        <button className="msgs-invite-btn msgs-profile-save" onClick={() => eng.openDm(code)}><MessageCircle size={15} /> Message</button>
        {big && p.avatar && <Lightbox media={{ kind: "image", url: p.avatar }} onClose={() => setBig(false)} />}
      </div>
    </div>
  );
}

function NewGroup({ eng }: { eng: Engine }) {
  const { dms, self } = eng;
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [showBynCode, setShowBynCode] = useState(false);
  const [byCode, setByCode] = useState("");
  const [err, setErr] = useState("");

  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const create = () => {
    const picks = picked.map((c) => {
      const r = dms.find((x) => x.code === c);
      return { code: c, n1: r?.n1 || c, n2: r?.n2 || "" };
    });
    if (picks.length === 0 && !byCode.trim()) return setErr("Add at least one person.");
    const targets = [...picks];
    if (byCode.trim()) {
      const c = byCode.trim().toLowerCase();
      if (!USERNAME_RE.test(c)) return setErr("Usernames are 3–16 letters or numbers (no spaces).");
      if (c === self.code) return setErr("That's your own username.");
      const r = dms.find((x) => x.code === c);
      targets.push({ code: c, n1: r?.n1 || c, n2: r?.n2 || "" });
    }
    eng.createGroup(name, targets);
  };

  return (
    <div className="msgs-home">
      <header className="msgs-app-header">
        <button className="outline-button msgs-icon-btn" onClick={() => eng.setActive({ kind: "home" })} aria-label="Back"><ArrowLeft size={15} /></button>
        <div className="msgs-brand">New group</div>
      </header>
      <div className="msgs-chats">
        <div className="msgs-card">
          <strong>Create a group</strong>
          <p className="msgs-hint">Only you can add people (and kick or block them). Members are added by their username.</p>
          {err && <div className="msgs-error">{err}</div>}
          <input className="msgs-input" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus />
          <div className="msgs-members-head">Pick friends</div>
          <div className="msgs-rooms" style={{ maxWidth: 480 }}>
            {dms.map((r) => (
              <button key={r.code} className="msgs-room-card" onClick={() => toggle(r.code)}>
                <Avatar name={[r.n1, r.n2].filter(Boolean).join(" ") || r.code} size={32} />
                <div className="msgs-room-info"><strong>{[r.n1, r.n2].filter(Boolean).join(" ") || r.code}</strong><span>@{r.code}</span></div>
                {picked.includes(r.code) && <span className="msgs-badge">added</span>}
              </button>
            ))}
            {dms.length === 0 && <div className="msgs-hint">No friends yet. Add friends by username first.</div>}
          </div>

          <button className="outline-button msgs-icon-btn" onClick={() => setShowBynCode((s) => !s)}><Plus size={14} /> Add by username</button>
          {showBynCode && (
            <div className="msgs-create-btns" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <input className="msgs-input" placeholder="Their username" maxLength={16} value={byCode} onChange={(e) => setByCode(e.target.value.toLowerCase())} />
            </div>
          )}

          <div className="msgs-create-btns">
            <button className="msgs-invite-btn" onClick={create}><MessageCircle size={14} /> Create group</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* surface                                                             */
/* ------------------------------------------------------------------ */

export function MessagesSurface() {
  const eng = useMessagesEngine();

  useEffect(() => {
    if (eng.active.kind === "dm") eng.openDm(eng.active.code);
  }, [eng.active.kind === "dm" ? eng.active.code : null]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="msgs-app" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {eng.toast && <div className="msgs-toast">{eng.toast.text}</div>}
      {eng.active.kind === "home" && <Home eng={eng} />}
      {eng.active.kind === "new-chat" && <NewChat eng={eng} />}
      {eng.active.kind === "new-group" && <NewGroup eng={eng} />}
      {eng.active.kind === "profile" && <ProfileView eng={eng} />}
      {eng.active.kind === "peer" && <PeerProfileView eng={eng} code={eng.active.code} />}
      {eng.active.kind === "dm" && <Dm eng={eng} code={eng.active.code} />}
      {eng.active.kind === "group" && <GroupView eng={eng} id={eng.active.id} />}
    </div>
  );
}