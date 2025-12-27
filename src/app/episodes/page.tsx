'use client';

import Link from 'next/link';
import EpisodeListView from '@/components/episodes/EpisodeListView';

export default function EpisodesPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Episodios</h1>
            <Link
              href="/"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Volver a EVA
            </Link>
          </div>
          <p className="text-sm text-slate-400">
            Lista de episodios (sesiones) con shards de análisis.
          </p>
        </header>

        <EpisodeListView />
      </div>
    </main>
  );
}
