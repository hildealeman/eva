'use client';

import type { EmoShardStatus } from '@/types/emotion';

interface StatusSelectorProps {
  value: EmoShardStatus;
  onChange: (status: EmoShardStatus) => void;
}

export default function StatusSelector({ value, onChange }: StatusSelectorProps) {
  return (
    <select
      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value as EmoShardStatus)}
    >
      <option value="raw">Sin revisar</option>
      <option value="reviewed">Revisado</option>
      <option value="published">Publicado</option>
    </select>
  );
}
