import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve("node_modules/libarchive.js/dist/worker-bundle.js");
const destination = resolve("public/libarchive-worker.js");
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log("Prepared libarchive worker at public/libarchive-worker.js");
