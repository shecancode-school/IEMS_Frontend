"use client";

import { useEffect, useState } from "react";
import { subscribeLiveStatus, type ConnState } from "@/lib/liveStream";

export type Strength = "strong" | "good" | "weak" | "offline";

export type LiveConnection = {
  state: ConnState;
  /** connection handshake time, ms */
  latencyMs: number | null;
  /** how many times the stream has dropped and reconnected */
  reconnects: number;
  /** ms timestamp of the current open connection */
  since: number | null;
  strength: Strength;
};

const INITIAL: LiveConnection = {
  state: "connecting",
  latencyMs: null,
  reconnects: 0,
  since: null,
  strength: "offline",
};

function grade(state: ConnState, latencyMs: number | null): Strength {
  if (state === "connecting") return "offline";
  if (state === "error") return "weak";
  if (latencyMs == null) return "good";
  return latencyMs < 400 ? "strong" : latencyMs < 1200 ? "good" : "weak";
}

/* Reports the health of the app's shared live socket — reuses the one
   connection the notifications/scans already run on (no second EventSource),
   grading the signal by handshake latency. */
export function useLiveConnection(): LiveConnection {
  const [conn, setConn] = useState<LiveConnection>(INITIAL);

  useEffect(() => {
    return subscribeLiveStatus("admin", (s) => {
      setConn({
        state: s.state,
        latencyMs: s.latencyMs,
        reconnects: s.reconnects,
        since: s.since,
        strength: grade(s.state, s.latencyMs),
      });
    });
  }, []);

  return conn;
}
