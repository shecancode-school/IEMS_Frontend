"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client";

/* Reusable Swagger UI renderer, used by three pages:
     /admin/api-docs and /api-docs → the full spec, super-admin only
     /docs                          → the public integration spec

   The bundle is served from our own origin (public/swagger, produced by
   scripts/copy-swagger.ts on predev/prebuild). It used to come from unpkg,
   which the CSP in next.config.ts blocks with `script-src 'self'` — the page
   silently rendered nothing. Vendoring fixes it without opening the policy to
   a CDN on every page of the site. */

const CSS_URL = "/swagger/swagger-ui.css";
const JS_URL = "/swagger/swagger-ui-bundle.js";

declare global {
  interface Window {
    SwaggerUIBundle?: (opts: Record<string, unknown>) => unknown;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Swagger UI"));
    document.head.appendChild(s);
  });
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

export function ApiDocs({
  className = "",
  /* which spec to render; defaults to the private one for the admin pages */
  specUrl = "/api/docs",
  authenticated = true,
}: {
  className?: string;
  specUrl?: string;
  authenticated?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const spec = await api<Record<string, unknown>>(
          specUrl,
          authenticated ? { role: "admin" } : {}
        );
        loadCss(CSS_URL);
        await loadScript(JS_URL);
        if (cancelled || !mountRef.current || !window.SwaggerUIBundle) return;
        window.SwaggerUIBundle({
          spec,
          domNode: mountRef.current,
          deepLinking: true,
          docExpansion: "list",
          defaultModelsExpandDepth: 0,
          tryItOutEnabled: true,
          persistAuthorization: true,
        });
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          setError("The full API documentation is available to administrators only.");
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load the API documentation");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [specUrl, authenticated]);

  return (
    <div className={className}>
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && !ready && (
        <div className="p-8 text-sm text-neutral-500">Loading API documentation…</div>
      )}
      <div ref={mountRef} />
    </div>
  );
}
