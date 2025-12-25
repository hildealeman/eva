'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmoShardStore } from '@/lib/store/EmoShardStore';
import type { EmoShard } from '@/types/emotion';
import ShardListItem from '@/components/emotion/ShardListItem';
import { runShardAnalysis } from '@/lib/analysis/runShardAnalysis';

export default function ClipsPage() {
  const [clips, setClips] = useState<EmoShard[]>([]);

  async function retryAnalysis(clip: EmoShard) {
    const { updated } = await runShardAnalysis(clip);
    if (!updated) return;
    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  useEffect(() => {
    EmoShardStore.getAll().then((all) => {
      const sorted = [...all].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setClips(sorted);
    });
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Clips emocionales</h1>
            <Link
              href="/"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Volver a EVA
            </Link>
          </div>
          <p className="text-sm text-slate-400">
            Lista de momentos detectados por EVA.
          </p>
        </header>

        {clips.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aún no hay clips guardados. Habla con EVA en la pantalla principal y espera a que detecte momentos intensos.
          </p>
        ) : (
          <ul className="space-y-3">
            {clips.map((clip) => (
              <ShardListItem
                key={clip.id}
                shard={clip}
                onRetry={() => void retryAnalysis(clip)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
