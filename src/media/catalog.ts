export interface MediaProviderInfo {
  id: "agnes";
  label: string;
  defaultBaseUrl: string;
  imageModels: readonly string[];
  videoModels: readonly string[];
}

export const MEDIA_PROVIDER_CATALOG: readonly MediaProviderInfo[] = [
  {
    id: "agnes",
    label: "Agnes AI",
    defaultBaseUrl: "https://apihub.agnes-ai.com/v1",
    imageModels: ["agnes-image-2.0-flash", "agnes-image-2.1-flash"],
    videoModels: ["agnes-video-v2.0"],
  },
] as const;

export function resolveMediaProvider(provider: string): MediaProviderInfo {
  const found = MEDIA_PROVIDER_CATALOG.find((item) => item.id === provider);
  if (!found) throw new Error(`Unknown media provider: ${provider}.`);
  return found;
}
