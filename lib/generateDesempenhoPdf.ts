import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface ColaboradorStats {
  pessoaId: string;
  nome: string;
  iniciais: string;
  concluidas: number;
  pendentes: number;
  total: number;
  eficiencia: number;
  status: 'Excelente' | 'Bom' | 'Regular';
}

export async function generateDesempenhoPdf(
  chartsEl: HTMLElement,
  colaboradores: ColaboradorStats[],
  periodoLabel: string,
) {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();  // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const margin = 16;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Painel de Desempenho', margin, 12);
  if (periodoLabel) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Período: ${periodoLabel}`, pageWidth - margin, 12, { align: 'right' });
  }

  // ── Capture charts as image ───────────────────────────────────────────────
  let chartsImgY = 24;
  try {
    const canvas = await html2canvas(chartsEl, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#f8fafc',
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');
    const aspectRatio = canvas.width / canvas.height;
    const imgW = pageWidth - margin * 2;
    const imgH = imgW / aspectRatio;
    const maxH = 100; // leave room for table
    const finalH = Math.min(imgH, maxH);
    doc.addImage(imgData, 'PNG', margin, chartsImgY, imgW, finalH);
    chartsImgY += finalH + 8;
  } catch {
    // If canvas fails, skip charts image and go straight to table
  }

  // ── Ranking Table ─────────────────────────────────────────────────────────
  const statusColors: Record<string, [number, number, number]> = {
    Excelente: [21, 128, 61],
    Bom:       [161, 98, 7],
    Regular:   [194, 65, 12],
  };

  autoTable(doc, {
    startY: chartsImgY,
    head: [['Colaborador', 'Concluídas', 'Pendentes', 'Eficiência', 'Status']],
    body: colaboradores.map(c => [
      c.nome,
      String(c.concluidas),
      String(c.pendentes),
      `${c.eficiencia}%`,
      c.status,
    ]),
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [148, 163, 184],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { halign: 'center', textColor: [22, 163, 74] },
      2: { halign: 'center', textColor: [234, 88, 12] },
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center' },
    },
    didDrawCell: (hookData) => {
      // Color the Status column text dynamically
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const rowIdx = hookData.row.index;
        const c = colaboradores[rowIdx];
        if (c) {
          const color = statusColors[c.status] ?? statusColors.Regular;
          hookData.doc.setTextColor(...color);
        }
      }
    },
    styles: { fontSize: 10, cellPadding: 5 },
    margin: { left: margin, right: margin },
    theme: 'plain',
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const today = new Date().toLocaleDateString('pt-BR');
  doc.text(`Gerado em ${today}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

  const filename = periodoLabel
    ? `desempenho-${periodoLabel.replace(/[\s\/–]/g, '_')}.pdf`
    : 'desempenho.pdf';
  doc.save(filename);
}
