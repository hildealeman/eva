'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioInputManager } from '@/lib/audio/AudioInputManager';
import { AudioBufferRing } from '@/lib/audio/AudioBufferRing';
import { createWavBlobFromFloat32 } from '@/lib/audio/createWavBlob';
import { FeatureExtractor } from '@/lib/emotion/FeatureExtractor';
import {
  EmotionDetector,
  DEFAULT_POST_CONTEXT_MS,
  DEFAULT_PRE_CONTEXT_MS,
  type EmotionDebugInfo,
  type EmotionEvent,
} from '@/lib/emotion/EmotionDetector';
import { EmoShardBuilder } from '@/lib/emotion/EmoShardBuilder';
import { EmoShardStore } from '@/lib/store/EmoShardStore';
import { EpisodeStore } from '@/lib/store/EpisodeStore';
import { runShardAnalysis } from '@/lib/analysis/runShardAnalysis';
import LiveLevelMeter from '@/components/audio/LiveLevelMeter';
import type { EmoShard } from '@/types/emotion';
import AnalysisStatusBadge from '@/components/emotion/AnalysisStatusBadge';
import { useShardAnalysisState } from '@/lib/state/useShardAnalysisState';
import { ensureEvaDb } from '@/lib/store/evaDb';
import EVAStatusCard from '@/components/status/EVAStatusCard';
import MyRoleCard from '@/components/community/MyRoleCard';
import ProgressCard from '@/components/community/ProgressCard';
import InvitationsPanel from '@/components/profile/InvitationsPanel';

const SAMPLE_RATE = 44100;
const BUFFER_SECONDS = 30;
const MAX_RECENT = 5;

const GROUP_GAP_SECONDS = 4;
const EPISODE_MAX_SECONDS = 20;
const EPISODE_PRE_PADDING_SECONDS = 2;
const EPISODE_POST_PADDING_SECONDS = 4;

