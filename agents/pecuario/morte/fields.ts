/**
 * Registro de campos do painel "Defina seus campos" da Morte (detalhamento por
 * animal). Os ids batem com as chaves do payload de ficha (idManejo, idEletronico,
 * categoria, motivo, obs). `motivo` é um lookup dinâmico (lista de motivos da
 * organização), passado via `lookups={{ motivo: motivos }}`. `data` repete em
 * todos (paridade com a tela de Nascimento).
 */
import type { LrField } from '../fichas/types';

export const MORTE_FIELDS: LrField[] = [
  { id: 'idManejo', label: 'ID de Manejo', type: 'text', placeholder: '504A', def: 'bottom', locked: true },
  { id: 'idEletronico', label: 'ID Eletrônico', type: 'text', placeholder: 'RFID', def: 'bottom' },
  { id: 'categoria', label: 'Categoria', type: 'cat', req: true, def: 'bottom' },
  { id: 'motivo', label: 'Motivo da morte', type: 'lookup', req: true, lookupKey: 'motivo', placeholder: 'Selecione o motivo', def: 'bottom' },
  { id: 'obs', label: 'Observação', type: 'text', placeholder: 'Opcional', def: 'bottom' },
  { id: 'data', label: 'Data', type: 'date', def: 'top' },
];
