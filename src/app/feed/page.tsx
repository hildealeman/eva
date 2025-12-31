'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEvaDataMode } from '@/lib/config/evaAnalysisConfig';
import { fetchMyFeed } from '@/lib/api/hgiClient';
import type { FeedItem } from '@/types/hgi';
import { cn } from '@/lib/utils';

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

function formatRange(start: number | null, end: number | null): string {
  if (start === null && end === null) return '—';
  if (start === null) return `—–${end ?? '—'}s`;
  if (end === null) return `${start}s–—`;
  return `${start}s–${end}s`;
}

export default function FeedPage() {
  const dataMode = getEvaDataMode();
  const [state, setState] = useState<UiState>({ status: 'idle' });

  const load = useCallback(async () => {
    if (dataMode !== 'api') return;

    setState({ status: 'loading' });

    try {
      const res = await fetchMyFeed();
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
        const res = await fetchMyFeed();
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

    return { label: `${state.items.length}`, cls: 'bg-slate-800/60 text-slate-200 border-slate-700' };
  }, [dataMode, state]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Mi feed</h1>
              <p className="text-sm text-slate-400">Tus Emo-Shards publicados (solo lectura).</p>
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

          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              Volver a Home
            </Link>
            <Link href="/clips" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              Ir a Clips
            </Link>
          </div>
        </header>

        {dataMode !== 'api' ? (
          <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
            <p className="text-sm text-slate-300">
              El feed estará disponible cuando EVA 2 esté conectado (dataMode=api).
            </p>
          </section>
        ) : state.status === 'loading' || state.status === 'idle' ? (
          <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
            <p className="text-sm text-slate-400">Cargando…</p>
          </section>
        ) : state.status === 'error' ? (
          <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30 space-y-3">
            <p className="text-sm text-slate-300">{state.message}</p>
            <button
              type="button"
              onClick={load}
              className="h-10 px-4 rounded-full bg-slate-800 hover:bg-slate-700 text-sm font-semibold"
            >
              Reintentar
            </button>
          </section>
        ) : state.items.length === 0 ? (
          <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
            <p className="text-sm text-slate-400">Aún no tienes Emo-Shards publicados.</p>
          </section>
        ) : (
          <section className="space-y-3">
            {state.items.map((item) => (
              <article
                key={item.id}
                className="border border-slate-800 rounded-xl p-4 bg-slate-950/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-100 truncate">
                      {item.emotion?.headline ?? item.emotion?.primary ?? 'Emo-Shard publicado'}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.emotion?.primary ? `Emoción: ${item.emotion.primary}` : 'Emoción: —'}
                      {item.emotion?.valence ? ` · ${item.emotion.valence}` : ''}
                      {item.emotion?.activation ? ` · ${item.emotion.activation}` : ''}
                      {typeof item.emotion?.intensity === 'number'
                        ? ` · intensidad ${Math.round(item.emotion.intensity * 100)}%`
                        : ''}
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {formatDateTime(item.publishedAt)}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <div className="border border-slate-800 rounded-lg p-2">
                    <div className="text-[11px] text-slate-400">Tiempo</div>
                    <div className="text-slate-200 font-semibold">
                      {formatRange(item.startTimeSec, item.endTimeSec)}
                    </div>
                  </div>
                  <div className="border border-slate-800 rounded-lg p-2">
                    <div className="text-[11px] text-slate-400">Tags</div>
                    <div className="text-slate-200 font-semibold">
                      {item.userTags?.length ? item.userTags.join(', ') : '—'}
                    </div>
                  </div>
                  <div className="border border-slate-800 rounded-lg p-2">
                    <div className="text-[11px] text-slate-400">Episodio</div>
                    <div className="text-slate-200 font-semibold truncate">{item.episodeId}</div>
                  </div>
                </div>

                <div className="mt-3 text-sm text-slate-300">
                  {item.transcriptSnippet ? item.transcriptSnippet : '(sin transcripción)'}
                </div>

                <div className="mt-3">
                  <Link
                    href={`/clips/${encodeURIComponent(item.episodeId)}`}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Abrir episodio
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
