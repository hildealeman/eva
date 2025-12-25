export type ShardAnalysisUiState = 'idle' | 'analyzing' | 'analyzed' | 'error';

export type ShardAnalysisErrorCode =
  | 'backend_unavailable'
  | 'invalid_request'
  | 'timeout'
  | 'network_error'
  | 'http_error'
  | 'unknown';

export type ShardAnalysisUiRecord = {
  state: Exclude<ShardAnalysisUiState, 'analyzed' | 'idle'>;
  errorCode?: ShardAnalysisErrorCode;
  errorMessage?: string;
  updatedAt: number;
};

type Listener = () => void;

const records = new Map<string, ShardAnalysisUiRecord>();
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const ShardAnalysisStateStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot() {
    return records;
  },

  get(id: string): ShardAnalysisUiRecord | undefined {
    return records.get(id);
  },

  setAnalyzing(id: string) {
    records.set(id, { state: 'analyzing', updatedAt: Date.now() });
    emit();
  },

  setError(id: string, errorCode: ShardAnalysisErrorCode, errorMessage?: string) {
    records.set(id, {
      state: 'error',
      errorCode,
      errorMessage,
      updatedAt: Date.now(),
    });
    emit();
  },

  clear(id: string) {
    if (!records.has(id)) return;
    records.delete(id);
    emit();
  },
};
