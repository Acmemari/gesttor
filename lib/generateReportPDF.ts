import { jsPDF } from 'jspdf';
import { CattleCalculatorInputs, CalculationResults } from '../types';

interface PDFReportData {
  inputs: CattleCalculatorInputs;
  results: CalculationResults;
  scenarioName: string;
  createdAt?: string;
  userName?: string;
}

export interface ComparatorScenario {
  id: 'A' | 'B' | 'C';
  name: string;
  inputs: CattleCalculatorInputs;
  results: CalculationResults;
}

export interface ComparatorPDFData {
  scenarios: ComparatorScenario[];
  userName?: string;
  createdAt?: string;
}

export function generateReportPDF(data: PDFReportData): void {
  const { inputs, results, scenarioName, createdAt, userName } = data;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  let yPos = margin;

  // Helper function to add text with automatic wrapping
  const addText = (
    text: string,
    x: number,
    y: number,
    fontSize: number = 10,
    isBold: boolean = false,
    maxWidth?: number,
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    if (maxWidth) {
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, y);
      return lines.length * (fontSize * 0.4);
    } else {
      doc.text(text, x, y);
      return fontSize * 0.4;
    }
  };

  // Helper function to add a section header
  const addSectionHeader = (title: string, y: number): number => {
    yPos = y;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPos - 5, contentWidth, 8, 'F');
    const lineHeight = addText(title, margin + 2, yPos, 12, true);
    yPos += lineHeight + 2;
    return yPos;
  };

  // Helper function to format currency
  const formatCurrency = (value: number): string => {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Helper function to format percentage
  const formatPercent = (value: number): string => {
    return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  };

  // Title
  addText('Calculadora de Resultado Pecuário', margin, yPos, 16, true);
  yPos += 8;
  if (scenarioName) {
    addText(scenarioName, margin, yPos, 12, true);
    yPos += 6;
    if (userName) {
      addText(`Gerado por: ${userName}`, margin, yPos, 10);
      yPos += 5;
    }
  }
  if (createdAt) {
    addText(`Data: ${new Date(createdAt).toLocaleDateString('pt-BR')}`, margin, yPos, 8);
    yPos += 6;
  }
  yPos += 5;

  // PREMISSAS Section - Two columns
  yPos = addSectionHeader('PREMISSAS', yPos);

  const premissasData = [
    ['Peso de Compra:', `${inputs.pesoCompra} kg`],
    ['Valor de Compra:', `R$ ${inputs.valorCompra.toFixed(2)}/kg`],
    ['Peso Venda:', `${inputs.pesoAbate} kg`],
    ['Rend. Carcaça:', `${inputs.rendimentoCarcaca}%`],
    ['Valor Venda:', `R$ ${inputs.valorVenda}/@`],
    ['GMD (Ganho Médio Diário):', `${inputs.gmd} kg/dia`],
    ['Desembolso/cab/mês:', `R$ ${inputs.custoMensal}/mês`],
    ['Lotação:', `${inputs.lotacao} UA/HA`],
  ];

  // Split into two columns
  const midPoint = Math.ceil(premissasData.length / 2);
  const leftColumn = premissasData.slice(0, midPoint);
  const rightColumn = premissasData.slice(midPoint);
  const columnWidth = (contentWidth - 10) / 2;
  const lineHeight = 5;

  let startY = yPos;
  const maxRows = Math.max(leftColumn.length, rightColumn.length);

  for (let i = 0; i < maxRows; i++) {
    // Left column
    if (i < leftColumn.length) {
      const [label, value] = leftColumn[i];
      addText(label, margin + 5, startY + i * lineHeight, 9);
      addText(value, margin + 45, startY + i * lineHeight, 9, true);
    }

    // Right column
    if (i < rightColumn.length) {
      const [label, value] = rightColumn[i];
      addText(label, margin + columnWidth + 5, startY + i * lineHeight, 9);
      addText(value, margin + columnWidth + 45, startY + i * lineHeight, 9, true);
    }
  }

  yPos = startY + maxRows * lineHeight + 3;

  // INDICADORES CHAVE Section (4 cards in a single row)
  if (yPos > pageHeight - 50) {
    doc.addPage();
    yPos = margin;
  }
  yPos = addSectionHeader('INDICADORES CHAVE', yPos);

  const keyIndicators = [
    {
      label: 'Resultado por cabeça',
      value: formatCurrency(results.resultadoPorBoi),
      color: results.resultadoPorBoi >= 0 ? [34, 139, 34] : [220, 20, 60],
    },
    {
      label: 'TIR MENSAL',
      value: `${formatPercent(results.resultadoMensal)} a.m.`,
      color: results.resultadoMensal >= 0 ? [34, 139, 34] : [220, 20, 60],
    },
    {
      label: 'MARGEM %',
      value: formatPercent(results.margemVenda),
      color: results.margemVenda >= 0 ? [34, 139, 34] : [220, 20, 60],
    },
    {
      label: 'RESULTADO POR HECTARE',
      value: formatCurrency(results.resultadoPorHectareAno),
      color: results.resultadoPorHectareAno >= 0 ? [34, 139, 34] : [220, 20, 60],
    },
  ];

  // 4 blocks in a single row
  const cardWidth = (contentWidth - 15) / 4; // 4 cards with spacing
  const cardHeight = 25;
  const cardSpacing = 5;

  keyIndicators.forEach((indicator, index) => {
    const x = margin + index * (cardWidth + cardSpacing);
    const y = yPos;

    // Card background
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(x, y, cardWidth, cardHeight);

    // Label
    addText(indicator.label, x + 3, y + 6, 7, false, cardWidth - 6);

    // Value
    doc.setTextColor(indicator.color[0], indicator.color[1], indicator.color[2]);
    addText(indicator.value, x + 3, y + 14, 10, true, cardWidth - 6);
    doc.setTextColor(0, 0, 0);
  });

  yPos += cardHeight + 5;

  // ANÁLISE DETALHADA Section
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = margin;
  }
  yPos += 3; // Same spacing as other sections
  yPos = addSectionHeader('ANÁLISE DETALHADA', yPos);

  const detalhadaData = [
    ['Valor de Venda:', formatCurrency(results.valorBoi)],
    ['Desemb. Total:', formatCurrency(results.custoTotal)],
    ['Desemb./@ Produzida:', formatCurrency(results.custoPorArrobaProduzida)],
    ['Desemb./@ Final:', formatCurrency(results.custoPorArrobaFinal)],
    ['Peso Final Arrobas:', `${results.pesoFinalArrobas.toFixed(2)} @`],
    ['Arrobas Produzidas:', `${results.arrobasProduzidas.toFixed(2)} @`],
    ['Permanência:', `${results.diasPermanencia.toFixed(0)} dias / ${results.mesesPermanencia.toFixed(1)} m`],
    ['Giro de Estoque:', formatPercent(results.giroEstoque)],
    ['Produção @/ha:', `${results.producaoArrobaPorHa.toFixed(2)} @/ha`],
    ['Resultado por @ Final:', formatCurrency(results.resultadoPorArrobaFinal)],
    ['Resultado/Ano:', `${formatPercent(results.resultadoAnual)} a.a.`],
  ];

  detalhadaData.forEach(([label, value]) => {
    addText(label, margin + 5, yPos, 9);
    addText(value, margin + 70, yPos, 9, true);
    yPos += 5;
  });
  yPos += 5;

  // MATRIZ DE SENSIBILIDADE Section
  if (yPos > pageHeight - 80) {
    doc.addPage();
    yPos = margin;
  }
  yPos = addSectionHeader('MATRIZ DE SENSIBILIDADE (Resultado/Boi R$)', yPos);

  // Generate sensitivity matrix data (using same logic as calculator)
  const variations = [-0.1, -0.05, 0, 0.05, 0.1];

  const matrixCols = variations.map(v => ({
    label: v === 0 ? 'Base' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
    valorVenda: inputs.valorVenda * (1 + v),
    variation: v,
  }));

  const matrixRows = variations.map(v => ({
    label: v === 0 ? 'Base' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
    valorCompra: inputs.valorCompra * (1 + v),
    variation: v,
  }));

  // Calculate matrix cells using the same logic as the calculator
  const matrixCells: number[][] = [];
  matrixRows.forEach(row => {
    const rowCells: number[] = [];
    matrixCols.forEach(col => {
      // Recalculate with variations (same logic as CattleProfitCalculator)
      const custoCompraVar = inputs.pesoCompra * row.valorCompra;
      const valorBoiVar = results.pesoFinalArrobas * col.valorVenda;
      const resultadoVar = valorBoiVar - custoCompraVar - results.custoOperacional;
      rowCells.push(resultadoVar);
    });
    matrixCells.push(rowCells);
  });

  // Find min and max for color coding
  const allValues = matrixCells.flat();
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  // Draw table
  const tableStartY = yPos;
  const cellWidth = (contentWidth - 30) / 6; // 1 for row header + 5 for columns
  const cellHeight = 8;
  const headerHeight = 15;

  // Header row
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, tableStartY, cellWidth, headerHeight, 'F');
  addText('Vl. Venda →', margin + 2, tableStartY + 5, 7);
  addText('Vl. Compra ↓', margin + 2, tableStartY + 10, 7);

  matrixCols.forEach((col, colIndex) => {
    const x = margin + cellWidth + colIndex * cellWidth;
    const isBase = colIndex === 2;
    if (isBase) {
      doc.setFillColor(230, 240, 255);
    } else {
      doc.setFillColor(240, 240, 240);
    }
    doc.rect(x, tableStartY, cellWidth, headerHeight, 'F');
    addText(col.label, x + 2, tableStartY + 5, 7);
    addText(`R$ ${col.valorVenda.toFixed(0)}`, x + 2, tableStartY + 10, 7, true);
  });

  // Data rows
  matrixRows.forEach((row, rowIndex) => {
    const y = tableStartY + headerHeight + rowIndex * cellHeight;
    const isBase = rowIndex === 2;

    // Row header
    if (isBase) {
      doc.setFillColor(230, 240, 255);
    } else {
      doc.setFillColor(240, 240, 240);
    }
    doc.rect(margin, y, cellWidth, cellHeight, 'F');
    addText(row.label, margin + 2, y + 5, 7);
    addText(`R$ ${row.valorCompra.toFixed(1)}/kg`, margin + 2, y + 8, 6);

    // Matrix cells
    matrixCells[rowIndex].forEach((cell, colIndex) => {
      const x = margin + cellWidth + colIndex * cellWidth;
      const isBaseCell = rowIndex === 2 && colIndex === 2;

      // Color coding
      if (isBaseCell) {
        doc.setFillColor(230, 240, 255);
        doc.setDrawColor(70, 130, 180);
        doc.setLineWidth(1);
      } else {
        const intensity = (cell - minValue) / (maxValue - minValue);
        if (cell >= 0) {
          // Green gradient
          const green = Math.floor(200 + 55 * intensity);
          doc.setFillColor(240, green, 240);
        } else {
          // Red gradient
          const red = Math.floor(255 - 55 * Math.abs(intensity));
          doc.setFillColor(red + 15, 200, 200);
        }
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
      }
      doc.rect(x, y, cellWidth, cellHeight, 'FD');

      // Cell value
      const color = cell >= 0 ? [34, 139, 34] : [220, 20, 60];
      doc.setTextColor(color[0], color[1], color[2]);
      addText(cell.toFixed(0), x + 2, y + 6, 8, true);
      doc.setTextColor(0, 0, 0);
    });
  });

  // Footer
  const footerY = pageHeight - margin - 5;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('Gerado por Gesttor - Calculadora de Resultado Pecuário', pageWidth / 2, footerY, { align: 'center' });

  // Save PDF
  const fileName = scenarioName
    ? `relatorio-${scenarioName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`
    : `relatorio-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Build the comparator PDF document (shared logic for save and base64 export)
 */
function buildComparatorDoc(data: ComparatorPDFData): jsPDF {
  const { scenarios, userName, createdAt } = data;

  const winningScenario = scenarios.reduce((prev, curr) =>
    curr.results.resultadoPorHectareAno > prev.results.resultadoPorHectareAno ? curr : prev,
  );
  const scenarioA = scenarios.find(s => s.id === 'A')!;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  let yPos = margin;

  const addText = (
    text: string,
    x: number,
    y: number,
    fontSize: number = 10,
    isBold: boolean = false,
    maxWidth?: number,
    align: 'left' | 'center' | 'right' = 'left',
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    if (maxWidth) {
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, y, { align });
      return lines.length * (fontSize * 0.4);
    } else {
      doc.text(text, x, y, { align });
      return fontSize * 0.4;
    }
  };

  const formatCurrency = (value: number): string =>
    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatPercent = (value: number): string =>
    `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  // Usar cenário de referência: se o vencedor for A, comparar com a média dos outros; senão, com A
  const baselineScenario =
    winningScenario.id === 'A'
      ? scenarios.filter(s => s.id !== 'A').reduce(
          (acc, s) => ({
            resultadoPorHectareAno: acc.resultadoPorHectareAno + s.results.resultadoPorHectareAno,
            margemVenda: acc.margemVenda + s.results.margemVenda,
            resultadoMensal: acc.resultadoMensal + s.results.resultadoMensal,
            gmd: acc.gmd + s.inputs.gmd,
            count: acc.count + 1,
          }),
          { resultadoPorHectareAno: 0, margemVenda: 0, resultadoMensal: 0, gmd: 0, count: 0 },
        )
      : null;

  const calcPct = (winnerVal: number, baseVal: number): string => {
    if (baseVal === 0) return '+0.0%';
    const pct = (winnerVal / baseVal - 1) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  };

  const getBaseVal = (key: 'resultadoPorHectareAno' | 'margemVenda' | 'resultadoMensal' | 'gmd'): number => {
    if (baselineScenario && baselineScenario.count > 0) {
      return baselineScenario[key] / baselineScenario.count;
    }
    return key === 'gmd' ? scenarioA.inputs.gmd : (scenarioA.results as Record<string, number>)[key];
  };

  // --- 1. Header (Imagem 1): dark bar, GESTOR|INTTEGRA, subtitle, user/date right ---
  const headerHeight = 18;
  doc.setFillColor(15, 23, 42); // #0F172A slate-900
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  doc.setTextColor(255, 255, 255);
  // Logo circle + G
  doc.setFillColor(34, 197, 94); // green
  doc.circle(8, 9, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('G', 8, 9.5, { align: 'center' });

  addText('GESTOR | INTTEGRA', 16, 7, 11, true);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225); // slate-300
  addText('Análise de Cenários Pecuários', 16, 12, 8);

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  const rightText = userName ? `${userName}  •  ${dateStr}` : dateStr;
  addText(rightText, pageWidth - margin, 10, 9, false, 70, 'right');

  doc.setTextColor(0, 0, 0);
  yPos = headerHeight + 8;

  // --- 2. Winning Scenario (Imagem 2): badge + name + 4 cards with icons and % badges ---
  if (yPos > pageHeight - 70) {
    doc.addPage();
    yPos = margin;
  }

  doc.setFillColor(5, 150, 105); // #059669 emerald-600
  doc.roundedRect(pageWidth / 2 - 28, yPos, 56, 7, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  addText('CENÁRIO VENCEDOR', pageWidth / 2, yPos + 4.8, 9, true, 54, 'center');
  doc.setTextColor(0, 0, 0);
  yPos += 14; // Espaço extra para evitar sobreposição com o nome do cenário

  addText(winningScenario.name, pageWidth / 2, yPos, 14, true, contentWidth, 'center');
  yPos += 12;

  const cardWidth = (contentWidth - 15) / 4;
  const cardHeight = 32;
  const cardSpacing = 5;

  const winningCards = [
    {
      label: 'LUCRO/HA',
      value: formatCurrency(winningScenario.results.resultadoPorHectareAno),
      pctBadge: calcPct(winningScenario.results.resultadoPorHectareAno, getBaseVal('resultadoPorHectareAno')),
      icon: '$',
    },
    {
      label: 'MARGEM LÍQUIDA',
      value: formatPercent(winningScenario.results.margemVenda),
      pctBadge: calcPct(winningScenario.results.margemVenda, getBaseVal('margemVenda')),
      icon: '%',
    },
    {
      label: 'ROI MENSAL',
      value: formatPercent(winningScenario.results.resultadoMensal),
      pctBadge: calcPct(winningScenario.results.resultadoMensal, getBaseVal('resultadoMensal')),
      icon: 'chart',
    },
    {
      label: 'GMD (GANHO)',
      value: `${winningScenario.inputs.gmd.toFixed(2)} kg/dia`,
      pctBadge: calcPct(winningScenario.inputs.gmd, getBaseVal('gmd')),
      icon: 'scale',
    },
  ];

  winningCards.forEach((card, index) => {
    const x = margin + index * (cardWidth + cardSpacing);
    const y = yPos;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

    const isPositive = !card.pctBadge.startsWith('-');
    const badgeColor = isPositive ? [34, 197, 94] : [239, 68, 68];

    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    const badgeW = 18;
    doc.roundedRect(x + cardWidth - badgeW - 3, y + 3, badgeW, 5, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(card.pctBadge, x + cardWidth - badgeW / 2 - 3, y + 6.2, { align: 'center' });

    doc.setFillColor(241, 245, 249);
    doc.circle(x + 8, y + 10, 4, 'F');
    doc.setDrawColor(34, 197, 94);
    doc.setLineWidth(0.4);
    if (card.icon === 'chart') {
      // Ícone de tendência ascendente (linhas desenhadas)
      doc.line(x + 5.5, y + 12, x + 7, y + 10);
      doc.line(x + 7, y + 10, x + 8.5, y + 8.5);
      doc.line(x + 8.5, y + 8.5, x + 10, y + 7);
    } else if (card.icon === 'scale') {
      // Ícone de balança (GMD)
      doc.line(x + 5.5, y + 10, x + 10.5, y + 10); // barra horizontal
      doc.line(x + 8, y + 10, x + 8, y + 12.5); // haste central
      doc.line(x + 5.5, y + 10, x + 5.5, y + 11.5); // prato esq
      doc.line(x + 10.5, y + 10, x + 10.5, y + 11.5); // prato dir
    } else {
      doc.setTextColor(34, 197, 94);
      doc.setFontSize(8);
      doc.text(card.icon, x + 8, y + 10.5, { align: 'center' });
    }

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    addText(card.label, x + 5, y + 20, 7, false, cardWidth - 25); // cardWidth-25 para não sobrepor o badge
    doc.setTextColor(30, 41, 59);
    addText(card.value, x + 5, y + 28, 11, true, cardWidth - 10);
    doc.setTextColor(0, 0, 0);
  });

  yPos += cardHeight + 12;

  // --- 3. Matriz de Premissas (Imagem 3) ---
  if (yPos > pageHeight - 100) {
    doc.addPage();
    yPos = margin;
  }

  addText('Matriz de Premissas', margin, yPos, 12, true);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  addText('Valores baseados em cotações atuais de mercado', pageWidth - margin, yPos + 1, 8, false, 60, 'right');
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  const tableStartY = yPos;
  const itemColWidth = contentWidth * 0.4;
  const scenarioColWidth = (contentWidth - itemColWidth) / scenarios.length;
  const rowHeight = 6;
  const tableHeaderHeight = 9;

  doc.setFillColor(241, 245, 249); // #F1F5F9
  doc.rect(margin, tableStartY, itemColWidth, tableHeaderHeight, 'F');
  doc.setTextColor(100, 116, 139);
  addText('ITEM', margin + 4, tableStartY + 6, 8, true);
  doc.setTextColor(0, 0, 0);

  const scenarioColors = [[30, 64, 175], [34, 197, 94], [249, 115, 22]];
  scenarios.forEach((scenario, idx) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin + itemColWidth + idx * scenarioColWidth, tableStartY, scenarioColWidth, tableHeaderHeight, 'F');
    doc.setTextColor(scenarioColors[idx][0], scenarioColors[idx][1], scenarioColors[idx][2]);
    addText(scenario.name.toUpperCase(), margin + itemColWidth + idx * scenarioColWidth + scenarioColWidth / 2, tableStartY + 6, 8, true, scenarioColWidth - 4, 'center');
    doc.setTextColor(0, 0, 0);
  });

  yPos = tableStartY + tableHeaderHeight;

  const formatTableCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatTablePercent = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tableItems = [
    { label: 'Peso Compra (kg)', getValue: (s: ComparatorScenario) => `${s.inputs.pesoCompra}` },
    { label: 'Valor Compra (R$/kg)', getValue: (s: ComparatorScenario) => formatTableCurrency(s.inputs.valorCompra) },
    { label: 'Peso Venda (kg)', getValue: (s: ComparatorScenario) => `${s.inputs.pesoAbate}` },
    { label: 'Rend. Carcaça (%)', getValue: (s: ComparatorScenario) => `${s.inputs.rendimentoCarcaca}` },
    { label: 'Valor Venda (R$/@)', getValue: (s: ComparatorScenario) => formatTableCurrency(s.inputs.valorVenda) },
    { label: 'GMD (kg/dia)', getValue: (s: ComparatorScenario) => s.inputs.gmd.toFixed(1) },
    { label: 'Desembolso/Mês (R$)', getValue: (s: ComparatorScenario) => formatTableCurrency(s.inputs.custoMensal) },
    { label: 'Lotação (UA/ha)', getValue: (s: ComparatorScenario) => s.inputs.lotacao.toFixed(1) },
    { label: 'Lucro/Cabeça (R$)', getValue: (s: ComparatorScenario) => formatTableCurrency(s.results.resultadoPorBoi) },
    { label: 'Retorno Mensal (%)', getValue: (s: ComparatorScenario) => formatTablePercent(s.results.resultadoMensal) },
    { label: 'Margem Líquida (%)', getValue: (s: ComparatorScenario) => formatTablePercent(s.results.margemVenda) },
    { label: 'Resultado/Ha (R$)', getValue: (s: ComparatorScenario) => formatTableCurrency(s.results.resultadoPorHectareAno) },
  ];

  tableItems.forEach((item) => {
    if (yPos > pageHeight - 20) {
      doc.addPage();
      yPos = margin;
    }
    const rowY = yPos;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, rowY, pageWidth - margin, rowY);

    doc.setFillColor(255, 255, 255);
    doc.rect(margin, rowY, itemColWidth, rowHeight, 'F');
    addText(item.label, margin + 4, rowY + 4.5, 8, false, itemColWidth - 8);

    scenarios.forEach((scenario, idx) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(margin + itemColWidth + idx * scenarioColWidth, rowY, scenarioColWidth, rowHeight, 'F');
      addText(item.getValue(scenario), margin + itemColWidth + idx * scenarioColWidth + scenarioColWidth / 2, rowY + 4.5, 8, true, scenarioColWidth - 4, 'center');
    });
    yPos += rowHeight;
  });

  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  // --- 4. Charts (unchanged) ---
  const chartWidth = (contentWidth - 20) / 2;
  const chartHeight = 45.5;
  const chartSpacing = 8;

  const charts = [
    { title: 'MARGEM LÍQUIDA (%)', getValue: (s: ComparatorScenario) => s.results.margemVenda, format: formatPercent, maxValue: Math.max(...scenarios.map(s => s.results.margemVenda)) * 1.1 },
    { title: 'RESULTADO POR HECTARE (R$)', getValue: (s: ComparatorScenario) => s.results.resultadoPorHectareAno, format: formatCurrency, maxValue: Math.max(...scenarios.map(s => s.results.resultadoPorHectareAno)) * 1.1 },
    { title: 'LUCRO POR CABEÇA (R$)', getValue: (s: ComparatorScenario) => s.results.resultadoPorBoi, format: formatCurrency, maxValue: Math.max(...scenarios.map(s => s.results.resultadoPorBoi)) * 1.1 },
    { title: 'RETORNO MENSAL (%)', getValue: (s: ComparatorScenario) => s.results.resultadoMensal, format: formatPercent, maxValue: Math.max(...scenarios.map(s => s.results.resultadoMensal)) * 1.1 },
  ];

  let firstRowY = yPos;
  let secondRowY = firstRowY + chartHeight + chartSpacing;
  if (secondRowY + chartHeight > pageHeight - 15) {
    doc.addPage();
    firstRowY = margin;
    secondRowY = firstRowY + chartHeight + chartSpacing;
  }

  const colors = [[59, 130, 246], [34, 197, 94], [249, 115, 22]];
  charts.forEach((chart, chartIndex) => {
    const isSecondRow = chartIndex >= 2;
    const chartY = isSecondRow ? secondRowY : firstRowY;
    const chartX = margin + (chartIndex % 2) * (chartWidth + chartSpacing);
    addText(chart.title, chartX + chartWidth / 2, chartY, 8, true, chartWidth, 'center');
    const titleY = chartY + 5;
    const yAxisWidth = 18;
    const barWidth = (chartWidth - yAxisWidth - 10) / scenarios.length;
    const barSpacing = 4;
    const chartAreaHeight = chartHeight - 25;
    const chartAreaY = titleY + 5;
    const chartAreaX = chartX + yAxisWidth;
    const yAxisX = chartAreaX - 2;

    for (let i = 0; i <= 5; i++) {
      const ratio = i / 5;
      const value = chart.maxValue * ratio;
      const labelY = chartAreaY + chartAreaHeight - ratio * chartAreaHeight;
      const valueStr = i === 0 ? '0' : chart.format(value);
      addText(valueStr, yAxisX, labelY + 1.5, 5, false, 12, 'right');
    }
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(chartAreaX, chartAreaY, chartAreaX, chartAreaY + chartAreaHeight);

    scenarios.forEach((scenario, barIndex) => {
      const value = chart.getValue(scenario);
      const barHeight = (value / chart.maxValue) * chartAreaHeight;
      const barX = chartAreaX + 2 + barIndex * (barWidth + barSpacing);
      const barY = chartAreaY + chartAreaHeight - barHeight;
      doc.setFillColor(colors[barIndex][0], colors[barIndex][1], colors[barIndex][2]);
      doc.rect(barX, barY, barWidth, barHeight, 'F');
      doc.setTextColor(0, 0, 0);
      addText(chart.format(value), barX + barWidth / 2, barY - 2, 6, true, barWidth, 'center');
    });

    doc.setDrawColor(150, 150, 150);
    const xAxisStartX = chartAreaX + 2;
    const xAxisEndX = xAxisStartX + scenarios.length * (barWidth + barSpacing) - barSpacing;
    doc.line(xAxisStartX, chartAreaY + chartAreaHeight, xAxisEndX, chartAreaY + chartAreaHeight);

    scenarios.forEach((scenario, barIndex) => {
      const barX = chartAreaX + 2 + barIndex * (barWidth + barSpacing);
      addText(scenario.name, barX + barWidth / 2, chartAreaY + chartAreaHeight + 5, 5, false, barWidth, 'center');
    });
  });

  const footerY = pageHeight - margin - 5;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('Gerado por Gesttor - Calculadora de Resultado Pecuário', pageWidth / 2, footerY, { align: 'center' });

  return doc;
}

