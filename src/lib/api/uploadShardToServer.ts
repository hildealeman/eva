import { getEvaDataMode, getEvaAnalysisMode, getLocalAnalysisBaseUrl, getCloudAnalysisBaseUrl } from '@/lib/config/evaAnalysisConfig';
import type { EmoShard } from '@/types/emotion';

function getEva2BaseUrl(): string | null {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') return null;
  const base = mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
  return base ? base.replace(/\/$/, '') : null;
}

function guessFilenameFromBlob(blob: Blob): string {
  const type = (blob.type ?? '').toLowerCase();
  if (type.includes('wav')) return 'clip.wav';
  if (type.includes('webm')) return 'clip.webm';
  if (type.includes('mpeg')) return 'clip.mp3';
  if (type.includes('mp4')) return 'clip.mp4';
  return 'clip.audio';
}

export async function uploadShardToServer(
  episodeId: string,
  blob: Blob,
  startTime: number,
  endTime: number,
  meta?: Record<string, unknown> | null
): Promise<{
  success: boolean;
  status: number;
  data?: EmoShard;
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

  const formData = new FormData();
  formData.append('file', blob, guessFilenameFromBlob(blob));
  if (Number.isFinite(startTime)) formData.append('start_time', String(startTime));
  if (Number.isFinite(endTime)) formData.append('end_time', String(endTime));
  if (meta && typeof meta === 'object') {
    try {
      formData.append('meta', JSON.stringify(meta));
    } catch {}
  }

  const url = `${baseUrl}/episodes/${encodeURIComponent(episodeId)}/shards`;

  try {
    console.log('[EVA1] uploadShardToServer →', {
      episodeId,
      start_time: startTime,
      end_time: endTime,
      blobType: blob?.type,
      blobSize: blob?.size,
      url,
    });

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const status = res.status;

      if (status === 404) {
        console.error('[EVA1] uploadShardToServer 404 episode_not_found', {
          episodeId,
          url,
          body: text,
        });
        return { success: false, status, errorText: text || 'episode_not_found' };
      }

      if (status >= 500) {
        console.error('[EVA1] uploadShardToServer 5xx server_error', {
          status,
          episodeId,
          url,
          body: text,
        });
        return { success: false, status, errorText: text || 'server_error' };
      }

      console.error('[EVA1] uploadShardToServer FAILED', {
        status,
        episodeId,
        url,
        body: text,
      });
      return { success: false, status, errorText: text || `http_${status}` };
    }

    const json = (await res.json()) as unknown;
    const remoteShard = json as EmoShard;
    console.log('[EVA1] uploadShardToServer OK', remoteShard);
    return { success: true, status: res.status, data: remoteShard };
  } catch (err) {
    console.error('[EVA1] uploadShardToServer FAILED', err);
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, status: 0, errorText: message || 'network_error' };
  }
}
