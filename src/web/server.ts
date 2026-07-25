import crypto from "node:crypto";
import fs from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";

import packageJson from "../../package.json";
import { closeProjectCapabilityRuntime, getProjectCapabilityManager, replaceProjectCapabilityRuntime, withProjectCapabilityManager } from "../capabilities/index.js";
import { getProviderPresetBaseUrl, PROVIDER_PRESETS } from "../config/providerPresets.js";
import { resolveRuntimeConfig } from "../config/runtime.js";
import { probeProviderConnection } from "../provider/connection.js";
import { findProviderOfficialLinks } from "../provider/officialLinks.js";
import { MEDIA_PROVIDER_CATALOG } from "../media/catalog.js";
import { probeMediaConnection } from "../media/connection.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { ensureScheduledTaskRuntime } from "../scheduler/runtime.js";
import { InteractiveSessionDriver } from "../interaction/sessionDriver.js";
import { createPersistedSession } from "../host/session.js";
import { SessionStore } from "../session/store.js";
import type { SessionRecord } from "../types.js";
import { subscribeRemoteRuntimeEvents } from "../remote/events.js";
import { DEFAULT_LOCALE, parseKittyLocale } from "../i18n/index.js";
import { WebChannelManager } from "./channelManager.js";
import { WebConfigService } from "./configService.js";
import { WebEventHub } from "./events.js";
import { buildWebMessages } from "./messages.js";
import { loadChannelHistory, type WebChannelName } from "./channelHistory.js";
import { WebChatShell } from "./chatShell.js";
import { WebSessionBindingStore } from "./sessionBinding.js";
import { WebSkillService } from "./skillService.js";
import { WebMediaService } from "./mediaService.js";
import type { CapabilityManagerDependencies } from "../capabilities/manager.js";
import type { WebChannelManagerDependencies } from "./channelManager.js";

const MAX_BODY_BYTES = 1_000_000;

export interface LocalConsoleHandle {
  url: string;
  webUrl: string;
  token: string;
  close(): Promise<void>;
  wait(): Promise<void>;
}

export interface LocalConsoleDependencies {
  capabilities?: CapabilityManagerDependencies;
  channels?: WebChannelManagerDependencies;
}

