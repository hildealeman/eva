import type { EmoShard, EpisodeDetail, EpisodeStats, EpisodeSummary } from '@/types/emotion';
import { createStore, del, get, keys, set } from 'idb-keyval';
import { EmoShardStore } from '@/lib/store/EmoShardStore';
import { ensureEvaDb } from '@/lib/store/evaDb';

const DB_NAME = 'eva-db';
const STORE_NAME = 'episodes';

const store = createStore(DB_NAME, STORE_NAME);

function computeEpisodeStats(shards: EmoShard[]): EpisodeStats {
  const emotionsHistogram: Record<string, number> = {};

  let crisisCount = 0;
  let followupCount = 0;
  let totalDurationSeconds = 0;

  for (const shard of shards) {
    totalDurationSeconds += shard.audioDurationSeconds ?? shard.features?.duration ?? 0;

    const emotion = shard.primaryEmotion ?? 'unknown';
    emotionsHistogram[emotion] = (emotionsHistogram[emotion] ?? 0) + 1;

    if (shard.semantic?.flags?.possibleCrisis) crisisCount += 1;
    if (shard.semantic?.flags?.needsFollowup) followupCount += 1;
  }

  return {
    totalDurationSeconds,
    shardCount: shards.length,
    emotionsHistogram,
    crisisCount,
    followupCount,
  };
}

function computeEpisodeSummaryFieldsFromShards(shards: EmoShard[]): Pick<
  EpisodeSummary,
  'shardCount' | 'durationSeconds' | 'dominantEmotion' | 'momentTypes' | 'tags'
> {
  const shardCount = shards.length;
  const durationSeconds = shards.reduce(
    (sum, s) => sum + (s.audioDurationSeconds ?? s.features?.duration ?? 0),
    0
  );

  const emotionCounts: Record<string, number> = {};
  for (const s of shards) {
    if (!s.primaryEmotion) continue;
    emotionCounts[s.primaryEmotion] = (emotionCounts[s.primaryEmotion] ?? 0) + 1;
  }

  let dominantEmotion: EpisodeSummary['dominantEmotion'] = null;
  let bestCount = 0;
  for (const [emotion, count] of Object.entries(emotionCounts)) {
    if (count > bestCount) {
      bestCount = count;
      dominantEmotion = emotion as EpisodeSummary['dominantEmotion'];
    }
  }

  const momentTypesSet = new Set<string>();
  const tagsSet = new Set<string>();

  for (const s of shards) {
    if (s.semantic?.momentType) {
      momentTypesSet.add(s.semantic.momentType);
    }
    if (s.semantic?.topics?.length) {
      for (const t of s.semantic.topics) {
        const trimmed = t.trim();
        if (trimmed) tagsSet.add(trimmed.toLowerCase());
      }
    }
    if (s.suggestedTags?.length) {
      for (const t of s.suggestedTags) {
        const trimmed = t.trim();
        if (trimmed) tagsSet.add(trimmed.toLowerCase());
      }
    }
  }

  return {
    shardCount,
    durationSeconds,
    dominantEmotion,
    momentTypes: Array.from(momentTypesSet),
    tags: Array.from(tagsSet).slice(0, 16),
  };
}

function normalizeEpisodeIdFromShard(shard: EmoShard): string {
  return shard.episodeId ?? shard.id;
}

