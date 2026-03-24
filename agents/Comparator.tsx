import React, { useState, useEffect, useRef } from 'react';
import Slider from '../components/Slider';
import { CattleCalculatorInputs, CalculationResults } from '../types';
import { Edit2, Check, X, TrendingUp, Download, Save, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { useClient } from '../contexts/ClientContext';
import { useFarm } from '../contexts/FarmContext';
import { Toast } from '../components/Toast';
import { generateComparatorPDF, generateComparatorPDFAsBase64 } from '../lib/generateReportPDF';
import { saveComparatorReport } from '../lib/scenarios';
import { normalizeCattleCalculatorInputs } from '../lib/cattleInputs';

interface ComparatorProps {
  onToast?: (toast: Toast) => void;
  initialScenarios?: Scenario[];
}

interface Scenario {
  id: 'A' | 'B' | 'C';
  name: string;
  inputs: CattleCalculatorInputs;
  results: CalculationResults | null;
  color: string;
  colorLight: string;
  colorBorder: string;
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

function getDesembolsoBadge(inputs: CattleCalculatorInputs): {
  number: string | null;
  unit: string | null;
  title: string;
} {
  const denom = inputs.gmd * 10 * inputs.valorVenda;
  if (denom <= 0) return { number: null, unit: null, title: '' };
  const valor = (inputs.custoMensal / denom) * 100;
  return {
    number: valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    unit: '%',
    title: 'da @ para cada 100g de ganho. Ideal até 7%',
  };
}

function calculateResults(inputs: CattleCalculatorInputs, country?: string): CalculationResults {
  const ARROBA_KG = 15;
  const YIELD_PURCHASE = 50;

  const pesoCompraArrobas = (inputs.pesoCompra * (YIELD_PURCHASE / 100)) / ARROBA_KG;

  // Para Paraguai: peso vivo X rendimento de carcaça (resultado em kg carcaça)
  // Para Brasil: peso vivo X rendimento de carcaça / 15 (resultado em arrobas)
  const pesoFinalKgCarcaca = inputs.pesoAbate * (inputs.rendimentoCarcaca / 100);
  const pesoFinalArrobas = pesoFinalKgCarcaca / ARROBA_KG;
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

  const resultadoMensal = calculateLivestockIRR(
    inputs.pesoCompra,
    inputs.valorCompra,
    custoMensalAjustado,
    valorBoi,
    mesesPermanencia,
  );

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

  const giroEstoque = mesesPermanencia > 0 ? (12 / mesesPermanencia) * 100 : 0;

  const pesoMedio = (inputs.pesoCompra + inputs.pesoAbate) / 2;
  const lotacaoCabecas = pesoMedio > 0 ? (450 * inputs.lotacao) / pesoMedio : 0;
  const producaoArrobaPorHa = mesesPermanencia > 0 ? (arrobasProduzidas / mesesPermanencia) * 12 * lotacaoCabecas : 0;

  // Indicador 15: Resultado por @ final (ou por kg carcaça para PY)
  // Para Paraguai: valorVenda está em G$/kg, então resultadoPorArrobaFinal será em G$/kg
  // Para Brasil: valorVenda está em R$/@, então resultadoPorArrobaFinal será em R$/@
  const resultadoPorArrobaFinal = inputs.valorVenda - custoPorArrobaFinal;

  const mesesPermanenciaArredondado = Math.round(mesesPermanencia * 100000) / 100000;
  const resultadoPorHectareAno =
    mesesPermanenciaArredondado > 0 ? (resultadoPorBoi / mesesPermanenciaArredondado) * 12 * lotacaoCabecas : 0;

  return {
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
  };
}

const Comparator: React.FC<ComparatorProps> = ({ onToast, initialScenarios }) => {
  const { user } = useAuth();
  const { country, currencySymbol } = useLocation();
  const { selectedClient } = useClient();
  const { selectedFarm } = useFarm();

  const defaultInputs: CattleCalculatorInputs = {
    pesoCompra: 200,
    valorCompra: 14.5,
    pesoAbate: 530,
    rendimentoCarcaca: 54.5,
    valorVenda: 300,
    gmd: 0.65,
    custoMensal: 135,
    lotacao: 1.5,
  };

  const scenarioCTemplate: Scenario = {
    id: 'C',
    name: 'Cenário C (Comparação 2)',
    inputs: { ...defaultInputs, pesoAbate: 580, valorVenda: 320, gmd: 1.0, custoMensal: 200 },
    results: null,
    color: 'orange',
    colorLight: 'bg-orange-50',
    colorBorder: 'border-orange-500',
  };

  const defaultScenarios: Scenario[] = [
    {
      id: 'A',
      name: 'Cenário A (Base)',
      inputs: { ...defaultInputs },
      results: null,
      color: 'blue',
      colorLight: 'bg-blue-50',
      colorBorder: 'border-blue-500',
    },
    {
      id: 'B',
      name: 'Cenário B (Comparação 1)',
      inputs: { ...defaultInputs, valorVenda: 310, gmd: 0.8, custoMensal: 150 },
      results: null,
      color: 'green',
      colorLight: 'bg-green-50',
      colorBorder: 'border-green-500',
    },
  ];

  // Validar initialScenarios antes de usar (aceita 2 ou 3 cenários)
  const getValidatedScenarios = (): Scenario[] => {
    if (
      !initialScenarios ||
      !Array.isArray(initialScenarios) ||
      initialScenarios.length < 2 ||
      initialScenarios.length > 3
    ) {
      return defaultScenarios;
    }

    const validIds = initialScenarios.length === 2 ? ['A', 'B'] : ['A', 'B', 'C'];
    const hasValidIds = initialScenarios.every(s => s?.id && validIds.includes(s.id));
    if (!hasValidIds) {
      console.warn('Invalid scenario IDs, using defaults');
      return defaultScenarios;
    }

    // Validar inputs básicos
    try {
      return initialScenarios.map(s => ({
        ...s,
        inputs: normalizeCattleCalculatorInputs({ ...defaultInputs, ...(s.inputs || {}) }),
        results: s.results || null,
      }));
    } catch (error) {
      console.error('Error validating scenarios:', error);
      return defaultScenarios;
    }
  };

  const [scenarios, setScenarios] = useState<Scenario[]>(getValidatedScenarios());

  const [editingName, setEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const prevInputsKeyRef = useRef<string>('');

  // Ajustar valores quando o país mudar para garantir que estejam dentro dos ranges
  useEffect(() => {
    setScenarios(prev =>
      prev.map(scenario => {
        const updated = { ...scenario.inputs };

        // Ajustar valor de compra para ficar dentro do range
        if (country === 'PY') {
          if (updated.valorCompra < 15000) {
            updated.valorCompra = 15000;
          } else if (updated.valorCompra > 30000) {
            updated.valorCompra = 30000;
          }
          // Ajustar valor de venda
          if (updated.valorVenda < 20000) {
            updated.valorVenda = 20000;
          } else if (updated.valorVenda > 40000) {
            updated.valorVenda = 40000;
          }
        } else {
          if (updated.valorCompra < 9) {
            updated.valorCompra = 9;
          } else if (updated.valorCompra > 18) {
            updated.valorCompra = 18;
          }
          // Ajustar valor de venda
          if (updated.valorVenda < 250) {
            updated.valorVenda = 250;
          } else if (updated.valorVenda > 380) {
            updated.valorVenda = 380;
          }
        }

        return {
          ...scenario,
          inputs: updated,
        };
      }),
    );
  }, [country]);

  // Calculate results for all scenarios
  useEffect(() => {
    const currentInputsKey = `${scenarios.map(s => JSON.stringify(s.inputs)).join('|')}|${country}`;

    // Only update if inputs or country actually changed
    if (prevInputsKeyRef.current !== currentInputsKey) {
      prevInputsKeyRef.current = currentInputsKey;
      setScenarios(prev => {
        const uniqueScenarios = prev.filter((s, index, self) => index === self.findIndex(sc => sc.id === s.id));
        if (uniqueScenarios.length < 2 || uniqueScenarios.length > 3) {
          return prev;
        }
        return prev.map(scenario => ({
          ...scenario,
          results: calculateResults(scenario.inputs, country),
        }));
      });
    }
  }, [scenarios, country]);

  const handleAddScenarioC = () => {
    if (scenarios.some(s => s.id === 'C')) return;
    setScenarios(prev => [...prev, { ...scenarioCTemplate, name: '', inputs: { ...scenarioCTemplate.inputs } }]);
    setEditingName('C');
    setTempName('');
  };

  const handleRemoveScenarioC = () => {
    setScenarios(prev => prev.filter(s => s.id !== 'C'));
  };

  const handleInputChange = (scenarioId: 'A' | 'B' | 'C', key: keyof CattleCalculatorInputs, value: number) => {
    setScenarios(prev => prev.map(s => (s.id === scenarioId ? { ...s, inputs: { ...s.inputs, [key]: value } } : s)));
  };

  const handleNameEdit = (scenarioId: 'A' | 'B' | 'C') => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (scenario) {
      setTempName(scenario.name);
      setEditingName(scenarioId);
    }
  };

  const handleNameSave = (scenarioId: 'A' | 'B' | 'C') => {
    setScenarios(prev =>
      prev.map(s => {
        if (s.id !== scenarioId) return s;
        const finalName = tempName.trim() || (scenarioId === 'C' ? 'Cenário C' : s.name);
        return { ...s, name: finalName };
      })
    );
    setEditingName(null);
    setTempName('');
  };

  const handleNameCancel = () => {
    if (editingName === 'C') {
      const scenarioC = scenarios.find(s => s.id === 'C');
      if (scenarioC && !scenarioC.name.trim()) {
        setScenarios(prev => prev.map(s => (s.id === 'C' ? { ...s, name: 'Cenário C' } : s)));
      }
    }
    setEditingName(null);
    setTempName('');
  };

  // Apenas gera e baixa o PDF — NÃO persiste no banco (evita salvamento indevido de cenário)
  const handleDownloadClick = () => {
    try {
      if (scenarios.length < 2 || scenarios.length > 3) {
        onToast?.({
          id: Date.now().toString(),
          message: 'É necessário ter 2 ou 3 cenários para gerar o relatório',
          type: 'error',
        });
        return;
      }

      const scenariosWithResults = scenarios.filter(s => s.results);
      if (scenariosWithResults.length !== scenarios.length) {
        onToast?.({
          id: Date.now().toString(),
          message: 'Todos os cenários devem ter resultados calculados',
          type: 'error',
        });
        return;
      }

      generateComparatorPDF({
        scenarios: scenarios.map(s => ({
          id: s.id,
          name: s.name,
          inputs: s.inputs,
          results: s.results!,
        })),
        userName: user?.name || user?.email || undefined,
        createdAt: new Date().toISOString(),
      });

      onToast?.({
        id: Date.now().toString(),
        message: 'PDF baixado com sucesso!',
        type: 'success',
      });
    } catch (error: any) {
      onToast?.({
        id: Date.now().toString(),
        message: error.message || 'Erro ao gerar PDF',
        type: 'error',
      });
    }
  };

  const handleSaveClick = () => {
    if (!user) {
      onToast?.({ id: Date.now().toString(), message: 'Você precisa estar logado para salvar', type: 'error' });
      return;
    }
    setIsSaveModalOpen(true);
  };

  const handleSave = async () => {
    if (!user || !saveName.trim()) {
      onToast?.({ id: Date.now().toString(), message: 'Informe um nome para o comparativo', type: 'error' });
      return;
    }

    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const uniqueScenarios = scenarios.filter((s, index, self) => index === self.findIndex(sc => sc.id === s.id));

      if (uniqueScenarios.length < 2 || uniqueScenarios.length > 3) {
        throw new Error('É necessário ter 2 ou 3 cenários para salvar o comparativo');
      }

      const allHaveResults = uniqueScenarios.every(s => s.results);
      if (!allHaveResults) {
        throw new Error('Todos os cenários devem ter resultados calculados');
      }

      const scenariosPayload = uniqueScenarios.map(s => ({
        id: s.id,
        name: s.name,
        inputs: s.inputs,
        results: s.results!,
      }));

      const pdfBase64 = generateComparatorPDFAsBase64({
        scenarios: scenariosPayload,
        userName: user?.name || user?.email || undefined,
        createdAt: new Date().toISOString(),
      });

      const comparatorData = {
        type: 'comparator_pdf' as const,
        pdf_base64: pdfBase64,
        scenarios: scenariosPayload,
      };

      // Salvar o comparativo completo (PDF + dados dos cenários) - um único registro, sem cenário adicional
      await saveComparatorReport(user.id, saveName.trim(), comparatorData, {
        organizationId: selectedClient?.id || null,
        farmId: selectedFarm?.id || null,
        farmName: selectedFarm?.name || null,
      });

      setIsSaveModalOpen(false);
      setSaveName('');
      onToast?.({
        id: Date.now().toString(),
        message: 'Comparativo salvo com sucesso!',
        type: 'success',
      });
    } catch (error: any) {
      onToast?.({
        id: Date.now().toString(),
        message: error.message || 'Erro ao salvar comparativo',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const scenarioA = scenarios.find(s => s.id === 'A');
  const scenarioB = scenarios.find(s => s.id === 'B');
  const scenarioC = scenarios.find(s => s.id === 'C');

  useEffect(() => {
    if (isSaveModalOpen) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      setSaveName(`Comparativo ${dateStr}`);
    }
  }, [isSaveModalOpen]);

  const getColorClasses = (scenarioId: 'A' | 'B' | 'C') => {
    switch (scenarioId) {
      case 'A':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-500',
          text: 'text-blue-700',
          accent: 'bg-blue-500',
        };
      case 'B':
        return {
          bg: 'bg-green-50',
          border: 'border-green-500',
          text: 'text-green-700',
          accent: 'bg-green-500',
        };
      case 'C':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-500',
          text: 'text-orange-700',
          accent: 'bg-orange-500',
        };
    }
  };

  const is2Scenarios = scenarios.length === 2;

  return (
    <div
      className={`h-full w-full max-w-full flex flex-col gap-0.5 overflow-hidden px-4 py-1.5 comparator-container ${is2Scenarios ? 'comparator-2-scenarios' : ''}`}
    >
      {/* Header: Adicionar cenário C (quando 2 cenários) + Download + Salvar */}
      <div className="flex items-center justify-end gap-2 shrink-0 mb-0.25">
        {scenarios.length === 2 && (
          <button
            onClick={handleAddScenarioC}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-ai-accent border border-ai-accent rounded hover:bg-ai-accent/10 transition-colors"
          >
            <Plus size={10} />
            Adicionar cenário C
          </button>
        )}
        <button
          onClick={handleDownloadClick}
          className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
          title="Baixar PDF no computador"
        >
          <Download size={12} />
          Download
        </button>
        {user && (
          <button
            onClick={handleSaveClick}
            disabled={isSaving}
            className="px-2 py-1 text-xs bg-ai-accent text-white rounded hover:bg-ai-accent/90 transition-colors flex items-center gap-1 disabled:opacity-50"
            title="Salvar comparativo em Meus Salvos"
          >
            <Save size={12} />
            Salvar
          </button>
        )}
      </div>

      {/* Scenarios Section - prioridade para premissas aparecerem completas */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-hide">
        <div
          className={`grid grid-cols-1 gap-2 md:gap-3 flex-1 min-h-0 overflow-visible w-full ${
            scenarios.length === 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'
          }`}
        >
          {scenarios.map(scenario => {
            const colors = getColorClasses(scenario.id);
            return (
              <div key={scenario.id} className="flex flex-col h-full">
                {/* Scenario Header - FORA do card */}
                <div className="flex items-center justify-between shrink-0 mb-0.5">
                  {editingName === scenario.id ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        value={tempName}
                        onChange={e => setTempName(e.target.value)}
                        className="flex-1 px-1.5 py-0.5 text-xs border border-ai-border rounded focus:outline-none focus:border-ai-accent"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleNameSave(scenario.id);
                          if (e.key === 'Escape') handleNameCancel();
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => handleNameSave(scenario.id)}
                        className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check size={14} />
                      </button>
                      <button onClick={handleNameCancel} className="p-0.5 text-red-600 hover:bg-red-50 rounded">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className={`text-[15px] font-semibold ${colors.text} truncate`}>{scenario.name}</h3>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {scenario.id === 'C' && (
                          <button
                            onClick={handleRemoveScenarioC}
                            className="p-0.5 text-red-600 hover:bg-red-50 rounded"
                            title="Remover cenário C"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => handleNameEdit(scenario.id)}
                          className="p-0.5 text-ai-subtext hover:text-ai-text hover:bg-ai-surface rounded"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Card apenas com sliders */}
                <div
                  className="bg-white rounded-lg border border-gray-200 p-1.5 md:p-0.5 flex flex-col flex-1 min-h-0 overflow-visible relative w-full"
                  style={{ overflowX: 'visible', overflowY: 'visible' }}
                >
                  {/* Colored vertical bar on the left */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.accent} rounded-l-lg`}></div>
                  <div
                    className="pl-2 md:pl-1 flex flex-col flex-1 min-h-0 overflow-visible w-full"
                    style={{ overflowX: 'visible' }}
                  >
                    {/* Inputs */}
                    <div className="flex flex-col gap-0.2 md:gap-0.2 flex-1 min-h-0 overflow-visible w-full">
                      <Slider
                        index={1}
                        label="Peso de Compra"
                        value={scenario.inputs.pesoCompra}
                        min={150}
                        max={420}
                        step={1}
                        unit="kg"
                        onChange={v => handleInputChange(scenario.id, 'pesoCompra', v)}
                        description="Peso de entrada do animal no sistema"
                      />
                      <Slider
                        index={2}
                        label="Valor de Compra"
                        value={scenario.inputs.valorCompra}
                        min={country === 'PY' ? 15000 : 9}
                        max={country === 'PY' ? 30000 : 18}
                        step={country === 'PY' ? 100 : 0.05}
                        unit={`${currencySymbol}/kg`}
                        onChange={v => handleInputChange(scenario.id, 'valorCompra', v)}
                        description="Custo de aquisição por quilograma"
                      />
                      <Slider
                        index={3}
                        label="Peso Venda"
                        value={scenario.inputs.pesoAbate}
                        min={Math.max(300, scenario.inputs.pesoCompra + 10)}
                        max={630}
                        step={1}
                        unit="kg"
                        onChange={v => handleInputChange(scenario.id, 'pesoAbate', v)}
                        description="Meta de peso final do animal"
                      />
                      <Slider
                        index={4}
                        label={country === 'PY' ? 'REND. CARCAZA' : 'Rend. Carcaça'}
                        value={scenario.inputs.rendimentoCarcaca}
                        min={46}
                        max={58}
                        step={0.5}
                        unit="%"
                        onChange={v => handleInputChange(scenario.id, 'rendimentoCarcaca', v)}
                        description="Rendimento de carcaça"
                      />
                      <Slider
                        index={5}
                        label={country === 'PY' ? 'VALOR DE VENTA (kg carcaza)' : 'Valor Venda'}
                        value={scenario.inputs.valorVenda}
                        min={country === 'PY' ? 20000 : 250}
                        max={country === 'PY' ? 40000 : 380}
                        step={country === 'PY' ? 100 : 1}
                        unit={country === 'PY' ? `${currencySymbol}/kg` : `${currencySymbol}/@`}
                        onChange={v => handleInputChange(scenario.id, 'valorVenda', v)}
                        description="Preço de venda por arroba"
                      />
                      <Slider
                        index={6}
                        label={country === 'PY' ? 'GPD (ganancia diaria)' : 'GMD (Ganho Médio Diário)'}
                        value={scenario.inputs.gmd}
                        min={0.38}
                        max={1.1}
                        step={0.01}
                        unit="kg/dia"
                        onChange={v => handleInputChange(scenario.id, 'gmd', v)}
                        description="Ganho médio diário"
                        labelBadgeNumber={diasParaMesesBadge(
                          scenario.inputs.gmd > 0
                            ? (scenario.inputs.pesoAbate - scenario.inputs.pesoCompra) / scenario.inputs.gmd
                            : 0
                        ).number}
                        labelBadgeUnit={diasParaMesesBadge(
                          scenario.inputs.gmd > 0
                            ? (scenario.inputs.pesoAbate - scenario.inputs.pesoCompra) / scenario.inputs.gmd
                            : 0
                        ).unit}
                        labelBadgePill
                        labelBadgeTitle={diasParaMesesDias(
                          scenario.inputs.gmd > 0
                            ? (scenario.inputs.pesoAbate - scenario.inputs.pesoCompra) / scenario.inputs.gmd
                            : 0
                        )}
                      />
                      <Slider
                        index={7}
                        label={country === 'PY' ? 'COSTO/CAB/MES' : 'Desembolso/Cab/Mês'}
                        value={scenario.inputs.custoMensal}
                        min={50}
                        max={220}
                        step={1}
                        unit={`${currencySymbol}/mês`}
                        onChange={v => handleInputChange(scenario.id, 'custoMensal', v)}
                        description="Desembolso por cabeça ao mês"
                        labelBadgeNumber={getDesembolsoBadge(scenario.inputs).number ?? undefined}
                        labelBadgeUnit={getDesembolsoBadge(scenario.inputs).unit ?? undefined}
                        labelBadgePill
                        labelBadgeTitle={getDesembolsoBadge(scenario.inputs).title}
                      />
                      <Slider
                        index={8}
                        label={country === 'PY' ? 'Carga' : 'LOTAÇÃO'}
                        value={scenario.inputs.lotacao}
                        min={0.7}
                        max={4.5}
                        step={0.1}
                        unit="UA/HA"
                        onChange={v => handleInputChange(scenario.id, 'lotacao', v)}
                        description="Lotação em Unidade Animal por Hectare"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Results Section - compacta para dar espaço às premissas */}
      {scenarioA?.results && scenarioB?.results && (!scenarioC || scenarioC?.results) && (
        <div className="shrink-0 w-full pt-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-ai-accent shrink-0" />
            <h2 className="text-[10px] font-semibold text-ai-text">Resultados Projetados</h2>
          </div>

          <div
            className={`grid gap-2 w-full ${
              scenarios.length === 2 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'
            }`}
          >
            {/* Resultado por Boi */}
            <div className="bg-white rounded-lg border border-gray-200 p-2 shadow-sm">
              <h3 className="text-[10px] font-bold text-gray-600 uppercase mb-1.5">
                {country === 'PY' ? '1. Resultado por cabeça' : '1. Resultado por cabeça'}
              </h3>
              <div className="space-y-1">
                {scenarios.map(s => {
                  const colors = getColorClasses(s.id);
                  const delta =
                    s.id !== 'A' && scenarioA?.results
                      ? s.results!.resultadoPorBoi - scenarioA.results.resultadoPorBoi
                      : null;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] font-medium ${colors.text} truncate`}>
                        {s.name.split(' ')[0]} {s.name.split(' ')[1]}:
                      </span>
                      <div className="flex items-center gap-1">
                        {delta != null && (
                          <span className="text-[10px] text-green-600 font-medium">↑ +{delta.toFixed(0)}</span>
                        )}
                        <span className="text-xs font-bold text-ai-text shrink-0">
                          {s.results!.resultadoPorBoi.toLocaleString('pt-BR', {
                            minimumFractionDigits: country === 'PY' ? 0 : 2,
                            maximumFractionDigits: country === 'PY' ? 0 : 2,
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TIR Mensal */}
            <div className="bg-white rounded-lg border border-gray-200 p-2 shadow-sm">
              <h3 className="text-[10px] font-bold text-gray-600 uppercase mb-1.5">
                {country === 'PY' ? '2. RETORNO MENSUAL' : '2. RETORNO MENSAL'}
              </h3>
              <div className="space-y-1">
                {scenarios.map(s => {
                  const colors = getColorClasses(s.id);
                  const delta =
                    s.id !== 'A' && scenarioA?.results
                      ? s.results!.resultadoMensal - scenarioA.results.resultadoMensal
                      : null;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] font-medium ${colors.text} truncate`}>
                        {s.name.split(' ')[0]} {s.name.split(' ')[1]}:
                      </span>
                      <div className="flex items-center gap-1">
                        {delta != null && (
                          <span className="text-[10px] text-green-600 font-medium">↑ +{delta.toFixed(2)}%</span>
                        )}
                        <span className="text-xs font-bold text-ai-text shrink-0">
                          {s.results!.resultadoMensal.toFixed(2)}%{s.id === 'A' ? ' a.m.' : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Margem Líquida */}
            <div className="bg-white rounded-lg border border-gray-200 p-2 shadow-sm">
              <h3 className="text-[10px] font-bold text-gray-600 uppercase mb-1.5">
                {country === 'PY' ? '3. MARGEN NETO' : '3. MARGEM LÍQUIDA'}
              </h3>
              <div className="space-y-1">
                {scenarios.map(s => {
                  const colors = getColorClasses(s.id);
                  const delta =
                    s.id !== 'A' && scenarioA?.results ? s.results!.margemVenda - scenarioA.results.margemVenda : null;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] font-medium ${colors.text} truncate`}>
                        {s.name.split(' ')[0]} {s.name.split(' ')[1]}:
                      </span>
                      <div className="flex items-center gap-1">
                        {delta != null && (
                          <span className="text-[10px] text-green-600 font-medium">↑ +{delta.toFixed(2)}%</span>
                        )}
                        <span className="text-xs font-bold text-ai-text shrink-0">{s.results!.margemVenda.toFixed(2)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resultado por Hectare */}
            <div className="bg-white rounded-lg border border-gray-200 p-2 shadow-sm">
              <h3 className="text-[10px] font-bold text-gray-600 uppercase mb-1.5">
                {country === 'PY' ? '4. RESULTADO POR HECTÁREA' : '4. RESULTADO POR HECTARE'}
              </h3>
              <div className="space-y-1">
                {scenarios.map(s => {
                  const colors = getColorClasses(s.id);
                  const delta =
                    s.id !== 'A' && scenarioA?.results
                      ? (s.results!.resultadoPorHectareAno - scenarioA.results.resultadoPorHectareAno) / 1000
                      : null;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] font-medium ${colors.text} truncate`}>
                        {s.name.split(' ')[0]} {s.name.split(' ')[1]}:
                      </span>
                      <div className="flex items-center gap-1">
                        {delta != null && (
                          <span className="text-[10px] text-green-600 font-medium">↑ +{delta.toFixed(1)}k</span>
                        )}
                        <span
                          className={`${country === 'PY' ? 'text-[10px]' : 'text-xs'} font-bold text-ai-text whitespace-nowrap shrink-0`}
                        >
                          {country === 'PY' ? currencySymbol : 'R$'}{' '}
                          {s.results!.resultadoPorHectareAno.toLocaleString('pt-BR', {
                            minimumFractionDigits: country === 'PY' ? 0 : 2,
                            maximumFractionDigits: country === 'PY' ? 0 : 2,
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-xl border border-ai-border shadow-xl max-w-md w-full mx-4 my-4">
            <div className="flex items-center justify-between p-4 border-b border-ai-border">
              <div className="flex items-center gap-2">
                <Save size={18} className="text-ai-accent" />
                <h2 className="text-lg font-semibold text-ai-text">Salvar Comparativo</h2>
              </div>
              <button
                onClick={() => {
                  setIsSaveModalOpen(false);
                  setSaveName('');
                }}
                className="p-1 text-ai-subtext hover:text-ai-text hover:bg-ai-surface rounded transition-colors"
                disabled={isSaving}
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={e => {
                e.preventDefault();
                e.stopPropagation();
                if (!isSaving) {
                  handleSave();
                }
              }}
              className="p-4"
            >
              <div className="mb-4">
                <label htmlFor="comparative-name" className="block text-sm font-medium text-ai-text mb-2">
                  Nome do Comparativo
                </label>
                <input
                  id="comparative-name"
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Digite um nome para o comparativo"
                  className="w-full px-3 py-2 border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent text-ai-text bg-white"
                  autoFocus
                  maxLength={100}
                  disabled={isSaving}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsSaveModalOpen(false);
                    setSaveName('');
                  }}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-ai-subtext hover:text-ai-text hover:bg-ai-surface rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !saveName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-ai-accent hover:bg-ai-accent/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Salvar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Comparator;

// Custom styles for sliders in comparator only - improves formatting
if (typeof document !== 'undefined') {
  const styleId = 'comparator-slider-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .comparator-container {
        width: 100% !important;
        max-width: 100vw !important;
        box-sizing: border-box !important;
      }
      .comparator-container * {
        box-sizing: border-box !important;
      }
      .comparator-container .bg-gray-50 {
        padding: 0.3rem !important;
        overflow: visible !important;
      }
      @media (max-width: 768px) {
        .comparator-container .bg-gray-50 {
          padding: 0.5rem !important;
        }
      }
      .comparator-container .bg-gray-50 > div:first-child {
        margin-bottom: 0.3rem !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: flex-start !important;
        width: 100% !important;
        min-width: 0 !important;
        overflow: visible !important;
        position: relative !important;
      }
      .comparator-container label {
        font-size: 0.55rem !important;
        line-height: 1.1 !important;
        letter-spacing: 0.025em !important;
        flex-shrink: 1 !important;
        min-width: 0 !important;
        overflow: visible !important;
      }
      @media (max-width: 768px) {
        .comparator-container label {
          font-size: 0.65rem !important;
          max-width: 55% !important;
          flex-shrink: 1 !important;
          word-break: break-word !important;
        }
      }
      /* Premissas 1-8: +30% fonte quando comparador tem 2 cenários */
      .comparator-container.comparator-2-scenarios label {
        font-size: 0.715rem !important;
      }
      @media (max-width: 768px) {
        .comparator-container.comparator-2-scenarios label {
          font-size: 0.845rem !important;
        }
      }
      .comparator-container .bg-gray-50 > div:first-child > div:last-child {
        flex-shrink: 0 !important;
        min-width: fit-content !important;
        max-width: none !important;
        overflow: visible !important;
        display: flex !important;
        align-items: baseline !important;
        justify-content: flex-end !important;
        gap: 0.25rem !important;
        text-align: right !important;
        white-space: nowrap !important;
      }
      @media (max-width: 768px) {
        .comparator-container .bg-gray-50 > div:first-child > div:last-child {
          max-width: none !important;
          gap: 0.15rem !important;
          flex-basis: auto !important;
        }
      }
      .comparator-container .text-\\[0\\.9rem\\] {
        font-size: 0.7rem !important;
        line-height: 1 !important;
        font-weight: 700 !important;
        white-space: nowrap !important;
        overflow: visible !important;
        display: inline-block !important;
      }
      @media (max-width: 768px) {
        .comparator-container .text-\\[0\\.9rem\\] {
          font-size: 0.85rem !important;
        }
      }
      .comparator-container .text-\\[0\\.675rem\\] {
        font-size: 0.55rem !important;
        line-height: 1.1 !important;
        white-space: nowrap !important;
        overflow: visible !important;
        display: inline-block !important;
      }
      @media (max-width: 768px) {
        .comparator-container .text-\\[0\\.675rem\\] {
          font-size: 0.7rem !important;
        }
      }
      .comparator-container .bg-gray-50 {
        overflow: visible !important;
      }
      .comparator-container .bg-gray-50 * {
        overflow-x: visible !important;
      }
      .comparator-container .relative.h-\\[1\\.35rem\\] {
        height: 1rem !important;
      }
      @media (max-width: 768px) {
        .comparator-container .relative.h-\\[1\\.35rem\\] {
          height: 1.2rem !important;
        }
      }
      .comparator-container .relative.h-\\[1\\.35rem\\] > div:first-of-type {
        height: 0.4rem !important;
        border-radius: 9999px !important;
      }
      @media (max-width: 768px) {
        .comparator-container .relative.h-\\[1\\.35rem\\] > div:first-of-type {
          height: 0.5rem !important;
        }
      }
      .comparator-container .relative.h-\\[1\\.35rem\\] > div:last-of-type {
        height: 0.75rem !important;
        width: 0.75rem !important;
        border-width: 2px !important;
        border-radius: 50% !important;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1) !important;
      }
      @media (max-width: 768px) {
        .comparator-container .relative.h-\\[1\\.35rem\\] > div:last-of-type {
          height: 0.9rem !important;
          width: 0.9rem !important;
        }
      }
      .comparator-container input[type=range] {
        width: 100% !important;
        max-width: 100% !important;
      }
      .comparator-container input[type=range]::-webkit-slider-thumb {
        height: 11px !important;
        width: 11px !important;
        border-width: 2px !important;
        margin-top: -2.5px !important;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1) !important;
      }
      @media (max-width: 768px) {
        .comparator-container input[type=range]::-webkit-slider-thumb {
          height: 14px !important;
          width: 14px !important;
          margin-top: -3px !important;
        }
      }
      .comparator-container input[type=range]::-webkit-slider-runnable-track {
        height: 5px !important;
      }
      @media (max-width: 768px) {
        .comparator-container input[type=range]::-webkit-slider-runnable-track {
          height: 6px !important;
        }
      }
      .comparator-container input[type=range]::-moz-range-thumb {
        height: 11px !important;
        width: 11px !important;
        border-width: 2px !important;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1) !important;
      }
      @media (max-width: 768px) {
        .comparator-container input[type=range]::-moz-range-thumb {
          height: 14px !important;
          width: 14px !important;
        }
      }
      .comparator-container input[type=range]::-moz-range-track {
        height: 5px !important;
      }
      @media (max-width: 768px) {
        .comparator-container input[type=range]::-moz-range-track {
          height: 6px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
