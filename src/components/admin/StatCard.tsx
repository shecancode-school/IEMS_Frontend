import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* Tinted icon chips. Written as translucent overlays on a saturated hue
   rather than as the 100/700 light-mode pairs they used to be: the admin
   console is dark-only (`.admin-scope`), and a 100-weight background under
   700-weight text rendered as a pale block of near-invisible ink on it.
   An alpha tint reads correctly on either ground. */
const TONES = {
  orange: "bg-orange-500/15 text-orange-300",
  green: "bg-emerald-500/15 text-emerald-300",
  blue: "bg-sky-500/15 text-sky-300",
  zinc: "bg-muted text-muted-foreground",
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "zinc",
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof TONES;
  loading?: boolean;
}) {
  return (
    <Card className="gap-0 py-4 shadow-none">
      <CardContent className="flex items-center gap-3.5 px-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="display text-2xl font-semibold leading-none tabular-nums text-foreground">
              {value}
            </p>
          )}
          <p className="mt-1.5 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {hint && <p className="truncate text-[11px] text-muted-foreground/70">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
