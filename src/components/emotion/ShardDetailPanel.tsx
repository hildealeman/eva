'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { EmoShard, EmoShardStatus, EmotionReading } from '@/types/emotion';
import TagEditor from '@/components/emotion/TagEditor';
import StatusSelector from '@/components/emotion/StatusSelector';

function buildSuggestedTags(shard: EmoShard): string[] {
  const tags = new Set<string>();

  if (shard.semantic?.topics?.length) {
    shard.semantic.topics.forEach((t) => {
      const trimmed = t.trim();
      if (trimmed) tags.add(trimmed.toLowerCase());
    });
  }

  switch (shard.primaryEmotion) {
    case 'alegria':
      tags.add('momento positivo');
      break;
    case 'enojo':
      tags.add('frustración');
      break;
    case 'tristeza':
      tags.add('tristeza');
      break;
    case 'miedo':
      tags.add('ansiedad');
      break;
  }

  if (shard.arousal === 'alto') {
    tags.add('alta activación');
  }
  if (shard.prosodyFlags?.tension === 'high') {
    tags.add('tensión emocional');
  }

  if (shard.prosodyFlags?.crying === 'present') {
    tags.add('llanto');
  }
  if (shard.prosodyFlags?.shouting === 'present') {
    tags.add('voz elevada');
  }
  if (shard.prosodyFlags?.sighing === 'present') {
    tags.add('suspiros');
  }

  const list = Array.from(tags);
  return list.slice(0, 8);
}

function getMomentTypeStyles(momentType?: string): {
  label: string;
  className: string;
} {
  const t = (momentType || '').toLowerCase().trim();

  switch (t) {
    case 'check-in':
      return {
        label: 'Check-in',
        className:
          'inline-flex items-center rounded-full bg-sky-900/40 px-3 py-1 text-xs font-semibold text-sky-300 border border-sky-700/60',
      };
    case 'desahogo':
      return {
        label: 'Desahogo',
        className:
          'inline-flex items-center rounded-full bg-amber-900/40 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-700/60',
      };
    case 'crisis':
      return {
        label: 'Crisis',
        className:
          'inline-flex items-center rounded-full bg-rose-900/60 px-3 py-1 text-xs font-semibold text-rose-100 border border-rose-600/80',
      };
    case 'recuerdo':
      return {
        label: 'Recuerdo',
        className:
          'inline-flex items-center rounded-full bg-violet-900/40 px-3 py-1 text-xs font-semibold text-violet-300 border border-violet-700/60',
      };
    case 'meta':
      return {
        label: 'Meta / planes',
        className:
          'inline-flex items-center rounded-full bg-indigo-900/40 px-3 py-1 text-xs font-semibold text-indigo-300 border border-indigo-700/60',
      };
    case 'agradecimiento':
      return {
        label: 'Agradecimiento',
        className:
          'inline-flex items-center rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-700/60',
      };
    default:
      return {
        label: momentType || 'Otro momento',
        className:
          'inline-flex items-center rounded-full bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-100 border border-slate-700/70',
      };
  }
}

interface ShardDetailPanelProps {
  shard: EmoShard;
  onChange: (updates: Partial<EmoShard>) => void;
  onTagAdd: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  onStatusChange: (status: EmoShardStatus) => void;
}

