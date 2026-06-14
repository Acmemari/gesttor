/**
 * Registro de campos do painel "Defina seus campos" do Consumo/Doação
 * (detalhamento por animal). Os ids batem com as chaves do payload de ficha
 * (idManejo, idEletronico, categoria, tipo, pesoVivo, pesoMorto, valor, obs).
 * `tipo` é um lookup com lista fixa (CONSUMO_TIPOS), passada via
 * `lookups={{ tipo: ... }}`. `data` repete em todos (paridade c/ Nascimento).
 */
import type { LrField } from '../fichas/types';

export const CONSUMO_FIELDS: LrField[] = [
  { id: 'idManejo', label: 'ID de Manejo', type: 'text', placeholder: '504A', def: 'bottom', locked: true },
  { id: 'idEletronico', label: 'ID Eletrônico', type: 'text', placeholder: 'RFID', def: 'bottom' },
  { id: 'categoria', label: 'Categoria', type: 'cat', req: true, def: 'bottom' },
  { id: 'tipo', label: 'Tipo', type: 'lookup', req: true, lookupKey: 'tipo', placeholder: 'Selecione o tipo', def: 'bottom' },
  { id: 'pesoVivo', label: 'Peso Vivo/Cabeça', type: 'weight', def: 'bottom' },
  { id: 'pesoMorto', label: 'Peso Morto/Cabeça', type: 'weight', def: 'bottom' },
  { id: 'valor', label: 'Valor Cabeça', type: 'money', def: 'bottom' },
  { id: 'obs', label: 'Observação', type: 'text', placeholder: 'Opcional', def: 'bottom' },
  { id: 'data', label: 'Data', type: 'date', def: 'top' },
];
