import { describe, it, expect } from 'vitest';
import { computeVendaAbate } from '../../../agents/pecuario/venda/util';
import type { VendaCat } from '../../../agents/pecuario/venda/types';

describe('Venda Calculations - computeVendaAbate', () => {
  it('should calculate Venda Abate correctly without discount', () => {
    const items: VendaCat[] = [
      {
        id: 1,
        catId: 'cat1',
        catNome: 'Novilhas',
        qtd: 10,
        pesoVivoKg: 450,
        valorArroba: 300,
        pesoMortoTotal: 2250, // 150 @ total
        desconto: null,
      },
    ];

    const result = computeVendaAbate(items, 'abate', 'arroba', 0);

    expect(result.totalCab).toBe(10);
    expect(result.totalPesoVivo).toBe(4500);
    expect(result.totalPesoMorto).toBe(2250);
    expect(result.valorArroba).toBe(300); // (2250 / 15) * 300 / 150 = 300
    expect(result.pesoMortoCab).toBe(225);
    expect(result.pesoMortoArroba).toBe(15);
    expect(result.rendimento).toBe(50); // (2250 / 4500) * 100
    expect(result.valorTotal).toBe(45000); // 150 @ * 300 R$
    expect(result.valorCab).toBe(4500);
  });

  it('should calculate Venda Abate priced per kg (tipoPeso=kg)', () => {
    const items: VendaCat[] = [
      {
        id: 1,
        catId: 'cat1',
        catNome: 'Novilhas',
        qtd: 10,
        pesoVivoKg: 450,
        valorArroba: 20, // no modo kg, valorArroba carrega o valor POR QUILO (R$/kg de carcaça)
        pesoMortoTotal: 2250, // 225 kg/cab
        desconto: null,
      },
    ];

    const result = computeVendaAbate(items, 'abate', 'kg', 0);

    expect(result.totalCab).toBe(10);
    expect(result.totalPesoVivo).toBe(4500);
    expect(result.totalPesoMorto).toBe(2250);
    expect(result.valorTotal).toBe(45000); // 2250 kg * 20 R$/kg
    expect(result.valorArroba).toBe(20); // valor/kg médio = 45000 / 2250
    expect(result.pesoMortoCab).toBe(225); // 2250 / 10
    expect(result.pesoMortoArroba).toBeNull(); // sem métrica em arroba no modo kg
    expect(result.rendimento).toBe(50); // (2250 / 4500) * 100
    expect(result.valorCab).toBe(4500); // 45000 / 10
  });

  it('should calculate Venda em Pé (Peso Vivo) correctly with discount', () => {
    const items: VendaCat[] = [
      {
        id: 1,
        catId: 'cat1',
        catNome: 'Boi Gordo',
        qtd: 20,
        pesoVivoKg: 500,
        valorArroba: 12, // 12 R$/kg
        pesoMortoTotal: 10000, // No front, para PE, pesoMortoTotal armazena pesoVivoTotal bruto (20 * 500 = 10000)
        desconto: 2,
      },
    ];

    // Desconto de 2%
    const result = computeVendaAbate(items, 'pe', 'kg', 2);

    // Peso Líquido Total = 10000 * 0.98 = 9800 kg
    expect(result.totalCab).toBe(20);
    expect(result.totalPesoMorto).toBe(9800); // Armazenado no totalPesoMorto
    expect(result.valorArroba).toBe(12); // Valor por quilo médio ponderado = 12 R$
    expect(result.pesoMortoCab).toBe(490); // 9800 / 20 = 490 kg
    expect(result.pesoMortoArroba).toBeNull();
    expect(result.rendimento).toBeNull();
    expect(result.valorTotal).toBe(117600); // 9800 kg * 12 R$
    expect(result.valorCab).toBe(5880); // 117600 / 20 = 5880 R$
  });
});
