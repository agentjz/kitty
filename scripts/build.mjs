import { build } from "tsup";

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
