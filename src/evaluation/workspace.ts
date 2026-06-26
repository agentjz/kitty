import fs from "node:fs/promises";
import path from "node:path";

export async function prepareCheckWorkspace(rootDir: string, name: string): Promise<string> {
  const workspace = path.join(rootDir, ".kitty", "eval-checks", name);
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  return workspace;
}
