/**
 * Leitura e validação da planilha do Lançamento Rápido (importação).
 *
 * Simétrico a `exportTemplate.ts`: o modelo exporta uma coluna por campo
 * configurado usando o RÓTULO do campo como cabeçalho; aqui o cabeçalho é
 * remapeado de volta para o field id, cada célula é validada por tipo e a linha
 * recebe um sinal de conformidade (ok / aviso / erro). Mantido sem dependência
 * de React/DOM (só do leitor xlsx) para ser testável isoladamente.
 */
import * as XLSX from 'xlsx';
import { templateFields } from './exportTemplate';
import { sexoFromCategoria, todayISO } from './util';
import type { FieldPlaces, LookupItem, LrField } from './types';

/** Sinal de conformidade de uma célula/linha. */
export type CellStatus = 'ok' | 'aviso' | 'erro';

/** Célula avaliada: valor cru lido, valor normalizado e o sinal. */
export interface ImportCell {
  /** texto lido da planilha (já trimado). */
  raw: string;
  /** valor canônico para o sistema (ex.: id da categoria, 'Macho', ISO). */
  value: string;
  status: CellStatus;
  /** motivo do aviso/erro (exibido no hover). */
  msg?: string;
}

/** Linha avaliada da planilha. */
export interface ImportRow {
  /** índice da linha na planilha (1-based em relação ao cabeçalho). */
  index: number;
  /** célula por field id. */
  cells: Record<string, ImportCell>;
  /** valores canônicos por field id (vira NascDetalhe.values). */
  values: Record<string, string>;
  /** pior sinal entre as células da linha. */
  status: CellStatus;
  /** lista de pendências legíveis (campo: motivo). */
  issues: string[];
}

/** Resultado completo da conferência de uma planilha importada. */
export interface ImportResult {
  /** campos (colunas) esperados, na ordem configurada. */
  fields: LrField[];
  rows: ImportRow[];
  /** cabeçalhos da planilha não reconhecidos. */
  unmatchedHeaders: string[];
  /** colunas obrigatórias ausentes do cabeçalho. */
  missingRequiredCols: LrField[];
  okCount: number;
  avisoCount: number;
  erroCount: number;
}

export interface ValidateArgs {
  /** linhas cruas da planilha (linha 0 = cabeçalho). */
  rows: string[][];
  /** ordem global de exibição (lista de field ids). */
  order: string[];
  /** destino atual de cada campo. */
  places: FieldPlaces;
  categories: LookupItem[];
  lotes: LookupItem[];
  optionsOverride?: Record<string, string[]>;
  /** apelidos já presentes (para detectar duplicidade). */
  existingApelidos: string[];
}

/**
 * Lê o arquivo (.xlsx/.xls/.csv) e devolve a matriz de strings (linha 0 =
 * cabeçalho). Para Excel, prioriza a aba "Lançamento" (a que o modelo gera) e
 * usa `raw: false` para receber os valores já formatados (datas em DD/MM/AAAA,
 * conforme o que o usuário vê na célula).
 */
export async function readSheetRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const first = lines[0] ?? '';
    const delim = first.split(';').length > first.split(',').length ? ';' : ',';
    return lines
      .filter((l) => l.length > 0)
      .map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, '').trim()));
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames.includes('Lançamento') ? 'Lançamento' : wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  return rawRows.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim()));
}

/** Normaliza rótulo p/ casar cabeçalho ↔ campo (minúsculas, sem '*', espaços únicos). */
function normLabel(s: string): string {
  return s.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

/** Valores aceitos por um campo de lista (sexo/select). */
function fieldOptions(f: LrField, src: ValidateArgs): string[] {
  switch (f.type) {
    case 'sexo':
      return ['Macho', 'Fêmea'];
    case 'select':
      return [...((src.optionsOverride?.[f.id] ?? f.options ?? []) as string[])];
    default:
      return [];
  }
}

/** Padrão de um campo (espelha defaultValue, com raça dinâmica). */
function fieldDefault(f: LrField, src: ValidateArgs): string {
  switch (f.id) {
    case 'data':
      return todayISO();
    case 'raca':
      return src.optionsOverride?.raca?.[0] ?? 'Nelore';
    case 'porte':
      return 'M';
    case 'colostro':
      return 'Sim';
    case 'pesagem':
      return 'Manual';
    case 'sexo':
      return 'Macho';
    default:
      return '';
  }
}

/** Casa um valor com uma lista de opções (case-insensitive) → opção canônica. */
function normalizeOption(raw: string, options: string[]): string | null {
  const v = raw.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) ?? null;
}

