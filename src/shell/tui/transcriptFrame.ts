import stringWidth from "string-width";

import type {
  TuiTranscriptLineFrame,
  TuiTranscriptLineStyle,
  TuiTranscriptRole,
  TuiTranscriptTheme,
} from "./transcriptTypes.js";
import type { TuiMarkdownLineKind } from "./markdown.js";

export const TRANSCRIPT_OUTER_PADDING_X = 3;

const MIN_BODY_WIDTH = 8;
const TRANSCRIPT_CONTENT_FRAME = {
  gap: 2,
  marginLeft: 1,
  paddingLeft: 1,
  paddingRight: 1,
} as const;

export function readTranscriptRoleFrame(role: TuiTranscriptRole, viewportWidth: number): TuiTranscriptLineFrame {
  const frameWidth = Math.max(1, viewportWidth - TRANSCRIPT_OUTER_PADDING_X * 2);
  const base = readRoleFrameBase(role);
  const bodyWidth = Math.max(
    MIN_BODY_WIDTH,
    frameWidth - base.marginLeft - base.paddingLeft - base.paddingRight - stringWidth(base.gutter) - base.gap,
  );
  return {
    ...base,
    bodyWidth,
  };
}

export function readTranscriptRoleStyle(role: TuiTranscriptRole, theme: TuiTranscriptTheme): TuiTranscriptLineStyle {
  switch (role) {
    case "user":
      return {
        accent: theme.user,
        background: theme.panel,
        text: theme.text,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
    case "reasoning":
      return {
        accent: theme.muted,
        background: undefined,
        text: theme.reasoning,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
    case "system":
      return {
        accent: theme.border,
        background: theme.panel,
        text: theme.system,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
    case "assistant":
      return {
        accent: theme.background,
        background: undefined,
        text: theme.assistant,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
    case "change":
      return {
        accent: theme.border,
        background: undefined,
        text: theme.system,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
    case "tool":
    case "plan":
      return {
        accent: theme.border,
        background: undefined,
        text: theme.system,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
  }
}

export function applyTranscriptMarkdownStyle(
  base: TuiTranscriptLineStyle,
  kind: TuiMarkdownLineKind | undefined,
  theme: TuiTranscriptTheme,
): TuiTranscriptLineStyle {
  switch (kind) {
    case "heading":
      return {
        ...base,
        text: theme.user,
        bold: true,
      };
    case "code":
      return {
        ...base,
        background: theme.panel,
        text: theme.system,
      };
    case "quote":
      return {
        ...base,
        text: theme.reasoning,
        dim: true,
      };
    case "changeHeader":
      return {
        ...base,
        text: theme.user,
        bold: true,
      };
    case "diffAdded":
      return {
        ...base,
        background: theme.diffAddedBackground,
        text: theme.diffAdded,
      };
    case "diffRemoved":
      return {
        ...base,
        background: theme.diffRemovedBackground,
        text: theme.diffRemoved,
      };
    case "diffContext":
      return {
        ...base,
        text: theme.muted,
      };
    case "toolHeader":
      return {
        ...base,
        text: theme.system,
        bold: true,
      };
    case "toolDetail":
      return {
        ...base,
        text: theme.muted,
      };
    case "planHeader":
      return {
        ...base,
        text: theme.user,
        bold: true,
      };
    case "planCompleted":
      return {
        ...base,
        text: theme.muted,
        dim: true,
      };
    case "planActive":
      return {
        ...base,
        text: theme.diffAdded,
        bold: true,
      };
    case "planPending":
      return {
        ...base,
        text: theme.system,
      };
    case "rule":
    case "table":
      return {
        ...base,
        text: theme.muted,
      };
    case "list":
    case "text":
    case undefined:
      return base;
  }
}

function readRoleFrameBase(role: TuiTranscriptRole): Omit<TuiTranscriptLineFrame, "bodyWidth"> {
  switch (role) {
    case "user":
      return {
        ...TRANSCRIPT_CONTENT_FRAME,
        gutter: " ",
      };
    case "reasoning":
      return {
        ...TRANSCRIPT_CONTENT_FRAME,
        gutter: "┃",
      };
    case "system":
      return {
        ...TRANSCRIPT_CONTENT_FRAME,
        gutter: "│",
      };
    case "assistant":
    case "change":
    case "tool":
    case "plan":
      return {
        ...TRANSCRIPT_CONTENT_FRAME,
        gutter: " ",
      };
  }
}
