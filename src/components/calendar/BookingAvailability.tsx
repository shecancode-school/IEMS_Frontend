"use client";

import Link from "next/link";
import { useHostSlots } from "@/lib/useHostSlots";
import { kigaliHHmm } from "@/lib/time";

/* "Can I book them?" answered on the calendar itself, for the day you are
   looking at.

   The slots come from the same public endpoint the booking page uses, so what
   you see here is what you get when you follow the link — no second source of
   truth to drift. Nothing books from this panel: it shows the times and hands
   the visitor to /book/<slug>, which is where the name, email and confirmation
   email belong. */

function SlotList({ slug, times }: { slug: string; times: { start: string; end: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {times.map((s) => (
        <li key={s.start}>
          <Link
            href={`/book/${slug}?slot=${encodeURIComponent(s.start)}`}
            className="block rounded-lg border border-sage/50 bg-sage/10 px-2.5 py-1.5 text-xs font-semibold text-cream transition-colors hover:border-orange hover:text-orange"
          >
            {kigaliHHmm(s.start)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BookingAvailability({
  slug,
  name,
  dayISO,
}: {
  slug: string;
  name: string;
  dayISO: string;
}) {
  /* isLoading rather than isPending: the query is disabled without a slug, and
     a disabled query stays "pending" forever — the skeleton would never stop. */
  const { data, isLoading, isError } = useHostSlots(slug, dayISO);

  return (
    <section className="mt-4 rounded-xl border border-dashed border-line bg-panel-2/40 p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-cream">
          Open times with {name.split(" ")[0]}
        </h4>
        <Link
          href={`/book/${slug}`}
          className="text-xs font-semibold text-orange transition-colors hover:text-orange-deep"
        >
          See the full booking page →
        </Link>
      </div>

      {/* error first: on failure `data` is undefined, so testing for it before
          the error would leave the skeleton spinning forever */}
      {isError ? (
        <p className="text-sm text-cream-dim">
          Couldn&apos;t check availability just now — the booking page has the live times.
        </p>
      ) : isLoading || !data ? (
        <div role="status" aria-label="Checking availability" className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-7 w-16 animate-pulse rounded-lg bg-panel-2" />
          ))}
        </div>
      ) : data.slots.length === 0 ? (
        <p className="text-sm text-cream-dim">
          Fully booked on this day. Try another, or open the booking page to see the next
          free time.
        </p>
      ) : (
        <>
          <SlotList slug={slug} times={data.slots} />
          {/* An incomplete answer is stated, never smoothed over: these times
              come from the availability rules alone, so one of them may clash
              with something in a calendar we could not read. */}
          {!data.complete && (
            <p className="mt-2 text-xs text-cream-dim">
              Their live calendar was unavailable, so a time here may already be taken —
              the booking page will confirm.
            </p>
          )}
        </>
      )}
    </section>
  );
}
