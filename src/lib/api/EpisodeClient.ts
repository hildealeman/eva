import type { EpisodeDetail, EpisodeSummary, EmoShard } from '@/types/emotion';
import type { EpisodeInsightsResponse } from '@/types/episodeInsights';
import {
  getCloudAnalysisBaseUrl,
  getEvaAnalysisMode,
  getEvaDataMode,
  getLocalAnalysisBaseUrl,
} from '@/lib/config/evaAnalysisConfig';
import { EpisodeStore } from '@/lib/store/EpisodeStore';
import { EmoShardStore } from '@/lib/store/EmoShardStore';

export interface EpisodeClient {
  getAllEpisodes(): Promise<EpisodeSummary[]>;
  getEpisodeDetail(id: string): Promise<EpisodeDetail | null>;
  getEpisodeInsights(id: string): Promise<EpisodeInsightsResponse>;
  updateEpisodeMeta(
    id: string,
    updates: { title?: string | null; note?: string | null }
  ): Promise<void>;
  updateShard(id: string, updates: Partial<EmoShard>): Promise<EmoShard | null>;
  publishShard(shardId: string): Promise<EmoShard | null>;
  deleteShard(shardId: string, reason: string): Promise<EmoShard | null>;
  deleteEpisode(id: string): Promise<void>;
}

function getEvaApiBaseUrl(): string | null {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') return null;
  return mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
}

class LocalEpisodeClient implements EpisodeClient {
  async getAllEpisodes(): Promise<EpisodeSummary[]> {
    return EpisodeStore.getAllEpisodes();
  }

  async getEpisodeDetail(id: string): Promise<EpisodeDetail | null> {
    return EpisodeStore.getEpisodeById(id);
  }

  async getEpisodeInsights(id: string): Promise<EpisodeInsightsResponse> {
    void id;
    throw new Error('backend_unavailable');
  }

  async updateEpisodeMeta(
    id: string,
    updates: { title?: string | null; note?: string | null }
  ): Promise<void> {
    const existing = await EpisodeStore.getEpisodeSummary(id);
    const detail = existing ? null : await EpisodeStore.getEpisodeById(id);

    const nowIso = new Date().toISOString();

    const next: EpisodeSummary = {
      id,
      title: updates.title !== undefined ? updates.title : existing?.title ?? null,
      note: updates.note !== undefined ? updates.note : existing?.note ?? null,
      createdAt: existing?.createdAt ?? detail?.createdAt ?? nowIso,
      updatedAt: nowIso,
      shardCount: existing?.shardCount ?? detail?.stats?.shardCount ?? detail?.shards?.length ?? 0,
      durationSeconds:
        existing?.durationSeconds ?? detail?.stats?.totalDurationSeconds ?? 0,
      dominantEmotion: existing?.dominantEmotion ?? null,
      momentTypes: existing?.momentTypes ?? [],
      tags: existing?.tags ?? [],
    };

    await EpisodeStore.upsertEpisodeSummary(next);
  }

  async updateShard(id: string, updates: Partial<EmoShard>): Promise<EmoShard | null> {
    const existing = await EmoShardStore.get(id);
    if (!existing) return null;
    await EmoShardStore.update(id, updates);
    return { ...existing, ...updates };
  }

  async publishShard(shardId: string): Promise<EmoShard | null> {
    void shardId;
    return null;
  }

  async deleteShard(shardId: string, reason: string): Promise<EmoShard | null> {
    void shardId;
    void reason;
    return null;
  }

  async deleteEpisode(id: string): Promise<void> {
    await EmoShardStore.deleteByEpisodeId(id);
    await EpisodeStore.deleteEpisodeSummary(id);
  }
}

type EpisodeSummaryResponse = EpisodeSummary;

type EpisodeDetailResponse = EpisodeDetail & {
  shards?: unknown[];
};

function coerceShard(raw: unknown): EmoShard {
  return raw as EmoShard;
}

function coerceEpisodeDetail(raw: EpisodeDetailResponse): EpisodeDetail {
  const shardsRaw = Array.isArray(raw.shards) ? raw.shards : [];
  return {
    ...(raw as EpisodeDetail),
    shards: shardsRaw.map(coerceShard),
  };
}

