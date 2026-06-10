import { describe, it, expect } from 'vitest';
import {
  saldo, composicao, pendencias, animaisVinculados,
  localAtual, planoNutri, protocolo, faseRepro, timeline, groupByLote,
} from '../../../agents/pecuario/gestaoLotes/util';
import type { LoteEventoRow } from '../../../agents/pecuario/gestaoLotes/types';

let seq = 0;
function ev(
  loteId: string,
  tipo: LoteEventoRow['tipo'],
  data: string,
  dados: Record<string, any>,
): LoteEventoRow {
  seq++;
  return {
    id: `e${seq}`,
    organizationId: 'org',
    loteId,
    tipo,
    data,
    resp: null,
    dados,
    criadoPor: null,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`,
  };
}

const aloc = (loteId: string, data: string, p: Record<string, any>) =>
  ev(loteId, 'alocacao', data, { sentido: 'entrada', outroLoteId: null, qtd: 0, categoriaId: null, naoIdent: 0, animais: [], ...p });

describe('Gestão de Lotes — selectors', () => {
  it('saldo nets entradas menos saídas', () => {
    const evs = [
      aloc('A', '2026-01-01', { sentido: 'entrada', qtd: 84, categoriaId: 'gar' }),
      aloc('A', '2026-02-01', { sentido: 'saida', outroLoteId: 'B', qtd: 30, categoriaId: 'gar' }),
    ];
    expect(saldo(evs)).toBe(54);
  });

  it('composicao agrupa por categoria e exclui saldo zero/negativo', () => {
    const evs = [
      aloc('A', '2026-01-01', { sentido: 'entrada', qtd: 84, categoriaId: 'gar', categoriaNome: 'Garrote' }),
      aloc('A', '2026-01-02', { sentido: 'entrada', qtd: 10, categoriaId: 'boi', categoriaNome: 'Boi gordo' }),
      aloc('A', '2026-02-01', { sentido: 'saida', outroLoteId: 'B', qtd: 30, categoriaId: 'gar', categoriaNome: 'Garrote' }),
      aloc('A', '2026-02-02', { sentido: 'saida', outroLoteId: 'B', qtd: 10, categoriaId: 'boi', categoriaNome: 'Boi gordo' }),
    ];
    const comp = composicao(evs);
    expect(comp).toEqual([{ categoriaId: 'gar', categoriaNome: 'Garrote', qtd: 54 }]);
  });

  it('pendencias soma naoIdent das entradas (clamp ≥ 0)', () => {
    const evs = [
      aloc('A', '2026-01-01', { sentido: 'entrada', qtd: 120, categoriaId: 'boi', naoIdent: 6 }),
    ];
    expect(pendencias(evs)).toBe(6);
  });

  it('animaisVinculados adiciona nas entradas e remove nas saídas (dedup)', () => {
    const evs = [
      aloc('A', '2026-01-01', { sentido: 'entrada', qtd: 3, categoriaId: 'gar', animais: ['a1', 'a2', 'a3'] }),
      aloc('A', '2026-02-01', { sentido: 'saida', outroLoteId: 'B', qtd: 1, categoriaId: 'gar', animais: ['a2'] }),
    ];
    expect(animaisVinculados(evs).sort()).toEqual(['a1', 'a3']);
    // Saldo por contagem de animais quando qtd informado:
    expect(saldo(evs)).toBe(2);
  });

  it('localAtual usa a última transferência por data', () => {
    const evs = [
      ev('A', 'transferencia', '2026-01-01', { de: 'Curral', para: 'Retiro Sede', tipoLocal: 'Retiro' }),
      ev('A', 'transferencia', '2026-03-01', { de: 'Retiro Sede', para: 'Pasto Cabeceira', tipoLocal: 'Pasto' }),
    ];
    expect(localAtual(evs)).toBe('Pasto Cabeceira');
  });

  it('planoNutri e protocolo derivam do último manejo de cada dimensão', () => {
    const evs = [
      ev('A', 'manejo', '2026-01-01', { dim: 'nutricional', plano: 'Adaptação' }),
      ev('A', 'manejo', '2026-02-01', { dim: 'nutricional', plano: 'Crescimento' }),
      ev('A', 'manejo', '2026-02-05', { dim: 'reprodutivo', plano: 'IATF D0' }),
    ];
    expect(planoNutri(evs)).toBe('Crescimento');
    expect(protocolo(evs)).toBe('IATF D0');
  });

  it('faseRepro retorna a última fase ou texto padrão', () => {
    expect(faseRepro([])).toBe('Sem evento reprodutivo');
    const evs = [
      ev('A', 'repro', '2026-01-01', { fase: 'Estação de monta', detalhe: '' }),
      ev('A', 'repro', '2026-02-01', { fase: 'Diagnóstico de gestação', detalhe: '112 prenhes' }),
    ];
    expect(faseRepro(evs)).toBe('Diagnóstico de gestação');
  });

  it('timeline ordena do mais recente ao mais antigo', () => {
    const evs = [
      aloc('A', '2026-01-01', { sentido: 'entrada', qtd: 84, categoriaId: 'gar', categoriaNome: 'Garrote' }),
      ev('A', 'transferencia', '2026-03-01', { de: 'A', para: 'Pasto', tipoLocal: 'Pasto' }),
      ev('A', 'manejo', '2026-02-01', { dim: 'nutricional', plano: 'Crescimento' }),
    ];
    const t = timeline(evs);
    expect(t.map((i) => i.data)).toEqual(['2026-03-01', '2026-02-01', '2026-01-01']);
    expect(t[2].titulo).toContain('+84');
  });

  it('groupByLote separa eventos por lote (espelhamento entre lotes)', () => {
    // Espelho: saída em A + entrada em B, como o repositório produz.
    const evs = [
      aloc('A', '2026-01-01', { sentido: 'saida', outroLoteId: 'B', qtd: 30, categoriaId: 'gar' }),
      aloc('B', '2026-01-01', { sentido: 'entrada', outroLoteId: 'A', qtd: 30, categoriaId: 'gar' }),
    ];
    const byLote = groupByLote(evs);
    expect(saldo(byLote['A'])).toBe(-30);
    expect(saldo(byLote['B'])).toBe(30);
  });
});
