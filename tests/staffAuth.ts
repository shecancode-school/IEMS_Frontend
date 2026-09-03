import { Admin, StaffSession } from "@/models";
import { signStaffAccessToken } from "@/lib/auth";
import { STAFF_COOKIE, issueStaffSession } from "@/lib/staffSession";
import { dbConnect } from "@/lib/db";

/* Test helper: open a real staff session without going through Google.

   Sign-in is Google-only now, so the suite cannot log in with a password. It
   builds the session the same way the OAuth callback does — a real
   StaffSession row plus a signed access token — and presents it in the same
   httpOnly cookie the browser would, so the tests exercise the actual auth
   path rather than a bypass. */
export async function staffCookie(email?: string): Promise<string | null> {
  await dbConnect();

  /* Prefer the named account, but fall back to any active administrator.
     Which admin exists is an environment fact — the originally seeded one may
     have been deactivated in favour of a real Google sign-in — and the suite
     should exercise the auth path rather than fail on whose account it is. */
  const admin =
    (email ? await Admin.findOne({ email: email.toLowerCase(), active: true }) : null) ??
    (await Admin.findOne({ active: true, role: { $in: ["ADMIN", "CEO"] } }).sort({ createdAt: 1 }));
  if (!admin) return null;

  const { raw, sessionId } = await issueStaffSession(admin._id.toString(), {
    ip: "127.0.0.1",
    userAgent: "vitest",
  });
  void raw;
  const token = await signStaffAccessToken(admin._id.toString(), sessionId);
  return `${STAFF_COOKIE}=${token}`;
}

/* tidy up the sessions a test run opened */
export async function clearTestSessions(userAgent = "vitest"): Promise<void> {
  await StaffSession.deleteMany({ userAgent }).catch(() => undefined);
}