export default function ShardDetailPanel({
  shard,
  onChange,
  onTagAdd,
  onTagRemove,
  onStatusChange,
}: ShardDetailPanelProps) {
  const safeFeatures =
    (shard as unknown as { features?: Partial<{ rms: unknown; peak: unknown; spectralCentroid: unknown; zcr: unknown; duration: unknown }> })
      .features ?? {};
  const safeSuggestedTags = Array.isArray(shard.suggestedTags)
    ? shard.suggestedTags
    : buildSuggestedTags(shard);

  const rawDuration =
    typeof safeFeatures.duration === 'number' && Number.isFinite(safeFeatures.duration)
      ? safeFeatures.duration
      : typeof (shard as unknown as { meta?: { startTime?: unknown; endTime?: unknown } })?.meta
            ?.startTime === 'number' &&
          typeof (shard as unknown as { meta?: { startTime?: unknown; endTime?: unknown } })?.meta
            ?.endTime === 'number'
        ? Math.max(
            0,
            ((shard as unknown as { meta: { endTime: number; startTime: number } }).meta.endTime as number) -
              ((shard as unknown as { meta: { endTime: number; startTime: number } }).meta.startTime as number)
          )
        : null;

  const rawIntensity =
    typeof shard.intensity === 'number' && Number.isFinite(shard.intensity)
      ? shard.intensity
      : typeof (shard as unknown as { analysis?: { emotion?: { intensity?: unknown } } })?.analysis
            ?.emotion?.intensity === 'number' &&
          Number.isFinite(
            (shard as unknown as { analysis: { emotion: { intensity: number } } }).analysis.emotion
              .intensity
          )
        ? (shard as unknown as { analysis: { emotion: { intensity: number } } }).analysis.emotion
            .intensity
        : null;
  const emotion = useMemo(() => {
    const fromAnalysis = shard.analysis?.emotion as
      | {
          primary?: string;
          valence?: string;
          activation?: string;
          distribution?: Record<string, number>;
          headline?: string | null;
          explanation?: string | null;
        }
      | undefined;

    if (fromAnalysis?.primary) {
      return fromAnalysis;
    }

    const legacyPrimary = shard.primaryEmotion;
    const legacyValence = shard.valence;
    const legacyActivation = shard.arousal;
    const legacyDistribution: Record<string, number> | undefined = shard.emotionLabels?.length
      ? Object.fromEntries(shard.emotionLabels.map((e) => [e.label, e.score]))
      : undefined;

    const hasAnyLegacy =
      !!legacyPrimary || !!legacyValence || !!legacyActivation || !!legacyDistribution;
    if (!hasAnyLegacy) return undefined;

    const built: EmotionReading = {
      primary: legacyPrimary ?? undefined,
      valence: legacyValence ?? undefined,
      activation: legacyActivation ?? undefined,
      distribution: legacyDistribution,
      headline: null,
      explanation: null,
    };

    return built;
  }, [
    shard.analysis?.emotion,
    shard.primaryEmotion,
    shard.valence,
    shard.arousal,
    shard.emotionLabels,
  ]);

  const distributionEntries = useMemo(() => {
    const dist = emotion?.distribution;
    if (!dist) return [] as Array<[string, number]>;
    return Object.entries(dist)
      .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [emotion?.distribution]);

  const formatPercent = useCallback((value: number): string => {
    const rounded = Math.round(value * 1000) / 10;
    const asString = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${asString}%`;
  }, []);

  const hasLocalBlobAudio = useMemo(() => {
    const blob = (shard as unknown as { audioBlob?: unknown }).audioBlob;
    return typeof Blob !== 'undefined' && blob instanceof Blob;
  }, [shard]);

  const hasPlayableAudio = hasLocalBlobAudio;

  const audioUrl = useMemo(() => {
    if (!hasLocalBlobAudio) return null;
    return URL.createObjectURL((shard as unknown as { audioBlob: Blob }).audioBlob);
  }, [hasLocalBlobAudio, shard]);

  useEffect(() => {
    if (!audioUrl) return;
    return () => {
      URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  return (
    <div className="space-y-6">
      <section className="space-y-2 text-sm">
        <div>Creado: {new Date(shard.createdAt).toLocaleString('es-MX')}</div>
        <div>Duración: {rawDuration != null ? `${rawDuration.toFixed(2)} s` : '-- s'}</div>
        <div>
          Intensidad:{' '}
          {rawIntensity != null ? `${(rawIntensity * 100).toFixed(1)}%` : '--'}
        </div>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Audio del momento</h2>
        {hasPlayableAudio && audioUrl ? (
          <div className="space-y-2">
            <audio
              controls
              src={audioUrl}
              className="w-full"
              onError={(e) => {
                if (!hasPlayableAudio) return;
                console.warn('[EVA1] Audio playback error', {
                  shardId: shard.id,
                  audioUrl,
                  eventType: (e as unknown as { type?: string })?.type,
                });
              }}
            >
              Tu navegador no soporta el elemento de audio.
            </audio>
            {shard.audioDurationSeconds != null && (
              <p className="text-xs text-slate-400">
                Duración ~ {shard.audioDurationSeconds.toFixed(2)} s
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Este shard no tiene audio disponible en este navegador (solo datos de análisis).
          </p>
        )}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Transcripción</h2>
        {(() => {
          const meta = (shard as unknown as { meta?: Record<string, unknown> }).meta ?? null;
          const transcript =
            (meta && typeof meta.transcript === 'string' ? (meta.transcript as string) : null) ??
            (typeof shard.transcript === 'string' ? shard.transcript : null);
          const transcriptLanguage =
            (meta && typeof meta.transcriptLanguage === 'string'
              ? (meta.transcriptLanguage as string)
              : null) ??
            (typeof shard.transcriptLanguage === 'string' ? shard.transcriptLanguage : null);
          const transcriptionConfidence =
            (meta && typeof meta.transcriptionConfidence === 'number'
              ? (meta.transcriptionConfidence as number)
              : null) ??
            (typeof shard.transcriptionConfidence === 'number'
              ? shard.transcriptionConfidence
              : null);

          return transcript ? (
            <>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{transcript}</p>
              {transcriptLanguage ? (
                <p className="text-xs text-slate-400">Idioma detectado: {transcriptLanguage}</p>
              ) : null}
              {typeof transcriptionConfidence === 'number' ? (
                <p className="text-xs text-slate-400">
                  Confianza: {(transcriptionConfidence * 100).toFixed(1)}%
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-slate-500">(sin transcripción todavía)</p>
          );
        })()}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Lectura emocional</h2>

        {!emotion?.primary ? (
          <p className="text-xs text-slate-400">
            Aún no hay una lectura emocional disponible para este momento.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-300">
              Emoción principal: <span className="font-semibold">{emotion.primary}</span>
              {emotion.valence ? ` · Valencia: ${emotion.valence}` : ''}
              {emotion.activation ? ` · Activación: ${emotion.activation}` : ''}
            </p>

            {distributionEntries.length > 0 ? (
              <ul className="text-xs text-slate-300 space-y-1">
                {distributionEntries.map(([label, value], index) => (
                  <li key={`${label}-${index}`}>
                    {label}: {formatPercent(value * 100)}
                  </li>
                ))}
              </ul>
            ) : null}

            {emotion.headline ? (
              <p className="text-xs text-slate-400">{emotion.headline}</p>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Análisis semántico</h2>
        {(() => {
          const analysisSemantic = (shard as unknown as { analysis?: { semantic?: unknown } })
            .analysis?.semantic;
          const semantic =
            (shard.semantic ?? null) ??
            (analysisSemantic && typeof analysisSemantic === 'object'
              ? (analysisSemantic as unknown as typeof shard.semantic)
              : null);

          const hasAny =
            !!semantic?.summary ||
            (!!semantic?.topics && semantic.topics.length > 0) ||
            !!semantic?.momentType ||
            !!semantic?.flags?.needsFollowup ||
            !!semantic?.flags?.possibleCrisis;

          if (!hasAny) {
            return <p className="text-xs text-slate-500">(análisis en progreso)</p>;
          }

          return (
            <>
              {semantic?.summary ? (
                <p className="text-sm text-slate-100 leading-relaxed">{semantic.summary}</p>
              ) : null}

              {semantic?.topics?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {semantic.topics?.map((topic, i) => (
                    <span
                      key={`${topic}-${i}`}
                      className="inline-flex items-center rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-100 border border-slate-700/60"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : null}

              {semantic?.momentType ? (
                <div className="mt-3">
                  {(() => {
                    const { label, className } = getMomentTypeStyles(semantic?.momentType);
                    return <span className={className}>{label}</span>;
                  })()}
                </div>
              ) : null}

              {(semantic?.flags?.needsFollowup || semantic?.flags?.possibleCrisis) ? (
                <div className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
                  {semantic?.flags?.possibleCrisis
                    ? '⚠️ Este momento podría indicar una crisis. Vale la pena revisarlo con calma.'
                    : 'ℹ️ Este momento sugiere que podría necesitarse un seguimiento en otra sesión.'}
                </div>
              ) : null}
            </>
          );
        })()}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Rasgos de la señal</h2>
        <div className="text-xs text-slate-300">
          RMS:{' '}
          {typeof safeFeatures.rms === 'number' && Number.isFinite(safeFeatures.rms)
            ? safeFeatures.rms.toFixed(4)
            : '--'}
        </div>
        <div className="text-xs text-slate-300">
          Pico:{' '}
          {typeof safeFeatures.peak === 'number' && Number.isFinite(safeFeatures.peak)
            ? safeFeatures.peak.toFixed(4)
            : '--'}
        </div>
        {typeof safeFeatures.spectralCentroid === 'number' &&
          Number.isFinite(safeFeatures.spectralCentroid) && (
            <div className="text-xs text-slate-300">
              Frecuencia central: {safeFeatures.spectralCentroid.toFixed(2)}
            </div>
          )}
        {typeof safeFeatures.zcr === 'number' && Number.isFinite(safeFeatures.zcr) && (
          <div className="text-xs text-slate-300">
            ZCR: {safeFeatures.zcr.toFixed(4)}
          </div>
        )}
      </section>

      {safeSuggestedTags.length > 0 && (
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-sm">Etiquetas sugeridas</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {safeSuggestedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-100 border border-slate-700/60"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Tus etiquetas</h2>
        <TagEditor tags={shard.userTags} onAdd={onTagAdd} onRemove={onTagRemove} />
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Notas</h2>
        <textarea
          className="w-full min-h-[100px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          placeholder="¿Qué estabas sintiendo aquí?"
          value={shard.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Estado</h2>
        <StatusSelector value={shard.status} onChange={onStatusChange} />
      </section>
    </div>
  );
}
