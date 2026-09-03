/* A copy-pasteable code block.

   Shared by the public integration guide and the internal per-key panel so the
   two cannot drift into looking like different products. Deliberately keeps
   its own dark surface rather than reading theme tokens: a terminal snippet is
   recognisable as one on a white page and on a dark console alike, and the
   contrast is fixed instead of depending on where it was dropped. */
export function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
      <code>{children}</code>
    </pre>
  );
}
