import type { EpisodeInsights } from '@/types/insights';
import type { EpisodeSummary } from '@/types/emotion';
import {
  getCloudAnalysisBaseUrl,
  getEvaAnalysisMode,
  getEvaDataMode,
  getLocalAnalysisBaseUrl,
} from '@/lib/config/evaAnalysisConfig';
import { EpisodeStore } from '@/lib/store/EpisodeStore';
import { EmoShardStore } from '@/lib/store/EmoShardStore';

function getEvaApiBaseUrl(): string | null {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') return null;
  return mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
}

async function computeLocalInsights(): Promise<EpisodeInsights> {
  const episodes = await EpisodeStore.getAllEpisodes();
  const shards = await EmoShardStore.getAll();

  const totalEpisodes = episodes.length;
  const totalShards = shards.length;

  const durations: number[] = [];
  for (const s of shards) {
    if (typeof s.startTime === 'number' && typeof s.endTime === 'number') {
      const delta = s.endTime - s.startTime;
      if (delta > 0) durations.push(delta);
      continue;
    }

    const fallback = s.audioDurationSeconds ?? s.features?.duration;
    if (typeof fallback === 'number' && fallback > 0) durations.push(fallback);
  }

  const totalDurationSeconds = durations.length
    ? durations.reduce((a, b) => a + b, 0)
    : null;

  const tagCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const emotionCounts: Record<string, number> = {};

  for (const s of shards) {
    const tags = s.userTags ?? [];
    for (const t of tags) {
      const key = String(t);
      if (!key) continue;
      tagCounts[key] = (tagCounts[key] ?? 0) + 1;
    }

    if (s.status) {
      statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
    }

    const primary = s.primaryEmotion ?? null;
    if (primary) {
      emotionCounts[primary] = (emotionCounts[primary] ?? 0) + 1;
    }
  }

  const tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  const statuses = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }));

  const emotions = Object.entries(emotionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([emotion, count]) => ({ emotion, count }));

  let lastEpisode: EpisodeSummary | null = null;
  if (episodes.length > 0) {
    lastEpisode = episodes
      .slice()
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
  }

  return {
    totalEpisodes,
    totalShards,
    totalDurationSeconds,
    tags,
    statuses,
    emotions,
    lastEpisode,
  };
}

export async function getEpisodeInsights(): Promise<EpisodeInsights> {
  const dataMode = getEvaDataMode();
  const baseUrl = getEvaApiBaseUrl();

  if (dataMode === 'api' && baseUrl) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/episodes/insights`, {
        method: 'GET',
      });
      if (res.ok) {
        const json = (await res.json()) as EpisodeInsights;
        return json;
      }
      console.error('EVA insights endpoint error', res.status);
    } catch (err) {
      console.error('EVA insights endpoint network error', err);
    }
  }

  return computeLocalInsights();
}
