// Per-device state (localStorage). Every access is guarded: private mode or blocked storage just means "not saved".
"use client";
import { useEffect, useState } from "react";

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not persisted on this device */
  }
}

/** useState that loads after mount (no hydration mismatch) and saves on every change. */
export function useDeviceState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, boolean] {
  const [val, setVal] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setVal(readJSON(key, initial)); setLoaded(true); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: T | ((p: T) => T)) =>
    setVal((prev) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      writeJSON(key, next);
      return next;
    });
  return [val, set, loaded];
}
