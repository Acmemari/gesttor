import { describe, it, expect } from 'vitest';
import {
  reconstructAsOf,
  vigenteEm,
  dentroDaTolerancia,
  mergeRealocacao,
  parseRebanhoPendente,
  type VersaoLike,
} from '../../../../../agents/pecuario/areas/reconstrucao';

/**
 * Cobertura dos 7 critérios de aceite da Movimentação de Áreas (histórico
 * append-only + linha do tempo). Testes puros sobre as versões (sem DB/Leaflet),
 * no padrão de src/test/utils/gestaoLotes.test.ts.
 */

let seq = 0;
const ver = (p: Partial<VersaoLike> & { areaId: string; validFrom: string }): VersaoLike => ({
  nivel: 'local',
  name: `L-${++seq}`,
  parentId: null,
  geometry: [[-15, -52], [-15, -52.01], [-15.01, -52.01]],
  geometrySource: 'desenho',
  uso: 'Pastagem',
  tipo: 'Pasto',
  validTo: null,
  ...p,
});

describe('Movimentação de Áreas — reconstrução por data + regras', () => {
  // ── Critério 1: Dividir A→B,C ───────────────────────────────────────────────
  it('1. dividir: pai encerrado e filhos vigentes; soma de ha bate na tolerância', () => {
    const A = ver({ areaId: 'A', validFrom: '2026-01-01', validTo: '2026-06-01' });
    const B = ver({ areaId: 'B', validFrom: '2026-06-01', validTo: null });
    const C = ver({ areaId: 'C', validFrom: '2026-06-01', validTo: null });
    const versoes = [A, B, C];

    // Antes da divisão: só o pai A.
    const antes = reconstructAsOf(versoes, '2026-03-01').map((a) => a.id).sort();
    expect(antes).toEqual(['A']);

    // Depois: B e C, sem A (A encerrado, mas continua consultável na timeline).
    const depois = reconstructAsOf(versoes, '2026-09-01').map((a) => a.id).sort();
    expect(depois).toEqual(['B', 'C']);

    // Conservação de área: B(50) + C(49.5) ≈ A(100) dentro de 5%.
    expect(dentroDaTolerancia(100, 50 + 49.5)).toBe(true);
    expect(dentroDaTolerancia(100, 60)).toBe(false);
  });

  // ── Critério 2: Unir B,C→D ──────────────────────────────────────────────────
  it('2. unir: origens encerradas e destino vigente; ha do destino ≈ soma das origens', () => {
    const B = ver({ areaId: 'B', validFrom: '2026-01-01', validTo: '2026-07-01' });
    const C = ver({ areaId: 'C', validFrom: '2026-01-01', validTo: '2026-07-01' });
    const D = ver({ areaId: 'D', validFrom: '2026-07-01', validTo: null });
    const versoes = [B, C, D];

    expect(reconstructAsOf(versoes, '2026-03-01').map((a) => a.id).sort()).toEqual(['B', 'C']);
    expect(reconstructAsOf(versoes, '2026-08-01').map((a) => a.id).sort()).toEqual(['D']);
    expect(dentroDaTolerancia(40 + 60, 100)).toBe(true);
  });

  // ── Critério 3: Conversão de uso (pastagem→agricultura) ─────────────────────
  it('3. conversão de uso: mesma identidade; slider mostra uso antigo antes e novo depois', () => {
    const v1 = ver({ areaId: 'X', validFrom: '2026-01-01', validTo: '2026-06-01', uso: 'Pastagem' });
    const v2 = ver({ areaId: 'X', validFrom: '2026-06-01', validTo: null, uso: 'Agricultura' });
    const versoes = [v1, v2];

    const usoEm = (d: string) => reconstructAsOf(versoes, d).find((a) => a.id === 'X')?.uso;
    expect(usoEm('2026-03-01')).toBe('Pastagem');
    expect(usoEm('2026-09-01')).toBe('Agricultura');
  });

  // ── Critério 4: Redesenho de perímetro ──────────────────────────────────────
  it('4. redesenho: slider mostra a geometria antiga antes da data e a nova depois', () => {
    const geoAntiga: [number, number][] = [[-15, -52], [-15, -52.02], [-15.02, -52.02]];
    const geoNova: [number, number][] = [[-15, -52], [-15, -52.05], [-15.05, -52.05]];
    const v1 = ver({ areaId: 'Y', validFrom: '2026-01-01', validTo: '2026-05-01', geometry: geoAntiga });
    const v2 = ver({ areaId: 'Y', validFrom: '2026-05-01', validTo: null, geometry: geoNova });
    const versoes = [v1, v2];

    const coordsEm = (d: string) => reconstructAsOf(versoes, d).find((a) => a.id === 'Y')?.coords;
    expect(coordsEm('2026-03-01')).toEqual(geoAntiga);
    expect(coordsEm('2026-07-01')).toEqual(geoNova);
  });

  // ── Critério 5: Realocação de rebanho obrigatória ───────────────────────────
  it('5. dividir/unir com rebanho sem destino → bloqueia (409); com destinos → passa', () => {
    const err = { payload: { code: 'REBANHO_PENDENTE', locais: [
      { localId: 'A', name: 'Pasto A', total: 70, porCategoria: [
        { categoriaId: 'g', quantidade: 50, pesoKgCabeca: '320.00' },
        { categoriaId: 'b', quantidade: 20, pesoKgCabeca: '180.00' },
      ] },
    ] } };
    const pend = parseRebanhoPendente(err);
    expect(pend).not.toBeNull();
    expect(pend!.locais[0].localId).toBe('A');

    // Sem destino → bloqueado.
    expect(mergeRealocacao(pend!.locais, {})).toEqual({ ok: false, faltando: ['A'] });

    // Com destino (índice do filho) → realocação completa.
    expect(mergeRealocacao(pend!.locais, { A: '0' })).toEqual({ ok: true, realocacao: { A: '0' } });

    // Erro que não é REBANHO_PENDENTE → null.
    expect(parseRebanhoPendente({ payload: { code: 'AREA_TOLERANCIA' } })).toBeNull();
  });

  // ── Critério 6: Append-only — nada é apagado; toda versão sobrevive ──────────
  it('6. append-only: versões encerradas permanecem na linha do tempo (não some o passado)', () => {
    const A = ver({ areaId: 'A', validFrom: '2026-01-01', validTo: '2026-06-01' });
    const B = ver({ areaId: 'B', validFrom: '2026-06-01', validTo: null });
    const versoes = [A, B];
    // O array de versões mantém A mesmo após o encerramento (não é deletado).
    expect(versoes.find((v) => v.areaId === 'A')).toBeDefined();
    // A versão A é vigente no passado e B no presente — cada uma na sua janela.
    expect(vigenteEm(A, '2026-03-01')).toBe(true);
    expect(vigenteEm(A, '2026-09-01')).toBe(false);
    expect(vigenteEm(B, '2026-09-01')).toBe(true);
  });

  // ── Critério 7: Reconstrução fiel em qualquer data; aposentadoria some ──────
  it('7. aposentadoria some do mapa na data, mas a versão é preservada', () => {
    const v = ver({ areaId: 'Z', validFrom: '2026-01-01', validTo: '2026-05-01' });
    const versoes = [v];
    // Presente antes do encerramento, ausente depois.
    expect(reconstructAsOf(versoes, '2026-04-01').map((a) => a.id)).toEqual(['Z']);
    expect(reconstructAsOf(versoes, '2026-06-01').map((a) => a.id)).toEqual([]);
    // Mas a versão continua no histórico (não foi apagada).
    expect(versoes).toHaveLength(1);
  });

  // ── Extra: meio-aberto exato (valid_to > X, não >=) ─────────────────────────
  it('intervalo meio-aberto: na data-limite a sucessora é a vigente', () => {
    const v1 = ver({ areaId: 'W', validFrom: '2026-01-01', validTo: '2026-06-01', uso: 'Pastagem' });
    const v2 = ver({ areaId: 'W', validFrom: '2026-06-01', validTo: null, uso: 'Agricultura' });
    // Exatamente em 2026-06-01: v1 fecha (valid_to = X, não > X) ⇒ vale v2.
    expect(reconstructAsOf([v1, v2], '2026-06-01').find((a) => a.id === 'W')?.uso).toBe('Agricultura');
  });
});
