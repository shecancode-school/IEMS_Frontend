"use client";

import { useState } from "react";
import Image from "next/image";
// import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CATEGORY_COLORS, isBookableEvent, nextEvent } from "@/lib/events";
import { useEvents } from "@/lib/useEvents";
import { useEventFlow } from "@/components/EventFlow";

/* each section borrows a colour from the event-category system so the
   menu and the calendar legend speak the same language */
const MENU = [
  {
    name: "About",
    heading: "Igire Rwanda",
    color: CATEGORY_COLORS.SheCanCODE,
    items: ["Our Story", "Team & Partners", "Photo Galleries"],
  },
  {
    name: "Happenings",
    heading: "What's On",
    color: CATEGORY_COLORS.Entrepreneurship,
    items: ["Events Calendar", "Bootcamps", "Workshops", "Info Sessions"],
  },
  {
    name: "Facilities",
    heading: "Our Spaces",
    color: CATEGORY_COLORS["Web Fundamentals"],
    items: ["Main Hall", "Studio B", "Makers Room", "Venue Hire"],
  },
  {
    name: "Connect",
    heading: "Get Involved",
    color: CATEGORY_COLORS["Advanced Backend"],
    items: ["Volunteer", "Membership", "News & Updates"],
  },
  {
    name: "Contact",
    heading: "Reach Us",
    color: CATEGORY_COLORS["Advanced Frontend"],
    items: ["Visit Us", "info@igirerwanda.org", "+250 780 000 000"],
  },
];

