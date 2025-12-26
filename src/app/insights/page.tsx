'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EpisodeInsights } from '@/types/insights';
import { getEpisodeInsights } from '@/lib/api/InsightsClient';

export default function InsightsPage() {
  const [insights, setInsights] = useState<EpisodeInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEpisodeInsights()
      .then((data) => setInsights(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-slate-400">Cargando insights de EVA…</p>
        </div>
      </main>
    );
  }

  if (!insights) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <p className="text-sm text-red-400">No se pudieron cargar los insights.</p>
          <Link
            href="/"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Volver a EVA
          </Link>
        </div>
      </main>
    );
  }

  const minutes =
    insights.totalDurationSeconds != null
      ? (insights.totalDurationSeconds / 60).toFixed(1)
      : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Insights de EVA</h1>
            <p className="text-sm text-slate-400">
              Resumen agregado de episodios, shards, emociones y tags.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Volver a EVA
            </Link>
            <Link
              href="/clips"
              className="text-xs font-semibold text-slate-300 hover:text-slate-100"
            >
              Ver episodios
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">Episodios</div>
            <div className="text-2xl font-semibold">{insights.totalEpisodes}</div>
          </div>
          <div className="border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">Shards</div>
            <div className="text-2xl font-semibold">{insights.totalShards}</div>
          </div>
          <div className="border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">Duración total</div>
            <div className="text-2xl font-semibold">
              {minutes != null ? `${minutes} min` : '—'}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-2">Top tags</h2>
            {insights.tags.length === 0 ? (
              <p className="text-xs text-slate-500">Aún no hay tags.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-300">
                {insights.tags.slice(0, 10).map((t) => (
                  <li key={t.tag} className="flex justify-between">
                    <span>{t.tag}</span>
                    <span className="text-slate-500">×{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-2">Estados</h2>
            {insights.statuses.length === 0 ? (
              <p className="text-xs text-slate-500">Sin estados marcados.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-300">
                {insights.statuses.map((s) => (
                  <li key={s.status} className="flex justify-between">
                    <span>{s.status}</span>
                    <span className="text-slate-500">×{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-2">Emociones</h2>
            {insights.emotions.length === 0 ? (
              <p className="text-xs text-slate-500">Aún no hay emociones detectadas.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-300">
                {insights.emotions.map((e) => (
                  <li key={e.emotion} className="flex justify-between">
                    <span>{e.emotion}</span>
                    <span className="text-slate-500">×{e.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-2">Último episodio</h2>
          {insights.lastEpisode ? (
            <div className="text-xs text-slate-300 space-y-1">
              <div className="font-semibold">
                {insights.lastEpisode.title ||
                  `Episodio del ${new Date(insights.lastEpisode.createdAt).toLocaleString('es-MX')}`}
              </div>
              <div className="text-slate-400">
                Shards: {insights.lastEpisode.shardCount} · Duración:{' '}
                {insights.lastEpisode.durationSeconds != null
                  ? `${insights.lastEpisode.durationSeconds.toFixed(1)} s`
                  : '—'}
              </div>
              {insights.lastEpisode.dominantEmotion && (
                <div className="text-slate-400">
                  Emoción dominante: {insights.lastEpisode.dominantEmotion}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Aún no hay episodios registrados.</p>
          )}
        </section>
      </div>
    </main>
  );
}
