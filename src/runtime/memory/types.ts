export type RuntimeMemoryAssetKind = "evidence" | "project" | "session" | "user";
export type WritableRuntimeMemoryAssetKind = Exclude<RuntimeMemoryAssetKind, "session">;

export interface RuntimeMemoryAssetMetadata {
  title?: string;
  scope?: string;
  tags: string[];
}

export interface RuntimeMemoryAsset {
  id: string;
  kind: RuntimeMemoryAssetKind;
  title?: string;
  path: string;
  absolutePath: string;
  updatedAt?: string;
  size: number;
  evidenceRefs: string[];
  scope?: string;
  tags: string[];
}

export interface RuntimeMemoryAssetContent extends RuntimeMemoryAsset {
  content: string;
}

export interface RuntimeMemoryAssetSearchResult extends RuntimeMemoryAsset {
  score: number;
  matches: string[];
}

export interface CreateRuntimeMemoryAssetInput {
  rootDir: string;
  kind: WritableRuntimeMemoryAssetKind;
  title: string;
  content: string;
  evidenceRefs?: string[];
  scope?: string;
  tags?: string[];
  timestamp?: string;
  fileName?: string;
}
