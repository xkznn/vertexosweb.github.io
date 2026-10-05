import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import Peer from "peerjs";
import type { MediaConnection } from "peerjs";

type IceEntry = { urls: string | string[]; username?: string; credential?: string };
const ID_PREFIX = "vertex-u-";
const GROUP_PREFIX = "group:";
const ICE: IceEntry[] = (() => {
  const servers: IceEntry[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUser = import.meta.env.VITE_TURN_USER;
  const turnPass = import.meta.env.VITE_TURN_PASS;
  if (turnUrl) servers.push({ urls: turnUrl.split(","), username: turnUser, credential: turnPass });
  return servers;
})();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();
const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export const messagesBackendConfigured = Boolean(supabase);
export const peerIdFor = (username: string) => `${ID_PREFIX}${username.trim().toLowerCase()}`;
export const groupKey = (id: string) => `${GROUP_PREFIX}${id}`;

export type NetStatus = "offline" | "connecting" | "online";
export interface NetProfile {
  username: string;
  name: string;
  status: "online" | "idle" | "offline";
  avatarKind: "preset" | "custom";
  avatarId: number;
  avatarData?: string;
}
export interface NetMessage {
  id: string;
  peer: string;
  from: string;
  text: string;
  at: number;
  edited?: boolean;
  deleted?: boolean;
  seen?: boolean;
  readByMe?: boolean;
  seenAt?: number;
  media?: { kind: "image" | "video"; url: string; name: string };
}
export interface NetRequest {
  id: string;
  username: string;
  name: string;
  kind: "contact" | "group";
  groupId?: string;
  direction: "incoming" | "outgoing";
  at: number;
}
export interface NetGroup {
  id: string;
  title: string;
  members: string[];
}
export type NetEvent =
  | { t: "status"; status: NetStatus; detail?: string }
  | { t: "presence"; users: NetProfile[] }
  | { t: "directory"; users: NetProfile[] }
  | { t: "connections"; contacts: string[]; requests: NetRequest[]; groups: NetGroup[] }
  | { t: "message"; message: NetMessage }
  | { t: "message-removed"; id: string }
  | { t: "message-seen"; id: string; at: number }
  | { t: "incoming-call"; from: string; kind: "voice" | "video"; callId: string }
  | { t: "call-ended"; callId: string; from: string };

type Listener = (e: NetEvent) => void;
type ProfileRow = { id: string; username: string; display_name: string; status: NetProfile["status"]; avatar_kind: NetProfile["avatarKind"]; avatar_id: number };
type MessageRow = {
  id: string; sender_id: string; recipient_id: string | null; group_id: string | null; body: string;
  media_path: string | null; media_kind: "image" | "video" | null; media_name: string | null;
  created_at: string; edited_at: string | null; deleted_at: string | null;
};
type PresencePayload = NetProfile & { userId: string };
type RequestRow = { id: string; sender_id: string; recipient_id: string; status: "pending" | "accepted" | "declined"; created_at: string };
type GroupInviteRow = { id: string; group_id: string; sender_id: string; recipient_id: string; status: "pending" | "accepted" | "declined"; created_at: string };

let peer: Peer | null = null;
let myProfile: NetProfile | null = null;
let myUserId: string | null = null;
let presenceChannel: RealtimeChannel | null = null;
let messagesChannel: RealtimeChannel | null = null;
let generation = 0;
let preparingDirectory: Promise<void> | null = null;
const listeners = new Set<Listener>();
const mediaConns = new Map<string, MediaConnection>();
const directory = new Map<string, NetProfile>();
const usernameById = new Map<string, string>();
const onlineProfiles = new Map<string, NetProfile>();
const contacts = new Set<string>();
const groups = new Map<string, NetGroup>();

let activeUsername: string | null = null;
let currentStatus: NetStatus = "offline";
let presenceOk = false;
let peerAlive = false;
let failStreak = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1200;
let channelRetryTimer: ReturnType<typeof setTimeout> | null = null;
let channelRetryDelay = 1200;
let peerRetryTimer: ReturnType<typeof setTimeout> | null = null;
let peerRetryDelay = 1500;
let peerFaults = 0;
let peerBornAt = 0;
let watchdog: ReturnType<typeof setInterval> | null = null;

const emit = (e: NetEvent) => listeners.forEach((l) => l(e));
export function onNet(l: Listener): () => void { listeners.add(l); return () => listeners.delete(l); }
export function netStatus(): NetStatus { return supabase && myUserId ? "online" : "offline"; }
export function netId(): string | null { return peer?.id ?? null; }
export function isContact(username: string): boolean { return contacts.has(username.trim().toLowerCase()); }
/** True only when the call-signalling peer is genuinely usable right now. */
export function callsReady(): boolean { return Boolean(peer && !peer.destroyed && peerAlive); }

function setStatus(status: NetStatus, detail?: string) {
  currentStatus = status;
  emit({ t: "status", status, detail });
}
function clearTimer(t: ReturnType<typeof setTimeout> | null) { if (t) clearTimeout(t); }
function markHealthy() {
  failStreak = 0; retryDelay = 1200; channelRetryDelay = 1200; peerRetryDelay = 1500; peerFaults = 0;
}
function fatalConnectError(message: string): boolean {
  return /already registered|choose a messages profile|messages_setup/i.test(message);
}
/** A recoverable hiccup: say "connecting" and heal it in the background instead of latching offline. */
function noteTransient(detail: string) {
  failStreak += 1;
  setStatus(failStreak >= 8 ? "offline" : "connecting", detail);
  reconnectChannels();
}
function scheduleReconnect() {
  if (!activeUsername || !myProfile) return;
  if (retryTimer) return;
  const delay = retryDelay;
  retryDelay = Math.min(20000, Math.round(retryDelay * 1.8));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (activeUsername) connect(activeUsername);
  }, delay);
}
/** Full rebuild (auth + channels + call peer). Manual escape hatch and last-resort healer. */
export function reconnectNow(): void {
  clearTimer(retryTimer); retryTimer = null;
  clearTimer(channelRetryTimer); channelRetryTimer = null;
  clearTimer(peerRetryTimer); peerRetryTimer = null;
  markHealthy();
  if (activeUsername) connect(activeUsername);
}
function profileFromRow(row: ProfileRow): NetProfile {
  return { username: row.username, name: row.display_name || row.username, status: "offline", avatarKind: row.avatar_kind, avatarId: row.avatar_id };
}
function emitRoster() {
  const profiles = [...directory.values()].map((p) => onlineProfiles.get(p.username) ?? { ...p, status: "offline" as const });
  emit({ t: "directory", users: profiles });
  emit({ t: "presence", users: [...onlineProfiles.values()] });
}
function updatePresence() {
  if (!presenceChannel) return;
  const state = presenceChannel.presenceState<PresencePayload>();
  onlineProfiles.clear();
  for (const entries of Object.values(state)) for (const entry of entries) {
    const u = entry.username?.trim().toLowerCase();
    if (!u) continue;
    const normalized = { ...entry, username: u };
    onlineProfiles.set(u, normalized);
    directory.set(u, normalized);
  }
  emitRoster();
}
function toDbProfile(p: NetProfile, id: string) {
  return { id, username: p.username.trim().toLowerCase(), display_name: p.name.trim().slice(0, 64) || p.username,
    status: p.status, avatar_kind: p.avatarKind, avatar_id: Math.max(0, Math.min(11, Math.trunc(p.avatarId) || 0)) };
}
async function saveProfile(p: NetProfile, userId: string, run: number) {
  if (!supabase) return;
  const { error } = await supabase.from("profiles").upsert(toDbProfile(p, userId), { onConflict: "id" });
  if (run !== generation) return;
  if (error) throw new Error(error.code === "23505" ? `@${p.username} is already registered. Choose another username.` : error.message);
  directory.set(p.username.toLowerCase(), { ...p, username: p.username.toLowerCase() });
  usernameById.set(userId, p.username.toLowerCase());
  if (presenceChannel) {
    const result = await presenceChannel.track({ ...p, username: p.username.toLowerCase(), userId });
    if (result !== "ok") throw new Error("Could not publish your online status. Check the Supabase Realtime policies.");
  }
  emitRoster();
}
async function loadDirectory(run: number) {
  if (!supabase) return;
  const { data, error } = await supabase.from("profiles").select("id,username,display_name,status,avatar_kind,avatar_id").order("username");
  if (run !== generation) return;
  if (error) throw new Error(`Could not load people: ${error.message}`);
  directory.clear();
  usernameById.clear();
  for (const row of (data ?? []) as ProfileRow[]) {
    directory.set(row.username, profileFromRow(row));
    usernameById.set(row.id, row.username);
  }
  emitRoster();
}

