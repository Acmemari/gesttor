export type WeekMode = 'ano' | 'safra';

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getMondayOfWeek(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value;
}

export function getSaturdayOfWeek(date: Date): Date {
  const value = getMondayOfWeek(date);
  value.setDate(value.getDate() + 5);
  return value;
}

export function getWeekRange(date: Date) {
  const start = getMondayOfWeek(date);
  const end = getSaturdayOfWeek(date);
  return {
    start,
    end,
    startIso: toIsoDate(start),
    endIso: toIsoDate(end),
  };
}

export function calcWeekNumber(date: Date, modo: WeekMode): number {
  if (modo === 'ano') {
    const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
    return Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  const month = date.getMonth();
  const year = date.getFullYear();
  const safraStart = month >= 6 ? new Date(year, 6, 1) : new Date(year - 1, 6, 1);
  return Math.floor((date.getTime() - safraStart.getTime()) / (7 * 864e5)) + 1;
}
