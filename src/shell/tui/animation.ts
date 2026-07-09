import type { InkRuntime } from "./components/kit.js";

export const TUI_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function useTuiAnimationFrame(
  React: InkRuntime["React"],
  options: {
    readonly enabled: boolean;
    readonly frameCount: number;
    readonly intervalMs?: number;
  },
): number {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    if (!options.enabled || options.frameCount <= 1) {
      return undefined;
    }
    const timer = setInterval(() => {
      setFrame((value) => (value + 1) % options.frameCount);
    }, options.intervalMs ?? 120);
    return () => clearInterval(timer);
  }, [options.enabled, options.frameCount, options.intervalMs]);
  return frame % Math.max(1, options.frameCount);
}
