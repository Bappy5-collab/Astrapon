"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-device display preferences (3D quality, motion). Stored in localStorage when available;
 * every access is guarded so private windows and blocked storage simply fall back to defaults.
 */

export type QualityPreference = "auto" | "low" | "balanced" | "high";
export type MotionPreference = "system" | "reduce";

const KEYS = { quality: "fs.quality", motion: "fs.motion" } as const;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts for this page view only.
  }
  memory.set(key, value);
  listeners.forEach((l) => l());
}

const memory = new Map<string, string>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};

const get = (key: string) => memory.get(key) ?? read(key);

export function useQualityPreference(): [QualityPreference, (q: QualityPreference) => void] {
  const v = useSyncExternalStore(subscribe, () => get(KEYS.quality), () => null);
  const q: QualityPreference = v === "low" || v === "balanced" || v === "high" ? v : "auto";
  return [q, (next) => write(KEYS.quality, next)];
}

export function useMotionPreference(): [MotionPreference, (m: MotionPreference) => void] {
  const v = useSyncExternalStore(subscribe, () => get(KEYS.motion), () => null);
  return [v === "reduce" ? "reduce" : "system", (next) => write(KEYS.motion, next)];
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia(reducedQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** True when the device asks for reduced motion or the user chose it in Settings. */
export function useReducedMotion(): boolean {
  const system = useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => true);
  const [pref] = useMotionPreference();
  return system || pref === "reduce";
}
