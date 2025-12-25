import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina múltiples classNames usando Tailwind Merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
