import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { Check, ChevronRight, Gamepad2, Home, Loader2, Monitor, PanelsTopLeft, Play, Plus, Search, Settings, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import Peer from "peerjs";
import { PS5_GAMES, PS5_TOTAL, type Ps5Game } from "../ps5-games";
import { publishNowPlaying } from "../now-playing";
import { MessagesSurface } from "../messages";
import { VerAiSurface } from "./ver-ai";

type Tab = "home" | "featured" | "media";
type DeviceMode = "pc" | "controller";
type MediaApp = {
  id: string;
  name: string;
  publisher: string;
  icon: string;
  cover: string;
  description: string;
  /** "frame" = remote page in an iframe, "app" = a real app rendered inside the console. */
  kind: "frame" | "app";
  src?: string;
  external?: string;
};

/** Surfaces the host OS injects so the console can run its own media apps natively. */
export type Ps5EmbeddedSurfaces = {
  spotify?: ComponentType<{ onClose: () => void; onMinimize: () => void; onTrackChange: (track: { name: string; artist: string; artwork: string } | null) => void }> | null;
  verTube?: ComponentType | null;
};

const MEDIA_APPS: MediaApp[] = [
  { id: "browser", name: "Browser", publisher: "Vertex OS", kind: "frame", icon: `${import.meta.env.BASE_URL}images/endis-rest.png`, cover: `${import.meta.env.BASE_URL}images/endis-rest.png`, src: "https://endis.rest/", external: "https://endis.rest/", description: "Browse the web from the console." },
  { id: "spotify", name: "Spotify", publisher: "Spicetify", kind: "app", icon: `${import.meta.env.BASE_URL}images/spicetify.ico`, cover: `${import.meta.env.BASE_URL}images/spicetify.ico`, description: "Your music and playlists, running inside the console." },
  { id: "vertube", name: "VerTube", publisher: "Vertex OS", kind: "app", icon: `${import.meta.env.BASE_URL}images/vertube.svg`, cover: `${import.meta.env.BASE_URL}images/vertube.svg`, description: "VER-TUBE, streaming from inside the console." },
  { id: "messages", name: "Messages", publisher: "Vertex OS", kind: "app", icon: `${import.meta.env.BASE_URL}images/messages-icon.webp`, cover: `${import.meta.env.BASE_URL}images/messages-icon.webp`, description: "Your Messages chats, already signed in." },
  { id: "verai", name: "VER-AI", publisher: "Vertex OS", kind: "app", icon: `${import.meta.env.BASE_URL}images/ver-ai.ico`, cover: `${import.meta.env.BASE_URL}images/ver-ai.ico`, description: "A free AI assistant that lives on your console. No key, no sign-in, daily limit." },
];

const OWNED_KEY = "vertex-ps5-owned";
const RECENT_KEY = "vertex-ps5-recent";
const ACCOUNT_KEY = "vertex-ps5-account";
const MSGS_PROFILE_KEY = "vertex-msgs-profile-v2";

const USERNAME_RE = /^[a-z0-9]{3,16}$/;
const NAME_RE = /^.{1,20}$/;

const AVATAR_HUES = [212, 268, 330, 22, 158, 190];

type Ps5Account = { username: string; displayName: string; dob?: string; hue?: number; avatar?: string };

function readAccount(): Ps5Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const acc = JSON.parse(raw) as Ps5Account;
    if (!acc || !acc.username || !USERNAME_RE.test(acc.username) || !acc.displayName) return null;
    return acc;
  } catch {
    return null;
  }
}

function saveAccount(acc: Ps5Account) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
  } catch {
    /* ignore */
  }
}

/** The Messages app keeps its own profile; reuse it so nobody has to sign up twice. */
function accountFromMessages(): Ps5Account | null {
  try {
    const raw = localStorage.getItem(MSGS_PROFILE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as { username?: string; name?: string } | null;
    if (!profile || typeof profile !== "object") return null;
    const displayName = (profile.name ?? "").trim().slice(0, 20);
    const username = (profile.username ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
    if (!displayName || username.length < 3) return null;
    return { username, displayName };
  } catch {
    return null;
  }
}

function hasMessagesProfile(): boolean {
  return accountFromMessages() !== null;
}


function avatarStyle(hue?: number) {
  return { background: `linear-gradient(145deg, hsl(${hue ?? 212} 82% 76%), hsl(${(hue ?? 212) + 34} 62% 48%))` };
}

/** Profile picture: a custom photo when one was uploaded, otherwise the colour gradient. */
function avatarVisual(acc: { hue?: number; avatar?: string } | null | undefined): CSSProperties {
  if (acc?.avatar) {
    return { backgroundImage: `url("${acc.avatar}")`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#0d1526" };
  }
  return avatarStyle(acc?.hue ?? 212);
}

function readSet(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string");
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeArray(key: string, arr: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 60)));
  } catch {
    /* ignore */
  }
}

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const PS5_BOOT_IMG = `${import.meta.env.BASE_URL}images/ps5-boot.png`;

