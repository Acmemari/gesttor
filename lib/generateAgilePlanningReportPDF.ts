import { jsPDF } from 'jspdf';
import type { AgilePlanningReportData } from './agilePlanningReportTypes';

const margin = 12;
const pageWidth = 210;
const contentWidth = pageWidth - margin * 2;

function addText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  fontSize: number = 10,
  isBold = false,
  maxWidth?: number,
): number {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', isBold ? 'bold' : 'normal');
  if (maxWidth) {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return lines.length * (fontSize * 0.4);
  }
  doc.text(text, x, y);
  return fontSize * 0.4;
}

function formatNum(n: number, decimals = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function formatCurrency(n: number, decimals = 0): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function checkNewPage(doc: jsPDF, yPos: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.height;
  if (yPos + needed > pageHeight - margin) {
    doc.addPage();
    return margin;
  }
  return yPos;
}

function buildAgilePlanningPdfDoc(data: AgilePlanningReportData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageHeight = doc.internal.pageSize.height;
  let yPos = margin;

  const { header, dimensions, assets, herdComposition, zootechnical, financial, productionSystem } = data;
  const location = [header.city, header.state, header.country].filter(Boolean).join(' - ');
  const totalOp = assets.operationPecuary + assets.operationAgricultural;
  const opPecuaryPct = totalOp > 0 ? (assets.operationPecuary / totalOp) * 100 : 0;

  // Header
  addText(doc, header.farmName.toUpperCase(), margin, yPos, 16, true, contentWidth);
  yPos += 7;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  addText(doc, location, margin, yPos, 9, false, contentWidth);
  yPos += 5;
  if (header.productionSystem) {
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(margin, yPos - 4, 45, 6, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    addText(doc, header.productionSystem.toUpperCase(), margin + 2, yPos, 8, true);
    doc.setTextColor(0, 0, 0);
    yPos += 8;
  }
  addText(doc, `Data do relatório: ${header.reportDate}`, margin, yPos, 8, false);
  yPos += 10;

  // DADOS DA FAZENDA E DIMENSÕES (texto primeiro, traço por baixo)
  yPos = checkNewPage(doc, yPos, 40);
  addText(doc, 'DADOS DA FAZENDA E DIMENSÕES', margin, yPos, 11, true);
  yPos += 2;
  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(0.8);
  doc.line(margin, yPos, margin + 80, yPos);
  yPos += 4;
  doc.setFontSize(9);
  addText(doc, `Área total: ${formatNum(dimensions.totalArea, 2)} ha`, margin, yPos, 9);
  addText(doc, `Área pastagem: ${formatNum(dimensions.pastureArea, 2)} ha`, margin + 50, yPos, 9);
  addText(doc, `Reserva e APP: ${formatNum(dimensions.reserveAndAPP, 2)} ha`, margin + 100, yPos, 9);
  yPos += 5;
  addText(doc, `Agric. arrendada: ${formatNum(dimensions.agricultureLeased, 2)} ha`, margin, yPos, 9);
  addText(doc, `Prod. volumoso: ${formatNum(dimensions.forageProduction, 2)} ha`, margin + 50, yPos, 9);
  addText(doc, `Infraestrutura: ${formatNum(dimensions.infrastructure, 2)} ha`, margin + 100, yPos, 9);
  yPos += 5;
  addText(doc, `Agric. própria: ${formatNum(dimensions.agricultureOwned, 2)} ha`, margin, yPos, 9);
  addText(doc, `Outras culturas: ${formatNum(dimensions.otherCrops, 2)} ha`, margin + 50, yPos, 9);
  addText(doc, `Outros: ${formatNum(dimensions.otherArea, 2)} ha`, margin + 100, yPos, 9);
  yPos += 12;

  // PATRIMÔNIO E ATIVOS (texto primeiro, traço por baixo)
  yPos = checkNewPage(doc, yPos, 35);
  addText(doc, '$ PATRIMÔNIO E ATIVOS', margin, yPos, 11, true);
  yPos += 2;
  doc.setDrawColor(34, 197, 94);
  doc.line(margin, yPos, margin + 60, yPos);
  yPos += 4;
  addText(doc, `Valor da propriedade: ${formatCurrency(assets.propertyValue)}`, margin, yPos, 9);
  if (assets.agricultureVariationPercent !== 0) {
    addText(doc, `Var. Valor Agricultura ${assets.agricultureVariationPercent > 0 ? '+' : ''}${assets.agricultureVariationPercent}%`, margin, yPos + 4, 8);
  }
  yPos += assets.agricultureVariationPercent !== 0 ? 10 : 6;
  addText(doc, `Valor do rebanho: ${formatCurrency(assets.herdValue)}`, margin, yPos, 9);
  addText(doc, `Comercializa Genética: ${assets.commercializesGenetics ? 'Sim' : 'Não'}`, margin, yPos + 4, 8);
  yPos += 10;
  addText(doc, `Op. pecuária: ${formatCurrency(assets.operationPecuary)}`, margin, yPos, 9);
  addText(doc, `Op. agrícola: ${formatCurrency(assets.operationAgricultural)}`, margin + 70, yPos, 9);
  yPos += 12;

  // COMPOSIÇÃO DO REBANHO META (texto primeiro, traço por baixo)
  if (herdComposition.rows.length > 0) {
    yPos = checkNewPage(doc, yPos, 50);
    addText(doc, 'COMPOSIÇÃO DO REBANHO META', margin, yPos, 11, true);
    yPos += 2;
    doc.setDrawColor(34, 197, 94);
    doc.line(margin, yPos, margin + 75, yPos);
    yPos += 4;
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, yPos, contentWidth, 6, 'F');
    addText(doc, 'Categoria', margin + 2, yPos + 4, 8, true);
    addText(doc, 'Qtd', margin + 90, yPos + 4, 8, true);
    addText(doc, 'Tempo (m)', margin + 110, yPos + 4, 8, true);
    addText(doc, 'Reb. médio', margin + 135, yPos + 4, 8, true);
    addText(doc, 'Peso (kg)', margin + 165, yPos + 4, 8, true);
    yPos += 6;
    herdComposition.rows.forEach(row => {
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      addText(doc, row.categoria, margin + 2, yPos + 4, 8, false, 85);
      addText(doc, String(row.quantidadeCabecas), margin + 90, yPos + 4, 8);
      addText(doc, formatNum(row.tempoMeses, 1), margin + 110, yPos + 4, 8);
      addText(doc, String(row.rebanhoMedio), margin + 135, yPos + 4, 8);
      addText(doc, String(row.pesoVivoKg), margin + 165, yPos + 4, 8);
      yPos += 5;
    });
    doc.setFillColor(30, 30, 30);
    doc.rect(margin, yPos, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    addText(doc, 'TOTAL GERAL', margin + 2, yPos + 4, 8, true);
    addText(doc, '-', margin + 90, yPos + 4, 8);
    addText(doc, '-', margin + 110, yPos + 4, 8);
    addText(doc, String(herdComposition.totalRebanhoMedio), margin + 135, yPos + 4, 8, true);
    addText(doc, String(herdComposition.totalPesoVivoKg), margin + 165, yPos + 4, 8, true);
    doc.setTextColor(0, 0, 0);
    yPos += 10;
  }

  // DESEMPENHO ZOOTÉCNICO (resumido) — texto primeiro, traço por baixo
  yPos = checkNewPage(doc, yPos, 45);
  addText(doc, 'DESEMPENHO ZOOTÉCNICO', margin, yPos, 11, true);
  yPos += 2;
  doc.setDrawColor(34, 197, 94);
  doc.line(margin, yPos, margin + 70, yPos);
  yPos += 4;
  addText(doc, `Rebanho médio: ${formatNum(zootechnical.rebanhoMedio)} cabeças`, margin, yPos, 9);
  addText(doc, `Total UAs: ${formatNum(zootechnical.totalUAs, 1)}`, margin + 55, yPos, 9);
  addText(doc, `Peso médio: ${formatNum(zootechnical.pesoMedio)} kg`, margin + 110, yPos, 9);
  yPos += 5;
  addText(doc, `GMD Global: ${Number(zootechnical.gmdGlobal || 0).toFixed(2)} kg/dia`, margin, yPos, 9);
  addText(doc, `Produção @/HA/ANO: ${formatNum(zootechnical.producaoArrobaHaAno, 2)}`, margin + 70, yPos, 9);
  if (zootechnical.reproductive) {
    yPos += 5;
    addText(doc, `Fertilidade: ${zootechnical.reproductive.fertilidade}% | Perda pré-parto: ${zootechnical.reproductive.perdaPreParto}% | Taxa desmame: ${zootechnical.reproductive.taxaDesmame}%`, margin, yPos, 8, false, contentWidth);
  }
  if (zootechnical.recriaTerminacao) {
    yPos += 5;
    addText(
      doc,
      `GMD Pós desmame: ${Number(zootechnical.recriaTerminacao.gmdPosDesmame || 0).toFixed(2)} kg/dia | Lotação: ${formatNum(zootechnical.recriaTerminacao.lotacaoUaHa, 2)} UA/ha | ${formatNum(zootechnical.recriaTerminacao.lotacaoCabHa, 2)} Cab/ha`,
      margin,
      yPos,
      8,
      false,
      contentWidth,
    );
  }
  yPos += 12;

  // ANÁLISE FINANCEIRA — texto primeiro, traço por baixo
  yPos = checkNewPage(doc, yPos, 55);
  addText(doc, '$ ANÁLISE FINANCEIRA CONSOLIDADA', margin, yPos, 11, true);
  yPos += 2;
  doc.setDrawColor(34, 197, 94);
  doc.line(margin, yPos, margin + 85, yPos);
  yPos += 4;
  addText(doc, `Retorno s/ valor da terra: ${financial.retornoValorTerra}%`, margin, yPos, 9);
  addText(doc, `Retorno s/ ativo pecuário: ${financial.retornoAtivoPecuario}%`, margin + 65, yPos, 9);
  yPos += 5;
  addText(doc, `Valor do rebanho (calculado): ${formatCurrency(financial.valorRebanhoCalculado)}`, margin, yPos, 9);
  yPos += 5;
  addText(doc, `Resultado por hectare: ${formatCurrency(financial.resultadoPorHectare)}`, margin, yPos, 9);
  yPos += 6;
  addText(doc, `Resultado líquido total: ${formatCurrency(financial.resultadoLiquidoTotal)}`, margin, yPos, 9);
  addText(doc, `Receita total: ${formatCurrency(financial.receitaTotal)}`, margin + 65, yPos, 9);
  yPos += 5;
  addText(doc, `Desembolso total: ${formatCurrency(financial.desembolsoTotal)}`, margin, yPos, 9);
  addText(doc, `Margem s/ venda: ${financial.margemSobreVenda}%`, margin + 65, yPos, 9);
  yPos += 5;
  addText(doc, `Desembolso/@: ${formatCurrency(financial.desembolsoPorArroba)}`, margin, yPos, 9);
  addText(
    doc,
    productionSystem === 'Recria e Engorda' || productionSystem === 'Ciclo Completo'
      ? `Desembolso/cabeça/mês: ${formatCurrency(financial.desembolsoPorCabecaMes || 0, 1)}`
      : `Desembolso/bezerro: ${formatCurrency(financial.desembolsoPorBezerro)}`,
    margin + 65,
    yPos,
    9,
  );
  yPos += 5;
  addText(doc, `Desembolso médio mensal: ${formatCurrency(financial.desembolsoMedioMensal)}`, margin, yPos, 9);
  addText(doc, `Resultado por cabeça: ${formatCurrency(financial.resultadoPorCabeca)}`, margin + 65, yPos, 9);
  if (financial.pctArrobaPor100g != null) {
    yPos += 5;
    addText(doc, `% @/100g: ${financial.pctArrobaPor100g}%`, margin, yPos, 9);
  }
  yPos += 10;

  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  addText(doc, `© ${new Date().getFullYear()} ${header.farmName.toUpperCase()} - GESTÃO DE ALTA PERFORMANCE | RELATÓRIO CONFIDENCIAL | SISTEMA: ${productionSystem || '-'}`, margin, pageHeight - margin, 8, false, contentWidth);

  return doc;
}

export function generateAgilePlanningReportPDF(data: AgilePlanningReportData): void {
  const doc = buildAgilePlanningPdfDoc(data);
  const fileName = `relatorio-planejamento-agil-${data.header.farmName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

export function generateAgilePlanningReportPDFAsBase64(data: AgilePlanningReportData): string {
  const doc = buildAgilePlanningPdfDoc(data);
  const parts = doc.output('datauristring').split(',');
  const base64 = parts[1];
  if (!base64) throw new Error('Falha ao gerar PDF: saída base64 vazia');
  return base64;
}
