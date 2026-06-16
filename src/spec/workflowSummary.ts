import { createInitialSpecDocument } from "./initialDocuments.js";
import { SPEC_DOCUMENT_NAMES } from "./schema.js";
import type { SpecDocumentName, SpecState } from "./types.js";

export interface SpecWorkflowSummary {
  active: boolean;
  specId?: string;
  title?: string;
  stage?: string;
  status?: string;
  confirmed: {
    requirements: boolean;
    design: boolean;
    tasks: boolean;
  };
  nextGate: string;
  stageLabel: string;
  nextAction: string;
  waitingFor: string[];
  writableTools: "planning" | "implementation";
  documents: Record<SpecDocumentName, SpecDocumentSummary>;
  documentProgress: {
    ready: number;
    total: number;
    summary: string;
  };
  workspace?: {
    path: string;
    branch: string;
  };
}

export interface SpecDocumentSummary {
  present: boolean;
  bytes: number;
  initial: boolean;
}

export function buildSpecWorkflowSummary(input: {
  spec: SpecState | null;
  documents?: Partial<Record<SpecDocumentName, string>>;
}): SpecWorkflowSummary {
  if (!input.spec) {
    return {
      active: false,
      confirmed: {
        requirements: false,
        design: false,
        tasks: false,
      },
      nextGate: "create_spec",
      stageLabel: "No active spec",
      nextAction: "Create a spec for the current objective.",
      waitingFor: ["spec creation"],
      writableTools: "planning",
      documents: summarizeDocuments(input.documents ?? {}),
      documentProgress: buildDocumentProgress(summarizeDocuments(input.documents ?? {})),
    };
  }
  const documents = summarizeDocuments(input.documents ?? {});

  return {
    active: true,
    specId: input.spec.id,
    title: input.spec.title,
    stage: input.spec.stage,
    status: input.spec.status,
    confirmed: input.spec.confirmed,
    nextGate: readNextGate(input.spec),
    stageLabel: readStageLabel(input.spec.stage),
    nextAction: readNextAction(input.spec),
    waitingFor: readWaitingFor(input.spec),
    writableTools: isImplementationToolSurface(input.spec) ? "implementation" : "planning",
    documents,
    documentProgress: buildDocumentProgress(documents),
    workspace: input.spec.workspace ? {
      path: input.spec.workspace.path,
      branch: input.spec.workspace.branch,
    } : undefined,
  };
}