async function loadConnections(run: number) {
  if (!supabase || !myUserId) return;
  const id = myUserId;
  const [{ data: requestRows, error: requestError }, { data: inviteRows, error: inviteError }] = await Promise.all([
    supabase.from("friend_requests").select("id,sender_id,recipient_id,status,created_at").or(`sender_id.eq.${id},recipient_id.eq.${id}`),
    supabase.from("group_invites").select("id,group_id,sender_id,recipient_id,status,created_at").or(`sender_id.eq.${id},recipient_id.eq.${id}`),
  ]);
  if (run !== generation) return;
  if (requestError || inviteError) throw new Error(`Could not load invitations: ${(requestError ?? inviteError)?.message}`);
  const rows = (requestRows ?? []) as RequestRow[];
  contacts.clear();
  const requests: NetRequest[] = [];
  for (const row of rows) {
    const isSender = row.sender_id === id;
    const otherId = isSender ? row.recipient_id : row.sender_id;
    const username = usernameById.get(otherId);
    if (!username) continue;
    if (row.status === "accepted") contacts.add(username);
    if (row.status === "pending") requests.push({ id: row.id, username, name: directory.get(username)?.name ?? username, kind: "contact", direction: isSender ? "outgoing" : "incoming", at: new Date(row.created_at).getTime() });
  }
  groups.clear();
  const { data: memberships, error: memberError } = await supabase.from("group_members").select("group_id").eq("user_id", id);
  if (run !== generation) return;
  if (memberError) throw new Error(`Could not load groups: ${memberError.message}`);
  const memberGroupIds = [...new Set((memberships ?? []).map((m: { group_id: string }) => m.group_id))];
  const pendingInvites = ((inviteRows ?? []) as GroupInviteRow[]).filter((invite) => invite.status === "pending");
  const inviteGroupIds = pendingInvites.map((invite) => invite.group_id);
  const groupIds = [...new Set([...memberGroupIds, ...inviteGroupIds])];
  let groupRows: { id: string; title: string }[] = [];
  let memberRows: { group_id: string; user_id: string }[] = [];
  if (groupIds.length) {
    const [{ data: fetchedGroups, error: groupError }, { data: fetchedMembers, error: rosterError }] = await Promise.all([
      supabase.from("groups").select("id,title").in("id", groupIds),
      memberGroupIds.length ? supabase.from("group_members").select("group_id,user_id").in("group_id", memberGroupIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (run !== generation) return;
    if (groupError || rosterError) throw new Error(`Could not load group conversations: ${(groupError ?? rosterError)?.message}`);
    groupRows = (fetchedGroups ?? []) as { id: string; title: string }[];
    memberRows = (fetchedMembers ?? []) as { group_id: string; user_id: string }[];
  }
  for (const g of groupRows.filter((item) => memberGroupIds.includes(item.id))) {
    const members = memberRows.filter((m) => m.group_id === g.id)
      .map((m) => usernameById.get(m.user_id)).filter((name): name is string => Boolean(name));
    groups.set(g.id, { id: g.id, title: g.title, members });
  }
  for (const invite of pendingInvites) {
    const isSender = invite.sender_id === id;
    const otherUsername = usernameById.get(isSender ? invite.recipient_id : invite.sender_id);
    const title = groupRows.find((g) => g.id === invite.group_id)?.title;
    if (otherUsername && title) requests.push({ id: invite.id, username: otherUsername, name: title, kind: "group", groupId: invite.group_id, direction: isSender ? "outgoing" : "incoming", at: new Date(invite.created_at).getTime() });
  }
  emit({ t: "connections", contacts: [...contacts], requests, groups: [...groups.values()] });
}

export function prepareMessagesDirectory(): Promise<void> {
  if (!supabase) {
    setStatus("offline", "Messages needs a Supabase project. Follow MESSAGES_SETUP.md and add its URL and publishable key.");
    return Promise.resolve();
  }
  if (preparingDirectory) return preparingDirectory;
  const run = generation;
  preparingDirectory = (async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (run !== generation) return;
      if (sessionError) throw new Error(sessionError.message);
      let user = sessionData.session?.user ?? null;
      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (run !== generation) return;
        if (error || !data.user) throw new Error(error?.message ?? "Could not create an anonymous Messages account.");
        user = data.user;
      }
      myUserId = user.id;
      await loadDirectory(run);
      await loadConnections(run);
    } catch (error) {
      if (run !== generation) return;
      setStatus("offline", error instanceof Error ? error.message : "Could not load Messages users.");
    }
  })().finally(() => { preparingDirectory = null; });
  return preparingDirectory;
}

