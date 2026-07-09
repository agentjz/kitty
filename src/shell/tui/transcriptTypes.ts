import type { TuiMarkdownLineKind } from "./markdown.js";

export type TuiTranscriptRole = "user" | "assistant" | "reasoning" | "system" | "subagent" | "subagent_reasoning";

export interface TuiTranscriptEntry {
  id: string;
  role: TuiTranscriptRole;
  text: string;
}

export interface TuiTranscriptLineView {
  id: string;
  entryId: string;
  role: TuiTranscriptRole;
  kind: "spacer" | "content";
  text: string;
  spans: readonly TuiTranscriptLineSpan[];
  prefix: string;
  markdownKind: TuiMarkdownLineKind | undefined;
  language: string | undefined;
  isFirstContentLine: boolean;
  frame: TuiTranscriptLineFrame;
  style: TuiTranscriptLineStyle;
}

export interface TuiTranscriptLineFrame {
  bodyWidth: number;
  gap: number;
  gutter: string;
  marginLeft: number;
  paddingLeft: number;
  paddingRight: number;
}

export interface TuiTranscriptLineStyle {
  accent: string;
  background: string | undefined;
  text: string;
  bold: boolean;
  dim: boolean;
  italicPrefix: boolean;
}

export interface TuiTranscriptLineSpan {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly code: boolean;
  readonly dim: boolean;
  readonly strike: boolean;
  readonly href: string | undefined;
}

export interface TuiTranscriptTheme {
  background: string;
  border: string;
  panel: string;
  panelStrong: string;
  text: string;
  muted: string;
  user: string;
  assistant: string;
  subagent: string;
  reasoning: string;
  thought: string;
  system: string;
}
