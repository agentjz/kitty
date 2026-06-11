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
  writableTools: "planning" | "implementation";
  documents: Record<SpecDocumentName, SpecDocumentSummary>;
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
      writableTools: "planning",
      documents: summarizeDocuments(input.documents ?? {}),
    };
  }

  return {
    active: true,
    specId: input.spec.id,
    title: input.spec.title,
    stage: input.spec.stage,
    status: input.spec.status,
    confirmed: input.spec.confirmed,
    nextGate: readNextGate(input.spec),
    writableTools: isImplementationToolSurface(input.spec) ? "implementation" : "planning",
    documents: summarizeDocuments(input.documents ?? {}),
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
    `Writable tools: ${summary.writableTools}`,
    summary.workspace ? `Workspace: ${summary.workspace.path} (${summary.workspace.branch})` : undefined,
    `Documents: ${formatDocumentFacts(summary.documents)}`,
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
