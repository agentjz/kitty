import { invalidConfigValue } from "./errors.js";

export interface CapabilityConfig {
  playwright: {
    headless: boolean;
    timeoutMs: number;
  };
}

export type CapabilityRuntimeConfig = CapabilityConfig;

export const INITIAL_CAPABILITY_CONFIG: CapabilityConfig = {
  playwright: {
    headless: false,
    timeoutMs: 120_000,
  },
};

export function normalizeCapabilityConfig(value: unknown): CapabilityConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidConfigValue("capabilities", "Missing capability configuration.");
  }
  const record = value as Record<string, unknown>;
  const playwright = readRecord(record.playwright, "capabilities.playwright");
  return {
    playwright: {
      headless: readBoolean(playwright.headless, "capabilities.playwright.headless"),
      timeoutMs: readInteger(playwright.timeoutMs, 5_000, 600_000, "capabilities.playwright.timeoutMs"),
    },
  };
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidConfigValue(key, `Missing ${key}.`);
  }
  return value as Record<string, unknown>;
}

function readBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw invalidConfigValue(key, `Missing or invalid ${key}.`);
  return value;
}

function readInteger(value: unknown, min: number, max: number, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw invalidConfigValue(key, `Missing or invalid ${key}.`);
  }
  return value;
}
