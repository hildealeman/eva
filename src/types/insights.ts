import type { EpisodeSummary } from '@/types/emotion';

export interface TagStat {
  tag: string;
  count: number;
}

export interface StatusStat {
  status: string;
  count: number;
}

export interface EmotionStat {
  emotion: string;
  count: number;
}

export interface EpisodeInsights {
  totalEpisodes: number;
  totalShards: number;
  totalDurationSeconds: number | null;
  tags: TagStat[];
  statuses: StatusStat[];
  emotions: EmotionStat[];
  lastEpisode: EpisodeSummary | null;
}
