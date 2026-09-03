"use client";

import Link from "next/link";
import Image from "next/image";
import { ApiDocs } from "@/components/admin/ApiDocs";
import { RequestApiKey } from "@/components/RequestApiKey";
import { IntegrationGuide } from "@/components/IntegrationGuide";

/* Public developer documentation.

   Ordered the way someone arriving cold actually needs it: what this is, how
   to get a key, how to use it, then the endpoint reference. Swagger UI alone
   would answer the last question and none of the others. */
export default function PublicDocsPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/iro-logo.svg" alt="" width={32} height={32} className="size-8" />
            <span className="font-semibold text-neutral-900">Igire Rwanda</span>
          </Link>
          <span className="text-neutral-300">/</span>
          <h1 className="text-neutral-700">Developers</h1>
          <nav className="ml-auto flex items-center gap-5 text-sm">
            <a href="#start" className="text-neutral-600 hover:text-neutral-900">
              Get started
            </a>
            <a href="#reference" className="text-neutral-600 hover:text-neutral-900">
              Reference
            </a>
            <a
              href="/api/openapi.json"
              className="text-neutral-600 underline hover:text-neutral-900"
            >
              openapi.json
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <section className="max-w-prose">
          <h2 className="text-2xl font-semibold text-neutral-900">
            Put the Igire Rwanda calendar on your site
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            One authenticated endpoint returns everything the organisation has scheduled —
            ticketed events and the sessions our facilitators publish — as JSON you can render
            however you like. Booking and the public events feed need no key at all.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            All times are Africa/Kigali (UTC+2, no daylight saving).
          </p>
        </section>

        <div id="start" className="mt-10 scroll-mt-24">
          <RequestApiKey />
        </div>

        <div className="mt-12">
          <IntegrationGuide />
        </div>

        <div id="reference" className="mt-16 scroll-mt-24 border-t border-neutral-200 pt-10">
          <h2 className="text-xl font-semibold text-neutral-900">Endpoint reference</h2>
          <p className="mt-1 max-w-prose text-sm text-neutral-600">
            Every endpoint you can call. Those marked with a padlock need your{" "}
            <code className="rounded bg-neutral-200 px-1">x-api-key</code> header; the rest are
            open.
          </p>
          <div className="mt-4">
            <ApiDocs specUrl="/api/openapi.json" authenticated={false} />
          </div>
        </div>
      </div>
    </main>
  );
}
