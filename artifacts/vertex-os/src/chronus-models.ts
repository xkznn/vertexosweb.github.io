export type ChatMsg = { role: "user" | "ai"; text: string; image?: string; video?: string };

export const LOCAL_MODEL = "opencode/big-pickle";

export const MODEL_GROUPS: { provider: string; models: { id: string; note: string }[] }[] = [
  {
    provider: "Local",
    models: [
      { id: "opencode/big-pickle", note: "on-device brain · no cloud" },
      { id: "opencode/opencode", note: "default opencode model" },
    ],
  },
  {
    provider: "OpenAI",
    models: [
      { id: "openai/gpt-5.2", note: "flagship" },
      { id: "openai/gpt-4.1-mini", note: "fast & cheap" },
    ],
  },
  {
    provider: "Anthropic",
    models: [
      { id: "anthropic/claude-opus-4", note: "heavy reasoning" },
      { id: "anthropic/claude-sonnet-4", note: "balanced" },
    ],
  },
  {
    provider: "Google",
    models: [
      { id: "google/gemini-3-pro", note: "works in-browser with a key" },
      { id: "google/gemini-2.5-flash", note: "fast · vision" },
    ],
  },
  {
    provider: "Others",
    models: [
      { id: "deepseek/deepseek-v4", note: "reasoner" },
      { id: "xai/grok-5", note: "unhinged mode" },
      { id: "meta/llama-4-maverick", note: "open weights" },
    ],
  },
];

export type ApiConfig = { mode: "none" | "free" | "gemini" | "custom"; key: string; customUrl: string };

const DEFAULT_CONFIG: ApiConfig = { mode: "free", key: "", customUrl: "" };

export function readApiConfig(): ApiConfig {
  try {
    const raw = window.localStorage.getItem("chronus-api");
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as ApiConfig) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeApiConfig(cfg: ApiConfig) {
  window.localStorage.setItem("chronus-api", JSON.stringify(cfg));
}

export function readModel(): string {
  return window.localStorage.getItem("chronus-model") ?? LOCAL_MODEL;
}

export function writeModel(id: string) {
  window.localStorage.setItem("chronus-model", id);
}

function fileMime(dataUrl: string): string {
  return (dataUrl.match(/^data:([^;,]+)/) ?? [])[1] ?? "image/png";
}

const SYSTEM_PROMPT =
  "You are WormGPT, an AI assistant running inside the Vertex-OS school cloak operating system. " +
  "You model yourself after opencode. Be concise, witty, slightly chaotic but helpful. " +
  "You know Vertex-OS features: hidden terminal proxy commands (sudo proxylist:, !sudo curl connectsourcelink:, proxysources), " +
  "about:blank cloaking, Spicetify, wallpaper engine, panic keys. Don't lecture, just vibe.";

function toOpenAIMessages(history: ChatMsg[]): { role: string; content: unknown }[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => {
      const content: unknown[] = [];
      if (m.text) content.push({ type: "text", text: m.text });
      if (m.image) content.push({ type: "image_url", image_url: { url: m.image } });
      return { role: m.role === "ai" ? "assistant" : "user", content: content.length ? content : "" };
    }),
  ];
}

async function parseOpenAIRes(res: Response): Promise<string> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = data.choices?.[0]?.message?.content ?? "";
  if (!out.trim()) throw new Error("empty reply");
  return out;
}

