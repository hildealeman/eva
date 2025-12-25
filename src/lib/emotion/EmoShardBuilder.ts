import type { EmoFeatures, EmoShard } from '@/types/emotion';
import { nanoid } from 'nanoid';

export class EmoShardBuilder {
  static build(
    source: 'mic' | 'file',
    startTime: number,
    endTime: number,
    features: EmoFeatures,
    options?: {
      audioBlob?: Blob;
      audioSampleRate?: number;
      intensityOverride?: number;
    }
  ): EmoShard {
    const intensity =
      typeof options?.intensityOverride === 'number'
        ? Math.max(0, Math.min(1, options.intensityOverride))
        : this.computeIntensity(features);
    const durationSeconds = Math.max(0, endTime - startTime);
    const suggestedTags = this.suggestTags(features, intensity, durationSeconds);

    return {
      id: nanoid(),
      createdAt: new Date().toISOString(),
      source,
      startTime,
      endTime,
      intensity,
      features,
      suggestedTags,
      userTags: [],
      status: 'raw',
      notes: undefined,
      audioBlob: options?.audioBlob,
      audioSampleRate: options?.audioSampleRate,
      audioDurationSeconds: durationSeconds,
    };
  }

  private static computeIntensity(features: EmoFeatures): number {
    const rmsIntensity = Math.min(1, features.rms * 5);
    const peakIntensity = Math.min(1, features.peak * 2);
    return rmsIntensity * 0.7 + peakIntensity * 0.3;
  }

  private static suggestTags(
    features: EmoFeatures,
    intensity: number,
    durationSeconds: number
  ): string[] {
    // FUTURO (prosodia v2):
    // Aquí podríamos inyectar etiquetas como "risa", "llanto" o "tensión" usando
    // un modelo entrenado de prosodia, NO heurísticas simples de RMS/ZCR.

    const tags: string[] = [];

    // 1) Energía / emocionalidad (coarse)
    if (intensity < 0.3) tags.push('emocionalidad baja');
    else if (intensity < 0.7) tags.push('emocionalidad media');
    else tags.push('pico emocional');

    // 2) Volumen (rms absoluto)
    const rms = features.rms ?? 0;
    if (rms > 0) {
      if (rms >= 0.12) tags.push('voz fuerte');
      else if (rms >= 0.06) tags.push('voz moderada');
      else tags.push('voz suave');
    }

    // 3) Timbre (spectral centroid)
    const centroid = features.spectralCentroid ?? 0;
    if (centroid > 0) {
      if (centroid >= 2200) tags.push('voz más aguda');
      else if (centroid <= 1000) tags.push('voz más grave');
      else tags.push('timbre neutro');
    }

    // 4) Textura / ruido (zcr)
    const zcr = features.zcr ?? 0;
    if (zcr > 0) {
      if (zcr >= 0.12) tags.push('ruido de fondo presente');
      else if (zcr <= 0.06) tags.push('audio relativamente limpio');
      else tags.push('ambiente moderado');
    }

    // 5) Duración del momento
    if (durationSeconds < 3) tags.push('fragmento breve');
    else if (durationSeconds < 10) tags.push('momento con contexto');
    else tags.push('episodio prolongado');

    const unique = Array.from(new Set(tags));
    return unique.slice(0, 6);
  }
}
