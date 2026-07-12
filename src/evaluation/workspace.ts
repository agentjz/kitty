import fs from "node:fs/promises";
import path from "node:path";

export async function prepareCheckWorkspace(rootDir: string, name: string): Promise<string> {
  const workspace = path.join(rootDir, ".test-tmp", "evaluation", name);
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  return workspace;
}

export async function cleanupCheckWorkspaces(rootDir: string): Promise<void> {
  const testRoot = path.join(rootDir, ".test-tmp");
  await fs.rm(path.join(testRoot, "evaluation"), { recursive: true, force: true });
  await fs.rmdir(testRoot).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
  });
}
