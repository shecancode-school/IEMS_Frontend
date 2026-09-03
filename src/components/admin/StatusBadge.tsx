import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* Small status pill with a consistent colour language across the admin:
   green = good/live, amber = pending/attention, red = closed/revoked,
   zinc = neutral/draft. */
/* Alpha tints rather than the 100/800 light-mode pairs these used to be. The
   admin console renders inside `.admin-scope`, which is dark: a bg-green-100
   pill with text-green-800 on it was a pale slab that read as disabled, and
   every status in the console wore one. */
const TONE: Record<string, string> = {
  green: "border-transparent bg-emerald-500/15 text-emerald-300",
  amber: "border-transparent bg-amber-500/15 text-amber-300",
  red: "border-transparent bg-destructive/15 text-destructive",
  blue: "border-transparent bg-sky-500/15 text-sky-300",
  zinc: "border-transparent bg-muted text-muted-foreground",
};

const MAP: Record<string, keyof typeof TONE> = {
  // event lifecycle / registration gate
  OPEN: "green",
  DRAFT: "zinc",
  CLOSED: "red",
  Upcoming: "blue",
  Ongoing: "green",
  Completed: "zinc",
  Full: "amber",
  // participant / registration
  APPROVED: "green",
  PENDING: "amber",
  REJECTED: "red",
  VERIFIED: "blue",
  COMPLETE: "green",
  // ticket
  VALID: "green",
  USED: "blue",
  REVOKED: "red",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = MAP[value] ?? "zinc";
  return (
    <Badge
      className={cn("rounded-xl px-2.5 py-0.5 text-[11px] font-medium capitalize", TONE[tone], className)}
    >
      {value.toLowerCase().replace(/_/g, " ")}
    </Badge>
  );
}
