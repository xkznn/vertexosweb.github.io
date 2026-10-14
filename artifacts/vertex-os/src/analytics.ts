import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const SUPA_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "";

export const analyticsConfigured = Boolean(SUPA_URL && SUPA_KEY);

const client: SupabaseClient | null = analyticsConfigured
  ? createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const EVENTS_TABLE = "analytics_events";
const VISITOR_KEY = "vertex-analytics-visitor";
const SESSION_KEY = "vertex-analytics-session";
const HEARTBEAT_MS = 25_000;

export type AnalyticsCount = { label: string; count: number };

export type AnalyticsStats = {
  totals: { events: number; views: number; visitors: number; sessions: number; avg_duration_ms: number };
  recent: { last5m: number; unique5m: number; last24h: number; unique24h: number };
  daily: { day: string; views: number; visitors: number }[];
  hourly: { hour: number; views: number }[];
  pages: AnalyticsCount[];
  referrers: AnalyticsCount[];
  languages: AnalyticsCount[];
  browsers: AnalyticsCount[];
  os: AnalyticsCount[];
  devices: AnalyticsCount[];
  apps: AnalyticsCount[];
};

export type TrackMeta = Record<string, unknown> & { page?: string; title?: string };

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
function idFrom(store: Storage | undefined, key: string): string {
  try {
    const existing = store?.getItem(key);
    if (existing) return existing;
    const made = uuid();
    store?.setItem(key, made);
    return made;
  } catch {
    return uuid();
  }
}

const visitorId = () => (typeof localStorage === "undefined" ? "anon" : idFrom(localStorage, VISITOR_KEY));
const sessionId = () => (typeof sessionStorage === "undefined" ? "anon" : idFrom(sessionStorage, SESSION_KEY));

function detectOs(ua: string): string {
  if (/windows nt 10/i.test(ua)) return "Windows 10/11";
  if (/windows/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown";
}
function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/chrome\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && /version\//i.test(ua)) return "Safari";
  return "Unknown";
}
function detectDevice(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return "Tablet";
  if (/mobile|iphone|android.*mobile|windows phone/i.test(ua)) return "Mobile";
  return "Desktop";
}
function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  } catch {
    return "unknown";
  }
}
function parseReferrer(): string {
  try {
    const ref = document.referrer;
    if (!ref) return "direct";
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (host === location.hostname) return "internal";
    return host || "direct";
  } catch {
    return "direct";
  }
}

export async function trackEvent(kind: string, meta: TrackMeta = {}): Promise<void> {
  if (!client) return;
  try {
    const ua = navigator.userAgent;
    await client.from(EVENTS_TABLE).insert({
      kind,
      visitor_id: visitorId(),
      session_id: sessionId(),
      page: String((meta.page as string) ?? location.pathname + location.search).slice(0, 300),
      title: String((meta.title as string) ?? document.title).slice(0, 160),
      referrer: parseReferrer(),
      hostname: location.hostname,
      os: detectOs(ua),
      browser: detectBrowser(ua),
      device: detectDevice(ua),
      language: navigator.language ?? "unknown",
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timezone: timezone(),
      meta,
    });
  } catch {
    /* analytics is best-effort */
  }
}

async function ping(): Promise<void> {
  if (!client) return;
  try {
    await client.rpc("analytics_ping", {
      p_visitor: visitorId(),
      p_session: sessionId(),
      p_page: location.pathname + location.search,
    });
  } catch {
    /* noop */
  }
}

export function startAnalytics(): () => void {
  if (!client) return () => {};
  void trackEvent("pageview");
  void ping();
  const hb = window.setInterval(() => void ping(), 25_000);
  const startedAt = Date.now();
  const onHide = () => {
    void trackEvent("session_end", { duration_ms: Date.now() - startedAt });
  };
  window.addEventListener("beforeunload", onHide);
  return () => {
    window.clearInterval(hb);
    window.removeEventListener("beforeunload", onHide);
  };
}

function toCounts(input: unknown): { label: string; count: number }[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      const r = row as { label?: unknown; count?: unknown };
      return { label: String(r.label ?? "unknown"), count: Number(r.count ?? 0) };
    })
    .filter((r) => Number.isFinite(r.count))
    .sort((a, b) => b.count - a.count);
}

export async function fetchAnalytics(): Promise<AnalyticsStats | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("vertex_analytics");
    if (error || !data) return null;
    const raw = data as Record<string, unknown>;
    const totals = (raw.totals ?? {}) as Partial<AnalyticsStats["totals"]>;
    const recent = (raw.recent ?? {}) as Partial<AnalyticsStats["recent"]>;
    return {
      totals: {
        events: Number(totals.events ?? 0),
        views: Number(totals.views ?? 0),
        visitors: Number(totals.visitors ?? 0),
        sessions: Number(totals.sessions ?? 0),
        avg_duration_ms: Number(totals.avg_duration_ms ?? 0),
      },
      recent: {
        last5m: Number(recent.last5m ?? 0),
        unique5m: Number(recent.unique5m ?? 0),
        last24h: Number(recent.last24h ?? 0),
        unique24h: Number(recent.unique24h ?? 0),
      },
      daily: Array.isArray(raw.daily)
        ? (raw.daily as Array<Record<string, unknown>>).map((d) => ({
            day: String(d.day ?? ""),
            views: Number(d.views ?? 0),
            visitors: Number(d.visitors ?? 0),
          }))
        : [],
      hourly: Array.isArray(raw.hourly)
        ? (raw.hourly as Array<Record<string, unknown>>).map((h) => ({ hour: Number(h.hour ?? 0), views: Number(h.views ?? 0) }))
        : [],
      pages: toCounts(raw.pages),
      referrers: toCounts(raw.referrers),
      languages: toCounts(raw.languages),
      browsers: toCounts(raw.browsers),
      os: toCounts(raw.os),
      devices: toCounts(raw.devices),
      apps: toCounts(raw.apps),
    };
  } catch {
    return null;
  }
}

export function subscribeActiveUsers(cb: (count: number) => void): () => void {
  if (!client) {
    cb(0);
    return () => {};
  }
  const refresh = async () => {
    try {
      const since = new Date(Date.now() - 70_000).toISOString();
      const { count } = await client
        .from("vertex_presence")
        .select("visitor_id", { count: "exact", head: true })
        .gte("updated_at", since);
      cb(count ?? 0);
    } catch {
      cb(0);
    }
  };
  void refresh();
  const id = window.setInterval(() => void refresh(), 15_000);
  const channel = client
    .channel("vertex-presence")
    .on("postgres_changes", { event: "*", schema: "public", table: "vertex_presence" }, () => void refresh())
    .subscribe();
  return () => {
    window.clearInterval(id);
    void client.removeChannel(channel);
  };
}
