'use client';

import { useEffect, useMemo } from 'react';
import type { EmoShard, EmoShardStatus } from '@/types/emotion';
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
  const suggestedTags = buildSuggestedTags(shard);
  const audioUrl = useMemo(() => {
    if (!shard.audioBlob) return null;
    return URL.createObjectURL(shard.audioBlob);
  }, [shard.audioBlob]);

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
        <div>Duración: {shard.features.duration.toFixed(2)} s</div>
        <div>Intensidad: {(shard.intensity * 100).toFixed(1)}%</div>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Audio del momento</h2>
        {audioUrl ? (
          <div className="space-y-2">
            <audio controls src={audioUrl} className="w-full">
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
            Este clip aún no tiene audio asociado.
          </p>
        )}
      </section>

      {shard.transcript && (
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-sm">Transcripción</h2>
          <p className="text-sm text-slate-200 whitespace-pre-wrap">
            {shard.transcript}
          </p>
          {shard.transcriptLanguage && (
            <p className="text-xs text-slate-400">
              Idioma detectado: {shard.transcriptLanguage}
            </p>
          )}
          {typeof shard.transcriptionConfidence === 'number' && (
            <p className="text-xs text-slate-400">
              Confianza: {(shard.transcriptionConfidence * 100).toFixed(1)}%
            </p>
          )}
        </section>
      )}

      {(shard.primaryEmotion || (shard.emotionLabels && shard.emotionLabels.length > 0)) && (
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-sm">Lectura emocional</h2>

          {shard.primaryEmotion && (
            <p className="text-sm text-slate-200">
              Emoción principal: <span className="font-semibold">{shard.primaryEmotion}</span>
              {shard.valence ? ` · Valencia: ${shard.valence}` : ''}
              {shard.arousal ? ` · Activación: ${shard.arousal}` : ''}
            </p>
          )}

          {shard.emotionLabels && shard.emotionLabels.length > 0 && (
            <ul className="text-xs text-slate-300 space-y-1">
              {shard.emotionLabels.slice(0, 5).map((e, index) => (
                <li key={`${e.label}-${index}`}>
                  {e.label}: {(e.score * 100).toFixed(1)}%
                </li>
              ))}
            </ul>
          )}

          {shard.prosodyFlags && (
            <p className="text-xs text-slate-400">
              {shard.prosodyFlags.laughter && shard.prosodyFlags.laughter !== 'none'
                ? 'Risa detectada. '
                : ''}
              {shard.prosodyFlags.crying === 'present' ? 'Posible llanto. ' : ''}
              {shard.prosodyFlags.shouting === 'present' ? 'Alza de voz. ' : ''}
              {shard.prosodyFlags.sighing === 'present' ? 'Suspiros presentes. ' : ''}
            </p>
          )}
        </section>
      )}

      {(shard.semantic?.summary ||
        (shard.semantic?.topics && shard.semantic.topics.length > 0) ||
        shard.semantic?.momentType ||
        shard.semantic?.flags?.needsFollowup ||
        shard.semantic?.flags?.possibleCrisis) && (
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-sm">Análisis semántico</h2>

          {shard.semantic?.summary && (
            <p className="text-sm text-slate-100 leading-relaxed">
              {shard.semantic.summary}
            </p>
          )}

          {shard.semantic?.topics?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {shard.semantic.topics?.map((topic, i) => (
                <span
                  key={`${topic}-${i}`}
                  className="inline-flex items-center rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-100 border border-slate-700/60"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : null}

          {shard.semantic?.momentType && (
            <div className="mt-3">
              {(() => {
                const { label, className } = getMomentTypeStyles(
                  shard.semantic?.momentType
                );
                return <span className={className}>{label}</span>;
              })()}
            </div>
          )}

          {(shard.semantic?.flags?.needsFollowup ||
            shard.semantic?.flags?.possibleCrisis) && (
            <div className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
              {shard.semantic?.flags?.possibleCrisis
                ? '⚠️ Este momento podría indicar una crisis. Vale la pena revisarlo con calma.'
                : 'ℹ️ Este momento sugiere que podría necesitarse un seguimiento en otra sesión.'}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-sm">Rasgos de la señal</h2>
        <div className="text-xs text-slate-300">
          RMS: {shard.features.rms.toFixed(4)}
        </div>
        <div className="text-xs text-slate-300">
          Pico: {shard.features.peak.toFixed(4)}
        </div>
        {shard.features.spectralCentroid != null && (
          <div className="text-xs text-slate-300">
            Frecuencia central: {shard.features.spectralCentroid.toFixed(2)}
          </div>
        )}
        {shard.features.zcr != null && (
          <div className="text-xs text-slate-300">
            ZCR: {shard.features.zcr.toFixed(4)}
          </div>
        )}
      </section>

      {suggestedTags.length > 0 && (
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-sm">Etiquetas sugeridas</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedTags.map((tag) => (
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
