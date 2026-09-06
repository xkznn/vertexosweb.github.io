import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive, ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronRight, CircleHelp,
  Cloud, Code2, Compass, Cpu, FileStack, FolderOpen, Gamepad2, Grid2X2,
  Image, LayoutGrid, LockKeyhole, Maximize2, Menu, Minus, MonitorCog, Music2,
  Play, Power, Radio, RotateCcw, Send,
  Settings2, ShieldCheck, Sparkles, Terminal, Upload, Volume2, X, Zap,
} from "lucide-react";

type WallpaperId = "singularity" | "neon-city" | "orbit-drift" | "quiet-signal";
type LanguageCode = "en" | "es" | "ar";
type AppId = "hub" | "archive" | "pulse" | "browser" | "settings" | "games" | "terminal" | "ciri";
type WindowState = { id: AppId; minimized: boolean };

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const asset = (path: string) => `${base}${path}`;

const wallpapers: { id: WallpaperId; name: string; meta: string; src: string; video?: string }[] = [
  { id: "singularity", name: "Singularity", meta: "Deep space / clean", src: asset("wallpapers/singularity.jpg"), video: asset("videos/BlackHole.mp4") },
  { id: "neon-city", name: "Neon City", meta: "Urban / midnight", src: asset("wallpapers/neon-city.jpg") },
  { id: "orbit-drift", name: "Orbit Drift", meta: "Deep space / signal", src: asset("wallpapers/orbit-drift.jpg") },
  { id: "quiet-signal", name: "Quiet Signal", meta: "Aurora / refuge", src: asset("wallpapers/quiet-signal.jpg") },
];
type Wallpaper = (typeof wallpapers)[number];

const apps: { id: AppId; title: string; subtitle: string; icon: LucideIcon; pinned?: boolean }[] = [
  { id: "hub", title: "Vertex-Hub", subtitle: "media relay", icon: Sparkles, pinned: true },
  { id: "pulse", title: "Pulse", subtitle: "audio stream", icon: Music2, pinned: true },
  { id: "archive", title: "Archive", subtitle: "library vault", icon: Archive, pinned: true },
  { id: "browser", title: "Vertex-Web", subtitle: "secure browser", icon: Compass, pinned: true },
  { id: "settings", title: "Config", subtitle: "system control", icon: Settings2, pinned: true },
  { id: "games", title: "Game Deck", subtitle: "play space", icon: Gamepad2 },
  { id: "terminal", title: "Terminal", subtitle: "command line", icon: Terminal },
  { id: "ciri", title: "Ciri", subtitle: "assistant", icon: Bot },
];

const storage = {
  read<T>(key: string, fallback: T): T {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) as T : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* session still works */ }
  },
};

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function localeFor(language: LanguageCode) {
  return language === "es" ? "es-ES" : language === "ar" ? "ar" : "en-US";
}

