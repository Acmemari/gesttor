/**
 * Geração do modelo de planilha (.xlsx) do painel "Defina seus campos".
 *
 * As colunas seguem exatamente os campos configurados (mesma ordem e destino),
 * de modo que a planilha preenchida possa ser reimportada e acelere os
 * lançamentos em massa. Genérico: recebe o registro de campos (fieldById) do
 * movimento. Sem dependência de React/DOM (só do gerador xlsx).
 */
import * as XLSX from 'xlsx';
import { todayISO } from './util';
import type { FieldPlaces, LookupItem, LrField } from './types';

export interface TemplateSource {
  /** ordem global de exibição (lista de field ids) */
  order: string[];
  /** destino atual de cada campo */
  places: FieldPlaces;
  /** mapa id → campo do movimento */
  fieldById: Record<string, LrField>;
  categories: LookupItem[];
  lotes: LookupItem[];
  lookups?: Record<string, LookupItem[]>;
  optionsOverride?: Record<string, string[]>;
  /** prefixo do nome do arquivo (default 'modelo-lancamento'). */
  filenamePrefix?: string;
}

/**
 * Campos que viram coluna na planilha: todos os configurados na ordem atual,
 * menos os Desativados (off) e os de seção (sanitario).
 */
export function templateFields(order: string[], places: FieldPlaces, fieldById: Record<string, LrField>): LrField[] {
  return order
    .map((id) => fieldById[id])
    .filter((f): f is LrField => !!f && f.type !== 'sanitario' && places[f.id] !== 'off');
}

/** Valores aceitos por um campo de lista (categoria/lote/lookup/sexo/select). */
function fieldOptions(f: LrField, src: TemplateSource): string[] {
  switch (f.type) {
    case 'cat':
      return src.categories.map((c) => c.nome);
    case 'lote':
      return src.lotes.map((l) => l.nome);
    case 'lookup':
      return (src.lookups?.[f.lookupKey ?? f.id] ?? []).map((l) => l.nome);
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
    case 'number':
      return 'Número (ex.: 12)';
    case 'date':
      return 'Data (AAAA-MM-DD)';
    case 'weight':
      return 'Peso em kg (ex.: 32,5)';
    case 'money':
      return 'Valor em R$ (ex.: 12,50)';
    case 'cat':
    case 'lote':
    case 'lookup':
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
 * aceitos de cada campo — incluindo categorias, lotes e listas dinâmicas.
 */
export function buildTemplateWorkbook(src: TemplateSource): XLSX.WorkBook {
  const fields = templateFields(src.order, src.places, src.fieldById);

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
 * Gera e baixa o modelo .xlsx. Retorna o nº de colunas exportadas (mensagem).
 */
export function exportLancamentoTemplate(src: TemplateSource): number {
  const wb = buildTemplateWorkbook(src);
  const prefix = src.filenamePrefix || 'modelo-lancamento';
  XLSX.writeFile(wb, `${prefix}-${todayISO()}.xlsx`);
  return templateFields(src.order, src.places, src.fieldById).length;
}
