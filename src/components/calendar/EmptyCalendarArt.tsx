/* The empty state for the public calendar.

   Drawn inline rather than shipped as an image: it costs no request, stays
   crisp at any size, and — because every colour is a site token — it follows
   the theme instead of being a rectangle of the wrong green. The torn top
   strip echoes the TornEdge motif the rest of the page uses.

   Purely decorative, so the SVG is aria-hidden and the message beside it
   carries the meaning.

   Three sizes because the same state appears in three very different holes:
   laid over a full month grid, inside the day panel, and at the top of an
   empty agenda. One size meant it either swamped the panel or vanished on the
   grid. The brief is that an empty state should help without taking over. */

const SIZES = {
  sm: { art: "h-16 w-20", pad: "px-5 py-8", title: "text-sm" },
  md: { art: "h-24 w-28 sm:h-28 sm:w-32", pad: "px-6 py-12", title: "text-sm" },
  lg: { art: "h-28 w-32 sm:h-32 sm:w-36", pad: "px-6 py-16", title: "text-base" },
} as const;

export function EmptyCalendarArt({
  title = "Nothing scheduled yet",
  message,
  size = "md",
  action,
  className = "",
}: {
  title?: string;
  message?: string;
  size?: keyof typeof SIZES;
  /** an escape route out of the empty state, when there is a sensible one */
  action?: React.ReactNode;
  className?: string;
}) {
  const s = SIZES[size];

  return (
    <div className={`flex flex-col items-center text-center ${s.pad} ${className}`}>
      <svg viewBox="0 0 120 104" aria-hidden="true" className={s.art}>
        {/* page */}
        <rect
          x="8"
          y="14"
          width="104"
          height="82"
          rx="10"
          fill="var(--panel-2)"
          stroke="var(--line)"
          strokeWidth="2"
        />
        {/* header band */}
        <path d="M8 24a10 10 0 0 1 10-10h84a10 10 0 0 1 10 10v10H8z" fill="var(--green-deep)" />
        {/* binding rings */}
        <rect x="30" y="6" width="6" height="16" rx="3" fill="var(--orange)" />
        <rect x="84" y="6" width="6" height="16" rx="3" fill="var(--orange)" />
        {/* week rows — deliberately empty, that is the message */}
        {[46, 62, 78].map((y) => (
          <g key={y}>
            {[18, 39, 60, 81].map((x) => (
              <rect
                key={x}
                x={x}
                y={y}
                width="15"
                height="9"
                rx="3"
                fill="var(--line)"
                opacity="0.5"
              />
            ))}
          </g>
        ))}
        {/* one highlighted day, so it reads as a calendar rather than a table */}
        <rect x="39" y="46" width="15" height="9" rx="3" fill="var(--orange)" opacity="0.85" />
      </svg>

      <p className={`mt-4 font-semibold text-cream ${s.title}`}>{title}</p>
      {message && <p className="mt-1 max-w-xs text-sm text-cream-dim">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
