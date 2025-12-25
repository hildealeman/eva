'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface LiveLevelMeterProps {
  rms: number;
  isActive: boolean;
  className?: string;
}

export default function LiveLevelMeter({
  rms,
  isActive,
  className,
}: LiveLevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const rmsRef = useRef(0);

  const getColorForRms = (value: number): string => {
    if (value < 0.05) return '#22c55e'; // verde
    if (value < 0.15) return '#a3e635'; // lima
    if (value < 0.3) return '#facc15'; // amarillo
    if (value < 0.5) return '#f97316'; // naranja
    return '#ef4444'; // rojo
  };

  useEffect(() => {
    rmsRef.current = rms;
  }, [rms]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;
    const maxRms = 0.5; // máximo RMS para visualización

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Círculo de fondo
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15,23,42,0.7)';
      ctx.fill();

      // Arco de nivel
      const currentRms = rmsRef.current;
      const normalized = Math.min(currentRms / maxRms, 1);
      const endAngle = -Math.PI / 2 + normalized * Math.PI * 2;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, -Math.PI / 2, endAngle, false);
      ctx.lineWidth = 10;
      ctx.strokeStyle = getColorForRms(currentRms);
      ctx.stroke();

      // Texto central
      ctx.fillStyle = '#e5e7eb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px system-ui';
      ctx.fillText(isActive ? 'Escuchando…' : 'Inactivo', centerX, centerY);

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive]);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <canvas ref={canvasRef} width={220} height={220} className="w-44 h-44" />
      <span className="mt-2 text-xs text-slate-400">
        Nivel: {(rms * 100).toFixed(1)}%
      </span>
    </div>
  );
}
