import { loadProjectContext } from "../../context/projectContext.js";
import { buildRuntimeStatus } from "../../runtime/status.js";
import { InteractiveSessionDriver } from "../../interaction/sessionDriver.js";
import type { SessionStoreLike } from "../../session/index.js";
import type { RuntimeConfig, SessionRecord } from "../../types.js";
import {
  createTerminalLogWriter,
  mirrorInteractionShellToTerminalLog,
} from "../../observability/terminalLog.js";
import { enableMouseTracking } from "./input/scroll.js";
import { createTuiInputGateway } from "./input/gateway.js";
import { TuiController } from "./controller.js";
import { SqliteTuiDraftStore } from "./draftPersistence.js";
import { editTextExternally } from "./externalEditor.js";
import {
  createTuiExecutionDockWatcher,
  readTuiLiveExecutionDock,
} from "./executionDock.js";
import { projectRuntimeStatusToDock } from "./store.js";
import { createTuiInteractionShell } from "./shell.js";
import { createCleanupStack } from "./lifecycle.js";
import { selectTuiSession } from "./sessionPicker.js";
import { writeTuiClipboard } from "./clipboard.js";

interface StartTuiChatOptions {
  cwd: string;
  cwdOverridden?: boolean;
  config: RuntimeConfig;
  sessionStore: SessionStoreLike;
}

export async function startTuiChat(options: StartTuiChatOptions): Promise<void> {
  const cleanup = createCleanupStack();
  const [{ default: React }, ink, { createTuiAppComponent }] = await Promise.all([
    import("react"),
    import("ink"),
    import("./components/App.js"),
  ]);
  const selected = await selectTuiSession({
    cwd: options.cwd,
    cwdOverridden: Boolean(options.cwdOverridden),
    sessionStore: options.sessionStore,
    React,
    ink,
    locale: options.config.locale,
  });
  if (!selected) {
    return;
  }

  const projectContext = await loadProjectContext(selected.cwd, {
    projectDocMaxBytes: options.config.projectDocMaxBytes,
  });
  const draftStore = new SqliteTuiDraftStore(projectContext.stateRootDir);
  cleanup.add(() => draftStore.dispose());
  const controller = new TuiController(selected.session, {
    draftStore,
    locale: options.config.locale,
    writeClipboard: (text) => writeTuiClipboard(text),
  });
  controller.updateDock({
    ...projectRuntimeStatusToDock(
      await buildRuntimeStatus(projectContext.stateRootDir, options.config.locale),
      selected.session,
    ),
    model: options.config.model,
  });
  const executionDockWatcher = createTuiExecutionDockWatcher({
    controller,
    readLiveDock: () => readTuiLiveExecutionDock({
      rootDir: projectContext.stateRootDir,
      cwd: selected.cwd,
    }),
  });
  const shell = createTuiInteractionShell(controller);
  const terminalLogWriter = createTerminalLogWriter(projectContext.stateRootDir, selected.session.id);
  const terminalShell = mirrorInteractionShellToTerminalLog(shell, terminalLogWriter);
  const inputGateway = createTuiInputGateway({
    onClose: () => controller.closeInput(),
    onMouseEvent: (event) => controller.handleMouseEvent(event),
  });
  const TuiApp = createTuiAppComponent({
    React,
    Box: ink.Box,
    Text: ink.Text,
    useInput: ink.useInput,
    useStdin: ink.useStdin,
    useBoxMetrics: ink.useBoxMetrics,
    useCursor: ink.useCursor,
    useStdout: ink.useStdout,
  });
  let app: ReturnType<typeof ink.render> | undefined;
  app = ink.render(
    React.createElement(TuiApp, {
      controller,
      editExternally: editTextExternally,
      enableMouseTracking: () => enableMouseTracking(process.stdout),
      redraw: () => app?.clear(),
      suspendInput: () => inputGateway.suspend(),
    }),
    {
      stdin: inputGateway.stdin,
      exitOnCtrlC: false,
      alternateScreen: true,
    },
  );
  cleanup.add(() => inputGateway.dispose());
  cleanup.add(() => executionDockWatcher.dispose());
  cleanup.add(() => terminalShell.dispose?.());
  cleanup.add(() => app?.unmount());
  const driver = new InteractiveSessionDriver({
    cwd: selected.cwd,
    config: options.config,
    session: selected.session,
    sessionStore: options.sessionStore,
    shell: terminalShell,
    stateRootDir: projectContext.stateRootDir,
    onSessionUpdated(session) {
      controller.updateSessionFacts(session);
    },
  });

  try {
    await driver.run();
  } finally {
    cleanup.run();
    await app?.waitUntilExit().catch(() => undefined);
  }
}
