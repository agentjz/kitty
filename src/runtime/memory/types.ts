export interface RuntimeMemoryAsset {
  sessionId: string;
  path: string;
  absolutePath: string;
  updatedAt?: string;
  size: number;
}

export interface RuntimeMemoryAssetContent extends RuntimeMemoryAsset {
  content: string;
}

export interface RuntimeMemoryAssetSearchResult extends RuntimeMemoryAsset {
  matches: string[];
}