export const EpisodeStore = {
  async upsertEpisodeSummary(summary: EpisodeSummary): Promise<void> {
    await ensureEvaDb();
    await set(summary.id, summary, store);
  },

  async deleteEpisodeSummary(id: string): Promise<void> {
    await ensureEvaDb();
    await del(id, store);
  },

  async getEpisodeSummary(id: string): Promise<EpisodeSummary | null> {
    await ensureEvaDb();
    return (await get<EpisodeSummary>(id, store)) ?? null;
  },

  async getAllEpisodes(): Promise<EpisodeSummary[]> {
    await ensureEvaDb();
    const allKeys = await keys(store);
    const all = await Promise.all(
      allKeys.map((k) => get<EpisodeSummary>(k as IDBValidKey, store))
    );

    const summaries = all.filter((s): s is EpisodeSummary => !!s);
    if (summaries.length > 0) {
      return summaries.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }

    // Compatibilidad MVP: si no hay episodios guardados todavía, reconstruimos
    // desde shards existentes agrupando por episodeId (o shard.id para shards antiguos).
    const shards = await EmoShardStore.getAll();
    const groups = new Map<string, EmoShard[]>();

    for (const shard of shards) {
      const episodeId = normalizeEpisodeIdFromShard(shard);
      const list = groups.get(episodeId) ?? [];
      list.push({ ...shard, episodeId });
      groups.set(episodeId, list);
    }

    const rebuilt: EpisodeSummary[] = [];
    for (const [episodeId, list] of groups.entries()) {
      const createdAt = list.reduce(
        (min, s) => (min ? (s.createdAt < min ? s.createdAt : min) : s.createdAt),
        ''
      );
      const updatedAt = list.reduce(
        (max, s) => (max ? (s.createdAt > max ? s.createdAt : max) : s.createdAt),
        ''
      );

      const computed = computeEpisodeSummaryFieldsFromShards(list);
      rebuilt.push({
        id: episodeId,
        title: null,
        note: null,
        createdAt,
        updatedAt,
        ...computed,
      });
    }

    return rebuilt.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  async getEpisodeById(id: string): Promise<EpisodeDetail | null> {
    await ensureEvaDb();
    const summary = await this.getEpisodeSummary(id);

    const allShards = await EmoShardStore.getAll();
    const shards = allShards
      .filter((s) => normalizeEpisodeIdFromShard(s) === id)
      .map((s) => ({ ...s, episodeId: id }))
      .sort((a, b) => a.startTime - b.startTime);

    if (!summary && shards.length === 0) return null;

    const createdAt =
      summary?.createdAt ??
      shards.reduce(
        (min, s) => (min ? (s.createdAt < min ? s.createdAt : min) : s.createdAt),
        ''
      );
    const updatedAt =
      summary?.updatedAt ??
      shards.reduce(
        (max, s) => (max ? (s.createdAt > max ? s.createdAt : max) : s.createdAt),
        ''
      );

    const stats = computeEpisodeStats(shards);

    return {
      id,
      title: summary?.title ?? null,
      note: summary?.note ?? null,
      createdAt,
      updatedAt,
      shards,
      summary: null,
      stats,
    };
  },

  async recordShard(episodeId: string, shard: EmoShard): Promise<void> {
    await ensureEvaDb();
    const existing = await this.getEpisodeSummary(episodeId);

    const nowIso = new Date().toISOString();
    const createdAt = existing?.createdAt ?? nowIso;

    const duration = shard.audioDurationSeconds ?? shard.features?.duration ?? 0;

    const next: EpisodeSummary = {
      id: episodeId,
      title: existing?.title ?? null,
      note: existing?.note ?? null,
      createdAt,
      updatedAt: nowIso,
      shardCount: (existing?.shardCount ?? 0) + 1,
      durationSeconds: (existing?.durationSeconds ?? 0) + duration,
      dominantEmotion: existing?.dominantEmotion ?? null,
      momentTypes: existing?.momentTypes ?? [],
      tags: existing?.tags ?? [],
    };

    await this.upsertEpisodeSummary(next);
  },

  async refreshEpisodeComputedFields(episodeId: string): Promise<void> {
    await ensureEvaDb();
    const detail = await this.getEpisodeById(episodeId);
    if (!detail) return;

    const existing = await this.getEpisodeSummary(episodeId);
    const computed = computeEpisodeSummaryFieldsFromShards(detail.shards);

    const next: EpisodeSummary = {
      id: episodeId,
      title: existing?.title ?? null,
      note: existing?.note ?? null,
      createdAt: existing?.createdAt ?? detail.createdAt,
      updatedAt: new Date().toISOString(),
      ...computed,
    };

    await this.upsertEpisodeSummary(next);
  },
};
