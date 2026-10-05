import type { CSSProperties } from "react";
import { normalizeHex } from "./banners";

export type TerminalCursor = "block" | "bar" | "underline";

export type TerminalConfig = {
  bannerEnabled: boolean;
  banner: string;
  customArt: string;
  palette: string;
  colorFrom: string;
  colorTo: string;
  bg: string;
  text: string;
  accent: string;
  prompt: string;
  font: string;
  fontSize: number;
  cursor: TerminalCursor;
  opacity: number;
  glass: boolean;
  wallpaper: string;
  scanlines: boolean;
  glow: boolean;
  fsociety: boolean;
  nmap: boolean;
  metasploit: boolean;
};

export const TERMINAL_CONFIG_KEY = "vertex-terminal-config";

export const TERMINAL_FONTS = [
  { id: "cascadia", name: "Cascadia Code", stack: '"Cascadia Code", Consolas, "JetBrains Mono", "Fira Code", ui-monospace, monospace' },
  { id: "consolas", name: "Consolas", stack: 'Consolas, "Cascadia Code", ui-monospace, monospace' },
  { id: "jetbrains", name: "JetBrains Mono", stack: '"JetBrains Mono", "Fira Code", Consolas, ui-monospace, monospace' },
  { id: "fira", name: "Fira Code", stack: '"Fira Code", "JetBrains Mono", Consolas, ui-monospace, monospace' },
  { id: "courier", name: "Courier New", stack: '"Courier New", Courier, ui-monospace, monospace' },
  { id: "system", name: "System Mono", stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
] as const;

export const TERMINAL_CURSORS: { id: TerminalCursor; name: string }[] = [
  { id: "block", name: "Block" },
  { id: "bar", name: "Bar" },
  { id: "underline", name: "Underline" },
];

export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  bannerEnabled: true,
  banner: "vertex-shadow",
  customArt: "",
  palette: "vertex",
  colorFrom: "#8de6ff",
  colorTo: "#c3a4ff",
  bg: "#05080f",
  text: "#d6e2f0",
  accent: "#7ee787",
  prompt: "#8de6ff",
  font: "cascadia",
  fontSize: 13,
  cursor: "block",
  opacity: 92,
  glass: false,
  wallpaper: "",
  scanlines: false,
  glow: true,
  fsociety: false,
  nmap: false,
  metasploit: false,
};

export function fontStackFor(id: string): string {
  return (TERMINAL_FONTS.find((font) => font.id === id) ?? TERMINAL_FONTS[0]).stack;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function readTerminalConfig(): TerminalConfig {
  if (typeof window === "undefined") return { ...DEFAULT_TERMINAL_CONFIG };
  try {
    const raw = window.localStorage.getItem(TERMINAL_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_TERMINAL_CONFIG };
    const saved = JSON.parse(raw) as Partial<TerminalConfig>;
    const merged: TerminalConfig = { ...DEFAULT_TERMINAL_CONFIG, ...saved };
    merged.bg = normalizeHex(merged.bg, DEFAULT_TERMINAL_CONFIG.bg);
    merged.text = normalizeHex(merged.text, DEFAULT_TERMINAL_CONFIG.text);
    merged.accent = normalizeHex(merged.accent, DEFAULT_TERMINAL_CONFIG.accent);
    merged.prompt = normalizeHex(merged.prompt, DEFAULT_TERMINAL_CONFIG.prompt);
    merged.colorFrom = normalizeHex(merged.colorFrom, DEFAULT_TERMINAL_CONFIG.colorFrom);
    merged.colorTo = normalizeHex(merged.colorTo, DEFAULT_TERMINAL_CONFIG.colorTo);
    merged.fontSize = clamp(Number(merged.fontSize), 10, 22, DEFAULT_TERMINAL_CONFIG.fontSize);
    merged.opacity = clamp(Number(merged.opacity), 35, 100, DEFAULT_TERMINAL_CONFIG.opacity);
    return merged;
  } catch {
    return { ...DEFAULT_TERMINAL_CONFIG };
  }
}

export function writeTerminalConfig(config: TerminalConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TERMINAL_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable — settings stay in memory */
  }
}

function hexToRgbTriplet(hex: string): string {
  const value = normalizeHex(hex).slice(1);
  return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`;
}

/** CSS custom properties consumed by .term-surface and friends. */
export function terminalCssVars(config: TerminalConfig): CSSProperties {
  const vars: Record<string, string> = {
    "--term-bg": config.bg,
    "--term-bg-rgb": hexToRgbTriplet(config.bg),
    "--term-bg-alpha": config.glass ? "0" : String(config.opacity / 100),
    "--term-text": config.text,
    "--term-accent": config.accent,
    "--term-accent-rgb": hexToRgbTriplet(config.accent),
    "--term-prompt": config.prompt,
    "--term-prompt-rgb": hexToRgbTriplet(config.prompt),
    "--term-font": fontStackFor(config.font),
    "--term-size": `${config.fontSize}px`,
    "--term-line": `${Math.round(config.fontSize * 1.55)}px`,
  };
  if (config.wallpaper.trim()) vars["--term-wallpaper"] = `url("${config.wallpaper.trim()}")`;
  return vars as CSSProperties;
}

export function terminalHasWallpaper(config: TerminalConfig): boolean {
  return config.wallpaper.trim().length > 0;
}
