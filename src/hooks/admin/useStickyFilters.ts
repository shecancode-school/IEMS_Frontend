"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/* Table filters that survive navigation.

   Order of precedence on mount:
     1. the URL query string — deep links and the browser Back button win, and
        it renders identically on the server so there's no hydration mismatch;
     2. sessionStorage — so coming back to the page from anywhere else (sidebar,
        a row detail view, a fresh tab in the same session) restores the last
        selection.

   Changes are written to both. The URL is updated with the native History API
   rather than router.replace so the route isn't re-rendered on every keystroke;
   Next keeps useSearchParams in sync with it. */

const storageKey = (key: string) => `iems:admin-filters:${key}`;

function readStored<T extends Record<string, string>>(key: string, defaults: T): Partial<T> {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of Object.keys(defaults)) {
      if (typeof parsed[k] === "string") out[k] = parsed[k] as string;
    }
    return out as Partial<T>;
  } catch {
    return {};
  }
}

export function useStickyFilters<T extends Record<string, string>>(key: string, defaults: T) {
  const searchParams = useSearchParams();
  /* callers pass an object literal — pin the first one so the effects below
     don't re-run on every render */
  const [base] = useState(defaults);
  const keys = Object.keys(base);

  /* seed from the URL (server and client agree on this) */
  const [filters, setFilters] = useState<T>(() => {
    const seeded = { ...base };
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v !== null) seeded[k as keyof T] = v as T[keyof T];
    }
    return seeded;
  });

  const hasUrlFilters = keys.some((k) => searchParams.get(k) !== null);
  const restored = useRef(false);

  /* fall back to the last selection for this table when the URL carries none */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (hasUrlFilters) return;
    const stored = readStored(key, base);
    if (Object.keys(stored).length > 0) setFilters((f) => ({ ...f, ...stored }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /* mirror the active selection into the URL + sessionStorage */
  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(storageKey(key), JSON.stringify(filters));
    } catch {
      /* private mode / storage full — the URL still carries the selection */
    }
    const params = new URLSearchParams(window.location.search);
    for (const k of keys) {
      if (filters[k] && filters[k] !== base[k]) params.set(k, filters[k]);
      else params.delete(k);
    }
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, filters]);

  const setFilter = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
    setFilters((f) => (f[name] === value ? f : { ...f, [name]: value }));
  }, []);

  const reset = useCallback(() => setFilters(base), [base]);

  /* true when anything is narrowed down — drives the "Clear" affordance */
  const isFiltered = keys.some((k) => filters[k] !== base[k]);

  return { filters, setFilter, reset, isFiltered };
}
