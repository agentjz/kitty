# SQLite Runtime Migration

## 1. Requirements

- Kitty must install from the npm registry without downloading a SQLite native binary from GitHub and without compiling SQLite locally.
- The control plane remains the single durable source for sessions, turns, tool effects, executions, wake signals, runtime events, Telegram delivery, and TUI drafts.
- Existing atomic ownership, lease, fencing, CAS, WAL durability, busy timeout, and nested transaction behavior must not regress.
- The implementation targets the current and future product only. It does not preserve old database engines, old schema versions, or compatibility aliases.
- The supported runtime becomes Node.js 22.13.0 or newer, where `node:sqlite` is available without an experimental command-line flag.
- The completed migration is released as Kitty 0.0.35 to git and npm.

## 2. Current Facts

- `package.json` depends on `better-sqlite3@12.8.0`; its install script uses `prebuild-install` and falls back to `node-gyp`.
- The SQLite npm tarball comes from the npm registry, but its native binding can require a GitHub release download during installation.
- The runtime dependency tree currently contains `better-sqlite3 -> prebuild-install` and a platform-specific `better_sqlite3.node` binding.
- `src/control/` only uses synchronous prepare/run/get/all, exec, pragmas, close, and deferred/immediate/exclusive transactions.
- Control-plane methods nest transactions. The replacement must use savepoints for nested calls.
- Existing named bindings may contain `undefined`. `better-sqlite3` stores those values as SQL NULL, while `node:sqlite` rejects them unless Kitty normalizes them.
- `node:sqlite` returns null-prototype row objects and reports SQLite errors differently. Kitty needs an internal contract instead of leaking either engine's API.
- Node.js 22.13.0 was tested directly with positional parameters, bare named parameters, Unicode text, and synchronous statements.
- Node.js 22 and 24 print a SQLite ExperimentalWarning. The owner explicitly accepts that upstream warning, so Kitty does not intercept global warning behavior.
- Continue's native SQLite distribution code maintains an OS/architecture binary matrix and still documents missing platform coverage. Kitty will not own that matrix.
- The current branch is clean at `ee6065f`, version `0.0.34`, and matches `origin/master` before this migration.

## 3. Failing Tests Before Implementation

- `npm.cmd ls better-sqlite3 prebuild-install --all` proves the blocked native download path is in the runtime graph.
- A clean production install cannot prove registry-only SQLite installation while `better-sqlite3` owns an install script and native binding.
- There is no engine-boundary test for nested rollback, exclusive transactions, undefined-to-NULL binding, Unicode rows, or load-time warning isolation.
- One background lifecycle test imports `better-sqlite3` directly, so the database engine is not isolated behind the control boundary.
- Metadata and documentation still claim Node.js 22.0.0 rather than the actual minimum required by the replacement runtime.

## 4. Goals

- Add one control-plane SQLite adapter backed by the built-in `node:sqlite` module.
- Expose only Kitty's required synchronous statement and transaction contract.
- Preserve default deferred transactions, explicit immediate/exclusive transactions, nested savepoints, rollback, and original error propagation.
- Normalize positional and named `undefined` values to SQL NULL and normalize result rows to ordinary objects.
- Remove all runtime and type dependencies on `better-sqlite3`.
- Make package metadata, CI, README, quickstart, and `spec.md` state the same Node.js minimum and SQLite ownership fact.
- Prove the packed production package installs without a SQLite native addon download or local build.

## 5. Out Of Scope

- Supporting Node.js versions below 22.13.0.
- Shipping Kitty-owned SQLite binaries for OS, architecture, libc, or Node ABI combinations.
- A WASM, remote, browser, Bun, or alternate database fallback.
- Migrating or repairing old control-plane schema versions.
- Changing control-plane tables, lifecycle state machines, UI behavior, or provider behavior.
- A git tag or GitHub release; the requested release surface is commit, push, and npm publish.

## 6. Design

- `src/control/sqlite.ts` owns the `node:sqlite` boundary, bind normalization, row normalization, and the transaction state machine.
- Repositories depend on `ControlDatabase`, never on `node:sqlite` or a third-party package.
- The outer transaction uses `BEGIN DEFERRED`, `BEGIN IMMEDIATE`, or `BEGIN EXCLUSIVE`; nested transactions use unique savepoints and preserve the outer owner.
- Transaction callbacks are synchronous. A returned Promise is rejected and rolled back because committing before async work settles would violate the lifecycle boundary.
- Ledger initialization explicitly applies WAL, FULL synchronous durability, a 5000 ms busy timeout, schema initialization with foreign keys disabled, then enables foreign keys.
- Tests open raw control-plane files only through the same internal adapter.
- CI runs the same full verification on Ubuntu, Windows, and macOS with Node 22.13.0 as the minimum contract.

## 7. Tasks

- [x] Add failing adapter contract and runtime dependency tests.
- [x] Implement the `node:sqlite` control database adapter and transaction state machine.
- [x] Move every control repository and direct test database access to the internal contract.
- [x] Remove `better-sqlite3`, its type package, and the native prebuild dependency chain.
- [x] Update Node engine metadata, build targets where needed, CI, README, quickstart, and `spec.md`.
- [x] Run focused adapter, control-plane, concurrency, and lifecycle tests.
- [x] Pack and clean-install the production artifact; inspect its runtime dependency tree and files.
- [x] Run the full project verification and local evaluation.
- [x] Run real production evaluation with the configured API when credentials are available.
- [x] Remove generated artifacts, inspect the final diff, and record closeout facts.
- [x] Prepare version 0.0.35 and verify npm ownership plus the current registry version.

## 8. Verification

- Typecheck and production build pass on the supported runtime.
- Adapter tests prove positional/named binding, undefined-to-NULL, Unicode, ordinary row objects, nested commit/rollback, transaction modes, and async rejection.
- Existing control-plane and lifecycle suites prove session CAS, turn ownership, steer consumption, tool fencing, execution terminality, wake idempotency, Telegram leases, and process recovery remain intact.
- `npm.cmd ls better-sqlite3 prebuild-install node-gyp --omit=dev --all` contains none of the removed runtime path.
- `npm pack` contains no SQLite native binary and a clean production install of that tarball succeeds with lifecycle scripts enabled.
- `npm.cmd run verify` passes.
- `npm.cmd run eval:local` passes.
- `npm.cmd run eval:production` passes against the configured real provider, or the missing external credential is reported explicitly.
- CI defines Windows, Linux, and macOS verification at Node.js 22.13.0.
- `git diff --check` passes and generated test/package artifacts are absent.

## 9. Closeout

- The exact Node.js 22.13.0 Windows binary passed 22 focused adapter and control-plane tests.
- Final `npm.cmd run verify`: 341 tests, 340 passed, 0 failed, 1 expected Windows skip.
- Final package manifest: 9 files with CLI and TUI artifacts, 0 native addon files.
- A clean production install of the 0.0.35 tarball passed `--version`, `init`, and `status` under Node.js 22.13.0 and created a real SQLite control plane.
- `npm.cmd run eval:local`: 13/13 scenes passed.
- `npm.cmd run eval:production`: 5/5 real DeepSeek scenes passed.
- `npm.cmd audit --omit=dev`: 0 vulnerabilities.
- CI now verifies the minimum runtime on Windows, Linux, and macOS; only Windows was executed locally.
- The upstream Node SQLite ExperimentalWarning remains visible by explicit owner choice.
