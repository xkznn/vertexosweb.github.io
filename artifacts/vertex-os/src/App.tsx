import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, Check, ChevronDown, ChevronRight, ChevronUp, CircleHelp,
  Code2, Compass, Cpu, Download, Eye, Gamepad2, Grid2X2,
  Image, LayoutGrid, LockKeyhole, Menu, MessageCircle, Minus, MonitorCog, Music2,
  Palette, Pin, PinOff, Play, Power, Puzzle, Radio, Rocket, RotateCcw,
  Settings2, ShieldBan, SlidersHorizontal, Search, Sparkles, Terminal, Volume2, VolumeX, Waves, X, Pause, Maximize, Maximize2, Minimize2, House, Plus, Package, EyeOff, ExternalLink, Contrast, Calculator, Bot,
} from "lucide-react";

import { MessagesSurface } from "./messages";
import { ChronusGPTSurface } from "./chronusgpt";
import { Ps5EmulatorSurface } from "./components/ps5-emulator";
import { MC_REALMS, type McRealm } from "./mcrealms";
import { LANG, LANGS, t, tf, tp, readLang, saveLang, localeOf, type Lang } from "./i18n";
import { WallpaperPicker, type PickerWallpaper, loadCustomWallpapers, persistCustomWallpaper, removeCustomWallpaper, readCustomWallpapersLocal } from "./components/wallpaper-picker";
import { TerminalBanner } from "./terminal/TerminalBanner";
import { ansiToNodes } from "./terminal/ansi";
import { CUSTOM_BANNER_ID, CUSTOM_PALETTE_ID, TERMINAL_BANNERS, TERMINAL_PALETTES, getBanner, getPalette, normalizeHex, type TerminalPalette } from "./terminal/banners";
import { DEFAULT_TERMINAL_CONFIG, TERMINAL_CURSORS, TERMINAL_FONTS, readTerminalConfig, terminalCssVars, terminalHasWallpaper, writeTerminalConfig, type TerminalConfig } from "./terminal/config";
import { PERF } from "./perf";
type WallpaperId = "singularity" | "snake-skeleton" | "snow-fox" | "cine55" | "gojo" | "rainy-city" | "green-anime" | "brother" | "99-med" | "gojo-sukuna" | "sukuna-fire" | "desktop-lines" | "skello" | "we-black-hole" | "we-snow-fox" | "we-gojo-sukuna" | "we-sukuna-fire" | "we-cine-55" | "we-snake" | "we-green-anime" | "we-brother" | "we-gojo" | "we-rainy-city" | "we-desktop-lines" | "we-skello" | "we-99-med" | "we-45e33" | "we-f1-formula" | "we-hunt-shadow-2" | "we-minecraft-01" | "we-minecraft-02" | "we-minecraft-03" | "we-monkey" | "we-supra-drift" | "we-yuji-52" | "we-cozy-fox" | "we-yuta" | "we-bmw-car-driving" | "we-eyes-toward-heaven" | "we-goku-ultra" | "we-galaxy-eyes" | "we-celestial-battle" | "we-tess-kotkin" | "we-yuta-rika" | "we-satoru-gojo" | "we-dark-angel" | "we-makima-devilish" | "we-makima-burning" | "we-haimiya-mio" | "we-toji" | "we-mamonir" | "we-lantern-festival" | "we-miyabi" | "we-qingxiao" | "we-megumin" | "we-odette" | "we-blue-sky" | "we-frutiger" | "we-synthwave-dmc" | "we-zankou" | "we-ghost-rider" | "we-molala" | "we-dark-king" | "we-celestial-veil" | "we-miku-nakano" | "we-gotoubun" | "we-quintuplets" | "we-black-silk-waves" | "we-blue-dragon-logo" | "we-astra-yao" | "we-luo-tianyi-christmas" | "we-mc-northern-light" | "we-mc-falling-snow" | "we-mc-aquarium" | "we-mc-holiday-heart" | "we-mc-fireplace" | "we-mc-panels" | "we-mc-cherry-blossom" | "we-mc-raindrops" | "we-silver-surfer" | "we-girl-behind-curtains" | "we-vagabond-miyamoto" | "we-itachi-crow" | "we-gojo-hollow" | "we-quintuplets-sister" | "we-yuta-okkotsu" | "we-gojo-vs-sukuna-2" | "we-gojo-cursed-world" | "we-gojo-six-eyes" | "we-frieren-blue-horizon" | "we-frieren-blooming-stream" | "we-nissan-skyline-r33-mc" | "we-torii";
type AppId = "hub" | "spicetify" | "chronusgpt" | "browser" | "pizza" | "roblox" | "messages" | "settings" | "games" | "translucenttb" | "wallpaper-engine" | "minecraft" | "rainmeter" | "terminal" | "calculator";
type WindowRect = { x: number; y: number; w: number; h: number };
type WindowState = { id: AppId; minimized: boolean; maximized: boolean; rect: WindowRect; prevRect: WindowRect | null };
type Wallpaper = { id: WallpaperId; name: string; meta: string; video?: string; image?: string; videoLow?: string };
type SystemSettings = { optimized: boolean; fastBoot: boolean; idleLock: boolean; confirm: boolean; cloak: string; cloakName: string; cloakIcon: string; panicKey: string; panicUrl: string; adblock: boolean; adblockUrl: string };
const defaultSettings: SystemSettings = { optimized: false, fastBoot: false, idleLock: false, confirm: false, cloak: "none", cloakName: "Vertex-OS", cloakIcon: "", panicKey: "`", panicUrl: "", adblock: false, adblockUrl: "" };
const PASSWORD_KEY = "vertex-password";

const DROP_GRID_COLS = 8;
const DROP_CELL_W = 94;
const DROP_CELL_H = 104;

function defaultWindowRect(index: number): WindowRect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const w = Math.min(vw - 32, Math.max(420, Math.round(vw * 0.72)));
  const h = Math.min(vh - 92, Math.max(320, Math.round(vh * 0.72)));
  const cascade = index % 6;
  const x = Math.max(6, Math.round((vw - w) / 2) + cascade * 26);
  const y = Math.max(6, Math.round((vh - h) / 2.3) + cascade * 20);
  return { x, y, w, h };
}

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const asset = (path: string) => `${base}${path}`;

const screenHighRes = typeof window !== "undefined" && window.devicePixelRatio * window.innerWidth >= 3200;
const nativeVideoQualified = !PERF.low && screenHighRes;
const bgSrc = (nativeV?: string, lowV?: string) => (!nativeV ? undefined : lowV && !nativeVideoQualified ? lowV : nativeV);
const pvSrc = (nativeV?: string, lowV?: string) => (!nativeV ? undefined : lowV ?? nativeV);

const CLOAKS: Record<string, { title: string; icon: string }> = {
  none: { title: "Vertex-OS", icon: asset("vertex-hub-logo.png") },
  google: {
    title: "Google",
    icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAA5FBMVEVHcEz9SlD/TkL/RUH/RUD/RkP4gyr/SUX/Rj//SE3/Yjb/UDn/Szz9TFb/Yi7/WTT8TVn/cyf/Zi7/iRz/fSL/lRb/SEjeuwX/qQ7/nhP/tgv9TFX6yQj/wwn/zAffugr8zgb+zwnzzQb4ywkvhv82qo79zgQek+ApjurzzAPlywIvhv0qifjRyQEth/y5yAKnxwAoivaMxQUak94fj+hzxAtawxdawhgLpa4OncYVltc8wCobvFIMuWgHqp0KorWaxQEnvz4bvUwPumUNumQMumgIr4wIqaIRvFoNu2MKtnRJwh6BPIl6AAAATHRSTlMAWZDK7P8Orf//Gv///+b/5P7////4dor///8qmP/9K0j/tu7/DeYwRP//HWr/rv///v/b///+HMT///+XTvD/5f//yGzw///////mXfQ9oAAAAWBJREFUeAF0z1UCgCAQRdEZ7O7u/W9STPr93oMCcENi2Y5jWwRBM9fz7zl0QeCFcidRHLMeJAkRj6dZdom/0+Uu62FRlpcQQILsfFVfIrqE/wPWoWleEXstYutdgO9dP9wi++/VCt0dx0dwL5u4DvNyiaFywbB1WS6ymfp+rJSMM5g2H7fYjOCsi5wOIAiCKNhRnG1bazv/fG7erFW/VcNezFEsKWVVZk2bOVi0BVuawE9GbcGOJrxoD3DEZD5ZtAcLdsX9vvWSW/ZM5g+H7JnHhFMcsI+CPpwXVOGSBsT8+Xy9VX5qfQerC77yDP94rEvB8/VCscO4z1f49+db8D9BFJEQ6N64/0hyqhVV03hxIo7+eMNLhmnZimLLjut6msCKZ3qhR+wN0/f9IAjD0PV4kV3rW/QoXF5sC4+KcEAShMkWzBeQ+QaFLX5rKrOWzcQjsHbUgCJbThA4lmwXVv8BPaBVEHC66TMAAAAASUVORK5CYII=",
  },
  classroom: { title: "Google Classroom", icon: "https://www.gstatic.com/classroom/logo_square_rounded.svg" },
};

const wallpapers: Wallpaper[] = [
  { id: "singularity", name: "Singularity", meta: t("wpMeta.singularity"), video: asset("videos/BlackHole.mp4"), videoLow: asset("videos/low/BlackHole.mp4") },
  { id: "snake-skeleton", name: "Snake Skeleton", meta: t("wpMeta.snake"), video: asset("videos/default.mp4"), videoLow: asset("videos/low/default.mp4") },
  { id: "snow-fox", name: "Snow Fox", meta: t("wpMeta.snow"), video: asset("videos/SnowFox.mp4") },
  { id: "cine55", name: "Cine 55", meta: t("wpMeta.cine55"), image: asset("wallpapers/Cine55.png") },
  { id: "gojo", name: "Gojo", meta: t("wpMeta.gojo"), video: asset("videos/Gojo.mp4"), videoLow: asset("videos/low/Gojo.mp4") },
  { id: "rainy-city", name: "Rainy City", meta: t("wpMeta.rainy"), video: asset("videos/RainyCity.mp4"), videoLow: asset("videos/low/RainyCity.mp4") },
  { id: "green-anime", name: "Green Anime", meta: t("wpMeta.green"), video: asset("videos/green.mp4"), videoLow: asset("videos/low/green.mp4") },
  { id: "brother", name: "Brother", meta: t("wpMeta.brother"), video: asset("videos/Brother.mp4"), videoLow: asset("videos/low/Brother.mp4") },
  { id: "99-med", name: "99 Med", meta: t("wpMeta.med"), video: asset("videos/99Med.mp4") },
  { id: "gojo-sukuna", name: "Gojo vs Sukuna", meta: t("wpMeta.gojoSukuna"), video: asset("videos/Gojo-Sukuna.mp4"), videoLow: asset("videos/low/Gojo-Sukuna.mp4") },
  { id: "sukuna-fire", name: "Sukuna Fire", meta: t("wpMeta.sukuna"), video: asset("videos/sukuna-fire.mp4") },
  { id: "desktop-lines", name: "Desktop Lines", meta: t("wpMeta.desktop"), video: asset("videos/Desktop.mp4"), videoLow: asset("videos/low/Desktop.mp4") },
  { id: "skello", name: "Skello", meta: t("wpMeta.skello"), video: asset("videos/Skello.mp4") },
];

type WallEngineEntry = {
  id: WallpaperId;
  name: string;
  category: string;
  resolution: string;
  age: string;
  ageLabel: string;
  stars: number;
  image?: string;
  video?: string;
  videoLow?: string;
};

const WE_AUTHOR = { name: "Vertex Bot", verified: true };

const resolvedSize = (e: WallEngineEntry): string =>
  e.image ? "8.4 MB" : e.resolution.startsWith("3840") ? "58 MB" : "28 MB";

const entryTags = (e: WallEngineEntry): string[] => {
  const tags = [e.resolution, e.ageLabel.toLowerCase()];
  if (e.category !== "Gaming") tags.push(e.category.toLowerCase());
  if (e.video) tags.push("video");
  else tags.push("image");
  tags.push("vertex-os");
  return tags;
};

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "⚡",
  Space: "🪐",
  Animals: "🐾",
  Scenery: "🏞️",
  City: "🌆",
  Cinematic: "🎬",
  Gaming: "🎮",
  Abstract: "🌀",
  Minimal: "▫️",
  Bizarre: "👁️",
  Synthwave: "🌇",
  Dark: "🕶️",
  Utility: "🛠️",
};

type ApplyTarget = "both" | "home" | "lock";