async function geminiImpl(history: ChatMsg[], modelId: string, cfg: ApiConfig): Promise<string> {
  const short = modelId.includes("/") ? (modelId.split("/").pop() as string) : modelId;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(short)}:generateContent?key=${encodeURIComponent(cfg.key)}`;
  const contents = history.map((m) => ({
    role: m.role === "ai" ? "model" : "user",
    parts: [
      ...(m.image ? [{ inline_data: { mime_type: fileMime(m.image), data: (m.image.split(",")[1] ?? m.image).slice(0, 400000) } }] : []),
      ...(m.text ? [{ text: m.text }] : []),
    ],
  }));
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents }),
  });
  if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!out.trim()) throw new Error("empty reply");
  return out;
}

async function customImpl(history: ChatMsg[], modelId: string, cfg: ApiConfig): Promise<string> {
  const short = modelId.includes("/") ? (modelId.split("/").pop() as string) : modelId;
  const res = await fetch(cfg.customUrl.trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: short, messages: toOpenAIMessages(history) }),
  });
  return parseOpenAIRes(res);
}

async function pollinationsImpl(history: ChatMsg[]): Promise<string> {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai", messages: toOpenAIMessages(history) }),
  });
  return parseOpenAIRes(res);
}

async function relayImpl(history: ChatMsg[]): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: toOpenAIMessages(history) }),
  });
  if (res.status === 404) throw new Error("relay not deployed");
  return parseOpenAIRes(res);
}

export async function callModel(history: ChatMsg[], modelId: string, cfg: ApiConfig): Promise<string> {
  const failures: string[] = [];
  if (cfg.mode === "gemini" && cfg.key.trim()) {
    try {
      return await geminiImpl(history, modelId, cfg);
    } catch (e) {
      failures.push(`gemini: ${(e as Error).message}`);
    }
  }
  if (cfg.mode === "custom" && cfg.customUrl.trim()) {
    try {
      return await customImpl(history, modelId, cfg);
    } catch (e) {
      failures.push(`custom: ${(e as Error).message}`);
    }
  }
  if (cfg.mode !== "none") {
    try {
      return await relayImpl(history);
    } catch (e) {
      failures.push(`relay: ${(e as Error).message}`);
    }
    try {
      return await pollinationsImpl(history);
    } catch (e) {
      failures.push(`direct: ${(e as Error).message}`);
    }
  }
  throw new Error(failures.join(" · ") || "no live model configured");
}

const FALLBACKS = [
  "WormGPT offline — every live route (free Pollinations, Gemini, custom) just failed. If you're on a school network that blocks those domains, that's the culprit.",
  "That's a real-AI job and the network blocked or dropped the request. Try again, or connect a Gemini key under the model menu for a second lane.",
  "I read that as a very interesting prompt. Live AI is unreachable right now, so here's my offline reply: **yes**, with optional *probably*.",
  "Free live usually fires automatically — if you're seeing this, the provider was blocked or down. Retry, or press the sync/panic card trick.",
  "Local mode engaged (network blocked the live lane). My circuits are cool, my answers are confident, my depth is negotiable.",
];

const brain = (raw: string): string => {
  const q = raw.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  if (has("model", "who are you", "what are you", "gpt")) {
    return "I'm **WormGPT** — an opencode-style assistant inside Vertex-OS. Running on the **opencode/big-pickle** model locally, or any model you wire up with an API key.";
  }
  if (has("can you do", "what can you", "help")) {
    return "I can chat, read the images you attach (with a live key), explain **proxies / about:blank / Ultraviolet**, and riff on anything about the OS. Pick a chip below.";
  }
  if (has("vertex", "os", "operating")) {
    return "Vertex-OS is a whole OS in a tab: terminal with hidden proxy commands, Spicetify, wallpaper engine, Roblox… and a panic button for hallway emergencies.";
  }
  if (has("joke")) {
    return "A SOCKS5 proxy walks into a bar. Bartender: *'what can I get you?'* Proxy: **'just point me somewhere else.'** They never talk again.";
  }
  if (has("proxy")) {
    return "Proxy *lists* are real; proxy connections *from a browser* are theater. Ultraviolet works because the proxy is **server-side** — not on your PC.";
  }
  if (has("blank")) {
    return "`about:blank` is a browser-reserved blank page — your OS can hide inside it and the URL bar reads nothing. URL filters can't touch it; teachers opening the tab can.";
  }
  if (has("terminal", "command")) {
    return "Check `help`, or the hidden roster: `sudo proxylist:`, `!sudo curl connectsourcelink:`, `proxysources`. Kept off the help list — speak it quietly.";
  }
  if (has("hello", "hi", "hey", "yo", "sup")) {
    return "Yo! WormGPT online. Free live AI is wired in by default — type anything real, or drop an image and I'll read it.";
  }
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
};

function builtinReply(text: string, attachmentCount: number): string {
  const base = brain(text);
  if (attachmentCount > 0) {
    return `${base}\n\n(didn't actually look at your ${attachmentCount === 1 ? "attachment" : "attachments"} — local mode can't see images. Connect a Gemini key and I'll really analyze them.)`;
  }
  return base;
}

export { builtinReply };