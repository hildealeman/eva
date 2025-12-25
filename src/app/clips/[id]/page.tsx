'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmoShardStore } from '@/lib/store/EmoShardStore';
import type { EmoShard, EmoShardStatus } from '@/types/emotion';
import ShardDetailPanel from '@/components/emotion/ShardDetailPanel';
import { useShardAnalysisState } from '@/lib/state/useShardAnalysisState';
import AnalysisStatusBadge from '@/components/emotion/AnalysisStatusBadge';
import { runShardAnalysis } from '@/lib/analysis/runShardAnalysis';

export default function ClipDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const showWaveformMvp =
    process.env.NEXT_PUBLIC_SHOW_WAVEFORM_MVP === '1';

  const [shard, setShard] = useState<EmoShard | null>(null);
  const [loading, setLoading] = useState(true);

  const { state: analysisState, errorMessage } = useShardAnalysisState(shard);
  const hasSemanticAnalysis = Boolean(
    shard?.analysisAt || shard?.transcript || shard?.primaryEmotion
  );

  const handleAnalyzeNow = useCallback(async () => {
    if (!shard) return;
    const { updated } = await runShardAnalysis(shard);
    if (updated) setShard(updated);
  }, [shard]);

  useEffect(() => {
    if (!id) return;
    EmoShardStore.get(id).then((data) => {
      setShard(data ?? null);
      setLoading(false);
    });
  }, [id]);

  const handleStatusChange = useCallback((status: EmoShardStatus) => {
    setShard((prev) => (prev ? { ...prev, status } : prev));
  }, []);

  const handleTagAdd = useCallback((tag: string) => {
    const t = tag.trim();
    if (!t) return;
    setShard((prev) =>
      prev
        ? { ...prev, userTags: Array.from(new Set([...prev.userTags, t])) }
        : prev
    );
  }, []);

  const handleTagRemove = useCallback((tag: string) => {
    setShard((prev) =>
      prev ? { ...prev, userTags: prev.userTags.filter((t) => t !== tag) } : prev
    );
  }, []);

  const handleChange = useCallback((updates: Partial<EmoShard>) => {
    setShard((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!shard) return;
    await EmoShardStore.update(shard.id, shard);
    alert('Cambios guardados.');
  }, [shard]);

  if (!id) {
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

  if (!shard) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-sm text-red-400">Clip no encontrado.</p>
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Detalle del clip</h1>
              <AnalysisStatusBadge state={analysisState} />
            </div>
            <Link
              href="/clips"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Volver
            </Link>
          </div>
          <p className="text-xs text-slate-400">ID: {shard.id}</p>
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
              {shard.analysisAt && (
                <div>
                  Analizado el: {new Date(shard.analysisAt).toLocaleString('es-MX')}
                </div>
              )}
              {shard.analysisVersion && (
                <div>Versión de análisis: {shard.analysisVersion}</div>
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

        <div className="border border-slate-800 rounded-xl p-4">
          <ShardDetailPanel
            shard={shard}
            onChange={handleChange}
            onTagAdd={handleTagAdd}
            onTagRemove={handleTagRemove}
            onStatusChange={handleStatusChange}
          />
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
