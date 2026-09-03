import { EventEmitter } from "events";

/* In-process pub/sub for live admin activity: every /api/scan hit and every
   persisted notification is published here and streamed to admin dashboards
   over SSE. Kept on globalThis so dev-server module reloads don't drop
   subscribers. */

export type ScanEvent = {
  at: string;
  result: "ACCEPTED" | "ALREADY_USED" | "INVALID" | "REVOKED" | "EXPIRED";
  attendee?: { fullName: string; type: string; photoUrl: string | null } | null;
  eventName?: string | null;
  /** when the ticket was (first) checked in — set for ACCEPTED and ALREADY_USED */
  usedAt?: string | null;
  /** the ticket's deadline: the moment its event wraps up */
  expiresAt?: string | null;
};

export type NotificationEvent = {
  id: string;
  kind: "CHECK_IN" | "SCAN_ALERT" | "GUEST_ADDED" | "SYSTEM";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
  at: string;
};

const globalBus = globalThis as unknown as { __iemsScanBus?: EventEmitter };
const bus = (globalBus.__iemsScanBus ??= new EventEmitter().setMaxListeners(100));

export function publishScan(event: ScanEvent) {
  bus.emit("scan", event);
}

export function subscribeScans(listener: (event: ScanEvent) => void): () => void {
  bus.on("scan", listener);
  return () => bus.off("scan", listener);
}

export function publishNotification(event: NotificationEvent) {
  bus.emit("notification", event);
}

/* content channel: fired whenever events change (created, edited, poster
   uploaded) so public pages and admin views can re-pull live */
/* which cached surface changed, so listeners can invalidate narrowly */
export type ContentScope = "events" | "calendar";

export function publishContentChange(scope: ContentScope) {
  bus.emit("content", scope);
}

export function subscribeContentChanges(listener: (scope: ContentScope) => void): () => void {
  bus.on("content", listener);
  return () => bus.off("content", listener);
}

export function subscribeNotifications(
  listener: (event: NotificationEvent) => void
): () => void {
  bus.on("notification", listener);
  return () => bus.off("notification", listener);
}
