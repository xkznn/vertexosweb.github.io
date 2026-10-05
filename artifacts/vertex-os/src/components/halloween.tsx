import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

type Ctx = CanvasRenderingContext2D;

function drawBat(ctx: Ctx, x: number, y: number, s: number, flap: number) {
  const f = Math.max(0, Math.min(1, flap));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(9,4,16,.94)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-14, -8 - 10 * f, -24, 3);
  ctx.quadraticCurveTo(-13, 1, 0, 7);
  ctx.quadraticCurveTo(13, 1, 24, 3);
  ctx.quadraticCurveTo(14, -8 - 10 * f, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 2, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPumpkin(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, -r * 0.2, r * 0.5, 0, -r * 0.2, r * 3.4);
  halo.addColorStop(0, "rgba(255,146,32,.42)");
  halo.addColorStop(1, "rgba(255,146,32,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -r * 0.2, r * 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8791f";
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,50,0,.45)";
  ctx.lineWidth = Math.max(1, r * 0.06);
  for (const dx of [-0.46, 0, 0.46]) {
    ctx.beginPath();
    ctx.ellipse(dx * r, 0, r * 0.3, r * 0.84, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#3f7d2a";
  ctx.fillRect(-r * 0.11, -r * 1.1, r * 0.22, r * 0.26);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.28);
  ctx.lineTo(-r * 0.24, -r * 0.52);
  ctx.lineTo(-r * 0.06, -r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.5, -r * 0.28);
  ctx.lineTo(r * 0.24, -r * 0.52);
  ctx.lineTo(r * 0.06, -r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.44, r * 0.3);
  ctx.lineTo(-r * 0.2, r * 0.14);
  ctx.lineTo(0, r * 0.36);
  ctx.lineTo(r * 0.2, r * 0.14);
  ctx.lineTo(r * 0.44, r * 0.3);
  ctx.lineTo(r * 0.3, r * 0.52);
  ctx.lineTo(-r * 0.3, r * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function HalloweenWallpaper({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      const parent = canvas.parentElement;
      w = parent?.clientWidth || window.innerWidth;
      h = parent?.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);

    const stars = Array.from({ length: 170 }, () => ({
      x: Math.random(), y: Math.random() * 0.72, r: Math.random() * 1.3 + 0.3, tw: Math.random() * Math.PI * 2,
    }));
    const bats = Array.from({ length: 9 }, () => ({
      x: Math.random(), y: 0.08 + Math.random() * 0.36, s: 0.5 + Math.random() * 0.9,
      sp: (0.02 + Math.random() * 0.035) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * Math.PI * 2,
      flap: Math.random() * Math.PI * 2,
    }));
    const embers = Array.from({ length: 44 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.7 + 0.6,
      sp: 0.0006 + Math.random() * 0.0014, drift: (Math.random() - 0.5) * 0.0005, ph: Math.random() * Math.PI * 2,
    }));
    let t = 0;
    let raf = 0;
    const draw = () => {
      t += 1;
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#150726");
      sky.addColorStop(0.5, "#1c0b30");
      sky.addColorStop(1, "#05030a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const mx = w * 0.78;
      const my = h * 0.24;
      const mr = Math.min(w, h) * 0.1;
      const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3.1);
      halo.addColorStop(0, "rgba(255,212,140,.34)");
      halo.addColorStop(1, "rgba(255,212,140,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffe7b0";
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(206,164,104,.36)";
      for (const cr of [{ x: -0.32, y: -0.2, r: 0.2 }, { x: 0.26, y: 0.12, r: 0.15 }, { x: -0.04, y: 0.42, r: 0.11 }]) {
        ctx.beginPath();
        ctx.arc(mx + cr.x * mr, my + cr.y * mr, cr.r * mr, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#ffffff";
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.6 * Math.abs(Math.sin(t * 0.02 + s.tw));
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const b of bats) {
        b.x += b.sp * 0.0022;
        if (b.x < -0.12) b.x = 1.12;
        if (b.x > 1.12) b.x = -0.12;
        const by = (b.y + Math.sin(t * 0.03 + b.ph) * 0.02) * h;
        drawBat(ctx, b.x * w, by, 0.9 * b.s, 0.5 + 0.5 * Math.sin(t * 0.26 + b.flap));
      }

      ctx.fillStyle = "#0a0512";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.82);
      for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * w;
        const y = h * 0.82 - Math.sin(i * 1.3) * h * 0.05 - (i % 2 ? h * 0.03 : 0);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#060309";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.9);
      for (let i = 0; i <= 12; i++) {
        const x = (i / 12) * w;
        const y = h * 0.9 - Math.cos(i * 0.9) * h * 0.045;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      const pcount = Math.max(5, Math.round(w / 230));
      for (let i = 0; i < pcount; i++) {
        const px = ((i + 0.5) / pcount) * w + Math.sin(t * 0.012 + i) * 4;
        const py = h * 0.965;
        const pr = Math.min(w, h) * 0.031 + (i % 3) * 2;
        drawPumpkin(ctx, px, py, pr);
      }

      for (const e of embers) {
        e.y -= e.sp * 3;
        e.x += e.drift;
        if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); }
        const fl = 0.5 + 0.5 * Math.sin(t * 0.05 + e.ph);
        ctx.globalAlpha = 0.3 + 0.55 * fl;
        ctx.fillStyle = "#ff9a3c";
        ctx.beginPath();
        ctx.arc(e.x * w, e.y * h, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (let i = 0; i < 3; i++) {
        const fy = h * (0.72 + i * 0.09) + Math.sin(t * 0.006 + i) * 8;
        const fog = ctx.createLinearGradient(0, fy - 50, 0, fy + 70);
        fog.addColorStop(0, "rgba(120,110,160,0)");
        fog.addColorStop(0.5, `rgba(140,130,190,${0.05 + 0.02 * i})`);
        fog.addColorStop(1, "rgba(120,110,160,0)");
        ctx.fillStyle = fog;
        ctx.fillRect(0, fy - 50, w, 120);
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <div className={`hallo-wp ${className ?? ""}`} aria-hidden="true">
      <canvas ref={ref} className="hallo-wp-canvas" />
    </div>
  );
}

const BAT_PATH = "M24 7 C21 1 15 2 10 5 C6 7 2 6 0 10 C4 10 7 12 9 16 C13 12 18 11 24 14 C30 11 35 12 39 16 C41 12 44 10 48 10 C46 6 42 7 38 5 C33 2 27 1 24 7 Z";
const WEB_MARKUP = (
  <g fill="none" stroke="rgba(235,235,255,.6)" strokeWidth="1.3">
    <line x1="0" y1="0" x2="120" y2="0" />
    <line x1="0" y1="0" x2="0" y2="120" />
    <line x1="0" y1="0" x2="96" y2="96" />
    <line x1="0" y1="0" x2="120" y2="38" />
    <line x1="0" y1="0" x2="38" y2="120" />
    <path d="M26 0 A26 26 0 0 1 0 26" />
    <path d="M52 0 A52 52 0 0 1 0 52" />
    <path d="M80 0 A80 80 0 0 1 0 80" />
    <path d="M108 0 A108 108 0 0 1 0 108" />
  </g>
);

const DECOR_BATS = [
  { top: "16%", dur: "24s", delay: "0s" },
  { top: "30%", dur: "31s", delay: "-6s" },
  { top: "10%", dur: "37s", delay: "-14s" },
  { top: "42%", dur: "28s", delay: "-3s" },
  { top: "24%", dur: "34s", delay: "-21s" },
];

export function HalloweenDecor() {
  return (
    <div className="hallo-decor" aria-hidden="true">
      <svg className="hallo-web hallo-web--tl" viewBox="0 0 120 120">{WEB_MARKUP}</svg>
      <svg className="hallo-web hallo-web--tr" viewBox="0 0 120 120">{WEB_MARKUP}</svg>
      <div className="hallo-fog" />
      {DECOR_BATS.map((b, i) => (
        <svg
          key={i}
          className="hallo-bat"
          viewBox="0 0 48 24"
          style={{ "--top": b.top, "--dur": b.dur, "--d": b.delay } as CSSProperties}
        >
          <path d={BAT_PATH} fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}
