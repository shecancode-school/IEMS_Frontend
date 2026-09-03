"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { type VenueEvent, isBookableEvent } from "@/lib/events";

/* Clicking any event on the site funnels through here: the terms &
   conditions pop out first, and only after the visitor agrees do we
   take them to the event's own view page. */

const EventFlowContext = createContext<{
  openEvent: (event: VenueEvent) => void;
} | null>(null);

export function useEventFlow() {
  const ctx = useContext(EventFlowContext);
  if (!ctx) throw new Error("useEventFlow must be used inside EventFlowProvider");
  return ctx;
}

/* Shown when an event has no terms of its own */
const DEFAULT_RULES = [
  "Bring a valid ID — tickets are checked at the door.",
  "Doors open one hour before start.",
  "Your ticket QR code is personal and can only be scanned once.",
];

export function EventFlowProvider({ children }: { children: React.ReactNode }) {
  const [event, setEvent] = useState<VenueEvent | null>(null);
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();

  const openEvent = useCallback((e: VenueEvent) => {
    /* A session is not a ticketed event and must never open this flow.

       Every call site is supposed to check isBookableEvent first, and Nav did
       not — so clicking the "next up" chip when the next thing on the calendar
       was a class opened a registration form for something with no tickets, no
       capacity and no price. Guarding at the single choke point means a future
       call site cannot reintroduce it. */
    if (!isBookableEvent(e)) return;
    setAgreed(false);
    setEvent(e);
  }, []);

  const close = useCallback(() => setEvent(null), []);

  /* Escape closes, and the page behind the popup stays put */
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [event, close]);

  /* terms accepted → head to the event's own view page */
  const proceed = () => {
    if (!event || !agreed) return;
    const id = event.id;
    close();
    router.push(`/events/${encodeURIComponent(id)}`);
  };

  const rules = event && event.rules.length > 0 ? event.rules : DEFAULT_RULES;

  return (
    <EventFlowContext.Provider value={{ openEvent }}>
      {children}

      <AnimatePresence>
        {event && (
          <motion.div
            key="terms-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="fixed inset-0 z-80 flex items-end justify-center bg-bg/80 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              key="terms-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="terms-title"
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
            >
              <div className="h-1.5 w-full bg-orange" />
              {/* the event's poster leads the dialog when one is uploaded */}
              {event.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.posterUrl}
                  alt={`${event.title} poster`}
                  className="max-h-52 w-full object-cover"
                />
              )}
              <div className="max-h-[80vh] overflow-y-auto p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label text-xs font-semibold text-orange">
                      Terms &amp; conditions
                    </p>
                    <h2
                      id="terms-title"
                      className="display mt-1 text-2xl uppercase text-cream sm:text-3xl"
                    >
                      {event.title}
                    </h2>
                    <p className="mt-1 text-sm text-cream-dim">
                      {new Date(`${event.date}T00:00:00`).toLocaleDateString(
                        "en-US",
                        { weekday: "long", month: "short", day: "numeric" }
                      )}{" "}
                      · {event.time}
                      {event.endTime && ` – ${event.endTime}`} · {event.space}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="shrink-0 text-cream-dim transition-colors hover:text-orange"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                <p className="mt-5 text-sm text-cream-dim">
                  Please read and accept the terms below before we take you to the
                  event page.
                </p>

                <ul className="mt-4 space-y-2.5 rounded-xl border border-line bg-panel-2 p-4">
                  {rules.map((rule) => (
                    <li key={rule} className="flex gap-2.5 text-sm text-cream">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange"
                      />
                      {rule}
                    </li>
                  ))}
                </ul>

                {event.soldOut && (
                  <p className="mt-4 rounded-lg bg-panel-2 px-4 py-2.5 text-sm text-cream-dim">
                    This event is fully booked — you can still verify your email
                    if you were pre-registered.
                  </p>
                )}

                <label className="mt-5 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-orange"
                  />
                  <span className="text-sm text-cream">
                    I have read and agree to the terms &amp; conditions for this
                    event.
                  </span>
                </label>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="cursor-pointer rounded-lg border border-line bg-panel-2 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-orange hover:text-orange"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={proceed}
                    disabled={!agreed}
                    className="cursor-pointer rounded-lg bg-orange px-5 py-2.5 text-sm font-semibold text-bg transition-colors enabled:hover:bg-orange-deep disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Agree &amp; continue
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </EventFlowContext.Provider>
  );
}
