/* Copy the Swagger UI bundle into public/ so the API docs pages can load it
   from our own origin.

   The docs used to pull the bundle from unpkg, which the CSP in next.config.ts
   (`script-src 'self'`) blocks — the page silently rendered nothing. Vendoring
   the asset fixes it without widening the policy for a CDN on every page.

   Runs from predev and prebuild; public/swagger is gitignored. */

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "swagger");

/* resolve through node so pnpm's nested node_modules layout doesn't matter */
const src = dirname(require.resolve("swagger-ui-dist/swagger-ui.css"));

const FILES = ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-standalone-preset.js"];

mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(src, file), join(dest, file));
}
console.log(`swagger-ui → public/swagger (${FILES.length} files)`);
