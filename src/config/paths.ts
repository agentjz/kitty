import type { AppPaths } from "../types.js";
import { getProjectStatePaths } from "../project/statePaths.js";

export function getAppPaths(rootDir = process.cwd()): AppPaths {
  const statePaths = getProjectStatePaths(rootDir);

  return {
    configDir: statePaths.kittyDir,
    dataDir: statePaths.kittyDir,
    cacheDir: statePaths.cacheDir,
    sessionsDir: statePaths.sessionsDir,
    memoryDir: statePaths.memoryDir,
    sessionMemoryDir: statePaths.sessionMemoryDir,
    changesDir: statePaths.changesDir,
    eventsDir: statePaths.eventsDir,
  };
}