async function emitRows(rows: MessageRow[], run: number) {
  if (!supabase || !myUserId || rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  const paths = [...new Set(rows.map((r) => r.media_path).filter((p): p is string => Boolean(p)))];
  const [{ data: receiptRows }, signed] = await Promise.all([
    supabase.from("message_receipts").select("message_id,reader_id,read_at").in("message_id", ids),
    paths.length ? supabase.storage.from("chat-media").createSignedUrls(paths, 60 * 60) : Promise.resolve({ data: [] as { path?: string; signedUrl?: string }[] }),
  ]);
  if (run !== generation) return;
  const urlByPath = new Map<string, string>();
  for (const entry of signed.data ?? []) if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  for (const row of rows) {
    const mine = row.sender_id === myUserId;
    const group = row.group_id ? groups.get(row.group_id) : null;
    const otherId = mine ? row.recipient_id : row.sender_id;
    const peerName = row.group_id ? groupKey(row.group_id) : usernameById.get(otherId ?? "") ?? "unknown";
    const receipts = (receiptRows ?? []).filter((r: { message_id: string }) => r.message_id === row.id) as { reader_id: string; read_at: string }[];
    const lastSeen = mine ? receipts.filter((r) => r.reader_id !== myUserId).sort((a, b) => b.read_at.localeCompare(a.read_at))[0] : undefined;
    emit({ t: "message", message: {
      id: row.id, peer: peerName, from: mine ? "me" : (usernameById.get(row.sender_id) ?? "unknown"),
      text: row.body, at: new Date(row.created_at).getTime(), edited: Boolean(row.edited_at), deleted: Boolean(row.deleted_at),
      seen: Boolean(lastSeen), ...(lastSeen ? { seenAt: new Date(lastSeen.read_at).getTime() } : {}), readByMe: !mine && receipts.some((r) => r.reader_id === myUserId),
      ...(!row.deleted_at && row.media_path && row.media_kind && urlByPath.has(row.media_path)
        ? { media: { kind: row.media_kind, url: urlByPath.get(row.media_path)!, name: row.media_name || "attachment" } } : {}),
    } });
  }
}

async function loadHistory(run: number) {
  if (!supabase || !myUserId) return;
  const id = myUserId;
  const { data: directRows, error } = await supabase.from("messages")
    .select("id,sender_id,recipient_id,group_id,body,media_path,media_kind,media_name,created_at,edited_at,deleted_at")
    .or(`sender_id.eq.${id},recipient_id.eq.${id}`).is("group_id", null).order("created_at", { ascending: true }).limit(500);
  if (run !== generation) return;
  if (error) throw new Error(`Could not load message history: ${error.message}`);
  const groupIds = [...groups.keys()];
  let groupRows: MessageRow[] = [];
  if (groupIds.length) {
    const { data, error: groupError } = await supabase.from("messages")
      .select("id,sender_id,recipient_id,group_id,body,media_path,media_kind,media_name,created_at,edited_at,deleted_at")
      .in("group_id", groupIds).order("created_at", { ascending: true }).limit(500);
    if (run !== generation) return;
    if (groupError) throw new Error(`Could not load group history: ${groupError.message}`);
    groupRows = (data ?? []) as MessageRow[];
  }
  await emitRows([...(directRows ?? []) as MessageRow[], ...groupRows].sort((a, b) => a.created_at.localeCompare(b.created_at)), run);
}

/** Rebuild just the Realtime channels, leaving the call peer (and any live call) untouched. */
function reconnectChannels() {
  if (!supabase || !myUserId || !activeUsername || !myProfile) { scheduleReconnect(); return; }
  if (channelRetryTimer) return;
  const delay = channelRetryDelay;
  channelRetryDelay = Math.min(15000, Math.round(channelRetryDelay * 1.8));
  setStatus("connecting", "Reconnecting to the Messages server…");
  channelRetryTimer = setTimeout(() => {
    channelRetryTimer = null;
    const run = generation;
    const id = myUserId;
    const normalized = activeUsername;
    if (run !== generation || !id || !normalized) { scheduleReconnect(); return; }
    if (presenceChannel) void supabase.removeChannel(presenceChannel);
    if (messagesChannel) void supabase.removeChannel(messagesChannel);
    presenceChannel = null; messagesChannel = null; presenceOk = false;
    try { buildChannels(run, id, normalized); } catch { scheduleReconnect(); }
  }, delay);
}

/** Re-create the call peer when its signalling socket died or the id was still taken. */
function retryPeer() {
  if (!activeUsername) return;
  if (peerRetryTimer) return;
  if (peer && !peer.destroyed && peerAlive) return;
  if (peer && Date.now() - peerBornAt < 4000) return;
  if (peerFaults > 14) return;
  const delay = peerRetryDelay;
  peerRetryDelay = Math.min(10000, Math.round(peerRetryDelay * 1.7));
  peerRetryTimer = setTimeout(() => {
    peerRetryTimer = null;
    const run = generation;
    const normalized = activeUsername;
    if (!normalized || run !== generation) return;
    peerFaults += 1;
    startPeerCalls(normalized);
  }, delay);
}

function revivePeer() {
  const current = peer;
  const run = generation;
  if (!current || current.destroyed || !activeUsername || run !== generation) { retryPeer(); return; }
  peerAlive = false;
  try { current.reconnect(); } catch { retryPeer(); return; }
  setTimeout(() => { if (run === generation && peer === current && !peerAlive) retryPeer(); }, 8000);
}

function startWatchdog() {
  if (watchdog) return;
  watchdog = setInterval(() => {
    if (!activeUsername) return;
    if (!peer || peer.destroyed || !peerAlive) retryPeer();
    if (!presenceOk || currentStatus !== "online") reconnectChannels();
  }, 5000);
}

function startPeerCalls(username: string) {
  if (peer && !peer.destroyed) { try { peer.destroy(); } catch { /* noop */ } }
  mediaConns.clear();
  peerAlive = false;
  const callPeer = new Peer(peerIdFor(username), { debug: 0, config: { iceServers: ICE } });
  peer = callPeer;
  peerBornAt = Date.now();
  const run = generation;
  callPeer.on("open", () => {
    peerAlive = true; peerFaults = 0; peerRetryDelay = 1500;
    clearTimer(peerRetryTimer); peerRetryTimer = null;
  });
  callPeer.on("disconnected", () => { if (!callPeer.destroyed) revivePeer(); });
  callPeer.on("close", () => { if (run === generation) revivePeer(); });
  callPeer.on("error", (error: { type?: string } | undefined) => {
    if (run !== generation) return;
    const type = error?.type ?? "";
    if (type === "peer-unavailable") return;
    if (type === "browser-incompatible") { setStatus("offline", "This browser cannot use Messages calls. Try Chrome, Edge, Firefox or Safari."); return; }
    if (type === "unavailable-id") peerRetryDelay = Math.max(peerRetryDelay, 2500);
    peerAlive = false;
    retryPeer();
  });
  callPeer.on("call", (conn) => {
    const from = conn.peer.startsWith(ID_PREFIX) ? conn.peer.slice(ID_PREFIX.length) : conn.peer;
    mediaConns.set(conn.peer, conn);
    const kind = (conn.metadata as { kind?: string } | undefined)?.kind === "video" ? "video" : "voice";
    emit({ t: "incoming-call", from, kind, callId: conn.connectionId });
    conn.on("close", () => { mediaConns.delete(conn.peer); emit({ t: "call-ended", callId: conn.connectionId, from }); });
    conn.on("error", () => mediaConns.delete(conn.peer));
  });
}

function buildChannels(run: number, userId: string, normalized: string) {
  if (!supabase) return;
  presenceOk = false;
  presenceChannel = supabase.channel("vertex-presence", { config: { private: true, presence: { key: userId } } });
  presenceChannel.on("presence", { event: "sync" }, updatePresence);
  presenceChannel.subscribe((status) => {
    if (run !== generation) return;
    if (status === "SUBSCRIBED") {
      updatePresence();
      if (!myProfile) { presenceOk = true; markHealthy(); setStatus("online"); return; }
      void presenceChannel?.track({ ...myProfile, username: normalized, userId }).then((result) => {
        if (run !== generation) return;
        if (result && result !== "ok") { noteTransient("Could not publish your online status. Retrying…"); return; }
        presenceOk = true; markHealthy(); setStatus("online");
      }).catch(() => noteTransient("Could not publish your online status. Retrying…"));
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      presenceOk = false;
      noteTransient("Lost the Messages server. Reconnecting…");
    }
  });

  messagesChannel = supabase.channel(`vertex-messages-${userId}`, { config: { private: true } });
  messagesChannel.on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
    if (payload.eventType === "DELETE") emit({ t: "message-removed", id: String((payload.old as { id?: string }).id ?? "") });
    else void emitRows([payload.new as MessageRow], run);
  });
  messagesChannel.on("postgres_changes", { event: "*", schema: "public", table: "message_receipts" }, (payload) => {
    if (payload.eventType === "DELETE") return;
    const receipt = payload.new as { message_id?: string; reader_id?: string; read_at?: string };
    if (receipt.message_id && receipt.reader_id !== myUserId) emit({ t: "message-seen", id: receipt.message_id, at: receipt.read_at ? new Date(receipt.read_at).getTime() : Date.now() });
  });
  for (const table of ["friend_requests", "group_members", "group_invites"] as const) {
    messagesChannel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      // A failed contact refresh must never knock the whole app offline.
      void loadConnections(run).catch(() => { /* the roster refreshes on the next update */ });
    });
  }
  messagesChannel.subscribe((status) => {
    if (run !== generation) return;
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") noteTransient("Lost the Messages server. Reconnecting…");
  });
}

