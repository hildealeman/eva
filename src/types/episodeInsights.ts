export interface EpisodeInsightsStats {
  totalShards: number;
  durationSeconds: number | null;
  shardsWithEmotion: number;
  firstShardAt: number | null;
  lastShardAt: number | null;
}

export interface EpisodeInsightsEmotionSummary {
  primaryCounts: Record<string, number>;
  valenceCounts: Record<string, number>;
  activationCounts: Record<string, number>;
}

export type EpisodeInsightsValence = 'positive' | 'neutral' | 'negative';
export type EpisodeInsightsActivation = 'low' | 'medium' | 'high';

export interface EpisodeInsightsKeyEmotion {
  primary: string | null;
  valence: EpisodeInsightsValence | null;
  activation: EpisodeInsightsActivation | null;
  headline: string | null;
}

export type EpisodeKeyMomentReason = 'highestIntensity' | 'strongNegative' | 'strongPositive';

export interface EpisodeKeyMoment {
  shardId: string;
  episodeId: string;
  startTime: number | null;
  endTime: number | null;
  reason: EpisodeKeyMomentReason;
  emotion: EpisodeInsightsKeyEmotion;
  transcriptSnippet: string | null;
}

export interface EpisodeInsightsResponse {
  episodeId: string;
  stats: EpisodeInsightsStats;
  emotionSummary: EpisodeInsightsEmotionSummary;
  keyMoments: EpisodeKeyMoment[];
}
