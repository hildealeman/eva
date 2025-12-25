'use client';

import { cn } from '@/lib/utils';

interface IntensityBarProps {
  intensity: number; // 0-1
  className?: string;
}

function getColor(intensity: number): string {
  if (intensity < 0.33) return 'bg-emerald-500';
  if (intensity < 0.66) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function IntensityBar({ intensity, className }: IntensityBarProps) {
  const clamped = Math.max(0, Math.min(1, intensity));
  const heightPct = Math.round(clamped * 100);

  return (
    <div className={cn('w-2 h-10 rounded-full bg-slate-800 overflow-hidden', className)}>
      <div
        className={cn('w-full rounded-full', getColor(clamped))}
        style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
      />
    </div>
  );
}
