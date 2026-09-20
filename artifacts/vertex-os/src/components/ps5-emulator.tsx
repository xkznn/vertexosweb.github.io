import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Home, Loader2, MessageCircle, Play, Plus, Search, Sparkles, User, UserPlus, X } from "lucide-react";
import Peer from "peerjs";
import { PS5_GAMES, PS5_TOTAL, type Ps5Game } from "../ps5-games";
import { MessagesSurface, publishNowPlaying } from "../messages";

type Tab = "home" | "featured" | "chat" | "me";

const OWNED_KEY = "vertex-ps5-owned";
const RECENT_KEY = "vertex-ps5-recent";
const ACCOUNT_KEY = "vertex-ps5-account";

const USERNAME_RE = /^[a-z0-9]{3,16}$/;
const NAME_RE = /^.{1,20}$/;

type Ps5Account = { username: string; displayName: string; dob?: string };

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

const SEED_NAMES = ["Bowmasters", "OvO", "Jetpack Joyride", "Friday Night Funkin", "Temple Run 2", "Stickman Hook"];

const STAFF_PICKS = ["z181", "z183", "z198", "z203", "z58", "z38", "z33", "z1", "z10", "z102", "z27", "z196"];

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

function byName(name: string): Ps5Game | undefined {
  return PS5_GAMES.find((g) => g.name.toLowerCase() === name.toLowerCase());
}

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const BOOT_COPY = [
  "Initializing Vertex PS5 Emulator...",
  "Mounting game catalog",
  `Decrypting ${PS5_TOTAL} titles`,
  "Preparing virtual console",
  "Graphics pipe: 4K / 60 FPS",
];

const PS5_BOOT_IMG = `${import.meta.env.BASE_URL}images/ps5-boot.png`;

