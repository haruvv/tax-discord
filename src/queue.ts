const QUEUE_MAX_SIZE = 5;

interface QueueEntry {
  job: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export class JobQueue {
  private queue: QueueEntry[] = [];
  private running = false;

  enqueue(job: () => Promise<void>): Promise<void> {
    if (this.queue.length >= QUEUE_MAX_SIZE) {
      return Promise.reject(
        new Error(`Queue is full (max ${QUEUE_MAX_SIZE}). Try again later.`),
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      if (!this.running) {
        void this.drain();
      }
    });
  }

  get pending(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    this.running = true;

    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      try {
        await entry.job();
        entry.resolve();
      } catch (err) {
        entry.reject(err);
      }
    }

    this.running = false;
  }
}