type PendingEpisode = {
  firstEventTime: number;
  lastEventTime: number;
  peakIntensity: number;
};

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [rms, setRms] = useState(0);
  const [recentClips, setRecentClips] = useState<EmoShard[]>([]);
  const [debugInfo, setDebugInfo] = useState<EmotionDebugInfo | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);
  const [currentEpisodeCreatedAt, setCurrentEpisodeCreatedAt] = useState<string | null>(null);

  const audioManagerRef = useRef<AudioInputManager | null>(null);
  const bufferRef = useRef<AudioBufferRing | null>(null);
  const extractorRef = useRef<FeatureExtractor | null>(null);
  const detectorRef = useRef<EmotionDetector | null>(null);

  const pendingEpisodeRef = useRef<PendingEpisode | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);

  const finalizeEpisode = useCallback(async (episode: PendingEpisode) => {
    const buffer = bufferRef.current;
    const extractor = extractorRef.current;
    if (!buffer || !extractor) return;

    const episodeId = currentEpisodeId ?? crypto.randomUUID();
    if (!currentEpisodeId) {
      const nowIso = new Date().toISOString();
      setCurrentEpisodeId(episodeId);
      setCurrentEpisodeCreatedAt(nowIso);
      await ensureEvaDb();
      await EpisodeStore.upsertEpisodeSummary({
        id: episodeId,
        title: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        shardCount: 0,
        durationSeconds: 0,
      });
    }

    let startTime = Math.max(0, episode.firstEventTime - EPISODE_PRE_PADDING_SECONDS);
    const endTime = episode.lastEventTime + EPISODE_POST_PADDING_SECONDS;

    if (endTime - startTime > EPISODE_MAX_SECONDS) {
      startTime = Math.max(0, endTime - EPISODE_MAX_SECONDS);
    }

    const windowSamples = buffer.getWindow(startTime, endTime);
    if (!windowSamples || windowSamples.length === 0) return;

    const features = extractor.extract(windowSamples);
    if (!features) return;

    const audioBlob = createWavBlobFromFloat32(windowSamples, SAMPLE_RATE);

    const shard: EmoShard = {
      ...EmoShardBuilder.build('mic', startTime, endTime, features, {
      intensityOverride: episode.peakIntensity,
      audioBlob,
      audioSampleRate: SAMPLE_RATE,
      }),
      episodeId,
    };

    async function runAnalysisForShard(saved: EmoShard) {
      const { updated } = await runShardAnalysis(saved);
      if (!updated) return;

      setRecentClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }

    try {
      await EmoShardStore.save(shard);
      await EpisodeStore.recordShard(episodeId, shard);
      setEventCount((prev) => prev + 1);
      setRecentClips((prev) => [shard, ...prev].slice(0, MAX_RECENT));

      void runAnalysisForShard(shard);
    } catch (e) {
      console.error('Error guardando clip:', e);
    }
  }, [currentEpisodeId]);

  const handleEmotionEvent = useCallback(
    (event: EmotionEvent) => {
      const t = event.timestampSeconds;

      const prev = pendingEpisodeRef.current;
      if (!prev) {
        pendingEpisodeRef.current = {
          firstEventTime: t,
          lastEventTime: t,
          peakIntensity: event.intensity,
        };
      } else {
        const gap = t - prev.lastEventTime;
        const total = t - prev.firstEventTime;

        if (gap <= GROUP_GAP_SECONDS && total <= EPISODE_MAX_SECONDS) {
          pendingEpisodeRef.current = {
            firstEventTime: prev.firstEventTime,
            lastEventTime: t,
            peakIntensity: Math.max(prev.peakIntensity, event.intensity),
          };
        } else {
          void finalizeEpisode(prev);
          pendingEpisodeRef.current = {
            firstEventTime: t,
            lastEventTime: t,
            peakIntensity: event.intensity,
          };
        }
      }

      if (finalizeTimerRef.current != null) {
        window.clearTimeout(finalizeTimerRef.current);
      }

      finalizeTimerRef.current = window.setTimeout(() => {
        const ep = pendingEpisodeRef.current;
        if (ep) {
          pendingEpisodeRef.current = null;
          void finalizeEpisode(ep);
        }
      }, GROUP_GAP_SECONDS * 1000);
    },
    [finalizeEpisode]
  );

  const createTestClip = useCallback(async () => {
    const episodeId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    await EpisodeStore.upsertEpisodeSummary({
      id: episodeId,
      title: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      shardCount: 0,
      durationSeconds: 0,
    });

    const now = 0;
    const durationSeconds = (DEFAULT_PRE_CONTEXT_MS + DEFAULT_POST_CONTEXT_MS) / 1000;
    const dummyFeatures = {
      rms: 0.2,
      peak: 0.5,
      zcr: null,
      spectralCentroid: null,
      tempo: null,
      duration: durationSeconds,
      pitch: null,
    };

    const silent = new Float32Array(Math.floor(SAMPLE_RATE * durationSeconds));
    const audioBlob = createWavBlobFromFloat32(silent, SAMPLE_RATE);

    const shard: EmoShard = {
      ...EmoShardBuilder.build('mic', now, now + durationSeconds, dummyFeatures, {
        audioBlob,
        audioSampleRate: SAMPLE_RATE,
      }),
      episodeId,
    };
    await EmoShardStore.save(shard);
    await EpisodeStore.recordShard(episodeId, shard);

    setRecentClips((prev) => [shard, ...prev].slice(0, MAX_RECENT));
    setEventCount((prev) => prev + 1);
    alert('Se creó un clip de prueba. Revisa /clips.');
  }, []);

  useEffect(() => {
    audioManagerRef.current = new AudioInputManager();
    bufferRef.current = new AudioBufferRing(SAMPLE_RATE, BUFFER_SECONDS);
    extractorRef.current = new FeatureExtractor(SAMPLE_RATE);
    detectorRef.current = new EmotionDetector(handleEmotionEvent, undefined, (info) => {
      setDebugInfo(info);
    });

    EmoShardStore.getAll()
      .then((all) => {
        const sorted = [...all].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setRecentClips(sorted.slice(0, MAX_RECENT));
      })
      .catch((e) => {
        console.error('Error cargando clips:', e);
      });

    return () => {
      audioManagerRef.current?.stop();

      if (finalizeTimerRef.current != null) {
        window.clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }

      const ep = pendingEpisodeRef.current;
      if (ep) {
        pendingEpisodeRef.current = null;
        void finalizeEpisode(ep);
      }
    };
  }, [finalizeEpisode, handleEmotionEvent]);

  const handleChunk = useCallback((samples: Float32Array, timeSeconds: number) => {
    const buffer = bufferRef.current;
    const extractor = extractorRef.current;
    const detector = detectorRef.current;
    if (!buffer || !extractor || !detector) return;

    buffer.push(samples);

    const features = extractor.extract(samples);
    if (!features) return;

    setRms(features.rms);
    detector.processChunk(features, timeSeconds);
  }, []);

  const toggleListening = useCallback(async () => {
    const manager = audioManagerRef.current;
    if (!manager) return;

    try {
      if (manager.isRecording) {
        const ep = pendingEpisodeRef.current;
        if (ep) {
          pendingEpisodeRef.current = null;
          void finalizeEpisode(ep);
        }

        manager.stop();
        setIsListening(false);
        setRms(0);
      } else {
        const episodeId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        setCurrentEpisodeId(episodeId);
        setCurrentEpisodeCreatedAt(nowIso);
        await ensureEvaDb();
        await EpisodeStore.upsertEpisodeSummary({
          id: episodeId,
          title: null,
          createdAt: nowIso,
          updatedAt: nowIso,
          shardCount: 0,
          durationSeconds: 0,
        });

        await manager.start((samples, timeSeconds) => handleChunk(samples, timeSeconds));
        setIsListening(true);
      }
    } catch (error) {
      console.error('Error al iniciar escucha:', error);

      const err = error as unknown as { name?: string; message?: string; stack?: string };
      const message = err?.message ?? '';
      const stack = err?.stack ?? '';

      const isIndexedDbIssue =
        message.includes('IDBDatabase') ||
        message.includes('object stores was not found') ||
        message.includes('object store') ||
        stack.includes('EpisodeStore') ||
        stack.includes('EmoShardStore') ||
        stack.includes('idb-keyval');

      const isMicIssue =
        err?.name === 'NotAllowedError' ||
        err?.name === 'NotFoundError' ||
        message.includes('getUserMedia') ||
        message.toLowerCase().includes('microphone');

      if (isIndexedDbIssue) {
        alert(
          'Hubo un problema con el almacenamiento local (IndexedDB). ' +
            'Prueba recargar la página. Si persiste, borra los datos del sitio ' +
            'en Configuración → Cookies y otros datos del sitio.'
        );
        return;
      }

      if (isMicIssue) {
        alert('No se pudo acceder al micrófono. Revisa permisos del navegador.');
        return;
      }

      alert(
        'No se pudo iniciar la escucha por un error inesperado. ' +
          'Revisa la consola para más detalles.'
      );
    }
  }, [finalizeEpisode, handleChunk]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            EVA · Escucha Emocional (MVP)
          </h1>
          <Link
            href="/episodes"
            className="inline-flex items-center text-xs rounded-full border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-900 w-fit"
          >
            Ver todos los episodios
          </Link>
          <p className="text-sm text-slate-400">
            Este MVP muestra el nivel de audio del micrófono en tiempo real.
            Cuando esto funcione bien, conectaremos análisis emocional y clips.
          </p>
          {currentEpisodeCreatedAt && (
            <p className="text-xs text-slate-400">
              Episodio actual: {new Date(currentEpisodeCreatedAt).toLocaleString('es-MX')}
            </p>
          )}
        </header>

        <EVAStatusCard />

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <MyRoleCard />
          <ProgressCard />
        </div>

        <InvitationsPanel />

        <div className="flex flex-col items-center gap-4">
          <LiveLevelMeter rms={rms} isActive={isListening} />

          <button
            type="button"
            onClick={toggleListening}
            className={`w-48 h-12 rounded-full font-semibold transition ${
              isListening
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isListening ? 'Detener escucha' : 'Iniciar escucha'}
          </button>

          <p className="text-xs text-slate-500 text-center">
            {isListening
              ? 'Habla cerca del micrófono y observa cómo cambia el círculo.'
              : 'Presiona el botón para que EVA empiece a escuchar.'}
          </p>

          <div className="w-full space-y-3 mt-4 text-xs text-slate-400">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-300">
                Depuración del detector
              </span>
              <button
                type="button"
                onClick={createTestClip}
                className="px-3 py-1 rounded-full bg-emerald-700 hover:bg-emerald-600 text-[11px] font-semibold text-slate-50"
              >
                Generar clip de prueba
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div>
                  Eventos detectados:{' '}
                  <span className="font-semibold">{eventCount}</span>
                </div>
                {debugInfo && (
                  <>
                    <div>RMS chunk: {debugInfo.rms.toFixed(4)}</div>
                    <div>RMS promedio: {debugInfo.avgRms.toFixed(4)}</div>
                  </>
                )}
              </div>
              <div>
                {debugInfo && (
                  <>
                    <div>Umbral: {debugInfo.threshold.toFixed(4)}</div>
                    <div>Factor delta: {debugInfo.deltaFactor.toFixed(2)}</div>
                    <div>
                      Condiciones:{' '}
                      {debugInfo.isAboveThreshold ? '↑umbral' : '—'} ·{' '}
                      {debugInfo.isAboveDelta ? '↑delta' : '—'}
                    </div>
                  </>
                )}
                {!debugInfo && (
                  <div>
                    Aún no hay datos de depuración (habla para alimentar el detector).
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Clips recientes</h2>
              <Link
                href="/clips"
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Ver todos
              </Link>
            </div>

            {recentClips.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no hay clips guardados. Cuando EVA detecte un pico de intensidad, aparecerá aquí.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentClips.map((clip) => (
                  <RecentClipRow
                    key={`${clip.id}-${clip.createdAt}`}
                    clip={clip}
                    onRetry={() => {
                      void (async () => {
                        const { updated } = await runShardAnalysis(clip);
                        if (!updated) return;
                        setRecentClips((prev) =>
                          prev.map((c) => (c.id === updated.id ? updated : c))
                        );
                      })();
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function RecentClipRow({
  clip,
  onRetry,
}: {
  clip: EmoShard;
  onRetry: () => void;
}) {
  const { state } = useShardAnalysisState(clip);

  return (
    <li className="border border-slate-800 rounded-lg p-3 flex items-center justify-between">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold">
            Intensidad: {(clip.intensity * 100).toFixed(1)}%
          </div>
          <AnalysisStatusBadge state={state} />
          {state === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Reintentar
            </button>
          )}
        </div>

        <div className="text-[11px] text-slate-400">
          Duración: {clip.features.duration.toFixed(2)} s ·{' '}
          {new Date(clip.createdAt).toLocaleString('es-MX')}
        </div>
        {clip.suggestedTags.length > 0 && (
          <div className="text-[11px] text-slate-400 truncate">
            Tags: {clip.suggestedTags.slice(0, 3).join(', ')}
          </div>
        )}
      </div>

      <Link
        href={`/clips/${clip.episodeId ?? clip.id}`}
        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
      >
        Ver episodio
      </Link>
    </li>
  );
}
