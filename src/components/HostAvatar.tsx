"use client";

/* eslint-disable @next/next/no-img-element */

/* A person's face on the public site, with a real fallback.

   Most staff have no photo uploaded, and an empty grey circle next to
   someone's name reads as "this profile is broken". Initials on a colour
   derived from their name are stable, recognisable and never look like a
   loading state.

   A plain <img> rather than next/image: these are Cloudinary URLs on an
   allow-list we do not control, and a remote host that is not configured in
   next.config makes the whole page throw rather than the one avatar. */

/* Same hashing idea as personColor in the admin calendar — a person keeps
   their colour across reloads without anything being stored. */
const TONES = [
  "#f59300",
  "#e2603a",
  "#d4b458",
  "#7cc35a",
  "#a9d4a0",
  "#5aa9c3",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function HostAvatar({
  name,
  src,
  className = "size-14",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        className={`${className} shrink-0 rounded-full object-cover ring-2 ring-line`}
      />
    );
  }

  const tone = toneFor(name);
  return (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-full font-bold text-bg ring-2 ring-line`}
      style={{ backgroundColor: tone }}
    >
      {initials(name)}
    </span>
  );
}
