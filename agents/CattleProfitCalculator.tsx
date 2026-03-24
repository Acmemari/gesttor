import React, { useState, useEffect, useMemo } from 'react';
import Slider from '../components/Slider';
import ResultCard from '../components/ResultCard';
import { CattleCalculatorInputs, CalculationResults } from '../types';
import { SlidersHorizontal, Save, Grid3X3, Download } from 'lucide-react';
import SaveScenarioModal from '../components/SaveScenarioModal';
import { saveScenario } from '../lib/scenarios';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { useClient } from '../contexts/ClientContext';
import { useFarm } from '../contexts/FarmContext';
import { Toast } from '../components/Toast';
import { generateReportPDF } from '../lib/generateReportPDF';

interface CattleProfitCalculatorProps {
  initialInputs?: CattleCalculatorInputs;
  onToast?: (toast: Toast) => void;
  onNavigateToSaved?: () => void;
}

import { calculateLivestockIRR, convertMonthlyToAnnualRate } from '../lib/calculations';

const DIAS_POR_MES = 30.41667;

function diasParaMesesDias(dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return '—';
  const meses = Math.floor(dias / DIAS_POR_MES);
  const diasResto = Math.round(dias % DIAS_POR_MES);
  return `${meses} meses + ${diasResto} dias`;
}

function diasParaMesesDecimal(dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return '—';
  const meses = dias / DIAS_POR_MES;
  return `${meses.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`;
}

function diasParaMesesBadge(dias: number): { number: string; unit: string } {
  if (!Number.isFinite(dias) || dias <= 0) return { number: '—', unit: 'meses' };
  const meses = dias / DIAS_POR_MES;
  return {
    number: meses.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    unit: 'meses',
  };
}

