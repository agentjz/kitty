import figlet from "figlet";

const KITTY_WORDMARK_FONT = "ANSI Shadow";

export function renderKittyBanner(): string {
  return figlet
    .textSync("kitty agent", {
      font: KITTY_WORDMARK_FONT,
      horizontalLayout: "default",
      verticalLayout: "default",
      width: 120,
      whitespaceBreak: false,
    })
    .trimEnd();
}
