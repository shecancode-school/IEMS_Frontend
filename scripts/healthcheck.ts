/* Connectivity health-check for the external services the app depends on.
   Reports, for each integration, whether it is configured and reachable.
   Run: pnpm health  (exits non-zero if any required check fails)

   The probes themselves are NOT defined here any more. They live in
   src/lib/health.ts, shared with /api/admin/health and with the cron that runs
   them unattended — this file used to define its own copy under different
   names, so the CLI and the status page could disagree about the same service
   and nobody would notice. This is now the terminal's view of that one list. */
import mongoose from "mongoose";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall back to already-exported env vars */
}

async function main() {
  /* imported after the env file is loaded — the modules underneath read
     process.env at import time */
  const { runHealthChecks, recordHealth } = await import("../src/lib/health");

  console.log("Integration health-check\n");

  const services = await runHealthChecks();
  let failed = 0;

  for (const s of services) {
    const mark = s.ok ? (s.status === "not_configured" ? "–" : "✓") : "✗";
    if (!s.ok) failed++;
    console.log(`  ${mark} ${s.name.padEnd(16)} ${s.detail} (${s.ms}ms)`);
  }

  /* the run counts towards the uptime history like any other, tagged so it is
     never mistaken for unattended monitoring */
  await recordHealth(services, "cli").catch(() => {});

  console.log(`\n${services.length - failed}/${services.length} integrations healthy`);
  await mongoose.disconnect().catch(() => {});
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  /* dbConnect throws when MONGODB_URI is missing, before any probe can run.
     That is a configuration failure, and it has to read as one rather than as
     an unhandled rejection stack. */
  console.log(`  ✗ ${(err as Error).message}`);
  console.log("\n0 integrations checked");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
