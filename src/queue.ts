export interface SerialQueueCallbacks {
  onOverflow(): void;
  onError(error: unknown): void;
}

export class SerialQueue {
  private readonly pending: Array<() => Promise<void>> = [];
  private readonly capacity: number;
  private readonly callbacks: SerialQueueCallbacks;
  private running = false;

  constructor(capacity: number, callbacks: SerialQueueCallbacks) {
    this.capacity = capacity;
    this.callbacks = callbacks;
  }

  push(task: () => Promise<void>): void {
    if (this.pending.length >= this.capacity) {
      this.callbacks.onOverflow();
      return;
    }
    this.pending.push(task);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (;;) {
        const task = this.pending.shift();
        if (task === undefined) {
          break;
        }
        try {
          await task();
        } catch (error) {
          this.callbacks.onError(error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
