import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const runtimeFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "injected.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "index.html",
];

for (const file of runtimeFiles) {
  if (!existsSync(file)) throw new Error(`Required runtime file is missing: ${file}`);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
  throw new Error("manifest.json must declare at least one content script.");
}

for (const file of [
  "background.js",
  "bookmarklet.js",
  "content.js",
  "injected.js",
  "popup/popup.js",
  "universal-bookmarklet.js",
  "universal-cookiebot-integration.js",
  "website-integration.js",
]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${file} failed syntax validation:\n${result.stderr}`);
  }
}

console.log("Static extension validation passed.");
