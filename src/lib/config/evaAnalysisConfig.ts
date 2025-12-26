export type EvaAnalysisMode = 'none' | 'local' | 'cloud';

export type EvaDataMode = 'local' | 'api';

export const evaDataMode: EvaDataMode =
  process.env.NEXT_PUBLIC_EVA_DATA_MODE === 'api' ? 'api' : 'local';

export function getEvaDataMode(): EvaDataMode {
  return evaDataMode;
}

export function getEvaAnalysisMode(): EvaAnalysisMode {
  const raw = process.env.NEXT_PUBLIC_EVA_ANALYSIS_MODE ?? 'none';
  if (raw === 'local' || raw === 'cloud') return raw;
  return 'none';
}

export function getLocalAnalysisBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_EVA_LOCAL_ANALYSIS_BASE ?? '';
  return raw || null;
}

export function getCloudAnalysisBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_EVA_CLOUD_ANALYSIS_BASE ?? '';
  return raw || null;
}
