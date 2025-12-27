export type EvaAnalysisMode = 'none' | 'local' | 'cloud';

export type EvaDataMode = 'local' | 'api';

export function getEvaDataMode(): EvaDataMode {
  const raw = process.env.NEXT_PUBLIC_EVA_DATA_MODE?.toLowerCase();
  if (raw === 'local' || raw === 'api') {
    return raw;
  }
  return 'api';
}

export function getEvaAnalysisMode(): EvaAnalysisMode {
  const raw = process.env.NEXT_PUBLIC_EVA_ANALYSIS_MODE?.toLowerCase();
  if (raw === 'none') return 'none';
  if (raw === 'local' || raw === 'cloud') return raw;
  return 'local';
}

export function getLocalAnalysisBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_EVA_LOCAL_ANALYSIS_BASE ?? '';
  const trimmed = raw.trim();
  if (trimmed) return trimmed;
  return 'http://localhost:5005';
}

export function getCloudAnalysisBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_EVA_CLOUD_ANALYSIS_BASE ?? '';
  return raw || null;
}
