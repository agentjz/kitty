import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

import { ControlPlaneLedger } from "../control/ledger.js";
import { inspectProcessIdentity, isProcessAlive, terminatePid, type ProcessIdentity } from "../execution/process.js";
import { watchProcessUntilParentExit } from "../execution/parentDeathWatchdog.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { parseArgs } from "../tools/core/shared.js";
import type { FunctionToolDefinition, RegisteredTool } from "../tools/core/types.js";
import type { RuntimeConfig, ToolExecutionResult } from "../types.js";
import { PLAYWRIGHT_CAPABILITY } from "./definitions.js";
import { persistCapabilityEvidence } from "./evidence.js";
import { beginExternalDispatch } from "./externalDispatch.js";

const CAPABILITY_HEARTBEAT_MS = 10_000;
const MAX_MODEL_OUTPUT_CHARS = 24_000;
const MAX_EVIDENCE_BYTES = 256_000;

interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
    [key: string]: unknown;
  };
  annotations?: {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
  };
}

interface PlaywrightMcpConnection {
  pid: number | null;
  listTools(): Promise<readonly McpToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface PlaywrightMcpDependencies {
  connect?: (input: {
    cwd: string;
    stateRootDir: string;
    config: RuntimeConfig["capabilities"]["playwright"];
  }) => Promise<PlaywrightMcpConnection>;
  inspectProcessIdentity?: (pid: number) => ProcessIdentity | undefined;
  isProcessAlive?: (pid: number) => boolean;
  terminatePid?: (pid: number, identity?: ProcessIdentity) => void;
  watchParent?: typeof watchProcessUntilParentExit;
}

export class PlaywrightMcpRuntime {
  private connection?: PlaywrightMcpConnection;
  private tools: readonly RegisteredTool[] = [];
  private owner?: { ownerToken: string; ownerGeneration: number };
  private child?: { pid: number; identity?: ProcessIdentity };
  private heartbeat?: NodeJS.Timeout;
  private stopWatchdog?: () => void;
  private starting?: Promise<readonly RegisteredTool[]>;
  private closing?: Promise<void>;
  private callQueue: Promise<void> = Promise.resolve();
  private ready = false;

  constructor(
    private readonly cwd: string,
    private readonly stateRootDir: string,
    private readonly config: RuntimeConfig,
    private readonly dependencies: PlaywrightMcpDependencies = {},
  ) {}

  async start(): Promise<readonly RegisteredTool[]> {
    await this.closing?.catch(() => undefined);
    if (this.connection && this.ready) return this.tools;
    if (this.connection || this.owner || this.child) await this.close();
    if (this.starting) return this.starting;
    this.starting = this.startOwned();
    try {
      return await this.starting;
    } catch (error) {
      if (!this.owner) this.recordDegraded(error);
      throw error;
    } finally {
      this.starting = undefined;
    }
  }

  getToolNames(): string[] {
    return this.tools.map((tool) => tool.definition.function.name);
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = this.closeOwned();
    try {
      await this.closing;
    } finally {
      this.closing = undefined;
    }
  }

  private async closeOwned(): Promise<void> {
    if (!this.connection && !this.owner && !this.child && !this.starting) return;
    await this.starting?.catch(() => undefined);
    this.ready = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    const errors: unknown[] = [];
    try {
      await this.connection?.close();
      this.connection = undefined;
    } catch (error) {
      errors.push(error);
    }
    this.tools = [];
    this.cleanupChild(errors);
    if (!this.child) {
      this.stopWatchdog?.();
      this.stopWatchdog = undefined;
    }
    if (this.owner) {
      const ledger = new ControlPlaneLedger(this.stateRootDir);
      try {
        const release = errors.length === 0;
        ledger.capabilities.settleOwned({
          id: PLAYWRIGHT_CAPABILITY.id,
          ...this.owner,
          status: release ? "stopped" : "degraded",
          message: errors.length > 0 ? formatErrors(errors) : undefined,
          release,
        });
      } catch (error) {
        errors.push(error);
      } finally {
        ledger.close();
      }
      if (errors.length === 0) this.owner = undefined;
    }
    if (errors.length > 0) throw new AggregateError(errors, "Playwright MCP cleanup was incomplete.");
  }