/**
 * Generate PDF report for Comparator (2 or 3 scenarios comparison)
 */
export function generateComparatorPDF(data: ComparatorPDFData): void {
  if (data.scenarios.length < 2 || data.scenarios.length > 3) {
    throw new Error('É necessário ter 2 ou 3 cenários para gerar o relatório comparativo');
  }
  const validIds = data.scenarios.length === 2 ? ['A', 'B'] : ['A', 'B', 'C'];
  if (!data.scenarios.every(s => s?.id && validIds.includes(s.id))) {
    throw new Error('IDs dos cenários inválidos (esperado A, B ou A, B, C)');
  }
  const doc = buildComparatorDoc(data);
  doc.save(`comparativo-cenarios-${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Generate PDF report for Comparator and return as base64 string
 */
export function generateComparatorPDFAsBase64(data: ComparatorPDFData): string {
  if (data.scenarios.length < 2 || data.scenarios.length > 3) {
    throw new Error('É necessário ter 2 ou 3 cenários para gerar o relatório comparativo');
  }
  const validIds = data.scenarios.length === 2 ? ['A', 'B'] : ['A', 'B', 'C'];
  if (!data.scenarios.every(s => s?.id && validIds.includes(s.id))) {
    throw new Error('IDs dos cenários inválidos (esperado A, B ou A, B, C)');
  }
  const doc = buildComparatorDoc(data);
  return doc.output('datauristring').split(',')[1];
}
