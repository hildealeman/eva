import Meyda, { type MeydaFeaturesObject } from 'meyda';
import type { EmoFeatures } from '@/types/emotion';

const MIN_ANALYSIS_SAMPLES = 512;
const MAX_ANALYSIS_SAMPLES = 4096;

export class FeatureExtractor {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  extract(samples: Float32Array): EmoFeatures | null {
    if (samples.length === 0) return null;

    const manualRms = this.computeRms(samples);
    const { signal, bufferSize } = FeatureExtractor.prepareAnalysisBuffer(samples);

    try {
      const meydaOptions = {
        sampleRate: this.sampleRate,
        bufferSize,
      } as unknown as number[];

      const features = Meyda.extract(
        ['rms', 'zcr', 'spectralCentroid'],
        signal as unknown as number[],
        meydaOptions
      ) as MeydaFeaturesObject;

      const typed = features as unknown as {
        rms?: number;
        zcr?: number | null;
        spectralCentroid?: number | null;
      };

      const rawRms = typed?.rms;
      const rms =
        typeof rawRms === 'number' && !Number.isNaN(rawRms) && rawRms > 0.0001
          ? rawRms
          : manualRms;
      const zcr = typed?.zcr ?? null;
      const spectralCentroid = typed?.spectralCentroid ?? null;

      const peak = this.getPeak(samples);
      const duration = samples.length / this.sampleRate;

      const emoFeatures: EmoFeatures = {
        rms,
        peak,
        zcr,
        spectralCentroid,
        tempo: null,
        duration,
        pitch: null,
      };

      return emoFeatures;
    } catch (error) {
      console.error(
        'Error extracting features with Meyda. Falling back to basic features.',
        error
      );

      const rms = manualRms;
      const peak = this.getPeak(samples);
      const duration = samples.length / this.sampleRate;

      const fallback: EmoFeatures = {
        rms,
        peak,
        zcr: null,
        spectralCentroid: null,
        tempo: null,
        duration,
        pitch: null,
      };

      return fallback;
    }
  }

  private computeRms(samples: Float32Array): number {
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    return Math.sqrt(sumSq / samples.length);
  }

  private static prepareAnalysisBuffer(samples: Float32Array): {
    signal: Float32Array;
    bufferSize: number;
  } {
    if (samples.length <= MIN_ANALYSIS_SAMPLES) {
      const out = new Float32Array(MIN_ANALYSIS_SAMPLES);
      out.set(samples, MIN_ANALYSIS_SAMPLES - samples.length);
      return { signal: out, bufferSize: MIN_ANALYSIS_SAMPLES };
    }

    const sliceLength = Math.min(samples.length, MAX_ANALYSIS_SAMPLES);
    const sliced = samples.subarray(samples.length - sliceLength);

    let bufferSize = 1 << Math.floor(Math.log2(sliceLength));
    bufferSize = Math.max(bufferSize, MIN_ANALYSIS_SAMPLES);

    if (sliced.length === bufferSize) {
      return { signal: sliced, bufferSize };
    }

    const out = new Float32Array(bufferSize);
    if (sliced.length > bufferSize) {
      const start = sliced.length - bufferSize;
      out.set(sliced.subarray(start));
    } else {
      out.set(sliced, bufferSize - sliced.length);
    }

    return { signal: out, bufferSize };
  }

  private getPeak(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }
}
