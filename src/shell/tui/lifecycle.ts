export type Cleanup = () => void;

export function createCleanupStack(): {
  add(cleanup: Cleanup | undefined): void;
  run(): void;
} {
  const cleanups: Cleanup[] = [];
  let disposed = false;
  return {
    add(cleanup) {
      if (!cleanup) {
        return;
      }
      if (disposed) {
        cleanup();
        return;
      }
      cleanups.push(cleanup);
    },
    run() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const cleanup of cleanups.splice(0).reverse()) {
        cleanup();
      }
    },
  };
}
