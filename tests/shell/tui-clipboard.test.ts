import assert from "node:assert/strict";
import test from "node:test";

import { nativeClipboardCommands, writeTuiClipboard } from "../../src/shell/tui/clipboard.js";

test("tui clipboard chooses platform-native providers in deterministic order", () => {
  assert.deepEqual(nativeClipboardCommands("win32"), [{ command: "clip.exe", args: [] }]);
  assert.deepEqual(nativeClipboardCommands("darwin"), [{ command: "pbcopy", args: [] }]);
  assert.deepEqual(nativeClipboardCommands("linux").map((item) => item.command), ["wl-copy", "xclip", "xsel"]);
});

test("tui clipboard prefers a working native provider", async () => {
  const calls: Array<{ command: string; text: string }> = [];
  await writeTuiClipboard("selected", {
    platform: "win32",
    output: { isTTY: true, write: () => true },
    runCommand: async (command, _args, text) => {
      calls.push({ command, text });
    },
  });
  assert.deepEqual(calls, [{ command: "clip.exe", text: "selected" }]);
});

test("tui clipboard falls back to OSC52 when native providers are unavailable", async () => {
  let output = "";
  await writeTuiClipboard("selected", {
    platform: "linux",
    output: {
      isTTY: true,
      write(chunk) {
        output += String(chunk);
        return true;
      },
    },
    runCommand: async () => {
      throw new Error("missing command");
    },
  });
  assert.equal(output, `\u001b]52;c;${Buffer.from("selected").toString("base64")}\u0007`);
});

test("tui clipboard reports failure when neither native nor terminal clipboard exists", async () => {
  await assert.rejects(
    writeTuiClipboard("selected", {
      platform: "win32",
      output: { isTTY: false, write: () => true },
      runCommand: async () => {
        throw new Error("clip unavailable");
      },
    }),
    /clip unavailable/,
  );
});
