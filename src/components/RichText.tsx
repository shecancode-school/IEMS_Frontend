/* Renders admin-authored rich text. Content created by the editor is HTML;
   older plain-text content is shown with its line breaks preserved. Rendering
   goes through DOMPurify with a strict tag/attribute allow-list — a regex
   sanitiser is bypassable, and this content reaches every public visitor. */

import DOMPurify from "isomorphic-dompurify";

/* only the formatting the editor can produce; everything else is stripped */
//testing
const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s",
  "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "code", "pre",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

/* strip tags to a plain-text preview, for teasers that can't hold markup */
export function toPlainText(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    /* defence in depth: block javascript:/data: URLs and unknown protocols */
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  });
}

export function RichText({
  html,
  className = "",
}: {
  html: string;
  className?: string;
}) {
  if (!html) return null;
  if (!looksLikeHtml(html)) {
    return <div className={`whitespace-pre-line ${className}`}>{html}</div>;
  }
  return (
    <div
      className={`[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitize(html) }}
    />
  );
}
