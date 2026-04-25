import { readFileSync } from "node:fs";

const manifestPath = new URL("../.next/app-path-routes-manifest.json", import.meta.url);
const raw = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(raw);

const requiredRoutes = ["/page", "/research/page", "/sources/page"];
const missing = requiredRoutes.filter((route) => !(route in manifest));

if (missing.length > 0) {
  console.error(`Missing routes in app manifest: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Route smoke check passed: /, /research, /sources");