export function formatSpecWorkflowSummary(summary: SpecWorkflowSummary): string {
  const lines = [
    `Active: ${summary.active ? "yes" : "no"}`,
    summary.specId ? `Spec: ${summary.specId}` : undefined,
    summary.title ? `Title: ${summary.title}` : undefined,
    summary.stage ? `Stage: ${summary.stage}` : undefined,
    summary.status ? `Status: ${summary.status}` : undefined,
    `Confirmed: requirements=${summary.confirmed.requirements}, design=${summary.confirmed.design}, tasks=${summary.confirmed.tasks}`,
    `Next gate: ${summary.nextGate}`,
    `Next action: ${summary.nextAction}`,
    `Waiting for: ${summary.waitingFor.join(", ") || "none"}`,
    `Writable tools: ${summary.writableTools}`,
    summary.workspace ? `Workspace: ${summary.workspace.path} (${summary.workspace.branch})` : undefined,
    `Documents: ${formatDocumentFacts(summary.documents)}`,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export function formatSpecWorkflowBrief(summary: SpecWorkflowSummary): string {
  const lines = [
    summary.active
      ? `${summary.specId}  ${summary.stageLabel}  ${summary.title ?? "(untitled)"}`
      : "No active spec",
    `Next: ${summary.nextAction}`,
    `Waiting: ${summary.waitingFor.join(", ") || "none"}`,
    `Documents: ${summary.documentProgress.summary}`,
    `Confirmed: requirements=${summary.confirmed.requirements}, design=${summary.confirmed.design}, tasks=${summary.confirmed.tasks}`,
    `Tools: ${summary.writableTools}`,
    summary.workspace ? `Workspace: ${summary.workspace.path} (${summary.workspace.branch})` : undefined,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function summarizeDocuments(documents: Partial<Record<SpecDocumentName, string>>): Record<SpecDocumentName, SpecDocumentSummary> {
  return Object.fromEntries(SPEC_DOCUMENT_NAMES.map((name) => {
    const content = documents[name];
    return [name, {
      present: typeof content === "string",
      bytes: content ? Buffer.byteLength(content, "utf8") : 0,
      initial: typeof content === "string" && normalize(content) === normalize(createInitialSpecDocument(name)),
    }];
  })) as Record<SpecDocumentName, SpecDocumentSummary>;
}

function readNextGate(spec: SpecState): string {
  if (!spec.confirmed.requirements) {
    return "confirm_requirements";
  }
  if (!spec.confirmed.design) {
    return "confirm_design";
  }
  if (!spec.confirmed.tasks) {
    return "confirm_tasks";
  }
  if (spec.stage === "implement") {
    return "implement_tasks";
  }
  if (spec.stage === "validate") {
    return "validate_result";
  }
  if (spec.stage === "archive") {
    return "archive";
  }
  return "advance_stage";
}

function readStageLabel(stage: SpecState["stage"]): string {
  switch (stage) {
    case "requirements":
      return "Requirements";
    case "design":
      return "Design";
    case "tasks":
      return "Tasks";
    case "implement":
      return "Implementation";
    case "validate":
      return "Validation";
    case "archive":
      return "Archive";
  }
}

function readNextAction(spec: SpecState): string {
  if (!spec.confirmed.requirements) {
    return "Finish requirements.md and ask the user to confirm requirements.";
  }
  if (!spec.confirmed.design) {
    return "Finish design.md against confirmed requirements and ask the user to confirm design.";
  }
  if (!spec.confirmed.tasks) {
    return "Finish tasks.md against confirmed design and ask the user to confirm tasks.";
  }
  if (spec.stage === "implement") {
    return "Execute the confirmed tasks and record progress.";
  }
  if (spec.stage === "validate") {
    return "Validate the implemented work and record evidence.";
  }
  if (spec.stage === "archive") {
    return "Archive the completed spec with final evidence.";
  }
  return "Advance to the next spec stage.";
}

function readWaitingFor(spec: SpecState): string[] {
  return [
    spec.confirmed.requirements ? undefined : "requirements confirmation",
    spec.confirmed.design ? undefined : "design confirmation",
    spec.confirmed.tasks ? undefined : "tasks confirmation",
  ].filter((item): item is string => Boolean(item));
}

function buildDocumentProgress(documents: Record<SpecDocumentName, SpecDocumentSummary>): SpecWorkflowSummary["documentProgress"] {
  const total = SPEC_DOCUMENT_NAMES.length;
  const ready = SPEC_DOCUMENT_NAMES.filter((name) => {
    const document = documents[name];
    return document.present && document.bytes > 0 && !document.initial;
  }).length;
  return {
    ready,
    total,
    summary: `${ready}/${total} documents ready`,
  };
}

function isImplementationToolSurface(spec: SpecState): boolean {
  return (
    (spec.stage === "implement" || spec.stage === "validate" || spec.stage === "archive") &&
    spec.confirmed.requirements &&
    spec.confirmed.design &&
    spec.confirmed.tasks
  );
}

function formatDocumentFacts(documents: Record<SpecDocumentName, SpecDocumentSummary>): string {
  return SPEC_DOCUMENT_NAMES
    .map((name) => {
      const document = documents[name];
      return `${name}=${document.present ? `${document.bytes}b${document.initial ? ":initial" : ""}` : "missing"}`;
    })
    .join(", ");
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
