export function normalizeResponsesOutputText(response: unknown): string | null {
  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }

  const fragments = output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") {
      return [];
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return [];
    }

    return content.flatMap((part) => {
      if (!part || typeof part !== "object" || (part as { type?: unknown }).type !== "output_text") {
        return [];
      }

      return typeof (part as { text?: unknown }).text === "string"
        ? [(part as { text: string }).text]
        : [];
    });
  });

  return fragments.length > 0 ? fragments.join("") : null;
}

export function readResponsesToolCalls(response: unknown) {
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .filter((item): item is {
      id?: string;
      type: "function_call";
      call_id?: string;
      name?: string;
      arguments?: string;
    } => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "function_call")
    .map((item) => ({
      id: item.call_id ?? item.id ?? crypto.randomUUID(),
      type: "function" as const,
      function: {
        name: item.name ?? "",
        arguments: item.arguments ?? "",
      },
    }));
}

export function readResponsesReasoning(response: unknown): string | undefined {
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  const fragments = output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "reasoning") {
      return [];
    }

    const reasoningItem = item as {
      summary?: Array<{ text?: unknown }>;
      content?: Array<{ text?: unknown }>;
    };
    const summary = Array.isArray(reasoningItem.summary)
      ? reasoningItem.summary
        .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
        .filter(Boolean)
      : [];
    const content = Array.isArray(reasoningItem.content)
      ? reasoningItem.content
        .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
        .filter(Boolean)
      : [];
    return [...content, ...summary];
  });

  return fragments.length > 0 ? fragments.join("") : undefined;
}
