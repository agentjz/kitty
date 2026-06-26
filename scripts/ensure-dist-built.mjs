import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const cliPath = path.join(root, "dist", "cli.js");

if (!existsSync(cliPath)) {
  console.error("dist/cli.js is missing. Run `npm.cmd run build` before running eval.");
  process.exit(1);
}
