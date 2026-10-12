"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ApiError } from "@/lib/client";
import { useParticipantAuth } from "@/context/AuthContext";
import { PortalShell, Panel, Waiting, ErrorIcon, Button } from "@/components/portal/ui";

export default function VerifyTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { verify } = useParticipantAuth();
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    verify
      .mutateAsync({ token })
      .then(() => router.replace("/dashboard"))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Something went wrong")
      );
  }, [token, router, verify]);

  return (
    <PortalShell eyebrow="Ticket portal" title={error ? "Link problem" : "Verifying…"}>
      <Panel>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 py-6 text-center"
          >
            <ErrorIcon />
            <p className="text-sm text-terracotta">{error}</p>
            <Link href="/verify">
              <Button>Request a new link</Button>
            </Link>
          </motion.div>
        ) : (
          <Waiting message="Checking your verification link…" />
        )}
      </Panel>
    </PortalShell>
  );
}
