import type { EmoShard } from '@/types/emotion';
import { analyzeShardAudioSafe } from '@/lib/api/evaAnalysisClient';
import { EmoShardStore } from '@/lib/store/EmoShardStore';
import { EpisodeStore } from '@/lib/store/EpisodeStore';
import { ShardAnalysisStateStore } from '@/lib/state/shardAnalysisState';

function errorMessageFromCode(code: string): string {
  switch (code) {
    case 'backend_unavailable':
      return 'Backend no disponible (503)';
    case 'invalid_request':
      return 'Error de datos al analizar.';
    case 'timeout':
      return 'Tiempo de espera agotado.';
    case 'network_error':
      return 'Error de red al analizar.';
    default:
      return 'Error de análisis.';
  }
}

export async function runShardAnalysis(
  shard: EmoShard
): Promise<{ updated: EmoShard | null; ok: boolean }> {
  if (!shard.id) {
    return { updated: null, ok: false };
  }

  ShardAnalysisStateStore.setAnalyzing(shard.id);

  const safe = await analyzeShardAudioSafe(shard);
  if (!safe.ok) {
    ShardAnalysisStateStore.setError(
      shard.id,
      safe.errorCode,
      errorMessageFromCode(safe.errorCode)
    );
    return { updated: null, ok: false };
  }

  const updated = await EmoShardStore.applyAnalysisToShard(shard.id, safe.result);
  if (!updated) {
    ShardAnalysisStateStore.setError(shard.id, 'unknown', 'No se pudo actualizar el shard.');
    return { updated: null, ok: false };
  }

  if (updated.episodeId) {
    await EpisodeStore.refreshEpisodeComputedFields(updated.episodeId);
  }

  // Clear transient UI record; analyzed state is derived from shard fields.
  ShardAnalysisStateStore.clear(shard.id);

  return { updated, ok: true };
}
