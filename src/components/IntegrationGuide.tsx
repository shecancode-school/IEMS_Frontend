import Link from "next/link";
import { Code } from "@/components/docs/Code";

/* The integration guide.

   Swagger UI answers "what fields does this endpoint return"; it does not
   answer "how do I get started, what am I allowed to do, and what breaks in
   production". This is that half — written so a developer who has never seen
   the system can get a calendar onto their page without asking anyone. */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-11">
      <span className="absolute left-0 top-0 flex size-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
        {n}
      </span>
      <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      <div className="mt-1 text-sm leading-relaxed text-neutral-700">{children}</div>
    </li>
  );
}

export function IntegrationGuide() {
  return (
    <section className="space-y-10">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Getting started</h2>
        <p className="mt-1 max-w-prose text-sm text-neutral-600">
          Four steps from nothing to a live calendar on your site.
        </p>

        <ol className="mt-6 space-y-7">
          <Step n={1} title="Request a key">
            Use the form above. Tell us what you are building and where it will appear — an
            administrator reviews every request, so a real sentence gets you approved faster
            than “testing”. You will get the key by email.
          </Step>

          <Step n={2} title="Keep the key on your server">
            <p>
              The key is a credential. Putting it in front-end JavaScript publishes it to
              everyone who opens the page, and anyone who copies it can spend your rate limit
              until you notice. Call our API from your backend and serve the result to your
              own page.
            </p>
          </Step>

          <Step n={3} title="Call the calendar">
            <Code>{`curl -H "x-api-key: iro_live_xxxxxxxx" \\
  "https://events.igirerwanda.org/api/v1/calendar?from=2026-09-01&to=2026-12-31"`}</Code>
          </Step>

          <Step n={4} title="Render what comes back">
            <p>
              Every item carries <code className="rounded bg-neutral-200 px-1">kind</code>. Branch
              on it — the two are genuinely different things and should not look alike.
            </p>
            <Code>{`const res = await fetch(
  "https://events.igirerwanda.org/api/v1/calendar?from=2026-09-01&to=2026-12-31",
  { headers: { "x-api-key": process.env.IRO_API_KEY } }
);
const { items } = await res.json();

for (const item of items) {
  if (item.kind === "EVENT") {
    // ticketed: has a price, capacity and a page to link to
    console.log(item.day, item.title, item.price, item.url);
  } else {
    // a staff session: has a host, nothing to register for
    console.log(item.day, item.title, "with", item.host);
  }
}`}</Code>
          </Step>
        </ol>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-neutral-900">What you get</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4 font-medium">Field</th>
                <th className="py-2 pr-4 font-medium">EVENT</th>
                <th className="py-2 font-medium">ACTIVITY</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {[
                ["title, start, end, day", "yes", "yes"],
                ["host", "when one is assigned", "always — the point of a session"],
                ["category", "programme area", "null — sessions have none"],
                ["price, capacity, remaining", "yes", "empty / null"],
                ["url", "the event page", "null — nothing to link to"],
              ].map(([field, ev, act]) => (
                <tr key={field} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs">{field}</td>
                  <td className="py-2 pr-4">{ev}</td>
                  <td className="py-2">{act}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-prose text-sm text-neutral-600">
          Times are RFC 3339 instants. <code className="rounded bg-neutral-200 px-1">day</code> is
          the Africa/Kigali calendar day, so you can group by date without handling the timezone
          yourself — Kigali is UTC+2 year round and has never observed daylight saving.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Rules and limits</h2>
        <ul className="mt-3 max-w-prose space-y-2.5 text-sm leading-relaxed text-neutral-700">
          <li>
            <strong className="font-semibold text-neutral-900">Read-only.</strong> A key carries{" "}
            <code className="rounded bg-neutral-200 px-1">calendar:read</code> — the feed above —
            and, only if you explained why you need it, {" "}
            <code className="rounded bg-neutral-200 px-1">calendar:freebusy</code>, which returns
            when bookable staff are occupied as times alone, with no titles. There is no way to
            create or change anything through a key.
          </li>
          <li>
            <strong className="font-semibold text-neutral-900">60 requests a minute</strong> by
            default. Past that you get <code className="rounded bg-neutral-200 px-1">429</code>{" "}
            with a <code className="rounded bg-neutral-200 px-1">Retry-After</code> header. Cache
            the response for a few minutes rather than fetching per page view — the calendar
            changes a few times a week, not a few times a second.
          </li>
          <li>
            <strong className="font-semibold text-neutral-900">366 days maximum</strong> per call.
            Ask for the window you will actually display.
          </li>
          <li>
            <strong className="font-semibold text-neutral-900">Only published data.</strong> Draft
            events and internal staff sessions never appear. A session reaches this feed only
            when the person running it explicitly marked it public.
          </li>
          <li>
            <strong className="font-semibold text-neutral-900">Keys can be revoked.</strong> If
            usage stops matching what you told us it was for, the key is switched off. A revoked
            key cannot be restored — you would request a new one.
          </li>
          <li>
            <strong className="font-semibold text-neutral-900">Attribute the source.</strong>{" "}
            Where you display the calendar, credit Igire Rwanda Organization and link back to{" "}
            <Link href="/" className="underline">
              events.igirerwanda.org
            </Link>
            .
          </li>
        </ul>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-neutral-900">When something goes wrong</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-sm">
            <tbody className="text-neutral-700">
              {[
                ["401", "The key is missing, mistyped, or has been revoked. Check the x-api-key header."],
                ["403", "The key is valid but lacks the scope. Get in touch — this should not happen with a calendar key."],
                ["429", "You are over the rate limit. Wait for Retry-After seconds and cache more aggressively."],
                ["400", "Your from/to dates are malformed, inverted, or more than 366 days apart."],
              ].map(([code, meaning]) => (
                <tr key={code} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs font-semibold">{code}</td>
                  <td className="py-2">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-neutral-600">
          Still stuck? Email{" "}
          <a href="mailto:support@igirerwanda.org" className="underline">
            support@igirerwanda.org
          </a>{" "}
          with your key prefix (the <code className="rounded bg-neutral-200 px-1">iro_live_…</code>{" "}
          fragment, never the whole key) and the request you made.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Without a key</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-neutral-600">
          The endpoints below tagged <strong>Public</strong> — the events feed, event details and
          the booking flow — need no authentication at all. If you only want to link to an event
          or let someone book a slot, you do not need a key. The key exists for the merged
          calendar feed, which is the one built for embedding.
        </p>
      </div>
    </section>
  );
}
