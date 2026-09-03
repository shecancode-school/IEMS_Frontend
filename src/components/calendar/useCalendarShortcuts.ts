"use client";

import { useEffect } from "react";
import type { CalendarView } from "./CalendarToolbar";

/* The shortcuts every calendar application has and this one did not: T for
   today, D/W/M for the views, ← and → to step. Google, Outlook, Fantastical
   and Cal.com all agree on these, so they are the ones people already have in
   their fingers.

   Two guards matter. Anything typed into a field, a textarea or a
   contenteditable belongs to that field — the ActivityDialog sits on this page
   and typing "Monday" into its title must not throw the board into Month view.
   And a modifier means the browser or the OS is being addressed, not us. */
export function useCalendarShortcuts({
  onView,
  onPrev,
  onNext,
  onToday,
  enabled = true,
}: {
  onView: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** false while a dialog owns the keyboard */
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return;
      }

      /* The month grid is an ARIA grid and owns the arrow keys for walking
         between days; stepping the whole board with them there would fight it. */
      const inGrid = el?.closest('[role="grid"]');

      switch (e.key) {
        case "t":
        case "T":
          onToday();
          break;
        case "d":
        case "D":
          onView("day");
          break;
        case "w":
        case "W":
          onView("week");
          break;
        case "m":
        case "M":
          onView("month");
          break;
        case "ArrowLeft":
          if (inGrid) return;
          onPrev();
          break;
        case "ArrowRight":
          if (inGrid) return;
          onNext();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onView, onPrev, onNext, onToday, enabled]);
}