export function Ps5EmulatorSurface({ surfaces }: { surfaces?: Ps5EmbeddedSurfaces } = {}) {
  const [stage, setStage] = useState<"boot" | "device" | "account" | "ready">("boot");
  const [tab, setTab] = useState<Tab>("home");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("pc");
  const [account, setAccount] = useState<Ps5Account | null>(() => readAccount());
  const [owned, setOwned] = useState<string[]>(() => readSet(OWNED_KEY, []));
  const [recent, setRecent] = useState<string[]>(() => readSet(RECENT_KEY, []));
  const [playing, setPlaying] = useState<Ps5Game | null>(null);
  const [sessionSec, setSessionSec] = useState(0);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState("browser");
  const [mediaApp, setMediaApp] = useState<MediaApp | null>(null);
  const [storeSelection, setStoreSelection] = useState<Ps5Game | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<Ps5Game | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gridCount, setGridCount] = useState(40);
  const [hoverBg, setHoverBg] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const driftRef = useRef({ paused: false, dir: 1 });
  const pointerInRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);

  const ownedSet = useMemo(() => new Set(owned), [owned]);

  const collected = useMemo(() => {
    const out: Ps5Game[] = [];
    for (const g of PS5_GAMES) if (ownedSet.has(g.id)) out.push(g);
    return out;
  }, [ownedSet]);

  const installedGames = useMemo(() => {
    const out: Ps5Game[] = [];
    const seen = new Set<string>();
    for (const id of [...owned].reverse()) {
      if (seen.has(id)) continue;
      seen.add(id);
      const game = PS5_GAMES.find((item) => item.id === id);
      if (game) out.push(game);
      if (out.length >= 60) break;
    }
    return out;
  }, [owned]);

  const recentGames = useMemo(() => {
    const out: Ps5Game[] = [];
    for (const id of recent) {
      const g = PS5_GAMES.find((x) => x.id === id);
      if (g) out.push(g);
      if (out.length >= 12) break;
    }
    return out;
  }, [recent]);

  const homeGames = useMemo(() => {
    const seen = new Set<string>();
    const out: Ps5Game[] = [];
    for (const game of [...recentGames, ...installedGames]) {
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      out.push(game);
    }
    return out;
  }, [recentGames, installedGames]);

  const homeMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? homeGames.filter((g) => g.name.toLowerCase().includes(q)) : homeGames;
  }, [homeGames, query]);

  const storeGames = useMemo(() => PS5_GAMES.filter((game) => !ownedSet.has(game.id)), [ownedSet]);
  const storeMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? storeGames.filter((game) => game.name.toLowerCase().includes(q)) : storeGames;
  }, [query, storeGames]);
  const mediaMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? MEDIA_APPS.filter((app) => `${app.name} ${app.publisher}`.toLowerCase().includes(q)) : MEDIA_APPS;
  }, [query]);
  const homeHero = homeMatches.find((game) => game.id === selectedHomeId) ?? homeMatches[0] ?? null;
  const selectedMedia = MEDIA_APPS.find((app) => app.id === selectedMediaId) ?? MEDIA_APPS[0];

  const install = useCallback((id: string) => {
    setOwned((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeArray(OWNED_KEY, next);
      return next;
    });
    const g = PS5_GAMES.find((x) => x.id === id);
    if (g) setSelectedHomeId(g.id);
    setToast(`${g?.name ?? "Game"} added to Home`);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const launch = useCallback((g: Ps5Game) => {
    setSelectedHomeId(g.id);
    setRecent((prev) => {
      const next = [g.id, ...prev.filter((x) => x !== g.id)];
      writeArray(RECENT_KEY, next);
      return next;
    });
    setOwned((prev) => {
      if (prev.includes(g.id)) return prev;
      const next = [...prev, g.id];
      writeArray(OWNED_KEY, next);
      return next;
    });
    setSessionSec(0);
    setPlaying(g);
  }, []);

  const createDesktopShortcut = useCallback((game: Ps5Game) => {
    window.dispatchEvent(new CustomEvent("vertex-ps5-create-shortcut", { detail: { id: game.id, name: game.name, cover: game.cover } }));
    setStoreSelection(null);
    setToast(`${game.name} shortcut added to desktop`);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const uninstall = useCallback((game: Ps5Game) => {
    setOwned((prev) => {
      const next = prev.filter((id) => id !== game.id);
      writeArray(OWNED_KEY, next);
      return next;
    });
    setRecent((prev) => {
      const next = prev.filter((id) => id !== game.id);
      writeArray(RECENT_KEY, next);
      return next;
    });
    window.dispatchEvent(new CustomEvent("vertex-ps5-remove-shortcut", { detail: { id: game.id } }));
    if (playing?.id === game.id) setPlaying(null);
    setSelectedHomeId((id) => (id === game.id ? null : id));
    setUninstallTarget(null);
    setToast(`${game.name} uninstalled from Home`);
    window.setTimeout(() => setToast(null), 2400);
    // do NOT reload the whole page
  }, [playing]);

  const updateAccount = useCallback((next: Ps5Account) => {
    saveAccount(next);
    setAccount(next);
  }, []);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  // Freeze the slow auto-drift while the user is pointing at the row or just scrolled it.
  const holdDrift = useCallback(() => {
    pointerInRef.current = true;
    clearResumeTimer();
    driftRef.current.paused = true;
  }, [clearResumeTimer]);

  // Nudge the auto-drift back on a moment after the pointer leaves or a key ends.
  const releaseDrift = useCallback(() => {
    pointerInRef.current = false;
    clearResumeTimer();
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      if (pointerInRef.current) return;
      driftRef.current.paused = false;
    }, 1400);
  }, [clearResumeTimer]);

  const centerHomeGame = useCallback((id: string) => {
    const el = trackRef.current;
    if (!el) return;
    const node = el.querySelector<HTMLElement>(`[data-ps5-game="${id}"]`);
    if (!node) return;
    const left = node.offsetLeft;
    const width = node.offsetWidth;
    const view = el.clientWidth;
    const max = Math.max(0, el.scrollWidth - view);
    let target = el.scrollLeft;
    if (left < el.scrollLeft) target = left - 20;
    else if (left + width > el.scrollLeft + view) target = left + width - view + 20;
    target = Math.max(0, Math.min(max, target));
    if (Math.abs(target - el.scrollLeft) > 1) el.scrollTo({ left: target, behavior: "smooth" });
  }, []);

  const stepHome = useCallback((delta: number) => {
    if (!homeMatches.length) return;
    const current = homeMatches.findIndex((game) => game.id === selectedHomeId);
    const nextIndex = current < 0
      ? (delta > 0 ? 0 : homeMatches.length - 1)
      : Math.max(0, Math.min(homeMatches.length - 1, current + delta));
    const next = homeMatches[nextIndex];
    if (!next) return;
    setSelectedHomeId(next.id);
    holdDrift();
    releaseDrift();
    window.requestAnimationFrame(() => centerHomeGame(next.id));
  }, [homeMatches, selectedHomeId, centerHomeGame, holdDrift, releaseDrift]);

  const jumpHome = useCallback((edge: "first" | "last") => {
    if (!homeMatches.length) return;
    const next = edge === "first" ? homeMatches[0] : homeMatches[homeMatches.length - 1];
    if (!next) return;
    setSelectedHomeId(next.id);
    holdDrift();
    releaseDrift();
    window.requestAnimationFrame(() => centerHomeGame(next.id));
  }, [homeMatches, centerHomeGame, holdDrift, releaseDrift]);



  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [playing]);

  useEffect(() => {
    publishNowPlaying(playing ? playing.name : "");
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlaying(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  useEffect(() => {
    const handleShortcutLaunch = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const game = id ? PS5_GAMES.find((item) => item.id === id) : null;
      if (!game) return;
      if (stage === "ready") { localStorage.removeItem("vertex-ps5-launch-request"); launch(game); }
      else localStorage.setItem("vertex-ps5-launch-request", game.id);
    };
    window.addEventListener("vertex-ps5-launch-game", handleShortcutLaunch);
    return () => window.removeEventListener("vertex-ps5-launch-game", handleShortcutLaunch);
  }, [stage, launch]);

  useEffect(() => {
    if (stage !== "ready") return;
    const id = localStorage.getItem("vertex-ps5-launch-request");
    if (!id) return;
    localStorage.removeItem("vertex-ps5-launch-request");
    const game = PS5_GAMES.find((item) => item.id === id);
    if (game) launch(game);
  }, [stage, launch]);

  useEffect(() => {
    if (tab !== "featured" || !sentinelRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setGridCount((c) => Math.min(PS5_TOTAL, c + 40));
      },
      { rootMargin: "600px" },
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [tab, gridCount]);

  useEffect(() => {
    setGridCount(40);
  }, [tab, query]);

  // Slow, endless drift across the installed-games row. Pure scrollLeft writes,
  // so nothing re-renders and nothing reloads while it runs.
  useEffect(() => {
    if (stage !== "ready" || tab !== "home") return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      frame = window.requestAnimationFrame(step);
      const delta = Math.min(now - last, 64);
      last = now;
      const el = trackRef.current;
      if (!el || driftRef.current.paused) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return;
      let next = el.scrollLeft + 0.024 * delta * driftRef.current.dir;
      if (next >= max) { next = max; driftRef.current.dir = -1; }
      else if (next <= 0) { next = 0; driftRef.current.dir = 1; }
      el.scrollLeft = next;
    };
    frame = window.requestAnimationFrame(step);
    return () => { window.cancelAnimationFrame(frame); clearResumeTimer(); };
  }, [stage, tab, homeMatches.length, clearResumeTimer]);

  // Mouse wheel / trackpad scrolls the row sideways instead of the page.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      if (el.scrollLeft <= 0.5 && delta < 0) return;
      if (el.scrollLeft >= max - 0.5 && delta > 0) return;
      event.preventDefault();
      holdDrift();
      releaseDrift();
      el.scrollLeft += delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tab, stage, homeMatches.length, holdDrift, releaseDrift]);

  // Arrow keys / Home / End browse the row.
  useEffect(() => {
    if (stage !== "ready" || tab !== "home") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const node = event.target as HTMLElement | null;
      const tag = node?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node?.isContentEditable) return;
      if (playing || storeSelection || uninstallTarget || settingsOpen || !homeMatches.length) return;
      if (event.key === "ArrowRight") { event.preventDefault(); stepHome(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); stepHome(-1); }
      else if (event.key === "Home") { event.preventDefault(); jumpHome("first"); }
      else if (event.key === "End") { event.preventDefault(); jumpHome("last"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, tab, playing, storeSelection, uninstallTarget, settingsOpen, homeMatches.length, stepHome, jumpHome]);


  if (stage === "boot") {
    return (
      <div className="ps5-surface">
        <Ps5BootSurface account={account} onDone={() => setStage("device")} />
      </div>
    );
  }

  if (stage === "device") {
    return (
      <div className="ps5-surface">
        <Ps5DeviceSurface
          onSelect={(mode) => {
            setDeviceMode(mode);
            if (readAccount() || account) {
              setStage("ready");
              return;
            }
            const linked = accountFromMessages();
            if (linked) {
              saveAccount(linked);
              setAccount(linked);
              setStage("ready");
              return;
            }
            setStage("account");
          }}
        />
      </div>
    );
  }


  if (stage === "account") {
    return (
      <div className="ps5-surface">
        <Ps5AccountSurface onDone={(acc) => { setAccount(acc); setStage("ready"); }} />
      </div>
    );
  }

  return (
    <div className="ps5-surface" onMouseLeave={() => setHoverBg(null)}>
      <div
        className={`ps5-ambient ${hoverBg ? "on" : ""}`}
        style={hoverBg ? { backgroundImage: `url(${hoverBg})` } : undefined}
      />
      <div className="ps5-shell">
        <div className="ps5-main">
          <header className="ps5-top">
            <span className="ps5-top-lead" />
            <nav className="ps5-system-nav" aria-label="Console menu">
              <button type="button" className={`ps5-nav-item ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}><Home size={16} /> Home</button>
              <button type="button" className={`ps5-nav-item ${tab === "featured" ? "active" : ""}`} onClick={() => setTab("featured")}><Sparkles size={16} /> Store</button>
              <button type="button" className={`ps5-nav-item ${tab === "media" ? "active" : ""}`} onClick={() => { setTab("media"); setMediaApp(null); }}><PanelsTopLeft size={16} /> Media</button>
            </nav>
            <div className="ps5-top-actions">
              <button
                type="button"
                className={`ps5-profile-chip ${settingsOpen ? "on" : ""}`}
                onClick={() => setSettingsOpen(true)}
                title="Edit your console profile"
                aria-label="Edit your console profile"
              >
                <span className="ps5-profile-chip-avatar" style={avatarVisual(account)}>
                  {(account?.displayName ?? "P").slice(0, 1).toUpperCase()}
                </span>
                <span className="ps5-profile-chip-name">{account?.displayName ?? "Profile"}</span>
              </button>
              <button type="button" className={`ps5-gear ${settingsOpen ? "on" : ""}`} onClick={() => setSettingsOpen((open) => !open)} title="Settings" aria-label="Settings" aria-pressed={settingsOpen}>
                <Settings size={17} />
              </button>
            </div>
          </header>


      <div className="ps5-body">
        {tab === "home" && (
          <div className="ps5-home ps5-console-home">
            {homeHero ? (
              <section className="ps5-hero ps5-console-hero">
                <div className="ps5-hero-img" style={{ backgroundImage: 'url(' + homeHero.cover + ')' }} />
                <div className="ps5-hero-fade" />
                <div className="ps5-hero-content">
                  <div className="ps5-hero-tag">YOUR INSTALLED GAMES</div>
                  <h1 className="ps5-hero-title">{homeHero.name}</h1>
                  <p className="ps5-hero-sub">HTML5 game · In your collection</p>
                  <div className="ps5-hero-actions">
                    <button type="button" className="ps5-play-btn" onClick={() => launch(homeHero)}><Play size={15} fill="currentColor" /> Play</button>
                    <button
                      type="button"
                      className="ps5-hero-uninstall"
                      onClick={() => setUninstallTarget(homeHero)}
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <Trash2 size={15} /> Uninstall
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section className="ps5-home-empty">
                <div className="ps5-home-kicker">WELCOME BACK, {account?.displayName ?? "PLAYER"}</div>
                <h1>Your games will show up here</h1>
                <p>Pick a game in the Store and install it to your Home screen.</p>
                <button type="button" className="ps5-play-btn" onClick={() => setTab("featured")}>Browse Store <ChevronRight size={15} /></button>
              </section>
            )}
            <section className="ps5-row ps5-installed-row">
              <div className="ps5-row-head">
                <div><span className="ps5-home-kicker">YOUR COLLECTION</span><h2 className="ps5-row-title">Games</h2></div>
                <div className="ps5-head-tools">
                  <Ps5SearchField value={query} onChange={setQuery} placeholder="Search Home" />
                  <span className="ps5-row-count">{homeMatches.length} installed</span>
                </div>
              </div>
              {homeMatches.length ? (
                <div
                  ref={trackRef}
                  className="ps5-track ps5-installed-track"
                  tabIndex={0}
                  aria-label="Installed games — use the arrow keys to browse"
                  onMouseEnter={holdDrift}
                  onMouseLeave={releaseDrift}
                >
                  {homeMatches.map((game) => (
                    <div
                      key={game.id}
                      className="ps5-installed-cell"
                      data-ps5-game={game.id}
                    >
                      <Ps5Card game={game} selected={game.id === homeHero?.id} onHover={setHoverBg} onSelect={() => setSelectedHomeId(game.id)} />
                    </div>
                  ))}
                </div>
              ) : query ? (
                <div className="ps5-empty"><p>No installed games match “{query}”.</p></div>
              ) : null}
            </section>
          </div>
        )}

        {tab === "featured" && (
          <div className="ps5-page ps5-store-page">
            <div className="ps5-page-head ps5-store-heading">
              <div><span className="ps5-home-kicker">DISCOVER SOMETHING NEW</span><h1>PlayStation Store</h1></div>
              <div className="ps5-store-tools">
                <Ps5SearchField value={query} onChange={setQuery} placeholder="Search Store" />
                <span className="ps5-page-meta">{storeMatches.length} games</span>
              </div>
            </div>
            <p className="ps5-store-description">Choose a game to install it on Home or add a shortcut to your desktop.</p>
            {storeMatches.length ? (
              <div className="ps5-grid ps5-store-grid">
                {storeMatches.slice(0, gridCount).map((game) => (
                  <Ps5StoreCard key={game.id} game={game} onSelect={() => setStoreSelection(game)} onHover={setHoverBg} />
                ))}
              </div>
            ) : (
              <div className="ps5-empty"><p>{query ? 'No games match “' + query + '”.' : "You have installed every game in the Store."}</p></div>
            )}
            {!query && storeMatches.length > gridCount ? <div ref={sentinelRef} className="ps5-store-sentinel" /> : null}
          </div>
        )}

        {tab === "media" && (
          <div className="ps5-page ps5-media-page">
            {mediaApp ? (
              <section className="ps5-media-open">
                <div className="ps5-media-open-head">
                  <button type="button" className="ps5-back-link" onClick={() => setMediaApp(null)}><ChevronRight size={15} /> Media</button>
                  <div><span>{mediaApp.publisher}</span><h1>{mediaApp.name}</h1></div>
                  {mediaApp.external ? (
                    <a className="ps5-media-external" href={mediaApp.external} target="_blank" rel="noreferrer">Open in new tab <ChevronRight size={14} /></a>
                  ) : null}
                </div>
                <div className="ps5-media-stage">
                  {mediaApp.kind === "frame" && mediaApp.src ? (
                    <iframe className="ps5-media-embed" src={mediaApp.src} title={mediaApp.name} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
                  ) : (
                    <MediaAppStage app={mediaApp} surfaces={surfaces} onExit={() => setMediaApp(null)} />
                  )}
                </div>
              </section>
            ) : (
              <>
                <section
                  className="ps5-media-feature"
                  style={{
                    backgroundImage: selectedMedia.kind === "frame"
                      ? 'linear-gradient(90deg, rgba(4,8,18,.94), rgba(4,8,18,.53) 58%, rgba(4,8,18,.16)), url(' + selectedMedia.cover + ')'
                      : 'linear-gradient(115deg, rgba(12,22,44,.96), rgba(6,11,23,.86) 62%, rgba(14,26,52,.7))',
                  }}
                >
                  <div className="ps5-media-feature-copy">
                    <span className="ps5-home-kicker">MEDIA · {selectedMedia.publisher}</span>
                    <span className="ps5-media-feature-icon"><img src={selectedMedia.icon} alt="" /></span>
                    <h1>{selectedMedia.name}</h1>
                    <p>{selectedMedia.description}</p>
                    <button type="button" className="ps5-play-btn" onClick={() => setMediaApp(selectedMedia)}><Play size={15} fill="currentColor" /> Open {selectedMedia.name}</button>
                  </div>
                </section>
                <div className="ps5-media-content">
                  <section className="ps5-row ps5-media-apps">
                    <div className="ps5-row-head">
                      <div><span className="ps5-home-kicker">YOUR APPS</span><h2 className="ps5-row-title">Media</h2></div>
                      <div className="ps5-head-tools">
                        <Ps5SearchField value={query} onChange={setQuery} placeholder="Search Media" />
                        <span className="ps5-row-count">{mediaMatches.length} apps</span>
                      </div>
                    </div>
                    <div className="ps5-track ps5-media-track">
                      {mediaMatches.map((app) => (
                        <button type="button" key={app.id} className={'ps5-media-card ' + (selectedMediaId === app.id ? "selected" : "")} onClick={() => setSelectedMediaId(app.id)} onMouseEnter={() => { setSelectedMediaId(app.id); setHoverBg(app.kind === "frame" ? app.cover : null); }}>
                          <span className="ps5-media-icon"><img src={app.icon} alt="" loading="lazy" /></span>
                          <span className="ps5-media-card-name">{app.name}</span>
                          <span className="ps5-media-card-publisher">{app.publisher}</span>
                          <span className="ps5-media-open-label">Open <ChevronRight size={13} /></span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>
      </div>
      {settingsOpen ? (
        <Ps5SettingsPanel
          account={account}
          deviceMode={deviceMode}
          installedCount={collected.length}
          recentCount={recentGames.length}
          onDeviceMode={setDeviceMode}
          onUpdate={updateAccount}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {uninstallTarget ? (
        <div className="ps5-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setUninstallTarget(null); }}>
          <section className="ps5-game-dialog ps5-uninstall-dialog" role="dialog" aria-modal="true" aria-labelledby="ps5-uninstall-title">
            <button type="button" className="ps5-dialog-close" onClick={() => setUninstallTarget(null)} aria-label="Close"><X size={18} /></button>
            <img className="ps5-dialog-cover" src={uninstallTarget.cover} alt="" />
            <div className="ps5-dialog-copy">
              <span className="ps5-home-kicker">UNINSTALL</span>
              <h2 id="ps5-uninstall-title">{uninstallTarget.name}</h2>
              <p>This removes the game from your console Home screen and deletes its desktop shortcut. You can download it again from the Store at any time.</p>
              <div className="ps5-dialog-actions">
                <button type="button" className="ps5-dialog-secondary" onClick={() => setUninstallTarget(null)}>Keep installed</button>
                <button
                  type="button"
                  className="ps5-dialog-danger"
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onClick={() => { if (uninstallTarget) uninstall(uninstallTarget); }}
                ><Trash2 size={15} /> Uninstall</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {storeSelection ? (
        <div className="ps5-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setStoreSelection(null); }}>
          <section className="ps5-game-dialog" role="dialog" aria-modal="true" aria-labelledby="ps5-game-dialog-title">
            <button type="button" className="ps5-dialog-close" onClick={() => setStoreSelection(null)} aria-label="Close"><X size={18} /></button>
            <img className="ps5-dialog-cover" src={storeSelection.cover} alt="" />
            <div className="ps5-dialog-copy">
              <span className="ps5-home-kicker">FREE HTML5 GAME</span>
              <h2 id="ps5-game-dialog-title">{storeSelection.name}</h2>
              <p>Choose where to add this game. Installed games appear together on Home.</p>
              <div className="ps5-dialog-actions">
                <button type="button" className="ps5-play-btn" onClick={() => { install(storeSelection.id); setStoreSelection(null); }}><Plus size={15} /> Download to Home</button>
                <button type="button" className="ps5-dialog-secondary" onClick={() => createDesktopShortcut(storeSelection)}><PanelsTopLeft size={15} /> Create desktop shortcut</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {toast ? <div className="ps5-toast"><Check size={15} /> {toast}</div> : null}

      {playing ? (
        <div className="ps5-session">
          <div className="ps5-session-head">
            <div>
              <div className="ps5-session-badge">NOW PLAYING</div>
              <div className="ps5-session-title">{playing.name}</div>
            </div>
            <div className="ps5-session-right">
              <span className="ps5-session-time">{fmtTime(sessionSec)}</span>
              <button type="button" className="ps5-close-btn" onClick={() => setPlaying(null)}>
                <X size={15} /> Close Game
              </button>
            </div>
          </div>
          <div className="ps5-session-frame">
            <GameFrame key={playing.id} game={playing} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Ps5BootSurface({ account, onDone }: { account: Ps5Account | null; onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const firedRef = useRef(false);

  useEffect(() => {
    const doneTimer = window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDoneRef.current();
    }, 3400);
    return () => window.clearTimeout(doneTimer);
  }, []);

  const skipIntro = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onDoneRef.current();
  };

  return (
    <div className="ps5-boot">
      <div className="ps5-boot-glow" aria-hidden="true" />
      <div className="ps5-boot-orbit ps5-boot-orbit-one" aria-hidden="true" />
      <div className="ps5-boot-orbit ps5-boot-orbit-two" aria-hidden="true" />
      <div className="ps5-boot-inner">
        <img className="ps5-boot-logo" src={PS5_BOOT_IMG} alt="PlayStation 5" draggable={false} />
        <div className="ps5-boot-returning">
          <span>{account ? "Welcome back" : "Welcome to PlayStation"}</span>
          {account ? <strong>{account.displayName}</strong> : <strong>Vertex Player</strong>}
          {account ? <div className="ps5-boot-avatar" style={avatarVisual(account)}>{account.displayName.slice(0, 1).toUpperCase()}</div> : null}
        </div>
        <div className="ps5-boot-loader" aria-hidden="true"><span /></div>
        <div className="ps5-boot-caption">Your games. Your world.</div>
      </div>
      <button type="button" className="ps5-boot-skip" onClick={skipIntro}>Skip intro <ChevronRight size={14} /></button>
    </div>
  );
}

function Ps5DeviceSurface({ onSelect }: { onSelect: (mode: DeviceMode) => void }) {
  return (
    <div className="ps5-device-screen">
      <div className="ps5-device-card">
        <span className="ps5-home-kicker">QUICK SETUP</span>
        <h1>What are you playing on?</h1>
        <p>Choose how you want to control games this session.</p>
        <div className="ps5-device-options">
          <button type="button" onClick={() => onSelect("pc")}>
            <span className="ps5-device-icon"><PanelsTopLeft size={28} /></span>
            <strong>PC / Normal</strong>
            <small>Keyboard and mouse</small>
          </button>
          <button type="button" onClick={() => onSelect("controller")}>
            <span className="ps5-device-icon"><Gamepad2 size={29} /></span>
            <strong>Controller</strong>
            <small>Use a connected gamepad</small>
          </button>
        </div>
      </div>
    </div>
  );
}

function Ps5AccountSurface({ onDone }: { onDone: (acc: Ps5Account) => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dob, setDob] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "taken">("idle");
  const [checking, setChecking] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const claimRef = useRef<Peer | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; try { claimRef.current?.destroy(); } catch { /* noop */ } }, []);

  const submit = () => {
    const u = username.trim().toLowerCase();
    const n = displayName.trim();
    if (!USERNAME_RE.test(u)) return setErr("Username: 3–16 letters or numbers, no spaces.");
    if (!NAME_RE.test(n) || !n.trim()) return setErr("Pick a display name (up to 20 characters).");
    if (status !== "idle" && status !== "taken") return;
    setErr("");
    setChecking(true);
    setStatus("checking");

    if (claimRef.current) { try { claimRef.current.destroy(); } catch { /* noop */ } }
    const claim = new Peer(`vertex-u-${u}`, { debug: 0 });
    claimRef.current = claim;
    const finish = (ok: boolean, reason = "") => {
      if (cancelledRef.current) return;
      setChecking(false);
      if (!ok) { setStatus("taken"); setErr(`@${u} is already taken — pick another username.`); try { claim.destroy(); } catch { /* noop */ } return; }
      setStatus("idle");
      try { claim.destroy(); } catch { /* noop */ }
      const acc: Ps5Account = { username: u, displayName: n.slice(0, 20), dob: dob || undefined };
      try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc)); } catch { /* noop */ }
      window.setTimeout(() => onDoneRef.current(acc), 400);
    };
    claim.on("open", () => finish(true, ""));
    claim.on("error", (e) => {
      if (cancelledRef.current) return;
      if (e.type === "unavailable-id") return finish(false, "taken");
      finish(true, "");
    });
  };

  return (
    <div className="ps5-account">
      <div className="ps5-account-glow" aria-hidden="true" />
      <div className="ps5-account-card">
        <span className="ps5-account-badge">VERTEX-OS PRESENTS :</span>
        <h1 className="ps5-account-title">Create your account</h1>
        <p className="ps5-account-sub">One account for your console profile. Your username is unique, your display name is shown on the console.</p>
        {err && <div className="ps5-account-err">{err}</div>}
        <label className="ps5-account-field"><span>Username</span>
          <div className="ps5-account-prefix">
            <span>@</span>
            <input className="ps5-account-input" placeholder="onirifalx" maxLength={16} value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setStatus("idle"); }} aria-label="Username" autoFocus spellCheck={false} />
          </div>
          <em>3–16 letters or numbers · unique — no one else can take it</em>
        </label>
        <label className="ps5-account-field"><span>Display name</span>
          <input className="ps5-account-input" placeholder="How the console shows you" maxLength={20} value={displayName} onChange={(e) => setDisplayName(e.target.value)} aria-label="Display name" spellCheck={false} />
          <em>Shown on the console only.</em>
        </label>
        <label className="ps5-account-field"><span>Date of birth (optional)</span>
          <input className="ps5-account-input" type="date" max={new Date().toISOString().slice(0, 10)} value={dob} onChange={(e) => setDob(e.target.value)} aria-label="Date of birth" />
          <em>No age restrictions — just for your profile</em>
        </label>
        <button type="button" className="ps5-account-btn" onClick={submit} disabled={checking}>
          {checking ? <><Loader2 size={15} className="ps5-spin" /> Checking availability…</> : status === "taken" ? <><UserPlus size={15} /> Try another username</> : <><Check size={15} /> Create account</>}
        </button>
        <p className="ps5-account-note">Your username is your console ID — nobody else can claim it. Change your display name any time from console Settings.</p>
      </div>
    </div>
  );
}

const JS_DELIVR_DIV = /cdn\.jsdelivr\.net\/gh\//i;

type RewriteCtx = {
  bannedUsers: Set<string>;
  branchFor?: (user: string, repo: string) => string | null;
};

function sanitizeBannedUrls(html: string, bannedUsers: Set<string>): string {
  // Rewrite cdn.jsdelivr.net/gh/{user}/{repo}@{ref}/{path} -> raw.githack.com/{user}/{repo}/{branchOrCommit}/{path}
  // for accounts that jsDelivr has banned (403). githack serves the SAME live GitHub
  // content with correct MIME + CORS and has no account bans, so any pinned commit
  // SHA, branch name, or @latest (-> /main/) resolves. Non-banned URLs pass through.
  return html.replace(
    /https?:\/\/cdn\.jsdelivr\.net\/gh\/([a-z0-9A-Z-]+)\/([^/@\s]+?)(?:@([^/@\s]+?))?(\/[^"'<>\s]*)?/g,
    (whole, user, repo, ref, path) => {
      if (!bannedUsers.has(user)) return whole; // keep jsDelivr (faster) for healthy accounts
      const branch = !ref || ref === "latest" ? "main" : ref;
      return `https://raw.githack.com/${user}/${repo}/${branch}${path ?? ""}`;
    }
  );
}

// Account-level jsDelivr bans (all repos alive on GitHub @ main). Keeping this list
// small & authoritative; anything not listed still uses fast jsDelivr.
const JS_DELIVR_BANNED_USERS = new Set([
  "genizy",
  "web-ports",
  "waycrosspublicmedia",
  "gn-math",
  "Stinkalistic",
  "67-Factory",
  "slqntdevss",
  "aukak",
  "Pixelsuft",
  "NotRexed",
  "WhoIsEv",
  "R74nCom",
  "New25Said",
  "faralong",
]);

function neutralizeBootKillers(html: string): string {
  // Blob iframes can't register a service worker (SecurityError → frozen boot),
  // and ad/tracker tags (gtag/adsbygoogle) hang on strict school networks.
  // Strip them so games actually boot to the playable loader.
  html = html.replace(
    /<script[^>]*>(?:[\s\S]*?)(?:navigator\.serviceWorker\.register|ServiceWorkerContainer)(?:[\s\S]*?)<\/script>/gi,
    "<!-- sw stripped -->"
  );
  html = html.replace(/\bnavigator\.serviceWorker\.register\s*\([^;]*?\)\s*;?/g, "/* sw register removed */");
  html = html.replace(
    /<script[^>]*\bsrc=["'][^"']*(?:google-analytics\.com|googletagmanager\.com|pagead2\.googlesyndication\.com|adsbygoogle\.js|doubleclick\.net)[^"']*["'][^>]*><\/script>/gi,
    "<!-- ad/tracker script removed -->"
  );
  html = html.replace(
    /\b(?:gtag|ga)\s*\(\s*['"]js['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;?\s*\n?/g,
    "/* analytics removed */"
  );
  html = html.replace(/\b(?:adsbygoogle|push)\s*=\s*\w*\(\)\s*;?/g, "/* ads off */");
  return html;
}

const INLINEABLE_GAME_HOSTS = new Set(["cdn.jsdelivr.net", "raw.githack.com", "rawcdn.githack.com", "raw.githubusercontent.com", "script.googleusercontent.com", "firebasestorage.googleapis.com"]);

function canInlineGame(src: string): boolean {
  try { return INLINEABLE_GAME_HOSTS.has(new URL(src).hostname); } catch { return false; }
}

function GameFrame({ game }: { game: Ps5Game }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [src, setSrc] = useState<string | null>(null);
  const [direct, setDirect] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!canInlineGame(game.play)) {
      setState("ready");
      setDirect(true);
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objUrl: string | null = null;
    setState("loading");
    setSrc(null);
    setDirect(false);

    (async () => {
      try {
        const res = await fetch(game.play, { mode: "cors" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let html = await res.text();
        html = html.replace(/^\uFEFF/, "");
        html = neutralizeBootKillers(html);
        html = sanitizeBannedUrls(html, JS_DELIVR_BANNED_USERS);
        if (!/<base\s/i.test(html)) {
          const headIdx = html.search(/<head[^>]*>/i);
          if (headIdx >= 0) {
            const end = html.indexOf(">", headIdx);
            const baseUrl = game.play.slice(0, game.play.lastIndexOf("/") + 1);
            html = html.slice(0, end + 1) + `<base href="${baseUrl}" />` + html.slice(end + 1);
          } else {
            html = `<head><base href="${game.play.slice(0, game.play.lastIndexOf("/") + 1)}" /></head>` + html;
          }
        }
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        objUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objUrl);
      } catch (err) {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [game.play, attempt]);

  if (state === "error") {
    return (
      <div className="ps5-game-msg">
        <div className="ps5-game-msg-title">Couldn&apos;t start this game</div>
        <button type="button" className="ps5-ghost-btn" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="ps5-game-wrap">
      {!src ? (
        <div className="ps5-game-msg">
          <div className="ps5-spinner" />
          <div className="ps5-game-msg-title">Booting {game.name}...</div>
        </div>
      ) : null}
      {src || direct ? (
        <iframe
          className="ps5-game-frame"
          src={direct ? game.play : src ?? undefined}
          title={game.name}
          allow="autoplay; clipboard-write; camera; microphone; fullscreen; gamepad; encrypted-media"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      ) : null}
    </div>
  );
}

function Ps5Card({ game, onHover, onSelect, selected = false }: { game: Ps5Game; onHover?: (cover: string | null) => void; onSelect?: () => void; selected?: boolean }) {
  return (
    <button
      type="button"
      className={`ps5-card ${selected ? "selected" : ""}`}
      onClick={() => onSelect?.()}
      title={`Play ${game.name}`}
      onMouseEnter={() => { onHover?.(game.cover); onSelect?.(); }}
      onMouseLeave={() => onHover?.(null)}
      aria-pressed={selected}
    >
      <img className="ps5-card-img" src={game.cover} alt={game.name} loading="lazy" draggable={false} />
      <span className="ps5-card-name">{game.name}</span>
      <span className="ps5-card-publisher">Vertex game collection</span>
      <span className="ps5-card-open">Play <ChevronRight size={13} /></span>
    </button>
  );
}

function Ps5SearchField({ value, onChange, placeholder }: { value: string; onChange: (next: string) => void; placeholder: string }) {
  return (
    <div className="ps5-search-bar">
      <Search size={17} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value ? <button type="button" className="ps5-search-clear" onClick={() => onChange("")} aria-label="Clear search"><X size={15} /></button> : null}
    </div>
  );
}

/** Renders the real in-OS app (Spicetify / VerTube / Messages) inside the console. */
function MediaAppStage({ app, surfaces, onExit }: { app: MediaApp; surfaces?: Ps5EmbeddedSurfaces; onExit: () => void }) {
  if (app.id === "spotify") {
    if (!surfaces?.spotify) return <MediaAppMissing name={app.name} />;
    const Spotify = surfaces.spotify;
    return (
      <div className="ps5-media-app">
        <Spotify onClose={onExit} onMinimize={onExit} onTrackChange={() => {}} />
      </div>
    );
  }
  if (app.id === "vertube") {
    if (!surfaces?.verTube) return <MediaAppMissing name={app.name} />;
    const VerTube = surfaces.verTube;
    return (
      <div className="ps5-media-app">
        <VerTube />
      </div>
    );
  }
  if (app.id === "messages") {
    return (
      <div className="ps5-media-app">
        <MessagesSurface />
      </div>
    );
  }
  if (app.id === "verai") {
    return (
      <div className="ps5-media-app">
        <VerAiSurface />
      </div>
    );
  }
  return <MediaAppMissing name={app.name} />;
}

function MediaAppMissing({ name }: { name: string }) {
  return (
    <div className="ps5-game-msg">
      <div className="ps5-game-msg-title">{name} isn&apos;t available right now</div>
      <p className="ps5-media-missing-copy">Open the console from the desktop so the app can start.</p>
    </div>
  );
}

function Ps5SettingsPanel({
  account,
  deviceMode,
  installedCount,
  recentCount,
  onDeviceMode,
  onUpdate,
  onClose,
}: {
  account: Ps5Account | null;
  deviceMode: DeviceMode;
  installedCount: number;
  recentCount: number;
  onDeviceMode: (mode: DeviceMode) => void;
  onUpdate: (next: Ps5Account) => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [hue, setHue] = useState(account?.hue ?? 212);
  const [avatar, setAvatar] = useState<string | undefined>(account?.avatar);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDisplayName(account?.displayName ?? "");
    setUsername(account?.username ?? "");
    setHue(account?.hue ?? 212);
    setAvatar(account?.avatar);
    setError("");
  }, [account]);

  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const userError = !cleanUser ? "Pick a username." : !USERNAME_RE.test(cleanUser) ? "3 to 16 letters or numbers, no spaces." : "";
  const nameError = !displayName.trim() ? "Your display name can't be empty." : "";
  const draft = { hue, avatar };

  const dirty =
    !!account &&
    (displayName.trim() !== account.displayName ||
      cleanUser !== account.username ||
      hue !== (account.hue ?? 212) ||
      (avatar ?? "") !== (account.avatar ?? ""));

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("Pick an image under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError("That image could not be read.");
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setError("That image could not be read.");
      img.onload = () => {
        const size = 192;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        setAvatar(canvas.toDataURL("image/jpeg", 0.86));
        setError("");
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!account) return;
    if (userError || nameError) {
      setError(userError || nameError);
      return;
    }
    onUpdate({ ...account, displayName: displayName.trim().slice(0, 20), username: cleanUser, hue, avatar });
    setError("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="ps5-settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ps5-settings-panel" role="dialog" aria-modal="true" aria-labelledby="ps5-settings-title">
        <header className="ps5-settings-head">
          <div>
            <span className="ps5-home-kicker">CONSOLE SETTINGS</span>
            <h2 id="ps5-settings-title">Profile &amp; device</h2>
          </div>
          <button type="button" className="ps5-dialog-close" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
        </header>

        <div className="ps5-settings-body">
          <div className="ps5-settings-profile">
            <span className="ps5-settings-avatar" style={avatarVisual(draft)}>{(displayName || account?.displayName || "P").slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName || account?.displayName || "Player"}</strong>
              <span>@{username || account?.username || "guest"}</span>
            </div>
          </div>

          <div className="ps5-settings-field">
            <span>Profile photo</span>
            <div className="ps5-settings-photo">
              <button type="button" className="ps5-settings-photo-btn" onClick={() => fileRef.current?.click()}>
                <UserPlus size={15} /> {avatar ? "Replace photo" : "Upload a photo"}
              </button>
              {avatar ? (
                <button type="button" className="ps5-settings-photo-clear" onClick={() => setAvatar(undefined)}>
                  <X size={15} /> Use colour
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="ps5-settings-file"
                onChange={(event) => {
                  pickPhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            <em>Square images look best. This stays on your console only.</em>
          </div>

          <label className="ps5-settings-field">
            <span>Display name</span>
            <input value={displayName} maxLength={20} onChange={(e) => { setDisplayName(e.target.value); setError(""); }} aria-label="Display name" spellCheck={false} />
            <em>Shown on the console only.</em>
          </label>

          <label className="ps5-settings-field">
            <span>Username</span>
            <input
              value={username}
              maxLength={16}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              aria-label="Console username"
              spellCheck={false}
              className={userError && username !== account?.username ? "bad" : ""}
            />
            <em>3 to 16 letters or numbers.</em>
          </label>

          <div className="ps5-settings-field">
            <span>Avatar colour</span>
            <div className="ps5-settings-swatches">
              {AVATAR_HUES.map((option) => (
                <button key={option} type="button" className={`ps5-settings-swatch ${hue === option && !avatar ? "on" : ""}`} style={avatarStyle(option)} onClick={() => setHue(option)} aria-label={`Avatar colour ${option}`} aria-pressed={hue === option} />
              ))}
            </div>
            <em>Your console profile picture colour.</em>
          </div>

          {account?.dob ? (
            <div className="ps5-settings-field">
              <span>Date of birth</span>
              <p className="ps5-settings-static">{account.dob}</p>
            </div>
          ) : null}

          <div className="ps5-settings-field">
            <span>Controller mode</span>
            <div className="ps5-settings-modes">
              <button type="button" className={deviceMode === "pc" ? "on" : ""} onClick={() => onDeviceMode("pc")}><Monitor size={15} /> PC / Normal</button>
              <button type="button" className={deviceMode === "controller" ? "on" : ""} onClick={() => onDeviceMode("controller")}><Gamepad2 size={15} /> Controller</button>
            </div>
            <em>How games respond to input this session.</em>
          </div>

          <div className="ps5-settings-field">
            <span>Library</span>
            <div className="ps5-me-stats">
              <span>{installedCount} installed</span>
              <span>{recentCount} recently played</span>
            </div>
          </div>

          <p className="ps5-settings-note">These settings only change the PS5 emulator profile.{hasMessagesProfile() ? " Your Messages app account stays exactly as it is." : ""}</p>

          {error ? <p className="ps5-settings-error">{error}</p> : null}

          <div className="ps5-dialog-actions">
            <button type="button" className="ps5-dialog-secondary" onClick={onClose}>Close</button>
            <button type="button" className="ps5-play-btn" onClick={save} disabled={!dirty}>
              {saved ? <><Check size={15} /> Saved</> : <><Check size={15} /> Save changes</>}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Ps5StoreCard({ game, onSelect, onHover }: { game: Ps5Game; onSelect: () => void; onHover?: (cover: string | null) => void }) {
  return (
    <button type="button" className="ps5-card ps5-store-card-main" onClick={onSelect} title={`View ${game.name} options`} onMouseEnter={() => onHover?.(game.cover)} onMouseLeave={() => onHover?.(null)}>
      <img className="ps5-card-img" src={game.cover} alt={game.name} loading="lazy" draggable={false} />
      <span className="ps5-card-name">{game.name}</span>
      <span className="ps5-store-open">View options <ChevronRight size={13} /></span>
    </button>
  );
}
