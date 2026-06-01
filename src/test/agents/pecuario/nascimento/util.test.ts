import { describe, it, expect } from 'vitest';
import {
  proximoApelido,
  parseWeight,
  somaCategorias,
  semCategoria,
  statusFrom,
  custoSanitario,
  tallyPorCategoria,
  safraAtual,
  formatDateBR,
} from '../../../../../agents/pecuario/nascimento/util';
import type { NascCat, NascDetalhe, SanItem } from '../../../../../agents/pecuario/nascimento/types';

describe('proximoApelido', () => {
  it('incrementa preservando zeros à esquerda', () => {
    expect(proximoApelido('001')).toBe('002');
    expect(proximoApelido('009')).toBe('010');
  });

  it('preserva prefixo e sufixo', () => {
    expect(proximoApelido('BZ-09')).toBe('BZ-10');
    expect(proximoApelido('504A')).toBe('505A');
  });

  it('retorna vazio para entrada vazia e o original quando não há número', () => {
    expect(proximoApelido('')).toBe('');
    expect(proximoApelido('SEMNUM')).toBe('SEMNUM');
  });

  it('transborda a contagem de dígitos quando necessário', () => {
    expect(proximoApelido('99')).toBe('100');
  });
});

describe('parseWeight', () => {
  it('aceita vírgula decimal', () => {
    expect(parseWeight('12,5')).toBe(12.5);
  });
  it('aceita ponto decimal', () => {
    expect(parseWeight('12.5')).toBe(12.5);
  });
  it('retorna 0 para inválido/vazio', () => {
    expect(parseWeight('')).toBe(0);
    expect(parseWeight('abc')).toBe(0);
    expect(parseWeight(null)).toBe(0);
  });
});

describe('somaCategorias / semCategoria', () => {
  const cats: NascCat[] = [
    { catId: 'a', catNome: 'A', qtd: 5 },
    { catId: 'b', catNome: 'B', qtd: 3 },
  ];
  it('soma as quantidades declaradas', () => {
    expect(somaCategorias(cats)).toBe(8);
    expect(somaCategorias([])).toBe(0);
  });
  it('semCategoria nunca é negativa', () => {
    expect(semCategoria(18, 8)).toBe(10);
    expect(semCategoria(5, 8)).toBe(0);
  });
});

describe('statusFrom', () => {
  it('pendente quando há não identificados', () => {
    expect(statusFrom(3)).toBe('pendente');
  });
  it('conciliado quando zerado', () => {
    expect(statusFrom(0)).toBe('conciliado');
  });
});

describe('custoSanitario', () => {
  it('soma o custo das aplicações', () => {
    const items: SanItem[] = [
      { id: 1, medId: 'm1', nome: 'X', unidade: 'DOSE', tipoDose: 'Fixa', dose: 2, porKg: 0, custo: 4.8 },
      { id: 2, medId: 'm2', nome: 'Y', unidade: 'ML', tipoDose: '', dose: 1, porKg: 0, custo: 0.65 },
    ];
    expect(custoSanitario(items)).toBeCloseTo(5.45, 2);
    expect(custoSanitario([])).toBe(0);
  });
});

describe('tallyPorCategoria', () => {
  it('conta detalhados por categoria, ignorando sem categoria', () => {
    const det: NascDetalhe[] = [
      { id: 1, values: { apelido: '1', categoria: 'a' } },
      { id: 2, values: { apelido: '2', categoria: 'a' } },
      { id: 3, values: { apelido: '3', categoria: 'b' } },
      { id: 4, values: { apelido: '4', categoria: '' } },
    ];
    expect(tallyPorCategoria(det)).toEqual({ a: 2, b: 1 });
  });
});

describe('safraAtual', () => {
  it('vira no meio do ano (julho)', () => {
    expect(safraAtual(new Date(2026, 6, 1))).toBe('2026/2027'); // julho
    expect(safraAtual(new Date(2026, 5, 1))).toBe('2025/2026'); // junho
  });
});

describe('formatDateBR', () => {
  it('formata ISO em DD/MM/YYYY', () => {
    expect(formatDateBR('2026-06-01')).toBe('01/06/2026');
    expect(formatDateBR('')).toBe('—');
  });
});