export function connect(username: string): void {
  disconnect();
  activeUsername = username.trim().toLowerCase();
  markHealthy();
  const run = generation;
  const normalized = activeUsername;
  setStatus("connecting");
  if (!supabase) { setStatus("offline", "Messages needs a Supabase project. Follow MESSAGES_SETUP.md and add its URL and publishable key."); return; }
  void (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (run !== generation) return;
    if (sessionError) throw new Error(`Could not restore your Messages account: ${sessionError.message}`);
    let user = sessionData.session?.user ?? null;
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (run !== generation) return;
      if (error || !data.user) throw new Error(`Could not create your Messages account: ${error?.message ?? "unknown error"}`);
      user = data.user;
    }
    myUserId = user.id;
    if (!myProfile) throw new Error("Choose a Messages profile first.");
    await saveProfile(myProfile, user.id, run);
    await loadDirectory(run);
    await loadConnections(run);
    await loadHistory(run);
    if (run !== generation) return;

    buildChannels(run, user.id, normalized);
    startPeerCalls(normalized);
    startWatchdog();
  })().catch((error: unknown) => {
    if (run !== generation) return;
    myUserId = null;
    const message = error instanceof Error ? error.message : "Could not connect to Messages.";
    if (fatalConnectError(message)) { setStatus("offline", message); return; }
    failStreak += 1;
    setStatus(failStreak >= 5 ? "offline" : "connecting", message);
    scheduleReconnect();
  });
}

