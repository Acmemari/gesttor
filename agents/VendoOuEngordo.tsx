import React, { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Check, Copy, Download, Save, AlertTriangle, Scale, ChevronRight } from 'lucide-react';
import type { Toast } from '../components/Toast';
import { useHierarchy } from '../contexts/HierarchyContext';
import { getAuthHeaders } from '../lib/session';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Category = 'macho' | 'femea';
type Modalidade = 'fazenda' | 'boitel' | 'ambos';
type BoitelCobranca = 'diaria' | 'porArroba';
type ValorInputMode = 'direto' | 'kgVivo' | 'porArroba';
type Step = 'selecao' | 'valorAtual' | 'modalidade' | 'fazenda' | 'boitel' | 'metas' | 'relatorio';

interface FazendaInputs {
  tipo: string;
  custoDia: number;
  gmd: number;
  pesoAbate: number;
  rendimento: number;
  valorArroba: number;
}

interface BoitelInputs {
  cobranca: BoitelCobranca;
  custoDia?: number;
  custoPorArroba?: number;
  gmd: number;
  pesoAbate: number;
  rendimento: number;
  valorArroba: number;
}

interface CenarioResultado {
  dias: number;
  meses: number;
  custoTotal: number;
  arrobasAbate: number;
  receita: number;
  resultado: number;
  ganhoVsVenda: number;
  tir: number; // decimal (0.015 = 1.5%)
  pontoEquilibrio: number;
  arrobaParaMetaPadrao: number;
}

interface Meta {
  tipo: 'reais' | 'percentual';
  valor: number;
  arrobaNecessaria?: number; // calculado
}