/** Normaliza variações de sexo → 'Macho' | 'Fêmea'. */
function normalizeSexo(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (['macho', 'm', '♂', '♂ m', 'male', 'masculino'].includes(v)) return 'Macho';
  if (['fêmea', 'femea', 'f', '♀', '♀ f', 'female', 'feminino'].includes(v)) return 'Fêmea';
  return null;
}

/** Aceita ISO (AAAA-MM-DD) ou BR (DD/MM/AAAA, DD-MM-AAAA) → ISO; null se inválida. */
function parseDateFlexible(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return isValidYmd(+y, +mo, +d) ? `${y}-${mo}-${d}` : null;
  }
  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    if (!isValidYmd(+y, +mo, +d)) return null;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function isValidYmd(y: number, mo: number, d: number): boolean {
  return y >= 1900 && y <= 3000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

/** Campos opcionais que mesmo assim recebem um padrão silencioso ao ficar vazios. */
const OPTIONAL_DEFAULTED = new Set(['colostro', 'pesagem']);

/** Avalia uma célula segundo o tipo do campo. */
function validateCell(f: LrField, raw: string, src: ValidateArgs): ImportCell {
  if (raw === '') {
    if (f.req) {
      // ID Manejo e Categoria não têm padrão → erro; os demais obrigatórios usam padrão (aviso).
      if (f.id === 'apelido' || f.id === 'categoria') {
        return { raw, value: '', status: 'erro', msg: 'Obrigatório' };
      }
      const def = fieldDefault(f, src);
      return { raw, value: def, status: 'aviso', msg: `Vazio — usaria "${def}"` };
    }
    // Opcional: alguns recebem padrão silencioso; o resto fica vazio.
    return { raw, value: OPTIONAL_DEFAULTED.has(f.id) ? fieldDefault(f, src) : '', status: 'ok' };
  }

  switch (f.type) {
    case 'cat': {
      const cat = src.categories.find((c) => c.nome.trim().toLowerCase() === raw.toLowerCase());
      if (!cat) return { raw, value: '', status: 'erro', msg: 'Categoria não encontrada' };
      return { raw, value: cat.id, status: 'ok' };
    }
    case 'lote': {
      const lote = src.lotes.find((l) => l.nome.trim().toLowerCase() === raw.toLowerCase());
      if (!lote) return { raw, value: '', status: 'erro', msg: 'Lote não encontrado' };
      return { raw, value: lote.id, status: 'ok' };
    }
    case 'sexo': {
      const s = normalizeSexo(raw);
      if (!s) return { raw, value: '', status: 'erro', msg: 'Sexo inválido (Macho/Fêmea)' };
      return { raw, value: s, status: 'ok' };
    }
    case 'select': {
      const norm = normalizeOption(raw, fieldOptions(f, src));
      if (!norm) return { raw, value: '', status: 'erro', msg: 'Valor fora da lista' };
      return { raw, value: norm, status: 'ok' };
    }
    case 'weight': {
      const n = parseFloat(raw.replace(',', '.'));
      if (!Number.isFinite(n)) return { raw, value: '', status: 'erro', msg: 'Peso não numérico' };
      return { raw, value: raw, status: 'ok' };
    }
    case 'date': {
      const iso = parseDateFlexible(raw);
      if (!iso) return { raw, value: '', status: 'erro', msg: 'Data inválida (AAAA-MM-DD ou DD/MM/AAAA)' };
      return { raw, value: iso, status: 'ok' };
    }
    default:
      return { raw, value: raw, status: 'ok' };
  }
}

/** Pior sinal entre dois (erro > aviso > ok). */
function worst(a: CellStatus, b: CellStatus): CellStatus {
  if (a === 'erro' || b === 'erro') return 'erro';
  if (a === 'aviso' || b === 'aviso') return 'aviso';
  return 'ok';
}

/**
 * Valida a planilha lida contra os campos configurados e devolve a conferência
 * completa (uma linha por animal, com sinais de conformidade por célula).
 */
export function validateImport(src: ValidateArgs): ImportResult {
  const fields = templateFields(src.order, src.places);

  // Cabeçalho (linha 0) → coluna por field id, por rótulo (independe da ordem).
  const header = (src.rows[0] ?? []).map((h) => String(h ?? '').trim());
  const byLabel = new Map(fields.map((f) => [normLabel(f.label), f]));
  const colOf: Record<string, number> = {};
  const unmatchedHeaders: string[] = [];
  header.forEach((h, idx) => {
    if (!h) return;
    const f = byLabel.get(normLabel(h));
    if (f && colOf[f.id] == null) colOf[f.id] = idx;
    else if (!f) unmatchedHeaders.push(h);
  });
  const missingRequiredCols = fields.filter((f) => f.req && colOf[f.id] == null);

  const seen = new Set(src.existingApelidos.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const rows: ImportRow[] = [];

  for (let i = 1; i < src.rows.length; i++) {
    const rawRow = src.rows[i] ?? [];
    if (!rawRow.some((c) => String(c ?? '').trim() !== '')) continue; // pula linha vazia

    const cells: Record<string, ImportCell> = {};
    const values: Record<string, string> = {};

    for (const f of fields) {
      const idx = colOf[f.id];
      const cellRaw = idx != null ? String(rawRow[idx] ?? '').trim() : '';
      const cell = validateCell(f, cellRaw, src);
      cells[f.id] = cell;
      values[f.id] = cell.value;
    }

    // Sexo vem por padrão da categoria (mesmo comportamento da seleção nas
    // telas): quando a planilha não traz Sexo, deriva-o da categoria informada.
    const catCell = cells.categoria;
    const sexoCell = cells.sexo;
    if (sexoCell && sexoCell.raw === '' && catCell && catCell.status === 'ok') {
      const derived = sexoFromCategoria(src.categories, catCell.value);
      if (derived) {
        sexoCell.value = derived;
        sexoCell.status = 'ok';
        sexoCell.msg = undefined;
        values.sexo = derived;
      }
    }

    // Agrega o sinal e as pendências da linha a partir das células avaliadas.
    const issues: string[] = [];
    let status: CellStatus = 'ok';
    for (const f of fields) {
      const cell = cells[f.id];
      status = worst(status, cell.status);
      if (cell.status !== 'ok' && cell.msg) issues.push(`${f.label}: ${cell.msg}`);
    }

    // Duplicidade de ID Manejo (na planilha ou já na lista atual).
    const apelido = (values.apelido || '').trim();
    if (apelido) {
      const key = apelido.toLowerCase();
      if (seen.has(key)) {
        const c = cells.apelido;
        if (c && c.status === 'ok') {
          c.status = 'aviso';
          c.msg = 'ID Manejo duplicado';
        }
        status = worst(status, 'aviso');
        issues.push('ID Manejo duplicado');
      }
      seen.add(key);
    }

    rows.push({ index: i, cells, values, status, issues });
  }

  return {
    fields,
    rows,
    unmatchedHeaders,
    missingRequiredCols,
    okCount: rows.filter((r) => r.status === 'ok').length,
    avisoCount: rows.filter((r) => r.status === 'aviso').length,
    erroCount: rows.filter((r) => r.status === 'erro').length,
  };
}

/** Valores (NascDetalhe.values) das linhas 100% conformes (verde). */
export function okRowValues(result: ImportResult): Record<string, string>[] {
  return result.rows.filter((r) => r.status === 'ok').map((r) => r.values);
}
