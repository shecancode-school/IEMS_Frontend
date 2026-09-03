"use client";

import { useState } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del, createStore, type UseStore } from "idb-keyval";
import { makeStore } from "@/store/store";
import { AuthProvider } from "@/context/AuthContext";
import { EventFlowProvider } from "@/components/EventFlow";

const ONE_DAY = 1000 * 60 * 60 * 24;
/* bump when a persisted query's response shape changes, so stale caches from
   an older build are discarded on load instead of crashing the UI */
const CACHE_VERSION = "2026-07-16-health";

/* IndexedDB is a nice-to-have here: it makes a reload paint instantly, and
   nothing is stored in it that the server cannot re-send. But it is also the
   least reliable storage a browser offers — Firefox private windows, a full
   disk, a corrupted profile or third-party-storage blocking all make it throw
   `UnknownError: The operation failed for reasons unrelated to the database
   itself`, which surfaced as an unhandled console error on every page load.

   So every access is guarded, and the FIRST failure disables the store for
   the rest of the session. That matters: without the latch a broken profile
   throws once per query per render, filling the console and burning time on
   an operation that will never succeed. The cache degrades to memory-only,
   which is exactly how the app behaves on a first visit. */
function createPersister() {
  let store: UseStore | undefined;
  let disabled = false;

  if (typeof window !== "undefined") {
    try {
      store = createStore("iems", "query-cache");
    } catch {
      disabled = true;
    }
  }

  /* one line, once — enough to explain a missing cache without shouting */
  const drop = () => {
    if (disabled) return;
    disabled = true;
    store = undefined;
    console.info("Offline query cache unavailable — running from memory only.");
  };

  async function guard<T>(run: (s: UseStore) => Promise<T>, fallback: T): Promise<T> {
    if (disabled || !store) return fallback;
    try {
      return await run(store);
    } catch {
      drop();
      return fallback;
    }
  }

  return createAsyncStoragePersister({
    storage: {
      getItem: (key) => guard((s) => get<string>(key, s).then((v) => v ?? null), null),
      setItem: (key, value) => guard((s) => set(key, value, s), undefined),
      removeItem: (key) => guard((s) => del(key, s), undefined),
    },
    key: "iems.query-cache",
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  /* One store per client instance, so App Router navigations cannot leak state
     between requests during SSR. It starts empty on both sides: both sessions
     live in httpOnly cookies, so they are restored by asking the server
     (AuthProvider does this on mount) rather than seeded from browser storage. */
  const [store] = useState(() => makeStore());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            /* keep entries around long enough to be worth persisting */
            gcTime: ONE_DAY,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  /* TanStack's own cache persister, backed by IndexedDB — a refresh
     restores the last query results from storage, so pages paint instantly
     and only refetch to reconcile changes. IndexedDB is async, so we use
     the async persister; on the server it falls back to no-op storage. */
  const [persister] = useState(() => createPersister());

  return (
    <ReduxProvider store={store}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: ONE_DAY, buster: CACHE_VERSION }}
      >
        <AuthProvider>
          <EventFlowProvider>{children}</EventFlowProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ReduxProvider>
  );
}
