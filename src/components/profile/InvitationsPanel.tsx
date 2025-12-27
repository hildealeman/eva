'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEvaDataMode } from '@/lib/config/evaAnalysisConfig';
import { createInvitation, fetchInvitations, fetchProfile } from '@/lib/api/hgiClient';
import type { Invitation, ProfileWithSummaries } from '@/types/hgi';
import { cn } from '@/lib/utils';

type UiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: ProfileWithSummaries; invitations: Invitation[] };

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX');
}

export default function InvitationsPanel() {
  const dataMode = getEvaDataMode();

  const [state, setState] = useState<UiState>({ status: 'idle' });
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (dataMode !== 'api') return;

    setState({ status: 'loading' });
    setSubmitError(null);

    try {
      const [me, invites] = await Promise.all([fetchProfile(), fetchInvitations()]);
      setState({ status: 'ready', me, invitations: invites.invitations ?? [] });
    } catch {
      setState({
        status: 'error',
        message: 'No pude cargar tus invitaciones. Revisa tu conexión con EVA 2.',
      });
    }
  }, [dataMode]);

  useEffect(() => {
    if (dataMode !== 'api') {
      setState({ status: 'idle' });
      return;
    }

    let ignore = false;

    async function run() {
      try {
        setState({ status: 'loading' });
        const [me, invites] = await Promise.all([fetchProfile(), fetchInvitations()]);
        if (ignore) return;
        setState({ status: 'ready', me, invitations: invites.invitations ?? [] });
      } catch {
        if (ignore) return;
        setState({
          status: 'error',
          message: 'No pude cargar tus invitaciones. Revisa tu conexión con EVA 2.',
        });
      }
    }

    void run();

    return () => {
      ignore = true;
    };
  }, [dataMode]);

  const remaining =
    state.status === 'ready'
      ? state.me.invitationsSummary.remaining ?? state.me.profile.invitationsRemaining
      : 0;

  const summary =
    state.status === 'ready'
      ? state.me.invitationsSummary
      : { grantedTotal: 0, used: 0, remaining: 0 };

  const list = state.status === 'ready' ? state.invitations : [];

  const canSend = dataMode === 'api' && state.status === 'ready' && remaining > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSend) return;

    const trimmed = email.trim();
    if (!trimmed.includes('@') || !trimmed.includes('.')) {
      setSubmitError('Escribe un email válido.');
      return;
    }

    setSending(true);
    setSubmitError(null);

    try {
      await createInvitation(trimmed);
      setEmail('');
      await load();
    } catch {
      setSubmitError('No pude enviar la invitación. Revisa tu conexión con EVA 2.');
    } finally {
      setSending(false);
    }
  }, [canSend, email, load]);

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

    return { label: `${remaining}`, cls: 'bg-slate-800/60 text-slate-200 border-slate-700' };
  }, [dataMode, remaining, state.status]);

  return (
    <section className="border border-slate-800 rounded-xl p-4 bg-slate-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Invitaciones HGI</h2>
          <p className="text-[11px] text-slate-400">
            Solo Usuarios activos reciben invitaciones. (Requiere EVA 2)
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

      <div className="mt-3 space-y-3">
        {dataMode !== 'api' ? (
          <p className="text-xs text-slate-300">Conecta EVA 2 para activar las invitaciones.</p>
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
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="border border-slate-800 rounded-lg p-2">
                <div className="text-[11px] text-slate-400">Total</div>
                <div className="text-slate-200 font-semibold">{summary.grantedTotal ?? 0}</div>
              </div>
              <div className="border border-slate-800 rounded-lg p-2">
                <div className="text-[11px] text-slate-400">Usadas</div>
                <div className="text-slate-200 font-semibold">{summary.used ?? 0}</div>
              </div>
              <div className="border border-slate-800 rounded-lg p-2">
                <div className="text-[11px] text-slate-400">Disponibles</div>
                <div className="text-slate-200 font-semibold">{remaining}</div>
              </div>
            </div>

            <div className="space-y-2">
              {list.length === 0 ? (
                <p className="text-xs text-slate-500">No hay invitaciones aún.</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((inv) => (
                    <li
                      key={inv.id}
                      className="border border-slate-800 rounded-lg p-3 bg-slate-900/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-200 truncate">
                            {inv.email}
                          </div>
                          <div className="text-[11px] text-slate-400">Estado: {inv.state}</div>
                        </div>
                        <div className="text-[11px] text-slate-400 whitespace-nowrap">
                          {formatDateTime(inv.createdAt)}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                        <div>Aceptada: {formatDateTime(inv.acceptedAt)}</div>
                        <div>Expira: {formatDateTime(inv.expiresAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/30 space-y-2">
              <div className="text-xs text-slate-300 font-semibold">Enviar invitación</div>

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="future.friend@example.com"
                className="w-full h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 text-sm text-slate-100"
              />

              {remaining <= 0 ? (
                <div className="text-xs text-slate-500">
                  Has usado todas tus invitaciones por ahora.
                </div>
              ) : null}

              {submitError ? <div className="text-xs text-red-300">{submitError}</div> : null}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSend || sending}
                className={`w-full h-10 rounded-full text-sm font-semibold ${
                  !canSend
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : sending
                      ? 'bg-emerald-800 text-emerald-100 cursor-wait'
                      : 'bg-emerald-700 hover:bg-emerald-600'
                }`}
              >
                {sending ? 'Enviando…' : 'Enviar invitación'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
