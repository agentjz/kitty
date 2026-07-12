import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const cliPath = path.join(root, "dist", "cli.js");

if (!existsSync(cliPath)) {
  console.error("dist/cli.js is missing. Run `npm.cmd run build` before running eval.");
  process.exit(1);
}

const distMtime = statSync(cliPath).mtimeMs;
const sourceFiles = [
  ...walkIfDirectory(path.join(root, "src")),
  path.join(root, "package.json"),
  path.join(root, "tsconfig.json"),
].filter(existsSync);
const newer = sourceFiles.find((file) => statSync(file).mtimeMs > distMtime);
if (newer) {
  console.error(`dist/cli.js is stale because ${path.relative(root, newer)} is newer. Run \`npm.cmd run build\` before running eval.`);
  process.exit(1);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : entry.isFile() ? [fullPath] : [];
  });
}

function walkIfDirectory(directory) {
  return existsSync(directory) && statSync(directory).isDirectory() ? walk(directory) : [];
}
