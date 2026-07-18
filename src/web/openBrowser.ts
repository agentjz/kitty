import { spawn } from "node:child_process";

export async function openBrowser(url: string): Promise<boolean> {
  try {
    const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    return await new Promise<boolean>((resolve) => {
      child.once("spawn", () => resolve(true));
      child.once("error", () => resolve(false));
    });
  } catch {
    return false;
  }
}
