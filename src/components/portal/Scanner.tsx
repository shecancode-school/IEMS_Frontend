"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  HelpCircle,
  Hourglass,
  ShieldX,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/client";
import type { Role } from "@/store/authSlice";
import { subscribeLive } from "@/lib/liveStream";
import type { ScanEvent } from "@/lib/scanBus";
import { Panel, Note, Spinner } from "./ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ScanResponse = ScanEvent & { cohort?: string | null };

/* feed entries carry the gate snapshot only for scans made on this device */
type FeedItem = ScanEvent & { snapshot?: string };

const RESULT_STYLE: Record<
  ScanEvent["result"],
  { label: string; icon: typeof CheckCircle2; className: string; iconClass: string; dot: string }
> = {
  ACCEPTED: {
    label: "Welcome in",
    icon: CheckCircle2,
    className: "border-green",
    iconClass: "text-green",
    dot: "bg-green",
  },
  ALREADY_USED: {
    label: "Already used",
    icon: XCircle,
    className: "border-terracotta",
    iconClass: "text-terracotta",
    dot: "bg-terracotta",
  },
  REVOKED: {
    label: "Revoked pass",
    icon: ShieldX,
    className: "border-terracotta",
    iconClass: "text-terracotta",
    dot: "bg-terracotta",
  },
  INVALID: {
    label: "Invalid ticket",
    icon: XCircle,
    className: "border-terracotta",
    iconClass: "text-terracotta",
    dot: "bg-terracotta",
  },
  EXPIRED: {
    label: "Ticket expired",
    icon: Hourglass,
    className: "border-tan",
    iconClass: "text-tan",
    dot: "bg-tan",
  },
};

/* the instant, glanceable verdict flashed big over the camera the moment a
   scan resolves — gate staff read it at arm's length, then glance at the
   detail card below. "ERROR" covers a scan/network hiccup (question mark). */
type FlashKind = ScanEvent["result"] | "ERROR";
const FLASH_META: Record<
  FlashKind,
  { icon: typeof CheckCircle2; label: string; ring: string }
> = {
  ACCEPTED: { icon: CheckCircle2, label: "Verified", ring: "bg-green/20 text-green ring-green/50" },
  ALREADY_USED: { icon: Ban, label: "Already used", ring: "bg-terracotta/20 text-terracotta ring-terracotta/50" },
  REVOKED: { icon: ShieldX, label: "Revoked", ring: "bg-terracotta/20 text-terracotta ring-terracotta/50" },
  INVALID: { icon: XCircle, label: "Invalid", ring: "bg-terracotta/20 text-terracotta ring-terracotta/50" },
  EXPIRED: { icon: Hourglass, label: "Expired", ring: "bg-tan/20 text-tan ring-tan/50" },
  ERROR: { icon: HelpCircle, label: "Try again", ring: "bg-cream/10 text-cream ring-cream/30" },
};

/* focusMode / zoom aren't in the standard DOM constraint types yet */
type AdvancedFocus = MediaTrackConstraintSet & { focusMode?: string; zoom?: number };

/* turn a getUserMedia failure into a message the gate staff can act on */
function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow the camera for this site in your browser settings, then reload.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is being used by another app. Close it and try again.";
    default:
      return err instanceof Error && err.message
        ? `Could not start the camera: ${err.message}`
        : "Could not start the camera — it needs HTTPS (or localhost) and camera permission.";
  }
}

const FEED_KEY = ["gate-feed"];
const FEED_LIMIT = 30;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dateTimeOf = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/* the one-line verdict explanation: when it was used, when it expires */
function verdictDetail(e: FeedItem): string {
  switch (e.result) {
    case "ACCEPTED":
      return `Checked in at ${timeOf(e.usedAt ?? e.at)}${
        e.expiresAt ? ` · pass valid until ${dateTimeOf(e.expiresAt)}` : ""
      }`;
    case "ALREADY_USED":
      return e.usedAt
        ? `This pass was already used at ${dateTimeOf(e.usedAt)} — entry denied.`
        : "This pass has already been used — entry denied.";
    case "EXPIRED":
      return e.expiresAt
        ? `The event ended ${dateTimeOf(e.expiresAt)} — this pass is no longer valid.`
        : "This event has ended — the pass is no longer valid.";
    case "REVOKED":
      return "This pass was revoked by an admin.";
    case "INVALID":
      return "This code is not one of our signed tickets.";
  }
}

/* Gate scanner: the camera stays on between scans, a frame is captured as
   evidence for each verdict, results land instantly in the shared feed
   cache, and scans from other gates stream in live. */
