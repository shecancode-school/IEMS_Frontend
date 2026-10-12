"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/* A confirmation gate before destructive/irreversible actions. Wrap the
   trigger element; `onConfirm` may be async (shows a pending label). */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      /* the action surfaces its own failure (mutation onError → toast); swallow
         here so a rejected confirm doesn't escape `void run()` as an
         unhandledRejection. Keep the dialog open so the user can retry. */
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-md rounded-2xl">
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <span
            className={cn(
              "mb-1 flex size-12 items-center justify-center rounded-full",
              destructive ? "bg-red-100 text-red-600" : "bg-primary/10 text-primary"
            )}
          >
            {destructive ? (
              <AlertTriangle className="size-6" />
            ) : (
              <HelpCircle className="size-6" />
            )}
          </span>
          <AlertDialogTitle className="text-lg">{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-center">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogCancel disabled={busy} className="rounded-xl">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
            disabled={busy}
            className={cn(
              "rounded-xl",
              destructive && "bg-red-600 text-white hover:bg-red-700"
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
