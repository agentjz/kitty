import type { FunctionToolDefinition } from "../tools/index.js";
import type { ChatToolSchemaDialect } from "./catalog.js";

export function applyToolSchemaDialect(
  tools: FunctionToolDefinition[],
  dialect: ChatToolSchemaDialect,
): FunctionToolDefinition[] {
  if (dialect === "standard") {
    return tools;
  }

  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: sanitizeGeminiSchema(tool.function.parameters),
    },
  })) as FunctionToolDefinition[];
}

function sanitizeGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeGeminiSchema);
  }
  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "enum" && Array.isArray(item)
        ? item.map(String)
        : sanitizeGeminiSchema(item),
    ]),
  );

  if (Array.isArray(result.type)) {
    const types = result.type.filter((item): item is string => typeof item === "string");
    const nonNullTypes = types.filter((item) => item !== "null");
    delete result.type;
    if (nonNullTypes.length === 1) {
      result.type = nonNullTypes[0];
    } else if (nonNullTypes.length > 1) {
      result.anyOf = nonNullTypes.map((type) => ({ type }));
    }
    if (types.includes("null")) {
      result.nullable = true;
    }
  }

  if ((result.type === "integer" || result.type === "number") && Array.isArray(result.enum)) {
    result.type = "string";
  }

  if (result.type === "object" && isRecord(result.properties) && Array.isArray(result.required)) {
    const properties = result.properties;
    result.required = result.required.filter((field) => typeof field === "string" && field in properties);
  }

  if (result.type === "array" && result.items === undefined) {
    result.items = {};
  }

  if (typeof result.type === "string" && result.type !== "object" && result.anyOf === undefined) {
    delete result.properties;
    delete result.required;
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
