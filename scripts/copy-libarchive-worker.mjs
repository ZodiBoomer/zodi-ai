import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const assets = [
  ["node_modules/libarchive.js/dist/worker-bundle.js", "public/libarchive-worker.js"],
  ["node_modules/libarchive.js/dist/libarchive.wasm", "public/libarchive.wasm"]
];
for (const [sourcePath, destinationPath] of assets) {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
console.log("Prepared libarchive worker and WebAssembly assets in public/");
