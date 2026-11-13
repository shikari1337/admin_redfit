/**
 * Month-to-date budget pacing, one rule for the Marketing home and Performance. `pace` comes from
 * `GET /marketing-hub/analytics/kpis` (`budget.pace` = share of the monthly budget spent divided by the share of the
 * month gone; null when no budget is set). Within 15% either side of an even pace is on track.
 */
import type { Tone } from './meta/common';

export const PACE_OVER = 1.15;
export const PACE_UNDER = 0.85;

export interface PaceState { tone: Tone; text: string }

export function paceState(pace: number | null | undefined): PaceState | null {
  if (pace === null || pace === undefined || Number.isNaN(Number(pace))) return null;
  const p = Number(pace);
  if (p > PACE_OVER) return { tone: 'bad', text: 'spending ahead of the budget' };
  if (p < PACE_UNDER) return { tone: 'warn', text: 'spending behind the budget' };
  return { tone: 'good', text: 'on track' };
}

/** A fraction (0.123) as a percent with one decimal ("12.3%"). */
export const pctOf = (fraction: number | null | undefined): string =>
  fraction === null || fraction === undefined || Number.isNaN(Number(fraction)) ? 'Not known' : `${(Number(fraction) * 100).toFixed(1)}%`;
