export type PollStop = () => void;

/**
 * Run `tick` every `intervalMs`, but:
 * - never overlap ticks (a slow or stalled tick delays the next one),
 * - pause entirely while the tab is hidden,
 * - run one immediate tick when the tab becomes visible again.
 *
 * This keeps background polling from stacking requests onto a slow backend
 * and exhausting the browser's per-origin connection pool.
 *
 * Returns a stop function; call it from onMount's cleanup / onDestroy.
 */
export function pollWhileVisible(tick: () => void | Promise<void>, intervalMs: number): PollStop {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let stopped = false;

  const runTick = async () => {
    if (running || stopped) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    running = true;
    try {
      await tick();
    } catch {
      // Poll ticks are best-effort; callers surface their own errors.
    } finally {
      running = false;
    }
  };

  const onVisibility = () => {
    if (typeof document !== 'undefined' && !document.hidden) void runTick();
  };

  timer = setInterval(() => void runTick(), intervalMs);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