export async function startLocalConsole(cwd: string, dependencies: LocalConsoleDependencies = {}): Promise<LocalConsoleHandle> {
  const projectRoots = await resolveProjectRoots(cwd).catch(() => ({ rootDir: cwd, stateRootDir: cwd }));
  const stateRootDir = projectRoots.stateRootDir;
  const token = crypto.randomBytes(24).toString("base64url");
  const events = new WebEventHub();
  const config = new WebConfigService(cwd);
  const mediaService = new WebMediaService(cwd, stateRootDir);
  const skills = new WebSkillService(cwd);
  const channels = new WebChannelManager(cwd, events, dependencies.channels);
  let runtime = await resolveRuntimeConfig({ cwd });
  await skills.initialize();
  const capabilityManager = await getProjectCapabilityManager({ cwd, stateRootDir, config: runtime, dependencies: dependencies.capabilities });
  let activeCapabilityManager = capabilityManager;
  capabilityManager.snapshot();
  const initialSkillPackages = await skills.load();
  capabilityManager.snapshot(initialSkillPackages);
  const presentation = buildWebMessages(runtime.locale);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionBinding = new WebSessionBindingStore(path.join(stateRootDir, ".kitty", "web", "session.json"));
  const existingSessionId = await sessionBinding.load();
  let webSession: SessionRecord | null = existingSessionId ? await sessionStore.load(existingSessionId).catch(() => null) : null;
  if (!webSession) {
    webSession = await createPersistedSession(sessionStore, cwd);
    await sessionBinding.save(webSession.id);
  }
  const webShell = new WebChatShell(presentation.shell);
  const webSockets = new WebSocketServer({ noServer: true });
  let catalogPublish = Promise.resolve();
  let bindingSave = Promise.resolve();
  const persistSessionBinding = (sessionId: string): Promise<void> => {
    bindingSave = bindingSave.catch(() => undefined).then(() => sessionBinding.save(sessionId));
    return bindingSave;
  };
  const publishSessionCatalog = (): Promise<void> => {
    catalogPublish = catalogPublish.catch(() => undefined).then(async () => {
      const sessions = await sessionStore.list(20);
      webShell.broadcastSessionCatalog(webSession?.id, sessions.map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
      })));
    });
    return catalogPublish;
  };
  const webDriver = new InteractiveSessionDriver({
    cwd,
    config: runtime,
    getConfig: () => runtime,
    session: webSession,
    sessionStore,
    shell: webShell,
    stateRootDir,
    surface: "web",
    ownsProcessSignals: false,
    onSessionChanged: (session) => {
      webSession = session;
      void persistSessionBinding(session.id).catch(() => undefined);
      void publishSessionCatalog().catch(() => undefined);
    },
    onSessionUpdated: (session) => {
      webSession = session;
      void persistSessionBinding(session.id).catch(() => undefined);
      void publishSessionCatalog().catch(() => undefined);
    },
  });
  const scheduler = ensureScheduledTaskRuntime(stateRootDir);
  const webDriverTask = webDriver.run().catch(() => undefined);
  const unsubscribeRemote = subscribeRemoteRuntimeEvents((event) => {
    if (path.resolve(event.rootDir) === path.resolve(stateRootDir)) events.publish("transcript", event);
  });
  let origin = "";
  let closing = false;
  let closePromise: Promise<void> | undefined;
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((resolve) => { resolveClosed = resolve; });
  const shutdownController = new AbortController();
  const activeRequests = new Set<Promise<void>>();
  let configApplyTail = Promise.resolve();

  const server = http.createServer((request, response) => {
    if (closing) {
      sendJson(response, 503, { error: "The local console is closing." });
      return;
    }
    let task!: Promise<void>;
    task = route(request, response)
      .catch((error) => {
        sendJson(response, statusForRequestError(request), { error: describeError(error) });
      })
      .finally(() => activeRequests.delete(task));
    activeRequests.add(task);
  });
  server.on("upgrade", (request, socket, head) => {
    if (closing) {
      socket.destroy();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/web" || url.searchParams.get("token") !== token) {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (client) => webSockets.emit("connection", client, request));
  });
  webShell.attach(webSockets, async (send) => {
    const current = webSession ? await sessionStore.load(webSession.id).catch(() => webSession) : null;
    const sessions = await sessionStore.list(20);
    send({
      type: "session_catalog",
      activeSessionId: current?.id,
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
      })),
    });
    if (current) webShell.replaySession(current, send);
  }, async (message) => {
    const selected = await sessionStore.load(message.sessionId).catch(() => null);
    if (selected && await webDriver.selectSession(selected)) {
      await publishSessionCatalog();
      webShell.broadcastSessionReplay(selected);
    }
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
      const [configuration, preflight, skillList, skillPackages, currentRuntime] = await Promise.all([
        config.read(), config.preflight(), skills.list(), skills.load(), resolveRuntimeConfig({ cwd }),
      ]);
      const locale = parseKittyLocale(configuration.values.KITTY_LOCALE) ?? DEFAULT_LOCALE;
      const messages = buildWebMessages(locale);
      const capabilityManager = await getProjectCapabilityManager({ cwd, stateRootDir, config: currentRuntime, dependencies: dependencies.capabilities });
      return sendJson(response, 200, {
        locale,
        messages,
        brand: { version: packageJson.version },
        configuration,
        preflight,
        providers: PROVIDER_PRESETS.map((preset) => ({
          ...preset,
          baseUrl: getProviderPresetBaseUrl(preset),
          officialLinks: findProviderOfficialLinks(preset.provider),
        })),
        mediaProviders: MEDIA_PROVIDER_CATALOG.map((provider) => ({
          id: provider.id,
          label: provider.label,
          provider: provider.id,
          baseUrl: provider.defaultBaseUrl,
          imageModel: provider.imageModels.at(-1),
          videoModel: provider.videoModels.at(-1),
          officialLinks: findProviderOfficialLinks(provider.id),
        })),
        capabilities: capabilityManager.snapshot(skillPackages),
        skills: skillList,
        channels: await channels.refreshStatus(),
      });
    }
    const historyMatch = url.pathname.match(/^\/api\/channels\/(weixin|telegram)\/history$/u);
    if (request.method === "GET" && historyMatch) {
      return sendJson(response, 200, { items: await loadChannelHistory(cwd, historyMatch[1] as WebChannelName) });
    }
    if (request.method === "PUT" && url.pathname === "/api/config") {
      const body = await readJsonBody(request);
      return sendJson(response, 200, await applyConfiguration(body));
    }
    const capabilityMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)$/u);
    if (request.method === "PUT" && capabilityMatch) {
      const body = await readJsonBody(request);
      if (typeof body.enabled !== "boolean") throw new Error("Capability enabled must be a boolean.");
      const enabled = body.enabled;
      const [currentRuntime, skillPackages] = await Promise.all([resolveRuntimeConfig({ cwd }), skills.load()]);
      const result = await withProjectCapabilityManager(
        { cwd, stateRootDir, config: currentRuntime, dependencies: dependencies.capabilities },
        async (manager) => {
          const capability = await manager.setEnabled(decodeURIComponent(capabilityMatch[1]!), enabled, skillPackages);
          return { capability, capabilities: manager.snapshot(skillPackages) };
        },
      );
      events.publish("capabilities", result);
      return sendJson(response, 200, result);
    }
    if (request.method === "POST" && url.pathname === "/api/provider/probe") {
      const runtime = await resolveRuntimeConfig({ cwd });
      const result = await probeProviderConnection(runtime);
      return sendJson(response, result.kind === "ok" ? 200 : 422, result);
    }
    if (request.method === "POST" && url.pathname === "/api/media/probe") {
      const runtime = await resolveRuntimeConfig({ cwd });
      return sendJson(response, 200, await probeMediaConnection(runtime.media));
    }
    if (request.method === "POST" && url.pathname === "/api/media/images") {
      const runtime = await resolveRuntimeConfig({ cwd });
      const body = await readJsonBody(request);
      const controller = requestAbortController(request, response, shutdownController.signal);
      try {
        return sendJson(response, 200, await mediaService.generateImage(runtime.media, body, controller.signal));
      } finally {
        controller.cleanup();
      }
    }
    if (request.method === "POST" && url.pathname === "/api/media/videos") {
      const runtime = await resolveRuntimeConfig({ cwd });
      const body = await readJsonBody(request);
      const controller = requestAbortController(request, response, shutdownController.signal);
      try {
        return sendJson(response, 202, await mediaService.createVideo(runtime.media, body, controller.signal));
      } finally {
        controller.cleanup();
      }
    }
    const pollVideoMatch = url.pathname.match(/^\/api\/media\/videos\/([^/]+)\/poll$/u);
    if (request.method === "POST" && pollVideoMatch) {
      const runtime = await resolveRuntimeConfig({ cwd });
      const body = await readJsonBody(request);
      const controller = requestAbortController(request, response, shutdownController.signal);
      try {
        return sendJson(response, 200, await mediaService.pollVideo(runtime.media, decodeURIComponent(pollVideoMatch[1]!), body, controller.signal));
      } finally {
        controller.cleanup();
      }
    }
    if (request.method === "GET" && url.pathname === "/api/media/artifacts") {
      const artifact = await mediaService.readArtifact(url.searchParams.get("path") ?? "");
      response.writeHead(200, {
        "content-type": artifact.mimeType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(artifact.bytes);
      return;
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
    if (request.method === "POST" && url.pathname === "/api/skills") {
      const body = await readJsonBody(request);
      if (typeof body.name !== "string" || typeof body.description !== "string" || typeof body.instructions !== "string") {
        throw new Error("Skill name, description, and instructions must be strings.");
      }
      const skill = await skills.create({ name: body.name, description: body.description, instructions: body.instructions });
      const [currentRuntime, skillPackages, skillList] = await Promise.all([
        resolveRuntimeConfig({ cwd }), skills.load(), skills.list(),
      ]);
      const manager = await getProjectCapabilityManager({ cwd, stateRootDir, config: currentRuntime, dependencies: dependencies.capabilities });
      const result = { skill, skills: skillList, capabilities: manager.snapshot(skillPackages) };
      events.publish("capabilities", result);
      return sendJson(response, 201, result);
    }
    const skillMatch = url.pathname.match(/^\/api\/skills\/([^/]+)$/u);
    if (skillMatch && request.method === "GET") {
      return sendJson(response, 200, await skills.inspect(decodeURIComponent(skillMatch[1]!)));
    }
    if (skillMatch && request.method === "PUT") {
      const body = await readJsonBody(request);
      if (typeof body.description !== "string" || typeof body.instructions !== "string") {
        throw new Error("Skill description and instructions must be strings.");
      }
      const name = decodeURIComponent(skillMatch[1]!);
      const skill = await skills.update(name, { description: body.description, instructions: body.instructions });
      const [currentRuntime, skillPackages, skillList] = await Promise.all([
        resolveRuntimeConfig({ cwd }), skills.load(), skills.list(),
      ]);
      const manager = await getProjectCapabilityManager({ cwd, stateRootDir, config: currentRuntime, dependencies: dependencies.capabilities });
      const result = { skill, skills: skillList, capabilities: manager.snapshot(skillPackages) };
      events.publish("capabilities", result);
      return sendJson(response, 200, result);
    }
    if (skillMatch && request.method === "DELETE") {
      const name = decodeURIComponent(skillMatch[1]!);
      await skills.delete(name);
      const currentRuntime = await resolveRuntimeConfig({ cwd });
      const manager = await getProjectCapabilityManager({ cwd, stateRootDir, config: currentRuntime, dependencies: dependencies.capabilities });
      manager.removeSkill(name);
      const [skillPackages, skillList] = await Promise.all([skills.load(), skills.list()]);
      const result = { deleted: name, skills: skillList, capabilities: manager.snapshot(skillPackages) };
      events.publish("capabilities", result);
      return sendJson(response, 200, result);
    }
    sendJson(response, 404, { error: "Unknown local console route." });
  }

  function applyConfiguration(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const operation = configApplyTail.catch(() => undefined).then(async () => {
      const result = await config.save({
        values: isRecord(body.values) ? body.values : undefined,
        clear: Array.isArray(body.clear) ? body.clear.map(String) : undefined,
      });
      const skillPackages = await skills.load();
      let manager = activeCapabilityManager;
      let runtimeApplyError: string | undefined;
      try {
        const nextRuntime = await resolveRuntimeConfig({ cwd });
        runtime = nextRuntime;
        webShell.setLabels(buildWebMessages(runtime.locale).shell);
        manager = await replaceProjectCapabilityRuntime({ cwd, stateRootDir, config: runtime, dependencies: dependencies.capabilities });
        activeCapabilityManager = manager;
      } catch (error) {
        runtimeApplyError = describeError(error);
        try {
          manager = await getProjectCapabilityManager({ cwd, stateRootDir, config: runtime, dependencies: dependencies.capabilities });
          activeCapabilityManager = manager;
        } catch {
          // The committed configuration remains accepted; the existing projection carries the cleanup evidence.
        }
      }
      const capabilities = manager.snapshot(skillPackages);
      events.publish("config", result);
      events.publish("capabilities", { capabilities, runtimeApplyError });
      return { ...result, capabilities, runtimeApplyError };
    });
    configApplyTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  const close = (): Promise<void> => {
    closePromise ??= closeOwned();
    return closePromise;
  };

  const closeOwned = async (): Promise<void> => {
    closing = true;
    const errors: unknown[] = [];
    const serverClose = closeHttpServer(server);
    shutdownController.abort(new Error("The local console is closing."));
    webShell.stopAdmission();
    events.close();
    server.closeIdleConnections?.();
    try {
      await settleAll([webShell.waitForIdle()], errors);
      webShell.input.close();
      await settleAll([...activeRequests], errors);
      await settleAll([configApplyTail], errors);
      await settleAll([catalogPublish, bindingSave], errors);
      webShell.dispose();
      await settleAll([channels.close(), scheduler.stop(), webDriverTask], errors);
      await settleAll([closeProjectCapabilityRuntime(stateRootDir)], errors);
      await settleAll([closeWebSocketServer(webSockets), serverClose], errors);
    } finally {
      unsubscribeRemote();
      resolveClosed();
    }
    if (errors.length > 0) throw new AggregateError(errors, "Local console cleanup was incomplete.");
  };

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
  } catch (error) {
    const errors: unknown[] = [error];
    await close().catch((cleanupError) => errors.push(cleanupError));
    throw new AggregateError(errors, "Local console startup failed.");
  }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local console did not receive a TCP address.");
  origin = `http://127.0.0.1:${address.port}`;

  return {
    url: `${origin}/?token=${encodeURIComponent(token)}`,
    token,
    wait: () => closedPromise,
    close,
    webUrl: `${origin}/web?token=${encodeURIComponent(token)}`,
  };
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const files: Record<string, [string, string]> = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/web": ["chat.html", "text/html; charset=utf-8"],
    "/web/": ["chat.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/workflowViews.js": ["workflowViews.js", "text/javascript; charset=utf-8"],
    "/channelStream.js": ["channelStream.js", "text/javascript; charset=utf-8"],
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
    const body = await readStaticAsset(entry[0]);
    response.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: "Local console asset is missing." });
  }
}

