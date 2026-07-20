"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ApiError } from "@/lib/client";
import { useParticipantAuth } from "@/context/AuthContext";
import { useEvents } from "@/lib/useEvents";
import {
  PortalShell,
  Panel,
  Field,
  Button,
  SuccessIcon,
  ErrorIcon,
  Waiting,
} from "@/components/portal/ui";

const REDIRECT_SECONDS = 10;

const step = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.98 },
};

function VerifyFlow() {
  const router = useRouter();
  const { requestLink } = useParticipantAuth();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  /* set when the visitor arrived by accepting an event's terms & conditions */
  const eventSlug = useSearchParams().get("event");
  const { data: events } = useEvents();
  const event = eventSlug ? events?.find((e) => e.id === eventSlug) : undefined;

  /* once the email is away, count down and head back home */
  useEffect(() => {
    if (state !== "sent") return;
    if (countdown <= 0) {
      router.push("/");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [state, countdown, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      await requestLink.mutateAsync({ email, ...(eventSlug ? { eventSlug } : {}) });
      setCountdown(REDIRECT_SECONDS);
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setState("error");
    }
  }

  return (
    <Panel className="overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {state === "sending" && (
          <motion.div key="sending" {...step} transition={{ duration: 0.25 }}>
            <Waiting message={`Sending your verification link to ${email}…`} />
          </motion.div>
        )}

        {state === "sent" && (
          <motion.div
            key="sent"
            {...step}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4 py-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
            >
              <SuccessIcon />
            </motion.div>
            <div>
              <h2 className="display text-2xl text-cream">Check your inbox</h2>
              <p className="mt-2 text-sm text-cream-dim">
                If <b className="text-cream">{email}</b> is registered, a verification
                link is on its way. Open it on this device to continue it expires
                in 30 minutes.
              </p>
            </div>
            <p className="text-xs text-cream-dim">
              Taking you back to the homepage in{" "}
              <span className="inline-block w-4 font-bold text-orange">{countdown}</span>s
            </p>
            <Button variant="ghost" onClick={() => router.push("/")}>
              Go home now
            </Button>
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            {...step}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4 py-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
            >
              <ErrorIcon />
            </motion.div>
            <div>
              <h2 className="display text-2xl text-cream">That didn&apos;t work</h2>
              <p className="mt-2 text-sm text-terracotta">{error}</p>
            </div>
            <Button onClick={() => setState("idle")}>Try again</Button>
          </motion.div>
        )}

        {state === "idle" && (
          <motion.form
            key="form"
            {...step}
            transition={{ duration: 0.25 }}
            onSubmit={submit}
            className="space-y-4"
          >
            {event && (
              <p className="rounded-lg border border-line bg-panel-2 px-4 py-2.5 text-left text-sm text-cream">
                <span className="text-cream-dim">Getting your ticket for </span>
                {event.title}
                <span className="text-cream-dim">
                  {" "}
                  — {new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  , {event.time}
                </span>
              </p>
            )}
            <p className="text-left text-sm text-cream-dim">
              Enter the email you registered with and we&apos;ll send you a verification link.
            </p>
            <Field
              label="Email address"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              
            />
            <Button type="submit" className="w-full">
              Send verification link
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </Panel>
  );
}

export default function VerifyPage() {
  return (
    <PortalShell eyebrow="Ticket portal" title="Get your ticket">
      <Suspense>
        <VerifyFlow />
      </Suspense>
    </PortalShell>
  );
}
