"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/client";

/* The public "ask for an API key" form.

   Deliberately plain: this page is white-themed and read by developers, not
   the green marketing site, so it uses native elements rather than dragging
   in either design system. It never receives a key — approval is a person's
   decision, and the form says so up front rather than implying instant access. */

type Field = { name: string; label: string; type?: string; hint?: string; required?: boolean };

const FIELDS: Field[] = [
  { name: "label", label: "What are you building?", required: true, hint: "e.g. Igire partner site — events widget" },
  { name: "contactName", label: "Your name", required: true },
  { name: "contactEmail", label: "Email", type: "email", required: true, hint: "We send the key here once approved." },
  { name: "organisation", label: "Organisation" },
  { name: "website", label: "Website", hint: "Where the calendar will appear." },
];

export function RequestApiKey() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [purpose, setPurpose] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const set = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setError("");
    setState("sending");
    try {
      const res = await api<{ message: string }>("/api/public/api-keys/request", {
        body: { ...values, purpose },
      });
      setMessage(res.message);
      setState("done");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5">
        <p className="font-medium text-green-900">Request received</p>
        <p className="mt-1 text-sm text-green-800">{message}</p>
      </div>
    );
  }

  return (
    <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-5">
      <summary className="cursor-pointer font-medium text-neutral-900">
        Request an API key
      </summary>

      <p className="mt-2 max-w-prose text-sm text-neutral-600">
        The endpoints below marked with a padlock need a key sent as an{" "}
        <code className="rounded bg-neutral-200 px-1">x-api-key</code> header. Tell us what you
        are building and an administrator will review it — you will get the key by email, usually
        within a couple of working days.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.name} className={f.name === "label" ? "sm:col-span-2" : ""}>
            <span className="block text-sm font-medium text-neutral-800">
              {f.label}
              {f.required && <span className="ml-0.5 text-red-600">*</span>}
            </span>
            <input
              type={f.type ?? "text"}
              required={f.required}
              value={values[f.name] ?? ""}
              onChange={(e) => set(f.name, e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            {f.hint && <span className="mt-1 block text-xs text-neutral-500">{f.hint}</span>}
          </label>
        ))}

        <label className="sm:col-span-2">
          <span className="block text-sm font-medium text-neutral-800">
            What will you use the data for?<span className="ml-0.5 text-red-600">*</span>
          </span>
          <textarea
            required
            minLength={10}
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            A sentence is enough. It helps us decide, and it is what we will check against later.
          </span>
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={state === "sending"}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Send request"}
          </button>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      </form>
    </details>
  );
}
