'use client';

import { cn } from '@/lib/utils';
import type { ShardAnalysisUiState } from '@/lib/state/shardAnalysisState';

export default function AnalysisStatusBadge({
  state,
  className,
}: {
  state: ShardAnalysisUiState;
  className?: string;
}) {
  if (state === 'idle') return null;

  const label =
    state === 'analyzing'
      ? 'Analizando…'
      : state === 'analyzed'
        ? 'Listo'
        : 'Error';

  const styles =
    state === 'analyzing'
      ? 'bg-sky-900/40 text-sky-200 border-sky-800'
      : state === 'analyzed'
        ? 'bg-emerald-900/40 text-emerald-200 border-emerald-800'
        : 'bg-red-900/40 text-red-200 border-red-800';

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold',
        styles,
        className
      )}
    >
      {label}
    </span>
  );
}
