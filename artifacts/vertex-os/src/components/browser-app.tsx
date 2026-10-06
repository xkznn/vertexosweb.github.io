import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, House, Lock, RotateCcw, Search, X } from "lucide-react";
import type { Lang } from "../i18n";

const BASE = import.meta.env.BASE_URL;

type ScramjetFrame = {
  go: (url: string) => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
};
type ScramjetController = {
  createFrame: (el: HTMLIFrameElement, opts?: { plugins?: unknown[] }) => ScramjetFrame;
  wait: () => Promise<void>;
};
type ScramjetControllerCtor = new (opts: {
  serviceworker: ServiceWorker | null;
  transport: unknown;
}) => ScramjetController;

let runtimePromise: Promise<{ Controller: ScramjetControllerCtor }> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const prior = document.querySelector<HTMLScriptElement>(`script[data-sj="${src}"]`);
    if (prior) {
      if (prior.dataset.loaded === "1") {
        resolve();
        return;
      }
      prior.addEventListener("load", () => resolve());
      prior.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.sj = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
    document.head.appendChild(script);
  });
}

function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      await loadScript(`${BASE}scramjet/scramjet.js`);
      await loadScript(`${BASE}controller/controller.api.js`);
      try {
        await loadScript(`${BASE}utils/scramjet-utils.js`);
      } catch {
        /* url watching is optional */
      }
      const controller = (window as unknown as { $scramjetController?: { Controller: ScramjetControllerCtor } }).$scramjetController;
      if (!controller?.Controller) throw new Error("Scramjet controller failed to load.");
      return controller;
    })();
  }
  return runtimePromise;
}

let swPromise: Promise<ServiceWorkerRegistration> | null = null;
function ensureServiceWorker() {
  if (!swPromise) swPromise = navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
  return swPromise;
}

function buildPlugins(onUrl: (url: string) => void): unknown[] {
  const utils = (window as unknown as { $scramjetUtils?: { UrlWatcherPlugin?: new (cb: (url: string) => void) => unknown } }).$scramjetUtils;
  if (!utils?.UrlWatcherPlugin) return [];
  try {
    return [new utils.UrlWatcherPlugin(onUrl)];
  } catch {
    return [];
  }
}

function normalizeAddress(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(value)) return `https://${value}`;
  return `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(value)}`;
}

