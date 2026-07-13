import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { openControlDatabase } from "../../src/control/sqlite.js";

test("control database preserves Kitty binding and row semantics", () => {
  const db = openControlDatabase(":memory:");
  try {
    db.exec("CREATE TABLE facts (id INTEGER PRIMARY KEY, value TEXT, optional TEXT)");
    const named = db.prepare("INSERT INTO facts (value, optional) VALUES (@value, @optional)")
      .run({ value: "中文", optional: undefined });
    const positional = db.prepare("INSERT INTO facts (value, optional) VALUES (?, ?)")
      .run("second", undefined);

    assert.equal(named.changes, 1);
    assert.equal(positional.changes, 1);
    const rows = db.prepare("SELECT value, optional FROM facts ORDER BY id").all();
    assert.deepEqual(rows, [
      { value: "中文", optional: null },
      { value: "second", optional: null },
    ]);
    assert.equal(Object.getPrototypeOf(rows[0]), Object.prototype);
  } finally {
    db.close();
  }
});

test("control database nests transactions with savepoint rollback", () => {
  const db = openControlDatabase(":memory:");
  try {
    db.exec("CREATE TABLE facts (value TEXT NOT NULL)");
    const outer = db.transaction(() => {
      db.prepare("INSERT INTO facts VALUES (?)").run("outer-before");
      assert.throws(() => db.transaction(() => {
        db.prepare("INSERT INTO facts VALUES (?)").run("nested-rollback");
        throw new Error("nested failure");
      })(), /nested failure/);
      db.transaction(() => db.prepare("INSERT INTO facts VALUES (?)").run("nested-commit"))();
      db.prepare("INSERT INTO facts VALUES (?)").run("outer-after");
    });

    outer.immediate();

    assert.deepEqual(db.prepare("SELECT value FROM facts ORDER BY rowid").all(), [
      { value: "outer-before" },
      { value: "nested-commit" },
      { value: "outer-after" },
    ]);
  } finally {
    db.close();
  }
});

test("control database exposes deferred, immediate, and exclusive transaction modes", () => {
  const db = openControlDatabase(":memory:");
  try {
    db.exec("CREATE TABLE facts (value TEXT NOT NULL)");
    const insert = db.transaction((value: string) => {
      db.prepare("INSERT INTO facts VALUES (?)").run(value);
      return value;
    });

    assert.equal(insert("default"), "default");
    assert.equal(insert.deferred("deferred"), "deferred");
    assert.equal(insert.immediate("immediate"), "immediate");
    assert.equal(insert.exclusive("exclusive"), "exclusive");
    assert.equal(db.prepare<{ count: number }>("SELECT COUNT(*) AS count FROM facts").get()?.count, 4);
  } finally {
    db.close();
  }
});

test("control database rejects asynchronous transaction callbacks and rolls back", () => {
  const db = openControlDatabase(":memory:");
  try {
    db.exec("CREATE TABLE facts (value TEXT NOT NULL)");
    const invalid = db.transaction(async () => {
      db.prepare("INSERT INTO facts VALUES (?)").run("must-rollback");
    });

    assert.throws(() => invalid(), /synchronous/i);
    assert.equal(db.prepare<{ count: number }>("SELECT COUNT(*) AS count FROM facts").get()?.count, 0);
  } finally {
    db.close();
  }
});

test("production metadata has no third-party SQLite native dependency", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    engines?: { node?: string };
  };

  assert.equal(packageJson.dependencies?.["better-sqlite3"], undefined);
  assert.equal(packageJson.devDependencies?.["@types/better-sqlite3"], undefined);
  assert.equal(packageJson.engines?.node, ">=22.13.0");
});
