export type TerminalBanner = {
  id: string;
  name: string;
  hint: string;
  art: string;
};

export const CUSTOM_BANNER_ID = "custom";

export const TERMINAL_BANNERS: TerminalBanner[] = [
  {
    id: "vertex-shadow",
    name: "Vertex Shadow",
    hint: "Classic ANSI-shadow wordmark",
    art: `██╗   ██╗███████╗██████╗ ████████╗███████╗██╗  ██╗      ██████╗ ███████╗
██║   ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝      ██╔══██╗██╔════╝
██║   ██║█████╗  ██████╔╝   ██║   █████╗   ╚███╔╝       ██║  ██║███████╗
╚██╗ ██╔╝██╔══╝  ██╔══██╗   ██║   ██╔══╝   ██╔██╗       ██║  ██║╚════██║
 ╚████╔╝ ███████╗██║  ██║   ██║   ███████╗██╔╝ ██╗      ██████╔╝███████║
  ╚═══╝  ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝      ╚═════╝ ╚══════╝`,
  },
  {
    id: "vertex-blocks",
    name: "Vertex Blocks",
    hint: "Compact half-block mark",
    art: `█  █ █▀▀ █▀▄ ▀█▀ █▀▀ ▀▄▀   █▀█ █▀
█▄▄█ █▄▄ █▄▀  █  █▄▄  █    █▄█ ▄█`,
  },
  {
    id: "vertex-line",
    name: "Vertex Line",
    hint: "Thin single-stroke mark",
    art: `╦  ╦╔═╗╦═╗╔╦╗╔═╗═╗ ╦  ╔═╗╔═╗
╚╗╔╝║╣ ╠╦╝ ║ ║╣ ╔╩╦╝  ║ ║╚═╗
 ╚╝ ╚═╝╩╚═ ╩ ╚═╝╩ ╚═  ╚═╝╚═╝`,
  },
  {
    id: "terminal-frame",
    name: "Terminal Frame",
    hint: "Boxed developer shell card",
    art: `┌──────────────────────────────────────────────┐
│   V E R T E X - O S   T E R M I N A L         │
│   zsh · interactive shell · type "help"       │
└──────────────────────────────────────────────┘`,
  },
  {
    id: "debug-prompt",
    name: "Debug Prompt",
    hint: "Minimal patch/release banner",
    art: `◆  vertex-os ◆  release 1.0
   └─ secure shell · offline first · zero bloat`,
  },
  {
    id: "fsociety",
    name: "FSOCIETY",
    hint: "Hello, friend…",
    art: `███████╗ ███████╗ ██████╗  ██████╗ ██╗███████╗████████╗██╗   ██╗
██╔════╝ ██╔════╝██╔═══██╗██╔════╝ ██║██╔════╝╚══██╔══╝╚██╗ ██╔╝
█████╗   ███████╗██║   ██║██║      ██║█████╗     ██║    ╚████╔╝
██╔══╝   ╚════██║██║   ██║██║      ██║██╔══╝     ██║     ╚██╔╝
██║      ███████║╚██████╔╝╚██████╗ ██║███████╗   ██║      ██║
╚═╝      ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝╚══════╝   ╚═╝      ╚═╝

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣶⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⣿⣷⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠀⠀⠀⠀⠆⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣧⠀⠀⠠⠀⠀⠀⠐⠀⠀⠀⠀⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠰⠀⠀⠀⠀
⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠠⠀⠀⢀⠀⠡⠄⠀⡄⠀⠀⠤⠄⠀⢠⣿⣿⣿⣿⣿⣆⠀⢠⠤⠁⠀⠠⠀⠠⠌⠀⠁⠀⠀⡄⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⢠⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⢀⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠄⠀⠀⠀⠀⠠⠀⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠈⠀⠀⠀⠀
⠀⠀⠀⠀⠇⠀⠀⠀⠀⠀⠀⠐⠀⠀⠀⠀⠀⠀⠐⠀⡀⢀⠀⠃⠀⢀⠀⢀⣾⣿⣿⣿⣿⣿⣿⣿⣿⡌⠀⡀⠀⠸⠀⠀⢀⠀⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠘⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⡄⠀⠀⢀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠁⠀⢀⠀⠀⠈⠀⠁⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀
⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠁⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⡀⠀⡀⠀⠠⠀⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠃⠀⠀⠀⠀⠀⠀⠸⠀⠀⠀⠘⠀⠀⠠⠀⠀⠀⠀⠇⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠸⠀⠀⠀⠀⠀⠀⠀⠃⠀⠀⠀⠃⠀⠀⠀⠀⠀⠀⠸⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠁⠀⠀⡄⠰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⢠⠀⠀⠘⠀⠁⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⢠⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⢳⡀⠈⠛⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠀⠀⠠⠀⡄⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠈⠀⠀⠀⠀
⠀⠀⠀⠀⠇⠀⠀⡀⠀⠀⠀⡐⠀⠀⡀⠀⡀⠀⠐⠀⡀⠀⢠⣿⣿⣷⣤⡀⠛⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠀⢀⠀⡀⠀⢀⠆⠀⠀⠀⢀⠀⠀⠀⢀⠀⠀⠸⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⢠⠀⠁⢠⣿⣿⣿⣿⣿⣿⣷⣦⣍⡻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠈⠀⠁⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⢠⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠈⠀⠀⠈⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣆⠁⠀⠀⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠀⠀⠀⠀
⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠀⡀⠀⠀⠀⠀⠀⠀⠀⠰⠀⠀⢀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀
⠀⠀⠀⠀⡄⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⢀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠋⠉⠉⠉⠙⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠠⠀⡀⠀⠀⠀⠘⠀⠀⢀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠁⠀⠃⠀⠀⠄⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀⠀⢀⠀⠀⠈⠀⠀⠀⠀
⠀⠀⠀⠀⠆⠀⠀⠀⠀⠀⠀⠀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠀⠉⠀⠆⠀⠀⠀⠀⠀⠀⢀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡈⠁⠀⠀⠀⠀⠀⠰⠀⠀⠀⠀
⠀⠀⠀⠀⡄⠀⠀⠁⠈⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠁⠄⠀⠀⡀⠀⠀⠁⠀⠀⠀⢠⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⠄⠀⠘⠀⠀⢠⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠂⢀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣺⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⠂⢠⠀⠀⠈⠀⠀⠀⠀
⠀⠀⠀⠀⡆⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⢠⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣦⠉⠛⠛⣿⣷⡄⠀⠀⠀⠐⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠀⡀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏⣀⡈⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠫⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣤⠈⠉⠳⠼⢀⠀⢀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣄⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣄⠠⠀⠀⠈⠀⠀⠀⠀
⠀⠀⠀⠀⠆⢁⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⡿⠿⠛⠋⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠐⠀⠘⠛⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⡈⠱⠀⠀⠀⠀
⠀⠀⠀⠀⢀⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠟⠛⠉⠁⠀⠀⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠃⠀⢀⠀⠀⠈⠉⠛⠻⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡀⠄⠀⠀⠀
⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⠟⠛⡉⠀⠀⠀⠐⠀⠄⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠈⠀⠀⠰⠀⡄⠀⠀⠀⠉⠛⠻⣿⣿⣿⣿⣿⣿⣿⣿⡄⠂⠀⠀
⠀⠀⢠⣿⣿⣿⣿⣿⠟⠛⢁⡠⠀⠀⡀⠀⡀⠀⠐⠀⡀⢀⠀⠆⠀⢀⠀⢀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠠⠀⡀⠀⠰⡀⠀⢀⠀⡀⠀⠀⠆⢀⠀⠀⢀⡈⠙⠻⢿⣿⣿⣿⣿⡆⠀⠀
⠀⣰⣿⣿⠟⠋⠁⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⡄⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⢀⠀⠀⠈⠀⠁⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠐⠈⠛⠻⣿⣿⣆⠀
⡰⠟⠉⠁⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠰⠀⠀⠀⠀⠉⠻⢆`,
  },
];

