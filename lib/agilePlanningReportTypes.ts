/**
 * Types for the Agile Planning Report (view and PDF).
 * Data is consolidated in AgilePlanning.tsx and passed to the report view and PDF generator.
 */

export type ProductionSystemLabel = 'Cria' | 'Ciclo Completo' | 'Recria e Engorda';

export interface AgilePlanningReportHeader {
  farmName: string;
  city: string;
  state: string;
  country: string;
  productionSystem: ProductionSystemLabel | '';
  reportDate: string;
}

export interface AgilePlanningReportDimensions {
  totalArea: number;
  pastureArea: number;
  reserveAndAPP: number;
  agricultureLeased: number;
  forageProduction: number;
  infrastructure: number;
  agricultureOwned: number;
  otherCrops: number;
  otherArea: number;
}

export interface AgilePlanningReportAssets {
  propertyValue: number;
  herdValue: number;
  operationPecuary: number;
  operationAgricultural: number;
  agricultureVariationPercent: number;
  commercializesGenetics: boolean;
}

export interface HerdCompositionRow {
  categoria: string;
  quantidadeCabecas: number;
  tempoMeses: number;
  rebanhoMedio: number;
  pesoVivoKg: number;
}

export interface AgilePlanningReportHerdComposition {
  rows: HerdCompositionRow[];
  totalRebanhoMedio: number;
  totalPesoVivoKg: number;
}

export interface AgilePlanningReportZootechnical {
  rebanhoMedio: number;
  totalUAs: number;
  pesoMedio: number;
  pesoMedioUA: number;
  lotacaoUA: number;
  lotacaoCabecas: number;
  /** Only for Cria / Ciclo Completo */
  reproductive?: {
    fertilidade: number;
    fertilidadeRef: string;
    perdaPreParto: number;
    perdaPrePartoRef: string;
    mortalidadeBezerros: number;
    mortalidadeBezerrosRef: string;
    taxaDesmame: number;
    taxaDesmameRef: string;
  };
  /** Only for Ciclo Completo / Recria e Engorda */
  recriaTerminacao?: {
    gmdPosDesmame: number;
    gmdGlobal: number;
    lotacaoUaHa: number;
    lotacaoCabHa: number;
    producaoArrobaHa: number;
  };
  /** Highlight card */
  gmdGlobal: number;
  producaoArrobaHaAno: number;
}

export interface AgilePlanningReportFinancial {
  retornoValorTerra: number;
  retornoAtivoPecuario: number;
  /** Valor do rebanho calculado no planejamento (não do cadastro) */
  valorRebanhoCalculado: number;
  resultadoPorHectare: number;
  resultadoLiquidoTotal: number;
  receitaTotal: number;
  desembolsoTotal: number;
  margemSobreVenda: number;
  desembolsoPorArroba: number;
  desembolsoPorBezerro: number;
  desembolsoPorCabecaMes?: number;
  desembolsoMedioMensal: number;
  resultadoPorCabeca: number;
  /** % da @ para cada 100g de ganho. Desembolso/cab/mês ÷ (GMD×10) ÷ valor venda @. Só Recria/Ciclo. */
  pctArrobaPor100g?: number;
}

export interface AgilePlanningReportData {
  header: AgilePlanningReportHeader;
  dimensions: AgilePlanningReportDimensions;
  assets: AgilePlanningReportAssets;
  herdComposition: AgilePlanningReportHerdComposition;
  zootechnical: AgilePlanningReportZootechnical;
  financial: AgilePlanningReportFinancial;
  /** Which system to drive conditional sections */
  productionSystem: ProductionSystemLabel | '';
}
