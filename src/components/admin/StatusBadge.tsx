import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* Small status pill with a consistent colour language across the admin:
   green = good/live, amber = pending/attention, red = closed/revoked,
   zinc = neutral/draft. */
const TONE: Record<string, string> = {
  green: "border-transparent bg-green-100 text-green-800",
  amber: "border-transparent bg-amber-100 text-amber-800",
  red: "border-transparent bg-red-100 text-red-700",
  blue: "border-transparent bg-sky-100 text-sky-800",
  zinc: "border-transparent bg-stone-100 text-stone-600",
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
