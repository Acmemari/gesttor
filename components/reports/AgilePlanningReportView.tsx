import React from 'react';
import { MapPin, DollarSign, Users, Zap, ArrowRight, Save } from 'lucide-react';
import type { AgilePlanningReportData } from '../../lib/agilePlanningReportTypes';

const formatNum = (n: number, decimals = 0): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const formatCurrency = (n: number, decimals = 0): string =>
  `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

interface AgilePlanningReportViewProps {
  data: AgilePlanningReportData;
  onExportPDF: () => void;
  onBack?: () => void;
  onSave?: () => void | Promise<void>;
  isSaving?: boolean;
}

const AgilePlanningReportView: React.FC<AgilePlanningReportViewProps> = ({
  data,
  onExportPDF,
  onBack,
  onSave,
  isSaving = false,
}) => {
  const { header, dimensions, assets, herdComposition, zootechnical, financial, productionSystem } =
    data;
  const location = [header.city, header.state, header.country].filter(Boolean).join(' - ');
  const totalOp = assets.operationPecuary + assets.operationAgricultural;
  const opPecuaryPct = totalOp > 0 ? (assets.operationPecuary / totalOp) * 100 : 0;
  const opAgricPct = totalOp > 0 ? (assets.operationAgricultural / totalOp) * 100 : 0;

  return (
    <div className="min-h-full bg-[#f5f5f5] text-gray-900">
      <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 uppercase tracking-tight">
              {header.farmName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="flex items-center gap-1 text-sm text-gray-500">
                <MapPin size={14} className="text-gray-400" />
                {location}
              </span>
              {header.productionSystem && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-600 text-white uppercase">
                  {header.productionSystem}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:items-end gap-2">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Data do relatório</p>
              <p className="text-sm font-semibold text-gray-800 capitalize">{header.reportDate}</p>
            </div>
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                >
                  Voltar
                </button>
              )}
              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={16} className="opacity-90" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              )}
              <button
                type="button"
                onClick={onExportPDF}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors"
              >
                Exportar PDF
                <ArrowRight size={16} className="opacity-90" />
              </button>
            </div>
          </div>
        </div>

        {/* DADOS DA FAZENDA E DIMENSÕES */}
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 mb-4 pb-1 border-b-2 border-green-600 w-fit">
            <MapPin size={18} className="text-green-600" />
            DADOS DA FAZENDA E DIMENSÕES
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Área total</p>
              <p className="text-xl font-bold text-green-600">
                {formatNum(dimensions.totalArea, 2)} <span className="text-sm font-normal text-gray-500">ha</span>
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Área pastagem</p>
              <p className="text-xl font-bold text-gray-900">
                {formatNum(dimensions.pastureArea, 2)} <span className="text-sm font-normal text-gray-500">ha</span>
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Reserva e APP</p>
              <p className="text-xl font-bold text-gray-900">
                {formatNum(dimensions.reserveAndAPP, 2)} <span className="text-sm font-normal text-gray-500">ha</span>
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Agric. arrendada</p>
              <p className="text-xl font-bold text-gray-900">
                {formatNum(dimensions.agricultureLeased, 2)} <span className="text-sm font-normal text-gray-500">ha</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong className="text-gray-900">Prod. volumoso:</strong> {formatNum(dimensions.forageProduction, 2)} ha</span>
            <span><strong className="text-gray-900">Infraestrutura:</strong> {formatNum(dimensions.infrastructure, 2)} ha</span>
            <span><strong className="text-gray-900">Agric. própria:</strong> {formatNum(dimensions.agricultureOwned, 2)} ha</span>
            <span><strong className="text-gray-900">Outras culturas:</strong> {formatNum(dimensions.otherCrops, 2)} ha</span>
            <span><strong className="text-gray-900">Outros:</strong> {formatNum(dimensions.otherArea, 2)} ha</span>
          </div>
        </section>

        {/* PATRIMÔNIO E ATIVOS */}
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 mb-4 pb-1 border-b-2 border-green-600 w-fit">
            <DollarSign size={18} className="text-green-600" />
            $ PATRIMÔNIO E ATIVOS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Valor da propriedade</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(assets.propertyValue)}</p>
              {assets.agricultureVariationPercent !== 0 && (
                <p className="text-xs text-green-600 mt-1">
                  Var. Valor Agricultura {assets.agricultureVariationPercent > 0 ? '+' : ''}{assets.agricultureVariationPercent}%
                </p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Valor do rebanho</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(assets.herdValue)}</p>
              <p className="text-xs text-gray-500 mt-1">
                Comercializa Genética Animal: {assets.commercializesGenetics ? 'Sim' : 'Não'}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Op. pecuária</p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full"
                  style={{ width: `${Math.min(100, opPecuaryPct)}%` }}
                />
              </div>
              <p className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(assets.operationPecuary)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Op. agrícola</p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${Math.min(100, opAgricPct)}%` }}
                />
              </div>
              <p className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(assets.operationAgricultural)}</p>
            </div>
          </div>
        </section>

        {/* COMPOSIÇÃO DO REBANHO META */}
        {herdComposition.rows.length > 0 && (
          <section className="mb-8">
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 mb-4 pb-1 border-b-2 border-green-600 w-fit">
              <Users size={18} className="text-green-600" />
              COMPOSIÇÃO DO REBANHO META
            </h2>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 uppercase text-xs">Categoria</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 uppercase text-xs">Quantidade (cabeças)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 uppercase text-xs">Tempo (meses)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 uppercase text-xs">Rebanho médio</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 uppercase text-xs">Peso vivo (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {herdComposition.rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{row.categoria}</td>
                      <td className="py-2.5 px-4 text-right text-gray-900">{formatNum(row.quantidadeCabecas)}</td>
                      <td className="py-2.5 px-4 text-right text-gray-900">{formatNum(row.tempoMeses, 1)}</td>
                      <td className="py-2.5 px-4 text-right text-gray-900">{formatNum(row.rebanhoMedio)}</td>
                      <td className="py-2.5 px-4 text-right text-gray-900">{formatNum(row.pesoVivoKg)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-900 text-white">
                    <td className="py-3 px-4 font-bold uppercase text-xs">Total geral</td>
                    <td className="py-3 px-4 text-right">-</td>
                    <td className="py-3 px-4 text-right">-</td>
                    <td className="py-3 px-4 text-right font-bold">{formatNum(herdComposition.totalRebanhoMedio)}</td>
                    <td className="py-3 px-4 text-right font-bold">{formatNum(herdComposition.totalPesoVivoKg)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* DESEMPENHO ZOOTÉCNICO */}
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 mb-4 pb-1 border-b-2 border-green-600 w-fit">
            <Zap size={18} className="text-green-600" />
            DESEMPENHO ZOOTÉCNICO
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-100 rounded-xl p-4 text-center">
              <p className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">Rebanho médio</p>
              <p className="text-2xl font-bold text-gray-900">{formatNum(zootechnical.rebanhoMedio)}</p>
              <p className="text-xs text-gray-500">cabeças</p>
            </div>
            <div className="bg-gray-100 rounded-xl p-4 text-center">
              <p className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">Total de UAs</p>
              <p className="text-2xl font-bold text-gray-900">{formatNum(zootechnical.totalUAs, 1)}</p>
              <p className="text-xs text-gray-500">unidades animais</p>
            </div>
            <div className="bg-gray-100 rounded-xl p-4 text-center">
              <p className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">Peso médio</p>
              <p className="text-2xl font-bold text-gray-900">{formatNum(zootechnical.pesoMedio)}</p>
              <p className="text-xs text-gray-500">kg</p>
            </div>
            <div className="bg-gray-100 rounded-xl p-4 text-center">
              <p className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">Peso médio UA</p>
              <p className="text-2xl font-bold text-gray-900">{formatNum(zootechnical.pesoMedioUA, 2)}</p>
              <p className="text-xs text-gray-500">UA/cabeça</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {zootechnical.reproductive && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase mb-3">
                  <Zap size={14} className="text-green-600" />
                  Índices reprodutivos
                </h3>
                <div className="space-y-2">
                  {[
                    { label: 'Fertilidade', value: zootechnical.reproductive.fertilidade, ref: zootechnical.reproductive.fertilidadeRef },
                    { label: 'Perda Pré-Parto', value: zootechnical.reproductive.perdaPreParto, ref: zootechnical.reproductive.perdaPrePartoRef },
                    { label: 'Mortalidade Bezerros', value: zootechnical.reproductive.mortalidadeBezerros, ref: zootechnical.reproductive.mortalidadeBezerrosRef },
                    { label: 'Taxa de Desmame', value: zootechnical.reproductive.taxaDesmame, ref: zootechnical.reproductive.taxaDesmameRef },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-500">Referência: {item.ref}</p>
                      </div>
                      <span className="text-lg font-bold text-green-600">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {zootechnical.recriaTerminacao && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase mb-3">
                  Índices recria e terminação
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-gray-500">GMD Pós desmame</p>
                    <p className="text-lg font-bold text-gray-900">{Number(zootechnical.recriaTerminacao.gmdPosDesmame || 0).toFixed(2)} kg/dia</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-gray-500">GMD Global</p>
                    <p className="text-lg font-bold text-gray-900">{Number(zootechnical.recriaTerminacao.gmdGlobal || 0).toFixed(2)} kg/dia</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-gray-500">Lotação UA/ha</p>
                    <p className="text-lg font-bold text-gray-900">{formatNum(zootechnical.recriaTerminacao.lotacaoUaHa, 2)}</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-gray-500">Lotação Cab/ha</p>
                    <p className="text-lg font-bold text-gray-900">{formatNum(zootechnical.recriaTerminacao.lotacaoCabHa, 2)}</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-gray-500">Produção @/HA</p>
                    <p className="text-lg font-bold text-gray-900">{formatNum(zootechnical.recriaTerminacao.producaoArrobaHa, 2)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-900 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase text-gray-400 mb-0.5">Destaque de performance</p>
              <p className="text-3xl font-bold text-white">{Number(zootechnical.gmdGlobal || 0).toFixed(2)} kg/dia</p>
              <p className="text-sm text-gray-300">GMD Global</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{formatNum(zootechnical.producaoArrobaHaAno, 2)}</p>
              <p className="text-xs text-gray-400">@ /HA/ANO</p>
            </div>
          </div>
        </section>

        {/* ANÁLISE FINANCEIRA CONSOLIDADA */}
        <section className="mb-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 mb-4 pb-1 border-b-2 border-green-600 w-fit">
            <DollarSign size={18} className="text-green-600" />
            $ ANÁLISE FINANCEIRA CONSOLIDADA
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-900">Retorno s/ valor da terra</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{financial.retornoValorTerra}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Retorno patrimonial imobiliário</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-900">Valor do rebanho</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(financial.valorRebanhoCalculado)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Ativo pecuário calculado</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-white">Retorno s/ ativo pecuário</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{financial.retornoAtivoPecuario}%</p>
              <p className="text-xs text-gray-400 mt-0.5">Retorno sobre o rebanho</p>
            </div>
            <div className="bg-green-600 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-white">Resultado por hectare</p>
              <p className="text-2xl font-bold text-white mt-1">{formatCurrency(financial.resultadoPorHectare)}</p>
              <p className="text-xs text-green-100 mt-0.5">Resultado por hectare produtivo</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Resultado líquido total', value: formatCurrency(financial.resultadoLiquidoTotal) },
              ...(financial.pctArrobaPor100g != null
                ? [
                    {
                      label: '% @/100g',
                      value: `${financial.pctArrobaPor100g}%`,
                      sub: 'Desembolso/cab/mês ÷ (GMD×10) ÷ valor venda @. Ideal até 7%',
                    },
                  ]
                : []),
              { label: 'Receita total', value: formatCurrency(financial.receitaTotal) },
              { label: 'Desembolso total', value: formatCurrency(financial.desembolsoTotal), sub: 'Desembolso operacional efetivo' },
              { label: 'Margem s/ venda', value: `${financial.margemSobreVenda}%`, green: true },
              { label: 'Desembolso/@', value: formatCurrency(financial.desembolsoPorArroba), sub: 'Desembolso por arroba produzida' },
              {
                label:
                  productionSystem === 'Recria e Engorda' || productionSystem === 'Ciclo Completo'
                    ? 'Desembolso/cabeça/mês'
                    : 'Desembolso/bezerro',
                value:
                  productionSystem === 'Recria e Engorda' || productionSystem === 'Ciclo Completo'
                    ? formatCurrency(financial.desembolsoPorCabecaMes || 0, 1)
                    : formatCurrency(financial.desembolsoPorBezerro),
                sub:
                  productionSystem === 'Recria e Engorda' || productionSystem === 'Ciclo Completo'
                    ? 'Desembolso total por cabeça ao mês'
                    : 'Desembolso por animal desmamado',
              },
              { label: 'Desembolso médio mensal', value: formatCurrency(financial.desembolsoMedioMensal) },
              { label: 'Resultado por cabeça', value: formatCurrency(financial.resultadoPorCabeca), sub: 'Resultado médio por animal' },
            ].map((item, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{item.label}</p>
                <p className={`text-lg font-bold ${item.green ? 'text-green-600' : 'text-gray-900'}`}>{item.value}</p>
                {item.sub && <p className="text-[10px] text-gray-500 mt-0.5">{item.sub}</p>}
              </div>
            ))}
          </div>
        </section>

        <footer className="pt-6 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} {header.farmName.toUpperCase()} - GESTÃO DE ALTA PERFORMANCE</span>
          <span>RELATÓRIO CONFIDENCIAL · SISTEMA DE PRODUÇÃO: {productionSystem || '-'}</span>
        </footer>
      </div>
    </div>
  );
};

export default AgilePlanningReportView;