function formatDate(date: Date, language: LanguageCode) {
  return date.toLocaleDateString(localeFor(language), { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
}

const translations: Record<LanguageCode, {
  languageName: string;
  bootSub: string;
  enter: string;
  initializing: string;
  hint: string;
  establishing: string;
  lockHelp: string;
  runtime: string;
  jumpBack: string;
  quickPlay: string;
  systemStatus: string;
  gameDeck: string;
  libraryReady: string;
  playing: string;
  notPlaying: string;
  systemAudio: string;
  vertexPulse: string;
  updateLog: string;
  latestPatches: string;
  searchVertex: string;
  pinned: string;
  administrator: string;
  searchApps: string;
}> = {
  en: {
    languageName: "English", bootSub: "Vertex-Hub software // presentation build 3.0", enter: "Enter Vertex",
    initializing: "Initializing", hint: "Press Enter twice to skip sequence", establishing: "Establishing visual relay...",
    lockHelp: "Click or tap anywhere to unlock workspace", runtime: "Vertex runtime / online", jumpBack: "Jump back in",
    quickPlay: "Quick play", systemStatus: "System status", gameDeck: "Game Deck", libraryReady: "Library ready",
    playing: "Signal / playing", notPlaying: "Not Playing", systemAudio: "System Audio", vertexPulse: "Vertex Pulse",
    updateLog: "Update Log", latestPatches: "View latest patches", searchVertex: "Search Vertex...", pinned: "PINNED",
    administrator: "Administrator", searchApps: "Search apps...",
  },
  es: {
    languageName: "Español", bootSub: "Software Vertex-Hub // compilación de presentación 3.0", enter: "Entrar a Vertex",
    initializing: "Iniciando", hint: "Pulsa Enter dos veces para omitir la secuencia", establishing: "Estableciendo enlace visual...",
    lockHelp: "Haz clic o toca cualquier lugar para desbloquear el espacio", runtime: "Sistema Vertex / en línea", jumpBack: "Volver a entrar",
    quickPlay: "Reproducción rápida", systemStatus: "Estado del sistema", gameDeck: "Mazo de juegos", libraryReady: "Biblioteca lista",
    playing: "Señal / reproduciendo", notPlaying: "No reproduciendo", systemAudio: "Audio del sistema", vertexPulse: "Vertex Pulse",
    updateLog: "Registro de actualizaciones", latestPatches: "Ver últimos cambios", searchVertex: "Buscar en Vertex...", pinned: "FIJADOS",
    administrator: "Administrador", searchApps: "Buscar aplicaciones...",
  },
  ar: {
    languageName: "العربية", bootSub: "برامج Vertex-Hub // إصدار العرض 3.0", enter: "الدخول إلى Vertex",
    initializing: "جارٍ البدء", hint: "اضغط Enter مرتين لتخطي التسلسل", establishing: "جارٍ إنشاء الاتصال المرئي...",
    lockHelp: "انقر أو المس أي مكان لفتح مساحة العمل", runtime: "نظام Vertex / متصل", jumpBack: "العودة إلى المساحة",
    quickPlay: "تشغيل سريع", systemStatus: "حالة النظام", gameDeck: "مكتبة الألعاب", libraryReady: "المكتبة جاهزة",
    playing: "الإشارة / قيد التشغيل", notPlaying: "لا يوجد تشغيل", systemAudio: "صوت النظام", vertexPulse: "Vertex Pulse",
    updateLog: "سجل التحديثات", latestPatches: "عرض آخر التحديثات", searchVertex: "البحث في Vertex...", pinned: "مثبت",
    administrator: "المسؤول", searchApps: "البحث في التطبيقات...",
  },
};

const languageOptions: { code: LanguageCode; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "ar", label: "Arabic", native: "العربية" },
];

function BrandMark() {
  return <span className="brand-mark"><span className="brand-glyph"><span /></span><span>Vertex Systems</span></span>;
}

function AppIcon({ app, size = 21 }: { app: typeof apps[number]; size?: number }) {
  const Icon = app.icon;
  return <Icon size={size} strokeWidth={1.55} />;
}

function App() {
  const [phase, setPhase] = useState<"boot" | "lock" | "desktop">("boot");
  const [booting, setBooting] = useState(false);
  const [mobileWarning, setMobileWarning] = useState(() => window.innerWidth < 760);
  const [now, setNow] = useState(() => new Date());
  const [language, setLanguage] = useState<LanguageCode>(() => storage.read("vertex-language", "en"));
  const [languageOpen, setLanguageOpen] = useState(() => !storage.read("vertex-language-set", false));
  const [wallpaper, setWallpaper] = useState<WallpaperId>(() => storage.read("vertex-wallpaper-v2", "singularity"));
  const [lockWallpaper, setLockWallpaper] = useState<WallpaperId>(() => storage.read("vertex-lock-wallpaper-v2", "singularity"));
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaperTarget, setWallpaperTarget] = useState<"both" | "home" | "lock">("both");
  const [loopWallpaper, setLoopWallpaper] = useState(() => storage.read("vertex-loop", false));
  const [startOpen, setStartOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerQuery, setDrawerQuery] = useState("");
  const [startQuery, setStartQuery] = useState("");
  const [largeIcons, setLargeIcons] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [activeWindow, setActiveWindow] = useState<AppId | null>(null);
  const [settings, setSettings] = useState(() => storage.read("vertex-settings", { optimized: false, fastBoot: false, idleLock: false, confirm: false, cloak: "none", panicKey: "`" }));
  const [updateOpen, setUpdateOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [toasts, setToasts] = useState<{ id: number; title: string; copy: string }[]>([]);
  const [mediaHidden, setMediaHidden] = useState(false);
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [ciriOpen, setCiriOpen] = useState(false);
  const [chat, setChat] = useState<{ role: "assistant" | "user"; text: string }[]>([
    { role: "assistant", text: "Ciri online. I can help you navigate the Vertex workspace, tune the display, or find a signal in your archive." },
  ]);
  const [chatInput, setChatInput] = useState("");

  const activeWallpaper = wallpapers.find((item) => item.id === wallpaper) ?? wallpapers[0];
  const activeLockWallpaper = wallpapers.find((item) => item.id === lockWallpaper) ?? wallpapers[1];
  const ui = translations[language];
  const filteredApps = useMemo(() => apps.filter((app) => app.title.toLowerCase().includes(drawerQuery.toLowerCase())), [drawerQuery]);
  const pinnedApps = useMemo(() => apps.filter((app) => app.pinned && app.title.toLowerCase().includes(startQuery.toLowerCase())), [startQuery]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === "boot" && event.key === "Enter") {
        if (booting) return;
        beginBoot();
      }
      if (event.key === "Escape") {
        setContextMenu(null);
        setStartOpen(false);
        setDrawerOpen(false);
      }
      if (phase === "desktop" && settings.panicKey && event.key.toLowerCase() === settings.panicKey.toLowerCase()) {
        setPhase("lock");
        addToast("Workspace secured", "Panic key engaged. Click the lock screen to resume.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (phase !== "desktop" || !settings.idleLock) return;
    let timer = 0;
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(() => setPhase("lock"), 180000); };
    reset();
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    return () => { window.clearTimeout(timer); window.removeEventListener("mousemove", reset); window.removeEventListener("keydown", reset); };
  }, [phase, settings.idleLock]);

  function addToast(title: string, copy: string) {
    const id = Date.now();
    setToasts((items) => [...items, { id, title, copy }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }

  function chooseLanguage(next: LanguageCode) {
    setLanguage(next);
    storage.write("vertex-language", next);
    storage.write("vertex-language-set", true);
    setLanguageOpen(false);
  }

  function beginBoot() {
    if (phase !== "boot" || booting) return;
    if (settings.fastBoot) { setPhase("lock"); return; }
    setBooting(true);
    window.setTimeout(() => { setBooting(false); setPhase("lock"); }, 1350);
  }

  function unlock() {
    if (phase !== "lock") return;
    setPhase("desktop");
    addToast("Welcome to Vertex-OS", "Workspace restored. Open Config to tune your environment.");
  }

  function updateSetting(key: keyof typeof settings, value: boolean | string) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    storage.write("vertex-settings", next);
  }

  function chooseWallpaper(id: WallpaperId) {
    if (wallpaperTarget === "both" || wallpaperTarget === "home") {
      setWallpaper(id);
      storage.write("vertex-wallpaper-v2", id);
    }
    if (wallpaperTarget === "both" || wallpaperTarget === "lock") {
      setLockWallpaper(id);
      storage.write("vertex-lock-wallpaper-v2", id);
    }
    addToast("Wallpaper updated", `${wallpapers.find((item) => item.id === id)?.name} is now active.`);
  }

  function toggleApp(id: AppId) {
    if (id === "ciri") { setCiriOpen(true); setStartOpen(false); setDrawerOpen(false); return; }
    setStartOpen(false);
    setDrawerOpen(false);
    const existing = windows.find((item) => item.id === id);
    if (!existing) {
      setWindows((items) => [...items, { id, minimized: false }]);
      setActiveWindow(id);
      return;
    }
    if (activeWindow === id && !existing.minimized) {
      setWindows((items) => items.map((item) => item.id === id ? { ...item, minimized: true } : item));
      setActiveWindow(null);
      return;
    }
    setWindows((items) => items.map((item) => item.id === id ? { ...item, minimized: false } : item));
    setActiveWindow(id);
  }

  function closeWindow(id: AppId) {
    setWindows((items) => items.filter((item) => item.id !== id));
    setActiveWindow((active) => active === id ? null : active);
  }

  function minimizeWindow(id: AppId) {
    setWindows((items) => items.map((item) => item.id === id ? { ...item, minimized: true } : item));
    setActiveWindow((active) => active === id ? null : active);
  }

  function sendChat() {
    const message = chatInput.trim();
    if (!message) return;
    setChat((items) => [...items, { role: "user", text: message }, { role: "assistant", text: "Signal received. I have logged that request locally; Vertex is ready to open the relevant surface when you are." }]);
    setChatInput("");
  }

  function restart() {
    setStartOpen(false);
    setWindows([]);
    setActiveWindow(null);
    setPhase("boot");
    setBooting(false);
  }

  return (
    <main className="os-root" onClick={() => setContextMenu(null)} onContextMenu={(event) => {
      event.preventDefault();
      if (phase === "desktop") setContextMenu({ x: event.clientX, y: event.clientY });
    }}>
      <div className="wallpaper-layer">
        <img className="wallpaper-image" src={activeWallpaper.src} alt="" />
        {activeWallpaper.video && <video className="wallpaper-video" src={activeWallpaper.video} autoPlay muted loop playsInline onMouseOver={(event) => void event.currentTarget.play()} onMouseOut={(event) => event.currentTarget.pause()} aria-hidden="true" />}
      </div>

      <section className={`boot-screen ${phase !== "boot" ? "hidden" : ""}`} aria-label="Vertex boot sequence">
        <div className="boot-core">
          <BrandMark />
          <h1 className="boot-title">VERTEX-OS</h1>
           <p className="boot-sub">{ui.bootSub}</p>
          <div className="boot-actions">
            <button className="primary-button" data-testid="button-enter-vertex" onClick={(event) => { event.stopPropagation(); beginBoot(); }}>
               {booting ? ui.initializing : ui.enter}
            </button>
             <span className="boot-hint">{booting ? ui.establishing : ui.hint}</span>
          </div>
          {booting && <div className="boot-progress"><span /></div>}
        </div>
      </section>

      <section className={`lock-screen ${phase === "lock" ? "active" : ""}`} onClick={unlock} aria-label="Vertex lock screen">
        <img className="lock-wallpaper" src={activeLockWallpaper.src} alt="" />
         {activeLockWallpaper.video && <video className="lock-wallpaper-video" src={activeLockWallpaper.video} autoPlay muted loop playsInline onMouseOver={(event) => void event.currentTarget.play()} onMouseOut={(event) => event.currentTarget.pause()} aria-hidden="true" />}
        <div className="lock-ui">
           <div className="lock-day">{now.toLocaleDateString(localeFor(language), { weekday: "long" }).toUpperCase()}</div>
           <div className="lock-date">{formatDate(now, language)}</div>
          <div className="lock-time">— {formatClock(now)} —</div>
        </div>
         <div className="lock-fps">60 FPS</div>
         <div className="lock-help">{ui.lockHelp}</div>
      </section>

      <section className={`desktop-shell ${phase === "desktop" ? "active" : ""} ${largeIcons ? "large-icons" : ""}`}>
        <header className="hud">
           <div className="hud-topline">{ui.runtime}</div>
           <div className="hud-day">{now.toLocaleDateString(localeFor(language), { weekday: "long" }).toUpperCase()}</div>
          <div className="hud-meta"><strong>{formatClock(now)}</strong> &nbsp; // &nbsp; local session &nbsp; // &nbsp; <span>60 FPS</span></div>
        </header>

        <aside className="sidebar" aria-label="Quick access">
          <div>
             <div className="side-label">{ui.jumpBack}</div>
            <button className="side-card" onClick={() => toggleApp("games")} data-testid="button-jump-back">
               <div className="side-art"><Gamepad2 size={22} /></div>
               <div className="side-info"><strong>{ui.gameDeck}</strong><span>{ui.libraryReady}</span></div><ChevronRight className="side-chevron" size={15} />
            </button>
          </div>
          <div>
             <div className="side-label">{ui.quickPlay}</div>
            <button className="side-card" onClick={() => { toggleApp("pulse"); setMediaPlaying(true); }} data-testid="button-quick-play">
               <div className="side-art"><Play size={19} /></div>
               <div className="side-info"><strong>{mediaPlaying ? ui.playing : ui.notPlaying}</strong><span>{mediaPlaying ? ui.vertexPulse : ui.systemAudio}</span></div><ChevronRight className="side-chevron" size={15} />
            </button>
          </div>
          <div>
             <div className="side-label">{ui.systemStatus}</div>
            <button className="side-card" onClick={() => setUpdateOpen(true)} data-testid="button-update-log">
               <div className="side-art"><Radio size={20} /></div>
               <div className="side-info"><strong>{ui.updateLog}</strong><span>{ui.latestPatches}</span></div><ChevronRight className="side-chevron" size={15} />
            </button>
          </div>
        </aside>

        <div className="desktop-grid" aria-label="Desktop applications">
          {apps.slice(0, 6).map((app) => (
            <button key={app.id} className="desktop-icon" onClick={() => toggleApp(app.id)} data-testid={`button-desktop-${app.id}`}>
              <span className="icon-tile"><AppIcon app={app} size={22} /></span><span>{app.title}</span>
            </button>
          ))}
        </div>

        <WindowLayer windows={windows} activeWindow={activeWindow} onFocus={setActiveWindow} onClose={closeWindow} onMinimize={minimizeWindow} settings={settings} updateSetting={updateSetting} faqOpen={faqOpen} setFaqOpen={setFaqOpen} />

        <div className="fps">VERTEX // 60 FPS</div>
        <nav className="dock" aria-label="System taskbar">
          <button className="dock-button" onClick={(event) => { event.stopPropagation(); setStartOpen((open) => !open); setDrawerOpen(false); }} aria-label="Open start menu" data-testid="button-start-menu"><Menu size={21} /></button>
          <span className="dock-separator" />
          <button className="dock-button" onClick={(event) => { event.stopPropagation(); setDrawerOpen((open) => !open); setStartOpen(false); }} aria-label="Open app drawer" data-testid="button-app-drawer"><Grid2X2 size={20} /></button>
          <span className="dock-separator" />
          {apps.filter((app) => app.pinned).map((app) => {
            const isOpen = windows.some((item) => item.id === app.id && !item.minimized) || (app.id === "ciri" && ciriOpen);
            return <button key={app.id} className={`dock-button ${isOpen ? "active open" : ""}`} onClick={(event) => { event.stopPropagation(); toggleApp(app.id); }} title={app.title} data-testid={`button-dock-${app.id}`}><AppIcon app={app} size={20} /></button>;
          })}
          <span className="dock-separator" />
          <button className={`dock-button ${ciriOpen ? "active open" : ""}`} onClick={(event) => { event.stopPropagation(); setCiriOpen(true); }} aria-label="Open Ciri" data-testid="button-dock-ciri"><Bot size={20} /></button>
        </nav>

        <div className={`overlay-panel start-panel ${startOpen ? "open" : ""}`} onClick={(event) => event.stopPropagation()} aria-label="Start menu">
           <div className="search-field"><Menu size={16} /><input value={startQuery} onChange={(event) => setStartQuery(event.target.value)} placeholder={ui.searchVertex} aria-label="Search start menu" data-testid="input-start-search" /></div>
           <div className="panel-heading"><h3>{ui.pinned}</h3><span>{ui.administrator}</span></div>
          <div className="pinned-grid">
            {pinnedApps.map((app) => <button key={app.id} className="pinned-item" onClick={() => toggleApp(app.id)} data-testid={`button-pinned-${app.id}`}><AppIcon app={app} size={22} /><span>{app.title}</span></button>)}
          </div>
          <div className="panel-footer"><div className="user-chip"><span className="avatar">VX</span><span>Administrator / local</span></div><button className="power-button" onClick={restart} aria-label="Restart Vertex-OS" data-testid="button-restart"><Power size={17} /></button></div>
        </div>

        <div className={`drawer ${drawerOpen ? "open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }} aria-label="All applications">
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close app drawer" data-testid="button-close-drawer"><X size={22} /></button>
           <div className="search-field drawer-search"><Grid2X2 size={16} /><input value={drawerQuery} onChange={(event) => setDrawerQuery(event.target.value)} placeholder={ui.searchApps} aria-label="Search apps" data-testid="input-drawer-search" /></div>
          <div className="drawer-grid">{filteredApps.map((app) => <button key={app.id} className="drawer-item" onClick={() => toggleApp(app.id)} data-testid={`button-drawer-${app.id}`}><span className="icon-tile"><AppIcon app={app} size={25} /></span><span>{app.title}</span></button>)}</div>
        </div>

        <WallpaperModal open={wallpaperOpen} target={wallpaperTarget} setTarget={setWallpaperTarget} wallpapers={wallpapers} current={wallpaperTarget === "lock" ? lockWallpaper : wallpaper} onChoose={chooseWallpaper} loop={loopWallpaper} setLoop={(value) => { setLoopWallpaper(value); storage.write("vertex-loop", value); }} onClose={() => setWallpaperOpen(false)} />
        <InfoModal open={updateOpen} title="UPDATE LOG v3.0" onClose={() => setUpdateOpen(false)}>
          <ul className="update-list">
            <li>Right-side quick access now restores games and audio in one click.</li>
            <li>Dynamic image-based lock screen with responsive high-resolution wallpapers.</li>
            <li>Workspace windows now minimize to the taskbar and preserve their state.</li>
            <li>Vertex wallpaper engine supports three local visual protocols.</li>
            <li>Taskbar, app drawer, assistant, and Config surfaces are fully interactive.</li>
          </ul>
          <button className="primary-button" onClick={() => setUpdateOpen(false)}>Dismiss</button>
        </InfoModal>

        <div className={`context-menu ${contextMenu ? "" : "hidden"}`} style={contextMenu ? { left: contextMenu.x, top: contextMenu.y } : { display: "none" }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => { setWallpaperOpen(true); setContextMenu(null); }}><Image size={15} /> Change wallpaper</button>
          <button onClick={() => { setLargeIcons(true); setContextMenu(null); }}><Maximize2 size={15} /> Large desktop icons</button>
          <button onClick={() => { setLargeIcons(false); setContextMenu(null); }}><LayoutGrid size={15} /> Default icon size</button>
          <button onClick={() => { setContextMenu(null); addToast("Workspace refreshed", "Desktop surfaces are already current."); }}><RotateCcw size={15} /> Refresh system</button>
        </div>

        <div className={`media-player ${mediaHidden ? "hidden" : ""}`}>
          <div className="media-top"><span className="media-label">Now playing</span><div className="media-actions"><button onClick={() => setMediaHidden(true)} aria-label="Minimize player"><Minus size={13} /></button><button onClick={() => { setMediaHidden(true); setMediaPlaying(false); }} aria-label="Close player"><X size={13} /></button></div></div>
          <div className="media-main"><img className="album-art" src={activeWallpaper.src} alt="" /><div className="track"><strong>System Audio</strong><span>{mediaPlaying ? "Vertex Pulse / live" : "Ready to play"}</span></div></div>
          <div className="progress"><span style={{ width: mediaPlaying ? "56%" : "22%" }} /></div>
          <div className="media-controls"><button onClick={() => addToast("Audio", "Previous signal unavailable in local mode.")} aria-label="Previous track"><ArrowLeft size={16} /></button><button onClick={() => setMediaPlaying((playing) => !playing)} aria-label="Play or pause"><Play size={17} fill={mediaPlaying ? "currentColor" : "none"} /></button><button onClick={() => addToast("Audio", "Next signal unavailable in local mode.")} aria-label="Next track"><ArrowRight size={16} /></button></div>
        </div>
        <button className={`restore-media ${mediaHidden ? "visible" : ""}`} onClick={() => setMediaHidden(false)} aria-label="Restore media player" data-testid="button-restore-player"><Volume2 size={18} /></button>

        <div className={`ciri-backdrop ${ciriOpen ? "open" : ""}`} onClick={() => setCiriOpen(false)} />
        <aside className={`ciri-window ${ciriOpen ? "open" : ""}`} aria-label="Ciri assistant">
          <header className="ciri-header"><div className="ciri-name"><span className="ciri-orb" /> CIRI <span className="ciri-status">LOCAL / READY</span></div><button className="icon-close" onClick={() => setCiriOpen(false)} aria-label="Close Ciri" data-testid="button-close-ciri"><X size={18} /></button></header>
          <div className="chat-history">{chat.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}</div>
          <form className="ciri-form" onSubmit={(event) => { event.preventDefault(); sendChat(); }}><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Message Ciri..." rows={1} aria-label="Message Ciri" data-testid="input-ciri-chat" /><button className="send-button" type="submit" aria-label="Send message" data-testid="button-send-ciri"><Send size={16} /></button></form>
        </aside>
      </section>

       {languageOpen && <div className="language-gate" role="dialog" aria-modal="true" aria-labelledby="language-title" onClick={(event) => event.stopPropagation()}>
         <div className="language-card">
           <BrandMark />
           <div className="language-kicker">FIRST BOOT / LANGUAGE</div>
           <h2 id="language-title">Choose your language</h2>
           <p>Select the language for your Vertex-OS session.</p>
           <div className="language-options">
             {languageOptions.map((option) => <button key={option.code} className="language-option" onClick={() => chooseLanguage(option.code)} data-testid={`button-language-${option.code}`}>
               <span>{option.native}</span><small>{option.label}</small><ChevronRight size={16} />
             </button>)}
           </div>
         </div>
       </div>}

      {mobileWarning && <div className="mobile-warning" onDoubleClick={() => setMobileWarning(false)}><div className="mobile-warning-card"><div className="mobile-warning-kicker">Display notice / mobile mode</div><h2>Desktop protocol detected</h2><p>Vertex-OS is tuned for a larger display. Continue to explore with a touch-friendly layout, or double tap anywhere to dismiss this notice.</p><button className="primary-button" onClick={() => setMobileWarning(false)} data-testid="button-continue-mobile">Continue to Vertex</button></div></div>}
      <div className="toast-stack">{toasts.map((toast) => <button className="toast" key={toast.id} onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><strong>{toast.title}</strong><span>{toast.copy}</span></button>)}</div>
    </main>
  );
}

function WindowLayer({ windows, activeWindow, onFocus, onClose, onMinimize, settings, updateSetting, faqOpen, setFaqOpen }: {
  windows: WindowState[];
  activeWindow: AppId | null;
  onFocus: (id: AppId) => void;
  onClose: (id: AppId) => void;
  onMinimize: (id: AppId) => void;
  settings: { optimized: boolean; fastBoot: boolean; idleLock: boolean; confirm: boolean; cloak: string; panicKey: string };
  updateSetting: (key: keyof typeof settings, value: boolean | string) => void;
  faqOpen: number | null;
  setFaqOpen: (value: number | null) => void;
}) {
  return <div className="window-layer">{windows.map((window) => {
    const app = apps.find((item) => item.id === window.id) ?? apps[0];
    return <article key={window.id} className={`app-window ${activeWindow === window.id ? "active" : ""} ${window.minimized ? "minimized" : ""}`} onMouseDown={() => onFocus(window.id)} style={{ zIndex: activeWindow === window.id ? 40 : 30 }}>
      <header className="window-bar"><span className="window-title">{app.title.toUpperCase()} // VERTEX-OS</span><div className="window-controls"><button className="window-control" onClick={() => onMinimize(window.id)} aria-label={`Minimize ${app.title}`}><Minus size={13} /></button><button className="window-control close" onClick={() => onClose(window.id)} aria-label={`Close ${app.title}`}><X size={13} /></button></div></header>
      <div className="window-body">{renderWindowBody(window.id, settings, updateSetting, faqOpen, setFaqOpen)}</div>
    </article>;
  })}</div>;
}

function renderWindowBody(id: AppId, settings: { optimized: boolean; fastBoot: boolean; idleLock: boolean; confirm: boolean; cloak: string; panicKey: string }, updateSetting: (key: keyof typeof settings, value: boolean | string) => void, faqOpen: number | null, setFaqOpen: (value: number | null) => void) {
  if (id === "settings") return <SettingsSurface settings={settings} updateSetting={updateSetting} faqOpen={faqOpen} setFaqOpen={setFaqOpen} />;
  if (id === "hub") return <div className="window-surface"><div className="surface-kicker">Vertex-Hub / media operating system</div><h2 className="surface-title">Your visual workspace, tuned for the next signal.</h2><p className="surface-copy">A presentation-first environment for the things you watch, play, collect, and return to. Every surface stays close, quiet, and ready.</p><div className="surface-row"><button className="primary-button">Open featured relay</button><button className="outline-button">Browse updates</button></div><div className="hub-grid"><div className="mini-card"><Cloud size={18} color="var(--cyan)" /><strong>Relay status</strong><span>All local surfaces reporting nominal.</span></div><div className="mini-card"><Radio size={18} color="var(--violet)" /><strong>Signal queue</strong><span>Three saved experiences are ready.</span></div><div className="mini-card"><ShieldCheck size={18} color="var(--orange)" /><strong>Session</strong><span>Private local session / no account required.</span></div></div></div>;
  if (id === "archive") return <div className="window-surface"><div className="surface-kicker">Archive / local library</div><h2 className="surface-title">Keep the good signals close.</h2><p className="surface-copy">Your local library is quiet by design. Pin a title from Vertex-Hub and it will appear here the next time you open the vault.</p><div className="hub-grid"><div className="mini-card"><FileStack size={18} color="var(--cyan)" /><strong>Featured queue</strong><span>Nothing pinned yet.</span></div><div className="mini-card"><FolderOpen size={18} color="var(--violet)" /><strong>Collections</strong><span>Four empty shelves waiting.</span></div></div><div className="surface-row"><button className="outline-button"><Upload size={14} /> Import local media</button></div></div>;
  if (id === "pulse") return <div className="window-surface"><div className="surface-kicker">Pulse / audio stream</div><h2 className="surface-title">System Audio</h2><p className="surface-copy">A calm, local playback surface for the background of your workspace. No remote dependencies. Start a signal from the control below.</p><div className="surface-row"><button className="primary-button"><Play size={14} /> Play signal</button><button className="outline-button"><Volume2 size={14} /> Output: workspace</button></div><div className="hub-grid"><div className="mini-card"><Music2 size={18} color="var(--cyan)" /><strong>Current channel</strong><span>Atmospheric / unlisted</span></div><div className="mini-card"><Zap size={18} color="var(--orange)" /><strong>Latency</strong><span>14 ms / local relay</span></div></div></div>;
  if (id === "browser") return <div className="browser-frame"><div className="browser-card"><div className="surface-kicker">Vertex-Web / secure surface</div><h3>Ultraviolet index</h3><p>The browser surface is staged for the next relay. This local shell is safe to explore while external destinations remain disabled.</p><div className="surface-row"><button className="outline-button"><ArrowLeft size={14} /> Back</button><button className="outline-button"><RotateCcw size={14} /> Refresh relay</button></div></div></div>;
  if (id === "games") return <div className="window-surface"><div className="surface-kicker">Game Deck / library</div><h2 className="surface-title">A clean launchpad for play.</h2><p className="surface-copy">No recent game is mounted. Your saved library will be available here when a local title is ready.</p><div className="surface-row"><button className="primary-button"><Gamepad2 size={14} /> Scan library</button><button className="outline-button">View system status</button></div></div>;
  return <div className="window-surface"><div className="surface-kicker">Terminal / local runtime</div><h2 className="surface-title">vertex@workspace:~</h2><p className="surface-copy" style={{ fontFamily: "monospace" }}>runtime.status&nbsp;&nbsp;=&nbsp;&nbsp;"nominal"<br />wallpaper.engine&nbsp;&nbsp;=&nbsp;&nbsp;"local/high-resolution"<br />session.mode&nbsp;&nbsp;=&nbsp;&nbsp;"presentation"</p><div className="surface-row"><button className="outline-button"><Code2 size={14} /> Inspect system</button></div></div>;
}

function SettingsSurface({ settings, updateSetting, faqOpen, setFaqOpen }: {
  settings: { optimized: boolean; fastBoot: boolean; idleLock: boolean; confirm: boolean; cloak: string; panicKey: string };
  updateSetting: (key: keyof typeof settings, value: boolean | string) => void;
  faqOpen: number | null;
  setFaqOpen: (value: number | null) => void;
}) {
  const faqs = [
    ["Movies not working?", "Open Vertex-Web, refresh the Ultraviolet relay, then return to the media surface. This local build keeps remote playback intentionally disabled."],
    ["Too many games?", "Clear the local browser storage for this presentation build and reopen Vertex-OS to reset the saved session."],
  ];
  return <div className="window-surface"><div className="surface-kicker">System config / control plane</div><h2 className="surface-title">Tune the workspace.</h2><p className="surface-copy">A few deliberate switches keep the OS responsive while preserving the full-screen presentation feeling.</p><div className="settings-list">
    <div className="setting-group"><Cpu size={13} /> Performance</div>
    <SettingToggle label="Optimized Background" help="Uses the still-image wallpaper engine for lower resource use." value={settings.optimized} onChange={(value) => updateSetting("optimized", value)} />
    <SettingToggle label="Fast Boot" help="Skips the startup sequence on the next launch." value={settings.fastBoot} onChange={(value) => updateSetting("fastBoot", value)} />
    <SettingToggle label="Idle Lock Screen" help="Locks the workspace after three minutes away." value={settings.idleLock} onChange={(value) => updateSetting("idleLock", value)} />
    <SettingToggle label="Redirect Confirmation" help="Shows a confirmation before leaving this local workspace." value={settings.confirm} onChange={(value) => updateSetting("confirm", value)} />
    <div className="setting-group"><LockKeyhole size={13} /> Cloaking & stealth</div>
    <div className="setting-row"><div><strong>Tab Cloak</strong><small>Changes the visible tab label for a quieter session.</small></div><select className="setting-select" value={settings.cloak} onChange={(event) => updateSetting("cloak", event.target.value)} aria-label="Tab cloak"><option value="none">None (Vertex-OS)</option><option value="google">Google</option><option value="drive">My Drive</option><option value="canvas">Dashboard</option></select></div>
    <div className="setting-group"><MonitorCog size={13} /> Shortcuts & links</div>
    <div className="setting-row"><div><strong>Panic Key</strong><small>Quickly lock the workspace.</small></div><input className="setting-input" value={settings.panicKey} maxLength={1} onChange={(event) => updateSetting("panicKey", event.target.value)} aria-label="Panic key" /></div>
    <button className="setting-row" onClick={() => setFaqOpen(faqOpen === 0 ? null : 0)}><div><strong><CircleHelp size={14} /> System FAQ</strong><small>Troubleshooting and help.</small></div><ChevronDown size={16} /></button>
    {faqOpen !== null && <div className="faq-list">{faqs.map(([question, answer], index) => <div className="faq-item" key={question}><button onClick={() => setFaqOpen(faqOpen === index ? null : index)}>{question}<ChevronDown size={15} /></button>{faqOpen === index && <div className="faq-answer">{answer}</div>}</div>)}</div>}
  </div></div>;
}

function SettingToggle({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><div><strong>{label}</strong><small>{help}</small></div><span className="switch"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span className="switch-track" /></span></label>;
}

function WallpaperModal({ open, target, setTarget, wallpapers, current, onChoose, loop, setLoop, onClose }: { open: boolean; target: "both" | "home" | "lock"; setTarget: (target: "both" | "home" | "lock") => void; wallpapers: Wallpaper[]; current: WallpaperId; onChoose: (id: WallpaperId) => void; loop: boolean; setLoop: (value: boolean) => void; onClose: () => void }) {
  return <div className={`wallpaper-modal ${open ? "open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card"><header className="modal-header"><h2>WALLPAPER PROTOCOLS</h2><button className="icon-close" onClick={onClose} aria-label="Close wallpaper settings" data-testid="button-close-wallpapers"><X size={19} /></button></header><div className="modal-toolbar"><div className="segmented">{(["both", "home", "lock"] as const).map((option) => <button key={option} className={target === option ? "active" : ""} onClick={() => setTarget(option)}>{option === "home" ? "Homescreen" : option === "lock" ? "Lockscreen" : "Both"}</button>)}</div><label className="toggle-text"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop wallpaper</label></div><div className="wallpaper-grid">{wallpapers.map((item) => <button className={`wallpaper-option ${current === item.id ? "active" : ""}`} key={item.id} onClick={() => onChoose(item.id)} data-testid={`button-wallpaper-${item.id}`}><img src={item.src} alt={item.name} /><span>{item.name} / {item.meta}</span></button>)}</div></div></div>;
}

function InfoModal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <div className={`info-modal ${open ? "open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card"><header className="modal-header"><h2>{title}</h2><button className="icon-close" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>{children}</div></div>;
}

export default App;