class ApiEpisodeClient implements EpisodeClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async getAllEpisodes(): Promise<EpisodeSummary[]> {
    const url = `${this.baseUrl}/episodes`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      console.error('EVA episodes endpoint error', response.status);
      return [];
    }

    const json = (await response.json()) as EpisodeSummaryResponse[];
    return Array.isArray(json) ? (json as EpisodeSummary[]) : [];
  }

  async getEpisodeDetail(id: string): Promise<EpisodeDetail | null> {
    const url = `${this.baseUrl}/episodes/${encodeURIComponent(id)}`;
    const response = await fetch(url, { method: 'GET' });

    if (response.status === 404) return null;
    if (!response.ok) {
      console.error('EVA episode detail endpoint error', response.status);
      return null;
    }

    const json = (await response.json()) as EpisodeDetailResponse;
    if (!json) return null;
    return coerceEpisodeDetail(json);
  }

  async getEpisodeInsights(id: string): Promise<EpisodeInsightsResponse> {
    const url = `${this.baseUrl}/episodes/${encodeURIComponent(id)}/insights`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      console.error('EVA episode insights endpoint error', response.status);
      throw new Error(`http_${response.status}`);
    }

    return (await response.json()) as EpisodeInsightsResponse;
  }

  async updateEpisodeMeta(
    id: string,
    updates: { title?: string | null; note?: string | null }
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.note !== undefined) body.note = updates.note;
    if (Object.keys(body).length === 0) return;

    const url = `${this.baseUrl}/episodes/${encodeURIComponent(id)}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('EVA update episode endpoint error', response.status);
      return;
    }

    // Best-effort: keep local IndexedDB in sync for offline continuity.
    try {
      const existing = await EpisodeStore.getEpisodeSummary(id);
      const nowIso = new Date().toISOString();
      const next: EpisodeSummary = {
        id,
        title: updates.title !== undefined ? updates.title : existing?.title ?? null,
        note: updates.note !== undefined ? updates.note : existing?.note ?? null,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
        shardCount: existing?.shardCount ?? 0,
        durationSeconds: existing?.durationSeconds ?? 0,
        dominantEmotion: existing?.dominantEmotion ?? null,
        momentTypes: existing?.momentTypes ?? [],
        tags: existing?.tags ?? [],
      };
      await EpisodeStore.upsertEpisodeSummary(next);
    } catch (err) {
      console.warn('Failed to sync local episode meta after API patch', err);
    }
  }

  async updateShard(id: string, updates: Partial<EmoShard>): Promise<EmoShard | null> {
    const body: Record<string, unknown> = {};

    const user = updates.analysis?.user;

    const status = user?.status ?? updates.status;
    const userTags = user?.userTags ?? updates.userTags;
    const userNotes = user?.userNotes ?? updates.notes;
    const transcriptOverride = user?.transcriptOverride;

    if (status !== undefined) body.status = status;
    if (userTags !== undefined) body.userTags = userTags;
    if (userNotes !== undefined) body.userNotes = userNotes;
    if (transcriptOverride !== undefined) body.transcriptOverride = transcriptOverride;

    if (Object.keys(body).length === 0) {
      return null;
    }

    const url = `${this.baseUrl}/shards/${encodeURIComponent(id)}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      console.error('EVA update shard endpoint error', response.status);
      return null;
    }

    const json = (await response.json()) as unknown;
    return coerceShard(json);
  }

  async publishShard(shardId: string): Promise<EmoShard | null> {
    const url = `${this.baseUrl}/shards/${encodeURIComponent(shardId)}/publish`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(
            'EVA publishShard: shard no encontrado en EVA 2, probablemente aún no sincronizado',
            shardId,
            response.status
          );
          return null;
        }
        if (response.status === 400) {
          try {
            const json = (await response.json()) as { detail?: unknown };
            const detail = typeof json?.detail === 'string' ? json.detail : null;

            console.info('[EVA1] publishShard 400 (esperado en algunos casos)', {
              status: response.status,
              detail,
            });

            if (detail) {
              throw new Error(`http_400_${detail}`);
            }
          } catch (err) {
            if (err instanceof Error && err.message.startsWith('http_400_')) throw err;
          }
        }

        if (response.status >= 500) {
          console.error('EVA publish shard endpoint error', response.status);
        } else {
          console.warn('EVA publish shard endpoint non-OK response', response.status);
        }

        throw new Error(`http_${response.status}`);
      }

      const json = (await response.json()) as unknown;
      return coerceShard(json);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('http_')) throw err;
      console.error('EVA publish shard endpoint network error', err);
      throw new Error('network_error');
    }
  }

  async deleteShard(shardId: string, reason: string): Promise<EmoShard | null> {
    const url = `${this.baseUrl}/shards/${encodeURIComponent(shardId)}/delete`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        console.error('EVA delete shard endpoint error', response.status);
        throw new Error(`http_${response.status}`);
      }

      const json = (await response.json()) as unknown;
      return coerceShard(json);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('http_')) throw err;
      console.error('EVA delete shard endpoint network error', err);
      throw new Error('network_error');
    }
  }

  async deleteEpisode(id: string): Promise<void> {
    // Note: EVA 2 does not expose DELETE endpoints yet.
    // In api mode we only delete local IndexedDB copies so the UI can manage local state.
    await EmoShardStore.deleteByEpisodeId(id);
    await EpisodeStore.deleteEpisodeSummary(id);
  }
}

export function getEpisodeClient(): EpisodeClient {
  const mode = getEvaDataMode();
  if (mode === 'local') return new LocalEpisodeClient();

  const baseUrl = getEvaApiBaseUrl();
  if (!baseUrl) {
    console.warn(
      'EVA_DATA_MODE=api but no analysis base URL is configured; falling back to local EpisodeStore.'
    );
    return new LocalEpisodeClient();
  }

  return new ApiEpisodeClient(baseUrl);
}
