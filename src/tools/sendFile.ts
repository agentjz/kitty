import fs from "node:fs/promises";

import { okResult, parseArgs, readString } from "../tools/core/shared.js";
import type { RegisteredTool } from "../tools/core/types.js";

export const sendFileToolDefinition: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "send_file",
      description: "Send a local file back to the conversation. Only available when the host supports file delivery (e.g. Telegram). In CLI mode this tool returns an error.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Absolute or relative path to the local file to send.",
          },
          fileName: {
            type: "string",
            description: "Optional display file name. Defaults to the basename of the file path.",
          },
          caption: {
            type: "string",
            description: "Optional caption attached to the file.",
          },
        },
        required: ["filePath"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const filePath = readString(args.filePath, "filePath");
    const fileName = typeof args.fileName === "string" ? args.fileName : undefined;
    const caption = typeof args.caption === "string" ? args.caption : undefined;

    if (!context.enqueueFile) {
      return {
        ok: false,
        output: JSON.stringify({
          ok: false,
          error: "send_file tool is only available when the host supports file delivery (Telegram mode). The current host does not provide file delivery capability.",
        }),
      };
    }

    try {
      await fs.access(filePath);
    } catch {
      return {
        ok: false,
        output: JSON.stringify({
          ok: false,
          error: `File not found: ${filePath}`,
        }),
      };
    }

    const entryId = await context.enqueueFile(filePath, fileName, caption);

    return okResult(
      JSON.stringify({
        ok: true,
        filePath,
        fileName: fileName ?? filePath.split(/[/\\]/).pop(),
        caption,
        entryId,
      }),
    );
  },
};
