import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Bot, RotateCcw, Sparkles, Square, User as UserIcon } from "lucide-react";

/**
 * VER-AI — a free, keyless AI assistant that runs inside the console.
 * Talks to the public Pollinations OpenAI-compatible endpoint (no API key, no
 * sign-in) and enforces a client-side daily message budget.
 */

const API_URL = "https://text.pollinations.ai/openai";
const API_MODEL = "openai-fast";
const REQUEST_TIMEOUT_MS = 45_000;
const USAGE_KEY = "vertex-ver-ai-usage-v1";
const CHAT_KEY = "vertex-ver-ai-chat-v1";
const DAILY_LIMIT = 25;
const HISTORY_CAP = 40;

type Msg = { id: string; role: "user" | "ai"; text: string; model?: string; error?: boolean };

const SUGGESTIONS = [
  "Explain quantum computing like I'm 12",
  "Write a Python script that sorts a list of dicts by date",
  "Give me 5 cheap dinner ideas with pasta",
  "Help me write a polite follow-up email to my landlord",
];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { date?: string; count?: number };
      if (parsed && parsed.date === todayKey() && typeof parsed.count === "number") return { date: parsed.date, count: parsed.count };
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), count: 0 };
}

function writeUsage(usage: { date: string; count: number }) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    /* ignore */
  }
}

function readChat(): Msg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((m) => m && (m.role === "user" || m.role === "ai") && typeof m.text === "string") as Msg[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeChat(messages: Msg[]) {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-HISTORY_CAP)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------------------------------------------------------- markdown */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) out.push(<strong key={`${keyBase}-b${i}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={`${keyBase}-c${i}`}>{token.slice(1, -1)}</code>);
    else out.push(<em key={`${keyBase}-i${i}`}>{token.slice(1, -1)}</em>);
    i += 1;
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderRich(text: string): ReactNode {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `n${k++}`;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      nodes.push(
        <pre key={key} className="verai-code">
          {lang ? <span className="verai-code-lang">{lang}</span> : null}
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      nodes.push(<ul key={key}>{items.map((item, n) => <li key={n}>{renderInline(item, `${key}-${n}`)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      nodes.push(<ol key={key}>{items.map((item, n) => <li key={n}>{renderInline(item, `${key}-${n}`)}</li>)}</ol>);
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      nodes.push(<h4 key={key}>{renderInline(trimmed.replace(/^#{1,6}\s+/, ""), key)}</h4>);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      nodes.push(<blockquote key={key}>{renderInline(buf.join(" "), key)}</blockquote>);
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      const nextTrim = next.trim();
      if (!nextTrim) break;
      if (/^\s*[-*]\s+/.test(next)) break;
      if (/^\s*\d+[.)]\s+/.test(next)) break;
      if (/^#{1,6}\s+/.test(nextTrim)) break;
      if (nextTrim.startsWith("```")) break;
      if (/^>\s?/.test(nextTrim)) break;
      para.push(next);
      i += 1;
    }
    nodes.push(<p key={key}>{renderInline(para.join(" "), key)}</p>);
  }

  return <>{nodes}</>;
}

/* ------------------------------------------------------------------ model */

type Payload = { role: "user" | "assistant"; content: string }[];

type AiError = Error & { retryable?: boolean };

function aiFail(message: string, retryable: boolean): AiError {
  const err = new Error(message) as AiError;
  err.retryable = retryable;
  return err;
}

async function streamOnce(payload: Payload, onDelta: (text: string) => void, onThink: (text: string) => void, onStart: () => void, signal: AbortSignal) {
  const requestController = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => requestController.abort();
  signal.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    onStart();
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: API_MODEL, messages: payload, stream: true, private: true, referrer: "vertex-os" }),
      signal: requestController.signal,
    });

    if (!res.ok) {
      if (res.status === 429) throw aiFail("The free AI service is busy. Wait a few seconds, then try again.", true);
      if (res.status === 402) throw aiFail("The free AI model is temporarily unavailable. Try again later.", true);
      if (res.status === 401 || res.status === 403) throw aiFail("The AI service rejected this request. Its free access may have changed, or the network may be blocking it.", false);
      if (res.status === 404) throw aiFail("The free AI model could not be found. The provider may have changed its model list.", false);
      throw aiFail(`The AI service replied with an error (${res.status}).`, res.status >= 500);
    }

    const type = res.headers.get("content-type") || "";

    if (!res.body || !type.includes("text/event-stream")) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) throw aiFail("The AI service returned an empty answer. Try again.", true);
      onDelta(text);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let got = "";
    let thought = "";

    const consumeLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payloadText = trimmed.slice(5).trim();
      if (!payloadText || payloadText === "[DONE]") return;
      let chunk: { choices?: { delta?: { content?: string; reasoning?: string } }[] };
      try {
        chunk = JSON.parse(payloadText) as typeof chunk;
      } catch {
        return;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;
      const reasoning = typeof delta.reasoning === "string" ? delta.reasoning : "";
      const content = typeof delta.content === "string" ? delta.content : "";
      if (reasoning && !got) {
        thought += reasoning;
        onThink(thought.length > 320 ? thought.slice(-320) : thought);
      }
      if (content) {
        got += content;
        onDelta(got);
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    }
    if (buffer.trim()) consumeLine(buffer);
    if (!got) throw aiFail("The AI service closed the connection without answering. Try again.", true);
  } catch (err) {
    if (signal.aborted) throw err;
    if (timedOut) throw aiFail("The AI took too long to respond. Please try again.", true);
    if (err instanceof TypeError) throw aiFail("Could not connect to the AI service. Check your connection or browser shields, then try again.", true);
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", abortFromCaller);
  }
}

