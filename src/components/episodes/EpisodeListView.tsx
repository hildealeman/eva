'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EpisodeDetail, EpisodeSummary, ShardUserStatus } from '@/types/emotion';
import { EpisodeStore } from '@/lib/store/EpisodeStore';
import { EmoShardStore } from '@/lib/store/EmoShardStore';

type EpisodeReviewCounts = {
  draft: number;
  reviewed: number;
  readyToPublish: number;
};

type EpisodeRow = {
  summary: EpisodeSummary;
  reviewCounts: EpisodeReviewCounts;
};

function computeReviewCounts(detail: EpisodeDetail | null): EpisodeReviewCounts {
  const counts: EpisodeReviewCounts = { draft: 0, reviewed: 0, readyToPublish: 0 };
  const shards = detail?.shards ?? [];

  for (const s of shards) {
    const status = (s.analysis?.user?.status ?? 'draft') as ShardUserStatus;
    if (status === 'reviewed') counts.reviewed += 1;
    else if (status === 'readyToPublish') counts.readyToPublish += 1;
    else counts.draft += 1;
  }

  return counts;
}

export default function EpisodeListView() {
  const stores = useMemo(() => ({ EpisodeStore, EmoShardStore }), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);

  const fetchEpisodes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const all = await stores.EpisodeStore.getAllEpisodes();

      const details = await Promise.all(
        all.map(async (ep) => {
          try {
            const detail = await stores.EpisodeStore.getEpisodeById(ep.id);
            return { id: ep.id, detail };
          } catch {
            return { id: ep.id, detail: null };
          }
        })
      );

      const detailMap = new Map(details.map((d) => [d.id, d.detail]));

      setEpisodes(
        all.map((summary) => ({
          summary,
          reviewCounts: computeReviewCounts(detailMap.get(summary.id) ?? null),
        }))
      );
    } catch {
      setError(
        'No pude cargar la lista de episodios locales. Revisa IndexedDB o intenta de nuevo.'
      );
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  }, [stores]);

  useEffect(() => {
    async function run() {
      await fetchEpisodes();
    }

    void run();
  }, [fetchEpisodes]);

  const handleDeleteEpisode = useCallback(
    async (episodeId: string) => {
      const ok = window.confirm(
        '¿Seguro que quieres eliminar este episodio y todos sus shards locales?'
      );
      if (!ok) return;

      await stores.EmoShardStore.deleteByEpisodeId(episodeId);
      await stores.EpisodeStore.deleteEpisodeSummary(episodeId);
      setEpisodes((prev) => prev.filter((e) => e.summary.id !== episodeId));
    },
    [stores]
  );

  if (loading) {
    return <div className="text-sm text-slate-400">Cargando episodios...</div>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-300">{error}</div>
        <button
          type="button"
          onClick={fetchEpisodes}
          className="h-9 px-4 rounded-full bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Todavía no hay episodios. Graba algo desde la pantalla principal para crear el primero.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {episodes.map(({ summary, reviewCounts }) => {
          const title =
            summary.title ??
            `Episodio del ${new Date(summary.createdAt).toLocaleString('es-MX')}`;

          const note = summary.note ?? null;

          return (
            <div
              key={summary.id}
              className="border border-slate-800 rounded-xl p-4 bg-slate-950/30"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold truncate">{title}</div>
                  {note ? (
                    <div className="text-xs text-slate-400 line-clamp-2">{note}</div>
                  ) : null}

                  <div className="text-xs text-slate-400">
                    {summary.shardCount} shards
                  </div>
                  <div className="text-xs text-slate-400">
                    {reviewCounts.reviewed} revisados / {reviewCounts.readyToPublish} listos para publicar
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  <Link
                    href={`/clips/${summary.id}`}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Abrir
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteEpisode(summary.id)}
                    className="text-xs font-semibold text-red-300 hover:text-red-200"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
