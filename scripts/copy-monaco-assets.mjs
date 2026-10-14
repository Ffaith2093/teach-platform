import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const source = path.resolve("node_modules/monaco-editor/min/vs");
const destination = path.resolve("public/monaco/vs");

try {
  await stat(path.join(source, "loader.js"));
} catch {
  throw new Error(`Monaco assets are missing at ${source}. Run npm install first.`);
}

await rm(destination, { recursive: true, force: true });
await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });

for (const requiredFile of [
  "loader.js",
  "editor/editor.main.js",
  "editor/editor.main.css",
  "editor/editor.worker.js",
]) {
  await stat(path.join(destination, requiredFile));
}

console.log(`Monaco assets copied to ${path.relative(process.cwd(), destination)}`);
