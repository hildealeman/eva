import type { EmoFeatures } from '@/types/emotion';

export const DEFAULT_PRE_CONTEXT_MS = 3000;
export const DEFAULT_POST_CONTEXT_MS = 5000;

export type EmotionDebugInfo = {
  rms: number;
  avgRms: number;
  threshold: number;
  deltaFactor: number;
  isAboveThreshold: boolean;
  isAboveDelta: boolean;
};

export interface EmotionDetectorConfig {
  rmsThreshold: number;
  rmsDeltaFactor: number;
  minSilenceBetweenEvents: number; // ms
  preRoll: number; // ms
  postRoll: number; // ms
}

export type EmotionEvent = {
  timestamp: number;
  timestampSeconds: number;
  intensity: number;
  windowStart: number;
  windowEnd: number;
};

export type EmotionEventHandler = (event: EmotionEvent) => void;

export type EmotionDebugCallback = (info: EmotionDebugInfo) => void;

export class EmotionDetector {
  private config: EmotionDetectorConfig;
  private rmsWindow: number[] = [];
  private lastEventTime = -Infinity;
  private handler: EmotionEventHandler;
  private debugCallback?: EmotionDebugCallback;

  constructor(
    handler: EmotionEventHandler,
    config?: Partial<EmotionDetectorConfig>,
    debugCallback?: EmotionDebugCallback
  ) {
    this.handler = handler;
    this.debugCallback = debugCallback;
    this.config = {
      rmsThreshold: 0.02,
      rmsDeltaFactor: 1.2,
      minSilenceBetweenEvents: 1500,
      preRoll: DEFAULT_PRE_CONTEXT_MS,
      postRoll: DEFAULT_POST_CONTEXT_MS,
      ...config,
    };
  }

  processChunk(features: EmoFeatures, timeSeconds: number) {
    const now = Date.now();
    const sinceLast = now - this.lastEventTime;

    const canFire = sinceLast >= this.config.minSilenceBetweenEvents;

    this.rmsWindow.push(features.rms);
    if (this.rmsWindow.length > 10) {
      this.rmsWindow.shift();
    }

    const avgRms =
      this.rmsWindow.reduce((sum, v) => sum + v, 0) / this.rmsWindow.length;

    const { rmsThreshold, rmsDeltaFactor, preRoll, postRoll } = this.config;

    const isAboveThreshold = features.rms > rmsThreshold;
    const isAboveDelta = features.rms > avgRms * rmsDeltaFactor;

    if (this.debugCallback) {
      this.debugCallback({
        rms: features.rms,
        avgRms,
        threshold: rmsThreshold,
        deltaFactor: rmsDeltaFactor,
        isAboveThreshold,
        isAboveDelta,
      });
    }

    if (canFire && isAboveThreshold && isAboveDelta) {
      const windowStart = Math.max(0, timeSeconds - preRoll / 1000);
      const windowEnd = timeSeconds + postRoll / 1000;

      const intensity = Math.min(1, features.rms / (rmsThreshold * 2));

      this.handler({
        timestamp: timeSeconds,
        timestampSeconds: timeSeconds,
        intensity,
        windowStart,
        windowEnd,
      });

      this.lastEventTime = now;
    }
  }

  updateConfig(config: Partial<EmotionDetectorConfig>) {
    this.config = { ...this.config, ...config };
  }
}
