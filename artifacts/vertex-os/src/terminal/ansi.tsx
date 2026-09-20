import type { CSSProperties, ReactNode } from "react";
import { createElement, Fragment } from "react";

export type AnsiState = {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  fg: string | null;
};

const INITIAL: AnsiState = { bold: false, dim: false, italic: false, underline: false, inverse: false, fg: null };

const ANSI_NAMES: Record<number, string> = {
  30: "black",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  90: "gray",
  91: "bright-red",
  92: "bright-green",
  93: "bright-yellow",
  94: "bright-blue",
  95: "bright-magenta",
  96: "bright-cyan",
  97: "bright-white",
};

const CUBE = [0, 95, 135, 175, 215, 255];

/** xterm-256 palette entry -> hex. */
export function ansi256(n: number): string {
  if (n < 16) {
    const table = [
      "#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
      "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff",
    ];
    return table[n] ?? "#e6edf3";
  }
  if (n < 232) {
    const i = n - 16;
    const r = CUBE[Math.floor(i / 36) % 6];
    const g = CUBE[Math.floor(i / 6) % 6];
    const b = CUBE[i % 6];
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  const level = 8 + (n - 232) * 10;
  const hex = level.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function applySgr(state: AnsiState, codes: number[]): AnsiState {
  let next = state;
  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i];
    if (code === 0) next = { ...INITIAL };
    else if (code === 1) next = { ...next, bold: true };
    else if (code === 2) next = { ...next, dim: true };
    else if (code === 3) next = { ...next, italic: true };
    else if (code === 4) next = { ...next, underline: true };
    else if (code === 7) next = { ...next, inverse: true };
    else if (code === 22) next = { ...next, bold: false, dim: false };
    else if (code === 23) next = { ...next, italic: false };
    else if (code === 24) next = { ...next, underline: false };
    else if (code === 27) next = { ...next, inverse: false };
    else if (code === 39) next = { ...next, fg: null };
    else if (ANSI_NAMES[code]) next = { ...next, fg: `var(--ansi-${ANSI_NAMES[code]})` };
    else if (code === 38 && codes[i + 1] === 5) { next = { ...next, fg: ansi256(codes[i + 2] ?? 15) }; i += 2; }
    else if (code === 38 && codes[i + 1] === 2) {
      const [r, g, b] = [codes[i + 2] ?? 255, codes[i + 3] ?? 255, codes[i + 4] ?? 255];
      next = { ...next, fg: `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}` };
      i += 4;
    }
  }
  return next;
}

const SGR = /\u001b\[([0-9;]*)m/g;

export type AnsiSegment = { text: string; state: AnsiState };

export function tokenizeAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let state: AnsiState = { ...INITIAL };
  let last = 0;
  SGR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SGR.exec(input))) {
    if (match.index > last) segments.push({ text: input.slice(last, match.index), state });
    const codes = match[1].length ? match[1].split(";").map((n) => Number(n) || 0) : [0];
    state = applySgr(state, codes);
    last = match.index + match[0].length;
  }
  if (last < input.length) segments.push({ text: input.slice(last), state });
  return segments;
}

export function stripAnsi(input: string): string {
  return input.replace(SGR, "");
}

function styleFor(state: AnsiState, base: CSSProperties | undefined): CSSProperties | undefined {
  const style: CSSProperties = { ...base };
  if (state.fg) style.color = state.fg;
  if (state.bold) style.fontWeight = 700;
  if (state.italic) style.fontStyle = "italic";
  if (state.underline) style.textDecoration = "underline";
  if (state.dim) style.opacity = 0.62;
  if (state.inverse) {
    style.background = state.fg ?? "var(--term-text)";
    style.color = "var(--term-bg)";
  }
  return Object.keys(style).length ? style : undefined;
}

/**
 * Renders text containing ANSI SGR escape sequences as styled React nodes.
 * Supports 0/1/2/3/4/7/22/23/24/27/39, 30-37, 90-97, 38;5;n and 38;2;r;g;b.
 */
export function ansiToNodes(input: string, keyPrefix = "a"): ReactNode[] {
  return tokenizeAnsi(input).map((segment, index) => {
    const style = styleFor(segment.state, undefined);
    if (!style) return createElement(Fragment, { key: `${keyPrefix}-${index}` }, segment.text);
    return createElement("span", { key: `${keyPrefix}-${index}`, style }, segment.text);
  });
}
