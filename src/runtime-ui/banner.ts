import figlet from "figlet";

const KITTY_WORDMARK_FONT = "ANSI Compact";

export function renderKittyBanner(): string {
  return renderWordmarkText("kitty", 120);
}

export function renderKittyAgentWordmark(): { kitty: string; agent: string } {
  return renderKittyWordmarkPair("agent");
}

export function renderKittyProductBanner(
  product: "telegram" | "weixin",
  maxWidth = Number.POSITIVE_INFINITY,
): string {
  const wordmark = renderKittyWordmarkPair(product);
  const left = wordmark.kitty.split("\n");
  const right = wordmark[product].split("\n");
  const leftWidth = Math.max(...left.map((line) => line.length));
  const rows = Math.max(left.length, right.length);
  const sideBySide = Array.from({ length: rows }, (_, index) =>
    `${left[index] ?? ""}`.padEnd(leftWidth, " ") + `  ${right[index] ?? ""}`.trimEnd())
    .join("\n");
  return Math.max(...sideBySide.split("\n").map((line) => line.length)) <= maxWidth
    ? sideBySide
    : `${wordmark.kitty}\n\n${wordmark[product]}`;
}

function renderKittyWordmarkPair<T extends "agent" | "telegram" | "weixin">(
  product: T,
): { kitty: string } & Record<T, string> {
  return {
    kitty: renderWordmarkText("kitty"),
    [product]: renderWordmarkText(product),
  } as { kitty: string } & Record<T, string>;
}

function renderWordmarkText(value: string, width?: number): string {
  return figlet.textSync(value, {
    font: KITTY_WORDMARK_FONT,
    horizontalLayout: "default",
    verticalLayout: "default",
    width,
    whitespaceBreak: false,
  }).replace(/^\s*(?:\r?\n)+|(?:\r?\n)+\s*$/g, "");
}
