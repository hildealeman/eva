'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getEpisodeClient } from '@/lib/api/EpisodeClient';
import type {
  EpisodeInsightsResponse,
  EpisodeKeyMomentReason,
} from '@/types/episodeInsights';

type DataMode = 'local' | 'api';

export interface EpisodeInsightsPanelProps {
  episodeId: string;
  dataMode: DataMode;
}

type UiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: EpisodeInsightsResponse };

function reasonLabel(reason: EpisodeKeyMomentReason): string {
  if (reason === 'highestIntensity') return 'Mayor intensidad';
  if (reason === 'strongNegative') return 'Negativo fuerte';
  if (reason === 'strongPositive') return 'Positivo fuerte';
  return reason;
}

function formatRangeSeconds(start: number | null, end: number | null): string {
  if (start === null && end === null) return '—';
  if (start === null) return `—–${end ?? '—'}s`;
  if (end === null) return `${start}s–—`;
  return `${start}s–${end}s`;
}

function getCount(map: Record<string, number> | undefined, key: string): number {
  return map?.[key] ?? 0;
}

export default function EpisodeInsightsPanel({ episodeId, dataMode }: EpisodeInsightsPanelProps) {
  const [state, setState] = useState<UiState>({ status: 'idle' });

  const load = useCallback(async () => {
    if (dataMode !== 'api') return;
    if (!episodeId) return;

    setState({ status: 'loading' });

    try {
      const client = getEpisodeClient();
      const data = await client.getEpisodeInsights(episodeId);
      setState({ status: 'ready', data });
    } catch {
      setState({
        status: 'error',
        message: 'No pude cargar los insights del episodio. Intenta de nuevo.',
      });
    }
  }, [dataMode, episodeId]);

  useEffect(() => {
    if (dataMode !== 'api') return;

    let ignore = false;

    async function run() {
      setState({ status: 'loading' });

      try {
        const client = getEpisodeClient();
        const data = await client.getEpisodeInsights(episodeId);
        if (ignore) return;
        setState({ status: 'ready', data });
      } catch {
        if (ignore) return;
        setState({
          status: 'error',
          message: 'No pude cargar los insights del episodio. Intenta de nuevo.',
        });
      }
    }

    if (episodeId) {
      void run();
    }

    return () => {
      ignore = true;
    };
  }, [dataMode, episodeId]);

  const badge = useMemo(() => {
    if (dataMode !== 'api') {
      return { label: 'solo local', cls: 'bg-slate-800/60 text-slate-200 border-slate-700' };
    }

    if (state.status === 'loading' || state.status === 'idle') {
      return { label: 'cargando…', cls: 'bg-sky-900/40 text-sky-200 border-sky-800' };
    }

    if (state.status === 'error') {
      return { label: 'sin conexión', cls: 'bg-red-900/40 text-red-200 border-red-800' };
    }

    return { label: 'listo', cls: 'bg-emerald-900/40 text-emerald-200 border-emerald-800' };
  }, [dataMode, state.status]);

  return (
    <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Insights del episodio</h2>
          <p className="text-[11px] text-slate-400">Resumen y momentos clave (solo lectura).</p>
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
            Insights del episodio estarán disponibles cuando EVA 2 esté conectado.
          </p>
        ) : state.status === 'loading' || state.status === 'idle' ? (
          <p className="text-xs text-slate-400">Cargando…</p>
        ) : state.status === 'error' ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-300">{state.message}</p>
            <button
              type="button"
              onClick={load}
              className="h-9 px-4 rounded-full bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">Episodio</div>
                <div className="mt-2 space-y-1 text-xs text-slate-200">
                  <div>
                    Shards:{' '}
                    <span className="font-semibold">{state.data.stats.totalShards}</span>
                  </div>
                  <div>
                    Duración:{' '}
                    <span className="font-semibold">
                      {state.data.stats.durationSeconds ?? '—'}
                    </span>
                    s
                  </div>
                  <div>
                    Con emoción:{' '}
                    <span className="font-semibold">{state.data.stats.shardsWithEmotion}</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">Valencia</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="text-slate-200">
                    <div className="text-[11px] text-slate-400">+</div>
                    <div className="font-semibold">
                      {getCount(state.data.emotionSummary.valenceCounts, 'positive')}
                    </div>
                  </div>
                  <div className="text-slate-200">
                    <div className="text-[11px] text-slate-400">=</div>
                    <div className="font-semibold">
                      {getCount(state.data.emotionSummary.valenceCounts, 'neutral')}
                    </div>
                  </div>
                  <div className="text-slate-200">
                    <div className="text-[11px] text-slate-400">-</div>
                    <div className="font-semibold">
                      {getCount(state.data.emotionSummary.valenceCounts, 'negative')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">Activación</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="text-slate-200">
                    <div className="text-[11px] text-slate-400">low</div>
                    <div className="font-semibold">
                      {getCount(state.data.emotionSummary.activationCounts, 'low')}
                    </div>
                  </div>
                  <div className="text-slate-200">
                    <div className="text-[11px] text-slate-400">mid</div>
                    <div className="font-semibold">
                      {getCount(state.data.emotionSummary.activationCounts, 'medium')}
                    </div>
                  </div>
                  <div className="text-slate-200">
                    <div className="text-[11px] text-slate-400">high</div>
                    <div className="font-semibold">
                      {getCount(state.data.emotionSummary.activationCounts, 'high')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-slate-200 font-semibold">Momentos clave</div>

              {state.data.keyMoments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">(sin momentos clave)</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {state.data.keyMoments.map((m) => (
                    <li
                      key={`${m.shardId}:${m.reason}`}
                      className="border border-slate-800 rounded-lg p-3 bg-slate-900/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-800/60 text-slate-200 border-slate-700">
                              {reasonLabel(m.reason)}
                            </span>
                            <span className="text-xs text-slate-200 font-semibold truncate">
                              {m.emotion?.primary ?? '—'}
                            </span>
                            {m.emotion?.headline ? (
                              <span className="text-xs text-slate-400 truncate">
                                {m.emotion.headline}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-[11px] text-slate-400">
                            Tiempo: {formatRangeSeconds(m.startTime, m.endTime)}
                          </div>

                          <div className="mt-2 text-xs text-slate-300">
                            {m.transcriptSnippet ? m.transcriptSnippet : '(sin transcripción)'}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
