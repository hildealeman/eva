'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getEvaDataMode } from '@/lib/config/evaAnalysisConfig';
import { fetchProfile } from '@/lib/api/hgiClient';
import type { ProfileWithSummaries } from '@/types/hgi';

type UiState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: ProfileWithSummaries };

export default function MyRoleCard() {
  const dataMode = getEvaDataMode();
  const [state, setState] = useState<UiState>({ status: 'loading' });

  useEffect(() => {
    if (dataMode !== 'api') return;

    let ignore = false;

    async function run() {
      setState({ status: 'loading' });

      try {
        const me = await fetchProfile();
        if (ignore) return;
        setState({ status: 'ready', me });
      } catch {
        if (ignore) return;
        setState({
          status: 'error',
          message: 'No pude cargar tu perfil ahora mismo.',
        });
      }
    }

    void run();

    return () => {
      ignore = true;
    };
  }, [dataMode]);

  const badge =
    state.status === 'ready'
      ? state.me.profile.role === 'ghost'
        ? { label: 'ghost', cls: 'bg-slate-800/60 text-slate-200 border-slate-700' }
        : { label: 'active', cls: 'bg-emerald-900/40 text-emerald-200 border-emerald-800' }
      : state.status === 'loading'
        ? { label: 'cargando…', cls: 'bg-sky-900/40 text-sky-200 border-sky-800' }
        : { label: 'sin conexión', cls: 'bg-red-900/40 text-red-200 border-red-800' };

  return (
    <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Mi rol en HGI</h2>
          <p className="text-[11px] text-slate-400">Lectura de tu perfil actual.</p>
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
            ghost (solo local). Conecta EVA 2 para ver tu perfil real de HGI.
          </p>
        ) : state.status === 'loading' ? (
          <p className="text-xs text-slate-400">Cargando…</p>
        ) : state.status === 'error' ? (
          <p className="text-xs text-slate-300">{state.message}</p>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="text-slate-200">
              Rol: <span className="font-semibold">{state.me.profile.role}</span> · Estado:{' '}
              <span className="font-semibold">{state.me.profile.state}</span>
            </div>

            <div className="text-slate-300">
              TEV: <span className="font-semibold">{state.me.profile.tevScore}</span> · Racha:{' '}
              <span className="font-semibold">{state.me.profile.dailyStreak}</span>
            </div>

            <div className="text-slate-400">
              Invitaciones disponibles:{' '}
              <span className="font-semibold">{state.me.profile.invitationsRemaining}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
