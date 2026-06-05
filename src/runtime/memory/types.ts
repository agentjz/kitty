export type RuntimeMemoryAssetKind = "evidence" | "project" | "session" | "user";

export interface RuntimeMemoryAsset {
  id: string;
  kind: RuntimeMemoryAssetKind;
  path: string;
  absolutePath: string;
  updatedAt?: string;
  size: number;
  evidenceRefs: string[];
}

export interface RuntimeMemoryAssetContent extends RuntimeMemoryAsset {
  content: string;
}

export interface RuntimeMemoryAssetSearchResult extends RuntimeMemoryAsset {
  matches: string[];
}
