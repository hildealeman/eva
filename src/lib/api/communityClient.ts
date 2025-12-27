import {
  getCloudAnalysisBaseUrl,
  getEvaAnalysisMode,
  getEvaDataMode,
  getLocalAnalysisBaseUrl,
} from '@/lib/config/evaAnalysisConfig';

export type CommunityRole = 'ghost' | 'active';
export type CommunityMode = 'passive' | 'active';

export interface Profile {
  role: CommunityRole;
  mode: CommunityMode;
}

export type EthicalTrend = 'onTrack' | 'behind' | 'regressing';

export interface ProgressVotes {
  upvotes: number;
  downvotes: number;
}

export interface ProgressSummary {
  progressTowardsActivation: number;
  activitySeconds: number;
  votes: ProgressVotes;
  ethicalTrend: EthicalTrend;
}

function getEva2BaseUrl(): string | null {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') return null;
  const base = mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
  return base ? base.replace(/\/$/, '') : null;
}

async function fetchJson<T>(path: string): Promise<T> {
  const dataMode = getEvaDataMode();
  if (dataMode !== 'api') {
    throw new Error('backend_unavailable');
  }

  const baseUrl = getEva2BaseUrl();
  if (!baseUrl) {
    throw new Error('backend_unavailable');
  }

  const res = await fetch(`${baseUrl}${path}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }

  return (await res.json()) as T;
}

export async function fetchMyProfile(): Promise<Profile> {
  return fetchJson<Profile>('/me/profile');
}

export async function fetchMyProgress(): Promise<ProgressSummary> {
  return fetchJson<ProgressSummary>('/me/progress');
}
