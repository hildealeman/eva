export type EvaAnalysisMode = 'none' | 'local' | 'cloud';

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
