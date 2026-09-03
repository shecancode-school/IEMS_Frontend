import { publicOpenApiSpec } from "@/lib/openapi";
import { ok } from "@/lib/http";

/* The public integration spec: the events feed and the booking API, the parts
   a third party can call without a staff account.

   The full spec at /api/docs stays admin-only — a complete map of the private
   admin surface is genuine reconnaissance value with nothing to offer an
   integrator in return. */
export async function GET() {
  const res = ok(publicOpenApiSpec);
  /* it changes only on deploy, so it is worth caching hard at the edge */
  res.headers.set("cache-control", "public, max-age=300, s-maxage=3600");
  return res;
}
