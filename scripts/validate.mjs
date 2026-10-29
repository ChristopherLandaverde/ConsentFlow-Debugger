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
  "popup/findings.js",
  "popup/render.js",
  "popup/ui-state.js",
  "sidepanel/panel.html",
  "sidepanel/panel.css",
  "sidepanel/panel.js",
  "index.html",
  "measurement-playground.js",
  "assets/consentflow-measurement-checklist.pdf",
  "assets/measurement-form-result.html",
];

for (const file of runtimeFiles) {
  if (!existsSync(file)) throw new Error(`Required runtime file is missing: ${file}`);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
  throw new Error("manifest.json must declare at least one content script.");
}

// Permissions are a reviewed decision (#15): each one must be listed here with its reason,
// and nothing else may be requested.
const allowedPermissions = {
  activeTab: "read the tab the popup is opened on",
  scripting: "inject content.js into tabs opened before install",
  sidePanel: "show the trace beside the page (#15)",
  storage: "chrome.storage.session for popup and panel UI state only (#15)",
};
for (const permission of manifest.permissions || []) {
  if (!(permission in allowedPermissions)) throw new Error(`manifest.json requests an unreviewed permission: ${permission}`);
}
for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions"]) {
  if (manifest[key] && manifest[key].length) throw new Error(`manifest.json must not declare ${key}.`);
}
if (manifest.side_panel?.default_path && !existsSync(manifest.side_panel.default_path)) {
  throw new Error(`side_panel.default_path is missing: ${manifest.side_panel.default_path}`);
}

for (const file of [
  "background.js",
  "bookmarklet.js",
  "content.js",
  "injected.js",
  "measurement-playground.js",
  "popup/popup.js",
  "popup/findings.js",
  "popup/render.js",
  "popup/ui-state.js",
  "sidepanel/panel.js",
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
