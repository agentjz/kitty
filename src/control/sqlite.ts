import { DatabaseSync } from "node:sqlite";

type SqliteInputValue = null | number | bigint | string | NodeJS.ArrayBufferView;
type SqliteRow = Record<string, unknown>;

export interface ControlStatement<Result = unknown> {
  run(...parameters: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...parameters: unknown[]): Result | undefined;
  all(...parameters: unknown[]): Result[];
}

export interface ControlTransaction<Arguments extends unknown[], Result> {
  (...args: Arguments): Result;
  default(...args: Arguments): Result;
  deferred(...args: Arguments): Result;
  immediate(...args: Arguments): Result;
  exclusive(...args: Arguments): Result;
}

export interface ControlDatabase {
  prepare<Result = unknown>(sql: string): ControlStatement<Result>;
  exec(sql: string): void;
  transaction<Arguments extends unknown[], Result>(
    operation: (...args: Arguments) => Result,
  ): ControlTransaction<Arguments, Result>;
  close(): void;
}

interface NodeStatement {
  run(...parameters: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
  all(...parameters: unknown[]): Array<Record<string, unknown>>;
}

type TransactionMode = "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE";

export function openControlDatabase(filename: string): ControlDatabase {
  return new NodeControlDatabase(new DatabaseSync(filename, {
    enableForeignKeyConstraints: false,
    allowExtension: false,
  }));
}

class NodeControlDatabase implements ControlDatabase {
  private transactionDepth = 0;
  private savepointSequence = 0;

  constructor(private readonly database: DatabaseSync) {}

  prepare<Result = unknown>(sql: string): ControlStatement<Result> {
    const statement = this.database.prepare(sql) as unknown as NodeStatement;
    return {
      run: (...parameters) => {
        const result = statement.run(...normalizeParameters(parameters));
        return {
          changes: Number(result.changes),
          lastInsertRowid: result.lastInsertRowid,
        };
      },
      get: (...parameters) => normalizeRow(statement.get(...normalizeParameters(parameters))) as Result | undefined,
      all: (...parameters) => statement.all(...normalizeParameters(parameters)).map(toOrdinaryRow) as Result[],
    };
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  transaction<Arguments extends unknown[], Result>(
    operation: (...args: Arguments) => Result,
  ): ControlTransaction<Arguments, Result> {
    const invoke = (mode: TransactionMode, args: Arguments): Result =>
      this.runTransaction(mode, operation, args);
    const transaction = ((...args: Arguments) => invoke("DEFERRED", args)) as ControlTransaction<Arguments, Result>;
    transaction.default = (...args) => invoke("DEFERRED", args);
    transaction.deferred = (...args) => invoke("DEFERRED", args);
    transaction.immediate = (...args) => invoke("IMMEDIATE", args);
    transaction.exclusive = (...args) => invoke("EXCLUSIVE", args);
    return transaction;
  }

  close(): void {
    this.database.close();
  }

  private runTransaction<Arguments extends unknown[], Result>(
    mode: TransactionMode,
    operation: (...args: Arguments) => Result,
    args: Arguments,
  ): Result {
    const nested = this.transactionDepth > 0;
    const savepoint = nested ? `kitty_transaction_${++this.savepointSequence}` : undefined;
    this.database.exec(savepoint ? `SAVEPOINT ${savepoint}` : `BEGIN ${mode}`);
    this.transactionDepth += 1;

    try {
      const result = operation(...args);
      if (isPromiseLike(result)) {
        throw new Error("SQLite transaction callbacks must be synchronous.");
      }
      this.database.exec(savepoint ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      try {
        if (savepoint) {
          this.database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          this.database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else {
          this.database.exec("ROLLBACK");
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "SQLite transaction failed and could not be rolled back.",
          { cause: error },
        );
      }
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }
}

function normalizeParameters(parameters: readonly unknown[]): unknown[] {
  if (parameters.length === 0) return [];
  const [first, ...rest] = parameters;
  if (isNamedParameters(first)) {
    const named: Record<string, SqliteInputValue> = {};
    for (const [key, value] of Object.entries(first)) {
      named[key] = normalizeValue(value);
    }
    return [named, ...rest.map(normalizeValue)];
  }
  return parameters.map(normalizeValue);
}

function normalizeValue(value: unknown): SqliteInputValue {
  if (value === undefined) return null;
  if (
    value === null || typeof value === "number" || typeof value === "bigint" ||
    typeof value === "string" || ArrayBuffer.isView(value)
  ) {
    return value as SqliteInputValue;
  }
  throw new TypeError(`Unsupported SQLite parameter type: ${typeof value}.`);
}

function isNamedParameters(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function normalizeRow(row: Record<string, unknown> | undefined): SqliteRow | undefined {
  return row ? toOrdinaryRow(row) : undefined;
}

function toOrdinaryRow(row: Record<string, unknown>): SqliteRow {
  return { ...row };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  ) && typeof (value as { then?: unknown }).then === "function";
}
