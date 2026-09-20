// WormGPT same-origin relay — plain JS on purpose. The browser POSTs to
// /api/chat on the SAME origin as the cloak, so school filters (which always
// allow the cloak domain) and CORS policies can't touch it. This serverless
// function makes the real request to the free live provider from Vercel's
// servers — out of the browser network where blockers can't reach.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) return new Response("empty messages", { status: 400 });

  const outbound = {
    model: "openai",
    messages,
  };

  try {
    const up = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(outbound),
    });
    if (!up.ok) {
      const text = await up.text();
      return new Response(text || `upstream ${up.status}`, { status: up.status });
    }
    const text = await up.text();
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`relay upstream error: ${e && e.message ? e.message : String(e)}`, { status: 502 });
  }
}
