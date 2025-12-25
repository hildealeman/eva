'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { EmoShard } from '@/types/emotion';
import { ShardAnalysisStateStore, type ShardAnalysisUiState } from '@/lib/state/shardAnalysisState';

function shardHasAnalysis(shard: EmoShard | null | undefined): boolean {
  if (!shard) return false;
  return Boolean(shard.analysisAt || shard.transcript || shard.primaryEmotion);
}

export function useShardAnalysisState(
  shard: EmoShard | null | undefined
): { state: ShardAnalysisUiState; errorMessage?: string } {
  const map = useSyncExternalStore(
    ShardAnalysisStateStore.subscribe,
    ShardAnalysisStateStore.getSnapshot,
    ShardAnalysisStateStore.getSnapshot
  );

  return useMemo(() => {
    if (!shard) return { state: 'idle' as const };

    if (shardHasAnalysis(shard)) {
      return { state: 'analyzed' as const };
    }

    const rec = map.get(shard.id);
    if (!rec) return { state: 'idle' as const };

    if (rec.state === 'error') {
      return { state: 'error' as const, errorMessage: rec.errorMessage };
    }

    return { state: 'analyzing' as const };
  }, [map, shard]);
}
