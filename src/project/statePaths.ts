import fs from "node:fs/promises";
import path from "node:path";

export const PROJECT_STATE_DIR_NAME = ".kitty";
export const PROJECT_STATE_ENV_FILE_NAME = ".env";
export const PROJECT_STATE_ENV_EXAMPLE_FILE_NAME = ".env.example";
export const PROJECT_STATE_IGNORE_FILE_NAME = ".kittyignore";
export const PRESERVED_PROJECT_STATE_ENTRY_NAMES = [
  PROJECT_STATE_ENV_FILE_NAME,
  PROJECT_STATE_ENV_EXAMPLE_FILE_NAME,
] as const;

export interface ProjectStatePaths {
  rootDir: string;
  kittyDir: string;
  cacheDir: string;
  sessionsDir: string;
  changesDir: string;
  extensionsDir: string;
  memoryDir: string;
  evidenceMemoryDir: string;
  projectMemoryDir: string;
  sessionMemoryDir: string;
  userMemoryDir: string;
  controlPlaneLedgerFile: string;
  observabilityDir: string;
  observabilityEventsDir: string;
  observabilityCrashesDir: string;
}

export function getProjectStatePaths(rootDir: string): ProjectStatePaths {
  const normalizedRoot = path.resolve(rootDir);
  const kittyDir = path.join(normalizedRoot, PROJECT_STATE_DIR_NAME);
  const extensionsDir = path.join(kittyDir, "extensions");
  const memoryDir = path.join(kittyDir, "memory");
  const observabilityDir = path.join(kittyDir, "observability");
  return {
    rootDir: normalizedRoot,
    kittyDir,
    cacheDir: path.join(kittyDir, "cache"),
    sessionsDir: path.join(kittyDir, "sessions"),
    changesDir: path.join(kittyDir, "changes"),
    extensionsDir,
    memoryDir,
    evidenceMemoryDir: path.join(memoryDir, "evidence"),
    projectMemoryDir: path.join(memoryDir, "project"),
    sessionMemoryDir: path.join(memoryDir, "sessions"),
    userMemoryDir: path.join(memoryDir, "user"),
    controlPlaneLedgerFile: path.join(kittyDir, "control-plane.sqlite"),
    observabilityDir,
    observabilityEventsDir: path.join(observabilityDir, "events"),
    observabilityCrashesDir: path.join(observabilityDir, "crashes"),
  };
}

export async function ensureProjectStateDirectories(rootDir: string): Promise<ProjectStatePaths> {
  const paths = getProjectStatePaths(rootDir);
  await fs.mkdir(paths.extensionsDir, { recursive: true });
  await fs.mkdir(paths.cacheDir, { recursive: true });
  await fs.mkdir(paths.sessionsDir, { recursive: true });
  await fs.mkdir(paths.changesDir, { recursive: true });
  await fs.mkdir(paths.evidenceMemoryDir, { recursive: true });
  await fs.mkdir(paths.projectMemoryDir, { recursive: true });
  await fs.mkdir(paths.sessionMemoryDir, { recursive: true });
  await fs.mkdir(paths.userMemoryDir, { recursive: true });
  await fs.mkdir(paths.observabilityEventsDir, { recursive: true });
  await fs.mkdir(paths.observabilityCrashesDir, { recursive: true });
  return paths;
}
