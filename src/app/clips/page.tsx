'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EpisodeSummary } from '@/types/emotion';
import { getEpisodeClient } from '@/lib/api/EpisodeClient';

export default function ClipsPage() {
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);

  useEffect(() => {
    const client = getEpisodeClient();
    client.getAllEpisodes().then((all) => {
      setEpisodes(all);
    });
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Episodios</h1>
            <div className="flex items-center gap-3">
              <Link
                href="/insights"
                className="text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Ver insights
              </Link>
              <Link
                href="/"
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Volver a EVA
              </Link>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            Lista de episodios (sesiones) con shards de análisis.
          </p>
        </header>

        {episodes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aún no hay clips guardados. Habla con EVA en la pantalla principal y espera a que detecte momentos intensos.
          </p>
        ) : (
          <ul className="space-y-3">
            {episodes.map((ep) => {
              const title = ep.title ?? `Episodio del ${new Date(ep.createdAt).toLocaleString('es-MX')}`;
              return (
                <li key={ep.id} className="border border-slate-800 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{title}</div>
                      <div className="mt-1 text-xs text-slate-400 space-y-1">
                        <div>
                          Creado: {new Date(ep.createdAt).toLocaleString('es-MX')}
                        </div>
                        <div>
                          Shards: {ep.shardCount} · Duración: {ep.durationSeconds.toFixed(1)} s
                        </div>
                        {ep.dominantEmotion ? (
                          <div>Emoción dominante: {ep.dominantEmotion}</div>
                        ) : null}
                        {ep.momentTypes?.length ? (
                          <div>Momentos: {ep.momentTypes.slice(0, 4).join(', ')}</div>
                        ) : null}
                      </div>
                      {ep.tags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {ep.tags.slice(0, 8).map((tag, i) => (
                            <span
                              key={`${tag}-${i}`}
                              className="inline-flex items-center rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-100 border border-slate-700/60"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <Link
                      href={`/clips/${ep.id}`}
                      className="shrink-0 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                    >
                      Ver episodio
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