  async prepareDisable(): Promise<void> {
    await this.close();
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      const persisted = ledger.capabilities.load(PLAYWRIGHT_CAPABILITY.id);
      if (persisted?.ownerToken) this.terminatePersistedChild(persisted);
    } finally {
      ledger.close();
    }
  }

  forceCleanupSync(): void {
    if (this.child?.identity && this.isExpectedProcess(this.child)) {
      try { (this.dependencies.terminatePid ?? terminatePid)(this.child.pid, this.child.identity); } catch { /* exit hook */ }
    }
  }

  private async startOwned(): Promise<readonly RegisteredTool[]> {
    this.cleanupExpiredOwner();
    const ownerIdentity = (this.dependencies.inspectProcessIdentity ?? inspectProcessIdentity)(process.pid);
    if (!ownerIdentity) {
      throw new Error(`Cannot start Playwright MCP: process identity for owner pid ${process.pid} could not be verified.`);
    }
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      const claimed = ledger.capabilities.claimRuntime({
        definition: PLAYWRIGHT_CAPABILITY,
        processId: process.pid,
        processIdentity: ownerIdentity,
      });
      this.owner = {
        ownerToken: claimed.ownerToken!,
        ownerGeneration: claimed.ownerGeneration,
      };
    } finally {
      ledger.close();
    }

