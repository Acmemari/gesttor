import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QuestionnaireResultsData } from './questionnaireResults';
import { SavedQuestionnaire } from '../types';
import { logger } from './logger';

/** Cores por grupo (Gente, Gestão, Produção) - alinhado ao modelo do relatório */
const GROUP_COLORS_PDF: Record<
  string,
  { bar: [number, number, number]; bg: [number, number, number]; text: [number, number, number]; border?: boolean }
> = {
  Gente: { bar: [59, 130, 246], bg: [239, 246, 255], text: [29, 78, 216], border: true }, // Blue-500, Blue-50, Blue-700
  Gestão: { bar: [139, 92, 246], bg: [250, 245, 255], text: [126, 34, 206], border: true }, // Purple-500, Purple-50, Purple-700
  Produção: { bar: [34, 197, 94], bg: [240, 253, 244], text: [21, 128, 61], border: true }, // Green-500, Green-50, Green-700
};

export const generatePerformancePdf = (
  results: QuestionnaireResultsData,
  questionnaire: SavedQuestionnaire,
  insightsText: string | null,
  chartImages?: { operational: string | null; categorical: string | null; cards?: string | null },
  userName?: string,
) => {
  logger.debug('generatePerformancePdf: Iniciando com novo layout', { component: 'generatePerformancePdf' });

  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20; // 20mm margins requested

    const farmName = questionnaire.farm_name || 'Fazenda Desconhecida';
    const diagnosisDate = questionnaire.created_at
      ? new Date(questionnaire.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('pt-BR');

    // Helper function for text
    const addText = (
      text: string,
      x: number,
      y: number,
      size: number,
      weight: 'bold' | 'normal' = 'normal',
      color: [number, number, number] = [0, 0, 0],
      align: 'left' | 'center' | 'right' = 'left',
    ) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', weight);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(text, x, y, { align });
    };

    // --- PAGE 1: EXECUTIVE DASHBOARD ---

    // 1. Header (Compact High Performance Design - Reduced ~50%)
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 24, 'F');

    // Logo & Title
    addText('Gesttor', margin, 10, 18, 'bold', [255, 255, 255]);
    addText('Diagnóstico de Performance', margin, 18, 9, 'normal', [203, 213, 225]); // slate-300

    // Farm Info & User
    addText(farmName.toUpperCase(), pageWidth - margin - 40, 8, 10, 'bold', [255, 255, 255], 'right');
    addText(diagnosisDate, pageWidth - margin - 40, 13, 8, 'normal', [148, 163, 184], 'right'); // slate-400
    if (userName) {
      addText(`Gerado por: ${userName}`, pageWidth - margin - 40, 19, 7, 'normal', [148, 163, 184], 'right'); // slate-400
    }

    // Global Score Box (Compact)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - margin - 35, 3, 35, 18, 2, 2, 'F');

    // Inside Score Box
    addText('SCORE GLOBAL', pageWidth - margin - 17.5, 8, 6, 'bold', [100, 116, 139], 'center');
    addText(`${results.finalScore}`, pageWidth - margin - 17.5, 17, 16, 'bold', [34, 197, 94], 'center');
    doc.setFontSize(8);
    doc.text('%', pageWidth - margin - 5, 17);

    // 2. Summary Cards (Compact Horizontal Layout - Reduced ~50%)
    let yPos = 27; // Header(24) + 3mm gap
    const groupOrder = ['Gente', 'Gestão', 'Produção'] as const;
    const availableWidth = pageWidth - margin * 2;
    const cardGap = 5; // Reduced gap
    const cardWidth = (availableWidth - cardGap * 2) / 3;
    const cardHeight = 18; // Reduced height

    // Draw cards
    groupOrder.forEach((groupName, index) => {
      const g = results.byGroup[groupName];
      const score = g?.score ?? 0;
      const colors = GROUP_COLORS_PDF[groupName];
      const xPos = margin + index * (cardWidth + cardGap);

      // Card Bg
      doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.1);
      doc.roundedRect(xPos, yPos, cardWidth, cardHeight, 2, 2, 'FD');

      // Icon/Title
      addText(groupName.toUpperCase(), xPos + 5, yPos + 7, 8, 'bold', [30, 41, 59]);

      // Score
      addText(`${score}%`, xPos + cardWidth - 5, yPos + 7, 10, 'bold', colors.text, 'right');

      // Progress Bar
      const barW = cardWidth - 10;
      const barH = 2.5;
      const barY = yPos + 11;

      // Background track
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(xPos + 5, barY, barW, barH, 1, 1, 'F');

      // Fill
      doc.setFillColor(colors.bar[0], colors.bar[1], colors.bar[2]);
      const fillW = (barW * Math.min(100, Math.max(0, score))) / 100;
      if (fillW > 0) {
        doc.roundedRect(xPos + 5, barY, fillW, barH, 1, 1, 'F');
      }
    });

    // 3. Charts Section (Stacked Vertically)
    yPos += cardHeight + 10;

    // Title
    addText('Análise Visual', margin, yPos, 16, 'bold', [30, 41, 59]);
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos + 2, margin + 40, yPos + 2); // underline

    yPos += 15;

    if (chartImages && (chartImages.operational || chartImages.categorical)) {
      const centerX = pageWidth / 2;
      // Calculate available height for charts to fit on page 1
      // Increased space due to header reduction (55 -> 38, gain 17mm) and gap reduction (gain more)
      const footerY = pageHeight - margin - 10;
      const availableHeight = footerY - yPos;
      const maxChartHeight = availableHeight / 2 - 15; // 2 charts + labels + padding

      // Operational (Top)
      if (chartImages.operational) {
        addText('Equilíbrio Operacional', centerX, yPos, 12, 'bold', [71, 85, 105], 'center');
        yPos += 5;

        const props = doc.getImageProperties(chartImages.operational);
        let imgHeight = maxChartHeight;
        let imgWidth = (props.width * imgHeight) / props.height;

        // Ensure width fits
        const maxWidth = pageWidth - margin * 2;
        if (imgWidth > maxWidth) {
          imgWidth = maxWidth;
          imgHeight = (props.height * imgWidth) / props.width;
        }

        doc.addImage(chartImages.operational, 'PNG', centerX - imgWidth / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      }

      // Categorical (Bottom)
      if (chartImages.categorical) {
        // Check if we have enough space, otherwise new page (though goal is page 1)
        if (yPos + 40 > footerY) {
          doc.addPage();
          yPos = margin;
        }

        addText('Desempenho por Categoria', centerX, yPos, 12, 'bold', [71, 85, 105], 'center');
        yPos += 5;

        const props = doc.getImageProperties(chartImages.categorical);
        // Recalculate max height if we are on a new page, otherwise use potentially remaining space or same max
        // But user wants to fit on Page 1.

        let imgHeight = maxChartHeight;
        let imgWidth = (props.width * imgHeight) / props.height;

        const maxWidth = pageWidth - margin * 2;
        if (imgWidth > maxWidth) {
          imgWidth = maxWidth;
          imgHeight = (props.height * imgWidth) / props.width;
        }

        // If stacking pushed it too far down on page 1, we might need to shrink or it cuts off.
        // maxChartHeight calculation above attempts to prevent this.

        doc.addImage(chartImages.categorical, 'PNG', centerX - imgWidth / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      }
    }

    // --- PAGE 2: TECHNICAL DETAILS ---
    doc.addPage();
    yPos = margin;

    // Header Style for Page 2
    addText('Detalhamento Técnico', margin, yPos + 10, 18, 'bold', [30, 41, 59]);
    addText('Avaliação completa por ponto de controle e subgrupos', margin, yPos + 18, 10, 'normal', [100, 116, 129]);

    yPos += 25;

    // Table using autoTable
    const tableData = results.byCategory.map(c => [c.group, c.category, `${c.score}%`, c.status]);

    autoTable(doc, {
      startY: yPos,
      head: [['Grupo', 'Categoria', 'Score', 'Avaliação']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: 4,
      },
      styles: {
        fontSize: 10,
        cellPadding: 4,
        valign: 'middle',
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 }, // Grupo
        1: { cellWidth: 'auto' }, // Categoria
        2: { halign: 'center', cellWidth: 30, fontStyle: 'bold' }, // Score
        3: { halign: 'center', cellWidth: 40, fontStyle: 'bold' }, // Avaliação
      },
      margin: { left: margin, right: margin, bottom: 25 },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 3) {
          const status = data.cell.raw as string;
          if (status === 'Excelente' || status === 'Bom') {
            data.cell.styles.textColor = [22, 163, 74];
          } else if (status === 'Regular') {
            data.cell.styles.textColor = [234, 179, 8];
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 20;

    // AI Insights (if available, add after table)
    if (insightsText) {
      // Check if we need another page
      if (yPos > pageHeight - 50) {
        doc.addPage();
        yPos = margin + 10;
      }

      // Insights Box
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(margin, yPos, pageWidth - margin * 2, pageHeight - yPos - 30, 2, 2, 'FD');

      addText('Análise e Recomendações (IA)', margin + 10, yPos + 15, 14, 'bold', [51, 65, 85]);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);

      const maxTextWidth = pageWidth - margin * 2 - 20;
      const splitText = doc.splitTextToSize(insightsText, maxTextWidth);
      doc.text(splitText, margin + 10, yPos + 25);
    }

    // --- FOOTER (All Pages) ---
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      const footerY = pageHeight - 12;

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400

      doc.text('Documento gerado eletronicamente para fins de desenvolvimento estratégico © 2026', margin, footerY);

      doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, footerY, { align: 'right' });
    }

    // Save
    const filename = `Diagnostico_${farmName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    logger.info('PDF salvo com sucesso', { component: 'generatePerformancePdf' });
  } catch (error: unknown) {
    logger.error('Erro em generatePerformancePdf', error instanceof Error ? error : new Error(String(error)), {
      component: 'generatePerformancePdf',
    });
    throw error;
  }
};