/* -------------------------------------------------------------- component */

export function VerAiSurface() {
  const [messages, setMessages] = useState<Msg[]>(() => readChat());
  const [usage, setUsage] = useState(() => readUsage());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const left = Math.max(0, DAILY_LIMIT - usage.count);
  useEffect(() => {
    writeChat(messages);
  }, [messages]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const resetChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setThinking(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;

      const fresh = readUsage();
      if (fresh.count >= DAILY_LIMIT) {
        setUsage(fresh);
        return;
      }

      const userMsg: Msg = { id: uid(), role: "user", text };
      const aiId = uid();
      const history: Msg[] = [...messages, userMsg];
      const aiMsg: Msg = { id: aiId, role: "ai", text: "" };

      setMessages([...history, aiMsg]);
      setInput("");
      setBusy(true);
      setThinking("Waking up the model…");

      const payload: Payload = history
        .filter((m) => !m.error)
        .slice(-HISTORY_CAP)
        .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.text }));

      const controller = new AbortController();
      abortRef.current = controller;

      const paint = (body: string) => {
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: body, model: API_MODEL } : m)));
      };

      let failure: Error | null = null;
      let stopped = false;

      try {
        await streamOnce(payload, (body) => paint(body), (why) => setThinking(why), () => paint(""), controller.signal);
      } catch (err) {
        if (controller.signal.aborted) {
          stopped = true;
        } else {
          failure = err instanceof Error ? err : new Error("Something went wrong.");
        }
      }

      if (stopped) {
        // keep whatever streamed in before the user hit stop
      } else if (failure) {
        const message = failure.message || "Something went wrong.";
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: message, error: true } : m)));
      } else {
        setMessages((prev) => prev.map((m) => (m.id === aiId && !m.text ? { ...m, text: "The AI service closed the connection without answering." } : m)));
      }

      if (!stopped && !failure) {
        const next = readUsage();
        writeUsage({ date: todayKey(), count: next.count + 1 });
        setUsage({ date: todayKey(), count: next.count + 1 });
      }
      setBusy(false);
      setThinking(null);
      abortRef.current = null;
    },
    [busy, input, messages],
  );

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setThinking(null);
  };

  const exhausted = left <= 0;

  return (
    <div className="verai">
      <header className="verai-head">
        <div className="verai-brand">
          <span className="verai-logo"><img src={`${import.meta.env.BASE_URL}images/ver-ai.ico`} alt="" /></span>
          <div>
            <strong>VER-AI</strong>
            <span>Free assistant · {left} message{left === 1 ? "" : "s"} left today</span>
          </div>
        </div>
        <div className="verai-tools">
          <div className="verai-models" aria-label="AI model">
            <span className="verai-model on"><Sparkles size={13} />Smart</span>
          </div>
          <button type="button" className="verai-reset" onClick={resetChat} title="New chat" aria-label="New chat"><RotateCcw size={15} /></button>
        </div>
      </header>

      <div className="verai-log" ref={logRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="verai-intro">
            <span className="verai-intro-badge"><Bot size={22} /></span>
            <h1>Ask VER-AI anything</h1>
            <p>It runs on a free anonymous AI model — no key, no account, no cost. {DAILY_LIMIT} successful replies a day.</p>
            <div className="verai-suggestions">
              {SUGGESTIONS.map((item) => (
                <button key={item} type="button" className="verai-suggestion" onClick={() => void send(item)}>{item}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="verai-thread">
            {messages.map((message) => (
              <div key={message.id} className={`verai-msg ${message.role === "user" ? "me" : "ai"}${message.error ? " bad" : ""}`}>
                <span className="verai-msg-avatar">
                  {message.role === "user" ? <UserIcon size={15} /> : <img src={`${import.meta.env.BASE_URL}images/ver-ai.ico`} alt="" />}
                </span>
                <div className="verai-bubble">
                  {message.role === "ai" && !message.text ? (
                    <span className="verai-thinking">
                      <span className="verai-typing"><i /><i /><i /></span>
                      {thinking ? <span className="verai-think-text">{thinking}</span> : null}
                    </span>
                  ) : (
                    renderRich(message.text)
                  )}
                  {message.role === "ai" && message.model && !message.error ? <span className="verai-model-tag">Smart</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        className="verai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void send();
        }}
      >
        {exhausted ? (
          <div className="verai-limit">You have used all {DAILY_LIMIT} free messages for today. Come back tomorrow — the limit resets at midnight.</div>
        ) : null}
        <div className="verai-input-wrap">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            disabled={exhausted}
            placeholder={exhausted ? "Daily limit reached" : "Message VER-AI..."}
            aria-label="Message VER-AI"
            spellCheck={false}
            onChange={(event) => {
              setInput(event.target.value);
              const el = event.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!busy) void send();
              }
            }}
          />
          {busy ? (
            <button type="button" className="verai-send stop" onClick={stop} aria-label="Stop generating"><Square size={15} fill="currentColor" /></button>
          ) : (
            <button type="submit" className="verai-send" disabled={!input.trim() || exhausted} aria-label="Send message"><ArrowUp size={16} /></button>
          )}
        </div>
        <p className="verai-fineprint">Powered by Pollinations’ free anonymous AI. VER-AI can be wrong — double-check important stuff. Enter to send, Shift+Enter for a new line.</p>
      </form>
    </div>
  );
}

export default VerAiSurface;