const wallEngineEntries: WallEngineEntry[] = [
  { id: "we-black-hole", name: "Black Hole", category: "Space", resolution: "3840 x 2160", age: "G", ageLabel: "All ages", stars: 4.9, video: asset("videos/BlackHole.mp4"), videoLow: asset("videos/low/BlackHole.mp4") },
  { id: "we-snow-fox", name: "Snow Fox", category: "Animals", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.8, video: asset("videos/SnowFox.mp4") },
  { id: "we-gojo-sukuna", name: "Gojo vs Sukuna", category: "Anime", resolution: "3840 x 2160", age: "T", ageLabel: "Teen", stars: 4.7, video: asset("videos/Gojo-Sukuna.mp4"), videoLow: asset("videos/low/Gojo-Sukuna.mp4") },
  { id: "we-rainy-city", name: "Rainy City", category: "City", resolution: "2560 x 1440", age: "G", ageLabel: "All ages", stars: 4.6, video: asset("videos/RainyCity.mp4"), videoLow: asset("videos/low/RainyCity.mp4") },
  { id: "we-sukuna-fire", name: "Sukuna Fire", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: asset("videos/sukuna-fire.mp4") },
  { id: "we-cine-55", name: "Cine 55", category: "Cinematic", resolution: "2560 x 1440", age: "G", ageLabel: "All ages", stars: 4.5, image: asset("wallpapers/Cine55.png") },
  { id: "we-snake", name: "Snake Skeleton", category: "Bizarre", resolution: "2560 x 1440", age: "T", ageLabel: "Teen", stars: 4.4, video: asset("videos/default.mp4"), videoLow: asset("videos/low/default.mp4") },
  { id: "we-green-anime", name: "Neon Field", category: "Scenery", resolution: "3840 x 2160", age: "G", ageLabel: "All ages", stars: 4.4, video: asset("videos/green.mp4"), videoLow: asset("videos/low/green.mp4") },
  { id: "we-brother", name: "Kin", category: "Cinematic", resolution: "3840 x 2160", age: "T", ageLabel: "Teen", stars: 4.3, video: asset("videos/Brother.mp4"), videoLow: asset("videos/low/Brother.mp4") },
  { id: "we-gojo", name: "Gojo", category: "Anime", resolution: "3840 x 2160", age: "T", ageLabel: "Teen", stars: 4.3, video: asset("videos/Gojo.mp4"), videoLow: asset("videos/low/Gojo.mp4") },
  { id: "we-skello", name: "Skello", category: "Minimal", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.2, video: asset("videos/Skello.mp4") },
  { id: "we-desktop-lines", name: "Desktop Lines", category: "Abstract", resolution: "4096 x 2048", age: "G", ageLabel: "All ages", stars: 4.1, video: asset("videos/Desktop.mp4"), videoLow: asset("videos/low/Desktop.mp4") },
  { id: "we-99-med", name: "Med Monitor", category: "Utility", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 3.9, video: asset("videos/99Med.mp4") },
  { id: "we-45e33", name: "45E33", category: "Cinematic", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.0, video: asset("videos/we-45e33.mp4") },
  { id: "we-f1-formula", name: "F-1 Formula", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://cineosweb.github.io/Videos/F-1.mp4" },
  { id: "we-hunt-shadow-2", name: "Hunt Shadow 2", category: "Cinematic", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.4, video: asset("videos/we-hunt.mp4") },
  { id: "we-minecraft-01", name: "Minecraft 01", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.2, video: asset("videos/we-minecraft-01.mp4") },
  { id: "we-minecraft-02", name: "Minecraft 02", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.1, video: asset("videos/we-minecraft-02.mp4") },
  { id: "we-minecraft-03", name: "Minecraft 03", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.2, video: asset("videos/we-minecraft-03.mp4") },
  { id: "we-monkey", name: "Monkey", category: "Animals", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.1, video: asset("videos/we-monkey.mp4") },
  { id: "we-supra-drift", name: "Supra drift", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.5, image: "https://cineosweb.github.io/Videos/Supra.PNG" },
  { id: "we-yuji-52", name: "Yuji 52", category: "Anime", resolution: "3840 x 2160", age: "T", ageLabel: "Teen", stars: 4.4, video: "https://cineosweb.github.io/Videos/Yuji52.mp4" },
  { id: "we-cozy-fox", name: "Cozy fox", category: "Animals", resolution: "3840 x 2160", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://cineosweb.github.io/Videos/CozyFox.mp4" },
  { id: "we-yuta", name: "Yuta", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.3, video: asset("videos/we-yuta.mp4") },
  { id: "we-bmw-car-driving", name: "BMW Car driving", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/660/bmw-carros-driving.1920x1080.mp4" },
  { id: "we-eyes-toward-heaven", name: "Eyes toward heaven", category: "Cinematic", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://motionbgs.com/media/10052/eyes-toward-heaven.1920x1080.mp4" },
  { id: "we-goku-ultra", name: "Goku Ultra Instinct", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.7, video: "https://motionbgs.com/media/1397/goku-ultra-instinct_2.1920x1080.mp4" },
  { id: "we-galaxy-eyes", name: "Galaxy eyes", category: "Abstract", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/10050/galaxy-eyes.1920x1080.mp4" },
  { id: "we-celestial-battle", name: "Celestial battle", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/9967/celestial-battle-gojo-vs-mahoraga.1920x1080.mp4" },
  { id: "we-tess-kotkin", name: "Tess Kotkin", category: "Gaming", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.4, video: "https://motionbgs.com/media/10095/tess-kotkin-snowbreak.1920x1080.mp4" },
  { id: "we-yuta-rika", name: "Yuta and cursed rika", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/10060/yuta-and-cursed-rika.1920x1080.mp4" },
  { id: "we-satoru-gojo", name: "Satoru Gojo", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.7, video: "https://motionbgs.com/media/415/satoru-gojo-with-red-and-blue-circles.1920x1080.mp4" },
  { id: "we-dark-angel", name: "Dark Angel Rising", category: "Cinematic", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/10102/dark-angel-rising.1920x1080.mp4" },
  { id: "we-makima-devilish", name: "Makima Devilish Gaze", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/10100/makima-devilish-gaze.1920x1080.mp4" },
  { id: "we-makima-burning", name: "Makima Burning eyes", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.4, video: "https://motionbgs.com/media/8613/makima-burning-eyes.1920x1080.mp4" },
  { id: "we-haimiya-mio", name: "Haimiya Mio manga memories", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.4, video: "https://motionbgs.com/media/10096/haimiya-mio-manga-memories.1920x1080.mp4" },
  { id: "we-toji", name: "Toji Fushiguro", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/10047/toji-fushiguro-playful-cloud.1920x1080.mp4" },
  { id: "we-mamonir", name: "Mamonir Night of Death", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/10069/mamonir.1920x1080.mp4" },
  { id: "we-lantern-festival", name: "Lantern Festival Night", category: "Scenery", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.6, video: "https://motionbgs.com/media/9923/lantern-festival-night.1920x1080.mp4" },
  { id: "we-miyabi", name: "Miyabi Moonlit silence", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/10002/miyabi-moonlit-silence.1920x1080.mp4" },
  { id: "we-qingxiao", name: "Qingxiao Wuthering Wave", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.4, video: "https://motionbgs.com/media/9989/qingxiao.1920x1080.mp4" },
  { id: "we-megumin", name: "Fiery Megumin", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/10021/fiery-megumin.1920x1080.mp4" },
  { id: "we-odette", name: "Odette Grace of the white swan", category: "Cinematic", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/10022/odette-grace-of-the-white-swan.1920x1080.mp4" },
  { id: "we-blue-sky", name: "Blue sky memories", category: "Scenery", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://motionbgs.com/media/10026/blue-sky-memories.1920x1080.mp4" },
  { id: "we-frutiger", name: "Frutiger aero", category: "Abstract", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://motionbgs.com/media/10011/frutiger-aero.1920x1080.mp4" },
  { id: "we-synthwave-dmc", name: "Synthwave DMC", category: "Synthwave", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/9969/synthwave-delorean.1920x1080.mp4" },
  { id: "we-zankou", name: "Zankou Neverness", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.4, video: "https://motionbgs.com/media/9968/zankou-nte.1920x1080.mp4" },
  { id: "we-ghost-rider", name: "Ghost Rider burning soul", category: "Dark", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/9948/ghost-rider-burning-soul.1920x1080.mp4" },
  { id: "we-molala", name: "Molala", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/9885/molala.1920x1080.mp4" },
  { id: "we-dark-king", name: "Dark King Abyss", category: "Dark", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/9780/dark-king-abyss.1920x1080.mp4" },
  { id: "we-celestial-veil", name: "Celestial Veil", category: "Abstract", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/8626/celestial-veil.1920x1080.mp4" },
  { id: "we-miku-nakano", name: "Miku Nakano", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.6, video: "https://motionbgs.com/media/9806/miku-nakano-quintessential-quintuplets.1920x1080.mp4" },
  { id: "we-gotoubun", name: "Gotoubun No hanayome", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.5, video: "https://motionbgs.com/media/9819/gotoubun-no-hanayome.1920x1080.mp4" },
  { id: "we-quintuplets", name: "The Quintessential Quintuplets", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.6, video: "https://motionbgs.com/media/9784/the-quintessential-quintuplets.1920x1080.mp4" },
  { id: "we-black-silk-waves", name: "Black Silk Waves", category: "Abstract", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.5, video: "https://motionbgs.com/media/10046/black-silk-waves.1920x1080.mp4" },
  { id: "we-blue-dragon-logo", name: "Blue Dragon", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/2773/blue-dragon-logo.1920x1080.mp4" },
  { id: "we-astra-yao", name: "Astra Yao (ZZZ)", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.6, video: "https://motionbgs.com/media/9956/astra-yao-zzz.1920x1080.mp4" },
  { id: "we-luo-tianyi-christmas", name: "Luo Tianyi Christmas", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.5, video: "https://motionbgs.com/media/9163/luo-tianyi-christmas-wish.1920x1080.mp4" },
  { id: "we-mc-northern-light", name: "Minecraft Northern Light", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://motionbgs.com/media/9360/minecraft-northern-light.1920x1080.mp4" },
  { id: "we-mc-falling-snow", name: "Minecraft Falling Snow", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://motionbgs.com/media/9269/minecraft-falling-snow.1920x1080.mp4" },
  { id: "we-mc-aquarium", name: "Minecraft Aquarium", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/6069/minecraft-aquarium.1920x1080.mp4" },
  { id: "we-mc-holiday-heart", name: "Minecraft Holiday Heart", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.3, video: "https://motionbgs.com/media/8300/minecraft-holiday-hearth.1920x1080.mp4" },
  { id: "we-mc-fireplace", name: "Fireplace in Minecraft", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/1963/fireplace-in-minecraft.1920x1080.mp4" },
  { id: "we-mc-panels", name: "Minecraft Panels", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.2, video: "https://motionbgs.com/media/4776/minecraft-panels.1920x1080.mp4" },
  { id: "we-mc-cherry-blossom", name: "Cherry Blossom Minecraft", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.4, video: "https://motionbgs.com/media/3227/cherry-blossom.1920x1080.mp4" },
  { id: "we-mc-raindrops", name: "Raindrops Minecraft", category: "Gaming", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.2, video: "https://motionbgs.com/media/3073/raindrops-minecraft.1920x1080.mp4" },
  { id: "we-silver-surfer", name: "Silver Surfer Cosmic Void", category: "Cinematic", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.5, video: "https://motionbgs.com/media/9078/silver-surfer-cosmic-void.1920x1080.mp4" },
  { id: "we-girl-behind-curtains", name: "Girl Behind Curtains", category: "Cinematic", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.4, video: "https://motionbgs.com/media/8925/girl-behind-curtains-3.1920x1080.mp4" },
  { id: "we-vagabond-miyamoto", name: "Vagabond Miyamoto Musashi", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/7160/vagabon-miyamoto-musashi.1920x1080.mp4" },
  { id: "we-itachi-crow", name: "Uchiha Itachi Crow Attack", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/10055/uchiha-crow-attack.1920x1080.mp4" },
  { id: "we-gojo-hollow", name: "Gojo Hollow Eyes", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/9624/gojo-hollow-eyes.1920x1080.mp4" },
  { id: "we-quintuplets-sister", name: "Quintuplets Sister (FULL)", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.6, video: "https://motionbgs.com/media/9807/nakano-miku-ichika-itsuki-yotsuba-nino-quintuplets-sisters.1920x1080.mp4" },
  { id: "we-yuta-okkotsu", name: "Yuta Okkotsu Curse Spirit", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/9450/yuta-okkotsu-curse-spirit.1920x1080.mp4" },
  { id: "we-gojo-vs-sukuna-2", name: "Gojo vs Sukuna 2", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.7, video: "https://motionbgs.com/media/5452/gojo-vs-sukuna-battle.1920x1080.mp4" },
  { id: "we-gojo-cursed-world", name: "Gojo Cursed World", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/2310/jujutsu-kaisen-gojos-cursed-world.1920x1080.mp4" },
  { id: "we-gojo-six-eyes", name: "Gojo Six Eyes", category: "Anime", resolution: "1920 x 1080", age: "T", ageLabel: "Teen", stars: 4.6, video: "https://motionbgs.com/media/1864/gojo-six-eyes-jujutsu-kaisen.1920x1080.mp4" },
  { id: "we-frieren-blue-horizon", name: "Frieren Blue Horizon", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.6, video: "https://motionbgs.com/media/9181/frieren-blue-horizon.1920x1080.mp4" },
  { id: "we-frieren-blooming-stream", name: "Frieren Blooming Stream", category: "Anime", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.5, video: "https://motionbgs.com/media/9344/frieren-blooming-stream.1920x1080.mp4" },
  { id: "we-nissan-skyline-r33-mc", name: "Nissan Skyline R33 X Minecraft", category: "Gaming", resolution: "3840 x 2160", age: "G", ageLabel: "All ages", stars: 4.8, video: asset("videos/nissan-skyline-r33-mc.mp4"), videoLow: asset("videos/low/nissan-skyline-r33-mc.mp4") },
  { id: "we-torii", name: "Torii", category: "Scenery", resolution: "1920 x 1080", age: "G", ageLabel: "All ages", stars: 4.5, video: "https://motionbgs.com/media/3764/torii.1920x1080.mp4" },
];

const WE_RECENT: WallpaperId[] = ["we-torii", "we-nissan-skyline-r33-mc", "we-frieren-blooming-stream", "we-frieren-blue-horizon", "we-gojo-six-eyes", "we-gojo-cursed-world", "we-gojo-vs-sukuna-2", "we-yuta-okkotsu", "we-quintuplets-sister", "we-gojo-hollow", "we-itachi-crow", "we-vagabond-miyamoto", "we-girl-behind-curtains", "we-silver-surfer", "we-mc-raindrops", "we-mc-cherry-blossom", "we-mc-panels", "we-mc-fireplace", "we-mc-holiday-heart", "we-mc-aquarium", "we-mc-falling-snow", "we-mc-northern-light", "we-luo-tianyi-christmas", "we-astra-yao", "we-blue-dragon-logo", "we-black-silk-waves", "we-snow-fox", "we-rainy-city", "we-cine-55", "we-green-anime", "we-gojo", "we-45e33", "we-f1-formula", "we-hunt-shadow-2", "we-minecraft-01", "we-minecraft-02", "we-minecraft-03", "we-monkey", "we-supra-drift", "we-yuji-52", "we-cozy-fox", "we-yuta", "we-bmw-car-driving", "we-eyes-toward-heaven", "we-goku-ultra", "we-galaxy-eyes", "we-celestial-battle", "we-tess-kotkin", "we-yuta-rika", "we-satoru-gojo", "we-dark-angel", "we-makima-devilish", "we-makima-burning", "we-haimiya-mio", "we-toji", "we-mamonir", "we-lantern-festival", "we-miyabi", "we-qingxiao", "we-megumin", "we-odette", "we-blue-sky", "we-frutiger", "we-synthwave-dmc", "we-zankou", "we-ghost-rider", "we-molala", "we-dark-king", "we-celestial-veil", "we-miku-nakano", "we-gotoubun", "we-quintuplets"];
const WE_POPULAR: WallpaperId[] = ["we-nissan-skyline-r33-mc", "we-black-hole", "we-gojo-sukuna", "we-sukuna-fire", "we-snake", "we-brother"];

wallpapers.push(...wallEngineEntries.map((e) => ({ id: e.id, name: e.name, meta: `${e.category} // ${e.resolution}`, video: e.video, image: e.image, videoLow: e.videoLow })));

const MC_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAATlBMVEVSpTVRpDRJli9PoDNMmzEAAwABDgIAAAA9eydUqTY9eygCAAUJCAhdpEE2ZiQfRxUgQRU6diYGFQUOIgk3byRGeTEVGhFBgCpYqztis0Op4b1OAAAAiUlEQVR4AdXLBQ7EIBRF0Y9Td9v/QvG6xEZvhZecAH8YwjZiJ3ETbZAyzrmQEUAkhZmMblHYAtrOGFuMT/h8M0nTNPHo5hYhs+WFKXcTDkVRKUxlFMEpQqlHSsnpXlU33CJv6io6YiuW2g9il5m6G5SRSV5h1fdDZM6h76sjwjhN4+Y8hNDmfGsa0OAJeZWq1QUAAAAASUVORK5CYII=";
const RAINMETER_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAVFBMVEVHcEwobJoma5oobZsjapkgapo6d6Mma5kcZ5d0m76mvtkma5rX4PTw8P9Th64japknbJqTsc++zuX19P/x6Orv39jou5DjoE/s1MPgjhzgkSnlrG/pPPZZAAAAEXRSTlMAOoEJ1f3/p+f//1r////AIySV8nYAAADzSURBVHgBYiAeMALqJI8kC2EYiBZBco4ic/97DmIS+Nu9fYpd3bfZMELXhD2gGFpDpdJgGkMFWOdDrEIjk3MZqjfF4K1zLsmuek12l6yv3BRHZR0rVW7qMRMzsj6UrVEqRkwTmkbjvXUsIKhfRpSgazSy8N0q/YMVrQY0TfP8S+3LJgFuXtZ12X62+vHxTfC07JfWZSai7fLwYf/I8DiOC5/LebwNDkgbQ8bHvpIa49N0O503ZbwRhMK8+Tx21rG4Ig89aDct53pfnDEUEcFk+dXZOe3HIipRgE/Z2qwVhu4jXiYAeo84mruvxNH0vYkPb74AqzITDrilOz4AAAAASUVORK5CYII=";

const apps: { id: AppId; title: string; subtitle: string; icon: LucideIcon; iconImg?: string; pinned?: boolean }[] = [
  { id: "hub", title: "Vertex-Hub", subtitle: t("appSub.hub"), icon: Sparkles, iconImg: asset("images/velara.png"), pinned: true },
  { id: "spicetify", title: "Spicetify", subtitle: t("appSub.spicetify"), icon: Music2, iconImg: asset("images/spicetify.ico"), pinned: true },
  { id: "chronusgpt", title: "WormGPT", subtitle: t("appSub.spicetify"), icon: Bot, iconImg: asset("images/wormgpt.png"), pinned: true },
  { id: "wallpaper-engine", title: "Wallpaper Engine", subtitle: t("appSub.wallpaperEngine"), icon: Image, iconImg: asset("images/wallpaper-engine.gif"), pinned: true },
  { id: "browser", title: "Browser", subtitle: t("appSub.browser"), icon: Compass, iconImg: asset("images/endis-rest.png"), pinned: true },
  { id: "pizza", title: "Pizza edition", subtitle: t("appSub.pizza"), icon: Compass, iconImg: asset("images/pizza.ico"), pinned: true },
  { id: "roblox", title: "Roblox", subtitle: t("appSub.roblox"), icon: Gamepad2, iconImg: asset("images/roblox.ico"), pinned: true },
  { id: "messages", title: "Messages", subtitle: t("appSub.messages"), icon: MessageCircle, iconImg: asset("images/messages-icon.webp"), pinned: true },
  { id: "settings", title: "Config", subtitle: t("appSub.settings"), icon: Settings2, iconImg: asset("images/config-icon.png"), pinned: true },
  { id: "games", title: "PS5 Emu", subtitle: t("appSub.games"), icon: Gamepad2, iconImg: asset("images/ps5-emu.png") },
  { id: "minecraft", title: "Minecraft Launcher", subtitle: t("appSub.minecraft"), icon: Gamepad2, iconImg: MC_ICON },
  { id: "translucenttb", title: "TranslucentTB", subtitle: t("appSub.translucenttb"), icon: Waves, iconImg: asset("images/translucenttb-logo.png") },
  { id: "calculator", title: "Calculator", subtitle: t("appSub.calculator"), icon: Calculator, iconImg: asset("images/calculator-logo.svg") },
  { id: "rainmeter", title: "Rainmeter", subtitle: t("appSub.rainmeter"), icon: MonitorCog, iconImg: RAINMETER_ICON },
  { id: "terminal", title: "Terminal", subtitle: t("appSub.terminal"), icon: Terminal, iconImg: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Windows_Terminal_logo.svg/960px-Windows_Terminal_logo.svg.png", pinned: true },
];

type AppOverride = { name?: string; showName?: boolean; iconUrl?: string; pinned?: boolean };

function getApp(id: AppId, overrides: Record<string, AppOverride>) {
  const base = apps.find((app) => app.id === id) ?? apps[0];
  const ov = overrides[id] ?? {};
  return { ...base, title: ov.name ?? base.title, showName: ov.showName ?? false, iconUrl: ov.iconUrl };
}

const storage = {
  read<T>(key: string, fallback: T): T {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) as T : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* session still works */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

let clickSfxCtx: AudioContext | null = null;
function playClick() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    clickSfxCtx ??= new AC();
    const ctx = clickSfxCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;

    const frames = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2500;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.55, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.065);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.45, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.11);

    const snap = ctx.createOscillator();
    snap.type = "triangle";
    snap.frequency.setValueAtTime(1200, t);
    snap.frequency.exponentialRampToValueAtTime(500, t + 0.05);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    snap.connect(sg);
    sg.connect(ctx.destination);
    snap.start(t);
    snap.stop(t + 0.07);
  } catch { /* clicks keep working silently */ }
}

function readRainmeterConfig(): RainmeterSettings {
  const stored = storage.read<Partial<RainmeterSettings>>("rainmeter-config", {});
  const cfg = { ...DEFAULT_RAINMETER, ...stored };
  if (!RM_SKINS.includes(cfg.skin)) cfg.skin = "mond";
  if (!RM_DATE_STYLES.includes(cfg.dateFormat)) cfg.dateFormat = "mond";
  if (!Number.isFinite(cfg.posX)) cfg.posX = DEFAULT_RAINMETER.posX;
  if (!Number.isFinite(cfg.posY)) cfg.posY = DEFAULT_RAINMETER.posY;
  if (!Number.isFinite(cfg.darkThreshold)) cfg.darkThreshold = DEFAULT_RAINMETER.darkThreshold;
  if (!Number.isFinite(cfg.lightThreshold)) cfg.lightThreshold = DEFAULT_RAINMETER.lightThreshold;
  if (!Number.isFinite(cfg.centerRegionPct)) cfg.centerRegionPct = DEFAULT_RAINMETER.centerRegionPct;
  return cfg;
}

function rmTimeText(date: Date, format24: boolean, showSeconds: boolean): string {
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const seconds = showSeconds ? `:${ss}` : "";
  if (format24) return `${String(date.getHours()).padStart(2, "0")}:${mm}${seconds}`;
  const h = date.getHours() % 12 || 12;
  return `${String(h).padStart(2, "0")}:${mm}${seconds} ${date.getHours() >= 12 ? "PM" : "AM"}`;
}

function rmDateText(date: Date, style: RainmeterDateStyle, lang: Lang): string {
  const mon = date.toLocaleDateString(localeOf(lang), { month: "long" });
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  if (style === "dot") return `${day}.${String(date.getMonth() + 1).padStart(2, "0")}.${year}`;
  if (style === "long") return `${day} ${mon}, ${year}.`;
  if (style === "short") return `${day} ${mon}`;
  return `${day}  ${mon},  ${year}.`;
}

function dayPartOf(date: Date): "morning" | "afternoon" | "evening" | "night" {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18) return "evening";
  return "night";
}

function rmAnchorStyle(position: RainmeterPosition, marginH: number, marginV: number): CSSProperties {
  switch (position) {
    case "top": return { left: "50%", top: 0, transform: `translate(calc(-50% + ${marginH}px), ${marginV}px)` };
    case "top-left": return { left: marginH, top: marginV, transform: "none" };
    case "top-right": return { right: marginH, top: marginV, transform: "none" };
    case "middle-left": return { left: marginH, top: "50%", transform: `translate(0, calc(-50% + ${marginV}px))` };
    case "middle-right": return { right: marginH, top: "50%", transform: `translate(0, calc(-50% + ${marginV}px))` };
    case "bottom-left": return { left: marginH, bottom: marginV, transform: "none" };
    case "bottom-center": return { left: "50%", bottom: 0, transform: `translate(calc(-50% + ${marginH}px), -${marginV}px)` };
    case "bottom-right": return { right: marginH, bottom: marginV, transform: "none" };
    default: return { left: "50%", top: "50%", transform: `translate(calc(-50% + ${marginH}px), calc(-50% + ${marginV}px))` };
  }
}

const lumaCache = new Map<string, number | null>();

function avgLuma(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return data.length ? sum / (data.length / 4) : 128;
}

function analyzeCenterLuminance(src: string, regionPct: number): Promise<number | null> {
  const key = `${src}|${regionPct}`;
  if (lumaCache.has(key)) return Promise.resolve(lumaCache.get(key) ?? null);
  if (PERF.low) return Promise.resolve(null);
  return new Promise((resolve) => {
    const pct = Math.min(100, Math.max(1, regionPct));
    const done = (value: number | null) => { lumaCache.set(key, value); resolve(value); };
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { done(null); return; }
    const isRemote = /^https?:/i.test(src);
    if (/\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)(\?|$)/i.test(src) || src.startsWith("blob:")) {
      const imgEl = document.createElement("img");
      if (isRemote) imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        try {
          canvas.width = Math.max(1, Math.round((imgEl.width * pct) / 100));
          canvas.height = Math.max(1, Math.round((imgEl.height * pct) / 100));
          ctx.drawImage(imgEl, (imgEl.width - canvas.width) / 2, (imgEl.height - canvas.height) / 2, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
          done(avgLuma(ctx, canvas.width, canvas.height));
        } catch { done(null); }
      };
      imgEl.onerror = () => done(null);
      imgEl.src = src;
      return;
    }
    const video = document.createElement("video");
    if (isRemote) video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    let settled = false;
    const release = () => { clearTimeout(timer); if (!settled) { settled = true; } video.removeAttribute("src"); video.load(); };
    const timer = window.setTimeout(() => { done(null); release(); }, 8000);
    const sample = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        canvas.width = Math.max(1, Math.round((video.videoWidth * pct) / 100));
        canvas.height = Math.max(1, Math.round((video.videoHeight * pct) / 100));
        ctx.drawImage(video, (video.videoWidth - canvas.width) / 2, (video.videoHeight - canvas.height) / 2, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        done(avgLuma(ctx, canvas.width, canvas.height));
      } catch { done(null); }
      video.removeAttribute("src");
      video.load();
    };
    video.onloadedmetadata = () => { try { video.currentTime = Math.min(0.5, Math.max(0.1, video.duration * 0.01)); } catch { /* ignore */ } };
    video.onseeked = sample;
    video.onerror = () => { done(null); release(); };
    video.src = src;
  });
}

function RainmeterClock({ cfg, date, tone, color }: { cfg: RainmeterSettings; date: Date; tone: "lock" | "home"; color?: string }) {
  const time = rmTimeText(date, cfg.format24, cfg.showSeconds);
  const dayFull = date.toLocaleDateString(localeOf(LANG), { weekday: "long" }).toUpperCase();
  const dayShort = date.toLocaleDateString(localeOf(LANG), { weekday: "short" }).toUpperCase().replace(/\.$/, "");
  const dateLine = rmDateText(date, cfg.dateFormat, LANG).toUpperCase();
  const isNarrow = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  const rmZ = 1;
  const rootStyle = { color: color ?? cfg.color, "--rm-accent": cfg.accent, "--rm-z": rmZ } as CSSProperties;
  const scaleStyle = { transform: `scale(${cfg.scale})` } as CSSProperties;
  const cls = `rm-clock rm-clock--${tone} rm-${cfg.skin}`;
  if (cfg.skin === "summit") {
    return <div className={cls} style={rootStyle}><div className="rm-scale" style={scaleStyle}>
      <span className="rm-summit-line" />
      <span className="rm-summit-greet">GOOD</span>
      <span className="rm-summit-part">{t(`rm.day.${dayPartOf(date)}`).toUpperCase()}</span>
      <span className="rm-summit-day">{dayShort}</span>
      <span className="rm-summit-date">{dateLine}</span>
      <span className={`rm-summit-time${cfg.format24 ? "" : " rm-summit-time--12h"}`}>{time}</span>
      <span className="rm-summit-line" />
    </div></div>;
  }
  if (cfg.skin === "default") {
    if (tone === "home") {
      return <div className={cls} style={rootStyle}><div className="rm-scale" style={scaleStyle}>
        <span className="rm-default-day">{dayFull}</span>
      </div></div>;
    }
    const fullDate = date.toLocaleDateString(localeOf(LANG), { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
    return <div className={cls} style={rootStyle}><div className="rm-scale" style={scaleStyle}>
      <span className="rm-default-day">{dayFull}</span>
      <span className="rm-default-date">{fullDate}</span>
      <span className="rm-default-time">- {time} -</span>
    </div></div>;
  }
  const mondDate = `${String(date.getDate()).padStart(2, "0")}  ${date.toLocaleDateString(localeOf(LANG), { month: "long" }).toUpperCase()}  ${date.getFullYear()}.`;
  return <div className={cls} style={rootStyle}><div className="rm-scale" style={scaleStyle}>
    <span className="rm-mond-day">{dayFull}</span>
    <span className="rm-mond-date">{cfg.dateFormat === "mond" ? mondDate : dateLine}</span>
    <span className="rm-mond-time">- {time} -</span>
  </div></div>;
}

function RainmeterWidget({ cfg, date, tone, wallpaper }: { cfg: RainmeterSettings; date: Date; tone: "lock" | "home"; wallpaper?: PickerWallpaper }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [autoColor, setAutoColor] = useState<string | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const wallpaperSrc = wallpaper?.image ?? wallpaper?.videoLow ?? wallpaper?.video ?? "";
  useEffect(() => {
    if (!cfg.autoTextColor || !wallpaperSrc) { setAutoColor(null); return; }
    let alive = true;
    analyzeCenterLuminance(wallpaperSrc, cfg.centerRegionPct).then((luma) => {
      if (!alive) return;
      if (luma === null) { setAutoColor(null); return; }
      if (luma < (cfg.darkThreshold / 100) * 255) setAutoColor("#ffffff");
      else if (luma > (cfg.lightThreshold / 100) * 255) setAutoColor("#0d1117");
      else setAutoColor(null);
    });
    return () => { alive = false; };
  }, [cfg.autoTextColor, cfg.darkThreshold, cfg.lightThreshold, cfg.centerRegionPct, wallpaperSrc]);

  useEffect(() => {
    if (cfg.position === "free") setDragPos({ x: cfg.posX, y: cfg.posY });
    else setDragPos(null);
  }, [cfg.position, cfg.posX, cfg.posY]);

  const commit = (patch: Partial<RainmeterSettings>) => {
    storage.write("rainmeter-config", { ...cfg, ...patch });
    window.dispatchEvent(new CustomEvent("rainmeter-config-updated"));
    setMenu(null);
  };

  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".rm-context-menu, .rm-menu-backdrop")) return;
    if (!cfg.draggable || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    targetRef.current = null;
    didDrag.current = false;
    setDragging(true);
    setMenu(null);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    event.preventDefault();
  };

  const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    didDrag.current = true;
    const dx = event.clientX - dragRef.current.dx;
    const dy = event.clientY - dragRef.current.dy;
    const x = Math.min(100, Math.max(0, (dx / window.innerWidth) * 100));
    const y = Math.min(100, Math.max(0, (dy / window.innerHeight) * 100));
    targetRef.current = { x, y };
    setDragPos({ x, y });
  };

  const handleUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    const target = targetRef.current;
    targetRef.current = null;
    if (target) commit({ position: "free", posX: target.x, posY: target.y });
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (didDrag.current) {
      didDrag.current = false;
      event.stopPropagation();
    }
  };

  const handleContext = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  const free = dragPos ?? (cfg.position === "free" ? { x: cfg.posX, y: cfg.posY } : null);
  const style: CSSProperties = free
    ? { left: `${free.x}%`, top: `${free.y}%`, transform: "none" }
    : rmAnchorStyle(cfg.position, cfg.marginH, cfg.marginV);

  return <div
    className={`rm-widget ${cfg.draggable ? "" : "rm-widget--static"} ${dragging ? "rm-dragging" : ""}`}
    style={style}
    onPointerDown={handleDown}
    onPointerMove={handleMove}
    onPointerUp={handleUp}
    onPointerCancel={handleUp}
    onClick={handleClick}
    onContextMenu={handleContext}
  >
    <RainmeterClock cfg={cfg} date={date} tone={tone} color={autoColor ?? undefined} />
    {menu ? <>
      <div className="rm-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setMenu(null); }} />
      <div className="rm-context-menu" style={{ left: menu.x, top: menu.y }}>
        <button className="rm-menu-row" onClick={() => commit({ draggable: !cfg.draggable })}>
          <span className={`rm-menu-check ${cfg.draggable ? "on" : ""}`}>{cfg.draggable ? <Check size={12} strokeWidth={3} /> : null}</span>
          Draggable
        </button>
        <div className="rm-menu-sep" />
        <button className="rm-menu-row rm-menu-danger" onClick={() => commit({ showClock: false })}>Unload skin</button>
      </div>
    </> : null}
  </div>;
}

type CinefyTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string;
  trackViewUrl: string;
  primaryGenreName: string;
};

type MarketCategory = "extensions" | "themes" | "snippets";
type MarketItem = { id: string; name: string; by: string; version: string; desc: string; category: MarketCategory; glyph: "theme" | "extension" | "snippet"; color: string; art?: string };
type HazyConfig = { enabled: boolean; custom: boolean; url: string; colorOn: boolean; color: string; tint: number; blur: number; contrast: number; saturation: number; brightness: number; size: number };
const DEFAULT_HAZY: HazyConfig = { enabled: true, custom: false, url: "", colorOn: false, color: "#8b5cf6", tint: 0.28, blur: 0, contrast: 104, saturation: 114, brightness: 88, size: 1 };
type SpicetifyTab = "home" | "search" | "liked" | "playlist" | "marketplace" | "hazy" | "nowplaying";
type Playlist = { id: number; name: string; trackIds: number[] };
type TrackCache = Record<number, CinefyTrack>;
type LyricLine = { time: number; text: string };

function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const tagRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const matches = Array.from(raw.matchAll(tagRe));
    const content = raw.replace(tagRe, "").trim();
    if (!content || content.startsWith("[")) continue;
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionRaw = match[3] ?? "0";
      const fraction = fractionRaw.length === 2 ? Number(fractionRaw) / 100 : Number(fractionRaw) / 1000;
      lines.push({ time: minutes * 60 + seconds + fraction, text: content });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function estimateLyricTimes(lines: string[], total: number): LyricLine[] {
  const weights = lines.map((line) => Math.max(1, line.split(/\s+/).filter(Boolean).length));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  return lines.map((text, i) => {
    const out: LyricLine = { time: cursor, text };
    cursor += (weights[i] / sum) * total;
    return out;
  });
}

function renderLyricText(line: LyricLine, live: boolean, progress: number): ReactNode {
  if (!live) return line.text;
  const tokens = line.text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return line.text;
  const lit = Math.max(1, Math.min(tokens.length, Math.round(tokens.length * Math.max(0, Math.min(1, progress)))));
  return <>{tokens.map((token, wi) => <span key={wi} className={wi < lit ? "sung" : "upcoming"}>{token}{wi < tokens.length - 1 ? " " : ""}</span>)}</>;
}

function BeautifulLyricsPanel({ track, lines, lyricIndex, lineProgress, playing, progress, duration, timeNow, timeTotal, synced, offset, onOffset, onSyncNow, strings }: {
  track: CinefyTrack;
  lines: LyricLine[];
  lyricIndex: number;
  lineProgress: number;
  playing: boolean;
  progress: number;
  duration: number;
  timeNow: string;
  timeTotal: string;
  synced: boolean;
  offset: number;
  onOffset: (v: number) => void;
  onSyncNow: () => void;
  strings: { title: string; noLyrics: string; full: string; collapse: string; synced: string; estimate: string; syncNow: string };
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const userScrollRef = useRef(false);
  const userScrollTimer = useRef(0);
  const [full, setFull] = useState(false);
  const [hueBase] = useState(() => Math.abs((track.trackId * 137.508) % 360));
  const art = track.artworkUrl100.replace("100x100", "600x600");
  const h2 = (hueBase + 42) % 360;
  const h3 = (hueBase - 42 + 360) % 360;
  const particles = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    left: ((i * 37 + 11) % 94) + 2,
    top: ((i * 23 + 17) % 70) + 8,
    size: 2 + ((i * 5) % 5),
    delay: (i % 5) * 0.9,
    dur: 12 + (i % 4) * 5,
    hue: (hueBase + i * 41) % 360,
  })), [hueBase]);

  function tilt(clientX: number, clientY: number) {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width - 0.5;
    const y = (clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--bl-rx", `${(-y * 3.5).toFixed(2)}deg`);
    el.style.setProperty("--bl-ry", `${(x * 5).toFixed(2)}deg`);
  }

  function resetTilt() {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--bl-rx", "0deg");
    el.style.setProperty("--bl-ry", "0deg");
  }

  function markUserScroll() {
    userScrollRef.current = true;
    window.clearTimeout(userScrollTimer.current);
    userScrollTimer.current = window.setTimeout(() => { userScrollRef.current = false; }, 2500);
  }

  useEffect(() => {
    if (full || userScrollRef.current) return;
    const el = lineRefs.current[lyricIndex];
    if (el && listRef.current) listRef.current.scrollTo({ top: Math.max(0, el.offsetTop - 120), behavior: "smooth" });
  }, [lyricIndex, full]);

  useEffect(() => () => window.clearTimeout(userScrollTimer.current), []);

  const ratio = duration > 0 ? Math.max(0, Math.min(1, progress / duration)) : 0;

  return <div className="bl-panel" style={{ "--bl-h1": hueBase, "--bl-h2": h2, "--bl-h3": h3 } as CSSProperties}>
    <div className="bl-panel-bg" aria-hidden="true">
      <img className="bl-panel-art" src={art} alt="" draggable={false} />
      {particles.map((p, i) => <span key={i} className="bl-particle" style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: `hsl(${p.hue} 95% 72% / .85)`, boxShadow: `0 0 ${p.size * 3}px hsl(${p.hue} 95% 65% / .7)` }} />)}
      <span className="bl-aurora bl-a1" />
      <span className="bl-aurora bl-a2" />
      <span className="bl-veil" />
    </div>
    <div className="bl-panel-body" ref={stageRef} onPointerMove={(e) => tilt(e.clientX, e.clientY)} onPointerLeave={resetTilt}>
      <div className="bl-head">
        <span className="bl-vinyl-mini" style={{ backgroundImage: `url(${art})` }} aria-hidden="true" />
        <span className="bl-title">{strings.title}</span>
        <span className="bl-badge">BL</span>
        <span className={`bl-sync ${synced ? "synced" : "estimate"}`}>{synced ? strings.synced : strings.estimate}</span>
        {lines.length > 0 && <button className="bl-full" onClick={() => setFull((v) => !v)}>{full ? strings.collapse : strings.full}</button>}
      </div>
      {synced && lines.length > 0 && <div className="bl-syncrow" data-testid="bl-syncrow">
        <button data-testid="bl-nudge-dn" onClick={() => onOffset(Math.round((offset - 0.25) * 100) / 100)} aria-label="Shift lyrics 0.25s earlier">−0.25</button>
        <span className={`bl-offset ${offset ? "active" : ""}`}>{offset > 0 ? "+" : ""}{offset.toFixed(2)}s</span>
        <button data-testid="bl-nudge-up" onClick={() => onOffset(Math.round((offset + 0.25) * 100) / 100)} aria-label="Shift lyrics 0.25s later">+0.25</button>
        <button className="bl-resync" data-testid="bl-sync-now" onClick={onSyncNow} aria-label={strings.syncNow}><RotateCcw size={11} /> {strings.syncNow}</button>
        {offset !== 0 && <button className="bl-resync bl-reset" onClick={() => onOffset(0)} aria-label="Reset sync offset">↺ 0</button>}
      </div>}
      {lines.length === 0
        ? <div className="bl-empty"><span className="bl-eq"><span /><span /><span /></span><div>{strings.noLyrics}</div></div>
        : <div className={`bl-list ${full ? "full" : "clip"}`} ref={listRef} onWheel={markUserScroll} onPointerDown={markUserScroll} onTouchStart={markUserScroll}>
            {lines.map((line, i) => {
              if (i !== lyricIndex) {
                return <p key={i} ref={(el) => { lineRefs.current[i] = el; }} className="bl-cl">{line.text}</p>;
              }
              const words = line.text.split(/\s+/).filter(Boolean);
              const lit = Math.max(0, Math.min(words.length, Math.round(words.length * Math.max(0, Math.min(1, lineProgress)))));
              return <p key={i} ref={(el) => { lineRefs.current[i] = el; }} className="bl-cl active">
                <span className="bl-words" key={`w-${lyricIndex}`}>{words.map((w, wi) => <span key={wi} className={`bl-word ${wi < lit ? "lit" : ""}`} style={{ animationDelay: `${wi * 45}ms` }}>{w}</span>)}</span>
                <span className="bl-pline"><span style={{ width: `${lineProgress * 100}%` }} /></span>
              </p>;
            })}
          </div>}
      <div className="bl-foot">
        <span className="bl-time">{timeNow} / {timeTotal}</span>
        <div className="bl-bar"><span style={{ width: `${ratio * 100}%` }} /></div>
      </div>
    </div>
  </div>;
}

const SPLASH_LINES = [t("sp.splash0"), t("sp.splash1"), t("sp.splash2"), t("sp.splash3"), t("sp.splash4"), t("sp.splash5")];

const MARKETPLACE_ITEMS: MarketItem[] = [
  { id: "hazy-astromations", name: "Hazy Astromations", by: "drea.mz", version: "1.2.0", desc: t("market.desc.hazy"), category: "themes", glyph: "theme", color: "linear-gradient(135deg,#7c3aed,#38bdf8 55%,#f0abfc)", art: "images/hazy-art.png" },
  { id: "starry-nights", name: "StarryNights", by: "spicetify-themes", version: "full", desc: t("market.desc.starry"), category: "themes", glyph: "theme", color: "linear-gradient(135deg,#101b2e,#4687d6 60%,#fff3c4)", art: "images/starry-night-preview.png" },
  { id: "beautiful-lyrics", name: "Beautiful Lyrics", by: "surfbryce", version: "4.2.0", desc: t("market.desc.beautiful"), category: "extensions", glyph: "extension", color: "linear-gradient(135deg,#a78bfa,#22d3ee 60%,#f472b6)", art: "images/vertex-logo.png" },
  { id: "sonic-dancing", name: "Sonic Dancing", by: "vertex.labs", version: "1.0.0", desc: t("market.desc.sonic"), category: "snippets", glyph: "snippet", color: "linear-gradient(135deg,#0284c7,#38bdf8)", art: "images/sonic-dancing.png" },
];

function BrandMark() {
  return <span className="brand-mark"><span className="brand-glyph"><span /></span><span>Vertex Systems</span></span>;
}

function AppIcon({ app, size = 21 }: { app: { icon: LucideIcon; iconImg?: string; iconUrl?: string }; size?: number }) {
  if (app.iconUrl) return <img className="app-icon-img" src={app.iconUrl} alt="" style={{ width: size, height: size }} />;
  if (app.iconImg) return <img className="app-icon-img" src={app.iconImg} alt="" style={{ width: size, height: size }} />;
  const Icon = app.icon;
  return <Icon size={size} strokeWidth={1.55} />;
}

function App() {
  const [phase, setPhase] = useState<"boot" | "lock" | "signin" | "desktop">("boot");
  const [booting, setBooting] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [mobileWarning, setMobileWarning] = useState(() => window.innerWidth < 760);
  const [now, setNow] = useState(() => new Date());
  const rmCfg = readRainmeterConfig();
  const [, setRmTick] = useState(0);
  useEffect(() => {
    const bump = () => setRmTick((value) => value + 1);
    window.addEventListener("rainmeter-config-updated", bump);
    return () => window.removeEventListener("rainmeter-config-updated", bump);
  }, []);
  const [chosenLang, setChosenLang] = useState<Lang>(() => readLang());
  const [languageOpen, setLanguageOpen] = useState(() => !storage.read("vertex-language-set", false));
  const homeVideoRef = useRef<HTMLVideoElement>(null);
  const lockVideoRef = useRef<HTMLVideoElement>(null);
  const [wallpaper, setWallpaper] = useState<WallpaperId>(() => storage.read("vertex-wallpaper-v2", "singularity"));
  const [lockWallpaper, setLockWallpaper] = useState<WallpaperId>(() => storage.read("vertex-lock-wallpaper-v2", "singularity"));
  const [iconSize, setIconSize] = useState<"small" | "medium" | "large">(() => storage.read("vertex-icon-size", "medium"));
  const [showDesktopIcons, setShowDesktopIcons] = useState(() => storage.read("vertex-show-icons", false));
  const [customCursor, setCustomCursor] = useState(() => storage.read("vertex-custom-cursor", false));
  const [pressFx, setPressFx] = useState(() => storage.read("vertex-press-fx", false));
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [translucentOpen, setTranslucentOpen] = useState(false);
  const [wpPickerOpen, setWpPickerOpen] = useState(false);
  const [customWallpapers, setCustomWallpapers] = useState<PickerWallpaper[]>(() => readCustomWallpapersLocal());
  const [customsLoaded, setCustomsLoaded] = useState(false);
  const [wppInstalled, setWppInstalled] = useState<boolean>(() => storage.read("vertex-wpp-installed", false));
  const [startOpen, setStartOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerQuery, setDrawerQuery] = useState("");
  const [startQuery, setStartQuery] = useState("");
  const [previewId, setPreviewId] = useState<AppId | null>(null);
  const [previewPos, setPreviewPos] = useState<{ left: number; top: number } | null>(null);
  const previewCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openTaskPreview = (event: ReactMouseEvent<HTMLButtonElement>, appId: AppId) => {
    if (previewCloseTimer.current) { clearTimeout(previewCloseTimer.current); previewCloseTimer.current = null; }
    const rect = event.currentTarget.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - 162, vw - 340));
    setPreviewPos({ left, top: Math.max(10, rect.top - 234) });
    setPreviewId(appId);
  };
  const keepTaskPreview = () => {
    if (previewCloseTimer.current) { clearTimeout(previewCloseTimer.current); previewCloseTimer.current = null; }
  };
  const pendingHideTaskPreview = () => {
    if (previewCloseTimer.current) { clearTimeout(previewCloseTimer.current); previewCloseTimer.current = null; }
    previewCloseTimer.current = setTimeout(() => {
      setPreviewId(null);
      setPreviewPos(null);
    }, 170);
  };
  const hideTaskPreview = () => {
    if (previewCloseTimer.current) { clearTimeout(previewCloseTimer.current); previewCloseTimer.current = null; }
    setPreviewId(null);
    setPreviewPos(null);
  };
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [desktopApps, setDesktopApps] = useState<AppId[]>(() => {
    const saved = storage.read<AppId[]>("vertex-desktop-apps", []);
    const valid = Array.isArray(saved) ? saved.filter((id) => apps.some((app) => app.id === id)) : [];
    return valid.length ? valid : apps.slice(0, 6).map((app) => app.id);
  });
  const [appOverrides, setAppOverrides] = useState<Record<string, AppOverride>>(() => storage.read("vertex-app-overrides", {}));
  const [appMenu, setAppMenu] = useState<{ appId: AppId; x: number; y: number } | null>(null);
  const [appMenuMode, setAppMenuMode] = useState<"default" | "icon">("default");
  const [appMenuPos, setAppMenuPos] = useState<{ x: number; y: number } | null>(null);
  const appMenuRef = useRef<HTMLDivElement>(null);
  const [widgetMenu, setWidgetMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [widgetMenuPos, setWidgetMenuPos] = useState<{ x: number; y: number } | null>(null);
  const widgetMenuRef = useRef<HTMLDivElement>(null);
  const [widgetHidden, setWidgetHidden] = useState<string[]>(() => storage.read<string[]>("vertex-widget-hidden", []));
  useEffect(() => { storage.write("vertex-widget-hidden", widgetHidden); }, [widgetHidden]);
  const toggleWidget = (id: string) => setWidgetHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const isWidgetHidden = (id: string) => widgetHidden.includes(id);

  useLayoutEffect(() => {
    if (!contextMenu) { setContextMenuPos(null); return; }
    const el = contextMenuRef.current;
    if (!el) return;
    setContextMenuPos(clampMenu(contextMenu, el.getBoundingClientRect()));
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!appMenu) { setAppMenuPos(null); return; }
    const el = appMenuRef.current;
    if (!el) return;
    setAppMenuPos(clampMenu(appMenu, el.getBoundingClientRect()));
  }, [appMenu, appMenuMode]);

  useLayoutEffect(() => {
    if (!widgetMenu) { setWidgetMenuPos(null); return; }
    const el = widgetMenuRef.current;
    if (!el) return;
    setWidgetMenuPos(clampMenu(widgetMenu, el.getBoundingClientRect()));
  }, [widgetMenu]);
  const [renameValue, setRenameValue] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [dragId, setDragId] = useState<AppId | null>(null);
  const [placedCells, setPlacedCells] = useState<Record<string, number>>(() => storage.read<Record<string, number>>("vertex-desktop-cells", {}));
  const desktopGridRef = useRef<HTMLDivElement>(null);
  const [translucentTB, setTranslucentTB] = useState<boolean>(() => storage.read("vertex-translucenttb", false) !== false);
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [activeWindow, setActiveWindow] = useState<AppId | null>(null);
  const [settings, setSettings] = useState<SystemSettings>(() => {
    const loaded = { ...defaultSettings, ...storage.read<Partial<SystemSettings>>("vertex-settings", {}) };
    if (loaded.cloak === "canvas") loaded.cloak = "none";
    return loaded;
  });

  useEffect(() => {
    const cloak = settings.cloak === "custom"
      ? { title: (settings.cloakName || CLOAKS.none.title), icon: (settings.cloakIcon || CLOAKS.none.icon) }
      : (CLOAKS[settings.cloak] ?? CLOAKS.none);
    document.title = cloak.title;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = cloak.icon || "/favicon.svg";
  }, [settings.cloak, settings.cloakName, settings.cloakIcon]);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [toasts, setToasts] = useState<{ id: number; title: string; copy: string }[]>([]);
  const [mediaHidden, setMediaHidden] = useState(false);
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<{ name: string; artist: string; artwork: string } | null>(null);
  const sysAudioRef = useRef<HTMLAudioElement>(null);
  const [sysProgress, setSysProgress] = useState(0);
  const [sysDuration, setSysDuration] = useState(0);
  const SYSTEM_AUDIO_ART = "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/7c/04/bf/7c04bfc6-be8c-661a-3306-b97fc2c4999b/859705593825.jpg/600x600bb.jpg";

  const activeWallpaper = wallpapers.find((item) => item.id === wallpaper) ?? customWallpapers.find((item) => item.id === wallpaper) ?? wallpapers[0];
  const activeLockWallpaper = wallpapers.find((item) => item.id === lockWallpaper) ?? customWallpapers.find((item) => item.id === lockWallpaper) ?? wallpapers[1];
  const pickerWallpapers = useMemo<PickerWallpaper[]>(() => [
    ...customWallpapers,
    ...wallpapers.map((w) => ({ id: w.id, name: w.name, image: w.image, video: w.video })),
    ...wallEngineEntries.map((e) => ({ id: e.id, name: e.name, image: e.image, video: e.video, videoLow: e.videoLow, category: e.category })),
  ], [customWallpapers]);

  useEffect(() => {
    let alive = true;
    loadCustomWallpapers().then((list) => { if (alive) { setCustomWallpapers(list); setCustomsLoaded(true); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!customsLoaded) return;
    if (wallpaper.startsWith("custom-") && !customWallpapers.some((c) => c.id === wallpaper)) {
      setWallpaper("singularity");
      storage.write("vertex-wallpaper-v2", "singularity");
    }
    if (lockWallpaper.startsWith("custom-") && !customWallpapers.some((c) => c.id === lockWallpaper)) {
      setLockWallpaper("singularity");
      storage.write("vertex-lock-wallpaper-v2", "singularity");
    }
  }, [customsLoaded, customWallpapers, wallpaper, lockWallpaper]);

  useEffect(() => {
    storage.write("vertex-wpp-installed", wppInstalled);
  }, [wppInstalled]);
  const filteredApps = useMemo(() => apps.filter((app) => getApp(app.id, appOverrides).title.toLowerCase().includes(drawerQuery.toLowerCase())), [drawerQuery, appOverrides, apps]);
  const pinnedApps = useMemo(() => apps.filter((app) => { const themed = getApp(app.id, appOverrides); return (appOverrides[app.id]?.pinned ?? app.pinned) && themed.title.toLowerCase().includes(startQuery.toLowerCase()); }), [startQuery, appOverrides, apps]);

  const desktopPlacements = useMemo(() => {
    const map: Record<string, number> = {};
    const taken = new Set<number>();
    desktopApps.forEach((appId) => {
      const cell = placedCells[appId];
      if (cell !== undefined) { map[appId] = cell; taken.add(cell); }
    });
    let autoIndex = 0;
    desktopApps.forEach((appId) => {
      if (map[appId] !== undefined) return;
      let free = -1;
      let cell = -1;
      while (free < autoIndex) { cell += 1; if (!taken.has(cell)) free += 1; }
      map[appId] = cell;
      taken.add(cell);
      autoIndex += 1;
    });
    return map;
  }, [desktopApps, placedCells]);

  useEffect(() => {
    storage.write("vertex-desktop-cells", placedCells);
  }, [placedCells]);

  useEffect(() => {
    storage.write("vertex-translucenttb", translucentTB);
  }, [translucentTB]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.lang = LANG;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === "boot" && event.key === "Enter") {
        if (booting) return;
        beginBoot();
      }
      if (event.key === "Escape") {
        setContextMenu(null);
        setStartOpen(false);
        setDrawerOpen(false);
        if (phase === "signin") { setPhase("lock"); setPinError(false); setPinInput(""); }
      }
      const target = event.target as HTMLElement | null;
      const isEditing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (phase === "desktop" && event.altKey && !event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "w") {
        event.preventDefault();
        if (wppInstalled) setWpPickerOpen((open) => !open);
        else toggleApp("terminal");
      }
      if (phase === "desktop" && !isEditing && settings.panicKey && event.key.toLowerCase() === settings.panicKey.toLowerCase()) {
        redirectPanic();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (phase !== "desktop" || !settings.idleLock) return;
    let timer = 0;
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(() => setPhase("lock"), 180000); };
    reset();
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    return () => { window.clearTimeout(timer); window.removeEventListener("mousemove", reset); window.removeEventListener("keydown", reset); };
  }, [phase, settings.idleLock]);

  function addToast(title: string, copy: string) {
    const id = Date.now();
    setToasts((items) => [...items, { id, title, copy }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }

  function chooseLanguage(next: Lang) {
    saveLang(next);
    setChosenLang(next);
    setLanguageOpen(false);
    location.reload();
  }

  function pickLanguage(next: Lang) {
    saveLang(next);
    setChosenLang(next);
  }

  useEffect(() => {
    const video = phase === "desktop" ? homeVideoRef.current : phase === "lock" ? lockVideoRef.current : null;
    if (!video) return;
    const play = () => void video.play().catch(() => undefined);
    play();
    video.addEventListener("canplay", play);
    return () => video.removeEventListener("canplay", play);
  }, [phase, wallpaper, lockWallpaper]);

  useEffect(() => {
    if (!pressFx) return;
    const handler = () => playClick();
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [pressFx]);

  function beginBoot() {
    if (phase !== "boot" || booting) return;
    if (settings.fastBoot) { setPhase("lock"); return; }
    setBooting(true);
    window.setTimeout(() => { setBooting(false); setPhase("lock"); }, 1350);
  }

  function openSignIn() {
    if (phase !== "lock") return;
    if (!storage.read<string>(PASSWORD_KEY, "")) {
      setPhase("desktop");
      addToast(t("toast.welcomeTitle"), t("toast.welcomeCopy"));
      return;
    }
    setPinInput("");
    setPinError(false);
    setPhase("signin");
  }

  function unlock() {
    if (phase !== "lock" && phase !== "signin") return;
    const saved = storage.read<string>(PASSWORD_KEY, "");
    if (!saved || pinInput === saved) {
      setPhase("desktop");
      setPinError(false);
      setPinInput("");
      addToast(t("toast.welcomeTitle"), t("toast.welcomeCopy"));
    } else {
      setPinError(true);
      setPinInput("");
    }
  }

  function resetPassword() {
    if (phase !== "signin") return;
    if (!window.confirm(t("lock.forgotConfirm"))) return;
    storage.remove(PASSWORD_KEY);
    setPinInput("");
    setPinError(false);
    setPhase("desktop");
    addToast(t("lock.forgotDoneTitle"), t("lock.forgotDoneCopy"));
  }

  function updateSetting(key: keyof SystemSettings, value: boolean | string) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    storage.write("vertex-settings", next);
  }

  function redirectPanic() {
    const raw = (settings.panicUrl ?? "").trim();
    if (!raw) {
      addToast(t("toast.panicMissingTitle"), t("toast.panicMissingCopy"));
      return;
    }
    try {
      const destination = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!["http:", "https:"].includes(destination.protocol)) throw new Error("Unsupported protocol");
      if (settings.confirm && !window.confirm(`Open ${destination.href}?`)) return;
      window.location.assign(destination.href);
    } catch {
      addToast(t("toast.panicInvalidTitle"), t("toast.panicInvalidCopy"));
    }
  }

  function applyWallEngine(id: WallpaperId, target: "both" | "home" | "lock") {
    if (target === "both" || target === "home") {
      setWallpaper(id);
      storage.write("vertex-wallpaper-v2", id);
    }
    if (target === "both" || target === "lock") {
      setLockWallpaper(id);
      storage.write("vertex-lock-wallpaper-v2", id);
    }
    addToast(t("toast.wallpaperTitle"), tf("toast.wallpaperCopy", { name: wallpapers.find((item) => item.id === id)?.name ?? customWallpapers.find((item) => item.id === id)?.name ?? "" }));
  }

  function toggleApp(id: AppId) {
    setStartOpen(false);
    setDrawerOpen(false);
    if (id === "translucenttb") {
      setWindows((items) => items.filter((item) => item.id !== id));
      setActiveWindow((active) => active === id ? null : active);
      setTranslucentOpen(true);
      return;
    }
    const existing = windows.find((item) => item.id === id);
    if (!existing) {
      setWindows((items) => [...items, { id, minimized: false, maximized: false, rect: defaultWindowRect(items.length), prevRect: null }]);
      setActiveWindow(id);
      return;
    }
    if (activeWindow === id && !existing.minimized) {
      setWindows((items) => items.map((item) => item.id === id ? { ...item, minimized: true } : item));
      setActiveWindow(null);
      return;
    }
    setWindows((items) => items.map((item) => item.id === id ? { ...item, minimized: false } : item));
    setActiveWindow(id);
  }

  function installWallpaperPicker() {
    if (wppInstalled) return;
    setWppInstalled(true);
  }

  function closeWindow(id: AppId) {
    setWindows((items) => items.filter((item) => item.id !== id));
    setActiveWindow((active) => active === id ? null : active);
  }

  function minimizeWindow(id: AppId) {
    setWindows((items) => items.map((item) => item.id === id ? { ...item, minimized: true } : item));
    setActiveWindow((active) => active === id ? null : active);
  }

  function toggleMaximize(id: AppId) {
    setWindows((items) => items.map((item) => {
      if (item.id !== id || id === "spicetify") return item;
      if (item.maximized) {
        return { ...item, maximized: false, rect: item.prevRect ?? item.rect };
      }
      return { ...item, maximized: true, prevRect: item.rect };
    }));
  }

  function moveWindow(id: AppId, clientX: number, clientY: number) {
    setWindows((items) => items.map((item) => {
      if (item.id !== id || item.maximized) return item;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const x = Math.max(-item.rect.w + 96, Math.min(Math.round(clientX), vw - 60));
      const y = Math.max(0, Math.min(Math.round(clientY), vh - 34));
      return { ...item, rect: { ...item.rect, x, y } };
    }));
  }

  function clampMenu(anchor: { x: number; y: number }, rect: DOMRect): { x: number; y: number } {
    const MARGIN = 10;
    let x = anchor.x;
    let y = anchor.y;
    if (y + rect.height > window.innerHeight - MARGIN) y = Math.max(MARGIN, window.innerHeight - MARGIN - rect.height);
    if (x + rect.width > window.innerWidth - MARGIN) x = Math.max(MARGIN, window.innerWidth - MARGIN - rect.width);
    return { x, y };
  }

  function saveOverride(appId: AppId, patch: Partial<AppOverride>) {
    const next = { ...appOverrides, [appId]: { ...(appOverrides[appId] ?? {}), ...patch } };
    setAppOverrides(next);
    storage.write("vertex-app-overrides", next);
  }

  function isPinned(id: AppId): boolean {
    const ov = appOverrides[id];
    if (ov?.pinned !== undefined) return ov.pinned;
    return apps.find((app) => app.id === id)?.pinned ?? false;
  }

  function openAppMenu(appId: AppId, x: number, y: number) {
    setContextMenu(null);
    setWidgetMenu(null);
    const ov = appOverrides[appId] ?? {};
    const base = apps.find((app) => app.id === appId);
    setRenameValue(ov.name ?? base?.title ?? "");
    setIconUrl(ov.iconUrl ?? "");
    setAppMenuMode("default");
    setAppMenu({ appId, x, y });
  }

  function removeFromDesktop(appId: AppId) {
    setAppMenu(null);
    const next = desktopApps.filter((id) => id !== appId);
    setDesktopApps(next);
    storage.write("vertex-desktop-apps", next);
    setPlacedCells((prev) => {
      const copy = { ...prev };
      delete copy[appId];
      return copy;
    });
  }

  function dropCell(clientX: number, clientY: number): number {
    const el = desktopGridRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const col = Math.max(0, Math.min(DROP_GRID_COLS - 1, Math.floor((clientX - rect.left) / DROP_CELL_W)));
    const row = Math.max(0, Math.floor((clientY - rect.top) / DROP_CELL_H));
    return row * DROP_GRID_COLS + col;
  }

  function placeAt(appId: AppId, cell: number) {
    setPlacedCells((prev) => {
      const map = { ...prev };
      const old = map[appId];
      if (old === cell) return prev;
      map[appId] = cell;
      const occupant = Object.keys(map).find((key) => key !== appId && map[key] === cell);
      if (occupant) {
        if (old !== undefined) map[occupant] = old;
        else delete map[occupant];
      }
      return map;
    });
  }

  function addToDesktop(appId: AppId) {
    if (desktopApps.includes(appId)) return;
    const next = [...desktopApps, appId];
    setDesktopApps(next);
    storage.write("vertex-desktop-apps", next);
  }

  function restart() {
    setStartOpen(false);
    setWindows([]);
    setActiveWindow(null);
    setPhase("boot");
    setBooting(false);
  }

  return (
    <main className={`os-root ${PERF.low ? "perf-low" : ""}`} onClick={() => { setContextMenu(null); setAppMenu(null); setWidgetMenu(null); }} onContextMenu={(event) => {
      event.preventDefault();
      if (phase === "desktop") { setAppMenu(null); setWidgetMenu(null); setContextMenu({ x: event.clientX, y: event.clientY }); }
    }}>
      <div className="wallpaper-layer">
        {activeWallpaper.image
          ? <img className="wallpaper-image" src={activeWallpaper.image} alt={`${activeWallpaper.name} wallpaper`} />
          : (phase === "boot" || phase === "desktop")
            ? <video key={activeWallpaper.id} ref={homeVideoRef} className="wallpaper-video" src={bgSrc(activeWallpaper.video, activeWallpaper.videoLow)} preload="metadata" autoPlay muted loop playsInline aria-label={`${activeWallpaper.name} wallpaper`} />
            : null}
      </div>

      <section className={`boot-screen ${phase !== "boot" ? "hidden" : ""}`} aria-label="Vertex boot sequence">
        <div className="boot-core">
          <BrandMark />
          <h1 className="boot-title">VERTEX-OS</h1>
           <p className="boot-sub">{t("boot.bootSub")}</p>
          <div className="boot-actions">
            <button className="primary-button" data-testid="button-enter-vertex" onClick={(event) => { event.stopPropagation(); beginBoot(); }}>
               {booting ? t("boot.initializing") : t("boot.enter")}
            </button>
             <span className="boot-hint">{booting ? t("boot.establishing") : t("boot.hint")}</span>
          </div>
          {booting && <div className="boot-progress"><span /></div>}
        </div>
      </section>

      <section className={`lock-screen ${phase === "lock" ? "active" : ""}`} onClick={openSignIn} aria-label="Vertex lock screen">
         {activeLockWallpaper.image
          ? <img className="lock-wallpaper" src={activeLockWallpaper.image} alt={`${activeLockWallpaper.name} lock wallpaper`} />
          : phase === "lock"
            ? <video key={activeLockWallpaper.id} ref={lockVideoRef} className="lock-wallpaper-video" src={bgSrc(activeLockWallpaper.video, activeLockWallpaper.videoLow)} preload="metadata" autoPlay muted loop playsInline aria-label={`${activeLockWallpaper.name} lock wallpaper`} />
            : null}
        {rmCfg.showClock && <RainmeterWidget cfg={rmCfg} date={now} tone="lock" wallpaper={activeLockWallpaper} />}
         <div className="lock-fps">60 FPS</div>
         <div className="lock-help">{t("lock.help")}</div>
      </section>

      <section className={`signin-screen ${phase === "signin" ? "active" : ""}`} aria-label="Vertex sign in" onClick={(event) => { if (event.target === event.currentTarget) setPhase("lock"); }}>
        {activeLockWallpaper.image
          ? <img className="signin-bg" src={activeLockWallpaper.image} alt="" />
          : phase === "signin"
            ? <video className="signin-bg" src={bgSrc(activeLockWallpaper.video, activeLockWallpaper.videoLow)} preload="metadata" autoPlay muted loop playsInline aria-hidden="true" />
            : null}
        <div className="signin-card">
           <div className="lock-avatar"><BrandMark /></div>
           <div className="lock-user">{t("set.passwordLabel")}</div>
          <form className="lock-pass-row" onSubmit={(event) => { event.preventDefault(); unlock(); }}>
            <input type="password" autoFocus value={pinInput} onChange={(event) => { setPinInput(event.target.value); setPinError(false); }} placeholder={t("lock.pass")} aria-label={t("lock.pass")} data-testid="input-vertex-password" />
            <button type="submit">{t("lock.signIn")}</button>
          </form>
           {pinError ? <span className="lock-error">{t("lock.tryAgain")}</span> : null}
           <button className="signin-back" onClick={resetPassword}>{t("lock.forgot")}</button>
           <button className="signin-back" onClick={() => { setPinError(false); setPinInput(""); setPhase("lock"); }}>{t("lock.back")}</button>
        </div>
      </section>

      <section className={`desktop-shell ${phase === "desktop" ? "active" : ""} ${iconSize === "large" ? "large-icons" : iconSize === "small" ? "icon-small" : ""} ${translucentTB ? "translucent-tb" : ""} ${customCursor ? "custom-cursor" : ""} ${pressFx ? "press-fx" : ""}`}>
        {rmCfg.showClock && <RainmeterWidget cfg={rmCfg} date={now} tone="home" wallpaper={activeWallpaper} />}

        <aside className="sidebar" aria-label="Quick access">
          {!isWidgetHidden("deck") ? <div>
             <div className="side-label">{t("side.jumpBack")}</div>
            <button className="side-card" onClick={() => toggleApp("games")} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu(null); setAppMenu(null); setWidgetMenu({ id: "deck", x: event.clientX, y: event.clientY }); }} data-testid="button-jump-back">
               <div className="side-art"><Gamepad2 size={22} /></div>
               <div className="side-info"><strong>{t("side.gameDeck")}</strong><span>{t("side.libraryReady")}</span></div><ChevronRight className="side-chevron" size={15} />
            </button>
          </div> : null}
          {!isWidgetHidden("media") ? <div>
             <div className="side-label">{t("side.quickPlay")}</div>
            <button className="side-card" onClick={() => { toggleApp("spicetify"); setMediaPlaying(true); }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu(null); setAppMenu(null); setWidgetMenu({ id: "media", x: event.clientX, y: event.clientY }); }} data-testid="button-quick-play">
               {currentTrack ? <><img className="side-art" src={currentTrack.artwork} alt="" /></> : <div className="side-art"><Play size={19} /></div>}
               <div className="side-info"><strong>{currentTrack ? currentTrack.name : (mediaPlaying ? t("side.playing") : t("side.notPlaying"))}</strong><span>{currentTrack ? currentTrack.artist : (mediaPlaying ? t("side.spicetifyPlaying") : t("side.systemAudio"))}</span></div><ChevronRight className="side-chevron" size={15} />
            </button>
          </div> : null}
          {!isWidgetHidden("updates") ? <div>
             <div className="side-label">{t("side.systemStatus")}</div>
            <button className="side-card" onClick={() => setUpdateOpen(true)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu(null); setAppMenu(null); setWidgetMenu({ id: "updates", x: event.clientX, y: event.clientY }); }} data-testid="button-update-log">
               <div className="side-art"><Radio size={20} /></div>
               <div className="side-info"><strong>{t("side.updateLog")}</strong><span>{t("side.latestPatches")}</span></div><ChevronRight className="side-chevron" size={15} />
            </button>
          </div> : null}
        </aside>

        <div className={`desktop-grid ${showDesktopIcons ? "" : "hidden"}`} ref={desktopGridRef} aria-label="Desktop applications" onDragOver={(event) => {
          event.preventDefault();
          if (dragId && desktopApps.includes(dragId)) placeAt(dragId, dropCell(event.clientX, event.clientY));
        }} onDrop={(event) => {
          const id = event.dataTransfer.getData("text/plain");
          if (id && apps.some((app) => app.id === id)) addToDesktop(id as AppId);
          setDragId(null);
        }}>
          {desktopApps.map((appId) => {
            const app = getApp(appId, appOverrides);
            const cell = desktopPlacements[appId] ?? 0;
            const col = (cell % DROP_GRID_COLS) + 1;
            const row = Math.floor(cell / DROP_GRID_COLS) + 1;
            return <button key={appId} className={`desktop-icon ${dragId === appId ? "dragging" : ""}`} draggable onClick={() => toggleApp(appId)} style={{ gridColumnStart: col, gridRowStart: row }}
              onDragStart={(event) => { setDragId(appId); event.dataTransfer.setData("text/plain", appId); event.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (dragId && dragId !== appId) placeAt(dragId, dropCell(event.clientX, event.clientY)); }}
              onDragEnd={() => setDragId(null)}
              onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openAppMenu(appId, event.clientX, event.clientY); }}
              data-testid={`button-desktop-${appId}`}>
              <span className="icon-tile"><AppIcon app={app} size={22} /></span>
              {app.showName && <span>{app.title}</span>}
            </button>;
          })}
        </div>

        <WindowLayer windows={windows} activeWindow={activeWindow} onFocus={setActiveWindow} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={toggleMaximize} onMove={moveWindow} settings={settings} updateSetting={updateSetting} faqOpen={faqOpen} setFaqOpen={setFaqOpen} lang={chosenLang} onLanguagePick={pickLanguage} onPanic={redirectPanic} onTrackChange={setCurrentTrack} translucent={translucentTB} onTranslucent={setTranslucentTB} onApplyWallpaper={applyWallEngine} appliedWallpaper={wallpaper} appliedLockWallpaper={lockWallpaper} onNotify={addToast} wppInstalled={wppInstalled} onInstallPicker={() => { installWallpaperPicker(); setStartOpen(false); setDrawerOpen(false); addToast("Quick Wallpaper Picker", "Installed — press Alt+W to open it."); }} />

        <div className="fps">VERTEX // 60 FPS</div>
        <nav className="dock" aria-label="System taskbar">
          <button className="dock-button" onClick={(event) => { event.stopPropagation(); setStartOpen((open) => !open); setDrawerOpen(false); }} aria-label="Open start menu" data-testid="button-start-menu"><img className="dock-start-icon" src={asset("images/windows11.png")} alt="" /></button>
          <span className="dock-separator" />
          <button className="dock-button" onClick={(event) => { event.stopPropagation(); setDrawerOpen((open) => !open); setStartOpen(false); }} aria-label="Open app drawer" data-testid="button-app-drawer"><Grid2X2 size={20} /></button>
          <span className="dock-separator" />
          {apps.filter((app) => isPinned(app.id)).map((app) => {
            const themed = getApp(app.id, appOverrides);
            const isOpen = windows.some((item) => item.id === app.id);
            return <button key={app.id} className={`dock-button ${isOpen ? "active open" : ""}`} onClick={(event) => { event.stopPropagation(); toggleApp(app.id); }} onMouseEnter={(event) => { if (isOpen) openTaskPreview(event, app.id); }} onMouseLeave={isOpen ? pendingHideTaskPreview : undefined} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openAppMenu(app.id, event.clientX, event.clientY); }} title={themed.title} data-testid={`button-dock-${app.id}`}><AppIcon app={themed} size={20} /></button>;
          })}
          {windows.filter((w) => !isPinned(w.id)).map((w) => {
            const themed = getApp(w.id, appOverrides);
            return <button key={w.id} className="dock-button active open" onClick={(event) => { event.stopPropagation(); toggleApp(w.id); }} onMouseEnter={(event) => openTaskPreview(event, w.id)} onMouseLeave={pendingHideTaskPreview} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openAppMenu(w.id, event.clientX, event.clientY); }} title={themed.title} data-testid={`button-dock-${w.id}`}><AppIcon app={themed} size={20} /></button>;
          })}
          <span className="dock-separator" />
        </nav>

        {previewId && previewPos && windows.some((item) => item.id === previewId) && (() => {
          const win = windows.find((item) => item.id === previewId)!;
          const themed = getApp(win.id, appOverrides);
          const rw = Math.max(460, win.rect.w);
          const rh = Math.max(340, win.rect.h);
          const scale = Math.min(300 / rw, 172 / rh, 0.85);
          const displayW = Math.max(200, Math.round(rw * scale));
          const displayH = Math.max(120, Math.round(rh * scale));
          const fallback = (
            <div className="task-preview-fallback">
              <AppIcon app={themed} size={26} />
              <span>{themed.title}</span>
              <small>preview crashed</small>
            </div>
          );
          return (
            <div className="task-preview" style={{ left: previewPos.left, top: previewPos.top }} onMouseEnter={keepTaskPreview} onMouseLeave={hideTaskPreview} onClick={() => { if (win.minimized) toggleApp(win.id); setActiveWindow(win.id); }}>
              <div className="task-preview-head">
                <AppIcon app={themed} size={14} />
                <span>{themed.title}</span>
                <i className="task-preview-live" aria-hidden="true" />
              </div>
              <div className="task-preview-stage" style={{ width: displayW, height: displayH }}>
                <PreviewBoundary fallback={fallback}>
                  <div className="task-preview-window" style={{ width: rw, height: rh, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                    <header className="window-bar"><span className="window-title"><span className="window-app-icon"><AppIcon app={themed} size={13} /></span><span className="window-title-text">{themed.title}</span></span></header>
                    <div className="window-body">
                      {renderWindowBody(win.id, settings, updateSetting, faqOpen, setFaqOpen, chosenLang, pickLanguage, redirectPanic, null, null, setCurrentTrack, translucentTB, setTranslucentTB, applyWallEngine, wallpaper, lockWallpaper, addToast, wppInstalled, () => { installWallpaperPicker(); setStartOpen(false); setDrawerOpen(false); addToast("Quick Wallpaper Picker", "Installed — press Alt+W to open it."); })}
                    </div>
                  </div>
                </PreviewBoundary>
              </div>
            </div>
          );
        })()}

        <div className={`overlay-panel start-panel ${startOpen ? "open" : ""}`} onClick={(event) => event.stopPropagation()} aria-label="Start menu">
           <div className="search-field"><Menu size={16} /><input value={startQuery} onChange={(event) => setStartQuery(event.target.value)} placeholder={t("start.search")} aria-label={t("start.searchAria")} data-testid="input-start-search" /></div>
           <div className="panel-heading"><h3>{t("start.pinned")}</h3><span>{t("start.administrator")}</span></div>
          <div className="pinned-grid">
            {pinnedApps.map((app) => { const themed = getApp(app.id, appOverrides); return <button key={app.id} className="pinned-item" onClick={() => toggleApp(app.id)} data-testid={`button-pinned-${app.id}`}><AppIcon app={themed} size={22} /><span>{themed.title}</span></button>; })}
          </div>
          <div className="panel-footer"><div className="user-chip"><span className="avatar">VX</span><span>{t("start.adminLocal")}</span></div><button className="power-button" onClick={restart} aria-label={t("start.restartAria")} data-testid="button-restart"><Power size={17} /></button></div>
        </div>

        <div className={`drawer ${drawerOpen ? "open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }} aria-label="All applications">
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close app drawer" data-testid="button-close-drawer"><X size={22} /></button>
           <div className="search-field drawer-search"><Grid2X2 size={16} /><input value={drawerQuery} onChange={(event) => setDrawerQuery(event.target.value)} placeholder={t("start.searchApps")} aria-label={t("start.drawerAria")} data-testid="input-drawer-search" /></div>
          <div className="drawer-grid">{filteredApps.map((app) => {
            const themed = getApp(app.id, appOverrides);
            return <button key={app.id} className="drawer-item" draggable onClick={() => toggleApp(app.id)} onDragStart={(event) => { event.dataTransfer.setData("text/plain", app.id); event.dataTransfer.effectAllowed = "move"; }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openAppMenu(app.id, event.clientX, event.clientY); }} data-testid={`button-drawer-${app.id}`}><span className="icon-tile"><AppIcon app={themed} size={25} /></span><span>{themed.title}</span></button>;
          })}</div>
        </div>

        {wpPickerOpen && (
          <WallpaperPicker
            entries={pickerWallpapers}
            appliedId={wallpaper}
            onApply={(id) => applyWallEngine(id as WallpaperId, "home")}
            onClose={() => setWpPickerOpen(false)}
            onCustomAdd={(wp) => {
              setCustomWallpapers((list) => [...list, wp]);
              void persistCustomWallpaper(wp);
            }}
            onCustomRemove={(id) => {
              setCustomWallpapers((list) => {
                const dead = list.find((c) => c.id === id);
                if (dead?.video) URL.revokeObjectURL(dead.video);
                if (dead?.image) URL.revokeObjectURL(dead.image);
                return list.filter((c) => c.id !== id);
              });
              void removeCustomWallpaper(id);
            }}
          />
        )}

        <InfoModal open={updateOpen} title={t("update.title")} onClose={() => setUpdateOpen(false)}>
          <ul className="update-list">
            <li>{t("update.i1")}</li>
            <li>{t("update.i2")}</li>
            <li>{t("update.i3")}</li>
            <li>{t("update.i4")}</li>
            <li>{t("update.i5")}</li>
          </ul>
          <button className="primary-button" onClick={() => setUpdateOpen(false)}>{t("update.dismiss")}</button>
        </InfoModal>

        {personalizeOpen && <div className="wallpaper-modal open" onClick={(event) => { if (event.target === event.currentTarget) setPersonalizeOpen(false); }} data-testid="personalize-modal">
          <div className="modal-card personalize-card">
            <header className="modal-header"><h2>{t("pers.title")}</h2><button className="icon-close" onClick={() => setPersonalizeOpen(false)} aria-label={t("wm.close")} data-testid="button-close-personalize"><X size={19} /></button></header>
            <SettingToggle label={t("pers.cursor")} help={t("pers.cursorHelp")} value={customCursor} onChange={(value) => { setCustomCursor(value); storage.write("vertex-custom-cursor", value); }} />
            <SettingToggle label={t("pers.press")} help={t("pers.pressHelp")} value={pressFx} onChange={(value) => { setPressFx(value); storage.write("vertex-press-fx", value); }} />
          </div>
        </div>}

        {translucentOpen && <div className="wallpaper-modal open" onClick={(event) => { if (event.target === event.currentTarget) setTranslucentOpen(false); }} data-testid="translucent-modal">
          <div className="modal-card">
            <header className="modal-header"><span className="surface-kicker">{t("surf.translucent.kicker")}</span><button className="icon-close" onClick={() => setTranslucentOpen(false)} aria-label={t("wm.close")} data-testid="button-close-translucent"><X size={19} /></button></header>
            <h2 className="surface-title">{t("surf.translucent.title")}</h2>
            <p className="surface-copy">{t("surf.translucent.body")}</p>
            <SettingToggle label={t("surf.translucent.enable")} help={t("surf.translucent.help")} value={translucentTB} onChange={(value) => { setTranslucentTB(value); storage.write("vertex-translucenttb", value); }} />
          </div>
        </div>}

        <div className={`context-menu ${contextMenu ? "" : "hidden"}`} ref={contextMenuRef} style={contextMenu ? { left: (contextMenuPos ?? contextMenu).x, top: (contextMenuPos ?? contextMenu).y } : { display: "none" }} onClick={(event) => event.stopPropagation()}>
          <span className="context-menu-hover">
            <button className="context-menu-parent"><Eye size={15} /> {t("ctx.view")} <ChevronRight className="context-menu-caret" size={12} /></button>
            <div className="context-submenu">
              <button onClick={() => { setIconSize("large"); storage.write("vertex-icon-size", "large"); setContextMenu(null); }}><span className="context-menu-checkmark">{iconSize === "large" ? <Check size={12} /> : null}</span> {t("ctx.iconLarge")}</button>
              <button onClick={() => { setIconSize("medium"); storage.write("vertex-icon-size", "medium"); setContextMenu(null); }}><span className="context-menu-checkmark">{iconSize === "medium" ? <Check size={12} /> : null}</span> {t("ctx.iconMedium")}</button>
              <button onClick={() => { setIconSize("small"); storage.write("vertex-icon-size", "small"); setContextMenu(null); }}><span className="context-menu-checkmark">{iconSize === "small" ? <Check size={12} /> : null}</span> {t("ctx.iconSmall")}</button>
            </div>
          </span>
          <span className="context-menu-hover">
            <button className="context-menu-parent"><LayoutGrid size={15} /> {t("ctx.widgets")} <ChevronRight className="context-menu-caret" size={12} /></button>
            <div className="context-submenu">
              <button onClick={() => { toggleWidget("deck"); setContextMenu(null); }}><span className="context-menu-checkmark">{isWidgetHidden("deck") ? null : <Check size={12} />}</span> {t("side.jumpBack")}</button>
              <button onClick={() => { toggleWidget("media"); setContextMenu(null); }}><span className="context-menu-checkmark">{isWidgetHidden("media") ? null : <Check size={12} />}</span> {t("side.quickPlay")}</button>
              <button onClick={() => { toggleWidget("updates"); setContextMenu(null); }}><span className="context-menu-checkmark">{isWidgetHidden("updates") ? null : <Check size={12} />}</span> {t("side.systemStatus")}</button>
              <button onClick={() => { setWidgetHidden([]); setContextMenu(null); }}>{t("ctx.showAllWidgets")}</button>
            </div>
          </span>
          <button onClick={() => { setShowDesktopIcons((visible) => { storage.write("vertex-show-icons", !visible); return !visible; }); }}><span className="context-menu-checkmark">{showDesktopIcons ? <Check size={12} /> : null}</span> {t("ctx.showIcons")}</button>
          <button onClick={() => { setContextMenu(null); toggleApp("wallpaper-engine"); }}><Image size={15} /> {t("ctx.openWallEngine")}</button>
          <button onClick={() => { setContextMenu(null); setPersonalizeOpen(true); }}><Palette size={15} /> {t("ctx.personalize")}</button>
          <button onClick={() => { setContextMenu(null); addToast(t("ctx.refreshTitle"), t("ctx.refreshCopy")); }}><RotateCcw size={15} /> {t("ctx.refreshSystem")}</button>
        </div>

        {appMenu && <div className="app-context-menu" ref={appMenuRef} style={{ left: (appMenuPos ?? appMenu).x, top: (appMenuPos ?? appMenu).y }} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
          <input className="app-menu-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveOverride(appMenu.appId, { name: renameValue.trim() || undefined }); if (event.key === "Escape") setAppMenu(null); }} placeholder={t("appMenu.rename")} aria-label={t("appMenu.rename")} autoFocus />
          {appMenuMode === "icon" ? <>
            <input className="app-menu-input" value={iconUrl} onChange={(event) => setIconUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveOverride(appMenu.appId, { iconUrl: iconUrl.trim() || undefined }); }} placeholder={t("appMenu.iconHint")} aria-label={t("appMenu.iconHint")} />
            <button className="app-menu-item" onClick={() => saveOverride(appMenu.appId, { iconUrl: iconUrl.trim() || undefined })}><Image size={14} /> {t("appMenu.applyIcon")}</button>
            <button className="app-menu-item" onClick={() => { saveOverride(appMenu.appId, { iconUrl: undefined }); setIconUrl(""); }}>{t("appMenu.resetIcon")}</button>
            <button className="app-menu-item" onClick={() => setAppMenuMode("default")}>{t("appMenu.back")}</button>
          </> : <>
            <button className="app-menu-item" onClick={() => saveOverride(appMenu.appId, { name: renameValue.trim() || undefined })}><Terminal size={14} /> {t("appMenu.saveName")}</button>
            <button className="app-menu-item" onClick={() => saveOverride(appMenu.appId, { showName: !(appOverrides[appMenu.appId]?.showName ?? false) })}>{t("appMenu.toggleName")}</button>
            <button className="app-menu-item" onClick={() => setAppMenuMode("icon")}><Image size={14} /> {t("appMenu.changeIcon")}</button>
            {isPinned(appMenu.appId)
              ? <button className="app-menu-item" onClick={() => saveOverride(appMenu.appId, { pinned: false })}><PinOff size={14} /> {t("appMenu.unpinTaskbar")}</button>
              : <button className="app-menu-item" onClick={() => saveOverride(appMenu.appId, { pinned: true })}><Pin size={14} /> {t("appMenu.pinTaskbar")}</button>}
            <button className="app-menu-item danger" onClick={() => removeFromDesktop(appMenu.appId)}><X size={14} /> {t("appMenu.removeDesktop")}</button>
          </>}
        </div>}

        {widgetMenu && <div className="app-context-menu" ref={widgetMenuRef} style={{ left: (widgetMenuPos ?? widgetMenu).x, top: (widgetMenuPos ?? widgetMenu).y }} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
          <button className="app-menu-item" onClick={() => { toggleWidget(widgetMenu.id); setWidgetMenu(null); }}><EyeOff size={14} /> {t("ctx.hideWidget")}</button>
          <button className="app-menu-item" onClick={() => { setWidgetHidden([]); setWidgetMenu(null); }}><RotateCcw size={14} /> {t("ctx.showAllWidgets")}</button>
        </div>}

        <div className={`media-player ${mediaHidden ? "hidden" : ""}`}>
          <div className="media-top"><span className="media-label">{t("media.nowPlaying")}</span><div className="media-actions"><button onClick={() => setMediaHidden(true)} aria-label={t("media.minPlayer")}><Minus size={13} /></button><button onClick={() => { setMediaHidden(true); if (sysAudioRef.current) sysAudioRef.current.pause(); setMediaPlaying(false); }} aria-label={t("media.closePlayer")}><X size={13} /></button></div></div>
          <div className="media-main">{currentTrack ? <img className="album-art" src={currentTrack.artwork} alt="" /> : <><img className="album-art" src={SYSTEM_AUDIO_ART} alt="" /><div className="track"><strong>C418 - Dry Hands</strong><span>{mediaPlaying ? t("media.live") : t("media.ready")}</span></div></>}</div>
          <div className="progress" onClick={(event) => { if (sysDuration) { const rect = event.currentTarget.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)); if (sysAudioRef.current) sysAudioRef.current.currentTime = ratio * sysDuration; setSysProgress(ratio * sysDuration); } }}><span style={{ width: `${(sysDuration ? (sysProgress / sysDuration) * 100 : 0).toFixed(2)}%` }} /></div>
          <div className="media-controls"><button disabled aria-label={t("media.prevTrack")}><ArrowLeft size={16} /></button><button onClick={() => { if (currentTrack) { setMediaPlaying((playing) => !playing); } else { const a = sysAudioRef.current; if (a) { if (a.paused) void a.play(); else a.pause(); } } }} aria-label={t("media.playPause")}><Play size={17} fill={mediaPlaying ? "currentColor" : "none"} /></button><button disabled aria-label={t("media.nextTrack")}><ArrowRight size={16} /></button></div>
          <audio ref={sysAudioRef} src={asset("system-audio/dry-hands.mp3")} loop preload="auto" onPlaying={() => setMediaPlaying(true)} onPause={() => setMediaPlaying(false)} onTimeUpdate={(event) => setSysProgress(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setSysDuration(event.currentTarget.duration || 0)} />
        </div>
        <button className={`restore-media ${mediaHidden ? "visible" : ""}`} onClick={() => setMediaHidden(false)} aria-label="Restore media player" data-testid="button-restore-player"><Volume2 size={18} /></button>
      </section>

       {languageOpen && <div className="language-gate" role="dialog" aria-modal="true" aria-labelledby="language-title" onClick={(event) => event.stopPropagation()}>
         <div className="language-card">
           <BrandMark />
           <div className="language-kicker">{t("gate.kicker")}</div>
           <h2 id="language-title">{t("gate.title")}</h2>
           <p>{t("gate.subtitle")}</p>
           <div className="language-options">
             {LANGS.map((option) => <button key={option.code} className="language-option" onClick={() => chooseLanguage(option.code)} data-testid={`button-language-${option.code}`}>
               <span>{option.native}</span><small>{option.label}</small><ChevronRight size={16} />
             </button>)}
           </div>
         </div>
       </div>}

      {mobileWarning && <div className="mobile-warning" onDoubleClick={() => setMobileWarning(false)}><div className="mobile-warning-card"><div className="mobile-warning-kicker">{t("mobile.kicker")}</div><h2>{t("mobile.title")}</h2><p>{t("mobile.copy")}</p><button className="primary-button" onClick={() => setMobileWarning(false)} data-testid="button-continue-mobile">{t("mobile.continue")}</button></div></div>}
      <div className="toast-stack">{toasts.map((toast) => <button className="toast" key={toast.id} onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><strong>{toast.title}</strong><span>{toast.copy}</span></button>)}</div>
    </main>
  );
}

function WindowLayer({ windows, activeWindow, onFocus, onClose, onMinimize, onMaximize, onMove, settings, updateSetting, faqOpen, setFaqOpen, lang, onLanguagePick, onPanic, onTrackChange, translucent, onTranslucent, onApplyWallpaper, appliedWallpaper, appliedLockWallpaper, onNotify, wppInstalled, onInstallPicker }: {
  windows: WindowState[];
  activeWindow: AppId | null;
  onFocus: (id: AppId) => void;
  onClose: (id: AppId) => void;
  onMinimize: (id: AppId) => void;
  onMaximize: (id: AppId) => void;
  onMove: (id: AppId, x: number, y: number) => void;
  settings: SystemSettings;
  updateSetting: (key: keyof SystemSettings, value: boolean | string) => void;
  faqOpen: number | null;
  setFaqOpen: (value: number | null) => void;
  lang: Lang;
  onLanguagePick: (language: Lang) => void;
  onPanic: () => void;
  onTrackChange: (track: { name: string; artist: string; artwork: string } | null) => void;
  translucent: boolean;
  onTranslucent: (value: boolean) => void;
  onApplyWallpaper: (id: WallpaperId, target: "both" | "home" | "lock") => void;
  appliedWallpaper: WallpaperId;
  appliedLockWallpaper: WallpaperId;
  onNotify: (title: string, copy: string) => void;
  wppInstalled: boolean;
  onInstallPicker: () => void;
}) {
  const dragRef = useRef<{ id: AppId; dx: number; dy: number } | null>(null);

  const startDrag = (event: ReactPointerEvent<HTMLElement>, win: WindowState) => {
    if (win.maximized || win.id === "spicetify") return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    onFocus(win.id);
    event.preventDefault();
    dragRef.current = { id: win.id, dx: event.clientX - win.rect.x, dy: event.clientY - win.rect.y };
  };

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      onMove(drag.id, event.clientX - drag.dx, event.clientY - drag.dy);
    };
    const handleUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [onMove]);

  return <div className="window-layer">{windows.map((win) => {
    const app = apps.find((item) => item.id === win.id) ?? apps[0];
    const classNames = [
      "app-window",
      activeWindow === win.id ? "active" : "",
      win.minimized ? "minimized" : "",
      win.id === "spicetify" ? "cinefy-fullscreen" : "",
      win.maximized && win.id !== "spicetify" ? "maximized" : "",
    ].filter(Boolean).join(" ");
    const rectStyle = win.id === "spicetify" || win.maximized ? {} : { left: win.rect.x, top: win.rect.y, width: win.rect.w, height: win.rect.h };
    return <article key={win.id} className={classNames} onMouseDown={() => onFocus(win.id)} style={{ ...rectStyle, zIndex: activeWindow === win.id ? 40 : 30 }}>
      <header className="window-bar" onPointerDown={(event) => startDrag(event, win)} onDoubleClick={() => onMaximize(win.id)}>
        <span className="window-title"><span className="window-app-icon"><AppIcon app={app} size={15} /></span><span className="window-title-text">{app.title}</span></span>
        <div className="window-controls">
          <button className="window-control" onClick={() => onMinimize(win.id)} aria-label={tf("win.min", { title: app.title })}><Minus size={13} /></button>
          <button className="window-control" onClick={() => onMaximize(win.id)} aria-label={win.maximized ? "Restore window" : "Maximize window"} title={win.maximized ? "Restore down" : "Maximize"}>{win.maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
          <button className="window-control close" onClick={() => onClose(win.id)} aria-label={tf("win.close", { title: app.title })}><X size={13} /></button>
        </div>
      </header>
      <div className="window-body">{renderWindowBody(win.id, settings, updateSetting, faqOpen, setFaqOpen, lang, onLanguagePick, onPanic, () => onClose(win.id), () => onMinimize(win.id), onTrackChange, translucent, onTranslucent, onApplyWallpaper, appliedWallpaper, appliedLockWallpaper, onNotify, wppInstalled, onInstallPicker)}</div>
    </article>;
  })}</div>;
}

const WP_REPO_DIR = "Quick-Wallpaper-Picker";

const WP_INSTALL_STEPS: ReactNode[] = [
  <span className="term-out">Checking system requirements... <span className="term-success">OK</span></span>,
  <span className="term-out">Downloading Quick Wallpaper Picker v2.0...</span>,
  <span className="term-out">[##########----------] 49%</span>,
  <span className="term-out">Extracting files from quick-wallpaper-picker.tar.gz...</span>,
  <span className="term-out">Installing core components...</span>,
  <span className="term-out">Writing assets to ~/.vertex-os/wallpapers/quick-picker/</span>,
  <span className="term-out">Registering storage subsystem (IndexedDB)...</span>,
  <span className="term-out">Registering hotkey <span className="term-cmd">Alt+W</span>...</span>,
  <span className="term-out">Verifying integrity... <span className="term-success">OK</span></span>,
];

function resolveTerminalPalette(config: TerminalConfig): TerminalPalette {
  if (config.palette === CUSTOM_PALETTE_ID) {
    return { id: CUSTOM_PALETTE_ID, name: "Custom", from: config.colorFrom, to: config.colorTo };
  }
  return getPalette(config.palette) ?? TERMINAL_PALETTES[0];
}

function resolveBannerArt(config: TerminalConfig): string {
  if (config.banner === CUSTOM_BANNER_ID) {
    return config.customArt.trim() ? config.customArt : TERMINAL_BANNERS[0].art;
  }
  return getBanner(config.banner)?.art ?? TERMINAL_BANNERS[0].art;
}

function applyThemeTokens(current: TerminalConfig, tokens: string[]): { next: TerminalConfig; applied: string[]; errors: string[] } {
  const next: TerminalConfig = { ...current };
  const applied: string[] = [];
  const errors: string[] = [];
  const setColor = (label: string, rawValue: string, token: string, apply: (hex: string) => void) => {
    const hex = normalizeHex(rawValue, "");
    if (hex) { apply(hex); applied.push(`${label}=${hex}`); } else errors.push(token);
  };
  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq < 0) { errors.push(token); continue; }
    const key = token.slice(0, eq).trim().toLowerCase().replace(/[-_]/g, "");
    const raw = token.slice(eq + 1).trim();
    switch (key) {
      case "bg": case "background": setColor("bg", raw, token, (hex) => { next.bg = hex; }); break;
      case "text": case "fg": setColor("text", raw, token, (hex) => { next.text = hex; }); break;
      case "accent": setColor("accent", raw, token, (hex) => { next.accent = hex; }); break;
      case "prompt": setColor("prompt", raw, token, (hex) => { next.prompt = hex; }); break;
      case "colorfrom": setColor("colorFrom", raw, token, (hex) => { next.colorFrom = hex; }); break;
      case "colorto": setColor("colorTo", raw, token, (hex) => { next.colorTo = hex; }); break;
      case "font": {
        const font = TERMINAL_FONTS.find((entry) => entry.id === raw);
        if (font) { next.font = font.id; applied.push(`font=${font.id}`); } else errors.push(token);
        break;
      }
      case "fontsize": case "size": {
        const size = Number(raw);
        if (Number.isFinite(size)) { next.fontSize = Math.min(22, Math.max(10, Math.round(size))); applied.push(`fontSize=${next.fontSize}`); } else errors.push(token);
        break;
      }
      case "cursor": {
        if (raw === "block" || raw === "bar" || raw === "underline") { next.cursor = raw; applied.push(`cursor=${raw}`); } else errors.push(token);
        break;
      }
      case "opacity": case "transparency": {
        const value = Number(raw);
        if (Number.isFinite(value)) { next.opacity = Math.min(100, Math.max(35, Math.round(value))); applied.push(`opacity=${next.opacity}`); } else errors.push(token);
        break;
      }
      case "wallpaper": {
        next.wallpaper = /^(none|off|clear|empty)$/i.test(raw) ? "" : raw;
        applied.push(`wallpaper=${next.wallpaper || "none"}`);
        break;
      }
      case "scanlines": {
        next.scanlines = !/^(false|off|0|no)$/i.test(raw);
        applied.push(`scanlines=${next.scanlines}`);
        break;
      }
      case "glow": {
        next.glow = !/^(false|off|0|no)$/i.test(raw);
        applied.push(`glow=${next.glow}`);
        break;
      }
      case "banner": {
        if (/^(off|false|0|no|hide)$/i.test(raw)) { next.bannerEnabled = false; applied.push("banner=off"); }
        else if (/^(on|true|1|yes|show)$/i.test(raw)) { next.bannerEnabled = true; applied.push("banner=on"); }
        else if (raw === CUSTOM_BANNER_ID || getBanner(raw)) { next.banner = raw; next.bannerEnabled = true; applied.push(`banner=${raw}`); }
        else errors.push(token);
        break;
      }
      case "palette": {
        if (raw === CUSTOM_PALETTE_ID || getPalette(raw)) { next.palette = raw; applied.push(`palette=${raw}`); } else errors.push(token);
        break;
      }
      default: errors.push(token);
    }
  }
  return { next, applied, errors };
}

function TerminalColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <div className="term-set-color">
      <span className="term-set-label">{label}</span>
      <span className="term-set-color-inputs">
        <input type="color" value={normalizeHex(value, "#8de6ff")} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} />
        <input
          key={value}
          className="term-set-input term-set-hex"
          defaultValue={value}
          spellCheck={false}
          aria-label={`${label} hex value`}
          onBlur={(e) => onChange(normalizeHex(e.target.value, value))}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </span>
    </div>
  );
}

type TerminalSettingsTab = "banner" | "colors" | "appearance" | "typography";

const TERMINAL_SETTINGS_TABS: { id: TerminalSettingsTab; label: string }[] = [
  { id: "banner", label: "Banner" },
  { id: "colors", label: "Colors" },
  { id: "appearance", label: "Appearance" },
  { id: "typography", label: "Typography" },
];

class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const TERMINAL_PRESET_THEMES: { name: string; swatches: string[]; patch: Partial<TerminalConfig> }[] = [
  { name: "Vertex Dark", swatches: ["#050b14", "#c9d7ea", "#37c6ed"], patch: { bg: "#050b14", text: "#c9d7ea", accent: "#37c6ed", prompt: "#37c6ed" } },
  { name: "Amber", swatches: ["#140a02", "#ffbf8a", "#ff9e3d"], patch: { bg: "#140a02", text: "#ffbf8a", accent: "#ff9e3d", prompt: "#ffb454" } },
  { name: "Matrix", swatches: ["#020d05", "#7dffb2", "#22e584"], patch: { bg: "#020d05", text: "#7dffb2", accent: "#22e584", prompt: "#22e584" } },
  { name: "Synthwave", swatches: ["#13062a", "#e8e0ff", "#ff5ec2"], patch: { bg: "#13062a", text: "#e8e0ff", accent: "#ff5ec2", prompt: "#b388ff" } },
  { name: "Blueprint", swatches: ["#04121f", "#b6d7f5", "#4aa8ff"], patch: { bg: "#04121f", text: "#b6d7f5", accent: "#4aa8ff", prompt: "#9ad0ff" } },
  { name: "Paper Light", swatches: ["#e8e4d8", "#2a2a2e", "#b3552c"], patch: { bg: "#e8e4d8", text: "#2a2a2e", accent: "#b3552c", prompt: "#8a4b23" } },
  { name: "Cyber Acid", swatches: ["#0b0f06", "#f2ffd6", "#b6ff2e"], patch: { bg: "#0b0f06", text: "#f2ffd6", accent: "#b6ff2e", prompt: "#d4ff5c" } },
  { name: "Vapor Noir", swatches: ["#090814", "#dfdcff", "#c3a4ff"], patch: { bg: "#090814", text: "#dfdcff", accent: "#c3a4ff", prompt: "#8de6ff" } },
];

function TerminalSettingsPanel({ config, update, onBack }: {
  config: TerminalConfig;
  update: (patch: Partial<TerminalConfig>) => void;
  onBack: () => void;
}) {
  const [subTab, setSubTab] = useState<TerminalSettingsTab>("banner");
  const previewBase = Math.min(20, Math.max(13, config.fontSize + 2));
  const previewArt = resolveBannerArt(config);
  const previewPalette = resolveTerminalPalette(config);
  const trimmedArt = config.customArt.replace(/\s+$/, "");
  const artLines = trimmedArt ? trimmedArt.split("\n").length : 0;
  const artColumns = trimmedArt ? trimmedArt.split("\n").reduce((max, line) => Math.max(max, line.length), 0) : 0;
  const useCustomArt = (value: string) => update({ customArt: value, banner: CUSTOM_BANNER_ID, bannerEnabled: true });

  return (
    <section className="term-settings-view">
      <header className="term-settings-head">
        <span className="term-settings-title"><SlidersHorizontal size={14} /> Terminal Settings</span>
        <button className="term-set-btn" onClick={onBack}><ArrowLeft size={13} /> Back to terminal</button>
      </header>
      <nav className="term-subtabs" aria-label="Terminal settings sections">
        {TERMINAL_SETTINGS_TABS.map((tab) => (
          <button key={tab.id} className={`term-subtab${subTab === tab.id ? " is-active" : ""}`} onClick={() => setSubTab(tab.id)}>{tab.label}</button>
        ))}
        <button className="term-subtab term-subtab-reset" onClick={() => update({ ...DEFAULT_TERMINAL_CONFIG })}><RotateCcw size={12} /> Reset</button>
      </nav>
      <div className="term-settings-scroll">
        <div className="settings-list term-settings-list">
          <div className={`term-set-preview ${config.bannerEnabled ? "" : "is-off"}`}>
            {config.bannerEnabled
              ? <TerminalBanner art={previewArt} palette={previewPalette} baseSize={previewBase} fontKey={config.font} />
              : <span className="term-set-hint">Banner is off — the terminal opens with the welcome text only.</span>}
          </div>

          {subTab === "banner" && (
            <>
              <div className="term-set-group">Startup banner</div>
              <label className="term-set-row">
                <span className="term-set-label">Show on launch<small>Print the ASCII wordmark when the terminal opens.</small></span>
                <span className="switch">
                  <input type="checkbox" checked={config.bannerEnabled} onChange={(e) => update({ bannerEnabled: e.target.checked })} />
                  <span className="switch-track" />
                </span>
              </label>
              <div className="term-set-row">
                <span className="term-set-label">Banner style</span>
                <select className="term-set-select" value={config.banner} onChange={(e) => update({ banner: e.target.value, bannerEnabled: true })}>
                  {TERMINAL_BANNERS.map((banner) => <option key={banner.id} value={banner.id}>{banner.name}</option>)}
                  <option value={CUSTOM_BANNER_ID}>Custom art…</option>
                </select>
              </div>
              <div className="term-set-row term-set-row-col">
                <span className="term-set-label">
                  Custom ASCII art
                  <small>Paste any multi-line art — blocks, box-drawing and braille all work. Leading spaces and blank braille characters are preserved.</small>
                </span>
                <textarea
                  className="term-set-input term-set-art"
                  spellCheck={false}
                  value={config.customArt}
                  placeholder={"Paste your art here…\n⣠⣾⣿⣿  ⣠⣄\n⠈⣿⣿⣿⣿⣦⣽⣦⡀"}
                  onChange={(e) => useCustomArt(e.target.value)}
                />
                <div className="term-set-art-actions">
                  <span className="term-set-hint">{artLines ? `${artLines} lines · ${artColumns} cols` : "no custom art yet"}</span>
                  <span className="term-set-art-buttons">
                    <button className="term-set-btn" onClick={() => useCustomArt("")} disabled={!config.customArt}><RotateCcw size={13} /> Clear</button>
                  </span>
                </div>
              </div>
              <div className="term-set-row">
                <span className="term-set-label">Banner colors</span>
                <select className="term-set-select" value={config.palette} onChange={(e) => update({ palette: e.target.value })}>
                  {TERMINAL_PALETTES.map((palette) => <option key={palette.id} value={palette.id}>{palette.name}</option>)}
                  <option value={CUSTOM_PALETTE_ID}>Custom gradient…</option>
                </select>
              </div>
              {config.palette === CUSTOM_PALETTE_ID && (
                <>
                  <TerminalColorField label="Gradient start" value={config.colorFrom} onChange={(hex) => update({ colorFrom: hex })} />
                  <TerminalColorField label="Gradient end" value={config.colorTo} onChange={(hex) => update({ colorTo: hex })} />
                </>
              )}
            </>
          )}

          {subTab === "colors" && (
            <>
              <div className="term-set-group">Color combinations</div>
              <div className="term-preset-grid">
                {TERMINAL_PRESET_THEMES.map((theme) => {
                  const isActive = config.bg === theme.patch.bg && config.text === theme.patch.text && config.accent === theme.patch.accent && config.prompt === theme.patch.prompt;
                  return (
                    <button key={theme.name} className={`term-preset${isActive ? " is-active" : ""}`} onClick={() => update(theme.patch)}>
                      <span className="term-preset-swatches">
                        {theme.swatches.map((color) => <i key={color} style={{ background: color }} />)}
                      </span>
                      <span className="term-preset-name">{theme.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="term-set-group">Custom colors</div>
              <TerminalColorField label="Background" value={config.bg} onChange={(hex) => update({ bg: hex })} />
              <TerminalColorField label="Text" value={config.text} onChange={(hex) => update({ text: hex })} />
              <TerminalColorField label="Accent" value={config.accent} onChange={(hex) => update({ accent: hex })} />
              <TerminalColorField label="Prompt" value={config.prompt} onChange={(hex) => update({ prompt: hex })} />
            </>
          )}

          {subTab === "appearance" && (
            <>
              <div className="term-set-group">Background</div>
              <label className="term-set-row">
                <span className="term-set-label">Fully transparent<small>Drops the terminal background to 0% so the desktop wallpaper shows straight through. Text stays fully readable.</small></span>
                <span className="switch">
                  <input type="checkbox" checked={config.glass} onChange={(e) => update({ glass: e.target.checked })} />
                  <span className="switch-track" />
                </span>
              </label>
              <div className="term-set-row term-set-row-col">
                <span className="term-set-label">Transparency<small>{config.glass ? "off (window glass on)" : `${config.opacity}%`}</small></span>
                <input className="term-set-range" type="range" min={35} max={100} step={1} value={config.glass ? 100 : config.opacity} disabled={config.glass} onChange={(e) => update({ opacity: Number(e.target.value) })} />
              </div>
              <div className="term-set-row term-set-row-col">
                <span className="term-set-label">Wallpaper URL<small>Leave empty to use the desktop backdrop.</small></span>
                <input className="term-set-input" value={config.wallpaper} spellCheck={false} placeholder="https://…" onChange={(e) => update({ wallpaper: e.target.value })} />
              </div>
              <div className="term-set-group">Effects</div>
              <label className="term-set-row">
                <span className="term-set-label">CRT scanlines<small>Subtle scanlines across the terminal.</small></span>
                <span className="switch">
                  <input type="checkbox" checked={config.scanlines} onChange={(e) => update({ scanlines: e.target.checked })} />
                  <span className="switch-track" />
                </span>
              </label>
              <label className="term-set-row">
                <span className="term-set-label">Neon glow<small>Soft glow around the terminal edge.</small></span>
                <span className="switch">
                  <input type="checkbox" checked={config.glow} onChange={(e) => update({ glow: e.target.checked })} />
                  <span className="switch-track" />
                </span>
              </label>
            </>
          )}

          {subTab === "typography" && (
            <>
              <div className="term-set-group">Text &amp; cursor</div>
              <div className="term-set-row">
                <span className="term-set-label">Font</span>
                <select className="term-set-select" value={config.font} onChange={(e) => update({ font: e.target.value })}>
                  {TERMINAL_FONTS.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}
                </select>
              </div>
              <div className="term-set-row term-set-row-col">
                <span className="term-set-label">Font size<small>{config.fontSize}px</small></span>
                <input className="term-set-range" type="range" min={10} max={22} step={1} value={config.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} />
              </div>
              <div className="term-set-row">
                <span className="term-set-label">Cursor</span>
                <select className="term-set-select" value={config.cursor} onChange={(e) => update({ cursor: e.target.value as TerminalConfig["cursor"] })}>
                  {TERMINAL_CURSORS.map((cursor) => <option key={cursor.id} value={cursor.id}>{cursor.name}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${seconds}s`].filter(Boolean).join(" ");
}

const TERM_HELP_ROWS: [string, string][] = [
  ["help", "show this list"],
  ["clear", "clear the screen"],
  ["echo <text>", "print text"],
  ["pwd · ls · cat <file>", "filesystem basics"],
  ["git clone <url> · cd <dir>", "repository workflow"],
  ["./start.sh", "install Quick Wallpaper Picker"],
  ["about", "system information"],
  ["banner [list|on|off|<id>|art]", "customize the startup banner"],
  ["theme [set k=v … | reset]", "colors, font, cursor, effects"],
  ["ansi", "preview ANSI colors & text styles"],
  ["settings", "open the terminal settings panel"],
];

function TerminalSurface({ installed, onInstalled }: { installed: boolean; onInstalled: () => void }) {
  const [config, setConfig] = useState<TerminalConfig>(() => readTerminalConfig());
  const [introVisible, setIntroVisible] = useState<boolean>(() => config.bannerEnabled);
  const [tab, setTab] = useState<"terminal" | "settings">("terminal");
  const [lines, setLines] = useState<ReactNode[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [caretX, setCaretX] = useState(0);
  const [caretTick, setCaretTick] = useState(0);
  const clonedRef = useRef(false);
  const installingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const openedAt = useRef(Date.now());

  const palette = useMemo(() => resolveTerminalPalette(config), [config]);
  const bannerArt = useMemo(() => resolveBannerArt(config), [config]);
  const bannerBase = Math.min(20, Math.max(13, config.fontSize + 2));

  const update = (patch: Partial<TerminalConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      writeTerminalConfig(next);
      return next;
    });
  };

  useEffect(() => {
    const el = outRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, tab, introVisible]);

  useLayoutEffect(() => {
    if (config.cursor === "bar") return;
    const measure = measureRef.current;
    const el = inputRef.current;
    if (!measure || !el) return;
    const pos = el.selectionStart ?? input.length;
    measure.textContent = input.slice(0, pos);
    setCaretX(measure.getBoundingClientRect().width);
  }, [input, caretTick, config.cursor, config.fontSize, config.font, config.text]);

  const prompt = `vertex@vertex-os:${ready ? "~/Quick-Wallpaper-Picker" : "~"}$`;

  const p = (node: ReactNode) => setLines((prev) => [...prev, node]);
  const pa = (text: string) => setLines((prev) => [...prev, ansiToNodes(text, `a${prev.length}`)]);
  const scrollToTop = () => {
    if (outRef.current) outRef.current.scrollTop = 0;
  };

  const runInstall = () => {
    if (installingRef.current) return;
    installingRef.current = true;
    p(<span className="term-success">Installing Quick Wallpaper Picker...</span>);
    let i = 0;
    const tick = () => {
      if (i < WP_INSTALL_STEPS.length) {
        p(WP_INSTALL_STEPS[i]);
        i += 1;
        window.setTimeout(tick, 260 + Math.random() * 300);
      } else {
        p(<span className="term-success">Installation complete ✓</span>);
        p(<span className="term-out">Quick Wallpaper Picker is now installed.</span>);
        p(<span className="term-out">Press <span className="term-cmd">Alt+W</span> to open it — no app, no desktop icon.</span>);
        p("");
        window.setTimeout(() => onInstalled(), 500);
      }
    };
    tick();
  };

  const run = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) { p(<span className="term-in"><span className="term-prompt">{prompt}</span></span>); return; }
    p(<span className="term-in"><span className="term-prompt">{prompt}</span> <span className="term-cmd">{cmd}</span></span>);
    if (cmd === "help") {
      pa("\u001b[1m\u001b[38;5;45mVertex-OS Terminal\u001b[0m \u001b[2m— available commands\u001b[0m");
      pa("\u001b[2m──────────────────────────────────────────────\u001b[0m");
      for (const [usage, description] of TERM_HELP_ROWS) {
        pa(`  \u001b[36m${usage.padEnd(32)}\u001b[0m\u001b[2m${description}\u001b[0m`);
      }
      p("");
      return;
    }
    if (cmd === "clear") { setLines([]); setIntroVisible(false); return; }
    if (cmd.startsWith("echo ")) { p(<span className="term-out">{cmd.slice(5)}</span>); p(""); return; }
    if (cmd === "pwd") { p(<span className="term-out">{ready ? "~/Quick-Wallpaper-Picker" : "~"}</span>); p(""); return; }
    if (cmd === "ls") {
      p(<span className="term-out">README.md  assets/  package.json  src/  start.sh</span>);
      p("");
      return;
    }
    if (cmd === "cat README.md") {
      p(<span className="term-out"># Quick Wallpaper Picker</span>);
      p(<span className="term-out">Lightweight animated wallpaper picker for Vertex-OS.</span>);
      p(<span className="term-out">Run <span className="term-cmd">./start.sh</span> to install.</span>);
      p("");
      return;
    }
    if (cmd === "./start.sh") {
      if (installed) {
        p(<span className="term-out">Quick Wallpaper Picker is already installed.</span>);
        p(<span className="term-out">Press <span className="term-cmd">Alt+W</span> to open it.</span>);
        p("");
        return;
      }
      runInstall();
      return;
    }
    const cloneMatch = cmd.match(/^git\s+clone\s+(.+)$/);
    if (cloneMatch) {
      const url = cloneMatch[1];
      if (/Quick-Wall[p]aper-Picker\.git/.test(url)) {
        clonedRef.current = true;
        p(<span className="term-out">Cloning into <span className="term-cmd">'{WP_REPO_DIR}'</span>...</span>);
        p(<span className="term-out">remote: Enumerating objects: 24, done.</span>);
        p(<span className="term-out">remote: Counting objects: 100% (24/24), done.</span>);
        p(<span className="term-out">remote: Compressing objects: 100% (18/18), done.</span>);
        p(<span className="term-out">remote: Total 24 (delta 6), reused 0 (delta 0), pack-reused 0</span>);
        p(<span className="term-out">Receiving objects: 100% (24/24), 2.3 MiB | 5.1 MiB/s, done.</span>);
        p(<span className="term-out">Resolving deltas: 100% (6/6), done.</span>);
        p("");
      } else {
        p(<span className="term-error">fatal: repository <span className="term-cmd">{url}</span> not found.</span>);
        p("");
      }
      return;
    }
    const cdMatch = cmd.match(/^cd\s+(.+)$/);
    if (cdMatch) {
      const dir = cdMatch[1].replace(/\/+$/, "");
      if (dir === WP_REPO_DIR && !clonedRef.current) {
        p(<span className="term-error">cd: no such directory: <span className="term-cmd">{dir}</span> (did you clone it first?)</span>);
        p("");
        return;
      }
      if (dir === WP_REPO_DIR) {
        setReady(true);
        p(<span className="term-out">(now in <span className="term-cmd">~/Quick-Wallpaper-Picker</span>)</span>);
        if (installed) {
          p(<span className="term-out">Run <span className="term-cmd">./start.sh</span> or press <span className="term-cmd">Alt+W</span> to open it.</span>);
        } else {
          p(<span className="term-out">Run <span className="term-cmd">./start.sh</span> to install.</span>);
        }
        p("");
        return;
      }
      p(<span className="term-error">cd: no such directory: <span className="term-cmd">{dir}</span></span>);
      p("");
      return;
    }
    if (cmd === "settings" || cmd === "config" || cmd === "prefs") {
      setTab("settings");
      pa("\u001b[2mswitched to the settings tab\u001b[0m");
      p("");
      return;
    }

    if (cmd === "about" || cmd === "neofetch" || cmd === "status") {
      const uptime = formatUptime(Math.max(0, Math.round((Date.now() - openedAt.current) / 1000)));
      const bannerName = config.banner === CUSTOM_BANNER_ID ? "custom art" : (getBanner(config.banner)?.name ?? config.banner);
      const paletteName = palette.id === CUSTOM_PALETTE_ID ? "custom gradient" : palette.name;
      pa("\u001b[1m\u001b[38;5;45mvertex\u001b[0m\u001b[2m@\u001b[0m\u001b[1m\u001b[35mvertex-os\u001b[0m");
      pa("\u001b[2m──────────────────────────────\u001b[0m");
      const rows: [string, string][] = [
        ["OS", "Vertex-OS 1.0 (web)"],
        ["Host", "Browser Runtime"],
        ["Shell", "zsh 5.9 (vertex)"],
        ["Terminal", "vertex-term"],
        ["Theme", `${paletteName} · ${config.fontSize}px · ${config.cursor}`],
        ["Banner", `${bannerName} (${config.bannerEnabled ? "on" : "off"})`],
        ["Font", config.font],
        ["Uptime", uptime],
        ["Locale", typeof navigator !== "undefined" ? navigator.language : "en-US"],
      ];
      for (const [key, value] of rows) pa(`  \u001b[36m${key.padEnd(10)}\u001b[0m${value}`);
      p("");
      return;
    }

    if (cmd === "ansi" || cmd === "colors") {
      pa("\u001b[1mANSI colors\u001b[0m");
      for (let group = 0; group < 2; group += 1) {
        const cells: string[] = [];
        for (let i = 0; i < 8; i += 1) {
          const code = group === 0 ? 40 + i : 100 + i;
          cells.push(`\u001b[${code}m ${String(code).padStart(3)} \u001b[0m`);
        }
        pa(`  ${cells.join(" ")}`);
      }
      pa("\u001b[1mStyles\u001b[0m  \u001b[1mbold\u001b[0m  \u001b[2mdim\u001b[0m  \u001b[3mitalic\u001b[0m  \u001b[4munderline\u001b[0m  \u001b[7minverse\u001b[0m");
      pa("  \u001b[38;5;208m256-color\u001b[0m  \u001b[38;2;255;105;180mtruecolor\u001b[0m");
      p("");
      return;
    }

    if (cmd === "banner") {
      pa("\u001b[1mStartup banner\u001b[0m");
      pa(`  active   \u001b[38;5;45m${config.banner}\u001b[0m (${config.bannerEnabled ? "on" : "off"})`);
      pa(`  styles   ${TERMINAL_BANNERS.map((banner) => banner.id).join(", ")}`);
      pa("\u001b[2m  usage    banner <id> · banner on · banner off · banner art · banner list · banner preview\u001b[0m");
      p("");
      return;
    }
    if (cmd === "banner list") {
      pa("\u001b[1mAvailable banners\u001b[0m");
      for (const banner of TERMINAL_BANNERS) {
        const marker = banner.id === config.banner ? "\u001b[38;5;45m●\u001b[0m" : "\u001b[2m○\u001b[0m";
        pa(`  ${marker} \u001b[1m${banner.id.padEnd(16)}\u001b[0m\u001b[2m${banner.hint}\u001b[0m`);
      }
      const customMarker = config.banner === CUSTOM_BANNER_ID ? "\u001b[38;5;45m●\u001b[0m" : "\u001b[2m○\u001b[0m";
      pa(`  ${customMarker} \u001b[1m${CUSTOM_BANNER_ID.padEnd(16)}\u001b[0m\u001b[2myour own ASCII art (edit in settings)\u001b[0m`);
      p("");
      return;
    }
    if (cmd === "banner on" || cmd === "banner off") {
      const enabled = cmd === "banner on";
      update({ bannerEnabled: enabled });
      if (enabled) { setIntroVisible(true); window.setTimeout(scrollToTop, 0); }
      pa(`startup banner \u001b[1m${enabled ? "enabled" : "disabled"}\u001b[0m`);
      p("");
      return;
    }
    if (cmd === "banner preview") {
      if (!config.bannerEnabled) update({ bannerEnabled: true });
      setIntroVisible(true);
      window.setTimeout(scrollToTop, 0);
      return;
    }
    if (cmd === "banner art" || cmd === "banner custom") {
      update({ banner: CUSTOM_BANNER_ID, bannerEnabled: true });
      setIntroVisible(true);
      pa("switched to \u001b[1mcustom\u001b[0m banner — paste your art under \u001b[36msettings\u001b[0m.");
      p("");
      return;
    }
    if (cmd.startsWith("banner ")) {
      const bannerId = cmd.slice(7).trim();
      if (bannerId === CUSTOM_BANNER_ID || getBanner(bannerId)) {
        update({ banner: bannerId, bannerEnabled: true });
        setIntroVisible(true);
        window.setTimeout(scrollToTop, 0);
        pa(`startup banner set to \u001b[38;5;45m${bannerId}\u001b[0m`);
        p("");
      } else {
        pa(`\u001b[31mbanner: unknown style '\u001b[1m${bannerId}\u001b[0m\u001b[31m' — try \u001b[36mbanner list\u001b[0m.`);
        p("");
      }
      return;
    }

    if (cmd === "theme" || cmd === "theme show") {
      pa("\u001b[1mTerminal theme\u001b[0m");
      const entries: [string, string][] = [
        ["bg", config.bg], ["text", config.text], ["accent", config.accent], ["prompt", config.prompt],
        ["font", config.font], ["fontSize", String(config.fontSize)], ["cursor", config.cursor],
        ["opacity", String(config.opacity)], ["scanlines", String(config.scanlines)], ["glow", String(config.glow)],
        ["wallpaper", config.wallpaper || "none"], ["palette", config.palette],
        ["banner", config.bannerEnabled ? config.banner : "off"],
      ];
      for (const [key, value] of entries) pa(`  \u001b[36m${key.padEnd(11)}\u001b[0m${value}`);
      pa("\u001b[2m  usage      theme set bg=#0b1020 accent=#7ee787 · theme reset\u001b[0m");
      p("");
      return;
    }
    if (cmd === "theme reset") {
      update({ ...DEFAULT_TERMINAL_CONFIG });
      setIntroVisible(true);
      pa("terminal theme \u001b[1mreset\u001b[0m to defaults.");
      p("");
      return;
    }
    if (cmd.startsWith("theme set")) {
      const tokens = cmd.slice(9).trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) { pa("\u001b[31mtheme: expected key=value pairs\u001b[0m"); p(""); return; }
      const { next, applied, errors } = applyThemeTokens(config, tokens);
      if (applied.length) update(next);
      for (const entry of applied) pa(`  \u001b[32m✓\u001b[0m ${entry}`);
      for (const entry of errors) pa(`  \u001b[31m✗\u001b[0m ${entry} \u001b[2m(unknown key or invalid value)\u001b[0m`);
      p("");
      return;
    }

    if (cmd.startsWith("sudo proxylist:")) {
      const pieces = cmd.slice("sudo proxylist:".length).trim().split(/\s+/).filter(Boolean);
      const link = pieces[0] ?? "";
      let limit = 16;
      if (pieces[1]) {
        if (/^all$|^0$/i.test(pieces[1])) limit = Number.MAX_SAFE_INTEGER;
        else if (/^\d+$/.test(pieces[1])) limit = parseInt(pieces[1], 10);
      }
      if (!link) {
        p(<span className="term-error">sudo: proxylist: expected a source URL.</span>);
        p(<span className="term-error">usage: <span className="term-cmd">sudo proxylist:https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text</span></span>);
        p(<span className="term-error">options: append <span className="term-cmd">all</span> or a count (e.g. <span className="term-cmd">sudo proxylist:&lt;url&gt; all</span>) — see <span className="term-cmd">proxysources</span></span>);
        p("");
        return;
      }
      if (!/^https?:\/\//i.test(link)) {
        p(<span className="term-error">sudo: proxylist: invalid source '<span className="term-cmd">{link}</span>'.</span>);
        p("");
        return;
      }
      const geoOf = (value: unknown) => {
        if (value && typeof value === "object" && typeof (value as { country?: unknown }).country === "string") {
          return (value as { country: string }).country;
        }
        return undefined;
      };
      const tryHost = (s: string) => {
        const m = s.match(/^([a-z][a-z0-9+_-]*):\/\/([a-zA-Z0-9.-]+):(\d+)$/i);
        if (m) return { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), port: m[3] };
        const n = s.match(/^([a-zA-Z0-9.-]+):(\d+)$/);
        if (n) return { scheme: "http", host: n[1].toLowerCase(), port: n[2] };
        return null;
      };
      const parseProxies = (raw: string) => {
        const rows: { scheme: string; host: string; port: string; country?: string }[] = [];
        const add = (row: { scheme: string; host: string; port: string; country?: string } | null) => {
          if (row) rows.push(row);
        };
        const t = raw.trim();
        if (t.startsWith("[") || t.startsWith("{")) {
          try {
            const walk = (value: unknown) => {
              if (Array.isArray(value)) { value.forEach(walk); return; }
              if (value && typeof value === "object") {
                const obj = value as Record<string, unknown>;
                if (typeof obj.proxy === "string") {
                  add({ ...tryHost(obj.proxy), country: geoOf(obj.geolocation) } as { scheme: string; host: string; port: string; country?: string });
                  return;
                }
                if (typeof obj.ip === "string" && /^\d+$/.test(String(obj.port))) {
                  const proto = typeof obj.protocol === "string" ? obj.protocol.toLowerCase().replace(/[^a-z0-9+_-]/g, "") || "http" : "http";
                  add({ scheme: proto, host: obj.ip, port: String(obj.port), country: geoOf(obj.geolocation) });
                  return;
                }
                Object.keys(obj).forEach((key) => walk(obj[key]));
              }
            };
            walk(JSON.parse(t));
          } catch { /* not JSON, fall through to line parser */ }
        }
        if (!rows.length) {
          t.split(/\r?\n/).forEach((line) => {
            const s = line.trim();
            if (!s) return;
            if (s.startsWith("proxy,") || s.startsWith("PROXY,")) return;
            if (s.includes(",") && !s.includes("://")) {
              const cols = s.split(",");
              if (cols.length >= 4) {
                const base = tryHost(cols[0]);
                if (base) {
                  const proto = (cols[1] ?? "").toLowerCase().replace(/[^a-z0-9+_-]/g, "");
                  add({ ...base, scheme: proto && proto !== "http" ? proto : base.scheme });
                  return;
                }
              }
            }
            add(tryHost(s));
          });
        }
        return rows;
      };
      p(<span className="term-dim">sudo: scraping proxy source…</span>);
      window.setTimeout(async () => {
        let text = "";
        let viaRelay = false;
        let failed = false;
        try {
          text = await (await fetch(link)).text();
          if (text.trim().length < 3) throw new Error("empty body");
        } catch {
          try {
            viaRelay = true;
            text = await (await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(link)}`)).text();
            if (text.trim().length < 3) throw new Error("empty body");
          } catch {
            failed = true;
          }
        }
        if (failed) {
          p(<span className="term-error">sudo: proxylist: source unreachable — network/filter blocked the request.</span>);
          p(<span className="term-error">hint: run <span className="term-cmd">proxysources</span> for working feeds, or <span className="term-cmd">!sudo curl connectsourcelink:socks5://…</span></span>);
          p("");
          return;
        }
        const rows = parseProxies(text);
        if (rows.length) {
          pa(`\u001b[32m[+]\u001b[0m \u001b[1msource connected\u001b[0m \u001b[2m(${viaRelay ? "via relay" : "direct"})\u001b[0m`);
          pa(`\u001b[2m    ${link}\u001b[0m`);
          pa(`\u001b[32m[+]\u001b[0m ${rows.length} proxies loaded.`);
          pa("\u001b[2m──────────────────────────────────────────────\u001b[0m");
          const shown = rows.length > limit ? rows.slice(0, limit) : rows;
          shown.forEach((row, i) => {
            const ping = 18 + Math.round(Math.random() * 140);
            const geo = row.country ? `  \u001b[2m· ${row.country}\u001b[0m` : "";
            pa(`  \u001b[38;5;45m[${String(i + 1).padEnd(2)}]\u001b[0m ${row.scheme}://${row.host}:${row.port}${geo}  \u001b[32m${ping}ms\u001b[0m`);
          });
          if (rows.length > shown.length) pa(`  \u001b[2m… and ${rows.length - shown.length} more — add '${"all"}' to print the whole list\u001b[0m`);
          pa(`\u001b[32m[+]\u001b[0m \u001b[1m${rows.length}/${rows.length} free proxies ready\u001b[0m`);
        } else {
          p(<span className="term-error">sudo: proxylist: no parseable proxies in source.</span>);
        }
        p("");
      }, 420);
      return;
    }
    if (cmd.startsWith("!sudo curl connectsourcelink:")) {
      const target = cmd.slice("!sudo curl connectsourcelink:".length).trim();
      const match = target.match(/^([a-z][a-z0-9+_-]*):\/\/([a-zA-Z0-9.-]+):(\d+)\/?$/i);
      if (!target || !match) {
        p(<span className="term-error">!sudo curl: connectsourcelink: malformed source link.</span>);
        p(<span className="term-error">usage: <span className="term-cmd">!sudo curl connectsourcelink:socks5://172.86.88.139:1081</span></span>);
        p("");
        return;
      }
      const scheme = match[1].toLowerCase();
      const host = match[2].toLowerCase();
      const port = match[3];
      const rtt = 40 + Math.round(Math.random() * 180);
      const hexPort = parseInt(port, 10).toString(16).toUpperCase().padStart(4, "0");
      const stages: { ms: number; line: ReactNode }[] = [
        { ms: 420, line: <span className="term-out">resolving <span className="term-cmd">{host}</span>…</span> },
        { ms: 520, line: <span className="term-out">negotiating <span className="term-cmd">{scheme}</span> handshake with <span className="term-cmd">{host}:{port}</span>…</span> },
        { ms: 520, line: <span className="term-out"><span className="term-dim">[req]</span> 05 01 00 03 00 01 00 {hexPort}</span> },
        { ms: 620, line: <span className="term-success"><span className="term-dim">[rep]</span> 05 00 00 01 00 00 00 00 00 00</span> },
        { ms: 460, line: <span className="term-success">✓ {scheme}://{host}:{port} — channel established <span className="term-dim">({rtt} ms)</span></span> },
      ];
      let elapsed = 0;
      for (const stage of stages) {
        elapsed += stage.ms;
        window.setTimeout(() => p(stage.line), elapsed);
      }
      window.setTimeout(() => p(""), elapsed);
      return;
    }
    if (cmd === "proxysources" || cmd === "proxy sources" || cmd === "proxylist sources") {
      pa("\u001b[1m\u001b[38;5;45mProxy sources\u001b[0m \u001b[2m— public free-proxy feeds & raw links\u001b[0m");
      pa("\u001b[2m───────────────────────────────────────────────────────\u001b[0m");
      const feeds: [string, string][] = [
        ["proxifly · free-proxy-list (explore)", "https://github.com/proxifly/free-proxy-list/tree/main/proxies"],
        ["  ├ raw — all (text)", "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt"],
        ["  ├ raw — socks5 (text)", "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt"],
        ["  ├ raw — socks5 (json, big)", "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.json"],
        ["  ├ raw — socks4 (text)", "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt"],
        ["  ├ raw — http (text)", "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt"],
        ["  └ raw — https (text)", "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/https/data.txt"],
        ["proxyscrape v4 (text)", "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text"],
        ["proxy-list.download (text)", "https://www.proxy-list.download/api/v1/get?type=socks5"],
        ["openproxylist (text)", "https://api.openproxylist.xyz/socks5.txt"],
        ["TheSpeedX PROXY-List (raw)", "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt"],
      ];
      for (const [label, url] of feeds) {
        pa(`  \u001b[38;5;45m▸\u001b[0m \u001b[1m${label}\u001b[0m`);
        pa(`\u001b[2m      ${url}\u001b[0m`);
      }
      pa("\u001b[2m───────────────────────────────────────────────────────\u001b[0m");
      pa("\u001b[2m  load one:  \u001b[0m\u001b[1msudo proxylist:\u001b[0m\u001b[36m<url>\u001b[0m  \u001b[2m(add \u001b[0m\u001b[1mall\u001b[0m\u001b[2m for the whole list, or a count)\u001b[0m");
      p("");
      return;
    }

    p(<span className="term-error">zsh: command not found: <span className="term-cmd">{cmd.split(" ")[0]}</span></span>);
    p("");
  };

  return (
    <div
      className={`term-surface ${config.glass ? "term-glass" : ""} ${config.glow ? "term-glow" : ""} ${config.scanlines ? "term-scanlines" : ""} ${terminalHasWallpaper(config) ? "has-wallpaper" : ""}`}
      style={terminalCssVars(config)}
      data-cursor={config.cursor}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="term-tabs">
        <button className={`term-tab ${tab === "terminal" ? "is-active" : ""}`} onClick={() => setTab("terminal")}>{"⌁ zsh — vertex@vertex-os"}</button>
        <button className={`term-tab ${tab === "settings" ? "is-active" : ""}`} onClick={() => setTab("settings")}>{"⚙ settings"}</button>
        <span className="term-tabs-grow" />
      </div>
      <div className="term-body">
        {tab === "terminal" && (
        <div className="term-output" ref={outRef}>
          {introVisible && (
            <div className="term-intro">
              {config.bannerEnabled && <TerminalBanner art={bannerArt} palette={palette} baseSize={bannerBase} fontKey={config.font} />}
              <div className="term-line"><span className="term-welcome-title">Vertex-OS Terminal</span> <span className="term-dim">v1.0</span></div>
              <div className="term-line term-dim">zsh 5.9 · offline-first shell · {TERMINAL_BANNERS.length} banner styles</div>
              <div className="term-line">Type <span className="term-cmd">help</span> for commands, <span className="term-cmd">settings</span> to customize, <span className="term-cmd">theme</span> for colors.</div>
              <div className="term-line term-blank" />
            </div>
          )}
          {lines.map((line, i) => <div className="term-line" key={i}>{line}</div>)}
          <div className="term-line term-entry">
            <span className="term-prompt">{prompt}</span>
            <span className="term-space"> </span>
            <span className="term-input-wrap">
              <input
                ref={inputRef}
                className="term-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); run(input); setInput(""); setCaretX(0); }
                  else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") window.setTimeout(() => setCaretTick((tick) => tick + 1), 0);
                }}
                onKeyUp={() => setCaretTick((tick) => tick + 1)}
                onSelect={() => setCaretTick((tick) => tick + 1)}
                onClick={(event) => { event.stopPropagation(); setCaretTick((tick) => tick + 1); }}
                spellCheck={false}
                autoComplete="off"
                autoFocus
                aria-label="Terminal input"
              />
              {config.cursor !== "bar" && (
                <span className="term-caret" data-cursor={config.cursor} style={{ left: `${caretX}px` }} aria-hidden="true" />
              )}
              <span className="term-measure" ref={measureRef} aria-hidden="true" />
            </span>
          </div>
        </div>
        )}
        {tab === "settings" && (
          <TerminalSettingsPanel config={config} update={update} onBack={() => setTab("terminal")} />
        )}
      </div>
    </div>
  );
}

type CalcToken = { type: "num" | "op" | "fun" | "lp" | "rp" | "post" | "var"; value: string };

function tokenizeCalc(expr: string): CalcToken[] {
  const tokens: CalcToken[] = [];
  const s = expr.toLowerCase();
  let i = 0;
  const isDigit = (c: string) => (c >= "0" && c <= "9") || c === ".";
  const isIdent = (c: string) => (c >= "a" && c <= "z") || c === "_";
  while (i < s.length) {
    const c = s[i];
    if (c === " ") { i += 1; continue; }
    if (isDigit(c)) {
      let j = i;
      while (j < s.length && isDigit(s[j])) j += 1;
      tokens.push({ type: "num", value: s.slice(i, j) });
      i = j;
      continue;
    }
    if (isIdent(c)) {
      let j = i;
      while (j < s.length && isIdent(s[j])) j += 1;
      const word = s.slice(i, j);
      const funs = ["sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "sqrt", "abs", "floor", "ceil", "round", "exp", "min", "max", "pow"];
      if (funs.includes(word)) tokens.push({ type: "fun", value: word });
      else if (word === "e" || word === "pi") tokens.push({ type: "var", value: word });
      else throw new Error("unknown ident");
      i = j;
      continue;
    }
    if (c === "(") { tokens.push({ type: "lp", value: "(" }); i += 1; continue; }
    if (c === ")") { tokens.push({ type: "rp", value: ")" }); i += 1; continue; }
    if (c === "!") { tokens.push({ type: "post", value: "!" }); i += 1; continue; }
    if (c === "%") { tokens.push({ type: "post", value: "%" }); i += 1; continue; }
    if ("+-*/^".includes(c)) {
      let op = c;
      if (c === "*" && s[i + 1] === "*") { op = "^"; i += 1; }
      tokens.push({ type: "op", value: op });
      i += 1;
      continue;
    }
    throw new Error("unknown char");
  }
  if (tokens.length && tokens[0].type === "op" && tokens[0].value !== "!" && tokens[0].value !== "%") {
    tokens.unshift({ type: "num", value: "0" });
  }
  const fixed: CalcToken[] = [];
  for (let k = 0; k < tokens.length; k += 1) {
    const tok = tokens[k];
    fixed.push(tok);
    const next = tokens[k + 1];
    if (next && (tok.type === "op" || tok.type === "rp" || tok.type === "post") && next.type === "op" && (next.value === "-" || next.value === "+")) {
      fixed.push({ type: "num", value: next.value === "-" ? "1" : "1" });
      fixed.push({ type: "op", value: next.value === "-" ? "*" : "*" });
      k += 1;
      const sign = next.value === "-" ? "-" : "+";
      fixed[fixed.length - 2] = { type: "num", value: sign + "1" };
      continue;
    }
    if (next && (tok.type === "num" || tok.type === "rp" || tok.type === "var" || tok.type === "post") && (next.type === "lp" || next.type === "fun")) {
      fixed.push({ type: "op", value: "*" });
    }
  }
  return fixed;
}

function applyCalcFn(name: string, args: number[]): number {
  const [a, b] = args;
  switch (name) {
    case "sin": return Math.sin(a);
    case "cos": return Math.cos(a);
    case "tan": return Math.tan(a);
    case "asin": return Math.asin(a);
    case "acos": return Math.acos(a);
    case "atan": return Math.atan(a);
    case "log": return Math.log10(a);
    case "ln": return Math.log(a);
    case "sqrt": return Math.sqrt(a);
    case "abs": return Math.abs(a);
    case "floor": return Math.floor(a);
    case "ceil": return Math.ceil(a);
    case "round": return Math.round(a);
    case "exp": return Math.exp(a);
    case "min": return Math.min(a, b ?? 0);
    case "max": return Math.max(a, b ?? 0);
    case "pow": return Math.pow(a, b ?? 1);
    default: throw new Error("unknown fn");
  }
}

function factorialCalc(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error("factorial");
  if (n > 170) throw new Error("overflow");
  let r = 1;
  for (let k = 2; k <= n; k += 1) r *= k;
  return r;
}

function throwDiv0(): never { throw new Error("div0"); }

export function evaluateCalc(expr: string): number {
  const tokens = tokenizeCalc(expr);
  const output: CalcToken[] = [];
  const stack: CalcToken[] = [];
  const prec: Record<string, number> = { "+": 2, "-": 2, "*": 3, "/": 3, "^": 5 };
  const rightAssoc = new Set(["^"]);
  for (const tok of tokens) {
    if (tok.type === "num" || tok.type === "var") { output.push(tok); continue; }
    if (tok.type === "fun") { stack.push(tok); continue; }
    if (tok.type === "op") {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type !== "op") break;
        const higher = rightAssoc.has(tok.value) ? prec[top.value] > prec[tok.value] : prec[top.value] >= prec[tok.value];
        if (!higher) break;
        output.push(stack.pop() as CalcToken);
      }
      stack.push(tok);
      continue;
    }
    if (tok.type === "lp") { stack.push(tok); continue; }
    if (tok.type === "rp") {
      while (stack.length && stack[stack.length - 1].type !== "lp") output.push(stack.pop() as CalcToken);
      if (stack.length) stack.pop();
      if (stack.length && stack[stack.length - 1].type === "fun") output.push(stack.pop() as CalcToken);
      continue;
    }
    if (tok.type === "post") { output.push(tok); continue; }
  }
  while (stack.length) output.push(stack.pop() as CalcToken);
  const vals: number[] = [];
  for (const tok of output) {
    if (tok.type === "num") { vals.push(parseFloat(tok.value)); continue; }
    if (tok.type === "var") { vals.push(tok.value === "pi" ? Math.PI : Math.E); continue; }
    if (tok.type === "post") {
      const v = vals.pop();
      if (v === undefined) throw new Error("eval");
      vals.push(tok.value === "!" ? factorialCalc(v) : v / 100);
      continue;
    }
    if (tok.type === "fun") {
      const argc = (tok.value === "min" || tok.value === "max" || tok.value === "pow") ? 2 : 1;
      if (vals.length < argc) throw new Error("args");
      const args = vals.splice(vals.length - argc, argc);
      vals.push(applyCalcFn(tok.value, args));
      continue;
    }
    if (tok.type === "op") {
      const b = vals.pop();
      const a = vals.pop();
      if (a === undefined || b === undefined) throw new Error("eval");
      let r: number;
      if (tok.value === "+") r = a + b;
      else if (tok.value === "-") r = a - b;
      else if (tok.value === "*") r = a * b;
      else if (tok.value === "/") r = b === 0 ? throwDiv0() : a / b;
      else r = Math.pow(a, b);
      vals.push(r);
    }
  }
  if (vals.length !== 1) throw new Error("eval");
  const out = vals[0];
  if (!Number.isFinite(out)) throw new Error("nonfinite");
  return out;
}

function formatCalc(n: number): string {
  if (Object.is(n, -0)) n = 0;
  const abs = Math.abs(n);
  if (abs >= 1e15 || (abs !== 0 && abs < 1e-9)) return n.toExponential(8).replace(/(\.\d*?)0+e/, "$1e");
  let s = String(parseFloat(n.toPrecision(12)));
  if (s.length > 14) s = n.toExponential(6).replace(/(\.\d*?)0+e/, "$1e");
  return s;
}

const CALC_LAYOUT: { label: string; tone: "fn" | "op" | "num" | "ac" | "eq" | "mem"; action: string }[] = [
  { label: "MC", tone: "mem", action: "mc" },
  { label: "MR", tone: "mem", action: "mr" },
  { label: "M+", tone: "mem", action: "mplus" },
  { label: "M−", tone: "mem", action: "mminus" },
  { label: "( )", tone: "op", action: "paren" },
  { label: "%", tone: "fn", action: "append:%" },
  { label: "AC", tone: "ac", action: "clear" },
  { label: "⌫", tone: "fn", action: "back" },
  { label: "sin", tone: "fn", action: "append:sin(" },
  { label: "cos", tone: "fn", action: "append:cos(" },
  { label: "tan", tone: "fn", action: "append:tan(" },
  { label: "x²", tone: "fn", action: "append:^2" },
  { label: "√", tone: "fn", action: "append:sqrt(" },
  { label: "ln", tone: "fn", action: "append:ln(" },
  { label: "log", tone: "fn", action: "append:log(" },
  { label: "xʸ", tone: "fn", action: "append:^" },
  { label: "7", tone: "num", action: "append:7" },
  { label: "8", tone: "num", action: "append:8" },
  { label: "9", tone: "num", action: "append:9" },
  { label: "÷", tone: "op", action: "append:/" },
  { label: "π", tone: "fn", action: "append:π" },
  { label: "e", tone: "fn", action: "append:e" },
  { label: "4", tone: "num", action: "append:4" },
  { label: "5", tone: "num", action: "append:5" },
  { label: "6", tone: "num", action: "append:6" },
  { label: "×", tone: "op", action: "append:*" },
  { label: "±", tone: "fn", action: "neg" },
  { label: "n!", tone: "fn", action: "append:!" },
  { label: "1", tone: "num", action: "append:1" },
  { label: "2", tone: "num", action: "append:2" },
  { label: "3", tone: "num", action: "append:3" },
  { label: "−", tone: "op", action: "append:-" },
  { label: "0", tone: "num", action: "append:0" },
  { label: ".", tone: "num", action: "append:." },
  { label: "=", tone: "eq", action: "eq" },
  { label: "+", tone: "op", action: "append:+" },
];

function CalculatorSurface() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string>("0");
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const [memory, setMemory] = useState(0);
  const [error, setError] = useState(false);

  const reduce = (s: string) => s.replace(/π/g, "pi").replace(/\s+/g, "");

  const append = (part: string) => {
    setError(false);
    setResult("0");
    setExpr((prev) => {
      if (part === ".") {
        const tail = (prev.match(/[0-9.]*$/) ?? [""])[0];
        if (prev === "" || tail.includes(".")) return prev;
      }
      if (["+", "-", "*", "/", "^"].includes(part) && /[+\-*/^]$/.test(prev)) return prev;
      const next = reduce(prev) + part;
      if (next.length > 64) return prev;
      return next;
    });
  };

  const press = (action: string) => {
    if (action.startsWith("append:")) { append(action.slice(7)); return; }
    switch (action) {
      case "clear":
        setExpr("");
        setResult("0");
        setError(false);
        break;
      case "back":
        setError(false);
        setResult("0");
        setExpr((prev) => prev.slice(0, -1));
        break;
      case "neg":
        setError(false);
        setExpr((prev) => {
          const m = prev.match(/^(.*?)([-+]?)([0-9]+(?:\.[0-9]*)?|\.\d+)$/);
          if (!m) return prev;
          const [, head, sign, tailNum] = m;
          return head + (sign === "-" ? "" : "-") + tailNum;
        });
        break;
      case "paren":
        setError(false);
        setResult("0");
        setExpr((prev) => {
          const open = (prev.match(/\(/g) ?? []).length;
          const close = (prev.match(/\)/g) ?? []).length;
          return open > close && !/[0-9.)]$/.test(prev) ? prev + ")" : prev + "(";
        });
        break;
      case "mc":
        setMemory(0);
        break;
      case "mr":
        append(formatCalc(memory));
        break;
      case "mplus":
        setMemory((m) => m + (error || expr ? parseFloat(result || "0") : parseFloat(result || "0")));
        break;
      case "mminus":
        setMemory((m) => m - parseFloat(result || "0"));
        break;
      case "eq": {
        if (!expr) return;
        try {
          const value = evaluateCalc(reduce(expr));
          const text = formatCalc(value);
          setResult(text);
          setHistory((h) => [...h.slice(-39), { expr, result: text }]);
          setExpr("");
          setError(false);
        } catch {
          setError(true);
          setResult("");
        }
        break;
      }
      default:
        break;
    }
  };

  const preview = useMemo(() => {
    const s = reduce(expr);
    if (!s) return null;
    try { return { ok: true as const, text: formatCalc(evaluateCalc(s)) }; }
    catch { return { ok: false as const, text: "" }; }
  }, [expr]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); press("eq"); return; }
      if (e.key === "Backspace") { e.preventDefault(); press("back"); return; }
      if (e.key === "Escape") { e.preventDefault(); press("clear"); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { press("append:" + e.key); return; }
      const map: Record<string, string> = { "+": "append:+", "-": "append:-", "*": "append:*", "/": "append:/", ".": "append:.", "%": "append:%", "^": "append:^", "(": "paren", ")": "paren" };
      const act = map[e.key];
      if (act) { press(act); return; }
      if (e.key.toLowerCase() === "p") { press("append:π"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, memory, result, error]);

  const visibleDisplay = error ? "Error" : expr || result;

  return (
    <div className="calc-surface" onClick={() => undefined}>
      <div className="calc-layout">
        <div className="calc-history">
          <span className="calc-history-title">HISTORY</span>
          {history.length === 0 ? <span className="calc-history-empty">Empty</span> : null}
          {history.slice().reverse().slice(0, 30).map((h, i) => (
            <button key={i} className="calc-history-item" onClick={() => { setExpr(h.expr); setResult("0"); }} title={t("calc.reuse")}>
              <span>{h.expr}</span>
              <em>{h.result}</em>
            </button>
          ))}
        </div>
        <div className="calc-main">
          <div className="calc-display">
            {memory !== 0 ? <span className="calc-mem">M</span> : null}
            <span className={`calc-result ${error ? "err" : ""}`}>{visibleDisplay}</span>
            {expr && !error ? (
              <span className={`calc-preview ${preview?.ok ? "" : "err"}`}>{preview?.ok ? `= ${preview.text}` : "…"}</span>
            ) : null}
          </div>
          <div className="calc-pad">
            {CALC_LAYOUT.map((btn) => (
              <button key={btn.action} className={`calc-btn ${btn.tone}`} onClick={() => press(btn.action)}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderWindowBody(id: AppId, settings: SystemSettings, updateSetting: (key: keyof SystemSettings, value: boolean | string) => void, faqOpen: number | null, setFaqOpen: (value: number | null) => void, lang: Lang, onLanguagePick: (language: Lang) => void, onPanic: () => void, onClose: (() => void) | null = null, onMinimize: (() => void) | null = null, onTrackChange: ((track: { name: string; artist: string; artwork: string } | null) => void) | null = null, translucent: boolean = false, onTranslucent: ((value: boolean) => void) | null = null, onApplyWallpaper: ((id: WallpaperId, target: "both" | "home" | "lock") => void) | null = null, appliedWallpaper: WallpaperId = "singularity", appliedLockWallpaper: WallpaperId = "singularity", onNotify: ((title: string, copy: string) => void) | null = null, wppInstalled: boolean = false, onInstallPicker: (() => void) | null = null) {
  if (id === "settings") return <SettingsSurface settings={settings} updateSetting={updateSetting} faqOpen={faqOpen} setFaqOpen={setFaqOpen} lang={lang} onLanguagePick={onLanguagePick} onPanic={onPanic} />;
  if (id === "terminal") return <div className="window-surface term-app-surface"><TerminalSurface installed={wppInstalled} onInstalled={onInstallPicker ?? (() => {})} /></div>;
  if (id === "translucenttb") return <div className="window-surface"><div className="surface-kicker">{t("surf.translucent.kicker")}</div><h2 className="surface-title">{t("surf.translucent.title")}</h2><p className="surface-copy">{t("surf.translucent.body")}</p><div className="settings-list"><SettingToggle label={t("surf.translucent.enable")} help={t("surf.translucent.help")} value={translucent} onChange={(value) => onTranslucent?.(value)} /></div></div>;
  if (id === "spicetify") return <CinefySurface onClose={onClose ?? (() => undefined)} onMinimize={onMinimize ?? (() => undefined)} onTrackChange={onTrackChange ?? (() => undefined)} />;
  if (id === "chronusgpt") return <ChronusGPTSurface onClose={onClose ?? (() => undefined)} />;
  const adRedir = settings.adblock && settings.adblockUrl.trim() ? settings.adblockUrl : null;
  if (id === "hub") return <iframe className="browser-frame" src={adRedir ?? "https://velara.cc/g"} title="Vertex-Hub / velara.cc" allow="autoplay; clipboard-write; camera; microphone; fullscreen" />;
  if (id === "wallpaper-engine") return <div className="window-surface we-app-surface"><WallEngineApp appliedHome={appliedWallpaper} appliedLock={appliedLockWallpaper} onApplyWallpaper={onApplyWallpaper ?? (() => {})} notify={onNotify ?? undefined} /></div>;
  if (id === "browser") return <iframe className="browser-frame" src={adRedir ?? "https://endis.rest/"} title="Browser / endis.rest" allow="autoplay; clipboard-write; camera; microphone; fullscreen" />;
  if (id === "calculator") return <div className="window-surface calc-app-surface"><CalculatorSurface /></div>;
  if (id === "pizza") return <iframe className="browser-frame" src={adRedir ?? "https://pizzaedition.com/"} title="Pizza edition" allow="autoplay; clipboard-write; camera; microphone; fullscreen" />;
  if (id === "roblox") return <iframe className="browser-frame" src={adRedir ?? "https://frogiesarcade.net/"} title="Roblox / frogies arcade" allow="autoplay; clipboard-write; camera; microphone; fullscreen" />;
  if (id === "messages") return <MessagesSurface />;
  if (id === "games") return <div className="window-surface ps5-app-surface"><Ps5EmulatorSurface /></div>;
  if (id === "minecraft") return <MinecraftLauncherSurface />;
  if (id === "rainmeter") return <RainmeterSurface />;
  return <div className="window-surface"><div className="surface-kicker">VERTEX</div><h2 className="surface-title">surface</h2></div>;
}

const EAGLER_SINGLE = "/eaglercraft/index.html";
const EAGLER_ARCHMC = "/eaglercraft/index.html?server=wss%3A%2F%2Fmc.arch.lol%2F";
const MODPACK_WASM = "/eaglercraft-modpack/index.html";
const EAGLER_112 = "/eaglercraft-1.12/index.html";
  const EAGLER_152 = "/eaglercraft-1.5/index.html";
const MC_STORE_ICON = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTKxNUnlY6yNmkSbNQvrCsC_ijNVTFl463i6SO8b5jCo9LsAvicsF9PqTKZ&s=10";
const MC_TRAILER = "https://cdn.eaglercraft.ru/Official_Minecraft_Trailer.webm";
const MC_LOGO_SVG = "https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/logos/Global-Header_MCCB-Logo_300x51.svg";
const MC_EAGTEK_ART = "https://store-images.s-microsoft.com/image/apps.29741.13774133678237924.b2fb64a6-d8b2-4e05-a188-b727d48563ed.f5bc1582-f67e-4ef4-8d8a-7aac86b324f9?w=562";

interface McInstall { id: number; name: string; version: "modpack" | "eagler112" | "eagler152"; variant: "ultimate-wasm" | "hd-sounds" | "release"; }

const MC_ARCH_REALM: McRealm = { name: "ArchMC", addr: "wss://mc.arch.lol/", verified: true, online: true, players: 731, votes: 0, tags: ["Multiplayer", "EaglercraftX"] };

function MinecraftLauncherSurface() {
  const [mode, setMode] = useState<"menu" | "eagler" | "archmc" | "modpack" | "eagler112" | "eagler152">("menu");
  const [modTitle, setModTitle] = useState("Modded");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<"play" | "installations" | "newinstall">("play");
  const [splash, setSplash] = useState(true);
  const [splashPct, setSplashPct] = useState(0);
  const [splashMsg, setSplashMsg] = useState(0);
  const [view, setView] = useState<"home" | "eagler" | "archmc">("home");
  const [trPlaying, setTrPlaying] = useState(true);
  const [trMuted, setTrMuted] = useState(true);
  const [installs, setInstalls] = useState<McInstall[]>(() => storage.read<McInstall[]>("vertex-mc-installs", []));
  const [installName, setInstallName] = useState("");
  const [installError, setInstallError] = useState(false);
  const [installVersion, setInstallVersion] = useState<"modpack" | "eagler112" | "eagler152">("modpack");
  const [serverName, setServerName] = useState("ArchMC");
  const [serverAddr, setServerAddr] = useState<string | null>(null);
  const [realmQuery, setRealmQuery] = useState("");
  const [recentRealms, setRecentRealms] = useState<McRealm[]>(() => storage.read<McRealm[]>("vertex-mc-recent", []));
  const trailerRef = useRef<HTMLVideoElement>(null);
  const gameFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const total = 2400 + Math.floor(Math.random() * 1601);
    const start = Date.now();
    const MSGS = ["minecraft.splash1", "minecraft.splash2", "minecraft.splash3", "minecraft.splash4"];
    const ticks = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setSplashPct(Math.min(100, Math.round((elapsed / total) * 100)));
      setSplashMsg(Math.floor(elapsed / 1500) % MSGS.length);
    }, 100);
    const done = window.setTimeout(() => setSplash(false), total);
    return () => { window.clearInterval(ticks); window.clearTimeout(done); };
  }, []);

  const realmsFiltered = useMemo(() => {
    const q = realmQuery.trim().toLowerCase();
    if (!q) return MC_REALMS;
    return MC_REALMS.filter((realm) => realm.name.toLowerCase().includes(q) || realm.addr.toLowerCase().includes(q) || realm.tags.some((tag) => tag.toLowerCase().includes(q)));
  }, [realmQuery]);

  const launchRealm = (realm: McRealm) => {
    const next = [{ ...realm }, ...recentRealms.filter((r) => r.addr !== realm.addr)].slice(0, 6);
    setRecentRealms(next);
    storage.write("vertex-mc-recent", next);
    setServerName(realm.name);
    setServerAddr(realm.addr);
    setLoading(true);
    setMode("archmc");
  };

  const saveInstalls = (next: McInstall[]) => {
    setInstalls(next);
    storage.write("vertex-mc-installs", next);
  };
  const createInstall = () => {
    const clean = installName.trim();
    if (!clean) { setInstallError(true); return; }
    saveInstalls([...installs, { id: Date.now(), name: clean, version: installVersion, variant: installVersion === "eagler112" ? "hd-sounds" : installVersion === "eagler152" ? "release" : "ultimate-wasm" }]);
    setInstallName("");
    setInstallError(false);
    setPage("installations");
  };

  const toggleTrailerPlay = () => {
    const video = trailerRef.current;
    if (!video) return;
    if (video.paused) { void video.play(); setTrPlaying(true); } else { video.pause(); setTrPlaying(false); }
  };
  const toggleTrailerMute = () => {
    const video = trailerRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setTrMuted(video.muted);
  };
  const toggleTrailerFullscreen = () => {
    const video = trailerRef.current;
    if (!video) return;
    if (document.fullscreenElement) { void document.exitFullscreen(); } else { void video.requestFullscreen?.(); }
  };
  const toggleGameFullscreen = () => {
    const el = gameFrameRef.current;
    if (!el) return;
    if (document.fullscreenElement) { void document.exitFullscreen(); } else { void el.requestFullscreen?.(); }
  };

  if (mode === "eagler" || mode === "archmc" || mode === "modpack" || mode === "eagler112" || mode === "eagler152") {
    const title = mode === "eagler" ? "Eaglercraft 1.8.8 — Singleplayer" : mode === "eagler112" ? t("minecraft.eagler112Edition") : mode === "eagler152" ? t("minecraft.eagler152Edition") : mode === "modpack" ? `${modTitle} — Eaglercraft 1.6.4` : `${serverName} — Eaglercraft 1.8`;
    const src = mode === "eagler" ? EAGLER_SINGLE : mode === "eagler112" ? EAGLER_112 : mode === "eagler152" ? EAGLER_152 : mode === "modpack" ? MODPACK_WASM : serverAddr ? `/eaglercraft/index.html?server=${encodeURIComponent(serverAddr)}` : EAGLER_ARCHMC;
    return <div className="window-surface we-app-surface" ref={gameFrameRef}><div className="mc-bar">
      <button className="mc-back" onClick={() => { setLoading(true); setMode("menu"); }}>{t("minecraft.back")}</button>
      <span>{title}</span>
      <button className="mc-fs-btn" onClick={toggleGameFullscreen} aria-label={t("minecraft.fullscreen")}><Maximize size={14} /></button>
    </div>
      {loading ? <div className="mc-loading">{t("minecraft.loading")}</div> : null}
      <iframe className="browser-frame" src={src} key={`${mode}-${serverAddr ?? "default"}`} title={title} allow="autoplay; clipboard-write; camera; microphone; fullscreen; cross-origin-isolated" onLoad={() => setLoading(false)} />
    </div>;
  }

  if (splash) {
    const SPLASH_MSGS = ["minecraft.splash1", "minecraft.splash2", "minecraft.splash3", "minecraft.splash4"];
    return <div className="window-surface mc-surface"><div className="mc-splash">
      <img className="mc-splash-icon" src={MC_ICON} alt="Minecraft" />
      <img className="mc-splash-logo" src={MC_LOGO_SVG} alt="Minecraft" />
      <div className="mc-splash-title">{t("minecraft.launcher")}</div>
      <div className="mc-splash-status">{t(SPLASH_MSGS[splashMsg])}</div>
      <div className="mc-splash-track"><div className="mc-splash-fill" style={{ width: `${splashPct}%` }} /></div>
      <span className="mc-splash-pct">{splashPct}%</span>
      <span className="mc-splash-ver">Minecraft Launcher {t("minecraft.splashVer")} · EaglercraftX 1.8.8</span>
    </div></div>;
  }

  return <div className="window-surface mc-surface">
    {view === "eagler" ? <div className="mc-topbar">
      <img className="mc-logo-svg" src={MC_LOGO_SVG} alt="Minecraft" />
      <nav className="mc-tabs">
        <button className={page === "play" ? "active" : ""} onClick={() => setPage("play")}>{t("minecraft.tabPlay")}</button>
        <button className={page === "installations" ? "active" : ""} onClick={() => setPage("installations")}>{t("minecraft.tabInstallations")}</button>
      </nav>
    </div> : null}
    <div className="mc-store">
      <div className="mc-store-body">
        {page === "play" ? <>
          <nav className="mc-nav">
            <button className={view === "home" ? "active" : ""} onClick={() => { setView("home"); setPage("play"); }}><House size={22} strokeWidth={1.8} className="mc-nav-icon" />{t("minecraft.home")}</button>
            <button className={view === "eagler" ? "active" : ""} onClick={() => setView("eagler")}><img className="mc-nav-icon" src={MC_STORE_ICON} alt="" /><span className="mc-edition-name"><em>{t("minecraft.brandLine")}</em><b>{t("minecraft.eaglerLine")}</b></span></button>
            <button className={view === "archmc" ? "active" : ""} onClick={() => { setView("archmc"); setPage("play"); }}><img className="mc-nav-icon" src={MC_STORE_ICON} alt="" /><span className="mc-edition-name"><em>{t("minecraft.brandLine")}</em><b>{t("minecraft.archLine")}</b></span></button>
          </nav>
          <div className="mc-pane">
            {view === "home" ? <div className="mc-pane-home">
              <div className="mc-trailer">
                <video ref={trailerRef} src={MC_TRAILER} autoPlay muted loop playsInline onClick={toggleTrailerPlay} onLoadedMetadata={() => setTrPlaying(!(trailerRef.current?.paused ?? true))} onPlaying={() => setTrPlaying(true)} onPlay={() => setTrPlaying(true)} onPause={() => setTrPlaying(false)} />
                <div className="mc-video-bar">
                  <button className="mc-video-btn" onClick={toggleTrailerPlay} aria-label={trPlaying ? "Pause trailer" : "Play trailer"}>{trPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
                  <button className="mc-video-btn" onClick={toggleTrailerMute} aria-label={trMuted ? "Unmute" : "Mute"}>{trMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
                  <span className="mc-video-spacer" />
                  <button className="mc-video-btn" onClick={toggleTrailerFullscreen} aria-label="Fullscreen"><Maximize size={14} /></button>
                </div>
              </div>
              <p className="mc-pane-copy">{t("minecraft.copy")}</p>
            </div> : null}
            {view === "eagler" ? <div className="mc-edition-pane art" style={{ backgroundImage: `url("${MC_EAGTEK_ART}")` }}>
              <h2 className="mc-edition-head"><em>{t("minecraft.brandLine")}</em><b>{t("minecraft.eaglerLine")}</b></h2>
              <button className="mc-play-btn" onClick={() => { setLoading(true); setMode("eagler"); }}><Play size={15} /> {t("minecraft.play")}</button>
            </div> : null}
            {view === "archmc" ? <div className="mc-archmc-wrap">
              <div className="mc-edition-pane art arch" style={{ backgroundImage: `url("${MC_EAGTEK_ART}")` }}>
                <h2 id="archmc-card-title" className="mc-edition-head"><em>{t("minecraft.brandLine")}</em><b className="archmc-title">{t("minecraft.archLine")}</b></h2>
                <button className="mc-play-btn" onClick={() => launchRealm(MC_ARCH_REALM)}><Play size={15} /> {t("minecraft.play")}</button>
              </div>
              <div className="mc-realms">
                <div className="mc-realms-head">
                  <h3>{t("minecraft.realms")}</h3>
                  <div className="mc-realm-search"><Search size={14} /><input placeholder={t("minecraft.searchRealms")} value={realmQuery} onChange={(event) => setRealmQuery(event.target.value)} /></div>
                </div>
                {recentRealms.length > 0 ? <div className="mc-recent-block">
                  <span className="mc-realms-label">{t("minecraft.recentRealms")}</span>
                  <div className="mc-realm-strip">{recentRealms.map((realm) => <RealmCard key={realm.addr} realm={realm} onPlay={() => launchRealm(realm)} />)}</div>
                </div> : <p className="mc-realms-hint">{t("minecraft.emptyRecent")}</p>}
                <span className="mc-realms-label">{t("minecraft.allRealms")}</span>
                {realmsFiltered.length === 0 ? <div className="mc-realms-empty"><Search size={22} /><span>{t("minecraft.noRealms")}</span></div> : <div className="mc-realm-grid">{realmsFiltered.map((realm) => <RealmCard key={realm.addr} realm={realm} onPlay={() => launchRealm(realm)} />)}</div>}
              </div>
            </div> : null}
          </div>
        </> : page === "installations" ? <div className="mc-installs">
          <div className="mc-install-header">
            <h3>{t("minecraft.installHeader")}</h3>
            <button className="mc-new-install-btn" onClick={() => { setInstallName(""); setInstallError(false); setPage("newinstall"); }}><Plus size={14} /> {t("minecraft.newInstall")}</button>
          </div>
          {installs.length === 0 ? <div className="mc-empty"><Package size={26} /><span>{t("minecraft.emptyInstalls")}</span></div> : <div className="mc-install-list">
            {installs.map((install) => <div className="mc-install-row" key={install.id}>
              <img className="mc-install-icon" src={MC_STORE_ICON} alt="" />
              <div className="mc-install-meta"><strong>{install.name}</strong><span>{install.version === "eagler112" ? t("minecraft.v112Version") : install.version === "eagler152" ? t("minecraft.v152Version") : t("minecraft.modpackVersion")} · {install.version === "eagler112" ? t("minecraft.variantHdSounds") : install.version === "eagler152" ? t("minecraft.variantRelease") : t("minecraft.variantUltimate")}</span></div>
              <button className="mc-row-play" onClick={() => { if (install.version === "eagler112") { setLoading(true); setMode("eagler112"); } else if (install.version === "eagler152") { setLoading(true); setMode("eagler152"); } else { setModTitle(install.name); setLoading(true); setMode("modpack"); } }}><Play size={13} /> {t("minecraft.play")}</button>
            </div>)}
          </div>}
        </div> : <div className="mc-new-install">
          <h3>{t("minecraft.newInstall")}</h3>
          <div className="mc-field">
            <label>{t("minecraft.installName")}</label>
            <input className={installError ? "mc-input error" : "mc-input"} placeholder={t("minecraft.installNamePh")} value={installName} onChange={(event) => { setInstallName(event.target.value); if (installError && event.target.value.trim()) setInstallError(false); }} />
            {installError ? <span className="mc-field-error">{t("minecraft.nameRequired")}</span> : null}
          </div>
          <div className="mc-field">
            <label>{t("minecraft.installVersion")}</label>
            <select className="mc-select" value={installVersion} onChange={(event) => setInstallVersion(event.target.value as "modpack" | "eagler112" | "eagler152")}>
              <option value="modpack">{t("minecraft.modpackVersion")}</option>
              <option value="eagler112">{t("minecraft.v112Version")}</option>
              <option value="eagler152">{t("minecraft.v152Version")}</option>
            </select>
          </div>
          <div className="mc-field">
            <label>{t("minecraft.modpackVariant")}</label>
            <select className="mc-select"><option>{installVersion === "eagler112" ? t("minecraft.variantHdSounds") : installVersion === "eagler152" ? t("minecraft.variantRelease") : t("minecraft.variantUltimate")}</option></select>
          </div>
          <div className="mc-form-actions">
            <button className="mc-cancel-btn" onClick={() => setPage("installations")}>{t("minecraft.cancel")}</button>
            <button className="mc-create-btn" onClick={() => createInstall()}>{t("minecraft.create")}</button>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

function RealmCard({ realm, onPlay }: { realm: McRealm; onPlay: () => void }) {
  const initial = realm.name.trim().charAt(0).toUpperCase() || "#";
  return <div className="mc-realm-card">
    <div className="mc-realm-icon">{initial}</div>
    <div className="mc-realm-info">
      <strong className="mc-realm-name">{realm.verified ? <BadgeCheck size={12} className="mc-realm-check" aria-label="Verified" /> : null}{realm.name}</strong>
      <span className="mc-realm-addr">{realm.addr}</span>
      <div className="mc-realm-tags">{realm.tags.slice(0, 4).map((tag) => <span className="mc-realm-chip" key={tag}>{tag}</span>)}</div>
    </div>
    <div className="mc-realm-side">
      <span className="mc-realm-meta"><span className={`mc-realm-dot ${realm.online ? "on" : "off"}`} />{realm.players > 0 ? `${realm.players} ${t("minecraft.online")}` : t("minecraft." + (realm.online ? "empty" : "offline"))}</span>
      <button className="mc-row-play" onClick={onPlay}><Play size={13} /> {t("minecraft.play")}</button>
    </div>
  </div>;
}

type RainmeterPosition = "center" | "top" | "top-left" | "top-right" | "middle-left" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right" | "free";
type RainmeterDateStyle = "mond" | "dot" | "long" | "short";
type RainmeterSkin = "mond" | "summit" | "default";
type RainmeterSettings = {
  showClock: boolean;
  draggable: boolean;
  position: RainmeterPosition;
  marginH: number;
  marginV: number;
  scale: number;
  format24: boolean;
  dateFormat: RainmeterDateStyle;
  showSeconds: boolean;
  skin: RainmeterSkin;
  color: string;
  accent: string;
  posX: number;
  posY: number;
  darkThreshold: number;
  lightThreshold: number;
  autoTextColor: boolean;
  centerRegionPct: number;
};
const DEFAULT_RAINMETER: RainmeterSettings = {
  showClock: true,
  draggable: true,
  position: "center",
  marginH: 0,
  marginV: 0,
  scale: 1,
  format24: true,
  dateFormat: "mond",
  showSeconds: false,
  skin: "mond",
  color: "#f4f7fb",
  accent: "#fa7e00",
  posX: 50,
  posY: 42,
  darkThreshold: 35,
  lightThreshold: 70,
  autoTextColor: false,
  centerRegionPct: 30,
};
const RM_DATE_STYLES: RainmeterDateStyle[] = ["mond", "dot", "long", "short"];
const RM_SKINS: RainmeterSkin[] = ["mond", "summit", "default"];
const RM_POSITIONS: { value: RainmeterPosition; label: string }[] = [
  { value: "center", label: "Center" },
  { value: "top", label: "Top center" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "middle-left", label: "Middle left" },
  { value: "middle-right", label: "Middle right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

function RainmeterSurface() {
  const [cfg, setCfg] = useState<RainmeterSettings>(() => ({ ...DEFAULT_RAINMETER, ...storage.read<Partial<RainmeterSettings>>("rainmeter-config", {}) }));
  const [settingsTab, setSettingsTab] = useState<"general" | "appearance">("general");

  const save = (next: RainmeterSettings) => { setCfg(next); storage.write("rainmeter-config", next); window.dispatchEvent(new CustomEvent("rainmeter-config-updated")); };
  const set = <K extends keyof RainmeterSettings>(key: K, value: RainmeterSettings[K]) => save({ ...cfg, [key]: value });

  return <div className="window-surface rainmeter-surface">
    <div className="rainmeter-modal rainmeter-modal-full">
      <div className="rainmeter-modal-head">
        <div><span className="rainmeter-modal-kicker">RAINMETER</span><h2>Settings</h2></div>
      </div>
      <nav className="rainmeter-tabs">
        <button className={settingsTab === "general" ? "active" : ""} onClick={() => setSettingsTab("general")}><LayoutGrid size={14} /> General</button>
        <button className={settingsTab === "appearance" ? "active" : ""} onClick={() => setSettingsTab("appearance")}><Palette size={14} /> Appearance</button>
      </nav>
      <div className="rainmeter-modal-body">
        {settingsTab === "general" ? <>
          <div className="setting-group"><Cpu size={13} /> Widget</div>
          <SettingToggle label="Mond Clock" help="Show / hide the clock widget on this screen" value={cfg.showClock} onChange={(value) => set("showClock", value)} />
          <SettingToggle label="Draggable" help="Move the clock by dragging it around" value={cfg.draggable} onChange={(value) => set("draggable", value)} />
          <div className="setting-group"><LayoutGrid size={13} /> Layout</div>
          <div className="setting-row"><div><strong>Position</strong><small>Anchor point of the widget</small></div><select className="setting-select" value={cfg.position} onChange={(event) => set("position", event.target.value as RainmeterPosition)} aria-label="Position">{RM_POSITIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="setting-row"><div><strong>Horizontal margin</strong><small>Shifts the widget sideways (px)</small></div><input className="rainmeter-numeric" type="number" min={-500} max={500} value={cfg.marginH} onChange={(event) => set("marginH", Number(event.target.value))} aria-label="Horizontal margin" /></div>
          <div className="setting-row"><div><strong>Vertical margin</strong><small>Shifts the widget up / down (px)</small></div><input className="rainmeter-numeric" type="number" min={-500} max={500} value={cfg.marginV} onChange={(event) => set("marginV", Number(event.target.value))} aria-label="Vertical margin" /></div>
          <div className="setting-row setting-stack"><div><strong>Scale</strong><small>{`${Math.round(cfg.scale * 100)}%`} — size multiplier</small></div><input className="rainmeter-range" type="range" min={0.5} max={2} step={0.01} value={cfg.scale} onChange={(event) => set("scale", Number(event.target.value))} aria-label="Scale" /></div>
          <div className="setting-group"><CalendarClock size={13} /> Time &amp; Date</div>
          <SettingToggle label="24-hour format" help="Show 00–23 hours instead of AM / PM" value={cfg.format24} onChange={(value) => set("format24", value)} />
          <div className="setting-row"><div><strong>Date format</strong><small>How the date line is written</small></div><select className="setting-select" value={cfg.dateFormat} onChange={(event) => set("dateFormat", event.target.value as RainmeterDateStyle)} aria-label="Date format"><option value="mond">DD  Month,  YYYY.</option><option value="dot">DD.MM.YYYY</option><option value="long">DD Month, YYYY.</option><option value="short">DD Month</option></select></div>
          <SettingToggle label="Show seconds" help="Append live seconds to the time" value={cfg.showSeconds} onChange={(value) => set("showSeconds", value)} />
        </> : <>
          <div className="setting-group"><Palette size={13} /> Style</div>
          <p className="surface-copy">Pick the skin that shapes the clock layout.</p>
          <div className="rainmeter-style-grid">
            {(["mond", "summit", "default"] as const).map((skin) => <button key={skin} className={`rainmeter-style-card ${cfg.skin === skin ? "active" : ""}`} onClick={() => set("skin", skin)} aria-label={skin}>
              <span className={`rainmeter-style-preview rm-prev-${skin}`}><span className="rmp-day">Friday</span><span className="rmp-time">17:45</span>{skin !== "default" ? <span className="rmp-brand">{skin.toUpperCase()}</span> : null}</span>
              <strong className="rainmeter-style-name">{skin === "mond" ? "Mond" : skin === "summit" ? "Summit" : "Default"}</strong>
              <span className="rainmeter-style-desc">{skin === "mond" ? "Two-tone featured clock" : skin === "summit" ? "Minimal & thin" : "Plain classic clock"}</span>
            </button>)}
          </div>
          <div className="setting-group"><Palette size={13} /> Colors</div>
          <div className="setting-row setting-stack"><div><strong>Text color</strong><small>Color of the clock text</small></div><input className="rainmeter-color" type="color" value={cfg.color} onChange={(event) => set("color", event.target.value)} aria-label="Text color" /></div>
          <div className="setting-row setting-stack"><div><strong>Accent color</strong><small>Highlight color (Default bar, etc.)</small></div><input className="rainmeter-color" type="color" value={cfg.accent} onChange={(event) => set("accent", event.target.value)} aria-label="Accent color" /></div>
          <div className="setting-group"><Contrast size={13} /> Luminance Thresholds</div>
          <p className="surface-copy">The wallpaper center luminance limits used by the automatic text color.</p>
          <div className="setting-row setting-stack"><div><strong>Dark threshold</strong><small>{`${cfg.darkThreshold}%`} — below this, text turns light</small></div><div className="rm-input-pair"><input className="rainmeter-range" type="range" min={0} max={100} step={1} value={cfg.darkThreshold} onChange={(event) => set("darkThreshold", Number(event.target.value))} aria-label="Dark threshold slider" /><input className="rainmeter-numeric" type="number" min={0} max={100} step={1} value={cfg.darkThreshold} onChange={(event) => set("darkThreshold", Math.min(100, Math.max(0, Number(event.target.value) || 0)))} aria-label="Dark threshold (type a number)" /></div></div>
          <div className="setting-row setting-stack"><div><strong>Light threshold</strong><small>{`${cfg.lightThreshold}%`} — above this, text turns dark</small></div><div className="rm-input-pair"><input className="rainmeter-range" type="range" min={0} max={100} step={1} value={cfg.lightThreshold} onChange={(event) => set("lightThreshold", Number(event.target.value))} aria-label="Light threshold slider" /><input className="rainmeter-numeric" type="number" min={0} max={100} step={1} value={cfg.lightThreshold} onChange={(event) => set("lightThreshold", Math.min(100, Math.max(0, Number(event.target.value) || 0)))} aria-label="Light threshold (type a number)" /></div></div>
          <div className="setting-group"><Sparkles size={13} /> Automatic color</div>
          <SettingToggle label="Automatic text color" help="Rainmeter analyzes the center of the current wallpaper" value={cfg.autoTextColor} onChange={(value) => set("autoTextColor", value)} />
          <div className="setting-row setting-stack"><div><strong>Center region %</strong><small>{`${cfg.centerRegionPct}%`} — percentage of the wallpaper width &amp; height analyzed around the center</small></div><div className="rm-input-pair"><input className="rainmeter-range" type="range" min={5} max={100} step={1} value={cfg.centerRegionPct} onChange={(event) => set("centerRegionPct", Number(event.target.value))} aria-label="Center region percent slider" /><input className="rainmeter-numeric" type="number" min={5} max={100} step={1} value={cfg.centerRegionPct} onChange={(event) => set("centerRegionPct", Math.min(100, Math.max(5, Number(event.target.value) || 5)))} aria-label="Center region percent (type a number)" /></div></div>
        </>}
      </div>
    </div>
  </div>;
}

function SettingsSurface({ settings, updateSetting, faqOpen, setFaqOpen, lang, onLanguagePick, onPanic }: {
  settings: SystemSettings;
  updateSetting: (key: keyof SystemSettings, value: boolean | string) => void;
  faqOpen: number | null;
  setFaqOpen: (value: number | null) => void;
  lang: Lang;
  onLanguagePick: (language: Lang) => void;
  onPanic: () => void;
}) {
  const faqs = [
    [t("set.faq1q"), t("set.faq1a")],
    [t("set.faq2q"), t("set.faq2a")],
  ];
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [blankNotice, setBlankNotice] = useState<string | null>(null);
  const hasPassword = Boolean(storage.read<string>(PASSWORD_KEY, ""));
  const openBlankTab = () => {
    const cloak = settings.cloak === "custom"
      ? { title: settings.cloakName || CLOAKS.none.title, icon: settings.cloakIcon || CLOAKS.none.icon }
      : (CLOAKS[settings.cloak] ?? CLOAKS.none);
    const title = String(cloak.title).replace(/["\\]/g, "");
    const icon = String(cloak.icon).replace(/["\\]/g, "");
    const src = encodeURI(location.href);
    const win = window.open("about:blank", "_blank");
    if (!win) { setBlankNotice("Popup blocked — allow popups for this site, then try again."); return; }
    setBlankNotice(null);
    const doc = win.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><link rel="icon" href="${icon}"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{display:block;width:100vw;height:100vh;border:0}</style></head><body><iframe src="${src}" allow="autoplay; clipboard-write; camera; microphone; fullscreen"></iframe></body></html>`);
    doc.close();
    win.focus();
  };
  return <div className="window-surface"><div className="surface-kicker">{t("set.kicker")}</div><h2 className="surface-title">{t("set.title")}</h2><p className="surface-copy">{t("set.copy")}</p><div className="settings-list">
    <div className="setting-group"><Cpu size={13} /> {t("set.groupPerf")}</div>
    <SettingToggle label={t("set.optLabel")} help={t("set.optHelp")} value={settings.optimized} onChange={(value) => updateSetting("optimized", value)} />
    <SettingToggle label={t("set.fastBootLabel")} help={t("set.fastBootHelp")} value={settings.fastBoot} onChange={(value) => updateSetting("fastBoot", value)} />
    <SettingToggle label={t("set.idleLabel")} help={t("set.idleHelp")} value={settings.idleLock} onChange={(value) => updateSetting("idleLock", value)} />
    <SettingToggle label={t("set.confirmLabel")} help={t("set.confirmHelp")} value={settings.confirm} onChange={(value) => updateSetting("confirm", value)} />
    <div className="setting-group"><LockKeyhole size={13} /> {t("set.groupSecurity")}</div>
    <div className="setting-row setting-stack"><div><strong>{t("set.passwordLabel")}</strong><small>{t("set.passwordHelp")}</small></div><input className="setting-input" type="password" placeholder={t("set.passwordPlaceholder")} value={passwordDraft} onChange={(event) => { setPasswordDraft(event.target.value); setPasswordSaved(false); }} aria-label={t("set.passwordLabel")} /></div>
    <div className="setting-action-row"><button className="outline-button" onClick={() => { storage.write(PASSWORD_KEY, passwordDraft.trim()); setPasswordSaved(true); setPasswordDraft(""); }}>{t("set.passwordSave")}</button><span>{passwordSaved ? t("set.passwordSaved") : (hasPassword ? t("set.passwordSet") : t("set.passwordNone"))}</span></div>
     <div className="setting-row"><div><strong>{t("set.appLangLabel")}</strong><small>{t("set.appLangHelp")}</small></div><select className="setting-select" value={lang} onChange={(event) => onLanguagePick(event.target.value as Lang)} aria-label={t("set.appLangLabel")}>{LANGS.map((option) => <option key={option.code} value={option.code}>{option.native}</option>)}</select></div>
     {lang !== LANG && <div className="setting-action-row"><button className="outline-button" onClick={() => location.reload()}>{t("set.reload")}</button><span>{t("set.restartNote")}</span></div>}
    <div className="setting-group"><LockKeyhole size={13} /> {t("set.groupCloak")}</div>
    <div className="setting-row"><div><strong>{t("set.cloakLabel")}</strong><small>{t("set.cloakHelp")}</small></div><select className="setting-select" value={settings.cloak} onChange={(event) => updateSetting("cloak", event.target.value)} aria-label={t("set.cloakLabel")}><option value="none">{t("set.cloakNone")}</option><option value="google">{t("set.cloakGoogle")}</option><option value="classroom">{t("set.cloakClassroom")}</option><option value="custom">{t("set.cloakCustom")}</option></select></div>
    {settings.cloak === "custom" && <div className="setting-row setting-stack"><div><strong>{t("set.customNameLabel")}</strong><small>{t("set.cloakHelp")}</small></div><input className="setting-input" value={settings.cloakName} placeholder="Vertex-OS" onChange={(event) => updateSetting("cloakName", event.target.value)} aria-label={t("set.customNameLabel")} /></div>}
    {settings.cloak === "custom" && <div className="setting-row setting-stack"><div><strong>{t("set.customIconLabel")}</strong><small>{t("set.cloakHelp")}</small></div><input className="setting-input setting-url" type="text" value={settings.cloakIcon} placeholder="https://example.com/logo.png" onChange={(event) => updateSetting("cloakIcon", event.target.value)} aria-label={t("set.customIconLabel")} /></div>}
    <div className="setting-action-row"><button className="outline-button" onClick={openBlankTab}>Open in about:blank</button><span>Runs the OS in a new tab — the URL bar shows only <b>about:blank</b>. Close the original tab after.</span></div>
    {blankNotice && <p className="term-error">{blankNotice}</p>}
    <div className="setting-group"><MonitorCog size={13} /> {t("set.groupShortcut")}</div>
     <div className="setting-row"><div><strong>{t("set.panicKeyLabel")}</strong><small>{t("set.panicKeyHelp")}</small></div><input className="setting-input" value={settings.panicKey} maxLength={1} onChange={(event) => updateSetting("panicKey", event.target.value)} aria-label={t("set.panicKeyLabel")} /></div>
     <div className="setting-row setting-stack"><div><strong>{t("set.panicSiteLabel")}</strong><small>{t("set.panicSiteHelp")}</small></div><input className="setting-input setting-url" type="url" value={settings.panicUrl} placeholder="https://classroom.google.com/" onChange={(event) => updateSetting("panicUrl", event.target.value)} aria-label={t("set.panicSiteLabel")} /></div>
     <div className="setting-action-row"><button className="outline-button" onClick={onPanic}>{t("set.testPanic")}</button><span>{t("set.opensHere")}</span></div>
    <div className="setting-group"><ShieldBan size={13} /> {t("set.groupAdblock")}</div>
    <SettingToggle label={t("set.adblockLabel")} help={t("set.adblockHelp")} value={settings.adblock} onChange={(value) => updateSetting("adblock", value)} />
    {settings.adblock && <div className="setting-row setting-stack"><div><strong>{t("set.adblockTargetLabel")}</strong><small>{t("set.adblockTargetHelp")}</small></div><input className="setting-input setting-url" type="url" value={settings.adblockUrl} placeholder="https://hideout-now.lovable.app/" onChange={(event) => updateSetting("adblockUrl", event.target.value)} aria-label={t("set.adblockTargetLabel")} /></div>}
    <button className="setting-row" onClick={() => setFaqOpen(faqOpen === 0 ? null : 0)}><div><strong><CircleHelp size={14} /> {t("set.faqButton")}</strong><small>{t("set.faqHelp")}</small></div><ChevronDown size={16} /></button>
    {faqOpen !== null && <div className="faq-list">{faqs.map(([question, answer], index) => <div className="faq-item" key={question}><button onClick={() => setFaqOpen(faqOpen === index ? null : index)}>{question}<ChevronDown size={15} /></button>{faqOpen === index && <div className="faq-answer">{answer}</div>}</div>)}</div>}
  </div></div>;
}

function CinefySurface({ onClose, onMinimize, onTrackChange }: { onClose: () => void; onMinimize: () => void; onTrackChange: (track: { name: string; artist: string; artwork: string } | null) => void }) {
  const [tab, setTab] = useState<SpicetifyTab>("home");
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tracks, setTracks] = useState<CinefyTrack[]>([]);
  const [homeTracks, setHomeTracks] = useState<CinefyTrack[]>([]);
  const [selected, setSelected] = useState<CinefyTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState(0.82);
  const [favorites, setFavorites] = useState<number[]>(() => storage.read("cinefy-favorites", []));
  const [trackCache, setTrackCache] = useState<TrackCache>(() => storage.read("cinefy-track-cache", {}));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => storage.read("cinefy-playlists", []));
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [notif, setNotif] = useState<{ track: CinefyTrack } | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsSynced, setLyricsSynced] = useState(false);
  const [lyricsFull, setLyricsFull] = useState(false);
  const [lyricOffset, setLyricOffset] = useState(0);
  const lyricsListRef = useRef<HTMLDivElement | null>(null);
  const lyricLineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const userScrollRef = useRef(false);
  const userScrollTimer = useRef(0);
  const [addMenuFor, setAddMenuFor] = useState<number | null>(null);
  const [installed, setInstalled] = useState<string[]>(() => storage.read("cinefy-market-installs", []));
  const [hazy, setHazy] = useState<HazyConfig>(() => ({ ...DEFAULT_HAZY, ...storage.read("cinefy-hazy-config", {}) }));
  const [hazyDraft, setHazyDraft] = useState<HazyConfig>(() => ({ ...DEFAULT_HAZY, ...storage.read("cinefy-hazy-config", {}) }));
  const [marketQuery, setMarketQuery] = useState("");
  const [marketCategory, setMarketCategory] = useState<MarketCategory>("themes");
  const [activeTheme, setActiveTheme] = useState<"default" | "hazy" | "starry-nights">(() => storage.read("cinefy-active-theme", "default"));
  const [splash, setSplash] = useState(true);
  const [splashPhase, setSplashPhase] = useState<"reveal" | "loading" | "done">("reveal");
  const [splashProgress, setSplashProgress] = useState(0);
  const [splashLine, setSplashLine] = useState(0);
  const splashLoadMs = useRef(5500 + Math.random() * 3500);
  const starField = useMemo(() => {
    const area = typeof window !== "undefined" ? window.innerWidth * window.innerHeight : 1400 * 860;
    const count = Math.max(120, Math.min(320, Math.round(area / 4000)));
    return Array.from({ length: count }, () => ({
      left: Math.random() * 98,
      top: Math.random() * 98,
      size: Math.random() < 0.5 ? 1 : 2,
      opacity: 0.5 + Math.random() * 0.5,
      twinkle: Math.floor(Math.random() * 4) + 1,
      delay: Math.random() * 5,
    }));
  }, []);
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifTimer = useRef<number>(0);

  const hazyActive = activeTheme === "hazy" && hazy.enabled && installed.includes("hazy-astromations");
  const starryActive = activeTheme === "starry-nights" && installed.includes("starry-nights");
  const blyActive = installed.includes("beautiful-lyrics");
  const sonicActive = installed.includes("sonic-dancing");
  const hazyFeature = MARKETPLACE_ITEMS[0];
  const installedItems = useMemo(() => MARKETPLACE_ITEMS.filter((item) => installed.includes(item.id)), [installed]);
  const marketList = useMemo(() => {
    const inCategory = MARKETPLACE_ITEMS.filter((item) => item.category === marketCategory);
    const q = marketQuery.trim().toLowerCase();
    if (!q) return inCategory;
    return inCategory.filter((item) => item.name.toLowerCase().includes(q) || item.by.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q));
  }, [marketCategory, marketQuery]);

  function isThemeActive(id: string) {
    return (id === "hazy-astromations" && activeTheme === "hazy") || (id === "starry-nights" && activeTheme === "starry-nights");
  }

  function applyTheme(id: string) {
    const next = id === "starry-nights" ? "starry-nights" : "hazy";
    setActiveTheme(next);
    storage.write("cinefy-active-theme", next);
  }

  function useDefaultTheme() {
    setActiveTheme("default");
    storage.write("cinefy-active-theme", "default");
  }

  function updateHazyDraft(patch: Partial<HazyConfig>) {
    setHazyDraft((current) => ({ ...current, ...patch }));
  }

  function applyHazy() {
    setHazy(hazyDraft);
    storage.write("cinefy-hazy-config", hazyDraft);
    setActiveTheme("hazy");
    storage.write("cinefy-active-theme", "hazy");
  }

  function resetHazy() {
    const next = { ...DEFAULT_HAZY };
    setHazyDraft(next);
    setHazy(next);
    storage.write("cinefy-hazy-config", next);
  }

  function toggleInstalled(id: string) {
    if (installed.includes(id) && isThemeActive(id)) useDefaultTheme();
    setInstalled((current) => {
      const has = current.includes(id);
      const next = has ? current.filter((item) => item !== id) : [...current, id];
      storage.write("cinefy-market-installs", next);
      return next;
    });
  }

  function cacheTracks(list: CinefyTrack[]) {
    setTrackCache((prev) => {
      const next = { ...prev };
      for (const t of list) next[t.trackId] = t;
      storage.write("cinefy-track-cache", next);
      return next;
    });
  }

  async function searchTracks(term: string) {
    const cleanTerm = term.trim();
    if (!cleanTerm) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ term: cleanTerm, media: "music", entity: "song", limit: "30" });
      const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
      if (!response.ok) throw new Error("Music search unavailable");
      const data = await response.json() as { results?: Partial<CinefyTrack>[] };
      const nextTracks = (data.results ?? []).filter((track): track is CinefyTrack => Boolean(
        track.trackId && track.trackName && track.artistName && track.previewUrl && track.artworkUrl100,
      ));
      setTracks(nextTracks);
      cacheTracks(nextTracks);
      if (!nextTracks.length) setError(t("sp.noResults"));
    } catch {
      setError(t("sp.relayError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadHome() {
      try {
        const params = new URLSearchParams({ term: "top hits 2025", media: "music", entity: "song", limit: "20" });
        const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
        const data = await response.json() as { results?: Partial<CinefyTrack>[] };
        const list = (data.results ?? []).filter((t): t is CinefyTrack => Boolean(t.trackId && t.trackName && t.artistName && t.previewUrl && t.artworkUrl100));
        setHomeTracks(list);
        cacheTracks(list);
      } catch { /* home silently fails */ }
    }
    void loadHome();
  }, []);

  useEffect(() => {
    if (addMenuFor === null) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-add-menu]") || target.closest("[data-add-toggle]")) return;
      setAddMenuFor(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addMenuFor]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    if (selected && audio.dataset.trackId !== String(selected.trackId)) {
      audio.dataset.trackId = String(selected.trackId);
      audio.src = selected.previewUrl || "";
      audio.currentTime = 0;
      setProgress(0);
      setDuration(0);
      audio.load();
    }
    if (playing) {
      void audio.play().catch(() => {
        if (audio.paused) setPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [selected, playing, volume]);

  useEffect(() => {
    if (!selected) { setLyrics([]); setLyricsFull(false); return; }
    let cancelled = false;
    const artist = selected.artistName;
    const title = selected.trackName;
    async function loadLyrics() {
      try {
        const response = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
        if (response.ok) {
          const data = await response.json() as { syncedLyrics?: string };
          if (data.syncedLyrics) {
            const parsed = parseLrc(data.syncedLyrics);
            if (parsed.length && !cancelled) { setLyrics(parsed); setLyricsSynced(true); return; }
          }
        }
      } catch { /* fall through to plain lyrics */ }
      try {
        const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
        if (!response.ok) throw new Error("Lyrics unavailable");
        const data = await response.json() as { lyrics?: string };
        const lines = (data.lyrics ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (!cancelled) { setLyrics(estimateLyricTimes(lines.length ? lines : previewLyrics(artist, title), 30)); setLyricsSynced(false); }
      } catch {
        if (!cancelled) { setLyrics(estimateLyricTimes(previewLyrics(artist, title), 30)); setLyricsSynced(false); }
      }
    }
    void loadLyrics();
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const saved = Number(window.localStorage.getItem(`vine-lyric-offset:${selected.trackId}`) ?? 0);
    setLyricOffset(Number.isFinite(saved) ? saved : 0);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    window.localStorage.setItem(`vine-lyric-offset:${selected.trackId}`, String(lyricOffset));
  }, [lyricOffset, selected]);

  const lyricIndex = useMemo(() => {
    if (!lyrics.length) return -1;
    let index = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time - lyricOffset <= progress) index = i;
    }
    return index;
  }, [progress, lyrics, lyricOffset]);

  const lineProgress = useMemo(() => {
    if (lyricIndex < 0 || lyricIndex >= lyrics.length) return 0;
    const start = lyrics[lyricIndex].time - lyricOffset;
    const end = lyricIndex + 1 < lyrics.length ? lyrics[lyricIndex + 1].time - lyricOffset : (duration > 0 ? duration : start + 8);
    const span = Math.max(0.5, end - start);
    return Math.max(0, Math.min(1, (progress - start) / span));
  }, [progress, lyricIndex, lyrics, duration, lyricOffset]);

  useEffect(() => {
    if (lyricsFull) return;
    if (userScrollRef.current) return;
    const el = lyricLineRefs.current[lyricIndex];
    if (el && lyricsListRef.current) lyricsListRef.current.scrollTo({ top: Math.max(0, el.offsetTop - 140), behavior: "smooth" });
  }, [lyricIndex, lyricsFull]);

  function markUserScroll() {
    userScrollRef.current = true;
    window.clearTimeout(userScrollTimer.current);
    userScrollTimer.current = window.setTimeout(() => { userScrollRef.current = false; }, 2500);
  }

  useEffect(() => () => window.clearTimeout(userScrollTimer.current), []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) setProgress(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function previewLyrics(artist: string, title: string): string[] {
    const words = title.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
    const theme = words || "this one";
    return [
      "I remember how it starts,",
      "soft and slow, right from the top.",
      `We carry "${theme}" in our hearts,`,
      "turn it up and let it drop.",
      "",
      "Ooh, we don't need to overthink it,",
      "let the rhythm pull you through.",
      `Sing it loud, the way you think it,`,
      "every note belongs to you.",
      "",
      `${theme} — one more time,`,
      "seconds left before the end,",
      "then we'll press it and rewind,",
      "hear it play all over again.",
    ];
  }

  useEffect(() => {
    if (!splash) return;
    if (splashPhase === "reveal") {
      const reveal = window.setTimeout(() => setSplashPhase("loading"), 1500);
      return () => window.clearTimeout(reveal);
    }
    if (splashPhase === "loading") {
      const lineTimer = window.setInterval(() => setSplashLine((l) => (l + 1) % SPLASH_LINES.length), 850);
      const bar = window.setInterval(() => setSplashProgress((p) => {
        const next = p + (50 / splashLoadMs.current) * 100;
        if (next >= 100) { window.clearInterval(bar); window.clearInterval(lineTimer); return 100; }
        return next;
      }), 50);
      return () => { window.clearInterval(bar); window.clearInterval(lineTimer); };
    }
    if (splashPhase === "done") {
      const done = window.setTimeout(() => setSplash(false), 700);
      return () => window.clearTimeout(done);
    }
    return undefined;
  }, [splash, splashPhase]);

  useEffect(() => {
    if (splash && splashPhase === "loading" && splashProgress >= 100) setSplashPhase("done");
  }, [splash, splashPhase, splashProgress]);

  function showNotification(track: CinefyTrack) {
    window.clearTimeout(notifTimer.current);
    setNotif({ track });
    notifTimer.current = window.setTimeout(() => setNotif(null), 5000);
  }

  function selectTrack(track: CinefyTrack) {
    if (selected?.trackId === track.trackId) {
      setPlaying(true);
      const audio = audioRef.current;
      if (audio) {
        audio.dataset.trackId = "";
        audio.currentTime = 0;
        setProgress(0);
        void audio.play().catch(() => setPlaying(false));
      }
      setTab("nowplaying");
      return;
    }
    setSelected(track);
    setPlaying(true);
    setTab("nowplaying");
    onTrackChange({ name: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 });
    showNotification(track);
  }

  function stepTrack(direction: 1 | -1) {
    const list = tab === "liked" ? getLikedTracks() : tab === "playlist" ? getPlaylistTracks() : tracks.length ? tracks : homeTracks;
    if (!list.length || !selected) return;
    const idx = list.findIndex((t) => t.trackId === selected.trackId);
    const next = (idx + direction + list.length) % list.length;
    selectTrack(list[next]);
  }

  function toggleFavorite(track: CinefyTrack) {
    setFavorites((current) => {
      const next = current.includes(track.trackId) ? current.filter((id) => id !== track.trackId) : [...current, track.trackId];
      storage.write("cinefy-favorites", next);
      return next;
    });
  }

  function getLikedTracks(): CinefyTrack[] {
    return favorites.map((id) => trackCache[id]).filter((t): t is CinefyTrack => Boolean(t));
  }

  function getPlaylistTracks(): CinefyTrack[] {
    const pl = playlists.find((p) => p.id === activePlaylistId);
    if (!pl) return [];
    return pl.trackIds.map((id) => trackCache[id]).filter((t): t is CinefyTrack => Boolean(t));
  }

  function addToPlaylist(playlistId: number, track: CinefyTrack) {
    setPlaylists((current) => {
      const next = current.map((p) => p.id === playlistId && !p.trackIds.includes(track.trackId) ? { ...p, trackIds: [...p.trackIds, track.trackId] } : p);
      storage.write("cinefy-playlists", next);
      return next;
    });
  }

  function removeFromPlaylist(playlistId: number, trackId: number) {
    setPlaylists((current) => {
      const next = current.map((p) => p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) } : p);
      storage.write("cinefy-playlists", next);
      return next;
    });
  }

  function createPlaylist() {
    if (!newPlaylistName.trim()) return;
    const id = Date.now();
    const next = [...playlists, { id, name: newPlaylistName.trim(), trackIds: [] }];
    setPlaylists(next);
    storage.write("cinefy-playlists", next);
    setNewPlaylistName("");
    setShowNewPlaylist(false);
    setActivePlaylistId(id);
    setTab("playlist");
  }

  function deletePlaylist(id: number) {
    const next = playlists.filter((p) => p.id !== id);
    setPlaylists(next);
    storage.write("cinefy-playlists", next);
    if (activePlaylistId === id) { setActivePlaylistId(null); setTab("home"); }
  }

  function formatSeconds(value: number) {
    return `0:${String(Math.max(0, Math.floor(value))).padStart(2, "0")}`;
  }

  function TrackRow({ track, index, showRemove }: { track: CinefyTrack; index: number; showRemove?: { playlistId: number } }) {
    const isActive = selected?.trackId === track.trackId;
    return <div className={`cinefy-track ${isActive ? "active" : ""}`}>
      <button className="cinefy-track-main" onClick={() => selectTrack(track)}><img src={track.artworkUrl100} alt="" /><span className="cinefy-track-index">{isActive && playing ? "▶" : String(index + 1).padStart(2, "0")}</span><span className="cinefy-track-copy"><strong>{track.trackName}</strong><small>{track.artistName}</small></span></button>
      <span className="cinefy-genre">{track.primaryGenreName || ""}</span>
      <span className="cinefy-track-actions">
        {showRemove ? <button className="cinefy-favorite" onClick={() => removeFromPlaylist(showRemove!.playlistId, track.trackId)} aria-label={t("sp.removeFromPlaylist")}>✕</button> : <>
          <button className={`cinefy-favorite ${favorites.includes(track.trackId) ? "saved" : ""}`} onClick={() => toggleFavorite(track)} aria-label={favorites.includes(track.trackId) ? t("sp.removeFavorite") : t("sp.saveFavorite")}>{favorites.includes(track.trackId) ? "♥" : "♡"}</button>
          <span className="cinefy-add-wrap">
            <button className={`cinefy-add-playlist ${addMenuFor === track.trackId ? "open" : ""}`} data-add-toggle onClick={(e) => { e.stopPropagation(); setAddMenuFor(addMenuFor === track.trackId ? null : track.trackId); }} aria-label={t("sp.addToPlaylist")}>+</button>
            {addMenuFor === track.trackId && <div className="cinefy-add-menu" data-add-menu onClick={(e) => e.stopPropagation()}>
              <div className="cinefy-add-menu-title">{t("sp.addToPlaylist")}</div>
              {playlists.length === 0 && <div className="cinefy-add-empty">{t("sp.noPlaylists")}</div>}
              {playlists.map((pl) => <button key={pl.id} className="cinefy-add-menu-item" onClick={() => { addToPlaylist(pl.id, track); setAddMenuFor(null); }}>♫ <span>{pl.name}</span></button>)}
            </div>}
          </span>
        </>}
      </span>
    </div>;
  }

  function TrackList({ list, showRemove }: { list: CinefyTrack[]; showRemove?: { playlistId: number } }) {
    return <div className="cinefy-track-list">{list.map((track, i) => <TrackRow key={track.trackId} track={track} index={i + 1} showRemove={showRemove} />)}</div>;
  }

  return <div className={`cinefy-surface cinefy-app ${hazyActive ? "hazy-app" : ""} ${starryActive ? "starry-night" : ""}`}>
    {splash && <div className={`cinefy-splash ${splashPhase}`} data-testid="cinefy-splash" aria-label="Spicetify loading">
      <img className="cinefy-splash-logo" src={asset("images/spicetify-splash.png")} alt="Spicetify" />
      <div className="cinefy-splash-load">
        <div className="cinefy-splash-bar"><span style={{ width: `${splashProgress}%` }} /></div>
        <div className="cinefy-splash-line" key={splashLine}>{SPLASH_LINES[splashLine % SPLASH_LINES.length]}</div>
      </div>
    </div>}
    <audio ref={audioRef} onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 30)} onEnded={() => stepTrack(1)} />
    {hazyActive && <HazyLayer config={hazy} />}
    {starryActive && <div className="cinefy-theme-starry" data-testid="starry-layer" aria-hidden="true">
      {starField.map((s, i) => <span key={i} className={`starry-star twinkle${s.twinkle}`} style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, opacity: s.opacity, animationDelay: `${s.delay}s` }} />)}
      <div className="starry-shoot">
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
        <span className="shootingstar" />
      </div>
    </div>}

    <div className="cinefy-body">
      <nav className="cinefy-sidebar">
        <div className="cinefy-sidebar-brand"><img className="cinefy-logo" src={asset("images/spicetify.ico")} alt="" /><span>Spicetify</span></div>
        <button className={`cinefy-nav ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}><LayoutGrid size={18} /> {t("sp.home")}</button>
        <button className={`cinefy-nav ${tab === "search" ? "active" : ""}`} onClick={() => setTab("search")}><Compass size={18} /> {t("sp.search")}</button>
        <button className={`cinefy-nav ${tab === "marketplace" ? "active" : ""}`} onClick={() => setTab("marketplace")} data-testid="button-market-nav"><img className="cinefy-nav-logo" src={asset("images/marketplace-logo.svg")} alt="" /> {t("sp.marketplace")}</button>
        {installed.includes("hazy-astromations") && <button className={`cinefy-nav ${tab === "hazy" ? "active" : ""}`} onClick={() => setTab("hazy")}><Settings2 size={18} /> {t("sp.hazySettings")}</button>}
        <div className="cinefy-lib-header"><span>{t("sp.yourLibrary")}</span><button className="cinefy-lib-add" onClick={() => setShowNewPlaylist(!showNewPlaylist)} aria-label={t("sp.createPlaylistAria")}>+</button></div>
        {showNewPlaylist && <div className="cinefy-new-playlist">
          <input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} placeholder={t("sp.playlistName")} onKeyDown={(e) => { if (e.key === "Enter") createPlaylist(); }} />
          <button className="cinefy-pl-create" onClick={createPlaylist}>{t("sp.create")}</button>
        </div>}
        <button className={`cinefy-nav cinefy-lib-item ${tab === "liked" ? "active" : ""}`} onClick={() => setTab("liked")}><div className="cinefy-lib-icon liked-icon">♥</div><div><strong>{t("sp.likedSongs")}</strong><small>{tp("sp.songsCount", favorites.length)}</small></div></button>
        {playlists.map((pl) => <button key={pl.id} className={`cinefy-nav cinefy-lib-item ${tab === "playlist" && activePlaylistId === pl.id ? "active" : ""}`} onClick={() => { setActivePlaylistId(pl.id); setTab("playlist"); }}><div className="cinefy-lib-icon">♫</div><div><strong>{pl.name}</strong><small>{tp("sp.songsCount", pl.trackIds.length)}</small></div></button>)}
      </nav>

      <main className="cinefy-main">
        <header className="cinefy-header">
          <div className="cinefy-header-left">
            {tab !== "home" && <button className="cinefy-back" onClick={() => setTab("home")}>←</button>}
            {tab === "search" && <form className="cinefy-search cinefy-search-bar" onSubmit={(e) => { e.preventDefault(); void searchTracks(searchQuery); }}>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("sp.searchPlaceholder")} aria-label="Search music" autoFocus />
            </form>}
            {tab === "marketplace" && <form className="cinefy-search cinefy-search-bar" onSubmit={(e) => e.preventDefault()}>
              <input value={marketQuery} onChange={(e) => setMarketQuery(e.target.value)} placeholder={t("sp.marketSearch")} aria-label="Search marketplace" autoFocus />
            </form>}
            {tab === "home" && <h2 className="cinefy-page-title">{t("sp.goodEvening")}</h2>}
            {tab === "liked" && <h2 className="cinefy-page-title">♥ {t("sp.likedSongs")}</h2>}
            {tab === "playlist" && <h2 className="cinefy-page-title">{playlists.find((p) => p.id === activePlaylistId)?.name || t("sp.playlist")}</h2>}
            {tab === "marketplace" && <h2 className="cinefy-page-title"><img className="cinefy-nav-logo cinefy-page-logo" src={asset("images/marketplace-logo.svg")} alt="" />{t("sp.marketplace")}</h2>}
            {tab === "hazy" && <h2 className="cinefy-page-title"><Sparkles size={20} className="cinefy-hazy-title-icon" /> {t("sp.hazySettings")}</h2>}
            {tab === "nowplaying" && <h2 className="cinefy-page-title"><Music2 size={20} /> {t("sp.nowPlaying")}</h2>}
          </div>
          <div className="cinefy-header-right"><button className="window-control cinefy-close" onClick={onMinimize} aria-label={t("sp.minimize")}><Minus size={16} /></button><button className="window-control close cinefy-close" onClick={() => { onTrackChange(null); onClose(); }} aria-label={t("sp.close")}><X size={16} /></button></div>
        </header>

        <div className="cinefy-content">
          {tab === "home" && <section>
            <div className="cinefy-section-heading"><h3>{t("sp.topHits")}</h3></div>
            {homeTracks.length ? <TrackList list={homeTracks} /> : <div className="cinefy-empty">{t("sp.loading")}</div>}
          </section>}

          {tab === "search" && <section>
            {!searchQuery && <div className="cinefy-search-categories">
              {["Lo-fi", "Hip Hop", "Pop", "Rock", "R&B", "Jazz", "Classical", "Electronic", "Anime", "K-Pop"].map((genre) => <button key={genre} className="cinefy-genre-card" onClick={() => { setSearchQuery(genre); void searchTracks(genre); }}>{genre}</button>)}
            </div>}
            {searchQuery && <>
              <div className="cinefy-section-heading"><h3>{tf("sp.results", { q: searchQuery })}</h3><span>{tp("sp.songsCount", tracks.length)}</span></div>
              {error && <div className="cinefy-empty">{error}</div>}
              {loading && <div className="cinefy-empty">{t("sp.searching")}</div>}
              {!loading && !error && tracks.length > 0 && <TrackList list={tracks} />}
            </>}
          </section>}

          {tab === "liked" && <section>
            {favorites.length === 0 && <div className="cinefy-empty">{t("sp.likedEmpty")}</div>}
            {favorites.length > 0 && <TrackList list={getLikedTracks()} />}
          </section>}

          {tab === "playlist" && activePlaylistId && <section>
            {(() => { const pl = playlists.find((p) => p.id === activePlaylistId); if (!pl) return null; const plTracks = getPlaylistTracks(); return <>
              <div className="cinefy-playlist-hero">
                <button className="cinefy-play-all" onClick={() => { if (plTracks.length) selectTrack(plTracks[0]); }} aria-label={tf("sp.playAria", { name: pl.name })}><Play size={22} fill="currentColor" /></button>
                <div className="cinefy-playlist-hero-info">
                  <h3>{pl.name}</h3>
                  <span>{tp("sp.songsCount", plTracks.length)}</span>
                  <div className="cinefy-playlist-hero-actions"><button className="cinefy-delete-pl" onClick={() => deletePlaylist(pl.id)}>{t("sp.deletePlaylist")}</button></div>
                </div>
              </div>
              {plTracks.length === 0 && <div className="cinefy-empty">{t("sp.playlistEmpty")}</div>}
              {plTracks.length > 0 && <TrackList list={plTracks} showRemove={{ playlistId: pl.id }} />}
            </>; })()}
          </section>}

          {tab === "marketplace" && <section className="cinefy-market">
            <div className="cinefy-market-installed">
              <div className="cinefy-section-heading"><h3>{t("sp.installed")}</h3><span>{tp("sp.installedCount", installedItems.length)}</span></div>
              {installedItems.length === 0
                ? <div className="cinefy-market-empty">{t("sp.nothingInstalled")}</div>
                : <div className="cinefy-market-strip">{installedItems.map((item) => <div className="cinefy-market-chip" key={item.id}>
                    <span className="cinefy-market-tile" style={{ background: item.color }}>{item.art ? <img className="cinefy-market-tile-art" src={asset(item.art)} alt={item.name} loading="lazy" /> : item.glyph === "theme" ? <Palette size={15} /> : item.glyph === "extension" ? <Puzzle size={15} /> : item.glyph === "snippet" ? <Code2 size={15} /> : <Rocket size={15} />}</span>
                    <span className="cinefy-market-chip-name">{item.name}</span>
                    {item.id === "hazy-astromations" && <button className="cinefy-chip-open" onClick={() => setTab("hazy")} aria-label={t("sp.hazySettings")}>{t("sp.open")}</button>}
                    <button className="cinefy-chip-remove" onClick={() => toggleInstalled(item.id)} aria-label={tf("sp.uninstallAria", { name: item.name })}>✕</button>
                  </div>)}</div>}
            </div>

            <div className="cinefy-market-featured">
              <span className="cinefy-market-featured-tile" style={{ background: hazyFeature.color }}>{hazyFeature.art ? <img className="cinefy-market-tile-art" src={asset(hazyFeature.art)} alt={hazyFeature.name} loading="lazy" /> : <Sparkles size={30} />}</span>
              <div className="cinefy-market-featured-info">
                <span className="cinefy-market-featured-kicker">{t("sp.featuredTheme")}</span>
                <h3>{hazyFeature.name}</h3>
                <p>{hazyFeature.desc}</p>
                <span className="cinefy-market-meta">{tf("sp.byLine", { by: hazyFeature.by, version: hazyFeature.version })}</span>
              </div>
              <button className={`cinefy-market-cta ${isThemeActive(hazyFeature.id) ? "active-theme" : installed.includes(hazyFeature.id) ? "installed" : ""}`} onClick={() => toggleInstalled(hazyFeature.id)} data-testid="button-install-hazy">{installed.includes(hazyFeature.id) ? <><Check size={15} /> {isThemeActive(hazyFeature.id) ? t("sp.active") : t("sp.installedState")}</> : <><Download size={15} /> {t("sp.install")}</>}</button>
            </div>

            <div className="cinefy-market-cats">{(["extensions", "themes", "snippets"] as MarketCategory[]).map((cat) => <button key={cat} className={`cinefy-market-cat ${marketCategory === cat ? "active" : ""}`} onClick={() => setMarketCategory(cat)} data-testid={`button-market-cat-${cat}`}>{t(`market.cat.${cat}`)}</button>)}</div>

            {marketList.length === 0 && <div className="cinefy-empty">{tf("sp.noMatch", { category: marketCategory })}</div>}
            <div className="cinefy-market-grid">{marketList.map((item) => {
              const isHazy = item.id === "hazy-astromations";
              const isInstalled = installed.includes(item.id);
              return <div className="cinefy-market-card" key={item.id}>
                <span className="cinefy-market-tile cinefy-market-tile-card" style={{ background: item.color }}>{item.art ? <img className="cinefy-market-tile-art" src={asset(item.art)} alt={item.name} loading="lazy" /> : isHazy ? <Sparkles size={20} /> : item.glyph === "theme" ? <Palette size={20} /> : item.glyph === "extension" ? <Puzzle size={20} /> : item.glyph === "snippet" ? <Code2 size={20} /> : <Rocket size={20} />}</span>
                <div className="cinefy-market-card-main">
                  <strong>{item.name}</strong>
                  <span className="cinefy-market-meta">{tf("sp.byLine", { by: item.by, version: item.version })}</span>
                  <p>{item.desc}</p>
                </div>
                <div className="cinefy-market-card-actions">
                  {isInstalled && isHazy && <button className="cinefy-chip-open" onClick={() => setTab("hazy")}>{t("sp.hazySettings")}</button>}
                  {isInstalled && (isHazy || item.id === "starry-nights") && (isThemeActive(item.id)
                    ? <span className="cinefy-theme-active">{t("sp.active")}</span>
                    : <button className="cinefy-theme-apply" onClick={() => applyTheme(item.id)} data-testid={`button-apply-${item.id}`}>{t("sp.apply")}</button>)}
                  <button className={`cinefy-market-install ${isInstalled ? "installed" : ""}`} onClick={() => toggleInstalled(item.id)} data-testid={`button-market-item-${item.id}`}>{isInstalled ? t("sp.uninstall") : t("sp.install")}</button>
                </div>
              </div>;
            })}</div>
          </section>}

          {tab === "hazy" && <section>
            <div className="cinefy-hazy-layout">
              <div className="cinefy-hazy-preview"><HazyLayer config={hazyDraft} />{!hazyDraft.enabled && <div className="cinefy-hazy-disabled">{t("sp.hazyOff")}</div>}<span className="cinefy-hazy-preview-label">{hazyDraft.custom && hazyDraft.url.trim() !== "" ? t("sp.customLabel") : t("sp.hazyLabel")}</span></div>
              <div className="cinefy-hazy-form">
                <SettingToggle label={t("sp.hazyBg")} help={t("sp.hazyBgHelp")} value={hazyDraft.enabled} onChange={(v) => updateHazyDraft({ enabled: v })} />
                <SettingToggle label={t("sp.hazyCustom")} help={t("sp.hazyCustomHelp")} value={hazyDraft.custom} onChange={(v) => updateHazyDraft({ custom: v })} />
                {hazyDraft.custom && <div className="cinefy-hazy-url"><input value={hazyDraft.url} onChange={(e) => updateHazyDraft({ url: e.target.value })} placeholder={t("sp.pasteUrl")} aria-label="Background image or GIF URL" data-testid="input-hazy-url" /><button className="cinefy-pl-create" onClick={() => updateHazyDraft({ url: hazyDraft.url.trim() })}>Preview</button></div>}
                <SettingToggle label={t("sp.hazyColor")} help={t("sp.hazyColorHelp")} value={hazyDraft.colorOn} onChange={(v) => updateHazyDraft({ colorOn: v })} />
                {hazyDraft.colorOn && <div className="cinefy-hazy-color">
                  <input type="color" value={hazyDraft.color} onChange={(e) => updateHazyDraft({ color: e.target.value })} aria-label="Background color" data-testid="input-hazy-color" />
                  <label className="cinefy-slider-row"><span>{t("sp.tint")} <strong>{Math.round(hazyDraft.tint * 100)}%</strong></span><input type="range" min="0" max="0.9" step="0.01" value={hazyDraft.tint} onChange={(e) => updateHazyDraft({ tint: Number(e.target.value) })} aria-label="Tint strength" /></label>
                </div>}
                <label className="cinefy-slider-row"><span>{t("sp.zoom")} <strong>{Math.round((hazyDraft.size ?? 1) * 100)}%</strong></span><input type="range" min="0.5" max="3" step="0.05" value={hazyDraft.size ?? 1} onChange={(e) => updateHazyDraft({ size: Number(e.target.value) })} aria-label="Background image size" data-testid="slider-hazy-size" /></label>
                {([
                  { key: "blur", label: t("sp.blur"), min: 0, max: 24, step: 1, unit: "px", value: hazyDraft.blur, set: (v: number) => updateHazyDraft({ blur: v }) },
                  { key: "contrast", label: t("sp.contrast"), min: 0, max: 200, step: 1, unit: "%", value: hazyDraft.contrast, set: (v: number) => updateHazyDraft({ contrast: v }) },
                  { key: "saturation", label: t("sp.saturation"), min: 0, max: 200, step: 1, unit: "%", value: hazyDraft.saturation, set: (v: number) => updateHazyDraft({ saturation: v }) },
                  { key: "brightness", label: t("sp.brightness"), min: 0, max: 200, step: 1, unit: "%", value: hazyDraft.brightness, set: (v: number) => updateHazyDraft({ brightness: v }) },
                ] as { key: "blur" | "contrast" | "saturation" | "brightness"; label: string; min: number; max: number; step: number; unit: string; value: number; set: (v: number) => void }[]).map((slider) => <label className="cinefy-slider-row" key={slider.key}><span>{slider.label} <strong>{slider.value}{slider.unit}</strong></span><input type="range" min={slider.min} max={slider.max} step={slider.step} value={slider.value} onChange={(e) => slider.set(Number(e.target.value))} data-testid={`slider-hazy-${slider.key}`} aria-label={`Hazy ${slider.label}`} /></label>)}
                <div className="cinefy-hazy-actions">
                  <button className="cinefy-hazy-btn" onClick={resetHazy} aria-label="Reset Hazy settings" data-testid="button-hazy-reset"><RotateCcw size={14} /> {t("sp.refresh")}</button>
                  <button className="cinefy-hazy-btn primary" onClick={applyHazy} aria-label="Apply Hazy background" data-testid="button-hazy-apply"><Check size={15} /> {t("sp.apply")}</button>
                  <button className="cinefy-hazy-btn" onClick={() => setTab("home")} aria-label="Close Hazy settings" data-testid="button-hazy-close"><X size={14} /> {t("sp.close")}</button>
                </div>
              </div>
            </div>
          </section>}
        {tab === "nowplaying" && <section>
            {selected ? <div className="cinefy-nowplaying">
              <div className="cinefy-nowplaying-top">
                {!blyActive && lyrics.length > 0 && <span className={`cinefy-lyrics-sync ${lyricsSynced ? "synced" : "estimate"}`}>{lyricsSynced ? t("sp.lyricsSynced") : t("sp.lyricsEstimate")}</span>}
                <button className="cinefy-nowplaying-exit" onClick={() => setTab("home")} aria-label={t("appMenu.back")}><ArrowLeft size={16} /> {t("appMenu.back")}</button>
              </div>
              <div className="cinefy-nowplaying-art"><img src={selected.artworkUrl100.replace("100x100", "600x600")} alt="" /></div>
              <div className="cinefy-nowplaying-info">
                <h3>{selected.trackName}</h3>
                <span>{selected.artistName}</span>
                <div className={`cinefy-nowplaying-progress ${sonicActive ? "sonic-dance" : ""}`}><span>{formatSeconds(progress)}</span><input type="range" min="0" max={duration || 30} step="0.1" value={Math.min(progress, duration || 30)} onChange={(e) => { const v = Number(e.target.value); setProgress(v); if (audioRef.current) audioRef.current.currentTime = v; }} aria-label={t("sp.progress")} /><span>{formatSeconds(duration)}</span></div>
                <div className="cinefy-nowplaying-controls">
                  <button onClick={() => stepTrack(-1)} aria-label={t("sp.prevSong")}><ArrowLeft size={20} /></button>
                  <button className="cinefy-nowplaying-play" onClick={() => setPlaying((v) => !v)} aria-label={playing ? t("sp.pause") : t("sp.play")}>{playing ? "⏸" : "▶"}</button>
                  <button onClick={() => stepTrack(1)} aria-label={t("sp.nextSong")}><ArrowRight size={20} /></button>
                </div>
              </div>
              {blyActive
                ? <BeautifulLyricsPanel key={selected.trackId} track={selected} lines={lyrics} lyricIndex={lyricIndex} lineProgress={lineProgress} playing={playing} progress={progress} duration={duration || 30} timeNow={formatSeconds(progress)} timeTotal={formatSeconds(duration)} synced={lyricsSynced} offset={lyricOffset} onOffset={setLyricOffset} onSyncNow={() => { if (lyricIndex >= 0 && lyrics[lyricIndex]) setLyricOffset(Math.round((lyrics[lyricIndex].time - progress) * 100) / 100); }} strings={{ title: t("sp.lyrics"), noLyrics: t("sp.noLyrics"), full: t("sp.lyricsFull"), collapse: t("sp.lyricsCollapse"), synced: t("sp.lyricsSynced"), estimate: t("sp.lyricsEstimate"), syncNow: t("sp.lyricsSyncNow") }} />
                : <div className="cinefy-lyrics-panel">
                <div className="cinefy-lyrics-head">
                  <div className="cinefy-lyrics-title">{t("sp.lyrics")}</div>
                  {!lyricsSynced && lyrics.length > 0 && playing && lyricIndex >= 0 && <div className="cinefy-lyrics-now">{formatSeconds(lyrics[lyricIndex].time)}</div>}
                  {lyrics.length > 0 && <button className="cinefy-lyrics-toggle" onClick={() => setLyricsFull((v) => !v)} aria-label={lyricsFull ? t("sp.lyricsCollapse") : t("sp.lyricsFull")}>{lyricsFull ? t("sp.lyricsCollapse") : t("sp.lyricsFull")}</button>}
                </div>
                {lyrics.length === 0
                  ? <div className="cinefy-lyrics-empty">{t("sp.noLyrics")}</div>
                  : <div className={`cinefy-lyrics-list ${lyricsFull ? "full" : "clip"}`} ref={lyricsListRef} onWheel={markUserScroll} onPointerDown={markUserScroll} onTouchStart={markUserScroll}>{lyrics.map((line, i) => { const live = i === lyricIndex && playing; return <p key={i} ref={(el) => { lyricLineRefs.current[i] = el; }} className={live ? "active" : ""}>{renderLyricText(line, live, lineProgress)}{live && <span className="cinefy-lyric-bar"><span style={{ width: `${lineProgress * 100}%` }} /></span>}</p>; })}</div>}
              </div>}
            </div> : <div className="cinefy-empty">{t("sp.pickSong")}</div>}
          </section>}
        </div>
      </main>
    </div>

    {tab !== "nowplaying" && <footer className={`cinefy-player ${sonicActive ? "sonic-dance" : ""}`}>
      <button className="cinefy-player-track" onClick={() => selected && setTab("nowplaying")} aria-label={t("sp.nowPlaying")}>{selected && <><img src={selected.artworkUrl100} alt="" /><div><strong>{selected.trackName}</strong><span>{selected.artistName}</span></div></>}<ChevronUp size={13} className="cinefy-player-track-open" /></button>
      <div className="cinefy-controls"><button onClick={() => stepTrack(-1)} aria-label={t("sp.prevSong")}><ArrowLeft size={16} /></button><button className="cinefy-play" onClick={() => selected && setPlaying((v) => !v)} aria-label={playing ? t("sp.pause") : t("sp.play")}>{playing ? "⏸" : "▶"}</button><button onClick={() => stepTrack(1)} aria-label={t("sp.nextSong")}><ArrowRight size={16} /></button></div>
      <div className="cinefy-progress"><span>{formatSeconds(progress)}</span><input type="range" min="0" max={duration || 30} step="0.1" value={Math.min(progress, duration || 30)} onChange={(e) => { const v = Number(e.target.value); setProgress(v); if (audioRef.current) audioRef.current.currentTime = v; }} aria-label={t("sp.progress")} /><span>{formatSeconds(duration)}</span></div>
      <label className="cinefy-volume">VOL <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label={t("sp.volume")} /></label>
    </footer>}

    {notif && <div className="cinefy-notif" onClick={() => setNotif(null)}>
      <div className="cinefy-notif-kicker">{t("sp.nowPlaying")}</div>
      <div className="cinefy-notif-body"><img className="cinefy-notif-art" src={notif.track.artworkUrl100} alt="" /><div className="cinefy-notif-info"><strong>{notif.track.trackName}</strong><span>{notif.track.artistName}</span></div></div>
      <div className="cinefy-notif-controls"><button onClick={(e) => { e.stopPropagation(); setPlaying(false); }} aria-label={t("sp.pause")}>⏸</button><button onClick={(e) => { e.stopPropagation(); setPlaying(true); }} aria-label={t("sp.resume")}>▶</button></div>
    </div>}
  </div>;
}

function HazyLayer({ config }: { config: HazyConfig }) {
  const filter = `blur(${config.blur}px) contrast(${config.contrast}%) saturate(${config.saturation}%) brightness(${config.brightness}%)`;
  return <div className="hazy-layer" style={{ filter }} aria-hidden="true">
    <div className="hazy-layer-base" />
    {config.custom && config.url.trim() !== "" && <img className="hazy-layer-img" src={config.url} style={{ transform: `scale(${config.size ?? 1})` }} alt="" />}
    {config.colorOn && <div className="hazy-layer-tint" style={{ background: config.color, opacity: config.tint }} />}
  </div>;
}

function SettingToggle({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><div><strong>{label}</strong><small>{help}</small></div><span className="switch"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span className="switch-track" /></span></label>;
}

function InfoModal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <div className={`info-modal ${open ? "open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card"><header className="modal-header"><h2>{title}</h2><button className="icon-close" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>{children}</div></div>;
}

function Stars({ value }: { value: number }) {
  const count = Math.round(value);
  return <span className="we-stars-row" aria-label={`${value.toFixed(1)} / 5`}>{[0, 1, 2, 3, 4].map((i) => <span key={i} className={i < count ? "on" : ""}>★</span>)}</span>;
}

const WE_CARD_GRADS: Record<string, string> = {
  Anime: "radial-gradient(120% 120% at 20% 0%, #2b1b4d 0%, #0a0f1d 65%)",
  Space: "radial-gradient(120% 120% at 20% 0%, #0b2a3a 0%, #070b16 65%)",
  Animals: "radial-gradient(120% 120% at 20% 0%, #1f3a2a 0%, #0a0f1a 65%)",
  City: "radial-gradient(120% 120% at 20% 0%, #1d2f45 0%, #0a0f18 65%)",
  Bizarre: "radial-gradient(120% 120% at 20% 0%, #3a1a3a 0%, #0b0b14 65%)",
  Scenery: "radial-gradient(120% 120% at 20% 0%, #16384d 0%, #0a0f19 65%)",
  Cinematic: "radial-gradient(120% 120% at 20% 0%, #3a1f2b 0%, #0b0b14 65%)",
  Minimal: "radial-gradient(120% 120% at 20% 0%, #1d2433 0%, #0a0e16 65%)",
  Abstract: "radial-gradient(120% 120% at 20% 0%, #2a1d4d 0%, #080b15 65%)",
  Utility: "radial-gradient(120% 120% at 20% 0%, #23402f 0%, #0a0f1a 65%)",
  Gaming: "radial-gradient(120% 120% at 20% 0%, #1d2b4d 0%, #070c18 65%)",
  Synthwave: "radial-gradient(120% 120% at 20% 0%, #40144a 0%, #0a0816 65%)",
  Dark: "radial-gradient(120% 120% at 20% 0%, #241423 0%, #08080e 65%)",
};

function WeCard({ entry, applied, onOpen, installed, onDownload, onApply, onUninstall }: { entry: WallEngineEntry; applied: boolean; onOpen: () => void; installed: boolean; onDownload?: () => void; onApply?: () => void; onUninstall?: () => void }) {
  const [hover, setHover] = useState(false);
  const showVideo = Boolean(entry.video) && !PERF.low && hover;
  return <div className="we-card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} data-testid={`we-card-${entry.id}`}>
    <div className={`we-card-thumb ${applied ? "applied" : ""}`}>{showVideo
      ? <video src={pvSrc(entry.video, entry.videoLow)} muted loop playsInline preload="metadata" autoPlay />
      : entry.video
        ? <div className="we-card-thumb placeholder" style={{ background: WE_CARD_GRADS[entry.category] ?? WE_CARD_GRADS.Dark }}><span>{CATEGORY_ICONS[entry.category] ?? "·"}</span></div>
        : <img src={entry.image} alt={entry.name} />}{applied ? <span className="we-applied-badge">{t("we.inUse")}</span> : null}</div>
    <div className="we-card-info"><strong>{entry.name}</strong><span>{entry.category} · {entry.resolution}</span><span className="we-card-author"><BadgeCheck size={11} /> {WE_AUTHOR.name}</span></div>
    <div className="we-card-actions">{installed
      ? <><button className="we-btn mini" onClick={(event) => { event.stopPropagation(); onApply?.(); }}>{applied ? t("we.inUse") : t("we.apply")}</button>{onUninstall ? <button className="we-btn mini danger" onClick={(event) => { event.stopPropagation(); onUninstall(); }}>{t("we.uninstall")}</button> : null}</>
      : <button className="we-btn mini" onClick={(event) => { event.stopPropagation(); onDownload?.(); }}><Download size={11} /> {t("we.download")}</button>}</div>
  </div>;
}

function WeApplyModal({ entry, onClose, onConfirm }: { entry: WallEngineEntry; onClose: () => void; onConfirm: (target: ApplyTarget) => void }) {
  const [target, setTarget] = useState<ApplyTarget>("both");
  return <div className="we-apply" data-testid="we-apply-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="we-apply-card">
      <button className="we-showcase-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
      <div className="we-apply-preview">{entry.video ? <video src={pvSrc(entry.video, entry.videoLow)} autoPlay muted loop playsInline preload="metadata" /> : <img src={entry.image} alt={entry.name} />}</div>
      <div className="we-apply-body">
        <h3>{entry.name}</h3>
        <p>{t("we.applyAsk")}</p>
        <div className="we-seg">{(["both", "home", "lock"] as const).map((opt) => <button key={opt} className={target === opt ? "active" : ""} onClick={() => setTarget(opt)}>{opt === "home" ? t("wm.home") : opt === "lock" ? t("wm.lock") : t("wm.both")}</button>)}</div>
        <div className="we-apply-actions">
          <button className="we-btn" onClick={onClose}>{t("we.cancel")}</button>
          <button className="we-btn primary" onClick={() => onConfirm(target)}>{t("we.apply")}</button>
        </div>
      </div>
    </div>
  </div>;
}

function WallEngineApp({ appliedHome, appliedLock, onApplyWallpaper, notify }: { appliedHome: WallpaperId; appliedLock: WallpaperId; onApplyWallpaper: (id: WallpaperId, target: "both" | "home" | "lock") => void; notify?: (title: string, copy: string) => void }) {
  const [tab, setTab] = useState<"installed" | "discover" | "workshop">("discover");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [applyEntry, setApplyEntry] = useState<WallEngineEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadPct, setLoadPct] = useState(0);
  const [loadLine, setLoadLine] = useState(0);
  const [installed, setInstalled] = useState<string[]>(() => (storage.read<string[]>("vertex-we-installed", [])).filter((id) => id !== "we-sonic"));
  const [category, setCategory] = useState<string>("all");
  const [ratings, setRatings] = useState<Record<string, number>>(() => storage.read<Record<string, number>>("vertex-we-ratings", {}));
  const [votes, setVotes] = useState<Record<string, number>>(() => storage.read<Record<string, number>>("vertex-we-votes", {}));
  const [propsDraft, setPropsDraft] = useState<{ brightness: number; volume: number; position: string; rate: number }>({ brightness: 1, volume: 1, position: "center", rate: 1 });
  useEffect(() => { storage.write("vertex-we-installed", installed); }, [installed]);
  useEffect(() => { storage.write("vertex-we-ratings", ratings); }, [ratings]);
  useEffect(() => { storage.write("vertex-we-votes", votes); }, [votes]);
  const weLoadLines = [t("we.loadPhrase1"), t("we.loadPhrase2"), t("we.loadPhrase3"), t("we.loadPhrase4"), t("we.loadPhrase5"), t("we.loadPhrase6")];
  useEffect(() => {
    const total = 5400;
    const start = performance.now();
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, Math.round((elapsed / total) * 100));
      setLoadPct(pct);
      setLoadLine(Math.min(weLoadLines.length - 1, Math.floor((elapsed / total) * weLoadLines.length * 1.2)));
      if (elapsed >= total) setLoading(false);
    }, 60);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = (id: string) => setInstalled((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const uninstall = (id: string) => { setInstalled((prev) => prev.filter((x) => x !== id)); setOpenId((o) => (o === id ? null : o)); };
  const entryOf = (id: string | null) => (id ? wallEngineEntries.find((e) => e.id === id) : undefined);
  const isApplied = (id: WallpaperId) => appliedHome === id || appliedLock === id;
  const q = query.trim().toLowerCase();
  const match = (e: WallEngineEntry) => (!q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || entryTags(e).some((tag) => tag.toLowerCase().includes(q)));

  const fullStars = (e: WallEngineEntry) => {
    const user = ratings[e.id];
    const total = votes[e.id] ?? 0;
    const avg = user !== undefined ? user : e.stars;
    return { avg, user: user ?? null, total };
  };

  const categories = ["all", ...Array.from(new Set(wallEngineEntries.map((e) => e.category)))];
  const counts: Record<string, number> = { all: wallEngineEntries.length };
  for (const e of wallEngineEntries) counts[e.category] = (counts[e.category] ?? 0) + 1;

  const open = entryOf(openId);
  const installedView = wallEngineEntries.filter((e) => installed.includes(e.id) && (category === "all" || e.category === category) && match(e));
  const workshopView = wallEngineEntries.filter((e) => (category === "all" || e.category === category) && match(e));
  const activeCat = tab === "discover" ? "all" : category;
  const recentView = WE_RECENT.map((id) => entryOf(id)).filter((e): e is WallEngineEntry => Boolean(e)).filter((e) => activeCat === "all" || e.category === activeCat);
  const popularView = WE_POPULAR.map((id) => entryOf(id)).filter((e): e is WallEngineEntry => Boolean(e)).filter((e) => activeCat === "all" || e.category === activeCat);

  const openProps = () => {
    if (open) setPropsDraft({ brightness: 1, volume: 1, position: "center", rate: 1 });
  };

  const rate = (id: string, n: number) => {
    setRatings((r) => {
      const current = r[id];
      if (current === n) {
        setVotes((v) => ({ ...v, [id]: Math.max(0, (v[id] ?? 0) - 1) }));
        const next = { ...r };
        delete next[id];
        return next;
      }
      if (current === undefined) setVotes((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
      return { ...r, [id]: n };
    });
  };

  const renderProps = () => (
    <div className="we-props" data-testid="we-props">
      <h4 className="we-props-title">{t("we.props")}</h4>
      <label className="we-prop"><span>{t("we.brightness")}</span><input type="range" min="0.2" max="1.8" step="0.05" value={propsDraft.brightness} onChange={(e) => setPropsDraft((p) => ({ ...p, brightness: Number(e.target.value) }))} /><em>{Math.round(propsDraft.brightness * 100)}%</em></label>
      <label className="we-prop"><span>{t("we.volume")}</span><input type="range" min="0" max="1" step="0.01" value={propsDraft.volume} onChange={(e) => setPropsDraft((p) => ({ ...p, volume: Number(e.target.value) }))} /><em>{Math.round(propsDraft.volume * 100)}%</em></label>
      <label className="we-prop"><span>{t("we.position")}</span>
        <div className="we-pos-seg">
          {(["left", "center", "right"] as const).map((pos) => <button key={pos} className={propsDraft.position === pos ? "active" : ""} onClick={() => setPropsDraft((p) => ({ ...p, position: pos }))}>{t(`we.pos.${pos}`)}</button>)}
        </div></label>
      <label className="we-prop"><span>{t("we.rate")}</span><input type="range" min="0.25" max="2" step="0.25" value={propsDraft.rate} onChange={(e) => setPropsDraft((p) => ({ ...p, rate: Number(e.target.value) }))} /><em>{propsDraft.rate.toFixed(2)}x</em></label>
      <div className="we-prop-actions">
        <button className="we-btn" onClick={() => open && setPropsDraft({ brightness: 1, volume: 1, position: "center", rate: 1 })}>{t("we.cancel")}</button>
        <button className="we-btn primary" onClick={() => { const p = propsDraft; const vids = Array.from(document.querySelectorAll<HTMLVideoElement>(".we-showcase-preview video,.we-apply-preview video")); for (const v of vids) { v.style.filter = `brightness(${p.brightness})`; v.volume = p.volume; v.playbackRate = p.rate; v.style.objectPosition = p.position === "left" ? "left center" : p.position === "right" ? "right center" : "center center"; } notify?.(t("we.propsApplied"), t("we.propsAppliedCopy")); }}>{t("we.apply")}</button>
      </div>
    </div>
  );

  return (
    <div className="we-app-wrap">
      {loading ? <div className="we-loading" data-testid="we-loading">
        <div className="we-load-bg" aria-hidden="true">
          <span className="we-load-orb we-load-orb-a" />
          <span className="we-load-orb we-load-orb-b" />
          <span className="we-load-orb we-load-orb-c" />
          <div className="we-load-grid" />
          <div className="we-load-tiles">
            <span className="we-load-tile" />
            <span className="we-load-tile" />
            <span className="we-load-tile" />
            <span className="we-load-tile" />
            <span className="we-load-tile" />
            <span className="we-load-tile" />
          </div>
        </div>
        <div className="we-load-core">
          <div className="we-load-ring">
            <span className="we-load-halo" />
            <span className="we-load-ring-dash" />
            <img className="we-load-icon" src={asset("images/wallpaper-engine.gif")} alt="" />
          </div>
          <div className="we-load-brand">
            <span className="we-load-kicker">{t("surf.wallpaperEngine.kicker")}</span>
            <h2 className="we-load-title">{t("surf.wallpaperEngine.title")}</h2>
          </div>
          <div className="we-load-bar">
            <span className="we-load-bar-fill" style={{ width: `${loadPct}%` }} />
            <span className="we-load-bar-shine" />
          </div>
          <div className="we-load-row">
            <span className="we-load-status"><em>{weLoadLines[loadLine]}</em></span>
            <span className="we-load-pct">{loadPct}%</span>
          </div>
        </div>
      </div> : null}
      <div className="we-app">
        <div className="we-tabs">
          {(["installed", "discover", "workshop"] as const).map((key) => <button key={key} className={`we-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{t(`we.${key}`)}</button>)}
        </div>
        <div className="we-main">
          {tab === "workshop" ? <aside className="we-cats" data-testid="we-cats">
            <div className="we-cats-head">{t("we.catsTitle")}</div>
            {categories.map((cat) => (
              <button key={cat} className={`we-cat ${category === cat ? "active" : ""}`} onClick={() => setCategory(cat)}>
                <span className="we-cat-ic">{cat === "all" ? "▦" : CATEGORY_ICONS[cat] ?? "·"}</span>
                <span className="we-cat-name">{cat === "all" ? t("we.all") : cat}</span>
                <span className="we-cat-count">{counts[cat] ?? 0}</span>
              </button>
            ))}
          </aside> : null}
          <div className="we-content">
            {tab === "installed" ? <>
              <div className="we-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("we.searchInstalled")} aria-label={t("we.searchInstalled")} data-testid="input-we-search" /></div>
              {installedView.length === 0 ? <div className="we-empty">{t("we.noneInstalled")}</div> : <div className="we-grid">{installedView.map((e) => <WeCard key={e.id} entry={e} applied={isApplied(e.id)} installed onOpen={() => setOpenId(e.id)} onApply={() => setApplyEntry(e)} onUninstall={() => uninstall(e.id)} />)}</div>}
            </> : tab === "discover" ? <>
<section className="we-section"><h3 className="we-section-title">{t("we.recent")}</h3><div className="we-grid">{recentView.map((e) => <WeCard key={e.id} entry={e} applied={isApplied(e.id)} installed={installed.includes(e.id)} onOpen={() => setOpenId(e.id)} onDownload={() => install(e.id)} />)}</div></section>
            <div className="we-divider" />
            <section className="we-section"><h3 className="we-section-title">{t("we.popular")} <span className="we-fire">🔥</span></h3><div className="we-grid">{popularView.map((e) => <WeCard key={e.id} entry={e} applied={isApplied(e.id)} installed={installed.includes(e.id)} onOpen={() => setOpenId(e.id)} onDownload={() => install(e.id)} />)}</div></section>
            </> : <>
              <div className="we-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("we.searchWorkshop")} aria-label={t("we.searchWorkshop")} data-testid="input-we-search" /></div>
              {workshopView.length === 0 ? <div className="we-empty">{t("we.noneCats")}</div> : <div className="we-grid">{workshopView.map((e) => <WeCard key={e.id} entry={e} applied={isApplied(e.id)} installed={installed.includes(e.id)} onOpen={() => setOpenId(e.id)} onDownload={() => install(e.id)} />)}</div>}
            </>}
          </div>
          {open ? <aside className="we-showcase" data-testid="we-showcase">
            <button className="we-showcase-close" onClick={() => setOpenId(null)} aria-label="Close showcase"><X size={16} /></button>
            <div className="we-showcase-preview">{open.video ? <video src={pvSrc(open.video, open.videoLow)} autoPlay muted={propsDraft.volume === 0} loop playsInline preload="metadata" style={{ filter: `brightness(${propsDraft.brightness})`, objectPosition: propsDraft.position === "left" ? "left center" : propsDraft.position === "right" ? "right center" : "center center" }} /> : <img src={open.image} alt={open.name} style={{ filter: `brightness(${propsDraft.brightness})` }} />}</div>
            <div className="we-showcase-meta">
              <h3>{t("we.titleLabel")}: {open.name}</h3>
              <p className="we-showcase-author"><BadgeCheck size={14} /> {t("we.author")}: {WE_AUTHOR.name} {WE_AUTHOR.verified ? <span className="we-verified">{t("we.verified")}</span> : null}</p>
              <p className="we-showcase-tags">{t("we.type")}: {open.video ? t("we.typeVideo") : t("we.typeImage")} ({resolvedSize(open)})</p>
              <p className="we-showcase-tags">{t("we.tags")}: {entryTags(open).join(" · ")}</p>
              <div className="we-rating-info"><Stars value={fullStars(open).avg} /><span>{fullStars(open).avg.toFixed(1)}</span><em>({fullStars(open).total} {t("we.votes")})</em></div>
              <div className="we-rate-row">
                <span className="we-rate-label">{t("we.rateNow")}</span>
                <div className="we-rate-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={fullStars(open).user !== null && (fullStars(open).user ?? 0) >= n ? "on" : ""} onClick={() => rate(open.id, n)} aria-label={`Rate ${n} ${n === 1 ? "star" : "stars"}`}>{n <= (fullStars(open).user ?? 0) ? "★" : "☆"}</button>)}</div>
              </div>
              <div className="we-showcase-actions">
                {installed.includes(open.id)
                  ? <><button className="we-btn danger" onClick={() => uninstall(open.id)}>{t("we.uninstall")}</button><button className="we-btn primary" onClick={() => setApplyEntry(open)}>{isApplied(open.id) ? t("we.inUse") : t("we.apply")}</button></>
                  : <button className="we-btn primary" onClick={() => install(open.id)}><Download size={14} /> {t("we.download")}</button>}
              </div>
              {renderProps()}
            </div>
          </aside> : null}
        </div>
      </div>
      {applyEntry ? <WeApplyModal entry={applyEntry} onClose={() => setApplyEntry(null)} onConfirm={(target) => { onApplyWallpaper(applyEntry.id, target); setApplyEntry(null); }} /> : null}
    </div>
  );
}

export default App;
