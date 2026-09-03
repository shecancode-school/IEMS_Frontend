"use client";

import { Globe, Lock, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCES, SOURCE_ACCENT, SOURCE_LABEL } from "./colors";

/* Colour on a calendar is only useful if it means something you can look up.

   Two changes from the original. The source swatches are gone from here: the
   toolbar's source filters now carry the same colours as the chips they
   govern, so the control and the key are the same thing — printing both meant
   the same four words twice, in a full row of vertical space above the fold.
   What is left is the icon key, which the toolbar has nowhere to say.

   `sources` puts the swatches back for a caller that has no source filters,
   so the key is never absent where the colours are unexplained. /calendar/me
   used to be exactly that case: it showed the colours and no legend at all. */

export function CalendarLegend({
  className,
  sources = false,
}: {
  className?: string;
  sources?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {sources && (
        <>
          {SOURCES.map((source) => (
            <span key={source} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: SOURCE_ACCENT[source] }}
              />
              {SOURCE_LABEL[source]}
            </span>
          ))}
          <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
        </>
      )}

      <span className="flex items-center gap-1.5">
        <Globe className="size-3.5" aria-hidden />
        On the public site
      </span>
      <span className="flex items-center gap-1.5">
        <Video className="size-3.5" aria-hidden />
        Has a meeting link
      </span>
      <span className="flex items-center gap-1.5">
        <Lock className="size-3.5" aria-hidden />
        Private busy only
      </span>
    </div>
  );
}