    try {
      const connect = this.dependencies.connect ?? connectOfficialPlaywrightMcp;
      const connection = await connect({
        cwd: this.cwd,
        stateRootDir: this.stateRootDir,
        config: this.config.capabilities.playwright,
      });
      this.connection = connection;
      if (connection.pid) {
        const identity = (this.dependencies.inspectProcessIdentity ?? inspectProcessIdentity)(connection.pid);
        this.child = { pid: connection.pid, identity };
        if (!identity) {
          throw new Error(`Cannot start Playwright MCP pid ${connection.pid}: process identity could not be verified.`);
        }
        const childLedger = new ControlPlaneLedger(this.stateRootDir);
        try {
          childLedger.capabilities.attachChild({
            id: PLAYWRIGHT_CAPABILITY.id,
            ...this.owner!,
            childPid: connection.pid,
            childIdentity: identity,
          });
        } finally {
          childLedger.close();
        }
        this.stopWatchdog = (this.dependencies.watchParent ?? watchProcessUntilParentExit)({
          parentPid: process.pid,
          targetPid: connection.pid,
          parentIdentity: ownerIdentity,
          targetIdentity: identity,
        });
      }
      const descriptors = await connection.listTools();
      this.tools = descriptors.map((descriptor) => this.createRegisteredTool(descriptor));
      const readyLedger = new ControlPlaneLedger(this.stateRootDir);
      try {
        readyLedger.capabilities.settleOwned({
          id: PLAYWRIGHT_CAPABILITY.id,
          ...this.owner!,
          status: "ready",
        });
      } finally {
        readyLedger.close();
      }
      this.ready = true;
      this.startHeartbeat();
      return this.tools;
    } catch (error) {
      await this.failStartup(error);
      throw error;
    }
  }

  private createRegisteredTool(descriptor: McpToolDescriptor): RegisteredTool {
    const modelName = `playwright_${sanitizeToolName(descriptor.name)}`;
    return {
      definition: {
        type: "function",
        function: {
          name: modelName,
          description: descriptor.description ?? `Playwright MCP tool ${descriptor.name}.`,
          parameters: descriptor.inputSchema as FunctionToolDefinition["function"]["parameters"],
        },
      },
      effect: descriptor.annotations?.readOnlyHint ? "read" : "external",
      parallelSafe: false,
      origin: { kind: "host", sourceId: "capability:playwright" },
      execute: async (rawArgs, context) => this.serializeCall(async () => {
        if (!this.ready || !this.connection) {
          throw new Error("Playwright MCP is not ready for a browser action.");
        }
        const dispatch = beginExternalDispatch(context);
        if (!dispatch.shouldDispatch) {
          return dispatch.uncertain(new Error("The browser action was already dispatched; Kitty will not replay it."));
        }
        try {
          const result = await this.connection.callTool(descriptor.name, parseArgs(rawArgs));
          const receivedAt = new Date().toISOString();
          const evidence = await persistCapabilityEvidence({
            rootDir: this.stateRootDir,
            capabilityId: PLAYWRIGHT_CAPABILITY.id,
            operationId: dispatch.operationId,
            value: {
              operationId: dispatch.operationId,
              tool: descriptor.name,
              arguments: parseArgs(rawArgs),
              receivedAt,
              result,
            },
            retained: {
              operationId: dispatch.operationId,
              tool: descriptor.name,
              arguments: parseArgs(rawArgs),
              receivedAt,
            },
            maxBytes: MAX_EVIDENCE_BYTES,
          });
          return dispatch.settle(projectMcpResult(result, dispatch.operationId, evidence));
        } catch (error) {
          return dispatch.uncertain(error);
        } finally {
          dispatch.close();
        }
      }),
    };
  }

  private async serializeCall<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.callQueue;
    let release!: () => void;
    this.callQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      if (!this.owner) return;
      const ledger = new ControlPlaneLedger(this.stateRootDir);
      try {
        ledger.capabilities.heartbeat({ id: PLAYWRIGHT_CAPABILITY.id, ...this.owner });
      } catch {
        void this.close().catch(() => undefined);
      } finally {
        ledger.close();
      }
    }, CAPABILITY_HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  private cleanupExpiredOwner(): void {
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      const expired = ledger.capabilities.listExpiredOwned().find((state) => state.id === PLAYWRIGHT_CAPABILITY.id);
      if (!expired) return;
      this.terminatePersistedChild(expired);
    } finally {
      ledger.close();
    }
  }

  private async failStartup(error: unknown): Promise<void> {
    this.ready = false;
    this.tools = [];
    const cleanupErrors: unknown[] = [];
    try {
      await this.connection?.close();
      this.connection = undefined;
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    this.cleanupChild(cleanupErrors);
    if (!this.child) {
      this.stopWatchdog?.();
      this.stopWatchdog = undefined;
    }
    if (!this.owner) return;
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    let released = false;
    try {
      const release = cleanupErrors.length === 0;
      ledger.capabilities.settleOwned({
        id: PLAYWRIGHT_CAPABILITY.id,
        ...this.owner,
        status: "degraded",
        message: formatErrors([error, ...cleanupErrors]),
        release,
      });
      released = release;
    } finally {
      ledger.close();
      if (released) this.owner = undefined;
    }
  }

  private recordDegraded(error: unknown): void {
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      ledger.capabilities.updateHealth({
        id: PLAYWRIGHT_CAPABILITY.id,
        status: "degraded",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      ledger.close();
    }
  }

  private cleanupChild(errors: unknown[]): void {
    const child = this.child;
    if (!child) return;
    const alive = this.dependencies.isProcessAlive ?? isProcessAlive;
    try {
      if (!alive(child.pid)) {
        this.child = undefined;
        return;
      }
      if (!child.identity) {
        errors.push(new Error(`Cannot safely clean Playwright MCP pid ${child.pid}: process identity is missing.`));
        return;
      }
      const current = (this.dependencies.inspectProcessIdentity ?? inspectProcessIdentity)(child.pid);
      if (!current) {
        errors.push(new Error(`Cannot safely clean Playwright MCP pid ${child.pid}: process identity could not be verified.`));
        return;
      }
      if (!sameProcessIdentity(child.identity, current)) {
        this.child = undefined;
        return;
      }
      (this.dependencies.terminatePid ?? terminatePid)(child.pid, child.identity);
      this.child = undefined;
    } catch (cleanupError) {
      errors.push(cleanupError);
    }
  }

  private isExpectedProcess(child: { pid: number; identity?: ProcessIdentity }): boolean {
    if (!child.identity) return false;
    const current = (this.dependencies.inspectProcessIdentity ?? inspectProcessIdentity)(child.pid);
    return Boolean(current && sameProcessIdentity(child.identity, current));
  }

  private terminatePersistedChild(state: { childPid?: number; childIdentity?: Record<string, unknown> }): void {
    if (!state.childPid) return;
    const alive = (this.dependencies.isProcessAlive ?? isProcessAlive)(state.childPid);
    if (!alive) return;
    const identity = state.childIdentity as ProcessIdentity | undefined;
    if (!identity) {
      throw new Error(`Cannot safely recover Playwright MCP pid ${state.childPid}: persisted process identity is missing.`);
    }
    const currentIdentity = (this.dependencies.inspectProcessIdentity ?? inspectProcessIdentity)(state.childPid);
    if (!currentIdentity) {
      throw new Error(`Cannot safely recover Playwright MCP pid ${state.childPid}: process identity could not be verified.`);
    }
    if (!sameProcessIdentity(identity, currentIdentity)) return;
    (this.dependencies.terminatePid ?? terminatePid)(state.childPid, identity);
  }
}

async function connectOfficialPlaywrightMcp(input: {
  cwd: string;
  stateRootDir: string;
  config: RuntimeConfig["capabilities"]["playwright"];
}): Promise<PlaywrightMcpConnection> {
  const packageJsonPath = resolveOfficialPlaywrightMcpPackageJson();
  const cliPath = path.join(path.dirname(packageJsonPath), "cli.js");
  const statePaths = getProjectStatePaths(input.stateRootDir);
  const args = [
    cliPath,
    "--user-data-dir", path.join(statePaths.capabilitiesDir, "playwright", "profile"),
    "--output-dir", path.join(statePaths.capabilitiesDir, "playwright", "output"),
    "--output-mode", "file",
    "--image-responses", "omit",
    "--timeout-action", String(input.config.timeoutMs),
    "--timeout-navigation", String(input.config.timeoutMs),
    ...(input.config.headless ? ["--headless"] : []),
  ];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: input.cwd,
    env: {
      ...getDefaultEnvironment(),
      KITTY_MCP_PARENT_PID: String(process.pid),
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "kitty-playwright", version: "1" }, { capabilities: {} });
  await client.connect(transport, { timeout: input.config.timeoutMs });
  return {
    get pid() { return transport.pid; },
    async listTools() {
      return (await client.listTools(undefined, { timeout: input.config.timeoutMs })).tools;
    },
    async callTool(name, args) {
      return client.callTool({ name, arguments: args }, undefined, { timeout: input.config.timeoutMs });
    },
    async close() {
      await client.close();
    },
  };
}

