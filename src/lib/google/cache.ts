/* A short in-process cache for Google reads. Same globalThis convention as
   lib/scanBus.ts and the events cache in api/events/route.ts, and the same
   caveat: it degrades to "colder" across multiple instances and nothing may
   depend on it for correctness. Availability is always re-checked against
   Google immediately before a booking is written. */

type Entry = { value: unknown; expires: number };

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

const store: Map<string, Entry> =
  (globalThis as { __iemsGoogleCache?: Map<string, Entry> }).__iemsGoogleCache ??
  ((globalThis as { __iemsGoogleCache?: Map<string, Entry> }).__iemsGoogleCache = new Map());

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const value = await load();
  /* crude but bounded: drop the oldest insertion when full */
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

/* Call after any write to a staff member's calendar so the next read is fresh. */
export function invalidateAdmin(adminId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(`${adminId}|`)) store.delete(key);
  }
}
