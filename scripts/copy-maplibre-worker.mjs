// Copies MapLibre's worker module into public/ so the browser can load it at a stable URL.
// The bundler cannot follow MapLibre v6's `new URL(..., import.meta.url)` worker lookup, so the map
// calls setWorkerUrl("/vendor/maplibre-gl-worker.mjs"). Runs before `dev` and `build`; the copy is git-ignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
const pkg = createRequire(path.join(root, "package.json")).resolve("maplibre-gl/package.json");
const src = path.join(path.dirname(pkg), "dist", "maplibre-gl-worker.mjs");
const dir = path.join(root, "public", "vendor");
mkdirSync(dir, { recursive: true });
copyFileSync(src, path.join(dir, "maplibre-gl-worker.mjs"));
console.log("maplibre worker copied to public/vendor");
