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
      /* a scan means someone is at the gate working — refresh presence */
      qc.invalidateQueries({ queryKey: adminKeys.directory });
    };
    const offLive = subscribeLive("admin", {
      onScan: onActivity,
      onNotification: onActivity,
    });

    /* Content changes (an event published, an activity scheduled, a booking
       taken or cancelled) touch the event lists and stats — and also the
       calendar surfaces and the directory, since someone's "busy now" state
       moves the moment a booking lands on their calendar.

       The directory still polls on its own as well: most transitions are just
       time passing — a meeting starting — which produces no event to stream. */
    const offEvents = subscribeEventsFeed(() => {
      qc.invalidateQueries({ queryKey: adminKeys.events });
      qc.invalidateQueries({ queryKey: adminKeys.eventStats });
      qc.invalidateQueries({ queryKey: adminKeys.dashboard });
      qc.invalidateQueries({ queryKey: ["admin", "event-engagement"] });
      /* prefix keys, so every date-range and filter variant is caught */
      qc.invalidateQueries({ queryKey: adminKeys.calendarAll });
      qc.invalidateQueries({ queryKey: ["admin", "my-calendar"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-day"] });
      qc.invalidateQueries({ queryKey: adminKeys.directory });
      qc.invalidateQueries({ queryKey: adminKeys.bookingsAll });
    });

    return () => {
      offLive();
      offEvents();
    };
  }, [qc]);
}
