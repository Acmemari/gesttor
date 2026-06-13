/**
 * Registro de campos do painel "Defina seus campos" da Venda (detalhamento por
 * animal). Os ids batem com as chaves do payload de ficha (idManejo, idEletronico,
 * categoria, pesoVivo, pesoMorto, valor). O rótulo do Valor depende do tipo de
 * peso (R$/@ no abate, R$/kg no pé). `data` repete em todos (paridade c/ Nascimento).
 */
import type { LrField } from '../fichas/types';

export function vendaFields(tipoPeso: string): LrField[] {
  return [
    { id: 'idManejo', label: 'ID Manejo', type: 'text', placeholder: '504A', def: 'bottom', locked: true },
    { id: 'idEletronico', label: 'ID Eletrônica', type: 'text', placeholder: 'RFID', def: 'bottom' },
    { id: 'categoria', label: 'Categoria', type: 'cat', req: true, def: 'bottom' },
    { id: 'pesoVivo', label: 'Peso vivo', type: 'weight', def: 'bottom' },
    { id: 'pesoMorto', label: 'Peso morto', type: 'weight', def: 'bottom' },
    { id: 'valor', label: tipoPeso === 'kg' ? 'Valor/kg' : 'Valor/@', type: 'money', def: 'bottom' },
    { id: 'data', label: 'Data', type: 'date', def: 'top' },
  ];
}
