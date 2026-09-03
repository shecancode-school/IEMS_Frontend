/* The connection is dead and the staff member must reconnect — a revoked
   grant, a changed Google password, a rotated encryption key. Callers turn
   this into "Reconnect Google Calendar" in the UI, never a 500. */
export class GoogleAuthError extends Error {
  constructor(message = "Google Calendar needs to be reconnected") {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/* Google answered, but not with what we wanted. */
export class GoogleApiError extends Error {
  status: number;
  reason: string;
  constructor(message: string, status: number, reason = "") {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.reason = reason;
  }
}

/* Retry only what can succeed on a second attempt. A 400 or 404 is a bug in
   our request and retrying it just burns quota; a 401 means the token is bad
   and is handled by refreshing, not repeating. */
export function isRetryable(status: number, reason = ""): boolean {
  if (status === 429 || status >= 500) return true;
  return (
    status === 403 && (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded")
  );
}

/* Turn whatever the Google layer threw into a message a staff member can act
   on. The calendar feed and the directory both show this rather than a raw
   stack, and an empty Google result must never read like "your data is gone". */
export function googleErrorMessage(err: unknown): string {
  if (err instanceof GoogleAuthError) {
    return "Your Google Calendar needs to be reconnected.";
  }
  if (err instanceof GoogleApiError) {
    if (err.reason === "accessNotConfigured") {
      return "The Google Calendar API is not enabled in the connected Google Cloud project — ask the project admin to enable it, then try again.";
    }
    if (err.status === 401) return "Your Google Calendar needs to be reconnected.";
    if (err.status === 403) {
      return "Google is refusing access to this account's calendar — check the connected Google account and its permissions.";
    }
  }
  return "Could not reach Google Calendar just now.";
}