export function Ps5EmulatorSurface() {
  const [stage, setStage] = useState<"boot" | "account" | "ready">("boot");
  const [tab, setTab] = useState<Tab>("home");
  const [account, setAccount] = useState<Ps5Account | null>(() => readAccount());
  const [owned, setOwned] = useState<string[]>(() => readSet(OWNED_KEY, []));
  const [recent, setRecent] = useState<string[]>(() => readSet(RECENT_KEY, []));
  const [playing, setPlaying] = useState<Ps5Game | null>(null);
  const [sessionSec, setSessionSec] = useState(0);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [heroIdx, setHeroIdx] = useState(0);
  const [gridCount, setGridCount] = useState(40);
  const [hoverBg, setHoverBg] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const ownedSet = useMemo(() => new Set(owned), [owned]);

  const collected = useMemo(() => {
    const out: Ps5Game[] = [];
    for (const g of PS5_GAMES) if (ownedSet.has(g.id)) out.push(g);
    return out;
  }, [ownedSet]);

  const featured = useMemo(() => {
    const seen = new Set<string>();
    const out: Ps5Game[] = [];
    for (const g of [...collected, ...PS5_GAMES]) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
      if (out.length >= 12) break;
    }
    return out;
  }, [collected]);

  const featuredPool = useMemo(() => {
    const base = collected.length >= 8 ? collected : featured;
    return base.slice(0, 12);
  }, [collected, featured]);

  const hero = featuredPool.length ? featuredPool[heroIdx % featuredPool.length] : PS5_GAMES[0];

  const recentGames = useMemo(() => {
    const out: Ps5Game[] = [];
    for (const id of recent) {
      const g = PS5_GAMES.find((x) => x.id === id);
      if (g) out.push(g);
      if (out.length >= 12) break;
    }
    return out;
  }, [recent]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PS5_GAMES.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 60);
  }, [query]);

  const searching = query.trim().length > 0;

  const staffPicks = useMemo(() => {
    const out: Ps5Game[] = [];
    for (const id of STAFF_PICKS) {
      const g = PS5_GAMES.find((x) => x.id === id);
      if (g) out.push(g);
      if (out.length >= 12) break;
    }
    return out;
  }, []);

  const recommendations = useMemo(() => {
    const skip = new Set(ownedSet);
    for (const g of staffPicks) skip.add(g.id);
    const pool = PS5_GAMES.filter((g) => !skip.has(g.id)).sort(() => Math.random() - 0.5);
    return pool.slice(0, 15);
  }, [ownedSet, staffPicks]);

  const install = useCallback((id: string) => {
    setOwned((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeArray(OWNED_KEY, next);
      return next;
    });
    const g = PS5_GAMES.find((x) => x.id === id);
    setToast(`${g?.name ?? "Game"} added to your library`);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const uninstall = useCallback((id: string) => {
    setOwned((prev) => {
      const next = prev.filter((x) => x !== id);
      writeArray(OWNED_KEY, next);
      return next;
    });
    setRecent((prev) => {
      const next = prev.filter((x) => x !== id);
      writeArray(RECENT_KEY, next);
      return next;
    });
    setPlaying((p) => (p?.id === id ? null : p));
    setSessionSec(0);
    const g = PS5_GAMES.find((x) => x.id === id);
    setToast(`${g?.name ?? "Game"} uninstalled`);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const launch = useCallback((g: Ps5Game) => {
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
    const t = window.setInterval(() => setHeroIdx((i) => i + 1), 6000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
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

  if (stage === "boot") {
    return (
      <div className="ps5-surface">
        <Ps5BootSurface onDone={() => setStage(readAccount() || account ? "ready" : "account")} />
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
        <aside className="ps5-side">
          <div className="ps5-side-brand">
            <span className="ps5-top-shape">PS</span>
            <span className="ps5-side-name">Vertex<em>PlayStation</em></span>
          </div>
          <div className="ps5-side-label">Browse</div>
          <nav className="ps5-side-nav">
            <button className={`ps5-side-item ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
              <Home size={17} /> <span>Home</span>
            </button>
            <button className={`ps5-side-item ${tab === "featured" ? "active" : ""}`} onClick={() => setTab("featured")}>
              <Sparkles size={17} /> <span>Featured</span>
            </button>
            <button className={`ps5-side-item ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}>
              <MessageCircle size={17} /> <span>Chat</span>
            </button>
            <button className={`ps5-side-item ${tab === "me" ? "active" : ""}`} onClick={() => setTab("me")}>
              <User size={17} /> <span>Me</span>
            </button>
          </nav>
          <div className="ps5-side-foot">
            <span>{collected.length} installed</span>
            <span>{PS5_TOTAL} titles in store</span>
          </div>
        </aside>
        <div className="ps5-main">
      <header className="ps5-top">
        <div className="ps5-search-bar">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games across the catalog..."
            aria-label="Search games"
          />
          {query ? (
            <button className="ps5-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={15} />
            </button>
          ) : null}
        </div>
        <div className="ps5-top-right">
          <span className="ps5-clock">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </header>

      <div className="ps5-body">
        {searching ? (
          <div className="ps5-page">
            <div className="ps5-page-head">
              <h2>{query ? `Results for "${query}"` : "Search the Library"}</h2>
              <span className="ps5-page-meta">{searchResults.length} found · {PS5_TOTAL} titles</span>
            </div>
            {searchResults.length ? (
              <div className="ps5-grid">
                {searchResults.map((g) => (
                  <Ps5StoreCard key={g.id} game={g} owned={ownedSet.has(g.id)} onPlay={launch} onGet={install} onHover={setHoverBg} />
                ))}
              </div>
            ) : (
              <div className="ps5-empty">
                <p>No games match &quot;{query}&quot;. Try a different title.</p>
              </div>
            )}
          </div>
        ) : (
          <>
        {tab === "home" && (
          <div className="ps5-home">
            {hero ? (
              <section className="ps5-hero" onClick={() => launch(hero)}>
                <div className="ps5-hero-img" style={{ backgroundImage: `url(${hero.cover})` }} />
                <div className="ps5-hero-fade" />
                <div className="ps5-hero-content">
                  <div className="ps5-hero-tag">VERTEX FEATURED</div>
                  <h2 className="ps5-hero-title">{hero.name}</h2>
                  <p className="ps5-hero-sub">Playable now · Free on Vertex PlayStation</p>
                  <button className="ps5-play-btn">
                    <Play size={15} /> Play
                  </button>
                </div>
              </section>
            ) : null}

            {recentGames.length ? (
              <section className="ps5-row">
                <div className="ps5-row-head">
                  <h3 className="ps5-row-title">Continue</h3>
                  <span className="ps5-row-count">Pick up where you left off</span>
                </div>
                <div className="ps5-track">
                  {recentGames.map((g) => (
                    <Ps5Card key={g.id} game={g} onPlay={launch} onHover={setHoverBg} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="ps5-row">
              <div className="ps5-row-head">
                <h3 className="ps5-row-title">Recommended for You</h3>
                <span className="ps5-row-count">Hand-picked picks</span>
              </div>
              <div className="ps5-track">
                {recommendations.map((g) => (
                  <Ps5Card key={g.id} game={g} onPlay={launch} onHover={setHoverBg} />
                ))}
              </div>
            </section>

            <section className="ps5-row">
              <div className="ps5-row-head">
                <h3 className="ps5-row-title">Featured Games</h3>
                <span className="ps5-row-count">From the editor's desk</span>
              </div>
              <div className="ps5-track ps5-marquee">
                {[...staffPicks, ...staffPicks].map((g, i) => (
                  <Ps5Card key={`${g.id}-${i}`} game={g} onPlay={launch} onHover={setHoverBg} />
                ))}
              </div>
            </section>

            <section className="ps5-row">
              <div className="ps5-row-head">
                <h3 className="ps5-row-title">All Games</h3>
                <span className="ps5-row-count">{PS5_TOTAL} titles · free forever</span>
              </div>
              <div className="ps5-grid">
                {PS5_GAMES.slice(0, gridCount).map((g) => (
                  <Ps5StoreCard key={g.id} game={g} owned={ownedSet.has(g.id)} onPlay={launch} onGet={install} onHover={setHoverBg} />
                ))}
              </div>
              <div ref={sentinelRef} />
            </section>
          </div>
        )}

        {tab === "featured" && (
          <div className="ps5-page">
            <section className="ps5-store-hero">
              <div className="ps5-store-hero-bg" style={{ backgroundImage: `url(${hero.cover})` }} />
              <div className="ps5-store-hero-content">
                <div className="ps5-store-tag">Vertex Featured</div>
                <h2>{hero.name}</h2>
                <p className="ps5-store-hero-sub">Available Now · Free · PS5 Enhanced</p>
                <div className="ps5-store-actions">
                  <button className="ps5-ghost-btn ps5-big" onClick={() => (ownedSet.has(hero.id) ? launch(hero) : install(hero.id))}>
                    {ownedSet.has(hero.id) ? (
                      <>
                        <Play size={14} /> Play
                      </>
                    ) : (
                      <>
                        <Plus size={14} /> Get
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>

            <section className="ps5-row" style={{ marginTop: 30 }}>
              <div className="ps5-row-head">
                <h3 className="ps5-row-title">Featured & Trending</h3>
                <span className="ps5-row-count">Now streaming</span>
              </div>
              <div className="ps5-track ps5-marquee">
                {[...staffPicks, ...staffPicks].map((g, i) => (
                  <Ps5Card key={`${g.id}-${i}`} game={g} onPlay={launch} onHover={setHoverBg} />
                ))}
              </div>
            </section>

            <section className="ps5-row" style={{ marginTop: 30 }}>
              <div className="ps5-row-head">
                <h3 className="ps5-row-title">Top Picks</h3>
                <span className="ps5-row-count">The cream of the crop</span>
              </div>
              <div className="ps5-track">
                {recommendations.map((g) => (
                  <Ps5Card key={g.id} game={g} onPlay={launch} onHover={setHoverBg} />
                ))}
              </div>
            </section>

            <div className="ps5-page-head" style={{ marginTop: 40 }}>
              <h2>All Games</h2>
              <span className="ps5-page-meta">{PS5_TOTAL} titles</span>
            </div>
            <div className="ps5-grid">
              {PS5_GAMES.slice(0, gridCount).map((g) => (
                <Ps5StoreCard key={g.id} game={g} owned={ownedSet.has(g.id)} onPlay={launch} onGet={install} onHover={setHoverBg} />
              ))}
            </div>
            <div ref={sentinelRef} />
          </div>
        )}

        {tab === "chat" && (
          <div className="ps5-chat-frame">
            <MessagesSurface />
          </div>
        )}

        {tab === "me" && (
          <div className="ps5-page ps5-comming">
            <div className="ps5-coming-card">
              <span className="ps5-me-avatar">{account ? account.displayName.slice(0, 1).toUpperCase() : "?"}</span>
              <h2>{account ? account.displayName : "Player"}</h2>
              <p className="ps5-me-user">@{account ? account.username : "guest"}</p>
              {account?.dob ? <p className="ps5-me-dob">Born {account.dob}</p> : null}
              {playing ? <p className="ps5-me-playing">Now playing · {playing.name}</p> : null}
              <div className="ps5-me-stats">
                <span>{collected.length} installed</span>
                <span>{recentGames.length} recently played</span>
                <span>Messaging on</span>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
      </div>
      </div>

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
              <button className="ps5-close-btn" onClick={() => setPlaying(null)}>
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

function Ps5BootSurface({ onDone }: { onDone: () => void }) {
  const [copyIdx, setCopyIdx] = useState(0);
  const [prog, setProg] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const firedRef = useRef(false);

  useEffect(() => {
    const copyTimer = window.setInterval(() => setCopyIdx((i) => Math.min(i + 1, BOOT_COPY.length - 1)), 650);
    const progTimer = window.setInterval(() => setProg((p) => Math.min(100, p + Math.random() * 6 + 2)), 130);
    const doneTimer = window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDoneRef.current();
    }, 4200);
    return () => {
      window.clearInterval(copyTimer);
      window.clearInterval(progTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  return (
    <div className="ps5-boot">
      <div className="ps5-boot-glow" aria-hidden="true" />
      <div className="ps5-boot-inner">
        <div className="ps5-boot-stage">
          <div className="ps5-boot-media">
            <img className="ps5-boot-device" src={PS5_BOOT_IMG} alt="PS5 logo" draggable={false} />
          </div>
          <div className="ps5-boot-copy-block">
            <span className="ps5-boot-kicker">VERTEX-OS PRESENTS :</span>
            <h1 className="ps5-boot-title">PS5</h1>
            <span className="ps5-boot-underline" />
          </div>
        </div>
        <div className="ps5-boot-loader">
          <div className="ps5-boot-bar"><span style={{ width: `${prog}%` }} /></div>
          <div className="ps5-boot-counter">{Math.min(100, Math.round(prog))}%</div>
          <div className="ps5-boot-copy">{BOOT_COPY[copyIdx]}</div>
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
        <p className="ps5-account-sub">One account for Chat and your PS5 profile. Your username is unique, your display name is shown to friends.</p>
        {err && <div className="ps5-account-err">{err}</div>}
        <label className="ps5-account-field"><span>Username</span>
          <div className="ps5-account-prefix">
            <span>@</span>
            <input className="ps5-account-input" placeholder="onirifalx" maxLength={16} value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setStatus("idle"); }} aria-label="Username" autoFocus spellCheck={false} />
          </div>
          <em>3–16 letters or numbers · unique — no one else can take it</em>
        </label>
        <label className="ps5-account-field"><span>Display name</span>
          <input className="ps5-account-input" placeholder="How friends see you" maxLength={20} value={displayName} onChange={(e) => setDisplayName(e.target.value)} aria-label="Display name" spellCheck={false} />
          <em>Friends see this name — it can repeat</em>
        </label>
        <label className="ps5-account-field"><span>Date of birth (optional)</span>
          <input className="ps5-account-input" type="date" max={new Date().toISOString().slice(0, 10)} value={dob} onChange={(e) => setDob(e.target.value)} aria-label="Date of birth" />
          <em>No age restrictions — just for your profile</em>
        </label>
        <button className="ps5-account-btn" onClick={submit} disabled={checking}>
          {checking ? <><Loader2 size={15} className="ps5-spin" /> Checking availability…</> : status === "taken" ? <><UserPlus size={15} /> Try another username</> : <><Check size={15} /> Create account</>}
        </button>
        <p className="ps5-account-note">Friends find you by username, then you chat live — text, photos and videos, no custom pictures.</p>
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
        <button className="ps5-ghost-btn" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
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

function Ps5Card({ game, onPlay, onHover }: { game: Ps5Game; onPlay: (g: Ps5Game) => void; onHover?: (cover: string | null) => void }) {
  return (
    <button
      className="ps5-card"
      onClick={() => onPlay(game)}
      title={`Play ${game.name}`}
      onMouseEnter={() => onHover?.(game.cover)}
      onMouseLeave={() => onHover?.(null)}
    >
      <img className="ps5-card-img" src={game.cover} alt={game.name} loading="lazy" draggable={false} />
      <span className="ps5-card-name">{game.name}</span>
    </button>
  );
}

function Ps5StoreCard({ game, owned, onPlay, onGet, onHover }: { game: Ps5Game; owned: boolean; onPlay: (g: Ps5Game) => void; onGet: (id: string) => void; onHover?: (cover: string | null) => void }) {
  return (
    <div
      className="ps5-store-card"
      onMouseEnter={() => onHover?.(game.cover)}
      onMouseLeave={() => onHover?.(null)}
    >
      <button className="ps5-card ps5-store-card-main" onClick={() => (owned ? onPlay(game) : onGet(game.id))} title={game.name}>
        <img className="ps5-card-img" src={game.cover} alt={game.name} loading="lazy" draggable={false} />
        <span className="ps5-card-name">{game.name}</span>
      </button>
      {owned ? (
        <button className="ps5-store-get owned" onClick={() => onPlay(game)}><Play size={12} /> Play</button>
      ) : (
        <button className="ps5-store-get" onClick={() => onGet(game.id)}><Plus size={12} /> Get</button>
      )}
    </div>
  );
}