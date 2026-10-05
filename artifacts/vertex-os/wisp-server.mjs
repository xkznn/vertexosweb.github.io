import { server as wisp } from "@mercuryworkshop/wisp-js/server";

// Keep this relay useful for ordinary web pages without making it an unrestricted
// TCP/UDP tunnel. Wisp also blocks private and loopback IP ranges by default.
wisp.options.allow_udp_streams = false;
wisp.options.allow_direct_ip = false;
wisp.options.port_whitelist = [80, 443];

let activeConnections = 0;
const MAX_ACTIVE_CONNECTIONS = 16;

const WISP_PATH = "/api/wisp/";
const ALLOWED_CROSS_ORIGIN_ORIGINS = new Set(["https://vertex-os-site.netlify.app"]);

function rejectUpgrade(socket, status = "403 Forbidden") {
  if (!socket.destroyed) {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
}

export function handleWispUpgrade(request, socket, head) {
  let pathname;
  try {
    pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  } catch {
    rejectUpgrade(socket, "400 Bad Request");
    return;
  }

  if (pathname !== WISP_PATH && pathname !== "/api/wisp") {
    // Let Vite (and any other server handler) process its own WebSocket paths.
    return;
  }

  if (activeConnections >= MAX_ACTIVE_CONNECTIONS) {
    rejectUpgrade(socket, "503 Service Unavailable");
    return;
  }

  const origin = request.headers.origin;
  const host = request.headers.host?.toLowerCase();
  try {
    const originUrl = new URL(origin ?? "");
    const sameOrigin = host && originUrl.host.toLowerCase() === host;
    const explicitlyAllowedOrigin = ALLOWED_CROSS_ORIGIN_ORIGINS.has(originUrl.origin.toLowerCase());
    if (!origin || !host || (!sameOrigin && !explicitlyAllowedOrigin)) {
      rejectUpgrade(socket);
      return;
    }
  } catch {
    rejectUpgrade(socket);
    return;
  }

  // wisp-js selects its protocol from the raw URL, so normalize this to the
  // trailing-slash path even when the request included a query string.
  request.url = WISP_PATH;
  activeConnections += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeConnections = Math.max(0, activeConnections - 1);
  };
  socket.once("close", release);
  socket.once("error", release);
  try {
    wisp.routeRequest(request, socket, head);
  } catch (error) {
    release();
    console.error("Wisp connection setup failed:", error);
    rejectUpgrade(socket, "400 Bad Request");
  }
}
