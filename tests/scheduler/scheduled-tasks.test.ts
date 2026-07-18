import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { ScheduledTaskRuntime } from "../../src/scheduler/runtime.js";
import { calculateNextRun, ScheduledTaskService } from "../../src/scheduler/service.js";
import { createTempWorkspace } from "../helpers.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { executionOwnership } from "../../src/control/types.js";

test("scheduled task CRUD persists one owner and computes explicit next runs", async (t) => {
  const root = await createTempWorkspace("scheduler-crud", t);
  const service = new ScheduledTaskService(root);
  const now = new Date("2026-07-18T00:00:00.000Z");
  const created = service.create({
    name: "drink water",
    action: { type: "reminder", text: "Drink water" },
    schedule: { type: "interval", intervalMinutes: 15 },
    creatorSessionId: "session-1",
    cwd: root,
    now,
  });

  assert.equal(created.nextRunAt, "2026-07-18T00:15:00.000Z");
  assert.equal(service.list().length, 1);
  const disabled = service.update({ id: created.id, enabled: false, cwd: root, now });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.nextRunAt, undefined);
  const enabled = service.update({ id: created.id, enabled: true, cwd: root, now });
  assert.equal(enabled.nextRunAt, "2026-07-18T00:15:00.000Z");
  assert.equal(service.delete(created.id), true);
  assert.deepEqual(service.list(), []);
});

test("daily schedules honor their IANA timezone", () => {
  assert.equal(
    calculateNextRun(
      { type: "daily", time: "09:30", timezone: "Asia/Shanghai" },
      new Date("2026-07-18T00:00:00.000Z"),
    ),
    "2026-07-18T01:30:00.000Z",
  );
  assert.throws(
    () => calculateNextRun({ type: "daily", time: "09:30", timezone: "Mars/Olympus" }),
    /time zone|timezone/i,
  );
});

test("a due deadline is claimed exactly once across contenders", async (t) => {
  const root = await createTempWorkspace("scheduler-claim", t);
  const service = new ScheduledTaskService(root);
  const due = new Date("2026-07-18T00:00:00.000Z");
  service.create({
    name: "once",
    action: { type: "reminder", text: "only once" },
    schedule: { type: "once", runAt: due.toISOString() },
    cwd: root,
    now: due,
  });

  const [left, right] = [service.claimDue(due), service.claimDue(due)];
  assert.equal(left.length + right.length, 1);
  assert.equal(service.listTriggers().length, 1);
  assert.equal(service.list()[0]?.enabled, false);
});

test("only one scheduler runtime owns the project lease", async (t) => {
  const root = await createTempWorkspace("scheduler-leader", t);
  const first = new ScheduledTaskRuntime(root);
  const second = new ScheduledTaskRuntime(root);
  assert.equal(first.start(), true);
  assert.equal(second.start(), false);
  await first.stop();
  assert.equal(second.start(), true);
  await second.stop();
});

test("runtime settles reminders without an Agent or provider request", async (t) => {
  const root = await createTempWorkspace("scheduler-reminder", t);
  const service = new ScheduledTaskService(root);
  const runtime = new ScheduledTaskRuntime(root);
  service.create({
    name: "near reminder",
    action: { type: "reminder", text: "scheduler sentinel" },
    schedule: { type: "once", runAt: new Date(Date.now() + 150).toISOString() },
    cwd: root,
  });
  runtime.start();
  await waitFor(() => service.listTriggers()[0]?.status === "succeeded");
  await runtime.stop();

  const [trigger] = service.listTriggers();
  assert.equal(trigger?.result?.text, "scheduler sentinel");
  assert.equal(trigger?.executionId, undefined);
});

test("runtime executes a prewritten command once through the durable execution ledger", async (t) => {
  const root = await createTempWorkspace("scheduler-command", t);
  const sentinel = path.join(root, "scheduled-sentinel.txt");
  const service = new ScheduledTaskService(root);
  const runtime = new ScheduledTaskRuntime(root);
  service.create({
    name: "write sentinel",
    action: {
      type: "command",
      command: `node -e "require('node:fs').writeFileSync(Buffer.from('${Buffer.from(sentinel).toString("base64")}', 'base64').toString(), 'done')"`,
      cwd: root,
      timeoutMs: 10_000,
    },
    schedule: { type: "once", runAt: new Date(Date.now() + 150).toISOString() },
    cwd: root,
  });
  runtime.start();
  await waitFor(() => service.listTriggers()[0]?.status === "succeeded", 10_000);
  await runtime.stop();

  assert.equal(await fs.readFile(sentinel, "utf8"), "done");
  const [trigger] = service.listTriggers();
  assert.ok(trigger?.executionId);
  const ledger = new ControlPlaneLedger(root);
  assert.equal(ledger.executions.load(trigger!.executionId!)?.status, "completed");
  ledger.close();
});

test("expired trigger claims recover and active tasks cannot be deleted", async (t) => {
  const root = await createTempWorkspace("scheduler-recovery", t);
  const service = new ScheduledTaskService(root);
  const due = new Date("2026-07-18T00:00:00.000Z");
  const task = service.create({
    name: "recover me",
    action: { type: "reminder", text: "durable" },
    schedule: { type: "once", runAt: due.toISOString() },
    cwd: root,
    now: due,
  });
  const [claimed] = service.claimDue(due);
  assert.ok(claimed);
  assert.throws(() => service.delete(task.id), /currently executing/);

  const ledger = new ControlPlaneLedger(root);
  const [recovered] = ledger.scheduledTasks.reclaimExpired(new Date(due.getTime() + 31_000));
  assert.ok(recovered);
  ledger.scheduledTasks.settle({
    id: recovered!.id,
    claimToken: recovered!.claimToken,
    status: "succeeded",
    result: { type: "reminder", text: "durable" },
  });
  assert.equal(ledger.scheduledTasks.listTriggers(task.id)[0]?.status, "succeeded");
  ledger.close();
  assert.equal(service.delete(task.id), true);
});

test("command recovery never replays an execution that crossed a crash boundary", async (t) => {
  const root = await createTempWorkspace("scheduler-uncertain", t);
  const service = new ScheduledTaskService(root);
  const due = new Date();
  const task = service.create({
    name: "do not replay",
    action: { type: "command", command: "node -e \"process.exit(0)\"", cwd: root, timeoutMs: 10_000 },
    schedule: { type: "once", runAt: due.toISOString() },
    creatorSessionId: "session-crashed",
    cwd: root,
    now: due,
  });
  const [trigger] = service.claimDue(due);
  const store = new ExecutionStore(root);
  const execution = store.create({
    command: task.action.type === "command" ? task.action.command : "",
    cwd: root,
    requestedBy: "scheduler",
    ownerSessionId: "session-crashed",
    createdBySessionId: "session-crashed",
    parentTurnId: `scheduled-task:${task.id}`,
    originToolCallId: trigger!.id,
  });
  store.close(execution.id, executionOwnership(execution), {
    status: "lost",
    summary: "Controller died after launch.",
    closeReason: "controller_lease_expired",
  });

  const runtime = new ScheduledTaskRuntime(root);
  runtime.start();
  await runtime.runOnce(new Date(due.getTime() + 31_000));
  await waitFor(() => service.listTriggers(task.id)[0]?.status === "uncertain");
  await runtime.stop();

  const [recovered] = service.listTriggers(task.id);
  assert.equal(recovered?.status, "uncertain");
  assert.equal(recovered?.executionId, execution.id);
  assert.match(recovered?.error ?? "", /not replayed/);
  assert.equal(store.list({ originToolCallIds: [trigger!.id] }).length, 1);
});

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for scheduled task.");
}
