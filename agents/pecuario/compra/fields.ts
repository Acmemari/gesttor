/**
 * Registro de campos do painel "Defina seus campos" da Compra (detalhamento por
 * animal). Os ids batem com as chaves do payload de ficha (idManejo, idEletronico,
 * categoria, pesoVivo, valor) para mapear values → fichas sem fricção. `data` é o
 * campo de cabeçalho que repete em todos (paridade com a tela de Nascimento).
 */
import type { LrField } from '../fichas/types';

export const COMPRA_FIELDS: LrField[] = [
  { id: 'idManejo', label: 'ID Manejo', type: 'text', placeholder: '504A', def: 'bottom', locked: true },
  { id: 'idEletronico', label: 'ID Eletrônica', type: 'text', placeholder: 'RFID', def: 'bottom' },
  { id: 'categoria', label: 'Categoria', type: 'cat', req: true, def: 'bottom' },
  { id: 'pesoVivo', label: 'Peso vivo', type: 'weight', def: 'bottom' },
  { id: 'valor', label: 'Valor/kg', type: 'money', def: 'bottom' },
  { id: 'data', label: 'Data', type: 'date', def: 'top' },
];
