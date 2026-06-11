import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { getSpecSessionBindingFile } from "../../../../spec/layout.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { buildSpecWorkflowSummary } from "../../../../spec/workflowSummary.js";
import { changedJsonResult } from "../../../shared.js";
import { recordSpecLifecycle } from "../lifecycle.js";

export const specOpenTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_open",
      description: "Open an existing durable spec and bind it to the current session.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string", description: "Spec id to open." },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    });
    const specId = readString(args.specId, "specId");
    const state = await store.load(specId);
    await store.bindSession(context.sessionId, specId);
    recordSpecLifecycle(context, state, "spec_open");
    const documents = await store.readAllDocuments(specId);
    return changedJsonResult({
      ok: true,
      spec: summarizeSpec(state),
      workflow: buildSpecWorkflowSummary({ spec: state, documents }),
      workspace: state.workspace,
      documents,
    }, [getSpecSessionBindingFile(context.projectContext.stateRootDir, context.sessionId)]);
  },
};
