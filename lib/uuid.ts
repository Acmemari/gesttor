/**
 * Validação e sanitização de UUID para evitar envio de valores inválidos às RPCs do Supabase.
 * Aceita UUID v4 (e variantes com versão 1-5) no formato padrão com hífens.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string | null | undefined): boolean {
  if (value == null || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && UUID_REGEX.test(trimmed);
}

export function sanitizeUUID(value: string | null | undefined): string | null {
  if (!isValidUUID(value)) return null;
  return (value as string).trim();
}

/** Aceita qualquer string não-vazia (para IDs TEXT como farm IDs). */
export function sanitizeId(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Para persistência de hierarchySelection. `farms.id` é TEXT: o id pode ser UUID
 * (fazendas novas) OU legado — `farm-*` ou slug (ex.: "reunidas-floresta-floresta").
 * Aceita qualquer id de fazenda plausível (UUID, `farm-*` ou slug), pois antes só
 * UUID passava e a seleção de fazendas de id legado se perdia no reload (a fazenda
 * "sumia" e a tela caía numa fazenda padrão → mapa/KMZ parecendo compartilhado).
 * Seguro: na hidratação o `selectedFarm` é resolvido por `farms.find(id===…)`, então
 * um id que não exista mais simplesmente vira null.
 */
export function sanitizeFarmId(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Não-vazio, sem espaços e de comprimento sensato — cobre UUID, `farm-*` e slugs,
  // rejeitando lixo/valores corrompidos do localStorage.
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > 128) return null;
  return trimmed;
}
