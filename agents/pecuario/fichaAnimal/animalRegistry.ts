/**
 * Registro efetivo de animais do rebanho — fonte única da "categoria atual" e da
 * "situação" de cada animal, compartilhada entre a Ficha Animal e o Desmame.
 *
 * Um animal é representado como um Record<string,string> (mesmas chaves do
 * formulário da ficha). A relação efetiva é a UNIÃO de:
 *   - fichas persistidas (fichas_animal), que são o override do usuário, e
 *   - fichas derivadas dos nascimentos (nascimento_fichas),
 * deduplicada por ID Manejo (apelido) — a persistida vence. A categoria atual de
 * um animal é, portanto, a da ficha persistida quando existe; senão a de nascimento.
 *
 * A situação (ativo/morte) é derivada das baixas (mortes) persistidas.
 */
import { sexoFromCategoria } from '../nascimento/util';
import type { LookupItem } from '../nascimento/types';
import type { NascimentoMovimentoRow } from '../../../lib/api/nascimentosClient';
import type { MorteMovimentoRow } from '../../../lib/api/mortesClient';

/** Chaves reservadas (metadados) das fichas — não são campos do formulário. */
export const FICHA_SRC_KEY = '__src';
export const FICHA_ID_KEY = '__id';

/** Normaliza um identificador para casar buscas independentemente de caixa/espaços. */
export const normId = (s: string) => s.trim().toLowerCase();

/**
 * Converte um nascimento persistido em fichas individuais — uma por bezerro
 * identificado. Os dados de nascimento (data, peso, fazenda) já vêm preenchidos,
 * para aparecerem na aba "Origem" da ficha sem nenhum passo extra.
 */
export function fichasFromNascimento(
  movimentos: NascimentoMovimentoRow[],
  categories: LookupItem[],
  farmName: (id: string | null) => string,
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of movimentos) {
    for (const f of m.fichas) {
      const peso = f.peso != null ? String(f.peso) : '';
      out.push({
        [FICHA_SRC_KEY]: 'nascimento',
        [FICHA_ID_KEY]: f.id,
        apelido: f.apelido,
        categoria: f.categoriaId || '',
        sexo: sexoFromCategoria(categories, f.categoriaId || '') || '',
        rfid: f.rfid || '',
        sisbov: f.sisbov || '',
        porte: f.porte || '',
        raca: f.raca || '',
        peso,
        situacao: 'ativo',
        // Origem · Dados de nascimento (mesmos ids da aba "Origem")
        data: m.data,
        pesoNascer: peso,
        fazendaNascimento: farmName(m.farmId),
        // farm de origem do animal (id), útil para filtros por fazenda.
        __farmId: m.farmId || '',
        // retiro do movimento de nascimento, útil para filtro best-effort por retiro.
        __retiro: m.retiro || '',
      });
    }
  }
  return out;
}

/**
 * Relação completa: fichas do banco + fichas de nascimento ainda não persistidas
 * (dedup por ID Manejo — a ficha persistida tem prioridade sobre a derivada).
 */
export function buildTodasFichas(
  persistedFichas: Record<string, string>[],
  nascFichas: Record<string, string>[],
): Record<string, string>[] {
  // Índice das fichas de nascimento por apelido — usado para (a) deduplicar e
  // (b) herdar dicas de fazenda/retiro (__farmId/__retiro) na ficha persistida
  // que vence o dedup (a persistida não carrega esses metadados).
  const nascByApelido = new Map<string, Record<string, string>>();
  for (const f of nascFichas) {
    const key = (f.apelido || '').trim().toLowerCase();
    if (key && !nascByApelido.has(key)) nascByApelido.set(key, f);
  }

  const persisted = persistedFichas.map((f) => {
    const key = (f.apelido || '').trim().toLowerCase();
    const twin = key ? nascByApelido.get(key) : undefined;
    if (!twin) return f;
    const merged = { ...f };
    if (merged.__farmId === undefined && twin.__farmId !== undefined) merged.__farmId = twin.__farmId;
    if (merged.__retiro === undefined && twin.__retiro !== undefined) merged.__retiro = twin.__retiro;
    return merged;
  });

  const dbApelidos = new Set(
    persistedFichas.map((f) => (f.apelido || '').trim().toLowerCase()).filter(Boolean),
  );
  const nascOnly = nascFichas.filter(
    (f) => !dbApelidos.has((f.apelido || '').trim().toLowerCase()),
  );
  return [...persisted, ...nascOnly];
}

/** Dados de inativação de um animal, derivados de uma baixa (morte). */
export interface SituacaoInfo {
  situacao: 'morte' | 'venda';
  /** Data do evento ('AAAA-MM-DD'). */
  data: string;
  /** Detalhe do evento (ex.: motivo da morte). */
  motivo: string;
}

/**
 * Monta o índice de animais inativados a partir das baixas (mortes) persistidas,
 * por ID de Manejo (apelido) e por ID Eletrônico (rfid). É a fonte que torna a
 * Situação da ficha automática: havendo baixa para o animal, ela vira "Morte".
 */
export function buildMorteIndex(
  mortes: MorteMovimentoRow[],
  motivoNome: (id: string | null) => string,
): { byManejo: Map<string, SituacaoInfo>; byRfid: Map<string, SituacaoInfo> } {
  const byManejo = new Map<string, SituacaoInfo>();
  const byRfid = new Map<string, SituacaoInfo>();
  for (const m of mortes) {
    for (const f of m.fichas) {
      const info: SituacaoInfo = { situacao: 'morte', data: m.data, motivo: motivoNome(f.motivoId) };
      if (f.apelido) byManejo.set(normId(f.apelido), info);
      if (f.rfid) byRfid.set(normId(f.rfid), info);
    }
  }
  return { byManejo, byRfid };
}

/**
 * Aplica a Situação automática: animal com baixa registrada vira "Inativo · Morte",
 * anexando data e motivo para exibição (chaves '__' não são persistidas).
 */
export function applySituacao(
  todasFichas: Record<string, string>[],
  morteIndex: { byManejo: Map<string, SituacaoInfo>; byRfid: Map<string, SituacaoInfo> },
): Record<string, string>[] {
  if (!morteIndex.byManejo.size && !morteIndex.byRfid.size) return todasFichas;
  return todasFichas.map((f) => {
    const hit =
      (f.apelido ? morteIndex.byManejo.get(normId(f.apelido)) : undefined) ||
      (f.rfid ? morteIndex.byRfid.get(normId(f.rfid)) : undefined);
    if (!hit) return f;
    return {
      ...f,
      situacao: hit.situacao,
      __situacaoData: hit.data,
      __situacaoMotivo: hit.motivo,
    };
  });
}
