import type React from "react";
import type { Key } from "ink";

export interface InkRuntime {
  React: typeof React;
  Box: typeof import("ink").Box;
  Text: typeof import("ink").Text;
  useInput: typeof import("ink").useInput;
  useBoxMetrics: typeof import("ink").useBoxMetrics;
  useCursor: typeof import("ink").useCursor;
  useStdout: typeof import("ink").useStdout;
}

export type InkInputKey = Key;
