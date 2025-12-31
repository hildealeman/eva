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
import MyFeedPanel from '@/components/feed/MyFeedPanel';
import { getEvaDataMode } from '@/lib/config/evaAnalysisConfig';
import { getUploadQueue } from '@/lib/state/uploadQueue';
import { curateEpisode } from '@/lib/api/curateEpisode';

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

type SessionMode = 'listen' | 'conversation' | 'present';
type SessionPhase = 'idle' | 'recording' | 'finalizing' | 'uploading' | 'curating';

type RecordingDurationMinutes = number | null;

const DURATION_OPTIONS: Array<{ label: string; minutes: RecordingDurationMinutes }> = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '20 min', minutes: 20 },
  { label: '30 min', minutes: 30 },
  { label: 'Sin límite', minutes: null },
];

export default function Home() {
  const dataMode = getEvaDataMode();
  const [mode, setMode] = useState<SessionMode>('listen');
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('idle');
  const [isListening, setIsListening] = useState(false);
  const [rms, setRms] = useState(0);
  const [recentClips, setRecentClips] = useState<EmoShard[]>([]);
  const [recentClipsLoaded, setRecentClipsLoaded] = useState(false);
  const [debugInfo, setDebugInfo] = useState<EmotionDebugInfo | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);
  const [currentEpisodeCreatedAt, setCurrentEpisodeCreatedAt] = useState<string | null>(null);

  const [uploadSnapshot, setUploadSnapshot] = useState(() => getUploadQueue().getSnapshot());
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [showRawShards, setShowRawShards] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [purgingEmptyEpisodes, setPurgingEmptyEpisodes] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resettingLocalData, setResettingLocalData] = useState(false);
  const [durationByMode, setDurationByMode] = useState<Record<SessionMode, RecordingDurationMinutes>>({
    listen: 10,
    conversation: 20,
    present: 30,
  });

  const audioManagerRef = useRef<AudioInputManager | null>(null);
  const bufferRef = useRef<AudioBufferRing | null>(null);
  const extractorRef = useRef<FeatureExtractor | null>(null);
  const detectorRef = useRef<EmotionDetector | null>(null);

  const pendingEpisodeRef = useRef<PendingEpisode | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);

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
      meta: { mode },
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
      if (dataMode === 'api') {
        getUploadQueue().enqueue({
          localShardId: shard.id,
          episodeId,
          audioBlob,
          startTime,
          endTime,
          meta: { mode },
        });
      }
    } catch (e) {
      console.error('Error guardando clip:', e);
    }
  }, [currentEpisodeId, dataMode, mode]);

  const finalizeEpisodeAndCurate = useCallback(
    async (episodeId: string) => {
      setSessionMessage(null);

      setSessionPhase('uploading');

      const queue = getUploadQueue();
      const { hadFailures } = await queue.waitForIdle();
      if (hadFailures) {
        setSessionMessage('Algunos momentos no se pudieron subir, pero EVA seguirá con lo que tiene.');
      }

      if (dataMode !== 'api') {
        setSessionPhase('idle');
        return;
      }

      setSessionPhase('curating');
      try {
        const res = await curateEpisode(episodeId, 5);
        if (!res.success) {
          if (res.status === 404 || res.status === 501) {
            setSessionMessage('Curación aún no disponible.');
            return;
          }
          setSessionMessage('No se pudo curar el episodio.');
          return;
        }

        const detail = res.data;
        if (!detail) return;

        try {
          const curated: EmoShard[] = [];
          for (const r of detail.shards ?? []) {
            const local = await EmoShardStore.get(r.id);
            const localMeta = (local as unknown as { meta?: Record<string, unknown> })?.meta;
            const remoteMeta = (r as unknown as { meta?: Record<string, unknown> })?.meta;
            const localAnalysis = (local as unknown as { analysis?: Record<string, unknown> })?.analysis;
            const remoteAnalysis = (r as unknown as { analysis?: Record<string, unknown> })?.analysis;

            const merged: EmoShard = {
              ...(local ?? ({} as EmoShard)),
              ...r,
              meta: { ...(localMeta ?? {}), ...(remoteMeta ?? {}) },
              analysis: { ...(localAnalysis ?? {}), ...(remoteAnalysis ?? {}) },
              audioBlob: local?.audioBlob,
              audioSampleRate: local?.audioSampleRate,
              audioDurationSeconds: local?.audioDurationSeconds,
              features: local?.features ?? r.features,
              suggestedTags: local?.suggestedTags ?? r.suggestedTags,
              episodeId,
            };

            await EmoShardStore.save(merged);
            curated.push(merged);
          }

          if (curated.length > 0) {
            await EpisodeStore.markCuratedShards(episodeId, curated);
            const sortedCurated = [...curated].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            setRecentClips(sortedCurated.slice(0, MAX_RECENT));
          }

          await EpisodeStore.refreshEpisodeComputedFields(episodeId);
        } catch (err) {
          console.error('[EVA1] Failed to sync curated episode locally', err);
        }
      } finally {
        setSessionPhase('idle');
      }
    },
    [dataMode]
  );

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

  const stopSession = useCallback(async () => {
    const manager = audioManagerRef.current;
    if (!manager) return;

    if (recordingTimeoutRef.current != null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (finalizeTimerRef.current != null) {
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }

    const episodeId = currentEpisodeId;
    setSessionPhase('finalizing');

    // Stop mic immediately (no awaits).
    manager.stop();
    setIsListening(false);
    setRms(0);

    const ep = pendingEpisodeRef.current;
    if (ep) {
      pendingEpisodeRef.current = null;
      await finalizeEpisode(ep);
    }

    if (episodeId) {
      void finalizeEpisodeAndCurate(episodeId);
    } else {
      setSessionPhase('idle');
    }
  }, [currentEpisodeId, finalizeEpisode, finalizeEpisodeAndCurate]);

  const startSession = useCallback(async () => {
    const manager = audioManagerRef.current;
    if (!manager) return;

    const isCriticalPhase =
      sessionPhase === 'finalizing' || sessionPhase === 'uploading' || sessionPhase === 'curating';
    if (isCriticalPhase) {
      alert('Espera a que EVA termine de subir/curar antes de iniciar una nueva sesión.');
      return;
    }

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
    setSessionPhase('recording');
  }, [handleChunk, sessionPhase]);

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
      meta: { mode },
    };
    await EmoShardStore.save(shard);
    await EpisodeStore.recordShard(episodeId, shard);

    setRecentClips((prev) => [shard, ...prev].slice(0, MAX_RECENT));
    setEventCount((prev) => prev + 1);
    alert('Se creó un clip de prueba. Revisa /clips.');
  }, [mode]);

  useEffect(() => {
    audioManagerRef.current = new AudioInputManager();
    bufferRef.current = new AudioBufferRing(SAMPLE_RATE, BUFFER_SECONDS);
    extractorRef.current = new FeatureExtractor(SAMPLE_RATE);
    detectorRef.current = new EmotionDetector(handleEmotionEvent, undefined, (info) => {
      setDebugInfo(info);
    });

    const queue = getUploadQueue();
    queue.configure({
      onUploaded: async ({ localShardId, remoteShard, episodeId }) => {
        try {
          const existing = await EmoShardStore.get(localShardId);
          const existingMeta = (existing as unknown as { meta?: Record<string, unknown> })?.meta;
          const remoteMeta = (remoteShard as unknown as { meta?: Record<string, unknown> })?.meta;
          const migrated: EmoShard = {
            ...(existing ?? ({} as EmoShard)),
            ...remoteShard,
            id: remoteShard.id,
            episodeId,
            meta: { ...(existingMeta ?? {}), ...(remoteMeta ?? {}) },
            audioBlob: existing?.audioBlob,
            audioSampleRate: existing?.audioSampleRate,
            audioDurationSeconds: existing?.audioDurationSeconds,
            features: existing?.features ?? remoteShard.features,
            suggestedTags: existing?.suggestedTags ?? remoteShard.suggestedTags,
          };

          await EmoShardStore.save(migrated);
          if (remoteShard.id !== localShardId) {
            await EmoShardStore.delete(localShardId);
          }
          await EpisodeStore.refreshEpisodeComputedFields(episodeId);

          setRecentClips((prev) => prev.map((c) => (c.id === localShardId ? migrated : c)));
        } catch (err) {
          console.error('[EVA1] Failed to migrate local shard after upload', err);
        }
      },
    });

    const unsubscribe = queue.subscribe(() => {
      setUploadSnapshot(queue.getSnapshot());
    });

    EmoShardStore.getAll()
      .then((all) => {
        void (async () => {
          const episodes = await EpisodeStore.getAllEpisodes();
          const curatedIds = new Set<string>();
          for (const e of episodes) {
            for (const id of e.curatedShardIds ?? []) curatedIds.add(id);
          }

          const filtered = showRawShards
            ? all
            : all.filter((s) => curatedIds.size > 0 && curatedIds.has(s.id));

          const sorted = [...filtered].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setRecentClips(sorted.slice(0, MAX_RECENT));
          setRecentClipsLoaded(true);
        })();
      })
      .catch((e) => {
        console.error('Error cargando clips:', e);
        setRecentClipsLoaded(true);
      });

    return () => {
      unsubscribe();
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
  }, [finalizeEpisode, handleEmotionEvent, showRawShards]);

  useEffect(() => {
    if (recordingTimeoutRef.current != null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (sessionPhase !== 'recording') return;

    const minutes = durationByMode[mode];
    if (minutes == null) return;

    recordingTimeoutRef.current = window.setTimeout(() => {
      void stopSession();
    }, minutes * 60 * 1000);

    return () => {
      if (recordingTimeoutRef.current != null) {
        window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
    };
  }, [durationByMode, mode, sessionPhase, stopSession]);

  const toggleListening = useCallback(async () => {
    try {
      if (sessionPhase === 'recording') {
        await stopSession();
      } else {
        await startSession();
      }
    } catch (error) {
      console.error('Error al iniciar escucha:', error);
      setIsListening(false);
      setRms(0);
      setSessionPhase('idle');

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
        alert('EVA no pudo acceder al micrófono (permiso denegado o dispositivo no disponible).');
        return;
      }

      alert(
        'No se pudo iniciar la escucha por un error inesperado. ' +
          'Revisa la consola para más detalles.'
      );
    }
  }, [sessionPhase, startSession, stopSession]);

  const handlePurgeEmptyEpisodesLocal = useCallback(async () => {
    setMaintenanceMessage(null);
    setPurgingEmptyEpisodes(true);
    try {
      const episodes = await EpisodeStore.getAllEpisodes();
      const empty = episodes.filter((e) => (e.shardCount ?? 0) === 0);

      if (empty.length === 0) {
        setMaintenanceMessage('No se encontraron episodios vacíos.');
        return;
      }

      for (const ep of empty) {
        try {
          await EmoShardStore.deleteByEpisodeId(ep.id);
        } catch (err) {
          console.error('[EVA1] purge empty episode failed to delete shards', { episodeId: ep.id, err });
        }
        try {
          await EpisodeStore.deleteEpisodeSummary(ep.id);
        } catch (err) {
          console.error('[EVA1] purge empty episode failed to delete summary', { episodeId: ep.id, err });
        }
      }

      setMaintenanceMessage(`Se limpiaron ${empty.length} episodios vacíos.`);

      const all = await EmoShardStore.getAll();
      const episodesAfter = await EpisodeStore.getAllEpisodes();
      const curatedIds = new Set<string>();
      for (const e of episodesAfter) {
        for (const id of e.curatedShardIds ?? []) curatedIds.add(id);
      }

      const filtered = showRawShards
        ? all
        : all.filter((s) => curatedIds.size > 0 && curatedIds.has(s.id));

      const sorted = [...filtered].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRecentClips(sorted.slice(0, MAX_RECENT));
      setRecentClipsLoaded(true);
    } finally {
      setPurgingEmptyEpisodes(false);
    }
  }, [showRawShards]);

  const handleNuclearResetLocal = useCallback(async () => {
    const ok = window.confirm(
      'Esto borrará TODOS los clips, audio y episodios guardados en este navegador. ' +
        'No afectará los datos en EVA 2, pero perderás la reproducción local. ¿Seguro que quieres continuar?'
    );
    if (!ok) return;

    setResetMessage(null);
    setResettingLocalData(true);
    try {
      try {
        audioManagerRef.current?.stop();
      } catch {}

      await Promise.all([EmoShardStore.clear(), EpisodeStore.clear()]);

      setIsListening(false);
      setRms(0);
      setSessionPhase('idle');
      setEventCount(0);
      setDebugInfo(null);
      setRecentClips([]);
      setRecentClipsLoaded(true);
      setCurrentEpisodeId(null);
      setCurrentEpisodeCreatedAt(null);
      pendingEpisodeRef.current = null;

      if (finalizeTimerRef.current != null) {
        window.clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      if (recordingTimeoutRef.current != null) {
        window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      setResetMessage('Datos locales borrados. Reiniciando…');
      window.location.reload();
    } finally {
      setResettingLocalData(false);
    }
  }, []);

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

        <MyFeedPanel dataMode={dataMode} />

        <div className="flex flex-col items-center gap-4">
          <LiveLevelMeter rms={rms} isActive={isListening} />

          <div className="w-full flex items-center justify-center">
            <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/30 p-1">
              <button
                type="button"
                disabled={sessionPhase !== 'idle'}
                onClick={() => setMode('listen')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  mode === 'listen'
                    ? 'bg-slate-200 text-slate-950'
                    : 'text-slate-200 hover:bg-slate-900'
                } ${sessionPhase !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Listen
              </button>
              <button
                type="button"
                disabled={sessionPhase !== 'idle'}
                onClick={() => setMode('conversation')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  mode === 'conversation'
                    ? 'bg-slate-200 text-slate-950'
                    : 'text-slate-200 hover:bg-slate-900'
                } ${sessionPhase !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Conversation
              </button>
              <button
                type="button"
                disabled={sessionPhase !== 'idle'}
                onClick={() => setMode('present')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  mode === 'present'
                    ? 'bg-slate-200 text-slate-950'
                    : 'text-slate-200 hover:bg-slate-900'
                } ${sessionPhase !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Present
              </button>
            </div>
          </div>

          <div className="w-full flex items-center justify-center">
            <select
              value={String(durationByMode[mode] ?? 'unlimited')}
              disabled={sessionPhase !== 'idle'}
              onChange={(e) => {
                const raw = e.target.value;
                const minutes = raw === 'unlimited' ? null : Number(raw);
                setDurationByMode((prev) => ({ ...prev, [mode]: Number.isFinite(minutes) ? minutes : null }));
              }}
              className={`h-9 rounded-lg bg-slate-900 border border-slate-800 px-3 text-xs text-slate-100 ${
                sessionPhase !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.minutes == null ? 'unlimited' : String(opt.minutes)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={toggleListening}
            disabled={sessionPhase !== 'idle' && sessionPhase !== 'recording'}
            className={`w-48 h-12 rounded-full font-semibold transition ${
              isListening
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isListening ? 'Detener escucha' : 'Iniciar escucha'}
          </button>

          {(sessionPhase !== 'idle' || uploadSnapshot.failedCount > 0 || sessionMessage) && (
            <div className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
              {sessionPhase === 'recording' ? <div>Grabando… (modo {mode})</div> : null}
              {sessionPhase === 'finalizing' ? <div>Cerrando sesión…</div> : null}
              {sessionPhase === 'uploading' ? (
                <div>
                  Subiendo momentos… ({uploadSnapshot.pendingCount}/{uploadSnapshot.inFlightCount})
                </div>
              ) : null}
              {sessionPhase === 'curating' ? <div>Curando momentos…</div> : null}
              {uploadSnapshot.failedCount > 0 ? (
                <div>Algunos momentos no se pudieron guardar.</div>
              ) : null}
              {sessionMessage ? <div>{sessionMessage}</div> : null}
            </div>
          )}

          <p className="text-xs text-slate-500 text-center">Modo: {mode}</p>

          <label className="text-xs text-slate-500 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showRawShards}
              onChange={(e) => setShowRawShards(e.target.checked)}
              disabled={sessionPhase !== 'idle'}
              className="accent-emerald-600"
            />
            Mostrar shards crudos (debug)
          </label>

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

          <div className="w-full pt-4 border-t border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-300">Mantenimiento</div>
            <button
              type="button"
              onClick={handlePurgeEmptyEpisodesLocal}
              disabled={purgingEmptyEpisodes || sessionPhase !== 'idle'}
              className={`w-full h-10 rounded-full text-xs font-semibold ${
                purgingEmptyEpisodes || sessionPhase !== 'idle'
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
              }`}
            >
              {purgingEmptyEpisodes
                ? 'Limpiando episodios vacíos…'
                : 'Limpiar episodios vacíos (solo local)'}
            </button>
            <p className="text-[11px] text-slate-500">
              Borra de este navegador los episodios que no tienen momentos guardados (0 shards). No afecta al backend EVA 2.
            </p>
            {maintenanceMessage ? (
              <p className="text-[11px] text-slate-300">{maintenanceMessage}</p>
            ) : null}
          </div>

          <div className="w-full pt-4 border-t border-red-900/60 space-y-2">
            <div className="text-xs font-semibold text-red-300">Zona de peligro (solo datos locales)</div>
            <button
              type="button"
              onClick={handleNuclearResetLocal}
              disabled={resettingLocalData || sessionPhase !== 'idle'}
              className={`w-full h-10 rounded-full text-xs font-semibold ${
                resettingLocalData || sessionPhase !== 'idle'
                  ? 'bg-red-950/40 text-red-300/50 cursor-not-allowed border border-red-900/50'
                  : 'bg-red-900/40 hover:bg-red-900/60 text-red-200 border border-red-800'
              }`}
            >
              {resettingLocalData
                ? 'Reiniciando…'
                : 'Reiniciar EVA en este navegador (borrar datos locales)'}
            </button>
            <p className="text-[11px] text-slate-500">
              Esto borra episodios, shards y audio de este navegador. No afecta a EVA 2.
            </p>
            {resetMessage ? (
              <p className="text-[11px] text-slate-300">{resetMessage}</p>
            ) : null}
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

            {recentClipsLoaded && recentClips.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5 text-center space-y-2">
                <div className="text-sm font-semibold text-slate-100">Aún no hay clips</div>
                <div className="text-xs text-slate-400">
                  Cuando EVA termine una sesión de escucha, aquí aparecerán tus momentos emocionales más importantes.
                </div>
                <div className="text-xs text-slate-400">
                  Elige un modo (Listen, Conversation o Present) y pulsa{' '}
                  <span className="font-semibold text-slate-200">Iniciar escucha</span> para crear tu primer episodio.
                </div>
              </div>
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

  const rawDuration =
    typeof clip.features?.duration === 'number' && Number.isFinite(clip.features.duration)
      ? clip.features.duration
      : typeof (clip as unknown as { meta?: { startTime?: unknown; endTime?: unknown } })?.meta
            ?.startTime === 'number' &&
          typeof (clip as unknown as { meta?: { startTime?: unknown; endTime?: unknown } })?.meta
            ?.endTime === 'number'
        ? Math.max(
            0,
            ((clip as unknown as { meta: { endTime: number; startTime: number } }).meta.endTime as number) -
              ((clip as unknown as { meta: { endTime: number; startTime: number } }).meta.startTime as number)
          )
        : null;

  const safeSuggestedTags = Array.isArray(clip.suggestedTags) ? clip.suggestedTags : [];

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
          {rawDuration != null ? (
            <>
              Duración: {rawDuration.toFixed(2)} s ·{' '}
              {new Date(clip.createdAt).toLocaleString('es-MX')}
            </>
          ) : (
            <>
              Duración: -- s · {new Date(clip.createdAt).toLocaleString('es-MX')}
            </>
          )}
        </div>
        {safeSuggestedTags.length > 0 && (
          <div className="text-[11px] text-slate-400 truncate">
            Tags: {safeSuggestedTags.slice(0, 3).join(', ')}
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
