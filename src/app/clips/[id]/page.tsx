'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmoShardStore } from '@/lib/store/EmoShardStore';
import { EpisodeStore } from '@/lib/store/EpisodeStore';
import type {
  EmoShard,
  EmoShardStatus,
  EpisodeDetail,
  EmotionReading,
  ShardUserStatus,
} from '@/types/emotion';
import ShardDetailPanel from '@/components/emotion/ShardDetailPanel';
import { useShardAnalysisState } from '@/lib/state/useShardAnalysisState';
import AnalysisStatusBadge from '@/components/emotion/AnalysisStatusBadge';
import { runShardAnalysis } from '@/lib/analysis/runShardAnalysis';
import { getEpisodeClient } from '@/lib/api/EpisodeClient';
import { getEvaDataMode } from '@/lib/config/evaAnalysisConfig';

function getShardEmotionReading(shard: EmoShard): EmotionReading | undefined {
  const fromAnalysis = shard.analysis?.emotion as
    | {
        primary?: string;
        valence?: string;
        activation?: string;
        distribution?: Record<string, number>;
        headline?: string | null;
        explanation?: string | null;
      }
    | undefined;

  if (fromAnalysis?.primary) return fromAnalysis;

  const legacyPrimary = shard.primaryEmotion;
  const legacyValence = shard.valence;
  const legacyActivation = shard.arousal;
  const legacyDistribution: Record<string, number> | undefined = shard.emotionLabels?.length
    ? Object.fromEntries(shard.emotionLabels.map((e) => [e.label, e.score]))
    : undefined;

  const hasAnyLegacy =
    !!legacyPrimary || !!legacyValence || !!legacyActivation || !!legacyDistribution;
  if (!hasAnyLegacy) return undefined;

  return {
    primary: legacyPrimary ?? undefined,
    valence: legacyValence ?? undefined,
    activation: legacyActivation ?? undefined,
    distribution: legacyDistribution,
    headline: null,
    explanation: null,
  };
}

function formatTimeRangeSeconds(start: number, end: number): string {
  const toMmSs = (t: number) => {
    const total = Math.max(0, Math.floor(t));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  };
  return `${toMmSs(start)}–${toMmSs(end)}`;
}