export type TerminalPalette = {
  id: string;
  name: string;
  from: string;
  to: string;
  rainbow?: boolean;
};

export const CUSTOM_PALETTE_ID = "custom";

export const TERMINAL_PALETTES: TerminalPalette[] = [
  { id: "vertex", name: "Vertex Cyan", from: "#8de6ff", to: "#c3a4ff" },
  { id: "ice", name: "Ice Blue", from: "#d6f4ff", to: "#3d8bff" },
  { id: "matrix", name: "Matrix", from: "#9dffa0", to: "#12873a" },
  { id: "amber", name: "Amber CRT", from: "#ffe7a3", to: "#ff8a3d" },
  { id: "synth", name: "Synthwave", from: "#ff8ee9", to: "#6c7bff" },
  { id: "fire", name: "Ember", from: "#ffd166", to: "#ff4d4d" },
  { id: "mono", name: "Monochrome", from: "#f2f6fa", to: "#7d8a99" },
  { id: "rainbow", name: "Rainbow", from: "#ff5f6d", to: "#6a5cff", rainbow: true },
];

export function getBanner(id: string): TerminalBanner | undefined {
  return TERMINAL_BANNERS.find((banner) => banner.id === id);
}

export function getPalette(id: string): TerminalPalette | undefined {
  return TERMINAL_PALETTES.find((palette) => palette.id === id);
}

export function splitArt(art: string): string[] {
  return art.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
}

/** Widest visual line, in characters (used for responsive sizing). */
export function artColumns(lines: string[]): number {
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}

export function normalizeHex(input: string, fallback = "#8de6ff"): string {
  const value = input.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) return `#${short[1].split("").map((c) => c + c).join("")}`;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex).slice(1);
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}

export function shadeHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `#${toHex(r + (255 - r) * amount)}${toHex(g + (255 - g) * amount)}${toHex(b + (255 - b) * amount)}`;
}

/** Per-line gradient colors for a banner, so ASCII art gets a smooth figlet/lolcat feel. */
export function bannerLineColors(lineCount: number, palette: TerminalPalette): string[] {
  if (lineCount <= 0) return [];
  if (lineCount === 1) return [palette.from];
  return Array.from({ length: lineCount }, (_, i) => {
    const t = i / (lineCount - 1);
    if (palette.rainbow) {
      const hue = Math.round(200 + t * 160) % 360;
      return hslToHex(hue, 92, 68);
    }
    return mixHex(palette.from, palette.to, t);
  });
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return `#${toHex((rgb[0] + m) * 255)}${toHex((rgb[1] + m) * 255)}${toHex((rgb[2] + m) * 255)}`;
}
