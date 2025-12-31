import { getEvaDataMode, getEvaAnalysisMode, getLocalAnalysisBaseUrl, getCloudAnalysisBaseUrl } from '@/lib/config/evaAnalysisConfig';
import type { EpisodeDetail } from '@/types/emotion';

function getEva2BaseUrl(): string | null {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') return null;
  const base = mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
  return base ? base.replace(/\/$/, '') : null;
}

export async function curateEpisode(
  episodeId: string,
  maxShards = 5
): Promise<{
  success: boolean;
  status: number;
  data?: EpisodeDetail;
  errorText?: string;
}> {
  const dataMode = getEvaDataMode();
  if (dataMode !== 'api') {
    return { success: false, status: 0, errorText: 'backend_unavailable' };
  }

  const baseUrl = getEva2BaseUrl();
  if (!baseUrl) {
    return { success: false, status: 0, errorText: 'backend_unavailable' };
  }

  const url = `${baseUrl}/episodes/${encodeURIComponent(episodeId)}/curate`;

  try {
    console.log('[EVA1] curateEpisode →', { episodeId, max_shards: maxShards, url });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_shards: maxShards }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const status = res.status;

      if (status === 404) {
        console.error('[EVA1] curateEpisode 404 episode_not_found', { episodeId, url, body: text });
        return { success: false, status, errorText: text || 'episode_not_found' };
      }

      if (status === 501) {
        console.warn('[EVA1] curateEpisode 501 not_implemented', { episodeId, url, body: text });
        return { success: false, status, errorText: text || 'not_implemented' };
      }

      if (status >= 500) {
        console.error('[EVA1] curateEpisode 5xx server_error', { status, episodeId, url, body: text });
        return { success: false, status, errorText: text || 'server_error' };
      }

      console.error('[EVA1] curateEpisode FAILED', { status, episodeId, url, body: text });
      return { success: false, status, errorText: text || `http_${status}` };
    }

    const json = (await res.json()) as EpisodeDetail;
    console.log('[EVA1] curateEpisode OK', { episodeId, shardCount: json?.shards?.length ?? null });
    return { success: true, status: res.status, data: json };
  } catch (err) {
    console.error('[EVA1] curateEpisode FAILED', err);
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, status: 0, errorText: message || 'network_error' };
  }
}
