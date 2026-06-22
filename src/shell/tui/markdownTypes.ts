export type TuiMarkdownLineKind =
  | "text"
  | "heading"
  | "list"
  | "code"
  | "quote"
  | "table"
  | "rule";

export interface TuiMarkdownSpan {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly code?: boolean;
  readonly strike?: boolean;
  readonly href?: string;
}

export interface TuiMarkdownLine {
  readonly kind: TuiMarkdownLineKind;
  readonly text: string;
  readonly spans: readonly TuiMarkdownSpan[];
  readonly language?: string;
}
