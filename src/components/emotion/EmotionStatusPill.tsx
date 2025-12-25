'use client';

import type { EmoShardStatus } from '@/types/emotion';
import { cn } from '@/lib/utils';

interface EmotionStatusPillProps {
  status: EmoShardStatus;
  className?: string;
}

function statusMeta(status: EmoShardStatus) {
  switch (status) {
    case 'raw':
      return { label: 'Sin revisar', className: 'bg-slate-700 text-slate-200' };
    case 'reviewed':
      return { label: 'Revisado', className: 'bg-sky-700 text-sky-100' };
    case 'published':
      return { label: 'Publicado', className: 'bg-emerald-700 text-emerald-100' };
  }
}

export default function EmotionStatusPill({ status, className }: EmotionStatusPillProps) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold',
        meta.className,
        className
      )}
    >
      {meta.label}
    </span>
  );
}