function transcriptSnippet(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

export default function ClipDetailPage() {
  const params = useParams<{ id: string }>();
  const episodeId = params?.id;

  const dataMode = getEvaDataMode();
  const showWaveformMvp =
    process.env.NEXT_PUBLIC_SHOW_WAVEFORM_MVP === '1';

  const [episode, setEpisode] = useState<EpisodeDetail | null>(null);
  const [selectedShardId, setSelectedShardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [episodeTitle, setEpisodeTitle] = useState<string>('');
  const [episodeNote, setEpisodeNote] = useState<string>('');

  const [reviewStatus, setReviewStatus] = useState<ShardUserStatus>('draft');
  const [reviewTagsText, setReviewTagsText] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewTranscriptOverride, setReviewTranscriptOverride] = useState<string>('');

  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedShard =
    episode?.shards.find((s) => s.id === selectedShardId) ??
    (episode?.shards[0] ?? null);

  const { state: analysisState, errorMessage } = useShardAnalysisState(selectedShard);
  const hasSemanticAnalysis = Boolean(
    selectedShard?.analysisAt || selectedShard?.transcript || selectedShard?.primaryEmotion
  );

  const saveShardLocally = useCallback(async () => {
    if (!selectedShard) return null;

    const userTags = reviewTagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const nextUser = {
      status: reviewStatus,
      userTags,
      userNotes: reviewNotes.trim() ? reviewNotes.trim() : undefined,
      transcriptOverride: reviewTranscriptOverride.trim()
        ? reviewTranscriptOverride.trim()
        : undefined,
    };

    const updatedShard: EmoShard = {
      ...selectedShard,
      analysis: {
        ...(selectedShard.analysis ?? {}),
        user: nextUser,
      },
    };

    await EmoShardStore.update(updatedShard.id, updatedShard);

    setEpisode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shards: prev.shards.map((s) => (s.id === updatedShard.id ? updatedShard : s)),
      };
    });

    console.log('saveShardLocally: saved shard review fields', {
      shardId: updatedShard.id,
      status: nextUser.status,
      userTagsCount: nextUser.userTags.length,
      hasUserNotes: Boolean(nextUser.userNotes),
      hasTranscriptOverride: Boolean(nextUser.transcriptOverride),
    });

    return updatedShard;
  }, [reviewNotes, reviewStatus, reviewTagsText, reviewTranscriptOverride, selectedShard]);

  const handleAnalyzeNow = useCallback(async () => {
    if (!selectedShard) return;
    const { updated } = await runShardAnalysis(selectedShard);
    if (!updated) return;

    setEpisode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shards: prev.shards.map((s) => (s.id === updated.id ? updated : s)),
      };
    });
  }, [selectedShard]);

  useEffect(() => {
    if (!episodeId) return;
    let ignore = false;

    async function run() {
      setLoading(true);
      try {
        const data = await EpisodeStore.getEpisodeById(episodeId);
        const shards = await EmoShardStore.getByEpisodeId(episodeId);
        if (ignore) return;

        const nextEpisode = data ? { ...data, shards } : null;
        console.log('clips/[id] loaded from IndexedDB', {
          episodeId,
          found: Boolean(nextEpisode),
          shardCount: shards.length,
        });

        setEpisode(nextEpisode);
        const firstShard = nextEpisode?.shards[0] ?? null;
        setSelectedShardId(firstShard?.id ?? null);
        setEpisodeTitle(nextEpisode?.title ?? '');
        setEpisodeNote(nextEpisode?.note ?? '');

        if (firstShard) {
          const user = firstShard.analysis?.user;
          setReviewStatus(user?.status ?? 'draft');
          setReviewTagsText((user?.userTags ?? []).join(', '));
          setReviewNotes(user?.userNotes ?? '');
          setReviewTranscriptOverride(user?.transcriptOverride ?? '');
        }
      } finally {
        if (ignore) return;
        setLoading(false);
      }
    }

    void run();

    return () => {
      ignore = true;
    };
  }, [episodeId]);

  const selectShard = useCallback((shard: EmoShard) => {
    setSelectedShardId(shard.id);
    const user = shard.analysis?.user;
    setReviewStatus(user?.status ?? 'draft');
    setReviewTagsText((user?.userTags ?? []).join(', '));
    setReviewNotes(user?.userNotes ?? '');
    setReviewTranscriptOverride(user?.transcriptOverride ?? '');
  }, []);

  const handleStatusChange = useCallback((status: EmoShardStatus) => {
    if (!selectedShard) return;
    setEpisode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shards: prev.shards.map((s) =>
          s.id === selectedShard.id ? { ...s, status } : s
        ),
      };
    });
  }, [selectedShard]);

  const handleTagAdd = useCallback((tag: string) => {
    const t = tag.trim();
    if (!t) return;
    if (!selectedShard) return;
    setEpisode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shards: prev.shards.map((s) =>
          s.id === selectedShard.id
            ? { ...s, userTags: Array.from(new Set([...(s.userTags ?? []), t])) }
            : s
        ),
      };
    });
  }, [selectedShard]);

  const handleTagRemove = useCallback((tag: string) => {
    if (!selectedShard) return;
    setEpisode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shards: prev.shards.map((s) =>
          s.id === selectedShard.id
            ? { ...s, userTags: (s.userTags ?? []).filter((t) => t !== tag) }
            : s
        ),
      };
    });
  }, [selectedShard]);

  const handleChange = useCallback((updates: Partial<EmoShard>) => {
    if (!selectedShard) return;
    setEpisode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shards: prev.shards.map((s) =>
          s.id === selectedShard.id ? { ...s, ...updates } : s
        ),
      };
    });
  }, [selectedShard]);

  const handleSave = useCallback(async () => {
    if (!episode) return;

    const title = episodeTitle.trim() ? episodeTitle.trim() : null;
    const note = episodeNote.trim() ? episodeNote.trim() : null;

    await EpisodeStore.upsertEpisodeSummary({
      id: episode.id,
      title,
      note,
      createdAt: episode.createdAt,
      updatedAt: new Date().toISOString(),
      shardCount: episode.stats?.shardCount ?? episode.shards.length,
      durationSeconds: episode.stats?.totalDurationSeconds ?? 0,
      dominantEmotion: null,
      momentTypes: [],
      tags: [],
    });

    setEpisode((prev) => (prev ? { ...prev, title, note } : prev));
    console.log('Saved episode summary locally', { episodeId: episode.id, title, hasNote: Boolean(note) });
    alert('Cambios del episodio guardados.');
  }, [episode, episodeNote, episodeTitle]);

  const handleSaveShardReview = useCallback(async () => {
    if (!selectedShard) return;
    if (selectedShard.deleted) return;

    await saveShardLocally();
    alert('Cambios del shard guardados.');
  }, [saveShardLocally, selectedShard]);

  const openDeleteForShard = useCallback(
    (shard: EmoShard) => {
      setSelectedShardId(shard.id);
      setShowDeletePanel(true);
      setDeleteReason('');
      setDeleteError(null);
      setPublishError(null);
    },
    []
  );

  const parseUserTags = useCallback(() => {
    return reviewTagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }, [reviewTagsText]);

  const handlePublishShard = useCallback(async () => {
    if (!selectedShard) return;

    setPublishError(null);
    setDeleteError(null);
    setShowDeletePanel(false);

    if (dataMode !== 'api') {
      setPublishError('Solo disponible cuando EVA 2 está conectado.');
      return;
    }

    if (selectedShard.deleted) {
      setPublishError('Este shard está eliminado.');
      return;
    }

    const tags = parseUserTags();
    const notes = reviewNotes.trim();

    if (reviewStatus !== 'reviewed' && reviewStatus !== 'readyToPublish') {
      setPublishError('Antes de publicar, cambia el status a reviewed o readyToPublish.');
      return;
    }

    if (tags.length < 1) {
      setPublishError('Antes de publicar, agrega al menos 1 tag en userTags.');
      return;
    }

    if (!notes) {
      setPublishError('Antes de publicar, escribe userNotes (no puede estar vacío).');
      return;
    }

    // Always persist last edits locally first.
    await saveShardLocally();

    setPublishing(true);
    try {
      const client = getEpisodeClient();
      const updated = await client.publishShard(selectedShard.id);

      if (!updated) {
        setPublishError(
          'No pude publicar el shard. EVA 2 todavía no tiene este endpoint (404). Tus cambios locales sí se guardaron.'
        );
        return;
      }

      await EmoShardStore.update(updated.id, updated);
      setEpisode((prev) => {
        if (!prev) return prev;
        return { ...prev, shards: prev.shards.map((s) => (s.id === updated.id ? updated : s)) };
      });
    } catch (err) {
      const message = String((err as Error | undefined)?.message ?? '');
      if (message.includes('http_404')) {
        setPublishError(
          'No pude publicar el shard. EVA 2 todavía no tiene este endpoint (404). Tus cambios locales sí se guardaron.'
        );
      } else {
        setPublishError('No pude publicar el shard. Revisa la conexión con EVA 2 e intenta de nuevo.');
      }
    } finally {
      setPublishing(false);
    }
  }, [dataMode, parseUserTags, reviewNotes, reviewStatus, saveShardLocally, selectedShard]);

  const handleConfirmDeleteShard = useCallback(async () => {
    if (!selectedShard) return;

    setDeleteError(null);
    setPublishError(null);

    if (dataMode !== 'api') {
      setDeleteError('Solo disponible cuando EVA 2 está conectado.');
      return;
    }

    if (selectedShard.deleted) {
      setDeleteError('Este shard ya está eliminado.');
      return;
    }

    const reason = deleteReason.trim();
    if (!reason) {
      setDeleteError('Explica por qué quieres eliminar este shard (obligatorio).');
      return;
    }

    setDeleting(true);
    try {
      const client = getEpisodeClient();
      const updated = await client.deleteShard(selectedShard.id, reason);

      if (!updated) {
        setDeleteError(
          'No pude eliminar el shard. EVA 2 todavía no tiene este endpoint (404). Tus cambios locales sí se guardaron.'
        );
        return;
      }

      await EmoShardStore.update(updated.id, updated);
      setEpisode((prev) => {
        if (!prev) return prev;
        return { ...prev, shards: prev.shards.map((s) => (s.id === updated.id ? updated : s)) };
      });
      setShowDeletePanel(false);
      setDeleteReason('');
    } catch (err) {
      const message = String((err as Error | undefined)?.message ?? '');
      if (message.includes('http_404')) {
        setDeleteError(
          'No pude eliminar el shard. EVA 2 todavía no tiene este endpoint (404). Tus cambios locales sí se guardaron.'
        );
      } else {
        setDeleteError('No pude eliminar el shard. Revisa la conexión con EVA 2 e intenta de nuevo.');
      }
    } finally {
      setDeleting(false);
    }
  }, [dataMode, deleteReason, selectedShard]);

  const shardsForList = useMemo(() => {
    const shards = episode?.shards ?? [];
    return [...shards].sort((a, b) => a.startTime - b.startTime);
  }, [episode?.shards]);

  if (!episodeId) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        ID de clip no proporcionado.
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        Cargando…
      </main>
    );
  }

  if (!episode || !selectedShard) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-sm text-red-400">Episodio no encontrado.</p>
          <Link
            href="/clips"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Volver a la lista
          </Link>
        </div>
      </main>
    );
  }

  const fallbackTitle = `Episodio del ${new Date(episode.createdAt).toLocaleString('es-MX')}`;
  const title = episodeTitle.trim() ? episodeTitle.trim() : fallbackTitle;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{title}</h1>
              <AnalysisStatusBadge state={analysisState} />
            </div>
            <Link
              href="/clips"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Volver
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-slate-400">Título</div>
              <input
                value={episodeTitle}
                onChange={(e) => {
                  const next = e.target.value;
                  setEpisodeTitle(next);
                  setEpisode((prev) => (prev ? { ...prev, title: next || null } : prev));
                }}
                className="w-full h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 text-sm text-slate-100"
                placeholder={fallbackTitle}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400">Nota (opcional)</div>
              <input
                value={episodeNote}
                onChange={(e) => {
                  const next = e.target.value;
                  setEpisodeNote(next);
                  setEpisode((prev) => (prev ? { ...prev, note: next || null } : prev));
                }}
                className="w-full h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 text-sm text-slate-100"
                placeholder="Nota del episodio"
              />
            </div>
          </div>

          <p className="text-xs text-slate-400">ID: {episode.id}</p>
          {episode.stats && (
            <div className="text-xs text-slate-400">
              Shards: {episode.stats.shardCount} · Duración total: {episode.stats.totalDurationSeconds.toFixed(1)} s · Crisis: {episode.stats.crisisCount} · Follow-up: {episode.stats.followupCount}
            </div>
          )}
        </header>

        {showWaveformMvp && (
          <section className="border border-slate-800 rounded-xl p-4">
            <div className="h-24 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-xs text-slate-500">
              Waveform aquí (MVP)
            </div>
          </section>
        )}

        <div className="border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Análisis semántico</h2>
            <AnalysisStatusBadge state={analysisState} />
          </div>

          {hasSemanticAnalysis ? (
            <div className="text-xs text-slate-400 space-y-1">
              {selectedShard.analysisAt && (
                <div>
                  Analizado el: {new Date(selectedShard.analysisAt).toLocaleString('es-MX')}
                </div>
              )}
              {selectedShard.analysisVersion && (
                <div>Versión de análisis: {selectedShard.analysisVersion}</div>
              )}
            </div>
          ) : analysisState === 'analyzing' ? (
            <div className="text-sm text-slate-300">Analizando este momento…</div>
          ) : analysisState === 'error' ? (
            <div className="space-y-2">
              <p className="text-sm text-red-300">
                No se pudo analizar este shard (backend apagado o error de red).
              </p>
              {errorMessage && (
                <p className="text-xs text-slate-400">{errorMessage}</p>
              )}
              <button
                type="button"
                onClick={handleAnalyzeNow}
                className="h-9 px-4 rounded-full bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold"
              >
                Reintentar análisis
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAnalyzeNow}
              className="w-full h-10 rounded-full bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold"
            >
              Analizar este momento
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Shards</h2>
            <ul className="space-y-3">
              {shardsForList.map((s) => {
                const emotion = getShardEmotionReading(s);
                const userStatus = s.analysis?.user?.status;
                const transcript = s.analysis?.user?.transcriptOverride ?? s.transcript;
                const isDeleted = Boolean(s.deleted);
                const isPublished = s.publishState === 'published';

                return (
                  <li
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectShard(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectShard(s);
                      }
                    }}
                    className={`w-full text-left rounded-lg border border-slate-800 bg-slate-900/40 p-3 transition hover:border-slate-700 cursor-pointer ${
                      s.id === selectedShard.id ? 'ring-2 ring-emerald-600/50' : ''
                    } ${isDeleted ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-200">
                        {formatTimeRangeSeconds(s.startTime, s.endTime)}
                      </div>
                      <div className="flex items-center gap-2">
                        {isPublished ? (
                          <div className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-800 bg-emerald-900/40 text-emerald-200">
                            Publicado
                          </div>
                        ) : null}
                        {isDeleted ? (
                          <div className="text-[10px] px-2 py-0.5 rounded-full border border-red-800 bg-red-900/40 text-red-200">
                            Eliminado
                          </div>
                        ) : null}
                        {userStatus ? (
                          <div className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700 text-slate-300">
                            {userStatus}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteForShard(s);
                          }}
                          disabled={dataMode !== 'api' || isDeleted}
                          className={`text-[10px] font-semibold ${
                            dataMode !== 'api' || isDeleted
                              ? 'text-slate-500 cursor-not-allowed'
                              : 'text-red-300 hover:text-red-200'
                          }`}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-300">
                      {emotion?.primary ? (
                        <span>
                          <span className="font-semibold">{emotion.primary}</span>
                          {emotion.valence ? ` · ${emotion.valence}` : ''}
                          {emotion.activation ? ` · ${emotion.activation}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500">Sin lectura emocional</span>
                      )}
                    </div>

                    {emotion?.headline ? (
                      <div className="mt-1 text-xs text-slate-400">
                        {emotion.headline}
                      </div>
                    ) : null}

                    {transcript ? (
                      <div className="mt-2 text-xs text-slate-400">
                        {transcriptSnippet(transcript, 18)}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="md:col-span-2 border border-slate-800 rounded-xl p-4">
            <ShardDetailPanel
              shard={selectedShard}
              onChange={handleChange}
              onTagAdd={handleTagAdd}
              onTagRemove={handleTagRemove}
              onStatusChange={handleStatusChange}
            />

            <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold">Revisión (editor interno)</h2>

              <div className="flex items-center gap-2">
                {selectedShard.publishState === 'published' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-emerald-900/40 text-emerald-200 border-emerald-800">
                    Publicado
                  </span>
                ) : null}
                {selectedShard.deleted ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-red-900/40 text-red-200 border-red-800">
                    Eliminado
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-slate-400">Status</div>
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value as ShardUserStatus)}
                    className="w-full h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 text-sm text-slate-100"
                  >
                    <option value="draft">draft</option>
                    <option value="reviewed">reviewed</option>
                    <option value="readyToPublish">readyToPublish</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-400">userTags (separadas por coma)</div>
                  <input
                    value={reviewTagsText}
                    onChange={(e) => setReviewTagsText(e.target.value)}
                    className="w-full h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 text-sm text-slate-100"
                    placeholder="ej. crisis, trabajo, sueño"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">userNotes</div>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full min-h-[90px] rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-100"
                  placeholder="Notas internas para revisión"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">transcriptOverride</div>
                <textarea
                  value={reviewTranscriptOverride}
                  onChange={(e) => setReviewTranscriptOverride(e.target.value)}
                  className="w-full min-h-[90px] rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-100"
                  placeholder="Corrección de transcripción (opcional)"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveShardReview}
                disabled={Boolean(selectedShard.deleted)}
                className={`w-full h-10 rounded-full text-sm font-semibold ${
                  selectedShard.deleted
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-sky-700 hover:bg-sky-600'
                }`}
              >
                Guardar cambios del shard
              </button>

              <button
                type="button"
                onClick={handlePublishShard}
                disabled={dataMode !== 'api' || publishing || Boolean(selectedShard.deleted)}
                className={`w-full h-10 rounded-full text-sm font-semibold ${
                  selectedShard.deleted
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : dataMode !== 'api'
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : publishing
                      ? 'bg-emerald-800 text-emerald-100 cursor-wait'
                      : 'bg-emerald-700 hover:bg-emerald-600'
                }`}
              >
                {publishing ? 'Publicando…' : 'Publicar Emo-Shard'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDeletePanel((v) => !v);
                  setDeleteError(null);
                  setPublishError(null);
                }}
                disabled={dataMode !== 'api' || deleting || Boolean(selectedShard.deleted)}
                className={`w-full h-10 rounded-full text-sm font-semibold border ${
                  selectedShard.deleted
                    ? 'border-slate-800 text-slate-500 cursor-not-allowed'
                    : dataMode !== 'api'
                      ? 'border-slate-800 text-slate-500 cursor-not-allowed'
                      : 'border-red-700 text-red-200 hover:bg-red-950/30'
                }`}
              >
                Eliminar shard
              </button>

              {publishError ? (
                <div className="text-xs text-red-300">{publishError}</div>
              ) : null}
              {deleteError ? <div className="text-xs text-red-300">{deleteError}</div> : null}

              {showDeletePanel ? (
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/30 space-y-2">
                  <div className="text-xs text-slate-300 font-semibold">
                    Explica por qué quieres eliminar este shard
                  </div>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full min-h-[90px] rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-100"
                    placeholder="Razón (obligatoria)"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmDeleteShard}
                      disabled={deleting}
                      className={`h-9 px-4 rounded-full text-xs font-semibold ${
                        deleting
                          ? 'bg-red-900/60 text-red-100 cursor-wait'
                          : 'bg-red-700 hover:bg-red-600 text-slate-50'
                      }`}
                    >
                      {deleting ? 'Eliminando…' : 'Confirmar eliminación'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeletePanel(false);
                        setDeleteReason('');
                        setDeleteError(null);
                      }}
                      className="h-9 px-4 rounded-full bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="w-full h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
        >
          Guardar cambios del episodio
        </button>
      </div>
    </main>
  );
}
