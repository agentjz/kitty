export interface WeixinLogger { info(event: string, details?: Record<string, unknown>): void; error(event: string, details?: Record<string, unknown>): void; }
export function createConsoleWeixinLogger(): WeixinLogger {
  return { info: (event, details) => console.log(format(event, details)), error: (event, details) => console.error(format(event, details)) };
}
function format(event: string, details?: Record<string, unknown>): string { return `[weixin] ${event}${details ? ` ${Object.entries(details).map(([k, v]) => `${k}=${String(v)}`).join(" ")}` : ""}`; }
