'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { fetchFeed } from '@/lib/api/hgiClient';
import type { FeedItem } from '@/types/hgi';

export interface MyFeedPanelProps {
  dataMode: 'local' | 'api';
}

type UiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: FeedItem[] };

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-MX');
}

function intensityLabel(activation: string | null | undefined, intensity: number | null | undefined): string {
  if (typeof intensity === 'number') {
    if (intensity >= 0.8) return 'alta';
    if (intensity >= 0.45) return 'media';
    return 'baja';
  }

  if (!activation) return '—';
  if (activation === 'high') return 'alta';
  if (activation === 'medium') return 'media';
  if (activation === 'low') return 'baja';
  return activation;
}

export default function MyFeedPanel({ dataMode }: MyFeedPanelProps) {
  const [state, setState] = useState<UiState>({ status: 'idle' });

  const load = useCallback(async () => {
    if (dataMode !== 'api') return;

    setState({ status: 'loading' });

    try {
      const res = await fetchFeed();
      setState({ status: 'ready', items: res.items ?? [] });
    } catch {
      setState({
        status: 'error',
        message: 'No pude cargar tu feed. Revisa tu conexión con EVA 2.',
      });
    }
  }, [dataMode]);

  useEffect(() => {
    if (dataMode !== 'api') return;

    let ignore = false;

    async function run() {
      setState({ status: 'loading' });

      try {
        const res = await fetchFeed();
        if (ignore) return;
        setState({ status: 'ready', items: res.items ?? [] });
      } catch {
        if (ignore) return;
        setState({
          status: 'error',
          message: 'No pude cargar tu feed. Revisa tu conexión con EVA 2.',
        });
      }
    }

    void run();

    return () => {
      ignore = true;
    };
  }, [dataMode]);

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

    return {
      label: `${state.items.length}`,
      cls: 'bg-slate-800/60 text-slate-200 border-slate-700',
    };
  }, [dataMode, state]);

  return (
    <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Mi feed de Emo-Shards</h2>
          <p className="text-[11px] text-slate-400">
            Conecta EVA 2 (modo API) para publicar y ver tus Emo-Shards.
          </p>
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
          <p className="text-xs text-slate-300">Conecta EVA 2 para ver tu feed de Emo-Shards.</p>
        ) : state.status === 'loading' || state.status === 'idle' ? (
          <p className="text-xs text-slate-400">Cargando feed…</p>
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
        ) : state.items.length === 0 ? (
          <p className="text-xs text-slate-400">
            Todavía no has publicado ningún Emo-Shard. Marca algunos como readyToPublish y pulsa
            Publicar.
          </p>
        ) : (
          <ul className="space-y-2">
            {state.items.map((item) => (
              <li
                key={item.id}
                className="border border-slate-800 rounded-lg p-3 bg-slate-900/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {item.emotion?.headline ?? item.emotion?.primary ?? 'Emo-Shard publicado'}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {item.emotion?.primary ? `Emoción: ${item.emotion.primary}` : 'Emoción: —'}
                      {item.emotion?.valence ? ` · ${item.emotion.valence}` : ''}
                      {item.emotion?.activation ? ` · ${item.emotion.activation}` : ''}
                      {' · Intensidad: '}
                      {intensityLabel(item.emotion?.activation, item.emotion?.intensity)}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 whitespace-nowrap">
                    {formatDateTime(item.publishedAt)}
                  </div>
                </div>

                <div className="mt-2 text-xs text-slate-300">
                  {item.transcriptSnippet ? item.transcriptSnippet : '(sin transcripción)'}
                </div>

                {item.userTags?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.userTags.slice(0, 8).map((t) => (
                      <span
                        key={`${item.id}:${t}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] bg-slate-950/30 border-slate-800 text-slate-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
