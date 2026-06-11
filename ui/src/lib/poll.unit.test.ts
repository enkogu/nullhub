import { afterEach, describe, expect, test, vi } from 'vitest';
import { pollWhileVisible } from '$lib/poll';

const originalDocument = globalThis.document;

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  });
});

describe('pollWhileVisible', () => {
  test('does not tick while hidden and runs once when the document becomes visible', async () => {
    vi.useFakeTimers();
    let hidden = true;
    const listeners = new Map<string, () => void>();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        get hidden() {
          return hidden;
        },
        addEventListener: vi.fn((event: string, listener: () => void) => {
          listeners.set(event, listener);
        }),
        removeEventListener: vi.fn((event: string) => {
          listeners.delete(event);
        }),
      },
    });

    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 1000);

    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).not.toHaveBeenCalled();

    hidden = false;
    listeners.get('visibilitychange')?.();
    await Promise.resolve();
    expect(tick).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
