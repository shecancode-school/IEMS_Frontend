"use client";

import { use, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api, ApiError } from "@/lib/client";
import {
  PortalShell,
  Panel,
  Field,
  Select,
  Button,
  Note,
  Waiting,
  SuccessIcon,
  ErrorIcon,
} from "@/components/portal/ui";

type Invite = { participantName: string; eventName: string; email: string | null };
type Gender = "FEMALE" | "MALE" | "OTHER";
type Relationship = "RELATIVE" | "FRIEND" | "COLLEAGUE" | "PARTNER" | "MENTOR" | "OTHER";

const step = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export default function PlusOnePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [relationship, setRelationship] = useState<Relationship | "">("");
  const [state, setState] = useState<"loading" | "form" | "sending" | "done" | "invalid">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Invite>(`/api/plus-one/${token}`)
      .then((inv) => {
        setInvite(inv);
        if (inv.email) setEmail(inv.email);
        setState("form");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
        setState("invalid");
      });
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      await api(`/api/plus-one/${token}`, {
        body: { email, gender, relationship },
      });
      setState("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setState("form");
    }
  }

  return (
    <PortalShell
      eyebrow="Plus-one invite"
      title={invite ? `Join ${invite.participantName}` : "Invitation"}
    >
      <Panel className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {state === "loading" && (
            <motion.div key="loading" {...step}>
              <Waiting message="Checking your invite…" />
            </motion.div>
          )}

          {state === "invalid" && (
            <motion.div
              key="invalid"
              {...step}
              className="flex flex-col items-center gap-4 py-6 text-center"
            >
              <ErrorIcon />
              <p className="text-sm text-terracotta">{error}</p>
            </motion.div>
          )}

          {state === "done" && (
            <motion.div
              key="done"
              {...step}
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
                <h2 className="display text-2xl text-cream">You&apos;re registered!</h2>
                <p className="mt-2 text-sm text-cream-dim">
                  Check your inbox for a verification link — after verifying and
                  adding your photo, you&apos;ll get your own event pass.
                </p>
              </div>
            </motion.div>
          )}

          {(state === "form" || state === "sending") && invite && (
            <motion.form key="form" {...step} onSubmit={submit} className="space-y-4">
              <p className="text-left text-sm text-cream-dim">
                <b className="text-cream">{invite.participantName}</b> invited you to{" "}
                <b className="text-cream">{invite.eventName}</b>. You join as their
                guest — just these three details:
              </p>
              <Field
                label="Email"
                type="email"
                required={!invite.email}
                value={email}
                disabled={Boolean(invite.email)}
                title={invite.email ? "This invite was sent to this address" : undefined}
                className={
                  invite.email
                    ? "cursor-not-allowed select-none border-line/60 bg-panel-2/50 text-cream-dim opacity-70"
                    : ""
                }
                onChange={(e) => setEmail(e.target.value)}
              />
              {invite.email && (
                <p className="-mt-2 text-left text-xs text-cream-dim">
                  This invite was sent to this address, so it can&apos;t be changed.
                </p>
              )}
              <Select
                label="Gender"
                required
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
              >
                <option value="" disabled>
                  Select…
                </option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other / prefer not to say</option>
              </Select>
              <Select
                label={`How are you connected to ${invite.participantName.split(" ")[0]}?`}
                required
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as Relationship)}
              >
                <option value="" disabled>
                  Select…
                </option>
                <option value="RELATIVE">Relative</option>
                <option value="FRIEND">Friend</option>
                <option value="COLLEAGUE">Colleague</option>
                <option value="PARTNER">Partner</option>
                <option value="MENTOR">Mentor</option>
                <option value="OTHER">Other</option>
              </Select>
              <Button type="submit" busy={state === "sending"} className="w-full">
                {state === "sending" ? "Registering…" : "Register"}
              </Button>
              {error && <Note tone="error">{error}</Note>}
            </motion.form>
          )}
        </AnimatePresence>
      </Panel>
    </PortalShell>
  );
}
