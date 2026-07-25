import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, "src");
const PRODUCER_DIRECTORIES = [
  "agent",
  "config",
  "context",
  "control",
  "execution",
  "capabilities",
  "host",
  "interaction",
  "observability",
  "project",
  "provider",
  "remote",
  "runtime",
  "runtime-ui",
  "session",
  "skills",
  "tools",
  "types",
  "utils",
] as const;
const ADAPTER_DIRECTORIES = ["cli", "shell", "telegram", "weixin"] as const;

test("runtime producers never import interface adapters", async () => {
  const forbiddenRoots = ADAPTER_DIRECTORIES.map((directory) => path.join(SOURCE_ROOT, directory));
  const violations: string[] = [];

  for (const directory of PRODUCER_DIRECTORIES) {
    for (const file of await listFiles(path.join(SOURCE_ROOT, directory))) {
      if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
      const source = await readFile(file, "utf8");
      for (const specifier of readRelativeImports(source)) {
        const target = path.resolve(path.dirname(file), specifier);
        if (forbiddenRoots.some((root) => target === root || target.startsWith(`${root}${path.sep}`))) {
          violations.push(`${path.relative(ROOT, file)} -> ${specifier}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

function readRelativeImports(source: string): string[] {
  const imports: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]?.startsWith(".")) imports.push(match[1]);
  }
  return imports;
}

async function listFiles(target: string): Promise<string[]> {
  const entry = await import("node:fs/promises").then(({ stat }) => stat(target).catch(() => undefined));
  if (!entry) return [];
  if (entry.isFile()) return [target];

  const files: string[] = [];
  for (const child of await readdir(target, { withFileTypes: true })) {
    files.push(...await listFiles(path.join(target, child.name)));
  }
  return files;
}
