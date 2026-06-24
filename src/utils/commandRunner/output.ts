export function normalizeCommandOutput(output: string): string {
  if (!output.includes("#< CLIXML")) {
    return output;
  }

  const errors = [...output.matchAll(/<S\s+S="Error">([\s\S]*?)<\/S>/g)]
    .map((match) => decodePowerShellText(match[1] ?? ""))
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (errors.length === 0) {
    return output;
  }

  return errors.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodePowerShellText(value: string): string {
  return value
    .replace(/_x000D__x000A_/g, "\n")
    .replace(/_x000D_/g, "\r")
    .replace(/_x000A_/g, "\n")
    .replace(/_x0009_/g, "\t")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
