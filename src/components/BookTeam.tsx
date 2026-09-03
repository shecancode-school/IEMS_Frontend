"use client";

import Link from "next/link";
import { ArrowRight, Clock, Video } from "lucide-react";
import { useBookingHosts } from "@/hooks/booking";
import { ROLE_LABELS, type AdminRole } from "@/types/admin";
import { HostAvatar } from "@/components/HostAvatar";

/* Who you can book, on the public site.

   /book has always listed this, and nothing on the site linked to it — so a
   visitor could only find the booking flow by guessing the URL. Being
   available to meet people is not something that should require knowing a
   secret path, so the people themselves go on the landing page: face, name,
   what they do, and one button.

   The section renders nothing at all when nobody is taking bookings. An empty
   "Book our team" heading over a blank row would advertise a service the
   organisation is not currently offering. */

function HostCard({
  slug,
  name,
  title,
  role,
  bio,
  avatarUrl,
  slotMinutes,
  online,
}: {
  slug: string;
  name: string;
  title: string | null;
  role: string;
  bio: string;
  avatarUrl: string | null;
  slotMinutes: number;
  online: boolean;
}) {
  return (
    <Link
      href={`/book/${slug}`}
      className="group flex flex-col rounded-2xl border border-line bg-panel p-5 transition-all hover:-translate-y-0.5 hover:border-orange"
    >
      <div className="flex items-start gap-4">
        <HostAvatar name={name} src={avatarUrl} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-cream">{name}</p>
          {/* their title is the thing a visitor is choosing on — it leads,
              and falls back to the role label rather than being blank */}
          <p className="label mt-0.5 truncate text-xs font-semibold text-orange">
            {title || ROLE_LABELS[role as AdminRole] || role}
          </p>
        </div>
      </div>

      {bio && <p className="mt-3 line-clamp-3 text-sm text-cream-dim">{bio}</p>}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-cream-dim">
        <li className="flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden />
          {slotMinutes} minutes
        </li>
        {online && (
          <li className="flex items-center gap-1.5">
            <Video className="size-3.5" aria-hidden />
            Google Meet link
          </li>
        )}
      </ul>

      <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-cream transition-colors group-hover:text-orange">
        See their open times
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start gap-4">
        <span className="size-14 shrink-0 animate-pulse rounded-full bg-panel-2" />
        <div className="flex-1 space-y-2 pt-1">
          <span className="block h-4 w-2/3 animate-pulse rounded bg-panel-2" />
          <span className="block h-3 w-1/3 animate-pulse rounded bg-panel-2" />
        </div>
      </div>
      <span className="mt-4 block h-3 w-full animate-pulse rounded bg-panel-2" />
      <span className="mt-2 block h-3 w-4/5 animate-pulse rounded bg-panel-2" />
    </div>
  );
}

export default function BookTeam() {
  const { data, isPending, isError } = useBookingHosts();

  /* Nothing to advertise, or we could not find out — either way the section
     stays out of the page rather than showing a hopeful empty state. */
  if (isError || (!isPending && (data ?? []).length === 0)) return null;

  return (
    <section id="book" className="bg-bg py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label mb-2 text-sm font-semibold text-sage">Talk to us</p>
            <h2 className="display text-3xl text-cream sm:text-4xl">Book a conversation</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream-dim">
              Pick someone below to see when they are free and claim a time. You will get a
              confirmation email with the details and a link to cancel if plans change.
            </p>
          </div>
          <Link
            href="/book"
            className="flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-orange hover:text-orange"
          >
            See everyone
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending
            ? [0, 1, 2].map((i) => <CardSkeleton key={i} />)
            : /* three is a row; the rest live on /book */
              (data ?? []).slice(0, 6).map((host) => <HostCard key={host.slug} {...host} />)}
        </div>
      </div>
    </section>
  );
}
