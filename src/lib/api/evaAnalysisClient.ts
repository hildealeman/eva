import type {
  ArousalLevel,
  CoreEmotion,
  EmoShard,
  EmotionReading,
  EmotionLabelScore,
  ProsodyFlags,
  SemanticAnalysis,
  Valence,
} from '@/types/emotion';
import {
  getCloudAnalysisBaseUrl,
  getEvaAnalysisMode,
  getLocalAnalysisBaseUrl,
} from '@/lib/config/evaAnalysisConfig';

export interface ShardAnalysisResult {
  transcript?: string;
  transcriptLanguage?: string;
  transcriptionConfidence?: number;

  primaryEmotion?: CoreEmotion | null;
  emotionLabels?: EmotionLabelScore[];
  valence?: Valence | null;
  arousal?: ArousalLevel | null;
  prosodyFlags?: ProsodyFlags;

  emotion?: EmotionReading;

  analysisSource: 'local' | 'cloud';
  analysisMode: 'automatic';
  analysisVersion?: string;
  analysisAt: string;

  semantic?: SemanticAnalysis;
}

export type ShardAnalysisErrorCode =
  | 'backend_unavailable'
  | 'invalid_request'
  | 'timeout'
  | 'network_error'
  | 'http_error'
  | 'unknown';

export type AnalyzeShardAudioSafeResult =
  | { ok: true; result: ShardAnalysisResult }
  | { ok: false; result: null; errorCode: ShardAnalysisErrorCode; status?: number };

const DEFAULT_TIMEOUT_MS = 60_000;

export async function analyzeShardAudio(
  shard: EmoShard
): Promise<ShardAnalysisResult | null> {
  const safe = await analyzeShardAudioSafe(shard);
  return safe.ok ? safe.result : null;
}

export async function analyzeShardAudioSafe(
  shard: EmoShard,
  opts?: { timeoutMs?: number }
): Promise<AnalyzeShardAudioSafeResult> {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') {
    return { ok: false, result: null, errorCode: 'backend_unavailable' };
  }
  if (!shard.audioBlob) {
    return { ok: false, result: null, errorCode: 'invalid_request' };
  }

  const baseUrl =
    mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
  if (!baseUrl) {
    return { ok: false, result: null, errorCode: 'backend_unavailable' };
  }

  const form = new FormData();
  form.append('audio', shard.audioBlob, `shard-${shard.id || 'unknown'}.wav`);
  form.append('sampleRate', String(shard.audioSampleRate ?? 16000));
  form.append('durationSeconds', String(shard.audioDurationSeconds ?? 0));

  form.append(
    'features',
    JSON.stringify({
      rms: shard.features?.rms ?? null,
      zcr: shard.features?.zcr ?? null,
      spectralCentroid: shard.features?.spectralCentroid ?? null,
      intensity: shard.intensity ?? null,
    })
  );

  form.append(
    'meta',
    JSON.stringify({
      shardId: shard.id,
      episodeId: shard.episodeId ?? null,
      source: shard.source,
      startTime: shard.startTime,
      endTime: shard.endTime,
    })
  );

  const url = `${baseUrl.replace(/\/$/, '')}/analyze-shard`;

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (response.status === 503) {
      console.error('EVA analysis backend unavailable (503)');
      return {
        ok: false,
        result: null,
        errorCode: 'backend_unavailable',
        status: 503,
      };
    }

    if (response.status === 400) {
      console.error(
        'EVA analysis invalid request (400)',
        await response.text().catch(() => '')
      );
      return {
        ok: false,
        result: null,
        errorCode: 'invalid_request',
        status: 400,
      };
    }

    if (!response.ok) {
      console.error(
        'EVA analysis endpoint error',
        response.status,
        await response.text().catch(() => '')
      );
      return {
        ok: false,
        result: null,
        errorCode: 'http_error',
        status: response.status,
      };
    }

    const json = (await response.json()) as ShardAnalysisResult;
    return { ok: true, result: json };
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    console.error('EVA analysis request failed', err);

    return {
      ok: false,
      result: null,
      errorCode: isAbort ? 'timeout' : 'network_error',
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
