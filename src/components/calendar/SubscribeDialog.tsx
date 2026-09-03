"use client";

import { useState } from "react";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useIcsUrl } from "@/hooks/admin/calendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/* Subscribing is the other half of the Google integration: connecting Google
   pulls your calendar into IEMS, this pushes your IEMS schedule back out to
   whatever calendar app you actually live in. */
export function SubscribeDialog() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data, isPending, isError, refetch } = useIcsUrl(open);
  /* the query only runs while the dialog is open, so `data` is undefined on
     first render and stays undefined if minting the token failed — every read
     below has to tolerate that rather than assert it away */
  const url = data?.url ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus className="size-4" />
          Subscribe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subscribe to your IEMS schedule</DialogTitle>
          <DialogDescription>
            Add this link to Google Calendar, Outlook or Apple Calendar and your IEMS activities,
            events and bookings appear there automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              readOnly
              value={isPending ? "Generating…" : isError ? "" : url}
              placeholder={isError ? "Could not generate a link" : undefined}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              disabled={!url}
              aria-label="Copy subscription link"
              onClick={() => {
                if (!url) return;
                void navigator.clipboard.writeText(url);
                setCopied(true);
                toast.success("Link copied");
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>

          {isError && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              We could not generate your subscription link.
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </p>
          )}

          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">In Google Calendar</p>
            <p>
              Other calendars → <b>+</b> → From URL → paste the link → Add calendar. It refreshes
              on Google&apos;s own schedule, usually every few hours.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Treat this link like a password — anyone who has it can read your schedule. Your own
            Google events are left out, since your calendar app already has them.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
