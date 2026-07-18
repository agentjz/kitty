import { build } from "tsup";
import fs from "node:fs/promises";
import path from "node:path";

const common = {
  platform: "node",
  target: "node22",
  outDir: "dist",
  removeNodeProtocol: false,
};

await build({
  ...common,
  entry: ["src/cli.ts"],
  format: ["cjs"],
  clean: true,
  sourcemap: true,
});

await build({
  ...common,
  entry: ["src/tui.ts"],
  format: ["esm"],
  clean: false,
  external: ["typescript", "react-devtools-core"],
});

const webDir = path.resolve("dist/web");
await fs.rm(webDir, { recursive: true, force: true });
await fs.cp(path.resolve("src/web/public"), webDir, { recursive: true });
await fs.mkdir(path.join(webDir, "vendor", "fonts"), { recursive: true });
await Promise.all([
  fs.copyFile("node_modules/bootstrap/dist/css/bootstrap.min.css", path.join(webDir, "vendor/bootstrap.min.css")),
  fs.copyFile("node_modules/bootstrap/dist/js/bootstrap.bundle.min.js", path.join(webDir, "vendor/bootstrap.bundle.min.js")),
  fs.copyFile("node_modules/bootstrap-icons/font/bootstrap-icons.css", path.join(webDir, "vendor/bootstrap-icons.css")),
  fs.copyFile("node_modules/bootstrap-icons/font/fonts/bootstrap-icons.woff", path.join(webDir, "vendor/fonts/bootstrap-icons.woff")),
  fs.copyFile("node_modules/bootstrap-icons/font/fonts/bootstrap-icons.woff2", path.join(webDir, "vendor/fonts/bootstrap-icons.woff2")),
  fs.copyFile("node_modules/marked/lib/marked.esm.js", path.join(webDir, "vendor/marked.esm.js")),
]);
