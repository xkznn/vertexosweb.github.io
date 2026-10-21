import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl } from "../asset-map";
import {
  Activity,
  Bot,
  Calendar,
  Cpu,
  Database,
  ListTodo,
  MessageSquare,
  Mic,
  MicOff,
  Square,
  Terminal,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from "lucide-react";

type State = "idle" | "listening" | "thinking" | "speaking";
type Tab = "command" | "core" | "agents" | "tasks" | "calendar" | "memory" | "conversations" | "tools";

const JARVIS_BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const JARVIS_LOGO = assetUrl(JARVIS_BASE, "images/jarvis-logo.png");
type Msg = { id: string; role: "user" | "ai"; text: string; at: number };
type VoiceProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  reference_id: string;
  key: string;
  url: string;
};

type AgentProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  key: string;
  systemPrompt?: string;
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const GROQ_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
];

type ChatResult = { content: string; error?: string };

async function callGroqDirect(
  apiKey: string,
  messages: { role: string; content: string }[],
  model?: string
): Promise<ChatResult> {
  const models = [model, ...GROQ_MODELS].filter(Boolean) as string[];
  let lastError = "";
  for (const m of models) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: m, messages, temperature: 0.7, max_tokens: 1024, stream: false }),
      });
      if (r.ok) {
        const data = await r.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        if (content) return { content };
        lastError = "Empty response";
        continue;
      }
      lastError = (await r.text().catch(() => "")) || `HTTP ${r.status}`;
    } catch (e: any) {
      lastError = e?.message || "network error";
    }
  }
  return { content: "", error: lastError.slice(0, 160) };
}

async function callChat(
  apiKey: string,
  messages: { role: string; content: string }[],
  model?: string
): Promise<ChatResult> {
  if (apiKey) return callGroqDirect(apiKey, messages, model);
  try {
    const res = await fetch("/api/jarvis/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model }),
    });
    if (res.ok) {
      const data = await res.json();
      return { content: data?.content ?? "" };
    }
    const detail = await res.text().catch(() => "");
    return { content: "", error: `Server ${res.status}. Add a Groq API key in AI Core or Agents.` };
  } catch {
    return { content: "", error: "No backend reachable. Add a Groq API key in AI Core (Key field)." };
  }
}