export function setProfile(p: NetProfile): void {
  myProfile = { ...p, username: p.username.trim().toLowerCase() };
  const id = myUserId; const run = generation;
  if (id && supabase) void saveProfile(myProfile, id, run).catch((error: unknown) => emit({ t: "status", status: "online", detail: error instanceof Error ? error.message : "Could not save your profile." }));
}
export function isOnline(username: string): boolean {
  const profile = onlineProfiles.get(username.trim().toLowerCase());
  return Boolean(profile && profile.status !== "offline");
}

async function findRecipient(username: string): Promise<string> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected. Check the Supabase setup and try again.");
  const normalized = username.trim().toLowerCase();
  const { data: profile, error } = await supabase.from("profiles").select("id").eq("username", normalized).maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile?.id) throw new Error(`@${normalized} has not set up Messages yet. Check the username.`);
  if (profile.id === myUserId) throw new Error("You cannot message yourself.");
  const { data: request, error: requestError } = await supabase.from("friend_requests").select("id")
    .eq("status", "accepted").or(`and(sender_id.eq.${myUserId},recipient_id.eq.${profile.id}),and(sender_id.eq.${profile.id},recipient_id.eq.${myUserId})`).limit(1).maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error(`Accept @${normalized}'s contact request before sending messages.`);
  return profile.id as string;
}
function currentGroupId(key: string): string | null { return key.startsWith(GROUP_PREFIX) ? key.slice(GROUP_PREFIX.length) : null; }
async function insertMessage(peerName: string, id: string, body: string, media?: { path: string; kind: "image" | "video"; name: string }) {
  if (!supabase || !myUserId) throw new Error("Messages is not connected. Check the Supabase setup and try again.");
  const groupId = currentGroupId(peerName);
  const target = groupId ? { group_id: groupId, recipient_id: null } : { group_id: null, recipient_id: await findRecipient(peerName) };
  const { error } = await supabase.from("messages").insert({ id, sender_id: myUserId, ...target, body: body.trim().slice(0, 4000),
    ...(media ? { media_path: media.path, media_kind: media.kind, media_name: media.name.slice(0, 255) } : {}) });
  if (error) throw new Error(error.message);
}
export async function sendText(to: string, id: string, text: string): Promise<void> { await insertMessage(to, id, text); }
export async function sendMedia(to: string, id: string, blob: Blob, kind: "image" | "video", name: string, body = ""): Promise<void> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected. Check the Supabase setup and try again.");
  if (!currentGroupId(to)) await findRecipient(to);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : kind === "image" ? "jpg" : "mp4";
  const path = `${myUserId}/${id}.${ext || (kind === "image" ? "jpg" : "mp4")}`;
  const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, blob, {
    contentType: blob.type || (kind === "image" ? "image/jpeg" : "video/mp4"), cacheControl: "3600", upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);
  try { await insertMessage(to, id, body, { path, kind, name }); }
  catch (error) { await supabase.storage.from("chat-media").remove([path]); throw error; }
}