function ProxyBrowser({ initialUrl, home = false }: { initialUrl?: string; home?: boolean }) {
  const [started, setStarted] = useState(!home);
  const [status, setStatus] = useState<"idle" | "booting" | "ready">(home ? "idle" : "booting");
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState(initialUrl ?? "");
  const [currentUrl, setCurrentUrl] = useState<string | null>(initialUrl ?? null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameRef = useRef<ScramjetFrame | null>(null);
  const initialRef = useRef(initialUrl ?? "");
  const startedRef = useRef(!home);

  useEffect(() => {
    if (!started) return;
    const el = iframeRef.current;
    if (!el) return;
    let cancelled = false;

    (async () => {
      try {
        setStatus("booting");
        setError(null);
        if (!("serviceWorker" in navigator)) {
          throw new Error("This browser does not support service workers, so the proxy cannot run.");
        }
        const runtime = await loadRuntime();
        await ensureServiceWorker();
        const ready = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const wispUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${BASE}api/wisp/`;
        const { default: LibcurlClient } = await import("@mercuryworkshop/libcurl-transport");
        const transport = new LibcurlClient({ wisp: wispUrl });
        const controller = new runtime.Controller({ serviceworker: ready.active, transport });
        await controller.wait();
        if (cancelled) return;
        const frame = controller.createFrame(el, { plugins: buildPlugins((url) => { setCurrentUrl(url); setInput(url); }) });
        frameRef.current = frame;
        if (initialRef.current) frame.go(initialRef.current);
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [started]);

  const go = useCallback((raw: string) => {
    const url = normalizeAddress(raw);
    if (!url) return;
    initialRef.current = url;
    setInput(url);
    setCurrentUrl(url);
    setError(null);
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
      return;
    }
    frameRef.current?.go(url);
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    go(input);
  };

  return (
    <div className="browser-root">
      <div className="browser-bar">
        <div className="browser-nav">
          <button type="button" className="browser-nav-btn" title="Back" onClick={() => frameRef.current?.back()}><ArrowLeft size={15} /></button>
          <button type="button" className="browser-nav-btn" title="Forward" onClick={() => frameRef.current?.forward()}><ArrowRight size={15} /></button>
          <button type="button" className="browser-nav-btn" title="Reload" onClick={() => frameRef.current?.reload()}><RotateCcw size={15} /></button>
          <form className="browser-addr" onSubmit={onSubmit}>
            <Lock className="browser-addr-icon" size={13} />
            <input
              className="browser-addr-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search or enter address"
              spellCheck={false}
              autoComplete="off"
            />
            {input ? (
              <button type="button" className="browser-open" title="Clear" onClick={() => setInput("")}><X size={13} /></button>
            ) : null}
          </form>
          <button type="button" className="browser-nav-btn" title="Home" onClick={() => go("https://lite.duckduckgo.com/lite/")}><House size={15} /></button>
        </div>
      </div>
      <div className="browser-content">
        {started ? (
          <iframe
            ref={iframeRef}
            className="browser-frame"
            title="Proxy browser"
            allow="autoplay; clipboard-read; clipboard-write; camera; microphone; fullscreen; cross-origin-isolated"
            allowFullScreen
          />
        ) : (
          <div className="browser-home">
            <div className="browser-brand-mark">
              <img className="browser-brand-img" src={`${BASE}images/browser-icon.png`} alt="Vertex Browser" />
            </div>
            <h1 className="browser-brand-name">VERTEX</h1>
            <p className="browser-brand-sub">proxy browser</p>
            <form className="browser-search" onSubmit={onSubmit}>
              <Search className="browser-search-icon" size={18} />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Search the web or type a URL"
                spellCheck={false}
                autoComplete="off"
                autoFocus
              />
            </form>
            <p className="browser-hint">Bypass network filters and browse the open web from inside Vertex OS.</p>
          </div>
        )}
        {status === "booting" ? <div className="browser-loading">Starting proxy…</div> : null}
        {error ? <div className="browser-proxy-error">{error}</div> : null}
      </div>
    </div>
  );
}

export function BrowserSurface(_props: { lang: Lang }) {
  return <ProxyBrowser home />;
}

/** Full-bleed proxied site with no chrome. Used when a page refuses to be
 *  framed (X-Frame-Options / CSP) — the scramjet proxy loads it anyway. */
export function ProxyUrlFrame({ url, title = "Proxied page" }: { url: string; title?: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<"booting" | "ready">("booting");
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    let cancelled = false;

    (async () => {
      try {
        if (!("serviceWorker" in navigator)) {
          throw new Error("This browser does not support service workers, so the proxy cannot run.");
        }
        const runtime = await loadRuntime();
        await ensureServiceWorker();
        const ready = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const wispUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${BASE}api/wisp/`;
        const { default: LibcurlClient } = await import("@mercuryworkshop/libcurl-transport");
        const transport = new LibcurlClient({ wisp: wispUrl });
        const controller = new runtime.Controller({ serviceworker: ready.active, transport });
        await controller.wait();
        if (cancelled) return;
        const frame = controller.createFrame(el, { plugins: [] });
        frame.go(urlRef.current);
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="proxy-url-frame">
      <iframe
        ref={iframeRef}
        className="browser-frame"
        title={title}
        allow="autoplay; clipboard-read; clipboard-write; camera; microphone; fullscreen; gamepad; cross-origin-isolated"
        allowFullScreen
      />
      {status === "booting" ? <div className="browser-loading">Starting proxy…</div> : null}
      {error ? <div className="browser-proxy-error">{error}</div> : null}
    </div>
  );
}