async function readStaticAsset(relativePath: string): Promise<Buffer> {
  const roots = [
    path.join(__dirname, "web"),
    path.resolve(process.cwd(), "src", "web", "public"),
  ];
  let lastError: unknown;
  for (const root of roots) {
    try {
      return await fs.readFile(path.join(root, relativePath));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Static asset not found: ${relativePath}`);
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
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

function requestAbortController(
  request: IncomingMessage,
  response: ServerResponse,
  shutdownSignal: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error("The local request was disconnected."));
  const shutdown = () => controller.abort(shutdownSignal.reason);
  request.once("aborted", abort);
  response.once("close", abort);
  shutdownSignal.addEventListener("abort", shutdown, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
      shutdownSignal.removeEventListener("abort", shutdown);
    },
  };
}

async function settleAll(promises: readonly Promise<unknown>[], errors: unknown[]): Promise<void> {
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === "rejected") errors.push(result.reason);
  }
}

function closeHttpServer(server: http.Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function closeWebSocketServer(server: WebSocketServer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function statusForRequestError(request: IncomingMessage): number {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname.startsWith("/api/config") || pathname.startsWith("/api/skills")) return 400;
  if (pathname.startsWith("/api/provider") || pathname.startsWith("/api/media") || pathname.startsWith("/api/telegram") || pathname.startsWith("/api/weixin") || pathname.startsWith("/api/channels")) return 422;
  return 500;
}

function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors.map(describeError).filter(Boolean);
    return details.length > 0 ? `${error.message}: ${details.join("; ")}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