export async function sendContactRequest(username: string): Promise<"accepted" | "pending"> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected.");
  const normalized = username.trim().toLowerCase();
  const { data: target, error: findError } = await supabase.from("profiles").select("id").eq("username", normalized).maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!target) throw new Error(`@${normalized} has not set up Messages yet.`);
  if (target.id === myUserId) throw new Error("You cannot add yourself.");
  const { data: prior, error: priorError } = await supabase.from("friend_requests").select("id,status,sender_id,recipient_id")
    .or(`and(sender_id.eq.${myUserId},recipient_id.eq.${target.id}),and(sender_id.eq.${target.id},recipient_id.eq.${myUserId})`);
  if (priorError) throw new Error(priorError.message);
  if ((prior ?? []).some((r: { status: string }) => r.status === "accepted")) return "accepted";
  if ((prior ?? []).some((r: { status: string }) => r.status === "pending")) return "pending";
  const ownDeclined = (prior ?? []).find((r: { status: string; sender_id: string }) => r.status === "declined" && r.sender_id === myUserId);
  if (ownDeclined) {
    const { error } = await supabase.from("friend_requests").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", ownDeclined.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("friend_requests").insert({ sender_id: myUserId, recipient_id: target.id, status: "pending" });
    if (error) throw new Error(error.message);
  }
  await loadConnections(generation);
  return "pending";
}
export async function decideContactRequest(id: string, accept: boolean): Promise<void> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected.");
  const { error } = await supabase.from("friend_requests").update({ status: accept ? "accepted" : "declined", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await loadConnections(generation);
}
export async function decideGroupInvitation(id: string, groupId: string, accept: boolean): Promise<void> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected.");
  const { error } = await supabase.from("group_invites").update({ status: accept ? "accepted" : "declined", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  if (accept) {
    const { error: memberError } = await supabase.from("group_members").insert({ group_id: groupId, user_id: myUserId });
    if (memberError) throw new Error(memberError.message);
  }
  await loadConnections(generation);
}
export async function createGroup(title: string, usernames: string[]): Promise<NetGroup> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected.");
  const cleanTitle = title.trim().slice(0, 64);
  if (!cleanTitle) throw new Error("Enter a name for the group.");
  const selected = [...new Set(usernames.map((u) => u.trim().toLowerCase()).filter(Boolean))];
  for (const name of selected) if (!isContact(name)) throw new Error(`Add @${name} as a contact first.`);
  const { data: group, error } = await supabase.from("groups").insert({ title: cleanTitle, created_by: myUserId }).select("id,title").single();
  if (error || !group) throw new Error(error?.message ?? "Could not create group.");
  const { error: ownerError } = await supabase.from("group_members").insert([{ group_id: group.id, user_id: myUserId, role: "owner" }]);
  if (ownerError) throw new Error(ownerError.message);
  if (selected.length) {
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,username").in("username", selected);
    if (profileError) throw new Error(profileError.message);
    const invites = (profiles ?? []).filter((p: { id: string }) => p.id !== myUserId).map((p: { id: string }) => ({ group_id: group.id, sender_id: myUserId, recipient_id: p.id }));
    if (invites.length) {
      const { error: inviteError } = await supabase.from("group_invites").insert(invites);
      if (inviteError) throw new Error(inviteError.message);
    }
  }
  await loadConnections(generation);
  return groups.get(group.id) ?? { id: group.id, title: group.title, members: [myProfile?.username ?? ""] };
}
export async function editMessage(id: string, text: string): Promise<void> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected.");
  const body = text.trim().slice(0, 4000);
  if (!body) throw new Error("A message cannot be empty.");
  const { error } = await supabase.from("messages").update({ body, edited_at: new Date().toISOString() }).eq("id", id).eq("sender_id", myUserId);
  if (error) throw new Error(error.message);
}
export async function unsendMessage(id: string): Promise<void> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected.");
  const { data } = await supabase.from("messages").select("media_path").eq("id", id).eq("sender_id", myUserId).maybeSingle();
  const { error } = await supabase.from("messages").update({ body: "", deleted_at: new Date().toISOString() }).eq("id", id).eq("sender_id", myUserId);
  if (error) throw new Error(error.message);
  if (data?.media_path) await supabase.storage.from("chat-media").remove([data.media_path]);
}
export async function deleteMessage(id: string): Promise<void> {
  if (!supabase || !myUserId) throw new Error("Messages is not connected.");
  const { data } = await supabase.from("messages").select("media_path").eq("id", id).eq("sender_id", myUserId).maybeSingle();
  const { error } = await supabase.from("messages").delete().eq("id", id).eq("sender_id", myUserId);
  if (error) throw new Error(error.message);
  if (data?.media_path) await supabase.storage.from("chat-media").remove([data.media_path]);
}
export async function markMessagesRead(ids: string[]): Promise<void> {
  if (!supabase || !myUserId || ids.length === 0) return;
  const rows = [...new Set(ids)].slice(0, 100).map((message_id) => ({ message_id, reader_id: myUserId!, read_at: new Date().toISOString() }));
  const { error } = await supabase.from("message_receipts").upsert(rows, { onConflict: "message_id,reader_id" });
  if (error) throw new Error(error.message);
}

