"use client";

import { useState } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del, createStore, type UseStore } from "idb-keyval";
import { makeStore } from "@/store/store";
import { preloadedAuthState } from "@/lib/authStorage";
import { AuthProvider } from "@/context/AuthContext";
import { EventFlowProvider } from "@/components/EventFlow";

const ONE_DAY = 1000 * 60 * 60 * 24;
/* bump when a persisted query's response shape changes, so stale caches from
   an older build are discarded on load instead of crashing the UI */
const CACHE_VERSION = "2026-07-16-health";

export default function Providers({ children }: { children: React.ReactNode }) {
  /* one store per client instance, preloaded from localStorage on the client */
  const [store] = useState(() =>
    makeStore(typeof window !== "undefined" ? preloadedAuthState() : undefined)
  );
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
  const [persister] = useState(() => {
    const store: UseStore | undefined =
      typeof window !== "undefined" ? createStore("iems", "query-cache") : undefined;
    return createAsyncStoragePersister({
      storage: {
        getItem: (key) => (store ? get(key, store) : Promise.resolve(null)),
        setItem: (key, value) => (store ? set(key, value, store) : Promise.resolve()),
        removeItem: (key) => (store ? del(key, store) : Promise.resolve()),
      },
      key: "iems.query-cache",
    });
  });

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
