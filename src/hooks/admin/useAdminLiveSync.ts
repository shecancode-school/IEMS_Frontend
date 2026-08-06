"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeLive, subscribeEventsFeed } from "@/lib/liveStream";
import { adminKeys } from "./keys";

/* Keeps the whole admin panel live: gate scans, new notifications and event
   edits stream in over SSE and invalidate the matching caches, so lists and
   stats refresh on their own without anyone reaching for the reload button. */
export function useAdminLiveSync() {
  const qc = useQueryClient();

  useEffect(() => {
    /* a check-in or admin notification moves tickets, headcounts and stats */
    const onActivity = () => {
      qc.invalidateQueries({ queryKey: adminKeys.dashboard });
      qc.invalidateQueries({ queryKey: adminKeys.eventStats });
      qc.invalidateQueries({ queryKey: adminKeys.ticketsAll });
      qc.invalidateQueries({ queryKey: adminKeys.participantsAll });
      qc.invalidateQueries({ queryKey: adminKeys.guestsAll });
      /* per-event engagement (reminder pool, plus-one split) + the email report
         all move with headcounts and sends — refresh them live too. Prefix keys
         match every id/filter variant. */
      qc.invalidateQueries({ queryKey: ["admin", "event-engagement"] });
      qc.invalidateQueries({ queryKey: ["admin", "emails"] });
    };
    const offLive = subscribeLive("admin", {
      onScan: onActivity,
      onNotification: onActivity,
    });

    /* event content changes (create/edit/publish) touch the event lists + stats */
    const offEvents = subscribeEventsFeed(() => {
      qc.invalidateQueries({ queryKey: adminKeys.events });
      qc.invalidateQueries({ queryKey: adminKeys.eventStats });
      qc.invalidateQueries({ queryKey: adminKeys.dashboard });
      qc.invalidateQueries({ queryKey: ["admin", "event-engagement"] });
    });

    return () => {
      offLive();
      offEvents();
    };
  }, [qc]);
}