export async function getLocalStream(kind: "voice" | "video"): Promise<MediaStream> {
  if (kind === "voice") return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } }); }
  catch {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!canvas.captureStream || !context) return audio;
    context.fillStyle = "#111827"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#dbeafe"; context.font = "24px sans-serif"; context.textAlign = "center";
    context.fillText("Camera off · audio connected", canvas.width / 2, canvas.height / 2);
    const placeholder = canvas.captureStream(5).getVideoTracks()[0];
    if (placeholder) { placeholder.enabled = false; audio.addTrack(placeholder); }
    return audio;
  }
}
export async function placeCall(to: string, kind: "voice" | "video", stream?: MediaStream): Promise<MediaConnection> {
  const caller = peer;
  if (!caller || caller.destroyed || !peerAlive) { retryPeer(); throw new Error("Call service is reconnecting — try again in a moment."); }
  const local = stream ?? (await getLocalStream(kind));
  if (caller.destroyed || !peerAlive) { local.getTracks().forEach((t) => t.stop()); throw new Error("Call service is reconnecting — try again in a moment."); }
  const conn = caller.call(peerIdFor(to), local, { metadata: { kind } });
  mediaConns.set(conn.peer, conn);
  conn.on("close", () => { mediaConns.delete(conn.peer); emit({ t: "call-ended", callId: conn.connectionId, from: conn.peer.startsWith(ID_PREFIX) ? conn.peer.slice(ID_PREFIX.length) : conn.peer }); });
  return conn;
}
export function getMediaConn(username: string): MediaConnection | undefined { return mediaConns.get(peerIdFor(username)); }
export function answerCall(username: string, stream: MediaStream): MediaConnection | undefined {
  const conn = mediaConns.get(peerIdFor(username)); if (!conn) return undefined; conn.answer(stream); return conn;
}
export function endCall(username: string): void {
  const conn = mediaConns.get(peerIdFor(username)); if (conn) { try { conn.close(); } catch { /* noop */ } }
  mediaConns.delete(peerIdFor(username));
}
export function disconnect(): void {
  generation += 1;
  activeUsername = null; presenceOk = false; peerAlive = false; currentStatus = "offline";
  clearTimer(retryTimer); retryTimer = null;
  clearTimer(channelRetryTimer); channelRetryTimer = null;
  clearTimer(peerRetryTimer); peerRetryTimer = null;
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
  if (presenceChannel && supabase) void supabase.removeChannel(presenceChannel);
  if (messagesChannel && supabase) void supabase.removeChannel(messagesChannel);
  presenceChannel = null; messagesChannel = null; myUserId = null;
  onlineProfiles.clear(); directory.clear(); usernameById.clear(); contacts.clear(); groups.clear();
  for (const c of mediaConns.values()) { try { c.close(); } catch { /* noop */ } }
  mediaConns.clear(); try { peer?.destroy(); } catch { /* noop */ } peer = null;
  emitRoster(); setStatus("offline");
}
