export type PerfInfo = {
  low: boolean;
  reducedMotion: boolean;
  cores: number;
  memoryGb: number;
};

function detect(): PerfInfo {
  if (typeof navigator === "undefined") {
    return { low: true, reducedMotion: false, cores: 2, memoryGb: 2 };
  }
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  return {
    low: reducedMotion || cores <= 4 || mem <= 4,
    reducedMotion,
    cores,
    memoryGb: mem,
  };
}

export const PERF = detect();