import { describe, expect, it } from 'vitest';
import { calcWeekNumber, getWeekRange, toIsoDate } from '../../../lib/weeklyUtils';

describe('weeklyUtils', () => {
  it('should format dates as ISO strings', () => {
    expect(toIsoDate(new Date(2026, 3, 15))).toBe('2026-04-15');
  });

  it('should return monday to saturday week range', () => {
    const range = getWeekRange(new Date(2026, 3, 15));

    expect(range.startIso).toBe('2026-04-13');
    expect(range.endIso).toBe('2026-04-18');
  });

  it('should calculate civil year ISO week numbers', () => {
    expect(calcWeekNumber(new Date(2026, 0, 1), 'ano')).toBe(1);
    expect(calcWeekNumber(new Date(2026, 3, 15), 'ano')).toBe(16);
  });

  it('should calculate safra week numbers from july start', () => {
    expect(calcWeekNumber(new Date(2026, 6, 1), 'safra')).toBe(1);
    expect(calcWeekNumber(new Date(2026, 6, 15), 'safra')).toBe(3);
  });
});