export function JarvisSurface({ onOpenApp }: { onOpenApp?: (id: string) => void } = {}) {
  const [state, setState] = useState<State>("idle");
  const [voiceOn, setVoiceOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [tab, setTab] = useState<Tab>("command");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [time, setTime] = useState(new Date());
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("jarvis_voice_profiles") || "[]");
    } catch {
      return [];
    }
  });
  const [activeVoiceId, setActiveVoiceId] = useState<string>(() => localStorage.getItem("jarvis_voice_active") || "");
  const [agents, setAgents] = useState<AgentProfile[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("jarvis_agents") || "[]");
    } catch {
      return [];
    }
  });
  const [activeAgentId, setActiveAgentId] = useState<string>(() => localStorage.getItem("jarvis_agent_active") || "");
  const [coreKey, setCoreKey] = useState<string>(() => localStorage.getItem("jarvis_core_key") || (import.meta.env.VITE_GROQ_API_KEY as string) || "");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (localStorage.getItem("jarvis_calendar_events_v2") !== "1") {
      const y = new Date().getFullYear();
      const fmt = (m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const seeded = [
        { date: fmt(1, 1), time: "00:00", title: "New Year's Day" },
        { date: fmt(2, 14), time: "00:00", title: "Valentine's Day" },
        { date: fmt(3, 17), time: "00:00", title: "St. Patrick's Day" },
        { date: fmt(4, 1), time: "00:00", title: "April Fools' Day" },
        { date: fmt(5, 5), time: "00:00", title: "Cinco de Mayo" },
        { date: fmt(7, 4), time: "00:00", title: "Independence Day" },
        { date: fmt(10, 31), time: "18:00", title: "Halloween" },
        { date: fmt(11, 11), time: "11:11", title: "Veterans Day" },
        { date: fmt(11, 27), time: "00:00", title: "Thanksgiving" },
        { date: fmt(12, 24), time: "18:00", title: "Christmas Eve" },
        { date: fmt(12, 25), time: "00:00", title: "Christmas Day" },
        { date: fmt(12, 31), time: "23:59", title: "New Year's Eve" },
      ];
      localStorage.setItem("jarvis_calendar_events", JSON.stringify(seeded));
      localStorage.setItem("jarvis_calendar_events_v2", "1");
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setState("idle");
  }, []);

  const speakResponse = useCallback(
    async (text: string) => {
      if (!voiceOn || !text) {
        setState("idle");
        return;
      }
      try {
        setState("speaking");
        const active = voiceProfiles.find((p) => p.id === activeVoiceId);
        const provider = active?.provider || "browser";
        const vkey = active?.key || "";
        const vmodel = active?.model || "";
        const vref = active?.reference_id || "";
        const vurl = active?.url || "";
        if (provider === "browser" || !active) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.rate = 0.95;
          utter.pitch = 0.9;
          utter.onend = () => setState("idle");
          utter.onerror = () => setState("idle");
          window.speechSynthesis.speak(utter);
          return;
        }
        const ttsBody = JSON.stringify({ text, provider, key: vkey, model: vmodel, reference_id: vref, url: vurl });
        let blob: Blob | null = null;
        let ttsError = "";
        try {
          const tts = await fetch("/api/jarvis/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: ttsBody,
          });
          if (tts.ok) {
            blob = await tts.blob();
          } else {
            const data = await tts.json().catch(() => ({}));
            ttsError = data?.details || data?.error || `HTTP ${tts.status}`;
          }
        } catch {
          ttsError = "no-backend";
        }
        if (!blob && ttsError === "no-backend" && provider === "fish" && vkey) {
          try {
            const direct = await fetch(vurl || "https://api.fish.audio/v1/tts", {
              method: "POST",
              headers: { Authorization: `Bearer ${vkey}`, "Content-Type": "application/json", model: vmodel || "s2.1-pro" },
              body: JSON.stringify({ text, format: "mp3", ...(vref ? { reference_id: vref } : {}) }),
            });
            if (direct.ok) {
              blob = await direct.blob();
            } else {
              ttsError = (await direct.text().catch(() => "")) || `HTTP ${direct.status}`;
            }
          } catch (e: any) {
            ttsError = e?.message || "network";
          }
        }
        if (blob) {
          if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          if (audioRef.current) {
            audioRef.current.src = url;
            await audioRef.current.play().catch(() => {});
            return;
          }
        } else {
          setError(`Voice "${active.name}" failed: ${String(ttsError).slice(0, 200)}. Falling back to browser voice.`);
          setState("idle");
        }
      } catch (e: any) {
        setError(e.message || "TTS error");
        setState("idle");
      }
    },
    [voiceOn, voiceProfiles, activeVoiceId]
  );

  const handleAction = useCallback(
    (text: string) => {
      const lower = text.toLowerCase();
      if (lower.includes("research") || lower.includes("search") || lower.includes("what's happening") || lower.includes("whats happening")) {
        const tasks = JSON.parse(localStorage.getItem("jarvis_tasks") || "[]");
        const id = Date.now().toString();
        tasks.unshift({ id, title: "RESEARCH TASK", status: "working", action: "Searching...", desc: text.slice(0, 140), steps: ["Parsing", "Searching"], query: text });
        localStorage.setItem("jarvis_tasks", JSON.stringify(tasks));
        (async () => {
          try {
            const agent = agents.find((a) => a.id === activeAgentId);
            const sysPrompt = agent?.systemPrompt || "You are J.A.R.V.I.S. Provide concise, detailed research findings.";
            const result = await callChat(
              agent?.key || coreKey,
              [{ role: "system", content: sysPrompt }, { role: "user", content: `Research and give detailed findings: ${text}` }],
              agent?.model
            );
            const reply = result.content || result.error || "Done";
            const t3 = JSON.parse(localStorage.getItem("jarvis_tasks") || "[]");
            const idx = t3.findIndex((x: any) => x.id === id);
            if (idx >= 0) { t3[idx].status = "done"; t3[idx].action = "Research complete - findings below"; t3[idx].result = reply; localStorage.setItem("jarvis_tasks", JSON.stringify(t3)); }
            const aiMsg: Msg = { id: uid(), role: "ai", text: reply, at: Date.now() };
            setMsgs((p) => [...p, aiMsg]);
            setResponse(reply);
            await speakResponse(reply);
          } catch {}
        })();
        return null;
      }
      if (lower.includes("open roblox")) {
        window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: "roblox" }));
        return "Opening Roblox.";
      }
      if (lower.includes("open browser")) {
        window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: "browser" }));
        return "Opening Browser.";
      }
      if (lower.includes("open terminal")) {
        window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: "terminal" }));
        return "Opening Terminal.";
      }
      if (lower.includes("open settings") || lower.includes("open config")) {
        window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: "settings" }));
        return "Opening Settings.";
      }
      if (lower.includes("open minecraft")) {
        window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: "minecraft" }));
        return "Opening Minecraft Launcher.";
      }
      if (lower.includes("open messages")) {
        window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: "messages" }));
        return "Opening Messages.";
      }
      if (lower.includes("spicetify") || (lower.includes("play") && lower.includes("song"))) {
        window.dispatchEvent(new CustomEvent("vertex-open-app", { detail: "spicetify" }));
        return "Opening Spicetify.";
      }
      return null;
    },
    [speakResponse, agents, activeAgentId, coreKey]
  );

  const processQuery = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const action = handleAction(text);
      if (action) {
        const aiMsg: Msg = { id: uid(), role: "ai", text: action, at: Date.now() };
        setMsgs((p) => [...p, { id: uid(), role: "user", text, at: Date.now() }, aiMsg]);
        setTranscript(text);
        setResponse(action);
        await speakResponse(action);
        return;
      }
      setTranscript(text);
      setResponse("");
      setError(null);
      setState("thinking");
      const userMsg: Msg = { id: uid(), role: "user", text, at: Date.now() };
      setMsgs((p) => [...p, userMsg]);
      try {
        const history = [
          { role: "system" as const, content: "You are J.A.R.V.I.S. Answer concisely in character. You can open apps and control things. Keep responses short for voice." },
          ...msgs.slice(-12).map((m) => ({ role: m.role === "ai" ? ("assistant" as const) : ("user" as const), content: m.text })),
          { role: "user" as const, content: text },
        ];
        const agent = agents.find((a) => a.id === activeAgentId);
        if (agent?.systemPrompt) history[0].content = agent.systemPrompt;
        const result = await callChat(agent?.key || coreKey, history, agent?.model);
        if (!result.content && result.error) throw new Error(result.error);
        const reply = result.content || "";
        const aiMsg: Msg = { id: uid(), role: "ai", text: reply, at: Date.now() };
        setMsgs((p) => [...p, aiMsg]);
        setResponse(reply);
        await speakResponse(reply);
      } catch (e: any) {
        setError(e.message || "Error");
        setState("idle");
      }
    },
    [handleAction, msgs, speakResponse, agents, activeAgentId, coreKey]
  );

  const sendText = useCallback(async () => {
    const t = input.trim();
    if (!t || state === "thinking" || state === "speaking") return;
    setInput("");
    await processQuery(t);
  }, [input, processQuery, state]);

  const startListening = useCallback(() => {
    if (listeningRef.current || state === "thinking" || state === "speaking") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported");
      return;
    }
    const recog = new SR();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.continuous = false;
    recog.onstart = () => {
      listeningRef.current = true;
      setState("listening");
      setError(null);
    };
    recog.onresult = (ev: any) => {
      const text = ev.results[0][0].transcript;
      listeningRef.current = false;
      processQuery(text);
    };
    recog.onerror = (ev: any) => {
      listeningRef.current = false;
      setError(ev.error === "not-allowed" ? "Mic denied" : ev.error || "Error");
      setState("idle");
    };
    recog.onend = () => {
      listeningRef.current = false;
      if (state === "listening") setState("idle");
    };
    recognitionRef.current = recog;
    recog.start();
  }, [processQuery, state]);

  const toggleMic = useCallback(() => {
    if (state === "listening") {
      if (recognitionRef.current && listeningRef.current) recognitionRef.current.stop();
      listeningRef.current = false;
      setState("idle");
    } else if (state === "idle") {
      startListening();
    }
  }, [state, startListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort?.();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const ringSpeed = state === "thinking" ? "0.9s" : state === "listening" ? "0.4s" : state === "speaking" ? "0.25s" : "3.2s";
  const corePulse = state === "speaking" ? "0.6s" : state === "listening" ? "0.5s" : state === "thinking" ? "0.4s" : "2s";

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "command", label: "COMMAND CENTER", icon: Terminal },
    { id: "core", label: "AI CORE", icon: Cpu },
    { id: "agents", label: "AGENTS", icon: Bot },
    { id: "tasks", label: "TASKS", icon: ListTodo },
    { id: "calendar", label: "CALENDAR", icon: Calendar },
    { id: "memory", label: "MEMORY", icon: Database },
    { id: "conversations", label: "CONVERSATIONS", icon: MessageSquare },
    { id: "tools", label: "TOOLS & SKILLS", icon: Wrench },
  ];

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        background: "radial-gradient(ellipse at center, rgba(0, 40, 80, 0.35) 0%, rgba(0, 12, 30, 0.99) 100%)",
        color: "#c9eeff",
        display: "flex",
        fontFamily: "Share Tech Mono, monospace, system-ui",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(rgba(0, 180, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 180, 255, 0.025) 1px, transparent 1px)`,
          backgroundSize: "36px 36px",
          opacity: 0.4,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: 240,
          borderRight: "1px solid rgba(0, 200, 255, 0.35)",
          display: "flex",
          flexDirection: "column",
          backdropFilter: "blur(4px)",
          background: "linear-gradient(180deg, rgba(0, 40, 80, 0.25) 0%, rgba(0, 20, 40, 0.4) 100%)",
          zIndex: 2,
        }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(0, 200, 255, 0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={JARVIS_LOGO} alt="JARVIS" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain", filter: "drop-shadow(0 0 12px rgba(0, 200, 255, 0.5))" }} />
            <div>
              <div style={{ fontSize: 12, letterSpacing: 4 }}>J.A.R.V.I.S.</div>
              <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 3 }}>COMMAND</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "6px 0" }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 14px",
                  background: active ? "linear-gradient(90deg, rgba(0, 200, 255, 0.25) 0%, transparent 100%)" : "transparent",
                  border: "none",
                  borderLeft: active ? "2px solid rgba(0, 230, 255, 0.8)" : "2px solid transparent",
                  color: active ? "#e6f7ff" : "rgba(201, 238, 255, 0.7)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 10,
                  letterSpacing: 3,
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ padding: 10, borderTop: "1px solid rgba(0, 200, 255, 0.3)", display: "flex", flexDirection: "column", gap: 6, fontSize: 9, letterSpacing: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>TIME</span>
            <span>{time.toLocaleTimeString()}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>DATE</span>
            <span>{time.toLocaleDateString()}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>VOICE</span>
            <button onClick={() => setVoiceOn((v) => !v)} style={{ background: "transparent", border: "none", color: "#c9eeff", cursor: "pointer" }}>
              {voiceOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>STATUS</span>
            <span style={{ color: state === "listening" ? "#00e5ff" : state === "speaking" ? "#00ffcc" : state === "thinking" ? "#7aa2ff" : "#4dffb5" }}>
              {state.toUpperCase()}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>NET</span>
            <span style={{ color: "#4dffb5" }}>ONLINE</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>LOC</span>
            <span style={{ opacity: 0.8 }}>LOCAL</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>PWR</span>
            <span style={{ color: "#4dffb5" }}>OPTIMAL</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", zIndex: 1, minHeight: 0 }}>
        {tab === "command" && (
          <>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0, overflow: "hidden" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div
                  style={{
                    width: 260,
                    height: 260,
                    borderRadius: "50%",
                    background: "radial-gradient(circle at 50% 50%, rgba(220, 245, 255, 0.98) 0%, rgba(0, 180, 255, 0.55) 35%, rgba(0, 40, 90, 0.96) 72%)",
                    boxShadow:
                      state === "speaking"
                        ? "0 0 150px 70px rgba(0, 210, 255, 0.65), inset 0 0 90px rgba(220, 245, 255, 0.55)"
                        : state === "listening"
                        ? "0 0 130px 60px rgba(0, 220, 255, 0.6), inset 0 0 90px rgba(220, 250, 255, 0.6)"
                        : state === "thinking"
                        ? "0 0 110px 50px rgba(90, 180, 255, 0.55), inset 0 0 80px rgba(190, 240, 255, 0.5)"
                        : "0 0 80px 30px rgba(0, 160, 255, 0.35), inset 0 0 60px rgba(190, 240, 255, 0.4)",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: `jarvis-pulse ${corePulse} ease-in-out infinite alternate`,
                    transition: "box-shadow 0.3s ease",
                    border: "2px solid rgba(0, 230, 255, 0.45)",
                  }}
                >
                  <div style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", background: "radial-gradient(circle at 50% 25%, rgba(255, 255, 255, 0.35) 0%, transparent 68%)" }} />
                  <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 16, textShadow: "0 0 70px rgba(0, 210, 255, 1), 0 0 120px rgba(0, 150, 255, 0.7)", zIndex: 1 }}>J.A.R.V.I.S.</div>
                </div>
                <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", border: "1.6px solid transparent", borderTop: "1.6px solid rgba(0, 220, 255, 0.75)", borderRight: "1.6px solid rgba(0, 180, 255, 0.45)", animation: `jarvis-spin ${ringSpeed} linear infinite`, boxShadow: "0 0 70px rgba(0, 180, 255, 0.25)" }} />
                <div style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", border: "1.3px solid transparent", borderBottom: "1.3px solid rgba(0, 240, 255, 0.65)", borderLeft: "1.3px solid rgba(0, 160, 255, 0.4)", animation: `jarvis-spin-rev ${parseFloat(ringSpeed) * 0.7}s linear infinite`, boxShadow: "0 0 60px rgba(0, 180, 255, 0.18)" }} />
                <div style={{ position: "absolute", width: 310, height: 310, borderRadius: "50%", border: "1px solid transparent", borderTop: "1px solid rgba(200, 240, 255, 0.55)", animation: `jarvis-spin ${parseFloat(ringSpeed) * 0.5}s linear infinite` }} />
                <div style={{ position: "absolute", width: 420, height: 420, borderRadius: "50%", border: "1px dashed rgba(0, 190, 255, 0.18)", animation: `jarvis-spin-rev ${parseFloat(ringSpeed) * 2}s linear infinite` }} />
              </div>

              <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 8, width: 280 }}>
                <div style={{ fontSize: 9, letterSpacing: 4, opacity: 0.5 }}>VOICE STATUS</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: state === "listening" ? "#00e5ff" : state === "speaking" ? "#00ffcc" : state === "thinking" ? "#7aa2ff" : "rgba(77, 255, 179, 0.6)", boxShadow: state === "listening" ? "0 0 30px #00e5ff" : "0 0 20px rgba(77, 255, 179, 0.4)" }} />
                  <div style={{ fontSize: 12, letterSpacing: 3 }}>{state.toUpperCase()}</div>
                </div>
                <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2, marginTop: 6 }}>MIC: {state === "listening" ? "ACTIVE" : "IDLE"}</div>
                <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>TTS: {voiceOn ? "ENABLED" : "DISABLED"}</div>
                <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>CONNECTION: GROQ/TTS</div>
                <div style={{ fontSize: 9, opacity: 0.7, letterSpacing: 2, color: "#7fd8ff" }}>AGENT: {(agents.find((a) => a.id === activeAgentId)?.name || "JARVIS CORE").toUpperCase()}</div>
                <div style={{ fontSize: 9, opacity: 0.5, letterSpacing: 2, marginTop: 10 }}>WEATHER: CLEAR</div>
                <div style={{ fontSize: 9, opacity: 0.5, letterSpacing: 2 }}>LOCATION: HOME</div>
                <div style={{ fontSize: 9, opacity: 0.5, letterSpacing: 2 }}>NETWORK: EXCELLENT</div>
              </div>
            </div>

            <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(0, 200, 255, 0.35)", display: "flex", gap: 10, alignItems: "center", background: "linear-gradient(180deg, rgba(0, 40, 80, 0.2) 0%, rgba(0, 20, 40, 0.35) 100%)", flexShrink: 0 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                placeholder="Command J.A.R.V.I.S..."
                style={{
                  flex: 1,
                  background: "rgba(0, 30, 60, 0.6)",
                  border: "1px solid rgba(0, 200, 255, 0.5)",
                  color: "#c9eeff",
                  padding: "8px 12px",
                  borderRadius: 4,
                  outline: "none",
                  fontFamily: "Share Tech Mono, monospace",
                  fontSize: 12,
                  letterSpacing: 1,
                }}
              />
              <button onClick={toggleMic} style={{ background: state === "listening" ? "rgba(0, 220, 255, 0.4)" : "rgba(0, 30, 60, 0.7)", border: "1px solid rgba(0, 220, 255, 0.6)", color: "#c9eeff", padding: 8, borderRadius: 4, cursor: "pointer" }}>
                {state === "listening" ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              {state === "speaking" ? (
                <button onClick={stopAudio} style={{ background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: 8, borderRadius: 4, cursor: "pointer" }}>
                  <Square size={16} />
                </button>
              ) : (
                <button onClick={sendText} disabled={state !== "idle" || !input.trim()} style={{ background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: 8, borderRadius: 4, cursor: "pointer", opacity: state !== "idle" || !input.trim() ? 0.5 : 1 }}>
                  <Zap size={16} />
                </button>
              )}
            </div>
          </>
        )}

        {tab === "core" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 6 }}>AI CORE</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              <div style={{ border: "1px solid rgba(0, 200, 255, 0.4)", background: "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: 3 }}>CORE BRAIN (GROQ API KEY)</div>
                <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 1 }}>Powers the default JARVIS CORE. Required on static hosting (GitHub Pages, Vercel, Netlify, Cloudflare, Firebase) where there is no backend. Get a free key at console.groq.com.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>GROQ API KEY</div>
                  <input id="jarvis-core-key" type="password" defaultValue={coreKey} placeholder="gsk_..." style={{ background: "rgba(0, 30, 60, 0.6)", border: "1px solid rgba(0, 200, 255, 0.5)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, fontSize: 10 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        const k = (document.getElementById("jarvis-core-key") as HTMLInputElement)?.value.trim() || "";
                        setCoreKey(k);
                        if (k) localStorage.setItem("jarvis_core_key", k);
                        else localStorage.removeItem("jarvis_core_key");
                        setError(null);
                      }}
                      style={{ flex: 1, background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2 }}
                    >
                      SAVE KEY
                    </button>
                    <button
                      onClick={() => {
                        setCoreKey("");
                        localStorage.removeItem("jarvis_core_key");
                        const el = document.getElementById("jarvis-core-key") as HTMLInputElement | null;
                        if (el) el.value = "";
                      }}
                      style={{ background: "rgba(255, 90, 90, 0.25)", border: "1px solid rgba(255, 120, 120, 0.6)", color: "#ffd0d0", padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2 }}
                    >
                      CLEAR
                    </button>
                  </div>
                  {coreKey ? (
                    <div style={{ fontSize: 9, color: "#4dffb5", letterSpacing: 2 }}>● KEY SET — CORE ONLINE</div>
                  ) : (
                    <div style={{ fontSize: 9, color: "#ffcf6b", letterSpacing: 2 }}>△ NO KEY — CORE USES DEMO MODE LOCALLY ONLY</div>
                  )}
                </div>
              </div>

              <div style={{ border: "1px solid rgba(0, 200, 255, 0.4)", background: "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: 3 }}>VOICE CONFIGURATION</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>PROFILE NAME</div>
                  <input id="jarvis-voice-name" placeholder="e.g., JARVIS British" style={{ background: "rgba(0, 30, 60, 0.6)", border: "1px solid rgba(0, 200, 255, 0.5)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, fontSize: 10 }} />
                  <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>PROVIDER</div>
                  <select id="jarvis-voice-provider" defaultValue="fish" style={{ background: "rgba(0, 30, 60, 0.6)", border: "1px solid rgba(0, 200, 255, 0.5)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, fontSize: 10 }}>
                    <option value="fish">Fish Audio</option>
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="openai">OpenAI TTS</option>
                    <option value="cartesia">Cartesia</option>
                    <option value="custom">Custom API</option>
                    <option value="browser">Browser TTS</option>
                  </select>
                  <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>VOICE MODEL (ENGINE)</div>
                  <input id="jarvis-voice-model" placeholder="s2.1-pro (default), s2.1-pro-free, s2-pro" style={{ background: "rgba(0, 30, 60, 0.6)", border: "1px solid rgba(0, 200, 255, 0.5)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, fontSize: 10 }} />
                  <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>VOICE ID (REFERENCE_ID)</div>
                  <input id="jarvis-voice-ref" placeholder="voice id from Fish voice library" style={{ background: "rgba(0, 30, 60, 0.6)", border: "1px solid rgba(0, 200, 255, 0.5)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, fontSize: 10 }} />
                  <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>API KEY</div>
                  <input id="jarvis-voice-key" type="password" placeholder="sk-..." style={{ background: "rgba(0, 30, 60, 0.6)", border: "1px solid rgba(0, 200, 255, 0.5)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, fontSize: 10 }} />
                  <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 2 }}>CUSTOM ENDPOINT (OPTIONAL)</div>
                  <input id="jarvis-voice-url" placeholder="https://api.fish.audio/v1/tts" style={{ background: "rgba(0, 30, 60, 0.6)", border: "1px solid rgba(0, 200, 255, 0.5)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, fontSize: 10 }} />
                  <button
                    onClick={() => {
                      const name = (document.getElementById("jarvis-voice-name") as HTMLInputElement)?.value.trim() || "Voice " + (voiceProfiles.length + 1);
                      const provider = (document.getElementById("jarvis-voice-provider") as HTMLSelectElement)?.value || "fish";
                      const model = (document.getElementById("jarvis-voice-model") as HTMLInputElement)?.value || "";
                      const ref = (document.getElementById("jarvis-voice-ref") as HTMLInputElement)?.value || "";
                      const key = (document.getElementById("jarvis-voice-key") as HTMLInputElement)?.value || "";
                      const url = (document.getElementById("jarvis-voice-url") as HTMLInputElement)?.value || "";
                      const profile = { id: uid(), name, provider, model, reference_id: ref, key, url };
                      const next = voiceProfiles.filter((p) => p.name !== name).concat(profile);
                      setVoiceProfiles(next);
                      localStorage.setItem("jarvis_voice_profiles", JSON.stringify(next));
                      setActiveVoiceId(profile.id);
                      localStorage.setItem("jarvis_voice_active", profile.id);
                      setError(null);
                    }}
                    style={{ background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "6px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2, marginTop: 4 }}
                  >
                    SAVE VOICE
                  </button>
                </div>
              </div>

              <div style={{ border: "1px solid rgba(0, 200, 255, 0.4)", background: "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: 3 }}>SAVED VOICES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ border: (activeVoiceId === "" || activeVoiceId === "system-default") ? "1px solid rgba(0, 230, 255, 0.8)" : "1px solid rgba(0, 200, 255, 0.3)", background: (activeVoiceId === "" || activeVoiceId === "system-default") ? "rgba(0, 120, 200, 0.18)" : "rgba(0, 20, 40, 0.4)", padding: 10, borderRadius: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 11, letterSpacing: 2 }}>SYSTEM DEFAULT</div>
                      {(activeVoiceId === "" || activeVoiceId === "system-default") && <div style={{ fontSize: 9, letterSpacing: 2, color: "#4dffb5" }}>● ACTIVE</div>}
                    </div>
                    <div style={{ fontSize: 9, opacity: 0.6 }}>browser • built-in • no API key required</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          setActiveVoiceId("");
                          localStorage.setItem("jarvis_voice_active", "");
                        }}
                        disabled={activeVoiceId === "" || activeVoiceId === "system-default"}
                        style={{ flex: 1, background: (activeVoiceId === "" || activeVoiceId === "system-default") ? "rgba(0, 120, 200, 0.3)" : "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 9, letterSpacing: 2, opacity: (activeVoiceId === "" || activeVoiceId === "system-default") ? 0.6 : 1 }}
                      >
                        USE
                      </button>
                    </div>
                  </div>
                  {voiceProfiles.map((p) => {
                    const active = p.id === activeVoiceId;
                    return (
                      <div key={p.id} style={{ border: active ? "1px solid rgba(0, 230, 255, 0.8)" : "1px solid rgba(0, 200, 255, 0.3)", background: active ? "rgba(0, 120, 200, 0.18)" : "rgba(0, 20, 40, 0.4)", padding: 10, borderRadius: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 11, letterSpacing: 2 }}>{p.name}</div>
                          {active && <div style={{ fontSize: 9, letterSpacing: 2, color: "#4dffb5" }}>● ACTIVE</div>}
                        </div>
                        <div style={{ fontSize: 9, opacity: 0.6 }}>{p.provider}{p.model ? " • " + p.model : ""}{p.reference_id ? " • " + p.reference_id : ""}{p.key ? " • KEY SET" : ""}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => {
                              setActiveVoiceId(p.id);
                              localStorage.setItem("jarvis_voice_active", p.id);
                            }}
                            disabled={active}
                            style={{ flex: 1, background: active ? "rgba(0, 120, 200, 0.3)" : "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "4px 8px", borderRadius: 4, cursor: active ? "default" : "pointer", fontSize: 9, letterSpacing: 2, opacity: active ? 0.6 : 1 }}
                          >
                            USE
                          </button>
                          <button
                            onClick={() => {
                              const next = voiceProfiles.filter((x) => x.id !== p.id);
                              setVoiceProfiles(next);
                              localStorage.setItem("jarvis_voice_profiles", JSON.stringify(next));
                              if (activeVoiceId === p.id) {
                                const nextActive = next[0]?.id || "";
                                setActiveVoiceId(nextActive);
                                localStorage.setItem("jarvis_voice_active", nextActive);
                              }
                            }}
                            style={{ background: "rgba(255, 60, 60, 0.18)", border: "1px solid rgba(255, 90, 90, 0.7)", color: "#ffb3b3", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 9, letterSpacing: 2 }}
                          >
                            DELETE
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "agents" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, letterSpacing: 6 }}>AGENTS</div>
              <button
                onClick={() => {
                  const name = prompt("Agent name (e.g., Groq)");
                  if (!name) return;
                  const provider = prompt("Provider (groq, openai, anthropic, custom)", "groq") || "groq";
                  const key = prompt("API key (leave blank to use env)");
                  const model = prompt("Model (optional)");
                  const systemPrompt = prompt("System prompt / personality (optional)") || undefined;
                  const agents = JSON.parse(localStorage.getItem("jarvis_agents") || "[]");
                  agents.push({ id: Date.now().toString(), name, provider, key: key || "", model: model || "", systemPrompt });
                  localStorage.setItem("jarvis_agents", JSON.stringify(agents));
                  setAgents(agents);
                  alert("Agent added");
                }}
                style={{ background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, letterSpacing: 2 }}
              >
                ADD CUSTOM AGENT
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              <div style={{ border: `1px solid ${activeAgentId ? "rgba(0, 200, 255, 0.4)" : "rgba(0, 230, 255, 0.9)"}`, background: activeAgentId ? "rgba(0, 30, 60, 0.4)" : "rgba(0, 60, 110, 0.5)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 6, boxShadow: activeAgentId ? "none" : "0 0 24px rgba(0, 200, 255, 0.35)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, letterSpacing: 4 }}>JARVIS CORE</div>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: activeAgentId ? "#7aa2ff" : "#4dffb5" }}>{activeAgentId ? "AVAILABLE" : "ACTIVE"}</div>
                </div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>Built-in system agent</div>
                <button
                  disabled={!activeAgentId}
                  onClick={() => { localStorage.setItem("jarvis_agent_active", ""); setActiveAgentId(""); }}
                  style={{ marginTop: 4, background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "5px 8px", borderRadius: 4, cursor: activeAgentId ? "pointer" : "default", fontSize: 10, letterSpacing: 2, opacity: activeAgentId ? 1 : 0.5 }}
                >
                  USE
                </button>
              </div>
              {agents.map((a) => {
                const active = activeAgentId === a.id;
                return (
                  <div key={a.id} style={{ border: `1px solid ${active ? "rgba(0, 230, 255, 0.9)" : "rgba(0, 200, 255, 0.4)"}`, background: active ? "rgba(0, 60, 110, 0.5)" : "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 6, boxShadow: active ? "0 0 24px rgba(0, 200, 255, 0.35)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 12, letterSpacing: 4 }}>{a.name.toUpperCase()}</div>
                      <div style={{ fontSize: 9, letterSpacing: 2, color: active ? "#4dffb5" : "#7aa2ff" }}>{active ? "ACTIVE" : "CONFIGURED"}</div>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.6 }}>{`${a.provider}${a.model ? " • " + a.model : ""}${a.key ? " • API KEY SET" : " • ENV"}`}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        disabled={active}
                        onClick={() => { localStorage.setItem("jarvis_agent_active", a.id); setActiveAgentId(a.id); }}
                        style={{ flex: 1, background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "5px 8px", borderRadius: 4, cursor: active ? "default" : "pointer", fontSize: 10, letterSpacing: 2, opacity: active ? 0.5 : 1 }}
                      >
                        USE
                      </button>
                      <button
                        onClick={() => {
                          const next = agents.filter((x) => x.id !== a.id);
                          localStorage.setItem("jarvis_agents", JSON.stringify(next));
                          setAgents(next);
                          if (active) { localStorage.setItem("jarvis_agent_active", ""); setActiveAgentId(""); }
                        }}
                        style={{ background: "rgba(255, 80, 80, 0.2)", border: "1px solid rgba(255, 120, 120, 0.7)", color: "#ffcccc", padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2 }}
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 6 }}>TASKS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(JSON.parse(localStorage.getItem("jarvis_tasks") || "[]") as any[]).length === 0 && <div style={{ opacity: 0.5, fontSize: 11 }}>No active tasks. Ask JARVIS to research/work on something.</div>}
              {(JSON.parse(localStorage.getItem("jarvis_tasks") || "[]") as any[]).map((t, i) => (
                <div key={i} style={{ border: "1px solid rgba(0, 200, 255, 0.4)", background: "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 11, letterSpacing: 2 }}>{t.title}</div>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: t.status === "working" ? "#00e5ff" : t.status === "done" ? "#4dffb5" : "#ff4444" }}>{t.status?.toUpperCase()}</div>
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>{t.action || t.desc}</div>
                  {t.steps && <div style={{ fontSize: 9, opacity: 0.6 }}>• {t.steps.join(" • ")}</div>}
                  {t.result && <div style={{ fontSize: 10, whiteSpace: "pre-wrap", borderTop: "1px solid rgba(0, 200, 255, 0.2)", paddingTop: 6, marginTop: 4 }}>{t.result}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "conversations" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, letterSpacing: 6 }}>CONVERSATIONS</div>
              <button
                onClick={() => {
                  const convs = JSON.parse(localStorage.getItem("jarvis_conversations") || "[]");
                  convs.unshift({ id: Date.now().toString(), title: "New Session", msgs: [], ts: Date.now() });
                  localStorage.setItem("jarvis_conversations", JSON.stringify(convs));
                }}
                style={{ background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, letterSpacing: 2 }}
              >
                NEW SESSION
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(JSON.parse(localStorage.getItem("jarvis_conversations") || "[]") as any[]).map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (c.msgs) setMsgs(c.msgs);
                    setTab("command");
                  }}
                  style={{ textAlign: "left", border: "1px solid rgba(0, 200, 255, 0.4)", background: "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, color: "#c9eeff", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <div style={{ fontSize: 11, letterSpacing: 2 }}>{c.title}</div>
                  <div style={{ fontSize: 9, opacity: 0.6 }}>{c.msgs?.length || 0} messages • {new Date(c.ts).toLocaleString()}</div>
                </button>
              ))}
              {(JSON.parse(localStorage.getItem("jarvis_conversations") || "[]") as any[]).length === 0 && <div style={{ opacity: 0.5, fontSize: 11 }}>No saved conversations</div>}
            </div>
          </div>
        )}

        {tab === "memory" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 6 }}>MEMORY</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              <div style={{ border: "1px solid rgba(0, 200, 255, 0.4)", background: "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, letterSpacing: 3 }}>SESSION USAGE</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>Tokens used: {msgs.length * 150} (est.)</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>Messages: {msgs.length}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>Conversations: {(JSON.parse(localStorage.getItem("jarvis_conversations") || "[]") as any[]).length}</div>
              </div>
              <div style={{ border: "1px solid rgba(0, 200, 255, 0.4)", background: "rgba(0, 30, 60, 0.4)", padding: 12, borderRadius: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, letterSpacing: 3 }}>AGENT QUOTA</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>JARVIS CORE: Unlimited</div>
                {(JSON.parse(localStorage.getItem("jarvis_agents") || "[]") as any[]).map((a: any, i: number) => (
                  <div key={i} style={{ fontSize: 10, opacity: 0.7 }}>{a.name}: {a.key ? "API KEY SET" : "ENV"}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "calendar" && (() => {
          const year = calMonth.getFullYear();
          const month = calMonth.getMonth();
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const today = new Date();
          const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
          const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
          const todayEvents = ((function () {
            try {
              return JSON.parse(localStorage.getItem("jarvis_calendar_events") || "[]");
            } catch {
              return [];
            }
          })() as any[]);
          const eventsOn = (d: Date) => {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return todayEvents.filter((e) => e.date === key);
          };
          const cells: (Date | null)[] = [];
          for (let i = 0; i < firstDay; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
          while (cells.length % 7 !== 0) cells.push(null);
          return (
            <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, letterSpacing: 6 }}>CALENDAR</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} style={{ background: "rgba(0, 30, 60, 0.7)", border: "1px solid rgba(0, 220, 255, 0.6)", color: "#c9eeff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>{"<"}</button>
                  <div style={{ fontSize: 12, letterSpacing: 3, minWidth: 180, textAlign: "center" }}>{monthNames[month]} {year}</div>
                  <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} style={{ background: "rgba(0, 30, 60, 0.7)", border: "1px solid rgba(0, 220, 255, 0.6)", color: "#c9eeff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>{">"}</button>
                  <button onClick={() => setCalMonth(new Date(today.getFullYear(), today.getMonth(), 1))} style={{ background: "rgba(0, 190, 255, 0.35)", border: "1px solid rgba(0, 220, 255, 0.7)", color: "#c9eeff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2 }}>TODAY</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, border: "1px solid rgba(0, 200, 255, 0.3)", background: "rgba(0, 200, 255, 0.15)" }}>
                {weekdays.map((w) => (
                  <div key={w} style={{ background: "rgba(0, 20, 45, 0.9)", padding: "6px 8px", fontSize: 9, letterSpacing: 3, opacity: 0.7, textAlign: "center" }}>{w}</div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={i} style={{ background: "rgba(0, 12, 30, 0.6)", minHeight: 76 }} />;
                  const isToday = d.toDateString() === today.toDateString();
                  const evs = eventsOn(d);
                  return (
                    <div key={i} style={{ background: isToday ? "rgba(0, 90, 160, 0.35)" : "rgba(0, 16, 36, 0.85)", minHeight: 76, padding: 6, display: "flex", flexDirection: "column", gap: 3, border: isToday ? "1px solid rgba(0, 230, 255, 0.7)" : "none" }}>
                      <div style={{ fontSize: 10, letterSpacing: 1, color: isToday ? "#e6f7ff" : "rgba(201,238,255,0.75)" }}>{d.getDate()}</div>
                      {evs.slice(0, 3).map((e: any, j: number) => (
                        <div key={j} style={{ fontSize: 8, letterSpacing: 1, background: "rgba(0, 190, 255, 0.22)", borderLeft: "2px solid rgba(0, 230, 255, 0.8)", padding: "2px 4px", borderRadius: 2, color: "#c9eeff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.time ? `${e.time} ` : ""}{e.title}</div>
                      ))}
                      {evs.length > 3 && <div style={{ fontSize: 8, opacity: 0.6 }}>+{evs.length - 3} more</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {tab !== "command" && tab !== "core" && tab !== "agents" && tab !== "tasks" && tab !== "calendar" && tab !== "conversations" && tab !== "memory" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.7, minHeight: 0, padding: 20, textAlign: "center" }}>
            <Activity size={40} />
            <div style={{ fontSize: 14, letterSpacing: 6 }}>{tab.toUpperCase().replace("-", " ")}</div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#00e5ff" }}>UPCOMING</div>
            <div style={{ fontSize: 10, letterSpacing: 3, maxWidth: 360 }}>J.A.R.V.I.S. IS STILL DEVELOPING. BETA VERSION TESTING.</div>
          </div>
        )}
      </div>

      {audioUrlRef.current && <audio ref={audioRef} onEnded={() => setState("idle")} />}

      <style>{`
        @keyframes jarvis-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes jarvis-spin-rev {
          to { transform: rotate(-360deg); }
        }
        @keyframes jarvis-pulse {
          from { transform: scale(1); opacity: 0.98; }
          to { transform: scale(1.018); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