interface VendoOuEngordoProps {
  onBack?: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const META_TIR_PADRAO = 0.015; // 1,5% a.m.

const RANGES: Record<Category, {
  custoDia: [number, number];
  gmd: [number, number];
  pesoAbate: [number, number];
  rendimento: [number, number];
  valorArroba: [number, number];
}> = {
  macho: { custoDia: [10, 20], gmd: [0.8, 1.9], pesoAbate: [480, 600], rendimento: [53, 58], valorArroba: [300, 400] },
  femea: { custoDia: [10, 20], gmd: [0.8, 1.5], pesoAbate: [360, 550], rendimento: [50, 55], valorArroba: [300, 400] },
};

// ─────────────────────────────────────────────────────────────────────────────
// Motor de cálculo
// ─────────────────────────────────────────────────────────────────────────────

const calcValorPorArroba = (peso: number, rendimentoPercent: number, valorArroba: number): number => {
  const arrobas = (peso * (rendimentoPercent / 100)) / 15;
  return arrobas * valorArroba;
};

const calcTirMensal = (retornoLiquido: number, investimento: number, meses: number): number => {
  if (investimento <= 0 || meses <= 0) return 0;
  const total = investimento + retornoLiquido;
  if (total <= 0) return -1;
  return Math.pow(total / investimento, 1 / meses) - 1;
};

const calcArrobaParaMetaTIR = (investimento: number, meses: number, arrobasAbate: number, tirMeta: number, custoTotal: number): number => {
  if (arrobasAbate <= 0) return 0;
  const retornoNecessario = investimento * Math.pow(1 + tirMeta, meses) - investimento;
  const receitaNecessaria = retornoNecessario + custoTotal;
  return receitaNecessaria / arrobasAbate;
};

const calcArrobaParaMetaReais = (investimento: number, custoTotal: number, arrobasAbate: number, lucroDesejado: number): number => {
  if (arrobasAbate <= 0) return 0;
  return (investimento + lucroDesejado + custoTotal) / arrobasAbate;
};

interface CalcFazendaParams {
  investimento: number;
  pesoAtual: number;
  custoDia: number;
  gmd: number;
  pesoAbate: number;
  rendimento: number;
  valorArroba: number;
}

const calcFazenda = (p: CalcFazendaParams): CenarioResultado => {
  const ganho = Math.max(0, p.pesoAbate - p.pesoAtual);
  const dias = p.gmd > 0 ? ganho / p.gmd : 0;
  const meses = dias / 30;
  const custoTotal = dias * p.custoDia;
  const arrobasAbate = (p.pesoAbate * (p.rendimento / 100)) / 15;
  const receita = arrobasAbate * p.valorArroba;
  const resultado = receita - custoTotal;
  const ganhoVsVenda = resultado - p.investimento;
  const tir = calcTirMensal(ganhoVsVenda, p.investimento, meses);
  const pontoEquilibrio = arrobasAbate > 0 ? (p.investimento + custoTotal) / arrobasAbate : 0;
  const arrobaParaMetaPadrao = calcArrobaParaMetaTIR(p.investimento, meses, arrobasAbate, META_TIR_PADRAO, custoTotal);
  return { dias, meses, custoTotal, arrobasAbate, receita, resultado, ganhoVsVenda, tir, pontoEquilibrio, arrobaParaMetaPadrao };
};

const calcBoitelPorArroba = (params: {
  investimento: number;
  pesoAtual: number;
  custoPorArroba: number;
  gmd: number;
  pesoAbate: number;
  rendimento: number;
  valorArroba: number;
}): CenarioResultado => {
  const ganho = Math.max(0, params.pesoAbate - params.pesoAtual);
  const dias = params.gmd > 0 ? ganho / params.gmd : 0;
  const meses = dias / 30;
  const arrobasProduzidas = (ganho * (params.rendimento / 100)) / 15;
  const custoTotal = arrobasProduzidas * params.custoPorArroba;
  const arrobasAbate = (params.pesoAbate * (params.rendimento / 100)) / 15;
  const receita = arrobasAbate * params.valorArroba;
  const resultado = receita - custoTotal;
  const ganhoVsVenda = resultado - params.investimento;
  const tir = calcTirMensal(ganhoVsVenda, params.investimento, meses);
  const pontoEquilibrio = arrobasAbate > 0 ? (params.investimento + custoTotal) / arrobasAbate : 0;
  const arrobaParaMetaPadrao = calcArrobaParaMetaTIR(params.investimento, meses, arrobasAbate, META_TIR_PADRAO, custoTotal);
  return { dias, meses, custoTotal, arrobasAbate, receita, resultado, ganhoVsVenda, tir, pontoEquilibrio, arrobaParaMetaPadrao };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formato
// ─────────────────────────────────────────────────────────────────────────────

const fmtBRL = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

const fmtNum = (v: number, digits = 2): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtPct = (v: number, digits = 2): string => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

const parseNum = (s: string): number => {
  if (!s) return NaN;
  const cleaned = s.toString().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  return parseFloat(cleaned);
};

const isOutOfRange = (value: number, range: [number, number]): boolean =>
  !isNaN(value) && (value < range[0] || value > range[1]);

// ─────────────────────────────────────────────────────────────────────────────
// Gerador de relatório Markdown
// ─────────────────────────────────────────────────────────────────────────────

interface RelatorioData {
  dataISO: string;
  category: Category;
  pesoAtual: number;
  valorAtual: number;
  farmName?: string;
  clientName?: string;
  cenarioFazenda?: { inputs: FazendaInputs; resultado: CenarioResultado };
  cenarioBoitel?: { inputs: BoitelInputs; resultado: CenarioResultado };
  metaCustom?: Meta;
}

const gerarRelatorioMarkdown = (d: RelatorioData): string => {
  const lines: string[] = [];
  lines.push('# Relatório — Vendo ou Engordo');
  lines.push('');
  lines.push(`**Data:** ${new Date(d.dataISO).toLocaleDateString('pt-BR')}`);
  lines.push(`**Categoria:** ${d.category === 'macho' ? 'Macho' : 'Fêmea'}`);
  if (d.clientName) lines.push(`**Cliente:** ${d.clientName}`);
  if (d.farmName) lines.push(`**Fazenda:** ${d.farmName}`);
  lines.push('');
  lines.push('## Situação atual');
  lines.push('');
  lines.push(`- **Peso atual:** ${fmtNum(d.pesoAtual, 0)} kg`);
  lines.push(`- **Valor de venda atual:** ${fmtBRL(d.valorAtual)}`);
  lines.push('');

  const renderCenario = (titulo: string, premissas: string[], resultado: CenarioResultado) => {
    lines.push(`## ${titulo}`);
    lines.push('');
    lines.push('**Premissas:**');
    premissas.forEach(p => lines.push(`- ${p}`));
    lines.push('');
    lines.push('**Resultado:**');
    lines.push('');
    lines.push(`| Métrica | Valor |`);
    lines.push(`|---|---|`);
    lines.push(`| Tempo até abate | ${fmtNum(resultado.dias, 0)} dias (${fmtNum(resultado.meses, 2)} meses) |`);
    lines.push(`| Custo total | ${fmtBRL(resultado.custoTotal)} |`);
    lines.push(`| Arrobas ao abate | ${fmtNum(resultado.arrobasAbate, 2)} @ |`);
    lines.push(`| Receita bruta | ${fmtBRL(resultado.receita)} |`);
    lines.push(`| Resultado líquido | ${fmtBRL(resultado.resultado)} |`);
    lines.push(`| Ganho vs. venda imediata | ${fmtBRL(resultado.ganhoVsVenda)} |`);
    lines.push(`| TIR mensal | ${fmtPct(resultado.tir)} |`);
    lines.push(`| Ponto de equilíbrio da @ | ${fmtBRL(resultado.pontoEquilibrio)} |`);
    lines.push(`| @ para TIR 1,5% a.m. | ${fmtBRL(resultado.arrobaParaMetaPadrao)} |`);
    lines.push('');
    const recomendacao = resultado.ganhoVsVenda > 0
      ? `**Recomendação:** Vale a pena engordar — ganho de ${fmtBRL(resultado.ganhoVsVenda)} sobre a venda imediata.`
      : `**Recomendação:** Nestas premissas, não vale a pena engordar (diferença de ${fmtBRL(resultado.ganhoVsVenda)}).`;
    lines.push(recomendacao);
    lines.push('');
  };

  if (d.cenarioFazenda) {
    const i = d.cenarioFazenda.inputs;
    renderCenario('Cenário — Engorda na Fazenda', [
      `Sistema: ${i.tipo}`,
      `Custo diário: ${fmtBRL(i.custoDia)}/dia`,
      `GMD: ${fmtNum(i.gmd, 2)} kg/dia`,
      `Peso ao abate: ${fmtNum(i.pesoAbate, 0)} kg`,
      `Rendimento de carcaça: ${fmtNum(i.rendimento, 1)}%`,
      `Valor da @: ${fmtBRL(i.valorArroba)}`,
    ], d.cenarioFazenda.resultado);
  }

  if (d.cenarioBoitel) {
    const i = d.cenarioBoitel.inputs;
    const cobrancaDesc = i.cobranca === 'diaria'
      ? `Cobrança por diária: ${fmtBRL(i.custoDia ?? 0)}/dia`
      : `Cobrança por @ produzida: ${fmtBRL(i.custoPorArroba ?? 0)}/@`;
    renderCenario('Cenário — Engorda no Boitel', [
      cobrancaDesc,
      `GMD: ${fmtNum(i.gmd, 2)} kg/dia`,
      `Peso ao abate: ${fmtNum(i.pesoAbate, 0)} kg`,
      `Rendimento de carcaça: ${fmtNum(i.rendimento, 1)}%`,
      `Valor da @: ${fmtBRL(i.valorArroba)}`,
    ], d.cenarioBoitel.resultado);
  }

  if (d.cenarioFazenda && d.cenarioBoitel) {
    const f = d.cenarioFazenda.resultado;
    const b = d.cenarioBoitel.resultado;
    lines.push('## Comparativo — Fazenda vs. Boitel');
    lines.push('');
    lines.push(`| Métrica | Fazenda | Boitel |`);
    lines.push(`|---|---|---|`);
    lines.push(`| Resultado líquido | ${fmtBRL(f.resultado)} | ${fmtBRL(b.resultado)} |`);
    lines.push(`| Ganho vs. venda | ${fmtBRL(f.ganhoVsVenda)} | ${fmtBRL(b.ganhoVsVenda)} |`);
    lines.push(`| TIR mensal | ${fmtPct(f.tir)} | ${fmtPct(b.tir)} |`);
    lines.push(`| Ponto de equilíbrio @ | ${fmtBRL(f.pontoEquilibrio)} | ${fmtBRL(b.pontoEquilibrio)} |`);
    lines.push('');
    const melhor = f.ganhoVsVenda >= b.ganhoVsVenda ? 'Fazenda' : 'Boitel';
    lines.push(`**Melhor cenário:** ${melhor}.`);
    lines.push('');
  }

  if (d.metaCustom && d.metaCustom.arrobaNecessaria !== undefined) {
    lines.push('## Meta personalizada');
    lines.push('');
    const descMeta = d.metaCustom.tipo === 'reais'
      ? `Lucro desejado: ${fmtBRL(d.metaCustom.valor)}/cabeça`
      : `TIR mensal desejada: ${fmtNum(d.metaCustom.valor, 2)}% a.m.`;
    lines.push(`- ${descMeta}`);
    lines.push(`- @ necessária para atingir: **${fmtBRL(d.metaCustom.arrobaNecessaria)}**`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Esta análise é uma simulação baseada nas premissas informadas. Resultados reais dependem de condições de mercado, desempenho animal e gestão._');
  return lines.join('\n');
};

// ─────────────────────────────────────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────────────────────────────────────

const BotMessage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r text-sm text-gray-800 mb-4">
    {children}
  </div>
);

const WarnMessage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r text-xs text-amber-900 mt-1 flex items-start gap-2">
    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

interface FieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
  warn?: string | null;
}
const Field: React.FC<FieldProps> = ({ label, children, hint, warn }) => (
  <div className="mb-4">
    <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
    {children}
    {hint && !warn && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    {warn && <WarnMessage>{warn}</WarnMessage>}
  </div>
);

const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500';

const primaryBtn = 'inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryBtn = 'inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors';

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

const VendoOuEngordo: React.FC<VendoOuEngordoProps> = ({ onBack, onToast }) => {
  const { selectedOrganization, selectedFarm } = useHierarchy();

  const [step, setStep] = useState<Step>('selecao');

  // Etapa 1
  const [category, setCategory] = useState<Category>('macho');
  const [pesoAtual, setPesoAtual] = useState<string>('');
  const [valorMode, setValorMode] = useState<ValorInputMode>('direto');
  const [valorDireto, setValorDireto] = useState<string>('');
  const [valorKg, setValorKg] = useState<string>('');
  const [rendEntrada, setRendEntrada] = useState<string>('');
  const [arrobaEntrada, setArrobaEntrada] = useState<string>('');

  // Etapa 2
  const [modalidade, setModalidade] = useState<Modalidade>('fazenda');

  // Etapa 3A — Fazenda
  const [fz, setFz] = useState<{ tipo: string; custoDia: string; gmd: string; pesoAbate: string; rendimento: string; valorArroba: string }>({
    tipo: 'Confinamento', custoDia: '', gmd: '', pesoAbate: '', rendimento: '', valorArroba: '',
  });

  // Etapa 3B — Boitel
  const [bt, setBt] = useState<{ cobranca: BoitelCobranca; custoDia: string; custoPorArroba: string; gmd: string; pesoAbate: string; rendimento: string; valorArroba: string }>({
    cobranca: 'diaria', custoDia: '', custoPorArroba: '', gmd: '', pesoAbate: '', rendimento: '', valorArroba: '',
  });

  // Etapa 4 — Metas
  const [metaTipo, setMetaTipo] = useState<'reais' | 'percentual' | 'nenhuma'>('nenhuma');
  const [metaValor, setMetaValor] = useState<string>('');

  // Persistência
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // ─── Derivados ───────────────────────────────────────────────────────────

  const peso = parseNum(pesoAtual);

  const valorAtualCalc = useMemo(() => {
    if (valorMode === 'direto') return parseNum(valorDireto);
    if (valorMode === 'kgVivo') {
      const kg = parseNum(valorKg);
      return !isNaN(peso) && !isNaN(kg) ? peso * kg : NaN;
    }
    const rend = parseNum(rendEntrada);
    const arroba = parseNum(arrobaEntrada);
    if (!isNaN(peso) && !isNaN(rend) && !isNaN(arroba)) {
      return calcValorPorArroba(peso, rend, arroba);
    }
    return NaN;
  }, [valorMode, valorDireto, valorKg, rendEntrada, arrobaEntrada, peso]);

  const fzInputs: FazendaInputs | null = useMemo(() => {
    const custoDia = parseNum(fz.custoDia);
    const gmd = parseNum(fz.gmd);
    const pesoAbate = parseNum(fz.pesoAbate);
    const rendimento = parseNum(fz.rendimento);
    const valorArroba = parseNum(fz.valorArroba);
    if ([custoDia, gmd, pesoAbate, rendimento, valorArroba].some(isNaN)) return null;
    return { tipo: fz.tipo, custoDia, gmd, pesoAbate, rendimento, valorArroba };
  }, [fz]);

  const btInputs: BoitelInputs | null = useMemo(() => {
    const gmd = parseNum(bt.gmd);
    const pesoAbate = parseNum(bt.pesoAbate);
    const rendimento = parseNum(bt.rendimento);
    const valorArroba = parseNum(bt.valorArroba);
    if ([gmd, pesoAbate, rendimento, valorArroba].some(isNaN)) return null;
    if (bt.cobranca === 'diaria') {
      const custoDia = parseNum(bt.custoDia);
      if (isNaN(custoDia)) return null;
      return { cobranca: 'diaria', custoDia, gmd, pesoAbate, rendimento, valorArroba };
    }
    const custoPorArroba = parseNum(bt.custoPorArroba);
    if (isNaN(custoPorArroba)) return null;
    return { cobranca: 'porArroba', custoPorArroba, gmd, pesoAbate, rendimento, valorArroba };
  }, [bt]);

  const resFazenda: CenarioResultado | null = useMemo(() => {
    if (!fzInputs || isNaN(peso) || isNaN(valorAtualCalc)) return null;
    return calcFazenda({
      investimento: valorAtualCalc,
      pesoAtual: peso,
      custoDia: fzInputs.custoDia,
      gmd: fzInputs.gmd,
      pesoAbate: fzInputs.pesoAbate,
      rendimento: fzInputs.rendimento,
      valorArroba: fzInputs.valorArroba,
    });
  }, [fzInputs, peso, valorAtualCalc]);

  const resBoitel: CenarioResultado | null = useMemo(() => {
    if (!btInputs || isNaN(peso) || isNaN(valorAtualCalc)) return null;
    if (btInputs.cobranca === 'diaria') {
      return calcFazenda({
        investimento: valorAtualCalc,
        pesoAtual: peso,
        custoDia: btInputs.custoDia ?? 0,
        gmd: btInputs.gmd,
        pesoAbate: btInputs.pesoAbate,
        rendimento: btInputs.rendimento,
        valorArroba: btInputs.valorArroba,
      });
    }
    return calcBoitelPorArroba({
      investimento: valorAtualCalc,
      pesoAtual: peso,
      custoPorArroba: btInputs.custoPorArroba ?? 0,
      gmd: btInputs.gmd,
      pesoAbate: btInputs.pesoAbate,
      rendimento: btInputs.rendimento,
      valorArroba: btInputs.valorArroba,
    });
  }, [btInputs, peso, valorAtualCalc]);

  const metaResolvida: Meta | undefined = useMemo(() => {
    if (metaTipo === 'nenhuma') return undefined;
    const valor = parseNum(metaValor);
    if (isNaN(valor)) return undefined;
    // Usa o cenário da fazenda como referência, se existir; senão boitel.
    const ref = resFazenda ?? resBoitel;
    if (!ref) return { tipo: metaTipo, valor };
    let arrobaNecessaria = 0;
    if (metaTipo === 'reais') {
      arrobaNecessaria = calcArrobaParaMetaReais(valorAtualCalc, ref.custoTotal, ref.arrobasAbate, valor);
    } else {
      arrobaNecessaria = calcArrobaParaMetaTIR(valorAtualCalc, ref.meses, ref.arrobasAbate, valor / 100, ref.custoTotal);
    }
    return { tipo: metaTipo, valor, arrobaNecessaria };
  }, [metaTipo, metaValor, resFazenda, resBoitel, valorAtualCalc]);

  const relatorioMd = useMemo(() => {
    if (step !== 'relatorio') return '';
    return gerarRelatorioMarkdown({
      dataISO: new Date().toISOString(),
      category,
      pesoAtual: peso,
      valorAtual: valorAtualCalc,
      farmName: selectedFarm?.name,
      clientName: selectedOrganization?.name,
      cenarioFazenda: fzInputs && resFazenda ? { inputs: fzInputs, resultado: resFazenda } : undefined,
      cenarioBoitel: btInputs && resBoitel ? { inputs: btInputs, resultado: resBoitel } : undefined,
      metaCustom: metaResolvida,
    });
  }, [step, category, peso, valorAtualCalc, fzInputs, resFazenda, btInputs, resBoitel, metaResolvida, selectedFarm, selectedOrganization]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const ranges = RANGES[category];

  const avancarValorAtual = () => {
    if (isNaN(peso) || peso <= 0) { onToast?.('Informe o peso atual.', 'warning'); return; }
    if (isNaN(valorAtualCalc) || valorAtualCalc <= 0) { onToast?.('Informe o valor atual.', 'warning'); return; }
    setStep('modalidade');
  };

  const avancarModalidade = () => {
    setStep(modalidade === 'boitel' ? 'boitel' : 'fazenda');
  };

  const avancarFazenda = () => {
    if (!fzInputs) { onToast?.('Preencha todos os campos da fazenda.', 'warning'); return; }
    if (modalidade === 'ambos') { setStep('boitel'); return; }
    setStep('metas');
  };

  const avancarBoitel = () => {
    if (!btInputs) { onToast?.('Preencha todos os campos do boitel.', 'warning'); return; }
    setStep('metas');
  };

  const copiarRelatorio = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(relatorioMd);
      onToast?.('Relatório copiado para a área de transferência.', 'success');
    } catch {
      onToast?.('Não foi possível copiar.', 'error');
    }
  }, [relatorioMd, onToast]);

  const baixarRelatorio = useCallback(() => {
    const blob = new Blob([relatorioMd], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendo-ou-engordo-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [relatorioMd]);

  const salvarNoHistorico = useCallback(async () => {
    setSalvando(true);
    try {
      const headers = await getAuthHeaders();
      const payload = {
        name: `Simulação ${new Date().toLocaleDateString('pt-BR')} — ${category === 'macho' ? 'Macho' : 'Fêmea'} ${fmtNum(peso, 0)}kg`,
        category,
        inputs: {
          pesoAtual: peso,
          valorAtual: valorAtualCalc,
          modalidade,
          valorMode,
          fazenda: fzInputs,
          boitel: btInputs,
          meta: metaResolvida,
        },
        results: {
          fazenda: resFazenda,
          boitel: resBoitel,
        },
        reportMarkdown: relatorioMd,
        organizationId: selectedOrganization?.id ?? null,
        farmId: selectedFarm?.id ?? null,
        farmName: selectedFarm?.name ?? null,
      };
      const res = await fetch('/api/engorda-simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar simulação');
      }
      setSalvo(true);
      onToast?.('Simulação salva com sucesso.', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar';
      onToast?.(msg, 'error');
    } finally {
      setSalvando(false);
    }
  }, [category, peso, valorAtualCalc, modalidade, valorMode, fzInputs, btInputs, metaResolvida, resFazenda, resBoitel, relatorioMd, selectedOrganization, selectedFarm, onToast]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const StepHeader: React.FC<{ num: number; total: number; title: string }> = ({ num, total, title }) => (
    <div className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Passo {num} de {total}</p>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
    </div>
  );

  const stepNumber: Record<Step, number> = {
    selecao: 0, valorAtual: 1, modalidade: 2, fazenda: 3, boitel: 3, metas: 4, relatorio: 5,
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" aria-label="Voltar">
              <ArrowLeft size={18} />
            </button>
          )}
          <Scale size={20} className="text-emerald-600" />
          <h1 className="text-lg font-bold text-gray-900">Vendo ou Engordo</h1>
          <span className="text-xs text-gray-500 ml-2 hidden sm:inline">Decida entre vender agora, engordar na fazenda ou no boitel</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* ═══ Etapa 0 — Seleção cliente/fazenda ═══ */}
        {step === 'selecao' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <StepHeader num={0} total={5} title="Contexto da simulação" />
            <BotMessage>
              Olá! Vou te ajudar a decidir entre vender o garrote/boi magro agora, engordar na fazenda ou mandar para o boitel.
              Antes de começar, confirme o cliente e a fazenda da simulação (ou siga sem vincular).
            </BotMessage>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm">
              <p className="text-gray-600 mb-1">
                <span className="font-semibold text-gray-900">Cliente:</span>{' '}
                {selectedOrganization?.name ?? <span className="text-gray-400 italic">nenhum selecionado</span>}
              </p>
              <p className="text-gray-600">
                <span className="font-semibold text-gray-900">Fazenda:</span>{' '}
                {selectedFarm?.name ?? <span className="text-gray-400 italic">nenhuma selecionada</span>}
              </p>
              <p className="text-[11px] text-gray-500 mt-2">
                Para alterar, use o seletor de hierarquia no topo da aplicação.
              </p>
            </div>
            <button type="button" className={primaryBtn} onClick={() => setStep('valorAtual')}>
              Começar simulação <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ═══ Etapa 1 — Valor atual ═══ */}
        {step === 'valorAtual' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <StepHeader num={1} total={5} title="Valor atual do boi magro" />
            <BotMessage>
              Me diga a <strong>categoria</strong>, o <strong>peso atual</strong> e o <strong>valor de venda</strong> hoje.
              Você pode informar o valor de 3 formas.
            </BotMessage>

            <Field label="Categoria">
              <div className="flex gap-2">
                {(['macho', 'femea'] as Category[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border ${category === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {c === 'macho' ? 'Macho' : 'Fêmea'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Peso atual (kg)">
              <input className={inputClass} type="text" inputMode="decimal" value={pesoAtual} onChange={e => setPesoAtual(e.target.value)} placeholder="Ex: 400" />
            </Field>

            <Field label="Como informar o valor?">
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'direto', label: 'Valor direto (R$)' },
                  { id: 'kgVivo', label: 'Por kg vivo' },
                  { id: 'porArroba', label: 'Por @ + rendimento' },
                ] as { id: ValorInputMode; label: string }[]).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setValorMode(opt.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border ${valorMode === opt.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            {valorMode === 'direto' && (
              <Field label="Valor total (R$)">
                <input className={inputClass} type="text" inputMode="decimal" value={valorDireto} onChange={e => setValorDireto(e.target.value)} placeholder="Ex: 5600" />
              </Field>
            )}
            {valorMode === 'kgVivo' && (
              <Field label="Valor por kg vivo (R$/kg)">
                <input className={inputClass} type="text" inputMode="decimal" value={valorKg} onChange={e => setValorKg(e.target.value)} placeholder="Ex: 14" />
              </Field>
            )}
            {valorMode === 'porArroba' && (
              <>
                <Field label="Rendimento de carcaça (%)">
                  <input className={inputClass} type="text" inputMode="decimal" value={rendEntrada} onChange={e => setRendEntrada(e.target.value)} placeholder="Ex: 51" />
                </Field>
                <Field label="Valor da @ (R$)">
                  <input className={inputClass} type="text" inputMode="decimal" value={arrobaEntrada} onChange={e => setArrobaEntrada(e.target.value)} placeholder="Ex: 360" />
                </Field>
              </>
            )}

            {!isNaN(valorAtualCalc) && valorAtualCalc > 0 && (
              <BotMessage>
                Confirmado: <strong>{category === 'macho' ? 'Macho' : 'Fêmea'}</strong>, <strong>{fmtNum(peso, 0)} kg</strong>, valor atual <strong>{fmtBRL(valorAtualCalc)}</strong>.
              </BotMessage>
            )}

            <div className="flex justify-between mt-6">
              <button type="button" className={secondaryBtn} onClick={() => setStep('selecao')}>Voltar</button>
              <button type="button" className={primaryBtn} onClick={avancarValorAtual}>Continuar <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ═══ Etapa 2 — Modalidade ═══ */}
        {step === 'modalidade' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <StepHeader num={2} total={5} title="Modalidade de engorda" />
            <BotMessage>Vamos analisar engorda na <strong>fazenda</strong>, no <strong>boitel</strong>, ou nos dois cenários?</BotMessage>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {([
                { id: 'fazenda', label: 'Fazenda', desc: 'Engorda na sua fazenda (pasto, semi, confinamento, ILP)' },
                { id: 'boitel', label: 'Boitel', desc: 'Enviar para boitel (diária ou @ produzida)' },
                { id: 'ambos', label: 'Ambos', desc: 'Comparar fazenda e boitel lado a lado' },
              ] as { id: Modalidade; label: string; desc: string }[]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setModalidade(opt.id)}
                  className={`text-left p-4 rounded-lg border-2 transition-all ${modalidade === opt.id ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}
                >
                  <p className="font-semibold text-sm text-gray-900 mb-1">{opt.label}</p>
                  <p className="text-[11px] text-gray-500">{opt.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <button type="button" className={secondaryBtn} onClick={() => setStep('valorAtual')}>Voltar</button>
              <button type="button" className={primaryBtn} onClick={avancarModalidade}>Continuar <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ═══ Etapa 3A — Fazenda ═══ */}
        {step === 'fazenda' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <StepHeader num={3} total={5} title="Engorda na fazenda" />
            <BotMessage>Informe as premissas do sistema. Valores fora das faixas típicas mostram um aviso, mas não bloqueiam.</BotMessage>

            <Field label="Sistema de engorda">
              <select className={inputClass} value={fz.tipo} onChange={e => setFz({ ...fz, tipo: e.target.value })}>
                <option>Pasto + suplementação</option>
                <option>Semiconfinamento</option>
                <option>Confinamento</option>
                <option>ILP</option>
                <option>Outro</option>
              </select>
            </Field>

            <Field
              label="Custo diário total (R$/dia)"
              hint={`Faixa típica: R$ ${ranges.custoDia[0]}–${ranges.custoDia[1]}/dia`}
              warn={isOutOfRange(parseNum(fz.custoDia), ranges.custoDia) ? 'Valor fora da faixa típica — confirme se está correto.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={fz.custoDia} onChange={e => setFz({ ...fz, custoDia: e.target.value })} placeholder="Ex: 15" />
            </Field>

            <Field
              label="GMD (kg/dia)"
              hint={`Faixa típica ${category === 'macho' ? 'macho' : 'fêmea'}: ${ranges.gmd[0]}–${ranges.gmd[1]} kg/dia`}
              warn={isOutOfRange(parseNum(fz.gmd), ranges.gmd) ? 'Valor fora da faixa típica — confirme se está correto.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={fz.gmd} onChange={e => setFz({ ...fz, gmd: e.target.value })} placeholder="Ex: 1,15" />
            </Field>

            <Field
              label="Peso ao abate (kg)"
              hint={`Faixa típica: ${ranges.pesoAbate[0]}–${ranges.pesoAbate[1]} kg`}
              warn={isOutOfRange(parseNum(fz.pesoAbate), ranges.pesoAbate) ? 'Valor fora da faixa típica — confirme se está correto.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={fz.pesoAbate} onChange={e => setFz({ ...fz, pesoAbate: e.target.value })} placeholder="Ex: 550" />
            </Field>

            <Field
              label="Rendimento de carcaça (%)"
              hint={`Faixa típica: ${ranges.rendimento[0]}–${ranges.rendimento[1]}%`}
              warn={isOutOfRange(parseNum(fz.rendimento), ranges.rendimento) ? 'Valor fora da faixa típica — confirme se está correto.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={fz.rendimento} onChange={e => setFz({ ...fz, rendimento: e.target.value })} placeholder="Ex: 55" />
            </Field>

            <Field
              label="Valor da @ de venda (R$)"
              hint={`Faixa típica: R$ ${ranges.valorArroba[0]}–${ranges.valorArroba[1]}`}
              warn={isOutOfRange(parseNum(fz.valorArroba), ranges.valorArroba) ? 'Valor fora da faixa típica — confirme se está correto.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={fz.valorArroba} onChange={e => setFz({ ...fz, valorArroba: e.target.value })} placeholder="Ex: 350" />
            </Field>

            {resFazenda && (
              <BotMessage>
                <strong>Prévia:</strong> {fmtNum(resFazenda.dias, 0)} dias de engorda, resultado líquido de <strong>{fmtBRL(resFazenda.resultado)}</strong>,
                {resFazenda.ganhoVsVenda > 0 ? ' vale a pena engordar.' : ' não vale a pena engordar.'}
              </BotMessage>
            )}

            <div className="flex justify-between mt-6">
              <button type="button" className={secondaryBtn} onClick={() => setStep('modalidade')}>Voltar</button>
              <button type="button" className={primaryBtn} onClick={avancarFazenda}>Continuar <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ═══ Etapa 3B — Boitel ═══ */}
        {step === 'boitel' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <StepHeader num={3} total={5} title="Engorda no boitel" />
            <BotMessage>O boitel cobra por diária ou por @ produzida?</BotMessage>

            <Field label="Forma de cobrança">
              <div className="flex gap-2">
                {([
                  { id: 'diaria', label: 'Diária (R$/dia)' },
                  { id: 'porArroba', label: '@ produzida (R$/@)' },
                ] as { id: BoitelCobranca; label: string }[]).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBt({ ...bt, cobranca: opt.id })}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border ${bt.cobranca === opt.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            {bt.cobranca === 'diaria' ? (
              <Field
                label="Custo diário (R$/dia)"
                hint={`Faixa típica: R$ ${ranges.custoDia[0]}–${ranges.custoDia[1]}/dia`}
                warn={isOutOfRange(parseNum(bt.custoDia), ranges.custoDia) ? 'Valor fora da faixa típica.' : null}
              >
                <input className={inputClass} type="text" inputMode="decimal" value={bt.custoDia} onChange={e => setBt({ ...bt, custoDia: e.target.value })} placeholder="Ex: 15" />
              </Field>
            ) : (
              <Field label="Custo por @ produzida (R$/@)">
                <input className={inputClass} type="text" inputMode="decimal" value={bt.custoPorArroba} onChange={e => setBt({ ...bt, custoPorArroba: e.target.value })} placeholder="Ex: 280" />
              </Field>
            )}

            <Field
              label="GMD (kg/dia)"
              hint={`Faixa típica: ${ranges.gmd[0]}–${ranges.gmd[1]} kg/dia`}
              warn={isOutOfRange(parseNum(bt.gmd), ranges.gmd) ? 'Valor fora da faixa típica.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={bt.gmd} onChange={e => setBt({ ...bt, gmd: e.target.value })} placeholder="Ex: 1,1" />
            </Field>

            <Field
              label="Peso ao abate (kg)"
              hint={`Faixa típica: ${ranges.pesoAbate[0]}–${ranges.pesoAbate[1]} kg`}
              warn={isOutOfRange(parseNum(bt.pesoAbate), ranges.pesoAbate) ? 'Valor fora da faixa típica.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={bt.pesoAbate} onChange={e => setBt({ ...bt, pesoAbate: e.target.value })} placeholder="Ex: 550" />
            </Field>

            <Field
              label="Rendimento de carcaça (%)"
              hint={`Faixa típica: ${ranges.rendimento[0]}–${ranges.rendimento[1]}%`}
              warn={isOutOfRange(parseNum(bt.rendimento), ranges.rendimento) ? 'Valor fora da faixa típica.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={bt.rendimento} onChange={e => setBt({ ...bt, rendimento: e.target.value })} placeholder="Ex: 55" />
            </Field>

            <Field
              label="Valor da @ de venda (R$)"
              hint={`Faixa típica: R$ ${ranges.valorArroba[0]}–${ranges.valorArroba[1]}`}
              warn={isOutOfRange(parseNum(bt.valorArroba), ranges.valorArroba) ? 'Valor fora da faixa típica.' : null}
            >
              <input className={inputClass} type="text" inputMode="decimal" value={bt.valorArroba} onChange={e => setBt({ ...bt, valorArroba: e.target.value })} placeholder="Ex: 350" />
            </Field>

            {resBoitel && (
              <BotMessage>
                <strong>Prévia:</strong> {fmtNum(resBoitel.dias, 0)} dias no boitel, resultado líquido de <strong>{fmtBRL(resBoitel.resultado)}</strong>.
              </BotMessage>
            )}

            <div className="flex justify-between mt-6">
              <button type="button" className={secondaryBtn} onClick={() => setStep(modalidade === 'ambos' ? 'fazenda' : 'modalidade')}>Voltar</button>
              <button type="button" className={primaryBtn} onClick={avancarBoitel}>Continuar <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ═══ Etapa 4 — Metas ═══ */}
        {step === 'metas' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <StepHeader num={4} total={5} title="Meta de retorno" />
            <BotMessage>
              Abaixo o resumo com <strong>TIR mensal</strong> e o <strong>ponto de equilíbrio da @</strong>.
              Se quiser, defina uma meta personalizada para calcular a @ necessária.
            </BotMessage>

            <div className="space-y-3 mb-6">
              {resFazenda && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Fazenda</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Resultado líquido:</span> <strong>{fmtBRL(resFazenda.resultado)}</strong></div>
                    <div><span className="text-gray-500">Ganho vs. venda:</span> <strong className={resFazenda.ganhoVsVenda >= 0 ? 'text-emerald-700' : 'text-red-600'}>{fmtBRL(resFazenda.ganhoVsVenda)}</strong></div>
                    <div><span className="text-gray-500">TIR mensal:</span> <strong>{fmtPct(resFazenda.tir)}</strong></div>
                    <div><span className="text-gray-500">Ponto de equilíbrio:</span> <strong>{fmtBRL(resFazenda.pontoEquilibrio)}/@</strong></div>
                  </div>
                </div>
              )}
              {resBoitel && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Boitel</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Resultado líquido:</span> <strong>{fmtBRL(resBoitel.resultado)}</strong></div>
                    <div><span className="text-gray-500">Ganho vs. venda:</span> <strong className={resBoitel.ganhoVsVenda >= 0 ? 'text-emerald-700' : 'text-red-600'}>{fmtBRL(resBoitel.ganhoVsVenda)}</strong></div>
                    <div><span className="text-gray-500">TIR mensal:</span> <strong>{fmtPct(resBoitel.tir)}</strong></div>
                    <div><span className="text-gray-500">Ponto de equilíbrio:</span> <strong>{fmtBRL(resBoitel.pontoEquilibrio)}/@</strong></div>
                  </div>
                </div>
              )}
            </div>

            <Field label="Meta personalizada (opcional)">
              <div className="flex gap-2 mb-2">
                {([
                  { id: 'nenhuma', label: 'Sem meta' },
                  { id: 'reais', label: 'R$/cabeça' },
                  { id: 'percentual', label: '% ao mês' },
                ] as { id: 'nenhuma' | 'reais' | 'percentual'; label: string }[]).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMetaTipo(opt.id)}
                    className={`flex-1 px-3 py-2 text-xs rounded-lg border ${metaTipo === opt.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {metaTipo !== 'nenhuma' && (
                <input
                  className={inputClass}
                  type="text"
                  inputMode="decimal"
                  value={metaValor}
                  onChange={e => setMetaValor(e.target.value)}
                  placeholder={metaTipo === 'reais' ? 'Ex: 500 (lucro em R$/cabeça)' : 'Ex: 1,5 (TIR em % a.m.)'}
                />
              )}
            </Field>

            {metaResolvida?.arrobaNecessaria !== undefined && (
              <BotMessage>
                Para atingir a meta, a <strong>@ precisa ser {fmtBRL(metaResolvida.arrobaNecessaria)}</strong>.
              </BotMessage>
            )}

            <div className="flex justify-between mt-6">
              <button type="button" className={secondaryBtn} onClick={() => setStep(modalidade === 'boitel' ? 'boitel' : modalidade === 'ambos' ? 'boitel' : 'fazenda')}>Voltar</button>
              <button type="button" className={primaryBtn} onClick={() => setStep('relatorio')}>Gerar relatório <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ═══ Etapa 5 — Relatório ═══ */}
        {step === 'relatorio' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <StepHeader num={5} total={5} title="Relatório final" />
            <BotMessage>Aqui está o relatório completo. Você pode copiar, baixar em Markdown ou salvar no histórico.</BotMessage>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-[500px] overflow-y-auto mb-4">
              <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono">{relatorioMd}</pre>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryBtn} onClick={copiarRelatorio}>
                <Copy size={16} /> Copiar
              </button>
              <button type="button" className={secondaryBtn} onClick={baixarRelatorio}>
                <Download size={16} /> Baixar .md
              </button>
              <button type="button" className={primaryBtn} onClick={salvarNoHistorico} disabled={salvando || salvo}>
                {salvo ? <><Check size={16} /> Salvo</> : <><Save size={16} /> {salvando ? 'Salvando…' : 'Salvar no histórico'}</>}
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setStep('metas')}>Voltar</button>
            </div>
          </div>
        )}

        {/* Progress indicator (breadcrumbs) */}
        {step !== 'selecao' && step !== 'relatorio' && (
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <div
                key={n}
                className={`h-1.5 rounded-full transition-all ${n <= stepNumber[step] ? 'bg-emerald-500 w-8' : 'bg-gray-200 w-4'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VendoOuEngordo;
