import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "./chronus-models";
import {
  MODEL_GROUPS, LOCAL_MODEL, readModel, writeModel,
  readApiConfig, writeApiConfig, builtinReply, callModel,
  type ApiConfig,
} from "./chronus-models";

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const asset = (path: string) => `${base}${path}`;

const SUGGESTIONS = [
  "What model are you?",
  "Tell me about Vertex-OS",
  "What is actually a proxy?",
  "Teach me one new thing",
];

function opencode(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) out.push(<strong key={i}>{part}</strong>);
    else if (part !== "") out.push(part);
  });
  return out;
}

function EmptyContent({ dirty }: { dirty: boolean }) {
  if (dirty) return null;
  return (
    <div className="chronus-empty">
      <img className="chronus-empty-logo" src={asset("images/wormgpt.png")} alt="" />
      <h3>WormGPT</h3>
      <p>opencode-style assistant · pick a model, drop an image, hit enter.</p>
      <div className="chronus-chips">
        {SUGGESTIONS.map((s) => <button key={s} className="chronus-chip" onClick={() => { window.dispatchEvent(new CustomEvent("chronus-suggest", { detail: s })); }}>{s}</button>)}
      </div>
    </div>
  );
}

function ChronusGPTSurface({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "ai", text: "Yo — **WormGPT** online. Pick a model on the prompt bar, or attach an image and ask." }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [model, setModel] = useState<string>(() => readModel());
  const [api, setApi] = useState<ApiConfig>(() => readApiConfig());
  const [apiOpen, setApiOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, typing]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const live = api.mode !== "none";

  const commit = async (text: string, image?: string, video?: string) => {
    const clean = text.trim();
    if ((!clean && !image && !video) || typing) return;
    const userMsg: ChatMsg = { role: "user", text: clean, image, video };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setTyping(true);
    setError(null);
    const reply = () => {
      setMessages((prev) => [...prev, { role: "ai", text: builtinReply(clean, (image ? 1 : 0) + (video ? 1 : 0)) }]);
      setTyping(false);
    };
    if (live) {
      try {
        const out = await callModel(next, model, api);
        setMessages((prev) => [...prev, { role: "ai", text: out }]);
        setTyping(false);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
        reply();
      }
      return;
    }
    window.setTimeout(reply, 450 + Math.random() * 550);
  };

  const onFile = (acceptKind: "image" | "video") => {
    const el = fileRef.current;
    if (!el) return;
    el.accept = acceptKind === "image" ? "image/*" : "video/*";
    el.onchange = () => {
      const file = el.files?.[0];
      el.value = "";
      if (!file) return;
      const max = acceptKind === "image" ? 12 : 80;
      if (file.size > max * 1024 * 1024) { setError(`File too big — keep it under ${max} MB.`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const text = acceptKind === "video"
          ? `[video attached: ${file.name}] ${input}`.trim()
          : input.trim();
        void commit(text, acceptKind === "image" ? dataUrl : undefined, acceptKind === "video" ? dataUrl : undefined);
      };
      reader.readAsDataURL(file);
    };
    el.click();
  };

  useEffect(() => {
    const onSuggest = (e: Event) => { void commit((e as CustomEvent<string>).detail); };
    window.addEventListener("chronus-suggest", onSuggest);
    return () => window.removeEventListener("chronus-suggest", onSuggest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, typing, model, api]);

  const saveApi = (next: ApiConfig) => { setApi(next); writeApiConfig(next); setApiOpen(false); };

  return (
    <div className="window-surface chronus-app">
      <div className="chronus-head">
        <img className="chronus-logo" src={asset("images/wormgpt.png")} alt="ChronusGPT" />
        <div className="chronus-head-id">
          <strong>WormGPT</strong>
          <span className="chronus-model">{live ? `live · ${model}` : `offline · ${model}`}</span>
        </div>
        <button className="window-control chronus-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="chronus-msgs">
        {messages.length === 1 && <EmptyContent dirty={messages[0].role === "user"} />}
        {messages.map((msg, i) => (
          <div key={i} className={`chronus-msg ${msg.role === "user" ? "user" : "ai"}`}>
            {msg.role === "ai" && <img className="chronus-avatar" src={asset("images/wormgpt.png")} alt="" />}
            <div className="chronus-bubble stock">
              {msg.image && <img className="chronus-attach chronus-attach-img" src={msg.image} alt="attachment" />}
              {msg.video && <video className="chronus-attach" src={msg.video} controls />}
              {msg.text && <div>{opencode(msg.text)}</div>}
            </div>
          </div>
        ))}
        {typing && (
          <div className="chronus-msg ai">
            <img className="chronus-avatar" src={asset("images/wormgpt.png")} alt="" />
            <div className="chronus-bubble stock chronus-typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="chronus-error">✕ {error}</div>}

      <div className="chronus-promptbar">
        <button className={`chronus-model-chip ${pickerOpen ? "open" : ""}`} onClick={() => { setPickerOpen(!pickerOpen); setApiOpen(false); }}>
          {model}
        </button>
        <span className="chronus-prompt-gt">❯</span>
        <input
          ref={inputRef}
          className="chronus-prompt-input"
          value={input}
          placeholder={live ? "Ask ChronusGPT…" : "Ask the local brain…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commit(input); } }}
          aria-label="Message ChronusGPT"
        />
        <button className="chronus-attach-btn" onClick={() => onFile("image")} title="Attach image">🖼</button>
        <button className="chronus-attach-btn" onClick={() => onFile("video")} title="Attach video">🎬</button>
        <button className="chronus-send" onClick={() => void commit(input)} aria-label="Send">➤</button>
        <input ref={fileRef} type="file" style={{ display: "none" }} aria-hidden="true" />
      </div>

      {pickerOpen && (
        <div className="chronus-pop chronus-picker">
          {MODEL_GROUPS.map((group) => (
            <div key={group.provider} className="chronus-pick-group">
              <div className="chronus-pick-provider">{group.provider}</div>
              {group.models.map((m) => (
                <button key={m.id} className={`chronus-pick-item ${model === m.id ? "selected" : ""}`} onClick={() => { setModel(m.id); writeModel(m.id); setPickerOpen(false); }}>
                  <span className="chronus-pick-id">{m.id}</span>
                  <span className="chronus-pick-note">{m.note}</span>
                  {model === m.id && <span className="chronus-pick-check">✓</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="chronus-pick-foot">
            <label className="chronus-toggle">
              <input type="checkbox" checked={live} onChange={(e) => saveApi({ ...api, mode: e.target.checked ? "gemini" : "none" })} />
              <span>{live ? "Live mode ON" : "Live mode OFF"}</span>
            </label>
            <button className="chronus-chip" onClick={() => { setPickerOpen(false); setApiOpen(true); }}>API settings…</button>
          </div>
        </div>
      )}

      {apiOpen && (
        <div className="chronus-pop chronus-api">
          <div className="chronus-pop-title">Connect a real model</div>
          <label className="chronus-field"><span>Mode</span>
            <select value={api.mode} onChange={(e) => setApi({ ...api, mode: e.target.value as ApiConfig["mode"] })}>
              <option value="free">Free live · Pollinations (no key)</option>
              <option value="none">Local only (offline brain)</option>
              <option value="gemini">Gemini (vision, works in-browser)</option>
              <option value="custom">Custom endpoint (OpenAI-compatible)</option>
            </select>
          </label>
          {api.mode !== "none" && (
            <>
              <label className="chronus-field"><span>API key</span>
                <input className="chronus-field-input" type="password" value={api.key} placeholder="…" onChange={(e) => setApi({ ...api, key: e.target.value })} />
              </label>
              {api.mode === "custom" && (
                <label className="chronus-field"><span>Base URL</span>
                  <input className="chronus-field-input" type="url" value={api.customUrl} placeholder="https://your-endpoint.com/v1/chat/completions" onChange={(e) => setApi({ ...api, customUrl: e.target.value })} />
                </label>
              )}
            </>
          )}
          <div className="chronus-pop-note"><strong>No key? It still works.</strong> Free live AI (Pollinations, no account) is on by default. Add a Gemini key for a higher-quality vision lane; the free lane automatically becomes its fallback if the school network blocks it.</div>
          <div className="chronus-pop-actions">
            <button className="chronus-chip" onClick={() => saveApi(api)}>Save</button>
            <button className="chronus-chip" onClick={() => setApiOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { ChronusGPTSurface };