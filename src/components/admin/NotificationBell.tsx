"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  Info,
  ShieldAlert,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/client";
import { subscribeLive } from "@/lib/liveStream";
import type { NotificationEvent } from "@/lib/scanBus";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  kind: NotificationEvent["kind"];
  severity: NotificationEvent["severity"];
  title: string;
  body: string;
  read: boolean;
  at: string;
};

type Feed = { notifications: Item[]; unread: number };

const FEED_KEY = ["admin-notifications"];

const KIND_ICON: Record<Item["kind"], { icon: typeof Bell; className: string }> = {
  CHECK_IN: { icon: UserCheck, className: "bg-green/15 text-green" },
  SCAN_ALERT: { icon: ShieldAlert, className: "bg-terracotta/15 text-terracotta" },
  GUEST_ADDED: { icon: UserPlus, className: "bg-tan/15 text-tan" },
  SYSTEM: { icon: Info, className: "bg-panel-2 text-cream-dim" },
};

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationBell() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: FEED_KEY,
    queryFn: () => api<Feed>("/api/admin/notifications", { role: "admin" }),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  /* live: new notifications land in the cache instantly + raise a toast */
  useEffect(() => {
    return subscribeLive("admin", {
      onNotification: (event) => {
        queryClient.setQueryData<Feed>(FEED_KEY, (old) => {
          if (!old) return old;
          if (old.notifications.some((n) => n.id === event.id)) return old;
          return {
            unread: old.unread + 1,
            notifications: [
              { ...event, read: false },
              ...old.notifications,
            ].slice(0, 50),
          };
        });
        const show =
          event.severity === "error"
            ? toast.error
            : event.severity === "warning"
              ? toast.warning
              : event.severity === "success"
                ? toast.success
                : toast.info;
        show(event.title, { description: event.body || undefined });
      },
    });
  }, [queryClient]);

  const unread = data?.unread ?? 0;

  const markAllRead = async () => {
    queryClient.setQueryData<Feed>(FEED_KEY, (old) =>
      old ? { unread: 0, notifications: old.notifications.map((n) => ({ ...n, read: true })) } : old
    );
    try {
      await api("/api/admin/notifications", { method: "PATCH", role: "admin", body: {} });
    } catch {
      queryClient.invalidateQueries({ queryKey: FEED_KEY });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-terracotta px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[26rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-line px-4 py-3">
          <DialogTitle className="label text-xs font-bold text-orange">Notifications</DialogTitle>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={markAllRead} className="gap-1 text-cream-dim">
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {!data || data.notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-cream-dim">
              Nothing yet — gate activity and guest tickets show up here.
            </p>
          ) : (
            <ul>
              {data.notifications.map((n) => {
                const { icon: Icon, className } = KIND_ICON[n.kind] ?? KIND_ICON.SYSTEM;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "flex gap-3 border-b border-line/50 px-4 py-3 last:border-b-0",
                      !n.read && "bg-panel-2/60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                        className
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-cream">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-cream-dim">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-cream-dim/70">{timeAgo(n.at)}</p>
                    </div>
                    {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-orange" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
