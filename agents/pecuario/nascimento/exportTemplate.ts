/**
 * Geração do modelo de planilha (.xlsx) do Lançamento Rápido.
 *
 * As colunas seguem exatamente os campos configurados (mesma ordem e destino
 * definidos no lápis de configuração), de modo que a planilha preenchida possa
 * ser reimportada e acelere os lançamentos em massa. Mantido sem dependência de
 * React/DOM (só do gerador xlsx) para ser testável isoladamente.
 */
import * as XLSX from 'xlsx';
import { FIELD_BY_ID } from './fieldRegistry';
import { todayISO } from './util';
import type { FieldPlaces, LookupItem, LrField } from './types';

export interface TemplateSource {
  /** ordem global de exibição (lista de field ids) */
  order: string[];
  /** destino atual de cada campo */
  places: FieldPlaces;
  categories: LookupItem[];
  lotes: LookupItem[];
  optionsOverride?: Record<string, string[]>;
}

/**
 * Campos que viram coluna na planilha: todos os configurados na ordem atual,
 * menos os Desativados (off) e o Sanitário (seção, não é valor por animal).
 */
export function templateFields(order: string[], places: FieldPlaces): LrField[] {
  return order
    .map((id) => FIELD_BY_ID[id])
    .filter((f): f is LrField => !!f && f.type !== 'sanitario' && places[f.id] !== 'off');
}

/** Valores aceitos por um campo de lista (categoria/lote/sexo/select). */
function fieldOptions(f: LrField, src: TemplateSource): string[] {
  switch (f.type) {
    case 'cat':
      return src.categories.map((c) => c.nome);
    case 'lote':
      return src.lotes.map((l) => l.nome);
    case 'sexo':
      return ['Macho', 'Fêmea'];
    case 'select':
      return [...((src.optionsOverride?.[f.id] ?? f.options ?? []) as string[])];
    default:
      return [];
  }
}

/** Descrição do tipo de preenchimento para a aba de instruções. */
function fieldTipo(f: LrField): string {
  switch (f.type) {
    case 'date':
      return 'Data (AAAA-MM-DD)';
    case 'weight':
      return 'Peso em kg (ex.: 32,5)';
    case 'cat':
    case 'lote':
    case 'sexo':
    case 'select':
      return 'Lista (ver valores aceitos)';
    default:
      return 'Texto';
  }
}

/**
 * Monta o workbook: aba "Lançamento" só com o cabeçalho (uma linha por animal a
 * preencher abaixo) e aba "Instruções" com obrigatoriedade, tipo e valores
 * aceitos de cada campo — incluindo categorias, lotes e raças (que são
 * dinâmicos por organização).
 */
export function buildTemplateWorkbook(src: TemplateSource): XLSX.WorkBook {
  const fields = templateFields(src.order, src.places);

  // Aba 1: planilha a preencher. Cabeçalho = rótulos exatos dos campos.
  const headers = fields.map((f) => f.label);
  const dataSheet = XLSX.utils.aoa_to_sheet([headers]);
  dataSheet['!cols'] = fields.map((f) => ({ wch: Math.max(12, f.label.length + 2) }));

  // Aba 2: instruções de preenchimento.
  const instr: string[][] = [
    ['Campo', 'Obrigatório', 'Tipo', 'Valores aceitos'],
    ...fields.map((f) => {
      const opts = fieldOptions(f, src);
      return [f.label, f.req ? 'Sim' : 'Não', fieldTipo(f), opts.join(' · ')];
    }),
  ];
  const instrSheet = XLSX.utils.aoa_to_sheet(instr);
  instrSheet['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 24 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Lançamento');
  XLSX.utils.book_append_sheet(wb, instrSheet, 'Instruções');
  return wb;
}

/**
 * Gera e baixa o modelo .xlsx do Lançamento Rápido.
 * Retorna o nº de colunas exportadas (para mensagem de feedback).
 */
export function exportLancamentoTemplate(src: TemplateSource): number {
  const wb = buildTemplateWorkbook(src);
  XLSX.writeFile(wb, `modelo-lancamento-nascimento-${todayISO()}.xlsx`);
  return templateFields(src.order, src.places).length;
}