export function resolveOfficialPlaywrightMcpPackageJson(entryPath = process.argv[1]): string {
  const anchor = entryPath
    ? resolveExistingEntryPath(entryPath)
    : path.join(process.cwd(), "package.json");
  return createRequire(anchor).resolve("@playwright/mcp/package.json");
}

function resolveExistingEntryPath(entryPath: string): string {
  const absolutePath = path.resolve(entryPath);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

function projectMcpResult(
  result: unknown,
  operationId: string,
  evidence: Awaited<ReturnType<typeof persistCapabilityEvidence>>,
): ToolExecutionResult {
  const record = isRecord(result) ? result : {};
  const text = Array.isArray(record.content)
    ? record.content.flatMap((item) => isRecord(item) && item.type === "text" && typeof item.text === "string" ? [item.text] : []).join("\n")
    : "";
  const projected = text.length > MAX_MODEL_OUTPUT_CHARS
    ? `${text.slice(0, MAX_MODEL_OUTPUT_CHARS)}\n... (Playwright MCP output truncated; inspect evidencePath)`
    : text;
  const isError = record.isError === true;
  return {
    ok: !isError,
    output: JSON.stringify({
      ok: !isError,
      operationId,
      output: projected,
      evidencePath: evidence.relativePath,
      evidenceBytes: evidence.bytes,
      evidenceTruncated: evidence.truncated,
    }, null, 2),
    metadata: {
      artifacts: [{ kind: "file", path: evidence.absolutePath, bytes: evidence.bytes, mimeType: "application/json" }],
    },
  };
}

function sanitizeToolName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

function sameProcessIdentity(expected: ProcessIdentity, current: ProcessIdentity): boolean {
  return expected.pid === current.pid && expected.platform === current.platform &&
    expected.creationMarker === current.creationMarker;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatErrors(errors: readonly unknown[]): string {
  return errors.map((error) => error instanceof Error ? error.message : String(error)).join("; ");
}
