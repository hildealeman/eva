import type { EmoShard } from '@/types/emotion';
import { createStore, del, get, keys, set } from 'idb-keyval';
import type { ShardAnalysisResult } from '@/lib/api/evaAnalysisClient';
import { ensureEvaDb } from '@/lib/store/evaDb';

const DB_NAME = 'eva-db';
const STORE_NAME = 'emo-shards';

const store = createStore(DB_NAME, STORE_NAME);

export const EmoShardStore = {
  async save(shard: EmoShard): Promise<void> {
    await ensureEvaDb();
    await set(shard.id, shard, store);
  },

  async get(id: string): Promise<EmoShard | undefined> {
    await ensureEvaDb();
    return get<EmoShard>(id, store);
  },

  async getAll(): Promise<EmoShard[]> {
    await ensureEvaDb();
    const allKeys = await keys(store);
    const all = await Promise.all(
      allKeys.map((k) => get<EmoShard>(k as IDBValidKey, store))
    );
    return all.filter((s): s is EmoShard => !!s);
  },

  async update(id: string, updates: Partial<EmoShard>): Promise<void> {
    await ensureEvaDb();
    const existing = await this.get(id);
    if (!existing) throw new Error(`EmoShard ${id} no encontrado`);
    const merged: EmoShard = { ...existing, ...updates };
    await set(id, merged, store);
  },

  async applyAnalysisToShard(
    id: string,
    analysis: ShardAnalysisResult
  ): Promise<EmoShard | null> {
    await ensureEvaDb();
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: EmoShard = {
      ...existing,
      transcript: analysis.transcript ?? existing.transcript ?? null,
      transcriptLanguage:
        analysis.transcriptLanguage ?? existing.transcriptLanguage ?? null,
      transcriptionConfidence:
        analysis.transcriptionConfidence ?? existing.transcriptionConfidence ?? null,
      primaryEmotion: analysis.primaryEmotion ?? existing.primaryEmotion ?? null,
      emotionLabels: analysis.emotionLabels ?? existing.emotionLabels ?? [],
      valence: analysis.valence ?? existing.valence ?? null,
      arousal: analysis.arousal ?? existing.arousal ?? null,
      prosodyFlags: {
        ...(existing.prosodyFlags ?? {}),
        ...(analysis.prosodyFlags ?? {}),
      },
      analysisSource: analysis.analysisSource ?? existing.analysisSource ?? null,
      analysisMode: analysis.analysisMode ?? existing.analysisMode ?? null,
      analysisVersion: analysis.analysisVersion ?? existing.analysisVersion ?? null,
      analysisAt: analysis.analysisAt ?? existing.analysisAt ?? null,

      semantic: analysis.semantic ?? existing.semantic ?? null,
    };

    await set(id, updated, store);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await ensureEvaDb();
    await del(id, store);
  },

  async clear(): Promise<void> {
    await ensureEvaDb();
    const allKeys = await keys(store);
    await Promise.all(allKeys.map((k) => del(k as IDBValidKey, store)));
  },
};
