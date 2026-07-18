import crypto from "node:crypto";
import fs from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

import packageJson from "../../package.json";
import { EXTENSION_DEFINITIONS } from "../extensions/definitions.js";
import { getProviderPresetBaseUrl, PROVIDER_PRESETS } from "../config/providerPresets.js";
import { resolveRuntimeConfig } from "../config/runtime.js";
import { probeProviderConnection } from "../provider/connection.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { ensureScheduledTaskRuntime } from "../scheduler/runtime.js";
import { subscribeRemoteRuntimeEvents } from "../remote/events.js";
import { DEFAULT_LOCALE, parseKittyLocale } from "../i18n/index.js";
import { renderKittyAgentWordmark } from "../runtime-ui/banner.js";
import { WebChannelManager } from "./channelManager.js";
import { WebConfigService } from "./configService.js";
import { WebEventHub } from "./events.js";
import { buildWebMessages } from "./messages.js";
import { WebSkillService } from "./skillService.js";

const MAX_BODY_BYTES = 1_000_000;

export interface LocalConsoleHandle {
  url: string;
  token: string;
  close(): Promise<void>;
  wait(): Promise<void>;
}

export async function startLocalConsole(cwd: string): Promise<LocalConsoleHandle> {
  const projectRoots = await resolveProjectRoots(cwd).catch(() => ({ rootDir: cwd, stateRootDir: cwd }));
  const stateRootDir = projectRoots.stateRootDir;
  const token = crypto.randomBytes(24).toString("base64url");
  const events = new WebEventHub();
  const config = new WebConfigService(cwd);
  const skills = new WebSkillService(cwd);
  const scheduler = ensureScheduledTaskRuntime(stateRootDir);
  const channels = new WebChannelManager(cwd, events);
  const unsubscribeRemote = subscribeRemoteRuntimeEvents((event) => {
    if (path.resolve(event.rootDir) === path.resolve(stateRootDir)) events.publish("transcript", event);
  });
  let origin = "";
  let closed = false;
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((resolve) => { resolveClosed = resolve; });

  const server = http.createServer((request, response) => {
    void route(request, response).catch((error) => {
      sendJson(response, statusForRequestError(request), { error: error instanceof Error ? error.message : String(error) });
    });
  });

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", origin || "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname, response);
    if (!authorized(request, url, token)) return sendJson(response, 401, { error: "Unauthorized local console request." });
    if (!["GET", "HEAD"].includes(request.method ?? "GET") && request.headers.origin !== origin) {
      return sendJson(response, 403, { error: "Request origin does not match the local console." });
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const remove = events.add(response);
      request.once("close", remove);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const [configuration, preflight, skillList] = await Promise.all([config.read(), config.preflight(), skills.list()]);
      const locale = parseKittyLocale(configuration.values.KITTY_LOCALE) ?? DEFAULT_LOCALE;
      const messages = buildWebMessages(locale);
      return sendJson(response, 200, {
        locale,
        messages,
        brand: { version: packageJson.version, wordmark: renderKittyAgentWordmark() },
        configuration,
        preflight,
        providers: PROVIDER_PRESETS.map((preset) => ({ ...preset, baseUrl: getProviderPresetBaseUrl(preset) })),
        extensions: EXTENSION_DEFINITIONS.map(({ id, envKey, defaultEnabled }) => ({
          id,
          envKey,
          summary: messages.extensionSummaries[id],
          defaultEnabled,
        })),
        skills: skillList,
        channels: await channels.refreshStatus(),
      });
    }
    if (request.method === "PUT" && url.pathname === "/api/config") {
      const body = await readJsonBody(request);
      const result = await config.save({
        values: isRecord(body.values) ? body.values : undefined,
        clear: Array.isArray(body.clear) ? body.clear.map(String) : undefined,
      });
      events.publish("config", result);
      return sendJson(response, 200, result);
    }
    if (request.method === "POST" && url.pathname === "/api/provider/probe") {
      const runtime = await resolveRuntimeConfig({ cwd });
      const result = await probeProviderConnection(runtime);
      return sendJson(response, result.kind === "ok" ? 200 : 422, result);
    }
    if (request.method === "POST" && url.pathname === "/api/telegram/probe") {
      return sendJson(response, 200, await channels.probeTelegram());
    }
    if (request.method === "POST" && url.pathname === "/api/weixin/login") {
      await channels.loginWeixin();
      return sendJson(response, 202, channels.status().weixinLogin);
    }
    if (request.method === "POST" && url.pathname === "/api/weixin/logout") {
      await channels.logoutWeixin();
      return sendJson(response, 200, channels.status().weixinLogin);
    }
    const channelMatch = url.pathname.match(/^\/api\/channels\/(weixin|telegram)\/(start|stop)$/u);
    if (request.method === "POST" && channelMatch) {
      const [, name, action] = channelMatch as [string, "weixin" | "telegram", "start" | "stop"];
      await channels[action](name);
      return sendJson(response, 200, channels.status());
    }
    const skillMatch = url.pathname.match(/^\/api\/skills\/([^/]+)$/u);
    if (skillMatch && request.method === "GET") {
      return sendJson(response, 200, { source: await skills.read(decodeURIComponent(skillMatch[1]!)) });
    }
    sendJson(response, 404, { error: "Unknown local console route." });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local console did not receive a TCP address.");
  origin = `http://127.0.0.1:${address.port}`;

  return {
    url: `${origin}/?token=${encodeURIComponent(token)}`,
    token,
    wait: () => closedPromise,
    async close() {
      if (closed) return;
      closed = true;
      unsubscribeRemote();
      await channels.stopAll();
      await scheduler.stop();
      events.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      resolveClosed();
    },
  };
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const files: Record<string, [string, string]> = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/channelStream.js": ["channelStream.js", "text/javascript; charset=utf-8"],
    "/workflowViews.js": ["workflowViews.js", "text/javascript; charset=utf-8"],
    "/styles.css": ["styles.css", "text/css; charset=utf-8"],
    "/vendor/bootstrap.min.css": ["vendor/bootstrap.min.css", "text/css; charset=utf-8"],
    "/vendor/bootstrap.bundle.min.js": ["vendor/bootstrap.bundle.min.js", "text/javascript; charset=utf-8"],
    "/vendor/bootstrap-icons.css": ["vendor/bootstrap-icons.css", "text/css; charset=utf-8"],
    "/vendor/marked.esm.js": ["vendor/marked.esm.js", "text/javascript; charset=utf-8"],
  };
  const iconFont = pathname.match(/^\/vendor\/fonts\/(bootstrap-icons\.(?:woff2|woff))$/u);
  const entry = iconFont
    ? [`vendor/fonts/${iconFont[1]}`, iconFont[1]?.endsWith("woff2") ? "font/woff2" : "font/woff"] as [string, string]
    : files[pathname];
  if (!entry) return sendJson(response, 404, { error: "Not found." });
  try {
    const body = await fs.readFile(path.join(__dirname, "web", entry[0]));
    response.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: "Local console asset is missing." });
  }
}

function authorized(request: IncomingMessage, url: URL, token: string): boolean {
  return request.headers.authorization === `Bearer ${token}` || url.searchParams.get("token") === token;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new Error("Request body exceeds 1 MB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!isRecord(value)) throw new Error("JSON body must be an object.");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

function statusForRequestError(request: IncomingMessage): number {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname.startsWith("/api/config") || pathname.startsWith("/api/skills")) return 400;
  if (pathname.startsWith("/api/provider") || pathname.startsWith("/api/telegram") || pathname.startsWith("/api/weixin") || pathname.startsWith("/api/channels")) return 422;
  return 500;
}