/* Rough paint-smear backdrop for the Attend our events button */
function Smear({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 156 44"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M8 14 Q2 4 18 5 L134 2 Q152 1 149 13 L152 29 Q154 41 138 39 L16 42 Q3 44 6 31 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Arrow({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  /* null = no section opened yet; the second panel stays hidden until then */
  const [active, setActive] = useState<number | null>(null);
  const { data: events, isPending } = useEvents();
  const { openEvent } = useEventFlow();
  const upNext = nextEvent(events ?? []);

  const openMenu = () => {
    setActive(null);
    setOpen(true);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line">
      {/* blur lives on its own layer: backdrop-filter on the header itself
          would trap the fixed menu inside it */}
      <div className="absolute inset-0 -z-10 bg-bg/90 backdrop-blur-md" />
      {/* four divisions — menu, logo, next event, CTA — share the row
          evenly, with equal space left over between each */}
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:h-20 sm:gap-4 sm:px-5">
        <button
          type="button"
          onClick={openMenu}
          className="flex items-center gap-3 text-cream transition-colors hover:text-orange"
          aria-expanded={open}
          aria-label="Open menu"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M3 7h18M3 12h18M3 17h18" />
          </svg>
          <span className="label hidden text-sm font-semibold sm:block">
            Menu
          </span>
        </button>

        <a
          href="#"
          className="flex items-center justify-center gap-3"
          aria-label="Igire Rwanda Organization — home"
        >
          <Image
            src="/iro-logo.svg"
            alt=""
            width={52}
            height={52}
            className="h-12 w-12 sm:h-14 sm:w-14"
          />
          <span className="display hidden text-xl leading-none text-cream md:block">
            Igire
            {/* <br /> */}
            Rwanda
          </span>
        </a>

        {/* next upcoming event, with a mini calendar icon showing its day */}
        {isPending && (
          <span
            aria-hidden="true"
            className="flex animate-pulse items-center gap-2.5"
          >
            <span className="h-10 w-10 rounded-md border border-line bg-panel-2" />
            <span className="hidden max-w-36 lg:block">
              <span className="block h-3 w-28 rounded bg-panel-2" />
              <span className="mt-1.5 block h-2.5 w-20 rounded bg-panel-2" />
            </span>
          </span>
        )}
        {upNext && (() => {
          /* A ticketed event opens the registration flow. A session has no
             ticket, so its chip points at the calendar instead — offering
             "register" for a class would promise something that does not
             exist. Same chip, different promise. */
          const bookable = isBookableEvent(upNext);
          const ChipTag = bookable ? "button" : "a";
          return (
          <ChipTag
            {...(bookable
              ? { type: "button" as const, onClick: () => openEvent(upNext) }
              : { href: "#calendar" })}
            className="flex cursor-pointer items-center gap-2.5 text-left"
            title={`${upNext.title} — ${upNext.time}, ${upNext.space}`}
            aria-label={
              bookable
                ? `Next event: ${upNext.title}, ${upNext.time}`
                : `Next on the calendar: ${upNext.title}, ${upNext.time} — see the calendar`
            }
          >
            <span className="flex h-10 w-10 flex-col overflow-hidden rounded-md border border-line">
              <span className="label bg-orange text-center text-[8px] font-bold leading-3.5 text-bg">
                {new Date(`${upNext.date}T00:00:00`)
                  .toLocaleDateString("en-US", { month: "short" })
                  .toUpperCase()}
              </span>
              <span className="flex flex-1 items-center justify-center bg-panel-2 text-sm font-bold text-cream">
                {new Date(`${upNext.date}T00:00:00`).getDate()}
              </span>
            </span>
            <span className="hidden max-w-36 lg:block">
              <span className="block truncate text-xs font-semibold text-cream">
                {upNext.title}
              </span>
              <span className="label block text-[10px] font-semibold text-cream-dim">
                {new Date(`${upNext.date}T00:00:00`).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" }
                )}{" "}
                · {upNext.time}
              </span>
            </span>
          </ChipTag>
          );
        })()}

        {/* <Link
          href="/verify"
          className="label hidden text-xs font-semibold text-cream transition-colors hover:text-orange md:block"
        >
          Get your ticket
        </Link> */}

        {/* Booking had no entry point anywhere on the public site — /book was
            reachable only by typing the URL. */}
        <a
          href="#book"
          className="label hidden text-xs font-semibold text-cream transition-colors hover:text-orange md:block"
        >
          Book a conversation
        </a>

        <a
          href="#calendar"
          className="group relative hidden px-5 py-2.5 text-sm font-semibold text-bg sm:block"
        >
          <Smear className="absolute inset-0 h-full w-full -rotate-1 text-orange transition-colors group-hover:text-orange-deep" />
          <span className="relative flex items-center gap-2">
            Attend our events
            <Arrow className="h-4 w-4" />
          </span>
        </a>

        {/* compact CTA for phones — keeps the primary action reachable where the
            full "Attend our events" button doesn't fit */}
        <a
          href="#calendar"
          aria-label="Attend our events"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange text-bg transition-colors hover:bg-orange-deep sm:hidden"
        >
          <Arrow className="h-5 w-5" />
        </a>
      </nav>

      {/* Slide-out menu: a dark left panel on its own; the coloured
          sub-panel only slides in beside it while a section is hovered,
          leaving the rest of the page visible */}
      <AnimatePresence>
        {open && (
          <div
            key="menu-backdrop"
            className="fixed inset-0 z-60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
        {open && (
          <motion.div
            key="menu-panels"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.35, ease: "easeOut" }}
            className="fixed inset-y-0 left-0 z-60 flex w-full flex-col overflow-y-auto md:w-auto md:flex-row md:overflow-visible"
          >
            {/* left: main links */}
            <div className="relative flex min-h-[60vh] flex-1 flex-col bg-bg p-6 sm:p-10 md:w-[36vw] md:min-w-88 md:flex-none">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-cream transition-colors hover:text-orange"
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>

              <Image
                src="/iro-logo.svg"
                alt=""
                width={110}
                height={110}
                className="absolute right-8 top-8 h-24 w-24 opacity-25 grayscale sm:h-28 sm:w-28"
              />

              <ul className="mt-auto space-y-1 pt-16">
                {MENU.map((entry, i) => (
                  <li key={entry.name}>
                    <button
                      type="button"
                      onClick={() => setActive(i)}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      aria-expanded={active === i}
                      className="group flex w-full items-center justify-between py-2.5 text-left"
                    >
                      <span className="flex items-center gap-4">
                        {/* legend dot, same swatch as the events calendar */}
                        <span
                          aria-hidden="true"
                          className={`h-3 w-3 shrink-0 rounded-full transition-transform duration-200 ${
                            active === i ? "scale-125" : "scale-100"
                          }`}
                          style={{ backgroundColor: entry.color }}
                        />
                        <span
                          className={
                            active === i
                              ? "display text-3xl uppercase transition-colors duration-200 sm:text-4xl"
                              : "text-3xl font-medium transition-colors duration-200 sm:text-4xl"
                          }
                          style={{
                            color:
                              active === i
                                ? entry.color
                                : `color-mix(in oklab, var(--cream) 82%, ${entry.color} 18%)`,
                          }}
                        >
                          {entry.name}
                        </span>
                      </span>
                      {active === i && (
                        <Arrow
                          className="mr-2 shrink-0"
                          style={{ color: entry.color }}
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* sub-panel: only exists while a section is hovered/focused */}
            <AnimatePresence>
              {active !== null && (
                <motion.aside
                  key="menu-subpanel"
                  initial={{ x: -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -40, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex flex-col justify-end p-6 pb-12 transition-colors duration-500 sm:p-10 md:w-[30vw] md:min-w-[20rem]"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--green-deep) 72%, ${MENU[active].color} 28%)`,
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={MENU[active].name}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      style={
                        {
                          "--menu-hover": `color-mix(in oklab, var(--cream) 45%, ${MENU[active].color} 55%)`,
                        } as React.CSSProperties
                      }
                    >
                      <div className="flex items-center gap-5">
                        <h2 className="display text-3xl uppercase text-cream sm:text-4xl">
                          {MENU[active].heading}
                        </h2>
                        <Arrow className="text-cream" />
                      </div>
                      <ul className="mt-7 space-y-5">
                        {MENU[active].items.map((item) => (
                          <li key={item}>
                            <a
                              href="#calendar"
                              onClick={() => setOpen(false)}
                              className="text-2xl font-medium text-cream/90 transition-colors hover:text-(--menu-hover) sm:text-3xl"
                            >
                              {item}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  </AnimatePresence>
                </motion.aside>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
