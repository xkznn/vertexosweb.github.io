const STORAGE_KEY = "vertex-ps5-audio";

export type SfxName =
  | "navigate"
  | "select"
  | "launch"
  | "back"
  | "dialogOpen"
  | "dialogClose"
  | "controlOpen"
  | "controlClose"
  | "optionsOpen";

export interface AudioSettings {
  volume: number;
  muted: boolean;
  effects: boolean;
  music: boolean;
}

const DEFAULTS: AudioSettings = { volume: 72, muted: false, effects: true, music: true };

let context: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let settings: AudioSettings = load();
let listeners = new Set<() => void>();
let musicTimer: number | null = null;
let musicStep = 0;
let unlocked = false;

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
  listeners.forEach((fn) => fn());
}

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function subscribeAudio(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  applyMasterGain();
  persist();
}

function ensureContext(): AudioContext | null {
  if (!context) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.connect(context.destination);
    musicBus = context.createGain();
    musicBus.connect(master);
  }
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
  return context;
}

function applyMasterGain() {
  if (!master) return;
  const target = settings.muted || !settings.effects ? 0 : settings.volume / 100;
  master.gain.setTargetAtTime(target, context!.currentTime, 0.03);
}

export function unlockAudio() {
  ensureContext();
  if (context && !unlocked) {
    unlocked = true;
    applyMasterGain();
    if (settings.music) startMusic();
  }
}

let lastClick = 0;
function throttleGate(): boolean {
  const now = performance.now();
  if (now - lastClick < 60) return false;
  lastClick = now;
  return true;
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  endFreq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(
  ctx: AudioContext,
  out: AudioNode,
  start: number,
  duration: number,
  from: number,
  to: number,
  volume: number,
  type: BiquadFilterType = "bandpass",
) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
  filter.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(out);
  src.start(start);
  src.stop(start + duration + 0.02);
}

const PROGRESSION: { base: number; voice: number[] }[] = [
  { base: 110, voice: [110 * 1.5, 110 * 2.25, 110 * 3] },
  { base: 87.3, voice: [87.3 * 1.5, 87.3 * 2, 87.3 * 3] },
  { base: 98, voice: [98 * 1.5, 98 * 2.25, 98 * 2.5] },
  { base: 130.8, voice: [130.8 * 1.5, 130.8 * 2, 130.8 * 3.2] },
];

function startMusic() {
  if (!context || !musicBus || musicTimer !== null) return;
  const chordLoop = () => {
    const ctx = context!;
    const bus = musicBus!;
    const chord = PROGRESSION[musicStep % PROGRESSION.length];
    const start = ctx.currentTime + 0.08;
    const dur = 7.6;
    tone(ctx, bus, chord.base, chord.base * 0.98, start, dur, "triangle", 0.16);
    for (const f of chord.voice) {
      tone(ctx, bus, f, f * 0.995, start + 0.4, dur - 0.4, "sine", 0.05);
    }
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(bus.gain);
    lfo.start(start);
    lfo.stop(start + dur);
    noise(ctx, bus, start + 0.2, 5.5, 300, 1200, 0.012, "lowpass");
    musicStep++;
    musicTimer = window.setTimeout(chordLoop, 8000);
  };
  musicBus.gain.value = settings.muted ? 0 : (settings.volume / 100) * 0.9;
  chordLoop();
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}

export function setMusicEnabled(enabled: boolean) {
  setAudioSettings({ music: enabled });
  if (context && unlocked && enabled && !settings.muted) startMusic();
  else if (!enabled) stopMusic();
}

export function sfx(name: SfxName) {
  const ctx = ensureContext();
  if (!ctx || !master) return;
  if (settings.muted || !settings.effects) return;
  if (name !== "launch" && !throttleGate()) return;
  if (ctx.state !== "running") return;
  const t = ctx.currentTime + 0.001;
  const vol = settings.volume / 100;
  switch (name) {
    case "navigate":
      tone(ctx, master, 720, 780, t, 0.05, "sine", 0.05 * vol);
      break;
    case "select":
      tone(ctx, master, 520, 660, t, 0.08, "sine", 0.09 * vol);
      tone(ctx, master, 1040, 1320, t, 0.09, "sine", 0.03 * vol);
      break;
    case "launch":
      noise(ctx, master, t, 0.5, 200, 4200, 0.1 * vol, "bandpass");
      tone(ctx, master, 300, 760, t, 0.42, "sine", 0.14 * vol);
      tone(ctx, master, 600, 1520, t + 0.05, 0.4, "sine", 0.05 * vol);
      break;
    case "back":
      tone(ctx, master, 460, 300, t, 0.11, "sine", 0.09 * vol);
      break;
    case "dialogOpen":
      tone(ctx, master, 480, 600, t, 0.07, "sine", 0.08 * vol);
      tone(ctx, master, 640, 760, t + 0.06, 0.07, "sine", 0.06 * vol);
      break;
    case "dialogClose":
      tone(ctx, master, 620, 440, t, 0.09, "sine", 0.07 * vol);
      break;
    case "controlOpen":
      tone(ctx, master, 500, 620, t, 0.07, "triangle", 0.08 * vol);
      tone(ctx, master, 750, 900, t + 0.05, 0.09, "triangle", 0.06 * vol);
      tone(ctx, master, 1000, 1200, t + 0.1, 0.1, "triangle", 0.04 * vol);
      break;
    case "controlClose":
      tone(ctx, master, 1100, 620, t, 0.09, "triangle", 0.06 * vol);
      tone(ctx, master, 620, 420, t + 0.06, 0.08, "triangle", 0.06 * vol);
      break;
    case "optionsOpen":
      tone(ctx, master, 320, 360, t, 0.06, "square", 0.035 * vol);
      tone(ctx, master, 640, 720, t + 0.035, 0.06, "square", 0.02 * vol);
      break;
  }
}

export function destroyAudio() {
  stopMusic();
  if (context) {
    context.close().catch(() => {});
  }
  context = null;
  master = null;
  musicBus = null;
}

let visibilityBound = false;
export function bindAudioVisibility() {
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (!context) return;
    if (document.hidden) {
      stopMusic();
    } else if (settings.music && unlocked && !settings.muted) {
      startMusic();
    }
  });
}