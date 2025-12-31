import type { EmoShard } from '@/types/emotion';
import { uploadShardToServer } from '@/lib/api/uploadShardToServer';

export type UploadQueueItem = {
  localShardId: string;
  episodeId: string;
  audioBlob: Blob;
  startTime: number;
  endTime: number;
  meta?: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
};

export type UploadQueueSnapshot = {
  pendingCount: number;
  inFlightCount: number;
  failedCount: number;
  lastErrorText: string | null;
};

type Listener = () => void;

type Callbacks = {
  onUploaded?: (args: {
    localShardId: string;
    remoteShard: EmoShard;
    episodeId: string;
  }) => Promise<void> | void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

class UploadQueue {
  private readonly items: UploadQueueItem[] = [];
  private inFlightCount = 0;
  private failedCount = 0;
  private lastErrorText: string | null = null;
  private readonly listeners = new Set<Listener>();
  private running = false;
  private callbacks: Callbacks = {};

  configure(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): UploadQueueSnapshot {
    return {
      pendingCount: this.items.length,
      inFlightCount: this.inFlightCount,
      failedCount: this.failedCount,
      lastErrorText: this.lastErrorText,
    };
  }

  enqueue(item: Omit<UploadQueueItem, 'attempts' | 'maxAttempts'> & { maxAttempts?: number }) {
    const maxAttempts = item.maxAttempts ?? 3;
    this.items.push({
      localShardId: item.localShardId,
      episodeId: item.episodeId,
      audioBlob: item.audioBlob,
      startTime: item.startTime,
      endTime: item.endTime,
      meta: item.meta ?? null,
      attempts: 0,
      maxAttempts,
    });
    this.emit();
    void this.run();
  }

  async waitForIdle(): Promise<{ ok: boolean; hadFailures: boolean }> {
    while (true) {
      const snap = this.getSnapshot();
      if (snap.pendingCount === 0 && snap.inFlightCount === 0) {
        return { ok: snap.failedCount === 0, hadFailures: snap.failedCount > 0 };
      }
      await sleep(250);
    }
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private async run() {
    if (this.running) return;
    this.running = true;

    try {
      while (this.items.length > 0) {
        const item = this.items[0];
        this.inFlightCount = 1;
        this.emit();

        item.attempts += 1;

        const res = await uploadShardToServer(
          item.episodeId,
          item.audioBlob,
          item.startTime,
          item.endTime,
          item.meta ?? null
        );
        if (res.success && res.data) {
          try {
            await this.callbacks.onUploaded?.({
              localShardId: item.localShardId,
              remoteShard: res.data,
              episodeId: item.episodeId,
            });
          } catch (err) {
            console.error('[EVA1] uploadQueue onUploaded failed', err);
          }

          this.items.shift();
          this.inFlightCount = 0;
          this.lastErrorText = null;
          this.emit();
          continue;
        }

        const status = res.status;
        const isBackendUnavailable = res.errorText === 'backend_unavailable';
        const isRetryable = !isBackendUnavailable && (status === 0 || status >= 500);
        const isLastAttempt = item.attempts >= item.maxAttempts;

        this.lastErrorText = res.errorText ?? null;
        console.error('[EVA1] uploadQueue item failed', {
          localShardId: item.localShardId,
          episodeId: item.episodeId,
          status,
          attempts: item.attempts,
          maxAttempts: item.maxAttempts,
          errorText: res.errorText,
        });

        this.inFlightCount = 0;
        this.emit();

        if (!isRetryable || isLastAttempt) {
          this.items.shift();
          this.failedCount += 1;
          this.emit();
          continue;
        }

        const backoffMs = Math.min(15000, 1500 * item.attempts);
        await sleep(backoffMs);
      }
    } finally {
      this.inFlightCount = 0;
      this.running = false;
      this.emit();
    }
  }
}

let singleton: UploadQueue | null = null;

export function getUploadQueue(): UploadQueue {
  if (!singleton) singleton = new UploadQueue();
  return singleton;
}