export default function Scanner({
  role,
  profile,
}: {
  role: Role;
  profile?: { name?: string | null; email?: string | null };
}) {
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ id: number; kind: FlashKind } | null>(null);
  const lastRef = useRef<{ payload: string; at: number }>({ payload: "", at: 0 });
  const snapshotRef = useRef<string | null>(null);
  /* the live html5-qrcode instance — lets a decode freeze the video (pause)
     and the verdict flash resume it */
  const activeRef = useRef<Html5Qrcode | null>(null);
  const queryClient = useQueryClient();

  /* freeze/unfreeze the camera around a scan: paused with the frame held on
     screen while the ticket is checked, resumed when the verdict clears */
  const pauseCamera = () => {
    try {
      activeRef.current?.pause(true);
    } catch {
      /* not scanning — nothing to pause */
    }
  };
  const resumeCamera = () => {
    try {
      activeRef.current?.resume();
    } catch {
      /* camera was stopped or never paused — nothing to resume */
    }
  };

  /* the feed lives in the query cache so it survives tab switches */
  const { data: feed = [] } = useQuery<FeedItem[]>({
    queryKey: FEED_KEY,
    queryFn: () => [],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const latest = feed[0];

  const pushToFeed = (event: FeedItem) => {
    queryClient.setQueryData<FeedItem[]>(FEED_KEY, (old = []) => {
      if (old.some((e) => e.at === event.at)) return old; /* SSE echo of our own scan */
      return [event, ...old].slice(0, FEED_LIMIT);
    });
  };

  const scan = useMutation({
    mutationFn: (qr: string) => api<ScanResponse>("/api/scan", { role, body: { qr } }),
    onSuccess: (res) => {
      pushToFeed({ ...res, snapshot: snapshotRef.current ?? undefined });
      snapshotRef.current = null;
      setFlash({ id: Date.now(), kind: res.result });
      navigator.vibrate?.(res.result === "ACCEPTED" ? 90 : [70, 60, 70]);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Scan failed");
      setFlash({ id: Date.now(), kind: "ERROR" });
      navigator.vibrate?.([70, 60, 70]);
    },
  });

  /* the big verdict overlay is a momentary flash — when it clears, the frozen
     camera resumes so the next pass can walk straight up */
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => {
      setFlash(null);
      resumeCamera();
    }, 1800);
    return () => clearTimeout(t);
  }, [flash]);
  const scanRef = useRef(scan);
  useEffect(() => {
    scanRef.current = scan;
  }, [scan]);

  /* live feed from every gate */
  useEffect(() => {
    return subscribeLive(role, { onScan: pushToFeed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (!scanning) return;
    let active: Html5Qrcode | null = null;
    let cancelled = false;

    /* freeze the moment of the scan: one JPEG frame off the live video */
    const captureFrame = (): string | null => {
      const video = document.querySelector<HTMLVideoElement>("#qr-reader video");
      if (!video || !video.videoWidth) return null;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        return canvas.toDataURL("image/jpeg", 0.7);
      } catch {
        return null;
      }
    };

    const onDecode = (decoded: string) => {
      /* same code held up to the camera fires many frames — take one */
      const now = Date.now();
      if (decoded === lastRef.current.payload && now - lastRef.current.at < 4000) return;
      if (scanRef.current.isPending) return;
      lastRef.current = { payload: decoded, at: now };
      snapshotRef.current = captureFrame();
      /* freeze the captured frame on screen and stop decoding while the
         ticket is checked — the verdict flash resumes the camera after */
      pauseCamera();
      scanRef.current.mutate(decoded);
    };
    const config = {
      fps: 15,
      /* a large search area (≈92% of the shorter edge) so the pass doesn't have
         to fill the frame — the code is found wherever it lands in view */
      qrbox: (vw: number, vh: number) => {
        const size = Math.round(Math.min(vw, vh) * 0.92);
        return { width: size, height: size };
      },
    };

    /* Tune the live track for range + speed: continuous autofocus so a pass
       snaps sharp at any distance, and the highest resolution the camera
       supports (capped at 1080p) so a QR that's small/far still carries enough
       pixels to decode — together this is what lets it read from a distance
       like a native scanner. Applied AFTER the stream is live and best-effort,
       so an unsupported hint can never stop the camera from opening. */
    const tuneTrack = async () => {
      const video = document.querySelector<HTMLVideoElement>("#qr-reader video");
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track?.getCapabilities) return;
      const caps = track.getCapabilities() as MediaTrackCapabilities & {
        focusMode?: string[];
        zoom?: { min: number; max: number };
      };
      const advanced: AdvancedFocus[] = [];
      if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });

      const constraints: MediaTrackConstraints & { advanced?: AdvancedFocus[]; zoom?: number } = {};
      /* pack in as many pixels as the sensor allows (up to QHD) so a QR held at
         arm's length — ~50cm — still resolves enough modules to decode */
      if (caps.width?.max) constraints.width = { ideal: Math.min(2560, caps.width.max) };
      if (caps.height?.max) constraints.height = { ideal: Math.min(1440, caps.height.max) };

      /* a gentle zoom magnifies a far pass so it reads from a distance without
         moving it closer; continuous AF keeps it sharp at that range */
      if (caps.zoom && caps.zoom.max >= 1.4) {
        const z = Math.min(1.6, caps.zoom.max);
        constraints.zoom = z;
        advanced.push({ zoom: z });
      }

      if (advanced.length) constraints.advanced = advanced;
      try {
        await track.applyConstraints(constraints);
      } catch {
        /* device rejected the hints — its defaults still run */
      }
    };

    /* Each attempt runs on a FRESH instance. Once html5-qrcode's start()
       rejects, that instance is stuck "under transition" and reusing it makes
       the next start() throw "Cannot transition to a new state" — which is what
       surfaced as "Could not start the camera" when the first attempt failed. */
    const attempt = async (src: string | MediaTrackConstraints): Promise<Html5Qrcode> => {
      const s = new Html5Qrcode("qr-reader", {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      try {
        await s.start(src, config, onDecode, () => {});
        return s;
      } catch (e) {
        try {
          await s.stop();
        } catch {
          /* it never started */
        }
        try {
          s.clear();
        } catch {
          /* nothing to clear */
        }
        throw e;
      }
    };

    (async () => {
      try {
        if (!window.isSecureContext && location.hostname !== "localhost") {
          throw new DOMException("Insecure context", "SecurityError");
        }
        /* Start with the simplest constraint that works everywhere — phones
           honour "environment" (back camera); laptops ignore the ideal and use
           their only camera. Resolution and focus are tuned AFTER the stream is
           live so an unsupported hint can never block the camera from opening. */
        try {
          active = await attempt({ facingMode: { ideal: "environment" } });
        } catch {
          if (cancelled) return;
          /* a browser that won't resolve facingMode — pick a camera explicitly */
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) throw new DOMException("No camera", "NotFoundError");
          const back = cameras.find((c) => /back|rear|environment/i.test(c.label));
          active = await attempt((back ?? cameras[0]).id);
        }
        /* the effect was torn down while the camera was opening */
        if (cancelled) {
          await active.stop().catch(() => {});
          return;
        }
        activeRef.current = active;
        await tuneTrack();
      } catch (err) {
        if (!cancelled) {
          setError(describeCameraError(err));
          setScanning(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      activeRef.current = null;
      /* let the library tear its own video element down — yanking the
         container out of the DOM mid-stream triggers onabort errors */
      const s = active;
      if (s?.isScanning) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      } else if (s) {
        try {
          s.clear();
        } catch {
          /* nothing to clear */
        }
      }
    };
  }, [scanning]);

  const scannerInitials = (profile?.name ?? "S")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* who's on the gate — the signed-in scanner's profile */}
      {profile && (
        <Panel className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange/15 text-sm font-bold text-orange">
            {scannerInitials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-cream">
              {profile.name ?? "Gate scanner"}
            </p>
            {profile.email && (
              <p className="truncate text-xs text-cream-dim">{profile.email}</p>
            )}
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-green/15 px-2.5 py-1 text-[11px] font-semibold text-green">
            <span className="size-1.5 rounded-full bg-green" />
            On duty
          </span>
        </Panel>
      )}

      {/* the camera container stays mounted; CSS hides it when idle */}
      <Panel className={scanning ? "" : "hidden"}>
        <div className="relative mx-auto w-full max-w-sm">
          <div id="qr-reader" className="mx-auto overflow-hidden rounded-lg" />
          {/* code captured → frame frozen → this loader sits over it while the
              ticket is checked; the verdict then flashes in its place */}
          <AnimatePresence>
            {scan.isPending && !flash && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/55 backdrop-blur-[2px]"
              >
                <span className="flex size-20 items-center justify-center rounded-full bg-orange/15 ring-4 ring-orange/40">
                  <Spinner className="h-9 w-9 text-orange" />
                </span>
                <span className="display text-xl text-cream drop-shadow">Checking ticket…</span>
              </motion.div>
            )}
          </AnimatePresence>
          <ScanFlash flash={flash} />
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-cream-dim">
          {scan.isPending
            ? "Code captured — verifying the pass."
            : "Hold a pass in front of the camera — it scans automatically."}
        </p>
        <Button variant="outline" className="mt-3 w-full gap-2" onClick={() => setScanning(false)}>
          <CameraOff className="size-4" /> Stop camera
        </Button>
      </Panel>
      {!scanning && (
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={() => {
            setError("");
            setScanning(true);
          }}
        >
          <Camera className="size-4" /> Start scanning
        </Button>
      )}

      {/* latest verdict, big and unmissable */}
      <AnimatePresence mode="popLayout">
        {latest && (
          <motion.div
            key={latest.at}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            <VerdictCard item={latest} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* live gate feed, newest first */}
      {feed.length > 1 && (
        <Panel>
          <h3 className="label mb-3 flex items-center gap-2 text-xs font-bold text-orange">
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full bg-green opacity-60" />
              <span className="h-2 w-2 rounded-full bg-green" />
            </span>
            Live gate activity
          </h3>
          <ul className="space-y-2">
            {feed.slice(1, 8).map((e) => (
              <li key={e.at} className="flex items-center gap-2.5 text-sm">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", RESULT_STYLE[e.result].dot)} />
                <span className="min-w-0 flex-1 truncate text-cream">
                  {e.attendee?.fullName ?? "Unknown ticket"}
                </span>
                <Badge
                  variant="outline"
                  className={cn("border-0 text-[10px] font-bold", {
                    "bg-green/15 text-green": e.result === "ACCEPTED",
                    "bg-terracotta/15 text-terracotta":
                      e.result === "ALREADY_USED" || e.result === "REVOKED" || e.result === "INVALID",
                    "bg-tan/15 text-tan": e.result === "EXPIRED",
                  })}
                >
                  {RESULT_STYLE[e.result].label}
                </Badge>
                <span className="shrink-0 text-xs text-cream-dim">{timeOf(e.at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}

/* the big verdict that flashes over the live camera the instant a scan
   resolves — a tick for a clean entry, an X for invalid/revoked, a "used"
   stamp for a re-scan, and a question mark when the scan itself hiccups */
function ScanFlash({ flash }: { flash: { id: number; kind: FlashKind } | null }) {
  return (
    <AnimatePresence>
      {flash && (
        <motion.div
          key={flash.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/50 backdrop-blur-[2px]"
        >
          {(() => {
            const meta = FLASH_META[flash.kind];
            const Icon = meta.icon;
            return (
              <>
                <motion.span
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 480, damping: 20 }}
                  className={cn("flex size-24 items-center justify-center rounded-full ring-4", meta.ring)}
                >
                  <Icon className="size-14" strokeWidth={2.5} />
                </motion.span>
                <span className="display text-2xl text-cream drop-shadow">{meta.label}</span>
              </>
            );
          })()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function VerdictCard({ item }: { item: FeedItem }) {
  const style = RESULT_STYLE[item.result];
  const Icon = style.icon;
  return (
    <Panel className={cn("border-2", style.className)}>
      <div className="flex items-center gap-3">
        <Icon className={cn("size-9 shrink-0", style.iconClass)} />
        <p className={cn("display text-2xl", style.iconClass)}>{style.label}</p>
      </div>

      {item.attendee && (
        <div className="mt-4 flex items-center gap-3">
          {item.attendee.photoUrl && (
            <img
              src={item.attendee.photoUrl}
              alt=""
              className="h-14 w-14 rounded-full border border-line object-cover"
            />
          )}
          <div className="text-sm text-cream">
            <p className="font-semibold">{item.attendee.fullName}</p>
            <p className="text-cream-dim">
              {item.attendee.type === "PLUS_ONE" ? "GUEST" : item.attendee.type}
              {item.eventName ? ` · ${item.eventName}` : ""}
            </p>
          </div>
        </div>
      )}

      <p className="mt-3 flex items-start gap-2 text-sm text-cream-dim">
        <Clock className="mt-0.5 size-4 shrink-0" />
        {verdictDetail(item)}
      </p>

      {/* the frame captured the instant this ticket was scanned */}
      {item.snapshot && (
        <div className="mt-4">
          <p className="label mb-1.5 text-[10px] font-semibold text-cream-dim">Gate snapshot</p>
          <img
            src={item.snapshot}
            alt="Frame captured at scan time"
            className="max-h-40 w-full rounded-lg border border-line object-cover"
          />
        </div>
      )}
    </Panel>
  );
}
