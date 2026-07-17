export function chunkWeixinMessage(text: string, maxBytes: number): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let current = "";
  for (const char of text) {
    if (current && Buffer.byteLength(current + char, "utf8") > maxBytes) { chunks.push(current); current = char; }
    else current += char;
  }
  if (current) chunks.push(current);
  return chunks;
}
