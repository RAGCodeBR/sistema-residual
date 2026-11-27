import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("dist-cloudflare");
const entry = path.join(output, "index.pages.html");
const html = await readFile(entry, "utf8");
if (!html.includes('id="root"') || html.includes("/sistema-residual/")) {
  throw new Error("Build Cloudflare inválido: confira a entrada e a base das URLs.");
}
await copyFile(entry, path.join(output, "index.html"));
await rm(entry);
// Cloudflare serves the SPA directly on routes such as /auth and /users.
await rm(path.join(output, "404.html"), { force: true });
await writeFile(path.join(output, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/index.html
  Cache-Control: no-cache

/app-version.json
  Cache-Control: no-store

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
`);
console.log("Build estático Cloudflare preparado em", output);
