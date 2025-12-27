'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getCloudAnalysisBaseUrl,
  getEvaAnalysisMode,
  getEvaDataMode,
  getLocalAnalysisBaseUrl,
} from '@/lib/config/evaAnalysisConfig';
import { cn } from '@/lib/utils';

export interface EvaHealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  contractVersion: string;
  modelRootAvailable?: boolean;
  whisperLoaded?: boolean;
  emotionModelLoaded?: boolean;
  timestamp?: string;
}

type EvaUiStatus = 'loading' | 'ok' | 'degraded' | 'error' | 'local';

type EvaHealthUiState = {
  uiStatus: EvaUiStatus;
  health: EvaHealthStatus | null;
  errorMessage: string | null;
};

function getEva2BaseUrl(): string | null {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') return null;
  const base = mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
  return base ? base.replace(/\/$/, '') : null;
}

function formatBool(value: boolean | undefined): string {
  if (value === true) return '✔';
  if (value === false) return '✖';
  return '—';
}

function formatTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('es-MX');
}

export default function EVAStatusCard() {
  const dataMode = getEvaDataMode();
  const baseUrl = useMemo(() => getEva2BaseUrl(), []);

  const [state, setState] = useState<EvaHealthUiState>({
    uiStatus: dataMode === 'local' ? 'local' : 'loading',
    health: null,
    errorMessage: null,
  });

  useEffect(() => {
    if (dataMode === 'local') {
      setState({ uiStatus: 'local', health: null, errorMessage: null });
      return;
    }

    if (!baseUrl) {
      setState({
        uiStatus: 'error',
        health: null,
        errorMessage: 'No hay base URL configurada para EVA 2.',
      });
      return;
    }

    let ignore = false;

    async function run() {
      setState((prev) => ({ ...prev, uiStatus: 'loading', errorMessage: null }));

      try {
        const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = (await res.json()) as EvaHealthStatus;
        if (!json || (json.status !== 'ok' && json.status !== 'degraded')) {
          throw new Error('Respuesta inválida');
        }
        if (typeof json.service !== 'string' || typeof json.contractVersion !== 'string') {
          throw new Error('Respuesta inválida');
        }

        if (ignore) return;
        setState({
          uiStatus: json.status,
          health: json,
          errorMessage: null,
        });
      } catch {
        if (ignore) return;
        setState({
          uiStatus: 'error',
          health: null,
          errorMessage: 'No pude conectar con EVA 2. Revisa que el servicio esté corriendo.',
        });
      }
    }

    void run();

    return () => {
      ignore = true;
    };
  }, [baseUrl, dataMode]);

  const badgeLabel =
    state.uiStatus === 'local'
      ? 'modo local'
      : state.uiStatus === 'loading'
        ? 'cargando…'
        : state.uiStatus === 'ok'
          ? 'ok'
          : state.uiStatus === 'degraded'
            ? 'degradado'
            : 'sin conexión';

  const badgeStyles =
    state.uiStatus === 'ok'
      ? 'bg-emerald-900/40 text-emerald-200 border-emerald-800'
      : state.uiStatus === 'degraded'
        ? 'bg-amber-900/40 text-amber-200 border-amber-800'
        : state.uiStatus === 'error'
          ? 'bg-red-900/40 text-red-200 border-red-800'
          : state.uiStatus === 'local'
            ? 'bg-slate-800/60 text-slate-200 border-slate-700'
            : 'bg-sky-900/40 text-sky-200 border-sky-800';

  const ts = formatTimestamp(state.health?.timestamp);

  return (
    <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Estado de EVA</h2>
          <p className="text-[11px] text-slate-400">
            Estado informativo del backend de análisis (EVA 2).
          </p>
        </div>

        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap',
            badgeStyles
          )}
        >
          {badgeLabel}
        </span>
      </div>

      {state.uiStatus === 'local' ? (
        <p className="mt-3 text-xs text-slate-300">
          Modo local: EVA está escuchando y guardando shards solo en tu dispositivo. El
          backend de análisis (EVA 2) no está conectado.
        </p>
      ) : state.uiStatus === 'error' ? (
        <p className="mt-3 text-xs text-slate-300">{state.errorMessage}</p>
      ) : state.uiStatus === 'loading' ? (
        <p className="mt-3 text-xs text-slate-400">Consultando /health…</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-slate-400">Servicio</div>
            <div className="text-slate-200 font-semibold truncate">
              {state.health?.service ?? '—'}
            </div>
            <div className="text-slate-400">Contrato</div>
            <div className="text-slate-200 font-semibold">
              {state.health?.contractVersion ?? '—'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="border border-slate-800 rounded-lg p-2">
              <div className="text-[11px] text-slate-400">modelRoot</div>
              <div className="text-slate-200 font-semibold">
                {formatBool(state.health?.modelRootAvailable)}
              </div>
            </div>
            <div className="border border-slate-800 rounded-lg p-2">
              <div className="text-[11px] text-slate-400">whisper</div>
              <div className="text-slate-200 font-semibold">
                {formatBool(state.health?.whisperLoaded)}
              </div>
            </div>
            <div className="border border-slate-800 rounded-lg p-2">
              <div className="text-[11px] text-slate-400">emotion</div>
              <div className="text-slate-200 font-semibold">
                {formatBool(state.health?.emotionModelLoaded)}
              </div>
            </div>
          </div>

          {ts && (
            <div className="text-[11px] text-slate-400">Última respuesta: {ts}</div>
          )}
        </div>
      )}
    </section>
  );
}
