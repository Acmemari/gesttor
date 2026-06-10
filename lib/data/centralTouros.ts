import type { Genealogia, ReprodutorTipo } from '../api/reprodutoresClient';

/**
 * Catálogo de touros das centrais para o botão "Localizar das centrais".
 *
 * IMPORTANTE: por enquanto esta é uma lista DEMONSTRATIVA (decisão de produto).
 * O modal de busca/importação já funciona sobre ela; a base completa das
 * centrais será populada depois (podendo migrar para tabela/API sem alterar a
 * interface do modal). Para expandir, basta acrescentar itens a CENTRAL_TOUROS.
 */
export interface CentralTouro {
  id: string;
  nome: string;
  registro?: string;
  dataNascimento?: string; // 'YYYY-MM-DD'
  tipo?: ReprodutorTipo;
  raca?: string;
  central?: string;
  genealogia?: Genealogia;
}

export const CENTRAL_TOUROS: CentralTouro[] = [
  // Reproduz exatamente o diagrama de exemplo (pai/mãe + 4 avós).
  {
    id: 'ct-la-coxilha-renown',
    nome: 'LA COXILHA RENOWN 7290',
    registro: 'AAGB 7290',
    raca: 'Angus',
    tipo: 'semen',
    central: 'La Coxilha',
    genealogia: {
      pai: { nome: 'SAV RENOWN 3439', registro: '' },
      mae: { nome: 'LA COXILHA TE58 LEGENDARY', registro: '' },
      avoPaternoPai: { nome: 'RITO 707 OF IDEAL', registro: '3407 7075' },
      avoPaternoMae: { nome: 'S A V BLACKCAP MAY 4136', registro: '' },
      avoMaternoPai: { nome: 'CONNEALY LEGENDARY 644L', registro: '' },
      avoMaternoMae: { nome: 'MANÁ DE CANTAGALO 3772', registro: '' },
    },
  },
  {
    id: 'ct-sav-renown-3439',
    nome: 'SAV RENOWN 3439',
    registro: '17541956',
    raca: 'Angus',
    tipo: 'semen',
    central: 'Importado (EUA)',
    genealogia: {
      pai: { nome: 'RITO 707 OF IDEAL', registro: '3407 7075' },
      mae: { nome: 'S A V BLACKCAP MAY 4136', registro: '' },
    },
  },
  {
    id: 'ct-rito-707',
    nome: 'RITO 707 OF IDEAL',
    registro: '3407 7075',
    raca: 'Angus',
    tipo: 'semen',
    central: 'Importado (EUA)',
    genealogia: {},
  },
  {
    id: 'ct-rastro-da-cana',
    nome: 'REM NELORE — exemplo demonstrativo',
    registro: '',
    raca: 'Nelore',
    tipo: 'semen',
    central: 'Demonstração',
    genealogia: {},
  },
  {
    id: 'ct-embriao-exemplo',
    nome: 'EMBRIÃO FIV — exemplo demonstrativo',
    registro: '',
    raca: 'Nelore',
    tipo: 'embriao',
    central: 'Demonstração',
    genealogia: {},
  },
];
