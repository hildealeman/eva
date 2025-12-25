export type EmoShardStatus = 'raw' | 'reviewed' | 'published';

export type CoreEmotion =
  | 'alegria'
  | 'calma'
  | 'tristeza'
  | 'enojo'
  | 'miedo'
  | 'sorpresa'
  | 'cansancio'
  | 'neutro';

export type Valence = 'negativo' | 'neutral' | 'positivo';

export type ArousalLevel = 'bajo' | 'medio' | 'alto';

export interface EmotionLabelScore {
  label: string;
  score: number;
}

export interface ProsodyFlags {
  laughter?: 'none' | 'light' | 'strong';
  crying?: 'none' | 'present';
  shouting?: 'none' | 'present';
  sighing?: 'none' | 'present';
  tension?: 'none' | 'light' | 'high';
}

export interface SemanticFlags {
  needsFollowup: boolean;
  possibleCrisis: boolean;
}

export interface SemanticAnalysis {
  summary?: string;
  topics?: string[];
  momentType?: string;
  flags?: SemanticFlags;
}

export interface EmoFeatures {
  rms: number; // energía promedio
  peak: number; // pico máximo
  pitch?: number | null; // opcional
  zcr?: number | null; // zero-crossing rate
  spectralCentroid?: number | null;
  tempo?: number | null; // opcional
  duration: number; // en segundos
}

export interface EmoShard {
  id: string;
  createdAt: string;
  source: 'mic' | 'file';
  startTime: number; // inicio del clip (segundos)
  endTime: number; // fin del clip (segundos)
  intensity: number; // 0–1
  features: EmoFeatures;
  // suggestedTags = etiquetas acústicas heurísticas.
  // emotionLabels = etiquetas semánticas generadas por modelos (prosodia + contenido).
  suggestedTags: string[];
  userTags: string[];
  notes?: string;
  status: EmoShardStatus;

  audioSampleRate?: number;
  audioDurationSeconds?: number;
  audioBlob?: Blob;

  transcript?: string | null;
  transcriptLanguage?: string | null;
  transcriptionConfidence?: number | null;

  primaryEmotion?: CoreEmotion | null;
  emotionLabels?: EmotionLabelScore[];
  valence?: Valence | null;
  arousal?: ArousalLevel | null;
  prosodyFlags?: ProsodyFlags;

  analysisSource?: 'local' | 'cloud' | null;
  analysisMode?: 'automatic' | 'manual' | null;
  analysisVersion?: string | null;
  analysisAt?: string | null;

  semantic?: SemanticAnalysis | null;
}
