const FIRST_LINE_PREFIX = "> ";
const CONTINUATION_PREFIX = "\u2026 ";

export function formatSubmittedInput(input: string): string {
  return input
    .split("\n")
    .map((line, index) => `${index === 0 ? FIRST_LINE_PREFIX : CONTINUATION_PREFIX}${line}`)
    .join("\n");
}

export function parseSubmittedInputEcho(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !lines[0]?.startsWith(FIRST_LINE_PREFIX)) return undefined;
  const parsed = lines.map((line, index) => {
    const prefix = index === 0 ? FIRST_LINE_PREFIX : CONTINUATION_PREFIX;
    return line.startsWith(prefix) ? line.slice(prefix.length) : line;
  }).join("\n");
  return parsed.trim() ? parsed : undefined;
}
