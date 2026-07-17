export interface RemoteService {
  run(signal?: AbortSignal): Promise<void>;
  stop?(): void;
}

export interface RemoteServiceLock {
  signal?: AbortSignal;
  release(): Promise<void>;
}

export async function runRemoteServiceWithLock(options: {
  lock: RemoteServiceLock;
  createService: () => Promise<RemoteService>;
  onStarted?: () => void;
}): Promise<void> {
  const controller = new AbortController();
  let service: RemoteService | undefined;
  const stop = () => {
    controller.abort();
    service?.stop?.();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  options.lock.signal?.addEventListener("abort", stop, { once: true });
  try {
    service = await options.createService();
    options.onStarted?.();
    const signal = options.lock.signal
      ? AbortSignal.any([controller.signal, options.lock.signal])
      : controller.signal;
    await service.run(signal);
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    options.lock.signal?.removeEventListener("abort", stop);
    await options.lock.release();
  }
}

export async function waitAtMost(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    promise.then(() => undefined),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}
