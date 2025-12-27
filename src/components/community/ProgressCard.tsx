'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchProgress } from '@/lib/api/hgiClient';
import type { ProgressSummary } from '@/types/hgi';
import { cn } from '@/lib/utils';
import { getEvaDataMode } from '@/lib/config/evaAnalysisConfig';

type UiState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; progress: ProgressSummary };

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export default function ProgressCard() {
  const dataMode = getEvaDataMode();
  const [state, setState] = useState<UiState>({ status: 'loading' });

  useEffect(() => {
    if (dataMode !== 'api') return;

    let ignore = false;

    async function run() {
      setState({ status: 'loading' });

      try {
        const res = await fetchProgress();
        const progress = res.today;
        if (ignore) return;
        setState({ status: 'ready', progress });
      } catch {
        if (ignore) return;
        setState({ status: 'error', message: 'No pude cargar tu progreso ahora mismo.' });
      }
    }

    void run();

    return () => {
      ignore = true;
    };
  }, [dataMode]);

  const view = useMemo(() => {
    if (state.status !== 'ready') return null;

    const percent = Math.round(clamp01(state.progress.progressPercentToNextLevel / 100) * 100);
    const minutes = state.progress.activityMinutes ?? 0;
    const reviewed = state.progress.shardsReviewed ?? 0;
    const published = state.progress.shardsPublished ?? 0;
    const up = state.progress.votesGiven?.up ?? 0;
    const down = state.progress.votesGiven?.down ?? 0;

    const trendText = `Hoy estás a ${percent}% de tu siguiente nivel.`;
    const trendStyles = 'bg-slate-800/60 text-slate-200 border-slate-700';

    return { percent, minutes, reviewed, published, up, down, trendText, trendStyles };
  }, [state]);

  const badge =
    state.status === 'ready'
      ? { label: 'hoy', cls: 'bg-slate-800/60 text-slate-200 border-slate-700' }
      : state.status === 'loading'
        ? { label: 'cargando…', cls: 'bg-sky-900/40 text-sky-200 border-sky-800' }
        : { label: 'sin conexión', cls: 'bg-red-900/40 text-red-200 border-red-800' };

  return (
    <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Progreso hacia Usuario</h2>
          <p className="text-[11px] text-slate-400">Indicador diario (solo lectura).</p>
        </div>

        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap',
            badge.cls
          )}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-3">
        {dataMode !== 'api' ? (
          <p className="text-xs text-slate-300">
            Conecta EVA 2 para ver tu progreso real de HGI.
          </p>
        ) : state.status === 'loading' ? (
          <p className="text-xs text-slate-400">Cargando…</p>
        ) : state.status === 'error' ? (
          <p className="text-xs text-slate-300">{state.message}</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs">
                <div className="text-slate-300 font-semibold">{view?.percent ?? 0}%</div>
                <div className="text-slate-400">Hacia Usuario</div>
              </div>
              <div className="mt-2 w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${view?.percent ?? 0}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-slate-800 rounded-lg p-2">
                <div className="text-[11px] text-slate-400">Actividad</div>
                <div className="text-slate-200 font-semibold">{view?.minutes ?? 0} min</div>
              </div>
              <div className="border border-slate-800 rounded-lg p-2">
                <div className="text-[11px] text-slate-400">Shards revisados</div>
                <div className="text-slate-200 font-semibold">{view?.reviewed ?? 0}</div>
              </div>
              <div className="border border-slate-800 rounded-lg p-2">
                <div className="text-[11px] text-slate-400">Shards publicados</div>
                <div className="text-slate-200 font-semibold">{view?.published ?? 0}</div>
              </div>
              <div className="border border-slate-800 rounded-lg p-2">
                <div className="text-[11px] text-slate-400">Votos (↑ / ↓)</div>
                <div className="text-slate-200 font-semibold">
                  {view?.up ?? 0} / {view?.down ?? 0}
                </div>
              </div>
            </div>

            <div
              className={cn(
                'inline-flex items-center px-2 py-1 rounded-lg border text-[11px] font-semibold',
                view?.trendStyles
              )}
            >
              {view?.trendText}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
