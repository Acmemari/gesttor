/**
 * Cálculos PUROS do Planejamento Nutricional (metas de abate + projeção de fases).
 *
 * Nenhum destes valores é gravado: o back guarda só as metas e a lista de fases;
 * peso morto, @, peso ao fim de cada fase e a data de abate prevista são sempre
 * derivados aqui. Funções puras, testáveis em isolamento (como `util.ts`).
 */
import type { FaseNutricional } from '../../../lib/api/planejamentoNutricionalClient';

export type { FaseNutricional };

/** 1 arroba (@) = 15 kg de carcaça. */
export const ARROBA_KG = 15;

/** number|string|null → number (0 quando inválido). */
export function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Datas (UTC, sem efeito de fuso) ───────────────────────────────────────────

/** Diferença em dias entre duas datas ISO 'AAAA-MM-DD' (≤ 0 ⇒ 0). */
export function diffDias(inicio: string, final: string): number {
  const a = Date.parse(`${String(inicio).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(final).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const d = Math.round((b - a) / 86_400_000);
  return d > 0 ? d : 0;
}

/** Soma `dias` a uma data ISO e devolve ISO 'AAAA-MM-DD'. */
export function addDias(inicio: string, dias: number): string {
  const a = Date.parse(`${String(inicio).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a)) return String(inicio).slice(0, 10);
  const d = new Date(a + Math.round(dias) * 86_400_000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

// ── Metas ─────────────────────────────────────────────────────────────────────

/** Peso morto (carcaça, kg) = peso vivo × rendimento%. */
export function pesoMorto(pesoVivoAbate: number, rendimentoCarcaca: number): number {
  return toNum(pesoVivoAbate) * (toNum(rendimentoCarcaca) / 100);
}

/** Peso morto convertido em arrobas (@) = peso morto / 15. */
export function pesoMortoEmArrobas(pesoVivoAbate: number, rendimentoCarcaca: number): number {
  const pm = pesoMorto(pesoVivoAbate, rendimentoCarcaca);
  return pm / ARROBA_KG;
}

/** Preço por arroba (R$/@) = meta de valor / arrobas (0 quando não computável). */
export function precoPorArroba(metaValorVenda: number, pesoVivoAbate: number, rendimentoCarcaca: number): number {
  const arrobas = pesoMortoEmArrobas(pesoVivoAbate, rendimentoCarcaca);
  return arrobas > 0 ? toNum(metaValorVenda) / arrobas : 0;
}

// ── Projeção das fases ────────────────────────────────────────────────────────

export interface FaseProjetada {
  fase: FaseNutricional;
  dias: number;
  ganhoTotal: number;   // kg ganhos na fase = ganhoPrevisto × dias
  pesoInicio: number;   // kg no começo da fase
  pesoFinal: number;    // kg no fim da fase
}

export interface ProjecaoPlano {
  linhas: FaseProjetada[];
  diasTotais: number;
  pesoFinalProjetado: number;     // peso ao fim da última fase (ou pesoInicial se sem fases)
}

/**
 * Encadeia o peso ao longo das fases: o peso final de uma fase é o inicial da
 * seguinte, partindo de `pesoInicial`.
 */
export function projetarFases(pesoInicial: number, fases: FaseNutricional[]): ProjecaoPlano {
  let peso = toNum(pesoInicial);
  let diasTotais = 0;
  const linhas: FaseProjetada[] = (fases ?? []).map((fase) => {
    const dias = diffDias(fase.dataInicio, fase.dataFinal);
    const ganhoTotal = toNum(fase.ganhoPrevisto) * dias;
    const pesoInicio = peso;
    const pesoFinal = pesoInicio + ganhoTotal;
    peso = pesoFinal;
    diasTotais += dias;
    return { fase, dias, ganhoTotal, pesoInicio, pesoFinal };
  });
  return { linhas, diasTotais, pesoFinalProjetado: peso };
}

export interface StatusMeta {
  atingida: boolean;
  faltamKg: number;                 // > 0 quando ainda falta peso p/ a meta
  pesoFinalProjetado: number;
  /** Data em que o lote alcança o peso vivo ao abate (interpolada na fase que cruza), ou null. */
  dataAbatePrevista: string | null;
  /** Índice (0-based) da fase em que a meta é atingida, ou null. */
  faseAbateIndex: number | null;
}

/**
 * Avalia a projeção contra a meta de peso vivo ao abate: se foi atingida,
 * quanto falta, e a data prevista de abate (interpolada na fase que cruza a meta).
 */
export function statusMeta(
  pesoInicial: number,
  fases: FaseNutricional[],
  pesoVivoAbate: number,
): StatusMeta {
  const proj = projetarFases(pesoInicial, fases);
  const meta = toNum(pesoVivoAbate);
  const base: StatusMeta = {
    atingida: false,
    faltamKg: 0,
    pesoFinalProjetado: proj.pesoFinalProjetado,
    dataAbatePrevista: null,
    faseAbateIndex: null,
  };

  if (meta <= 0) return base;

  // Já parte igual/acima da meta (sem fase que "cruze").
  if (toNum(pesoInicial) >= meta) {
    return { ...base, atingida: true };
  }

  // Primeira fase cujo peso final alcança a meta → interpola a data dentro dela.
  for (let i = 0; i < proj.linhas.length; i++) {
    const l = proj.linhas[i];
    if (l.pesoFinal >= meta && l.pesoInicio < meta) {
      const ganhoDia = toNum(l.fase.ganhoPrevisto);
      const diasNec = ganhoDia > 0 ? Math.ceil((meta - l.pesoInicio) / ganhoDia) : l.dias;
      return {
        ...base,
        atingida: true,
        dataAbatePrevista: addDias(l.fase.dataInicio, diasNec),
        faseAbateIndex: i,
      };
    }
  }

  return { ...base, faltamKg: Math.max(0, meta - proj.pesoFinalProjetado) };
}
