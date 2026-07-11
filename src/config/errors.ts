export type ConfigErrorKind = "missing" | "invalid";

export class ConfigError extends Error {
  readonly kind: ConfigErrorKind;
  readonly key: string;

  constructor(kind: ConfigErrorKind, key: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.kind = kind;
    this.key = key;
  }
}

export function missingConfigValue(key: string, message = `Missing config value: ${key}.`): ConfigError {
  return new ConfigError("missing", key, message);
}

export function invalidConfigValue(key: string, message: string): ConfigError {
  return new ConfigError("invalid", key, message);
}
