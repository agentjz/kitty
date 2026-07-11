import figlet from "figlet";

const KITTY_WORDMARK_FONT = "ANSI Compact";

export function renderKittyBanner(): string {
  return renderWordmarkText("kitty", 120);
}

export function renderKittyAgentWordmark(): { kitty: string; agent: string } {
  return {
    kitty: renderWordmarkText("kitty"),
    agent: renderWordmarkText("agent"),
  };
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
