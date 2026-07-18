import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
if (packageJson.scripts?.prepack !== "npm run build") {
  throw new Error("The npm prepack hook must build the release artifacts.");
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Package verification must run through an npm script.");
}
const reportText = execFileSync(
  process.execPath,
  [npmCli, "pack", "--dry-run", "--ignore-scripts", "--json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  },
);
const report = JSON.parse(reportText)[0];

const files = new Set(report.files.map((file) => file.path));
for (const required of [
  "dist/cli.js", "dist/tui.mjs", "dist/web/index.html", "dist/web/app.js",
  "dist/web/channelStream.js", "dist/web/workflowViews.js",
  "dist/web/vendor/bootstrap.min.css", "dist/web/vendor/bootstrap-icons.css",
  "dist/web/vendor/marked.esm.js", "package.json", "scripts/postinstall.cjs",
]) {
  if (!files.has(required)) {
    throw new Error(`Packed Kitty artifact is missing ${required}.`);
  }
}

const nativeAddon = report.files.find((file) => file.path.endsWith(".node"));
if (nativeAddon) {
  throw new Error(`Packed Kitty artifact contains native addon ${nativeAddon.path}.`);
}

console.log(`Package manifest verified: ${report.entryCount} files, no native addons.`);
