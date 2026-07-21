import type { ToolCallRecord } from "../types.js";
import type { ToolCallProviderMetadataReplayPolicy } from "./catalog.js";

export function readToolCallProviderMetadata(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function toChatCompletionToolCall(
  toolCall: ToolCallRecord,
  replayPolicy: ToolCallProviderMetadataReplayPolicy,
): Record<string, unknown> {
  return {
    id: toolCall.id,
    type: toolCall.type,
    function: toolCall.function,
    ...(replayPolicy !== "never" && toolCall.providerMetadata
      ? { extra_content: toolCall.providerMetadata }
      : {}),
  };
}

export function hasRequiredToolCallProviderMetadata(
  toolCall: ToolCallRecord,
  replayPolicy: ToolCallProviderMetadataReplayPolicy,
): boolean {
  switch (replayPolicy) {
    case "never":
      return true;
    case "google-thought-signature-required":
      return hasGoogleThoughtSignature(toolCall);
  }
}

export function hasGoogleThoughtSignature(toolCall: ToolCallRecord): boolean {
  const google = toolCall.providerMetadata?.google;
  return isRecord(google) && typeof google.thought_signature === "string" && google.thought_signature.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
