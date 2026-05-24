/**
 * Formatação de valores monetários em BRL.
 */
export function formatBRL(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatBRLFull(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'R$ 0';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${sign}R$ ${formatted}`;
}

export function parseBRL(s: string): number | null {
  const trimmed = s.replace(/\s/g, '').replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
