"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  XCircle,
} from "lucide-react";
import { useNotifications, useMarkNotificationsRead } from "@/hooks/admin/dashboard";
import { adminKeys } from "@/hooks/admin/keys";
import { subscribeLive } from "@/lib/liveStream";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdminNotification } from "@/types/admin";

const ICON = {
  success: <CheckCircle2 className="size-4 text-green-600" />,
  warning: <AlertTriangle className="size-4 text-amber-600" />,
  error: <XCircle className="size-4 text-red-500" />,
  info: <Info className="size-4 text-sky-600" />,
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useNotifications();
  const markRead = useMarkNotificationsRead();

  /* live push: prepend new notifications straight into the cache */
  useEffect(() => {
    return subscribeLive("admin", {
      onNotification: (n) => {
        qc.setQueryData<{ notifications: AdminNotification[]; unread: number }>(
          adminKeys.notifications,
          (old) => {
            if (!old || old.notifications.some((x) => x.id === n.id)) return old;
            return {
              notifications: [{ ...n, read: false }, ...old.notifications].slice(0, 50),
              unread: old.unread + 1,
            };
          }
        );
      },
    });
  }, [qc]);

  const items = data?.notifications ?? [];
  /* index of the notification opened in the one-by-one viewer */
  const [active, setActive] = useState<number | null>(null);
  const open = (i: number) => {
    setActive(i);
    if (!items[i].read) markRead.mutate([items[i].id]);
  };
  const current = active !== null ? items[active] : null;

  return (
    <div className="w-full">
      <PageHeader
        title="Notifications"
        description="Gate check-ins, guest activity and system alerts."
        actions={
          <Button
            variant="outline"
            onClick={() => markRead.mutate(undefined)}
            disabled={markRead.isPending || (data?.unread ?? 0) === 0}
          >
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        }
      />

      {isPending ? (
        <TableSkeleton rows={6} cols={1} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title="No notifications"
          message="Activity from the gate and your team shows up here."
        />
      ) : (
        <div className="space-y-2">
          {items.map((n, i) => (
            <Card
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => open(i)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(i)}
              className={cn(
                "flex cursor-pointer flex-row items-start gap-3 p-4 shadow-none transition-colors hover:bg-muted/50",
                !n.read && "border-primary/30 bg-primary/5"
              )}
            >
              <span className="mt-0.5">{ICON[n.severity]}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{n.title}</p>
                {n.body && <p className="truncate text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.at).toLocaleString()}
                </p>
              </div>
              {!n.read && (
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
              )}
            </Card>
          ))}
        </div>
      )}

      {/* one-by-one viewer — centered, step through with the arrows */}
      <Dialog open={current !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          {current && (
            <>
              <DialogHeader>
                <div className="mb-1 flex items-center gap-2">
                  {ICON[current.severity]}
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {current.severity}
                  </span>
                </div>
                <DialogTitle>{current.title}</DialogTitle>
                <DialogDescription>{new Date(current.at).toLocaleString()}</DialogDescription>
              </DialogHeader>
              {current.body && (
                <p className="text-sm leading-relaxed text-foreground">{current.body}</p>
              )}
              <DialogFooter className="items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">
                  {(active ?? 0) + 1} of {items.length}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={active === 0}
                    onClick={() => active !== null && open(active - 1)}
                  >
                    <ChevronLeft className="size-4" /> Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={active === items.length - 1}
                    onClick={() => active !== null && open(active + 1)}
                  >
                    Next <ChevronRight className="size-4" />
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
