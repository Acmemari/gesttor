/**
 * Registro de campos do "Lançamento Rápido" e listas estáticas.
 * Porta de LR_REGISTRY do protótipo (views_movimentacao.js).
 */
import type { LrField, FieldPlaces } from './types';

export const RACAS = ['Nelore', 'Anelorado', 'Brangus', 'Angus', 'Senepol', 'Cruzado'] as const;
export const GRAUS = ['PO', 'PC', '1/2 sangue', '3/4 sangue', '5/8 sangue', 'Cruzado'] as const;
export const PELAGENS = ['Branca', 'Preta', 'Cinza', 'Vermelha', 'Amarela', 'Baia', 'Castanha'] as const;
export const CHIFRES = ['Aspado', 'Mocho', 'Mochado', 'Batoque'] as const;
export const PORTES = ['P', 'M', 'G'] as const;
export const PESAGENS = ['Manual', 'Balança'] as const;
export const COLOSTRO = ['Sim', 'Não'] as const;
export const TIPO_DOSE = ['Fixa', 'Por Peso'] as const;

/** Ficha Animal · Características e cadastro essencial. */
export const FRAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export const CATEGORIAS_GENEALOGICAS = ['Comercial', 'PO', 'PC', 'LA'] as const;
export const CEIP = ['Sim', 'Não'] as const;
export const EVENTOS_ENTRADA = ['Nascimento', 'Compra', 'Transferência', 'Doação', 'Herança', 'Outro'] as const;

/** Lotes estáticos (sem backend de Movimentação ainda). */
export const LOTES_ESTATICOS = [
  { id: 'lote-1', nome: 'RC-01 · Recria Machos 24' },
  { id: 'lote-2', nome: 'EN-02 · Engorda Confinamento' },
  { id: 'lote-3', nome: 'RP-03 · Matrizes IATF' },
];

/** Medicamentos/vacinas estáticos com custo unitário. */
export const MEDICAMENTOS = [
  { id: 'med-1', nome: 'Vacina Aftosa', unidade: 'DOSE', custoUnit: 2.4 },
  { id: 'med-2', nome: 'Vacina Brucelose B19', unidade: 'DOSE', custoUnit: 3.1 },
  { id: 'med-3', nome: 'Vacina Clostridiose', unidade: 'DOSE', custoUnit: 1.8 },
  { id: 'med-4', nome: 'Vermífugo Ivermectina 1%', unidade: 'ML', custoUnit: 0.65 },
  { id: 'med-5', nome: 'Agulha Descartável 40x12', unidade: 'UNIDADE', custoUnit: 0.01 },
  { id: 'med-6', nome: 'Mineral Injetável ADE', unidade: 'ML', custoUnit: 0.9 },
];

/** Protocolos sanitários estáticos. */
export const PROTOCOLOS = [
  { id: 'pr-1', nome: 'Protocolo Cria — 1ª dose' },
  { id: 'pr-2', nome: 'Protocolo Sanitário Anual' },
  { id: 'pr-3', nome: 'Protocolo Pré-desmame' },
];

/** Registro de campos configuráveis, em ordem de exibição. */
export const LR_REGISTRY: LrField[] = [
  { id: 'apelido', label: 'ID Manejo', type: 'text', req: true, placeholder: '504A', def: 'bottom', locked: true },
  { id: 'categoria', label: 'Categoria', type: 'cat', req: true, def: 'bottom' },
  { id: 'data', label: 'Data', type: 'date', req: true, def: 'top' },
  { id: 'raca', label: 'Raça', type: 'select', req: true, options: RACAS, def: 'top', default: 'Nelore' },
  { id: 'lote', label: 'Lote', type: 'lote', def: 'top' },
  { id: 'rfid', label: 'ID Eletrônica', type: 'text', placeholder: 'RFID', def: 'bottom' },
  { id: 'sisbov', label: 'Nº SISBOV', type: 'text', placeholder: 'SISBOV', def: 'bottom' },
  { id: 'sexo', label: 'Sexo', type: 'sexo', req: true, def: 'bottom', default: 'Macho' },
  { id: 'porte', label: 'Porte', type: 'select', req: true, options: PORTES, def: 'bottom', default: 'M' },
  { id: 'colostro', label: 'Colostro?', type: 'select', options: COLOSTRO, def: 'bottom', default: 'Sim' },
  { id: 'peso', label: 'Peso nasc.', type: 'weight', def: 'bottom' },
  { id: 'pesagem', label: 'Pesagem', type: 'select', options: PESAGENS, def: 'bottom', default: 'Manual' },
  { id: 'sanitario', label: 'Sanitário', type: 'sanitario', def: 'top', enableOnly: true },
  { id: 'nome', label: 'Nome Completo', type: 'text', placeholder: 'Nome Completo', def: 'dados', span: 2 },
  { id: 'pesoNascer', label: 'Peso ao Nascer', type: 'weight', def: 'dados' },
  { id: 'grau', label: 'Grau de Sangue', type: 'select', options: GRAUS, placeholder: 'Grau de Sangue', def: 'dados' },
  { id: 'rgn', label: 'RGN/Tatuagem', type: 'text', placeholder: 'RGN/Tatuagem', def: 'dados' },
  { id: 'pelagem', label: 'Pelagem', type: 'select', options: PELAGENS, placeholder: 'Pelagem', def: 'dados' },
  { id: 'chifre', label: 'Tipo de Chifre', type: 'select', options: CHIFRES, placeholder: 'Tipo de Chifre', def: 'dados' },
  { id: 'rgd', label: 'RGD', type: 'text', placeholder: 'RGD', def: 'dados' },
  { id: 'serie', label: 'Série Alfa', type: 'text', placeholder: 'Série Alfa', def: 'dados' },
  { id: 'pai', label: 'Pai - ID Usual', type: 'text', placeholder: 'Pai - ID Usual', def: 'dados' },
  { id: 'mae', label: 'Mãe - ID Usual', type: 'text', placeholder: 'Mãe - ID Usual', def: 'dados' },
  { id: 'obs', label: 'Observação', type: 'textarea', placeholder: 'Observação', def: 'dados', span: 3 },
];

export const FIELD_BY_ID: Record<string, LrField> = Object.fromEntries(
  LR_REGISTRY.map((f) => [f.id, f]),
);

/** Ordem padrão de exibição dos campos (índice do registry). */
export const DEFAULT_ORDER: string[] = LR_REGISTRY.map((f) => f.id);

/** Mapa padrão campo → destino. */
export function defaultPlaces(): FieldPlaces {
  const p: FieldPlaces = {};
  for (const f of LR_REGISTRY) p[f.id] = f.def;
  return p;
}

/** Valor inicial de um campo no formulário de entrada. */
export function defaultValue(fieldId: string, today: string, sharedRaca?: string): string {
  switch (fieldId) {
    case 'data':
      return today;
    case 'raca':
      return sharedRaca || 'Nelore';
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
