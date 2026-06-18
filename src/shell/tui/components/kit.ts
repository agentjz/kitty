import type React from "react";
import type { Key } from "ink";

export interface InkRuntime {
  React: typeof React;
  Box: typeof import("ink").Box;
  Text: typeof import("ink").Text;
  useInput: typeof import("ink").useInput;
  useStdout: typeof import("ink").useStdout;
  TextArea: typeof import("react-ink-textarea").TextArea;
}

export type InkInputKey = Key;
