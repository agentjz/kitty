import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { serveHtml } from "../../src/web/serveHtml.js";

test("serveHtml returns a valid HTML page", () => {
  const html = serveHtml();
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /Kitty Web Shell/);
  assert.match(html, /WebSocket/);
  assert.match(html, /marked/);
  assert.match(html, /bootstrap/);
});

test("serveHtml page contains send and pause buttons", () => {
  const html = serveHtml();
  assert.match(html, /send-btn/);
  assert.match(html, /pause-btn/);
  assert.match(html, /msg-input/);
});

test("serveHtml page does not contain emoji in visible text", () => {
  const html = serveHtml();
  // Emoji range check for common ones used before
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
  // The HTML may contain Bootstrap icons which are CSS-based, not unicode emoji
  const bodyContent = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Only check that common emoji characters in visible content are removed
  const containsThinkingEmoji = bodyContent.includes("🤔");
  const containsToolEmoji = bodyContent.includes("🔧");
  assert.equal(containsThinkingEmoji, false, "should not contain thinking emoji");
  assert.equal(containsToolEmoji, false, "should not contain tool emoji");
});

test("serveHtml page uses white/light background", () => {
  const html = serveHtml();
  // Should not have dark theme attribute
  assert.doesNotMatch(html, /data-bs-theme="dark"/);
  // Should have light/white background (#fff or white)
  assert.match(html, /#fff/);
  assert.doesNotMatch(html, /#1a1a2e/);
});

test("serveHtml page has circular pause button", () => {
  const html = serveHtml();
  // Pause button should have rounded-circle class or equivalent
  assert.match(html, /rounded-circle/);
});

test("serveHtml page input textarea has larger height", () => {
  const html = serveHtml();
  // Should have larger min-height
  assert.match(html, /min-height.*[3-9]rem/);
});

test("HTTP server returns 200 for root path with correct content type", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(serveHtml());
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as import("net").AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const body = await res.text();
    assert.match(body, /Kitty Web Shell/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
