import type { EpisodeDetail, EpisodeSummary, EmoShard } from '@/types/emotion';
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
  updateEpisodeMeta(
    id: string,
    updates: { title?: string | null; note?: string | null }
  ): Promise<void>;
  updateShard(id: string, updates: Partial<EmoShard>): Promise<EmoShard | null>;
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

  async updateEpisodeMeta(
    _id: string,
    _updates: { title?: string | null; note?: string | null }
  ): Promise<void> {
    void _id;
    void _updates;
    return;
  }

  async updateShard(id: string, updates: Partial<EmoShard>): Promise<EmoShard | null> {
    const existing = await EmoShardStore.get(id);
    if (!existing) return null;
    await EmoShardStore.update(id, updates);
    return { ...existing, ...updates };
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
    }
  }

  async updateShard(id: string, updates: Partial<EmoShard>): Promise<EmoShard | null> {
    const body: Record<string, unknown> = {};

    if (updates.status !== undefined) body.status = updates.status;
    if (updates.userTags !== undefined) body.userTags = updates.userTags;
    if (updates.notes !== undefined) body.notes = updates.notes;
    if (updates.transcript !== undefined) body.transcript = updates.transcript;

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