const CattleProfitCalculator: React.FC<CattleProfitCalculatorProps> = ({
  initialInputs,
  onToast,
  onNavigateToSaved,
}) => {
  const { user } = useAuth();
  const { country, currencySymbol } = useLocation();
  const { selectedClient } = useClient();
  const { selectedFarm } = useFarm();
  const defaultInputs = useMemo(
    () => ({
      pesoCompra: 200, // 1. Peso de compra (kg)
      valorCompra: 14.5, // 2. Valor de compra (R$/kg)
      pesoAbate: 530, // 3. Peso vivo ao abate (kg)
      rendimentoCarcaca: 54.5, // 4. Rendimento de carcaça (%)
      valorVenda: 300, // 5. Valor de venda (R$ por arroba)
      gmd: 0.65, // 6. Ganho médio diário – GMD (kg/dia)
      custoMensal: 135, // 7. Desembolso por cabeça ao mês (R$/cab/mês)
      lotacao: 1.5, // 8. Lotação (UA/HA)
    }),
    [],
  );

  // Initial state based on the PDF Page 8 Ranges
  const [inputs, setInputs] = useState<CattleCalculatorInputs>(
    initialInputs ? { ...defaultInputs, ...initialInputs } : defaultInputs,
  );

  const [results, setResults] = useState<CalculationResults | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Rastrear se algum dos indicadores interdependentes foi alterado
  const [isInterdependentChanged, setIsInterdependentChanged] = useState(false);

  // Rastrear se GMD foi alterado (para destacar Desembolso)
  const [isGmdChanged, setIsGmdChanged] = useState(false);

  // Estado para métrica selecionada na matriz de sensibilidade
  const [selectedMetric, setSelectedMetric] = useState<
    'resultado' | 'tirMensal' | 'tirAnual' | 'margem' | 'resultadoPorHectareAno'
  >('resultado');

  // Update inputs when initialInputs changes
  useEffect(() => {
    if (initialInputs) {
      setInputs({ ...defaultInputs, ...initialInputs });
    }
  }, [initialInputs, defaultInputs]);

  // Ajustar valores quando o país mudar para garantir que estejam dentro dos ranges
  useEffect(() => {
    setInputs(prev => {
      const updated = { ...prev };

      // Ajustar valor de compra para ficar dentro do range
      if (country === 'PY') {
        if (prev.valorCompra < 15000) {
          updated.valorCompra = 15000;
        } else if (prev.valorCompra > 30000) {
          updated.valorCompra = 30000;
        }
        // Ajustar valor de venda
        if (prev.valorVenda < 20000) {
          updated.valorVenda = 20000;
        } else if (prev.valorVenda > 40000) {
          updated.valorVenda = 40000;
        }
      } else {
        if (prev.valorCompra < 9) {
          updated.valorCompra = 9;
        } else if (prev.valorCompra > 18) {
          updated.valorCompra = 18;
        }
        // Ajustar valor de venda
        if (prev.valorVenda < 250) {
          updated.valorVenda = 250;
        } else if (prev.valorVenda > 380) {
          updated.valorVenda = 380;
        }
      }

      return updated;
    });
  }, [country]);

  // Constants
  const ARROBA_KG = 15;
  const YIELD_PURCHASE = 50;

  const handleInputChange = (key: keyof CattleCalculatorInputs, value: number) => {
    setInputs(prev => ({ ...prev, [key]: value }));

    // Se alterar pesoCompra, valorCompra ou gmd, marcar como interdependente alterado
    // Se alterar qualquer outro indicador, voltar ao estado original (borda azul)
    if (key === 'pesoCompra' || key === 'valorCompra' || key === 'gmd') {
      setIsInterdependentChanged(true);
    } else {
      setIsInterdependentChanged(false);
    }

    // Se alterar GMD, destacar também o Desembolso com cor diferente
    if (key === 'gmd') {
      setIsGmdChanged(true);
    } else {
      setIsGmdChanged(false);
    }
  };

  useEffect(() => {
    const pesoCompraArrobas = (inputs.pesoCompra * (YIELD_PURCHASE / 100)) / ARROBA_KG;

    // Para Paraguai: peso vivo X rendimento de carcaça (resultado em kg carcaça)
    // Para Brasil: peso vivo X rendimento de carcaça / 15 (resultado em arrobas)
    const pesoFinalKgCarcaca = inputs.pesoAbate * (inputs.rendimentoCarcaca / 100);
    const pesoFinalArrobas =
      country === 'PY'
        ? pesoFinalKgCarcaca / ARROBA_KG // Converter para arrobas apenas para cálculos internos
        : pesoFinalKgCarcaca / ARROBA_KG;

    const arrobasProduzidas = pesoFinalArrobas - pesoCompraArrobas;

    const weightGainNeeded = inputs.pesoAbate - inputs.pesoCompra;
    const diasPermanencia = weightGainNeeded > 0 ? weightGainNeeded / inputs.gmd : 0;
    const mesesPermanencia = diasPermanencia / 30.41667;

    // Para Paraguai: valorVenda está em G$/kg carcaça, então multiplica por kg carcaça
    // Para Brasil: valorVenda está em R$/@, então multiplica por arrobas
    const valorBoi = country === 'PY' ? pesoFinalKgCarcaca * inputs.valorVenda : pesoFinalArrobas * inputs.valorVenda;
    const custoCompra = inputs.pesoCompra * inputs.valorCompra;

    // Para Paraguai: custo mensal deve ser multiplicado por 1000 para o cálculo de resultados
    const custoMensalAjustado = country === 'PY' ? inputs.custoMensal * 1000 : inputs.custoMensal;
    const custoOperacional = mesesPermanencia * custoMensalAjustado;
    const custoTotal = custoCompra + custoOperacional;
    const resultadoPorBoi = valorBoi - custoTotal;

    const margemVenda = valorBoi > 0 ? (resultadoPorBoi / valorBoi) * 100 : 0;

    // Cálculo da TIR Mensal usando Newton-Raphson
    const resultadoMensal = calculateLivestockIRR(
      inputs.pesoCompra,
      inputs.valorCompra,
      custoMensalAjustado,
      valorBoi,
      mesesPermanencia,
    );

    // TIR Anualizada usando juros compostos: (1 + i)^12 - 1
    const resultadoAnual = convertMonthlyToAnnualRate(resultadoMensal);

    const custoPorArrobaProduzida = arrobasProduzidas > 0 ? custoOperacional / arrobasProduzidas : 0;
    // Para Paraguai: custo por kg carcaça final; Para Brasil: custo por arroba final
    const custoPorArrobaFinal =
      country === 'PY'
        ? pesoFinalKgCarcaca > 0
          ? custoTotal / pesoFinalKgCarcaca
          : 0
        : pesoFinalArrobas > 0
          ? custoTotal / pesoFinalArrobas
          : 0;

    // Indicador 13: Giro de estoque
    const giroEstoque = mesesPermanencia > 0 ? (12 / mesesPermanencia) * 100 : 0;

    // Indicador 14: Produção @/ha
    // Passo 1: Peso médio
    const pesoMedio = (inputs.pesoCompra + inputs.pesoAbate) / 2;
    // Passo 2: Lotação em cabeça
    const lotacaoCabecas = pesoMedio > 0 ? (450 * inputs.lotacao) / pesoMedio : 0;
    // Passo 3: Produção @/ha
    const producaoArrobaPorHa = mesesPermanencia > 0 ? (arrobasProduzidas / mesesPermanencia) * 12 * lotacaoCabecas : 0;

    // Indicador 15: Resultado por @ final (ou por kg carcaça para PY)
    // Para Paraguai: valorVenda está em G$/kg, então resultadoPorArrobaFinal será em G$/kg
    // Para Brasil: valorVenda está em R$/@, então resultadoPorArrobaFinal será em R$/@
    const resultadoPorArrobaFinal =
      country === 'PY' ? inputs.valorVenda - custoPorArrobaFinal : inputs.valorVenda - custoPorArrobaFinal;

    // Indicador 16: Resultado por hectare ano
    // Usar 5 casas decimais para o tempo de permanência em meses
    const mesesPermanenciaArredondado = Math.round(mesesPermanencia * 100000) / 100000;
    const resultadoPorHectareAno =
      mesesPermanenciaArredondado > 0 ? (resultadoPorBoi / mesesPermanenciaArredondado) * 12 * lotacaoCabecas : 0;

    setResults({
      pesoCompraArrobas,
      pesoFinalArrobas,
      pesoFinalKgCarcaca: country === 'PY' ? pesoFinalKgCarcaca : undefined,
      arrobasProduzidas,
      diasPermanencia,
      mesesPermanencia,
      valorBoi,
      custoCompra,
      custoOperacional,
      custoTotal,
      resultadoPorBoi,
      margemVenda,
      resultadoMensal,
      resultadoAnual,
      custoPorArrobaProduzida,
      custoPorArrobaFinal,
      giroEstoque,
      producaoArrobaPorHa,
      resultadoPorArrobaFinal,
      resultadoPorHectareAno,
    });
  }, [inputs, country]);

  // Matriz de Sensibilidade: Valor de Venda (colunas) x Valor de Compra (linhas)
  const sensitivityMatrix = useMemo(() => {
    if (!results) return { rows: [], cols: [], min: 0, max: 0 };

    // Constantes
    const ARROBA_KG = 15;
    const pesoFinalKgCarcaca = inputs.pesoAbate * (inputs.rendimentoCarcaca / 100);
    const pesoFinalArrobas = pesoFinalKgCarcaca / ARROBA_KG;

    // Para Paraguai: custo mensal deve ser multiplicado por 1000 para o cálculo de resultados
    const custoMensalAjustado = country === 'PY' ? inputs.custoMensal * 1000 : inputs.custoMensal;
    const custoOperacionalBase = results.mesesPermanencia * custoMensalAjustado;

    // Variações: -10%, -5%, Base, +5%, +10%
    const variations = [-0.1, -0.05, 0, 0.05, 0.1];

    // Colunas: Valor de Venda (variações sobre a premissa 5)
    const cols = variations.map(v => ({
      variation: v,
      value: Math.round(inputs.valorVenda * (1 + v)),
      label: v === 0 ? 'Base' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
    }));

    // Coletar todos os valores para calcular min/max
    const allValues: number[] = [];

    // Linhas: Valor de Compra (variações sobre a premissa 2)
    const rows = variations.map(vCompra => {
      const valorCompraVar = inputs.valorCompra * (1 + vCompra);

      // Calcular resultado para cada combinação
      const cells = variations.map(vVenda => {
        const valorVendaVar = inputs.valorVenda * (1 + vVenda);

        // Recalcular com os novos valores
        const custoCompraVar = inputs.pesoCompra * valorCompraVar;

        // Para Paraguai: valorVenda está em G$/kg carcaça, então multiplica por kg carcaça
        // Para Brasil: valorVenda está em R$/@, então multiplica por arrobas
        const valorBoiVar = country === 'PY' ? pesoFinalKgCarcaca * valorVendaVar : pesoFinalArrobas * valorVendaVar;

        // O custo operacional não muda com as variações de preço
        const custoOperacionalVar = custoOperacionalBase;
        const custoTotalVar = custoCompraVar + custoOperacionalVar;
        const resultadoVar = valorBoiVar - custoTotalVar;

        let metricValue: number;

        switch (selectedMetric) {
          case 'resultado':
            metricValue = resultadoVar;
            break;
          case 'tirMensal':
            metricValue = calculateLivestockIRR(
              inputs.pesoCompra,
              valorCompraVar,
              custoMensalAjustado,
              valorBoiVar,
              results.mesesPermanencia,
            );
            break;
          case 'tirAnual': {
            const tirMensal = calculateLivestockIRR(
              inputs.pesoCompra,
              valorCompraVar,
              custoMensalAjustado,
              valorBoiVar,
              results.mesesPermanencia,
            );
            metricValue = convertMonthlyToAnnualRate(tirMensal);
            break;
          }
          case 'margem':
            metricValue = valorBoiVar > 0 ? (resultadoVar / valorBoiVar) * 100 : 0;
            break;
          case 'resultadoPorHectareAno': {
            // Calcular peso médio e lotação (não varia com preço)
            const pesoMedio = (inputs.pesoCompra + inputs.pesoAbate) / 2;
            const lotacaoCabecas = pesoMedio > 0 ? (450 * inputs.lotacao) / pesoMedio : 0;
            const mesesPermanenciaArredondado = Math.round(results.mesesPermanencia * 100000) / 100000;
            metricValue =
              mesesPermanenciaArredondado > 0 ? (resultadoVar / mesesPermanenciaArredondado) * 12 * lotacaoCabecas : 0;
            break;
          }
          default:
            metricValue = resultadoVar;
        }

        allValues.push(metricValue);
        return metricValue;
      });

      return {
        variation: vCompra,
        valorCompra: valorCompraVar,
        label: vCompra === 0 ? 'Base' : `${vCompra > 0 ? '+' : ''}${(vCompra * 100).toFixed(0)}%`,
        cells,
      };
    });

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);

    return { rows, cols, min, max };
  }, [inputs, results, selectedMetric, country]);

  // Função para formatar o valor baseado na métrica selecionada
  const formatCellValue = (value: number): string => {
    switch (selectedMetric) {
      case 'resultado':
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      case 'tirMensal':
        return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
      case 'tirAnual':
        return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
      case 'margem':
        return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
      case 'resultadoPorHectareAno':
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      default:
        return value.toLocaleString('pt-BR');
    }
  };

  // Função para determinar a cor baseada na intensidade do valor (tons leves)
  const getCellColor = (value: number, min: number, max: number, isBase: boolean): string => {
    if (isBase) {
      return 'ring-2 ring-blue-500 ring-inset bg-blue-50';
    }

    if (value >= 0) {
      // Gradiente verde leve para valores positivos
      const range = max;
      if (range === 0) return 'bg-emerald-50 text-emerald-700';
      const ratio = value / range;
      if (ratio >= 0.8) return 'bg-emerald-200 text-emerald-800';
      if (ratio >= 0.6) return 'bg-emerald-100 text-emerald-700';
      if (ratio >= 0.4) return 'bg-emerald-50 text-emerald-700';
      if (ratio >= 0.2) return 'bg-emerald-50/80 text-emerald-600';
      return 'bg-emerald-50/50 text-emerald-600';
    } else {
      // Gradiente vermelho leve para valores negativos
      const range = Math.abs(min);
      if (range === 0) return 'bg-rose-50 text-rose-600';
      const ratio = Math.abs(value) / range;
      if (ratio >= 0.8) return 'bg-rose-200 text-rose-800';
      if (ratio >= 0.6) return 'bg-rose-100 text-rose-700';
      if (ratio >= 0.4) return 'bg-rose-50 text-rose-700';
      if (ratio >= 0.2) return 'bg-rose-50/80 text-rose-600';
      return 'bg-rose-50/50 text-rose-600';
    }
  };

  const sensitivityData = useMemo(() => {
    if (!results) return [];
    // Para Paraguai: custo mensal deve ser multiplicado por 1000 para o cálculo de resultados
    const custoMensalAjustado = country === 'PY' ? inputs.custoMensal * 1000 : inputs.custoMensal;
    const variations = [-0.2, -0.1, 0, 0.1, 0.2];
    return variations.map(v => {
      const gmdSim = inputs.gmd + v;
      if (gmdSim <= 0) return { gmd: 'N/A', lucro: 0 };
      const wGain = inputs.pesoAbate - inputs.pesoCompra;
      const days = wGain / gmdSim;
      const months = days / 30.41667;
      const opCost = months * custoMensalAjustado;
      const totalC = results.custoCompra + opCost;
      const profit = results.valorBoi - totalC;
      return { name: gmdSim.toFixed(2), lucro: Math.round(profit) };
    });
  }, [inputs, results, country]);

  const handleSave = async (name: string) => {
    if (!user || !results) return;

    setIsSaving(true);
    try {
      await saveScenario(user.id, name, inputs, results, {
        organizationId: selectedClient?.id || null,
        farmId: selectedFarm?.id || null,
        farmName: selectedFarm?.name || null,
      });
      setIsSaveModalOpen(false);
      if (onToast) {
        onToast({
          id: Date.now().toString(),
          message: 'Cenário salvo com sucesso!',
          type: 'success',
        });
      }
      // Navigate to saved scenarios page after successful save
      if (onNavigateToSaved) {
        onNavigateToSaved();
      }
    } catch (error: any) {
      if (onToast) {
        onToast({
          id: Date.now().toString(),
          message: error.message || 'Erro ao salvar cenário',
          type: 'error',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!results) return;

    try {
      generateReportPDF({
        inputs,
        results,
        scenarioName: 'Cenário Simulado', // Nome genérico para download direto
        userName: user?.name,
        createdAt: new Date().toISOString(),
      });

      if (onToast) {
        onToast({
          id: Date.now().toString(),
          message: 'Relatório baixado com sucesso!',
          type: 'success',
        });
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      if (onToast) {
        onToast({
          id: Date.now().toString(),
          message: 'Erro ao gerar relatório PDF',
          type: 'error',
        });
      }
    }
  };

  if (!results) return <div className="p-4 md:p-10 text-center">Calculando...</div>;

  // Indicador barra 7: Desembolso / (GMD × 10) / valor de venda da @ (em %). Badge pill com número em destaque.
  const desembolsoBarra7 = (() => {
    const denom = inputs.gmd * 10 * inputs.valorVenda;
    if (denom <= 0) return { number: null as string | null, unit: null as string | null, title: '' };
    const valor = (inputs.custoMensal / denom) * 100;
    return {
      number: valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      unit: '%',
      title: 'da @ para cada 100g de ganho. Ideal até 7%',
    };
  })();

  return (
    <>
      <div className="h-full flex flex-col md:flex-row gap-1.5 md:gap-3 overflow-hidden">
        {/* Left Column: Inputs - Full width on mobile, fixed width on desktop */}
        <div className="w-full md:w-[300px] flex flex-col shrink-0 md:h-full md:overflow-hidden overflow-x-visible overflow-y-auto scrollbar-hide">
          <div className="mb-1 md:mb-1.5 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-ai-subtext" />
              <h2 className="text-sm font-semibold text-ai-text">Premissas</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleDownload}
                className="p-1.5 text-ai-subtext hover:text-ai-accent hover:bg-ai-surface rounded transition-colors"
                title="Baixar relatório PDF"
              >
                <Download size={16} />
              </button>
              {user && (
                <button
                  onClick={() => setIsSaveModalOpen(true)}
                  className="p-1.5 text-ai-subtext hover:text-ai-accent hover:bg-ai-surface rounded transition-colors"
                  title="Salvar cenário"
                >
                  <Save size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-1 overflow-y-auto overflow-x-visible md:overflow-visible md:pr-1 pb-1 gap-0.5 scrollbar-hide">
            <Slider
              index={1}
              label="Peso de Compra"
              value={inputs.pesoCompra}
              min={150}
              max={420}
              step={1}
              unit="kg"
              onChange={v => handleInputChange('pesoCompra', v)}
              highlightBorder={isInterdependentChanged}
              description="O que é: É o peso de entrada do animal no sistema (Bezerro(a), garrote, novilha, boi magro). Refere-se ao peso vivo do animal no momento da aquisição ou início do ciclo produtivo."
            />
            <Slider
              index={2}
              label="Valor de Compra"
              value={inputs.valorCompra}
              min={country === 'PY' ? 15000 : 9}
              max={country === 'PY' ? 30000 : 18}
              step={country === 'PY' ? 100 : 0.05}
              unit={`${currencySymbol}/kg`}
              onChange={v => handleInputChange('valorCompra', v)}
              highlightBorder={isInterdependentChanged}
              description="O que é: O custo de aquisição por quilograma de peso vivo. Define o investimento inicial necessário para comprar o gado já incluindo frete e comissão."
            />
            <Slider
              index={3}
              label="Peso Venda"
              value={inputs.pesoAbate}
              min={Math.max(300, inputs.pesoCompra + 10)}
              max={630}
              step={1}
              unit="kg"
              onChange={v => handleInputChange('pesoAbate', v)}
              description="O que é: A meta de peso final do animal vivo no momento da saída da fazenda para o frigorífico."
            />
            <Slider
              index={4}
              label={country === 'PY' ? 'REND. CARCAZA' : 'Rend. Carcaça'}
              value={inputs.rendimentoCarcaca}
              min={46}
              max={58}
              step={0.5}
              unit="%"
              onChange={v => handleInputChange('rendimentoCarcaca', v)}
              description="O que é: O Rendimento de Carcaça é a eficiência industrial. Representa a porcentagem do peso vivo que efetivamente se converte em carne (carcaça) após o abate e limpeza do animal."
            />
            <Slider
              index={5}
              label={country === 'PY' ? 'VALOR DE VENTA (kg carcaza)' : 'Valor Venda'}
              value={inputs.valorVenda}
              min={country === 'PY' ? 20000 : 250}
              max={country === 'PY' ? 40000 : 380}
              step={country === 'PY' ? 100 : 1}
              unit={country === 'PY' ? `${currencySymbol}/kg` : `${currencySymbol}/@`}
              onChange={v => handleInputChange('valorVenda', v)}
              description="O que é: O preço de venda por Arroba (@ = 15kg de carcaça)."
            />
            <Slider
              index={6}
              label={country === 'PY' ? 'GPD (ganancia diaria)' : 'GMD (Ganho Médio Diário)'}
              value={inputs.gmd}
              min={0.38}
              max={1.1}
              step={0.01}
              unit="kg/dia"
              onChange={v => handleInputChange('gmd', v)}
              highlightBorder={isInterdependentChanged}
              description="O que é: Ganho Médio Diário. É a velocidade de ganho de peso. Indica quantos quilos o animal engorda por dia na média de todo o período."
              labelBadgeNumber={diasParaMesesBadge(
                inputs.gmd > 0 ? (inputs.pesoAbate - inputs.pesoCompra) / inputs.gmd : 0
              ).number}
              labelBadgeUnit={diasParaMesesBadge(
                inputs.gmd > 0 ? (inputs.pesoAbate - inputs.pesoCompra) / inputs.gmd : 0
              ).unit}
              labelBadgePill
              labelBadgeTitle={diasParaMesesDias(
                inputs.gmd > 0 ? (inputs.pesoAbate - inputs.pesoCompra) / inputs.gmd : 0
              )}
            />
            <Slider
              index={7}
              label={country === 'PY' ? 'COSTO/CAB/MES' : 'Desembolso/Cab/Mês'}
              value={inputs.custoMensal}
              min={50}
              max={220}
              step={1}
              unit={`${currencySymbol}/mês`}
              onChange={v => handleInputChange('custoMensal', v)}
              highlightBorder={isGmdChanged}
              highlightColor="#DAA520"
              labelBadgeNumber={desembolsoBarra7.number ?? undefined}
              labelBadgeUnit={desembolsoBarra7.unit ?? undefined}
              labelBadgePill
              labelBadgeTitle={desembolsoBarra7.title}
              description="O que é: É o desembolso total (custeios + investimentos) por cabeça/mês. Inclui nutrição (pasto/suplemento/ração), sanidade, mão de obra e custos fixos rateados. Apenas valor de aquisição do animal e pagamento de financiamentos não entram na conta. É utilizado o desembolso para que o foco seja na capacidade de geração de caixa e não no lucro contábil."
            />
            <Slider
              index={8}
              label={country === 'PY' ? 'Carga' : 'LOTAÇÃO'}
              value={inputs.lotacao}
              min={0.7}
              max={4.5}
              step={0.1}
              unit="UA/HA"
              onChange={v => handleInputChange('lotacao', v)}
              description="Lotação em UA/ha é a relação entre o número de Unidades Animais (UA) presentes por hectare (ha) de área útil na fazenda. Cada UA representa 450 kg de peso vivo. Apesar de existirem fazendas com mais de 4,5 UA/ha de lotação, nossa aplicação manterá a faixa mais presentes nas fazendas monitoradas pela Inttegra."
            />
          </div>
        </div>

        {/* Right Column: Dashboard Grid - Main Results Container */}
        <div className="flex-1 flex flex-col md:h-full md:overflow-hidden overflow-visible min-h-0">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 shrink-0 mb-2 md:mb-3">
            <ResultCard
              label={country === 'PY' ? '1. RESULT. POR CABEZA' : '1. Resultado por cab.'}
              value={`${currencySymbol} ${results.resultadoPorBoi.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              description="Lucro ou prejuízo líquido por animal. É a diferença entre o valor de venda e todos os custos (compra + operacional)."
            />
            <ResultCard
              label={country === 'PY' ? '2. TIR MENSUAL' : '2. TIR Mensal'}
              value={`${results.resultadoMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.m.`}
              description="Taxa Interna de Retorno mensal. Indica o rendimento percentual do capital investido por mês de operação."
            />
            <ResultCard
              label={country === 'PY' ? '3. RESULT. / AÑO' : '3. Result./Ano'}
              value={`${results.resultadoAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.`}
              description="TIR anualizada usando juros compostos: (1 + TIR_mensal)^12 - 1. Representa o retorno efetivo anual equivalente."
            />
            <ResultCard
              label={country === 'PY' ? '4. MARGEN %' : '4. Margem %'}
              value={`${results.margemVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
              color={results.margemVenda >= 0 ? 'positive' : 'negative'}
              description="Margem sobre o preço de venda. Indica quanto do valor de venda representa lucro após deduzir todos os custos."
            />
            <ResultCard
              label={country === 'PY' ? '5. VALOR DE VENTA' : '5. Valor de Venda'}
              value={`${currencySymbol} ${Math.round(results.valorBoi).toLocaleString('pt-BR')}`}
              description={
                country === 'PY'
                  ? 'Receita bruta por animal. É o peso final em kg de carcaza multiplicado pelo preço de venda por kg de carcaza.'
                  : 'Receita bruta por animal. É o peso final em arrobas multiplicado pelo preço de venda por arroba.'
              }
            />
            <ResultCard
              label={country === 'PY' ? '6. DESEMBOLSO TOTAL' : '6. Desemb. Total'}
              value={`${currencySymbol} ${Math.round(results.custoTotal).toLocaleString('pt-BR')}`}
              description="Desembolso total por animal. Soma do custo de aquisição mais todos os custos operacionais do período."
            />
            <ResultCard
              label={country === 'PY' ? '7. G$/KG DE CANAL PRODUCIDA' : '7. G$/kg carc producida'}
              value={`${currencySymbol} ${(results.custoPorArrobaProduzida / 15).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              description="Custo operacional dividido pelos kg de carcaça produzidos. Indica a eficiência na produção de carne (convertido de arrobas para kg: 1 arroba = 15kg)."
            />
            <ResultCard
              label={country === 'PY' ? '8. G$/KG DE CANAL FINAL' : '8. G$/kg de carc final'}
              value={`${currencySymbol} ${results.custoPorArrobaFinal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              description={
                country === 'PY'
                  ? 'Desembolso total dividido pelo peso final em kg de carcaza. É o custo médio por kg de carcaza do animal pronto.'
                  : 'Desembolso total dividido pelo peso final em arrobas. É o custo médio por arroba do animal pronto.'
              }
            />
            <ResultCard
              label={country === 'PY' ? '9. PESO FINAL' : '9. Peso Final'}
              subLabel={country === 'PY' ? 'KG CANAL' : 'arrobas'}
              value={
                country === 'PY'
                  ? `${(results.pesoFinalKgCarcaca || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${results.pesoFinalArrobas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @`
              }
              description={
                country === 'PY'
                  ? 'Peso do animal ao abate em kg de carcaza, considerando o rendimento de carcaza.'
                  : 'Peso do animal ao abate convertido em arrobas, considerando o rendimento de carcaça.'
              }
            />
            <ResultCard
              label={country === 'PY' ? '10. DESEMBOLSO OPERATIVO' : '10. Desembolso Operativo'}
              value={`${currencySymbol} ${Math.round(inputs.custoMensal * results.mesesPermanencia * 1000).toLocaleString('pt-BR')}`}
              description="Costo/cab/mês vezes tempo de permanencia"
            />
            <ResultCard
              label={country === 'PY' ? '11. PERMANENCIA' : '11. Permanência'}
              subLabel={country === 'PY' ? 'DÍAS' : 'dias'}
              value={`${results.diasPermanencia.toFixed(0)} dias`}
              description="Tempo necessário para o animal ganhar o peso desejado, calculado com base no GMD."
            />
            <ResultCard
              label={country === 'PY' ? '12. PERMANENCIA' : '12. Permanência'}
              subLabel={country === 'PY' ? 'MESES' : 'meses'}
              value={`${results.mesesPermanencia.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`}
              description="Tempo de permanência convertido em meses para facilitar o planejamento do ciclo produtivo."
            />
            <ResultCard
              label={country === 'PY' ? '13. ROTACIÓN DE STOCK' : '13. Giro de Estoque'}
              value={`${results.giroEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
              description="Indica quantas vezes o estoque de animais gira por ano. Calculado como 12 meses dividido pelo tempo de permanência em meses."
            />
            <ResultCard
              label={country === 'PY' ? '14. KG DE CANAL / HA / AÑO' : '14. Prod. @/ha/ano'}
              value={`${(country === 'PY' ? results.producaoArrobaPorHa * 15 : results.producaoArrobaPorHa).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              description={country === 'PY' ? 'kg de carc/ha/ano' : 'Produção em arrobas por hectare por ano'}
            />
            <ResultCard
              label={country === 'PY' ? '15. RESULT. / KG DE CANAL' : '15. Resultado por @ Final'}
              value={`${currencySymbol} ${results.resultadoPorArrobaFinal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${country === 'PY' ? '/kg' : ''}`}
              description={
                country === 'PY'
                  ? 'Lucro ou prejuízo por kg de carcaza final. Diferença entre o valor de venda por kg de carcaza e o desembolso por kg de carcaza final.'
                  : 'Lucro ou prejuízo por arroba final. Diferença entre o valor de venda por arroba e o desembolso por arroba final.'
              }
            />
            <ResultCard
              label={country === 'PY' ? '16. RESULT. POR HECTÁREA' : '16. Result./ha/ano'}
              value={`${currencySymbol} ${results.resultadoPorHectareAno.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              description="Resultado financeiro por hectare por ano. Calculado como: (Resultado por cabeça / Tempo de Permanência em Meses) × 12 × Lotação em Cabeças."
            />
          </div>

          {/* Charts Section - Expands to fill remaining space */}
          <div className="flex-1 min-h-0">
            {/* Sensitivity Matrix - Full Width */}
            <div className="bg-white rounded-lg border border-ai-border/60 p-2 flex flex-col relative overflow-hidden h-full">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Grid3X3 size={14} className="text-ai-subtext" />
                  <span className="text-xs font-bold uppercase text-ai-subtext">Matriz de Sensibilidade</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedMetric}
                    onChange={e =>
                      setSelectedMetric(
                        e.target.value as 'resultado' | 'tirMensal' | 'tirAnual' | 'margem' | 'resultadoPorHectareAno',
                      )
                    }
                    className="text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="resultado">Resultado/cab ({currencySymbol})</option>
                    <option value="tirMensal">TIR Mensal (%)</option>
                    <option value="tirAnual">Resultado/Ano (%)</option>
                    <option value="margem">Margem Final (%)</option>
                    <option value="resultadoPorHectareAno">Resultado por Hectare/Ano ({currencySymbol})</option>
                  </select>
                  <span className="text-[10px] text-rose-400">● Prejuízo</span>
                  <span className="text-[10px] text-emerald-500">● Lucro</span>
                </div>
              </div>

              {/* Tabela da Matriz */}
              <div className="flex-1 overflow-hidden">
                <table className="w-full border-collapse text-[10px] table-fixed">
                  <colgroup>
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="px-1 py-[0.297rem] text-left text-[10px] text-gray-500 font-medium border-b border-gray-200 bg-gray-50">
                        <div className="leading-tight">VL. VENDA →</div>
                        <div className="leading-tight text-gray-400">VL. COMPRA ↓</div>
                      </th>
                      {sensitivityMatrix.cols.map((col, i) => (
                        <th
                          key={i}
                          className={`px-1 py-[0.297rem] text-center border-b border-gray-200 ${col.variation === 0 ? 'bg-blue-50' : 'bg-gray-50'}`}
                        >
                          <div className="text-[9px] text-gray-400 leading-tight">{col.label}</div>
                          <div className={`font-bold ${col.variation === 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                            <span className="text-[10.35px]">{currencySymbol}</span>{' '}
                            <span className="text-[12.65px]">{col.value}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivityMatrix.rows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        <td
                          className={`px-1 py-[0.297rem] border-r border-gray-200 text-[10px] ${row.variation === 0 ? 'bg-blue-50' : 'bg-gray-50'}`}
                        >
                          <div className="text-[9px] text-gray-400 leading-tight">{row.label}</div>
                          <div className={`font-bold ${row.variation === 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                            <span className="text-[10px]">{currencySymbol}</span>{' '}
                            <span className="text-[11px]">{row.valorCompra.toFixed(1)}</span>
                            <span className="text-[10px]">/kg</span>
                          </div>
                        </td>
                        {row.cells.map((cell, colIdx) => {
                          const isBase = row.variation === 0 && sensitivityMatrix.cols[colIdx].variation === 0;
                          const colorClass = getCellColor(cell, sensitivityMatrix.min, sensitivityMatrix.max, isBase);
                          return (
                            <td
                              key={colIdx}
                              className={`px-1 py-[0.297rem] text-center font-bold text-[11px] ${colorClass}`}
                            >
                              {formatCellValue(cell)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {user && (
        <SaveScenarioModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={handleSave}
          inputs={inputs}
          isLoading={isSaving}
        />
      )}
    </>
  );
};

export default CattleProfitCalculator;
