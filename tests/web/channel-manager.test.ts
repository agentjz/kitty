import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { initializeProjectFiles } from "../../src/config/init.js";
import { resolveRuntimeConfig } from "../../src/config/runtime.js";
import { WebChannelManager } from "../../src/web/channelManager.js";
import { WebEventHub } from "../../src/web/events.js";
import type { WeixinLoginState } from "../../src/weixin/state.js";
import { createTempWorkspace } from "../helpers.js";

test("closing the Web channel manager fences a pending Weixin login", async (t) => {
  const root = await createTempWorkspace("web-weixin-login-close", t);
  await initializeProjectFiles(root);
  const events = new WebEventHub();
  let published = 0;
  events.publish = () => { published += 1; };
  let callbacks: {
    onQrCode?: (value: string) => void;
    onScanned?: () => void;
  } | undefined;
  const manager = new WebChannelManager(root, events, {
    createQrImage: async () => "data:image/png;base64,test",
    createWeixinLoginClient: () => ({
      loginWithQr: async (options) => {
        callbacks = options;
        return new Promise<WeixinLoginState>((_resolve, reject) => {
          const abort = () => reject(options.signal?.reason ?? new Error("aborted"));
          options.signal?.addEventListener("abort", abort, { once: true });
        });
      },
    }),
  });

  await manager.loginWeixin();
  callbacks?.onQrCode?.("https://example.test/qr");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const beforeClose = published;
  await Promise.all([manager.close(), manager.close()]);
  callbacks?.onScanned?.();
  callbacks?.onQrCode?.("https://example.test/late");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(published, beforeClose);

  const config = await resolveRuntimeConfig({ cwd: root });
  await assert.rejects(fs.access(config.weixin.credentialsFile));
});
