'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmoShardStore } from '@/lib/store/EmoShardStore';
import type { EmoShard, EmoShardStatus, EpisodeDetail } from '@/types/emotion';
import ShardDetailPanel from '@/components/emotion/ShardDetailPanel';
import { useShardAnalysisState } from '@/lib/state/useShardAnalysisState';
import AnalysisStatusBadge from '@/components/emotion/AnalysisStatusBadge';
import { runShardAnalysis } from '@/lib/analysis/runShardAnalysis';
import ShardListItem from '@/components/emotion/ShardListItem';
import { getEpisodeClient } from '@/lib/api/EpisodeClient';
import { getEvaDataMode } from '@/lib/config/evaAnalysisConfig';

export default function ClipDetailPage() {
  const params = useParams<{ id: string }>();
  const episodeId = params?.id;

  const showWaveformMvp =
    process.env.NEXT_PUBLIC_SHOW_WAVEFORM_MVP === '1';

  const [episode, setEpisode] = useState<EpisodeDetail | null>(null);
  const [selectedShardId, setSelectedShardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [episodeTitle, setEpisodeTitle] = useState<string>('');
  const [episodeNote, setEpisodeNote] = useState<string>('');

  const selectedShard =
    episode?.shards.find((s) => s.id === selectedShardId) ??
    (episode?.shards[0] ?? null);

  const { state: analysisState, errorMessage } = useShardAnalysisState(selectedShard);
  const hasSemanticAnalysis = Boolean(
    selectedShard?.analysisAt || selectedShard?.transcript || selectedShard?.primaryEmotion
  );

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
    const client = getEpisodeClient();
    client.getEpisodeDetail(episodeId).then((data) => {
      setEpisode(data ?? null);
      setSelectedShardId(data?.shards[0]?.id ?? null);
      setEpisodeTitle(data?.title ?? '');
      setEpisodeNote(data?.note ?? '');
      setLoading(false);
    });
  }, [episodeId]);

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
    if (!selectedShard) return;

    const client = getEpisodeClient();
    if (episode && getEvaDataMode() === 'api') {
      await client.updateEpisodeMeta(episode.id, {
        title: episodeTitle.trim() ? episodeTitle.trim() : null,
        note: episodeNote.trim() ? episodeNote.trim() : null,
      });
    }

    if (getEvaDataMode() === 'api') {
      const updated = await client.updateShard(selectedShard.id, selectedShard);
      if (updated) {
        setEpisode((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shards: prev.shards.map((s) => (s.id === updated.id ? updated : s)),
          };
        });
      }
    }

    await EmoShardStore.update(selectedShard.id, selectedShard);
    alert('Cambios guardados.');
  }, [episode, episodeNote, episodeTitle, selectedShard]);

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
              {episode.shards.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSelectedShardId(s.id)}
                  className={`w-full text-left ${
                    s.id === selectedShard.id ? 'ring-2 ring-emerald-600/50 rounded-lg' : ''
                  }`}
                >
                  <ShardListItem shard={s} showLink={false} />
                </div>
              ))}
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
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="w-full h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
        >
          Guardar cambios
        </button>
      </div>
    </main>
  );
}
