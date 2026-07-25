import assert from "node:assert/strict";
import test from "node:test";

import { renderKittyProductBanner } from "../../src/runtime-ui/banner.js";
import { formatRemoteServiceIntro } from "../../src/shell/remoteServiceIntro.js";

test("remote service intro gives Weixin and Telegram distinct Kitty banners", () => {
  const weixin = renderKittyProductBanner("weixin");
  const telegram = renderKittyProductBanner("telegram");
  assert.notEqual(weixin, telegram);
  assert.ok(weixin.split("\n").length >= 3);
  assert.ok(telegram.split("\n").length >= 3);
});

test("remote service intro is rich for terminals and compact for redirected logs", () => {
  const options = {
    product: "weixin" as const,
    locale: "zh-CN" as const,
    stateDir: "C:/repo/.kitty/weixin",
    allowedUserCount: 2,
    transport: "iLink",
  };
  const rich = formatRemoteServiceIntro({ ...options, columns: 80 });
  assert.ok(rich.split("\n").length >= 8);
  assert.equal(rich.split("\n").every((line) => line.length <= 80), true);

  const narrowTelegram = formatRemoteServiceIntro({ ...options, product: "telegram", columns: 60 });
  assert.equal(narrowTelegram.split("\n").every((line) => line.length <= 60), true);

  const compact = formatRemoteServiceIntro({ ...options, compact: true });
  assert.equal(compact.includes("\n"), false);
  assert.doesNotMatch(compact, /token|user_id|wxid/iu);
});
