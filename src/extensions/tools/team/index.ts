import { teamInboxReadTool } from "./tools/teamInboxRead.js";
import { teamListTool } from "./tools/teamList.js";
import { teamMessageSendTool } from "./tools/teamMessageSend.js";
import { teamSpawnTool } from "./tools/teamSpawn.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createTeamTools(): RegisteredTool[] {
  return [
    teamSpawnTool,
    teamListTool,
    teamMessageSendTool,
    teamInboxReadTool,
  ];
}
