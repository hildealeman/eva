'use client';

import { useCallback, useState } from 'react';

interface TagEditorProps {
  tags?: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

export default function TagEditor({ tags = [], onAdd, onRemove }: TagEditorProps) {
  const [value, setValue] = useState('');
  const safeTags = tags ?? [];

  const commit = useCallback(() => {
    const t = value.trim();
    if (!t) return;
    onAdd(t);
    setValue('');
  }, [onAdd, value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 text-xs">
        {safeTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="px-2 py-1 rounded-full bg-emerald-900 text-emerald-100"
            onClick={() => onRemove(tag)}
          >
            {tag} ×
          </button>
        ))}
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Agregar etiqueta…"
        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />

      <button
        type="button"
        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
        onClick={commit}
      >
        Agregar
      </button>
    </div>
  );
}
