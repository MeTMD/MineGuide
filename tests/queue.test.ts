import { describe, expect, it, vi } from 'vitest';

import { SerialQueue } from '../src/queue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('SerialQueue', () => {
  it('runs tasks serially in order', async () => {
    const events: string[] = [];
    const gate = deferred();
    const queue = new SerialQueue(8, { onOverflow: vi.fn(), onError: vi.fn() });

    queue.push(async () => {
      events.push('a-start');
      await gate.promise;
      events.push('a-end');
    });
    queue.push(async () => {
      events.push('b');
    });

    await vi.waitFor(() => expect(events).toEqual(['a-start']));
    gate.resolve();
    await vi.waitFor(() => expect(events).toEqual(['a-start', 'a-end', 'b']));
  });

  it('drops the newest task when the queue is full', async () => {
    const onOverflow = vi.fn();
    const gate = deferred();
    const started: number[] = [];
    const queue = new SerialQueue(2, { onOverflow, onError: vi.fn() });

    queue.push(async () => {
      await gate.promise;
    });
    queue.push(async () => {
      started.push(2);
    });
    queue.push(async () => {
      started.push(3);
    });
    queue.push(async () => {
      started.push(4);
    });

    expect(onOverflow).toHaveBeenCalledTimes(1);
    gate.resolve();
    await vi.waitFor(() => expect(started).toEqual([2, 3]));
  });

  it('reports errors and keeps processing', async () => {
    const onError = vi.fn();
    const processed: string[] = [];
    const queue = new SerialQueue(4, { onOverflow: vi.fn(), onError });

    queue.push(async () => {
      throw new Error('boom');
    });
    queue.push(async () => {
      processed.push('next');
    });

    await vi.waitFor(() => expect(processed).toEqual(['next']));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
