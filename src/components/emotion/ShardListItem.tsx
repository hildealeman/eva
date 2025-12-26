'use client';

import Link from 'next/link';
import type { EmoShard } from '@/types/emotion';
import IntensityBar from '@/components/emotion/IntensityBar';
import EmotionStatusPill from '@/components/emotion/EmotionStatusPill';
import AnalysisStatusBadge from '@/components/emotion/AnalysisStatusBadge';
import { useShardAnalysisState } from '@/lib/state/useShardAnalysisState';
import { runShardAnalysis } from '@/lib/analysis/runShardAnalysis';

interface ShardListItemProps {
  shard: EmoShard;
  onRetry?: () => void;
  showLink?: boolean;
}

export default function ShardListItem({
  shard,
  onRetry,
  showLink = true,
}: ShardListItemProps) {
  const { state } = useShardAnalysisState(shard);

  return (
    <li className="border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <IntensityBar intensity={shard.intensity} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold truncate">
              Intensidad: {(shard.intensity * 100).toFixed(1)}%
            </div>
            <EmotionStatusPill status={shard.status} />
            <AnalysisStatusBadge state={state} />
            {state === 'error' && (
              <button
                type="button"
                onClick={onRetry ?? (() => void runShardAnalysis(shard))}
                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Reintentar
              </button>
            )}
          </div>
          <div className="text-xs text-slate-400">
            Duración: {shard.features.duration.toFixed(2)} s
          </div>
          {shard.suggestedTags.length > 0 && (
            <div className="text-xs text-slate-400 truncate">
              Tags: {shard.suggestedTags.slice(0, 4).join(', ')}
            </div>
          )}
        </div>
      </div>

      {showLink ? (
        <Link
          href={`/clips/${shard.episodeId ?? shard.id}`}
          className="shrink-0 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Ver episodio
        </Link>
      ) : null}
    </li>
  );
}
