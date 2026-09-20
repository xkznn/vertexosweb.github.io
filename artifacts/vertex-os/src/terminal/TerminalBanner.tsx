import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { artColumns, bannerLineColors, splitArt, type TerminalPalette } from "./banners";

type Props = {
  art: string;
  palette: TerminalPalette;
  baseSize: number;
  fontKey?: string;
  align?: "left" | "center";
};

const MIN_SIZE = 4;

/**
 * Renders a large ASCII/Unicode banner that scales down to fit its container,
 * so the art never wraps or breaks on narrow screens.
 */
export function TerminalBanner({ art, palette, baseSize, fontKey, align = "center" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLPreElement>(null);
  const [size, setSize] = useState(baseSize);

  const lines = useMemo(() => splitArt(art), [art]);
  const colors = useMemo(() => bannerLineColors(lines.length, palette), [lines, palette]);
  const widest = useMemo(() => {
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
    return longest || " ";
  }, [lines]);
  const columns = useMemo(() => artColumns(lines), [lines]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const probe = probeRef.current;
    if (!wrap || !probe) return;
    let frame = 0;
    const fit = () => {
      const available = wrap.clientWidth - 2;
      const natural = probe.getBoundingClientRect().width;
      if (available <= 0 || natural <= 0) return;
      const next = Math.max(MIN_SIZE, Math.min(baseSize, (baseSize * available) / natural));
      setSize((current) => (Math.abs(current - next) > 0.05 ? next : current));
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };
    schedule();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(wrap);
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [baseSize, widest, fontKey]);

  return (
    <div className={`term-banner-wrap ${align === "center" ? "is-center" : ""}`} ref={wrapRef} data-columns={columns}>
      <span className="term-banner-probe-box" aria-hidden="true">
        <pre className="term-banner-probe" ref={probeRef} style={{ fontSize: `${baseSize}px` }}>{widest}</pre>
      </span>
      <pre className="term-banner-art" style={{ fontSize: `${size}px` }} role="img" aria-label="Vertex-OS ASCII banner">
        {lines.map((line, index) => (
          <span className="term-banner-line" key={index} style={{ color: colors[index] ?? palette.from }}>
            {line || " "}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}
