import { jsPDF } from 'jspdf';
import type { InitiativeWithProgress } from './initiatives';

interface Metrics {
  total: number;
  avgProgress: number;
  atrasadas: number;
  milestones: { total: number; completed: number };
  milPct: number;
  byStatus: Record<string, number>;
  byLeader: Record<string, { count: number; avgProgress: number }>;
}

export interface DeliveryGroupPdf {
  title: string;
  dueDate: string | null;
  avgProgress: number;
  milestonesTotal: number;
  milestonesCompleted: number;
  initiatives: InitiativeWithProgress[];
}

export interface InitiativesOverviewPdfData {
  initiatives: InitiativeWithProgress[];
  metrics: Metrics;
  userName?: string;
  dateFrom?: string;
  dateTo?: string;
  deliveryGroups?: DeliveryGroupPdf[];
}

const STATUS_BAR_RGB: Record<string, [number, number, number]> = {
  'Em Andamento': [99, 102, 241],
  Concluído: [34, 197, 94],
  'Não Iniciado': [148, 163, 184],
  Atrasado: [239, 68, 68],
  Suspenso: [245, 158, 11],
};

const formatDateBR = (d: string | null): string => {
  if (!d) return '—';
  try {
    const date = new Date(`${d}T00:00:00`);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
};

function buildPdfDoc(data: InitiativesOverviewPdfData): jsPDF {
  const { initiatives, metrics, userName, dateFrom, dateTo, deliveryGroups } = data;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;
  const cw = pw - m * 2;
  let y = m;

  const text = (
    t: string,
    x: number,
    yy: number,
    size: number,
    weight: 'bold' | 'normal' = 'normal',
    color: [number, number, number] = [0, 0, 0],
    align: 'left' | 'center' | 'right' = 'left',
    maxW?: number,
  ) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', weight);
    doc.setTextColor(color[0], color[1], color[2]);
    if (maxW) {
      const lines = doc.splitTextToSize(t, maxW);
      doc.text(lines, x, yy, { align });
      return (lines.length as number) * size * 0.4;
    }
    doc.text(t, x, yy, { align });
    return size * 0.4;
  };

  const ensureSpace = (need: number) => {
    if (y + need > ph - 15) {
      doc.addPage();
      y = m;
    }
  };

  // ─── HEADER ───────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 22, 'F');

  text('Gesttor', m, 9, 16, 'bold', [255, 255, 255]);
  text('Relatório de Iniciativas — Visão Geral', m, 17, 9, 'normal', [203, 213, 225]);

  const dateStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  text(dateStr, pw - m, 9, 8, 'normal', [148, 163, 184], 'right');
  if (userName) {
    text(`Gerado por: ${userName}`, pw - m, 15, 7, 'normal', [148, 163, 184], 'right');
  }
  if (dateFrom || dateTo) {
    const periodLabel = `Período: ${formatDateBR(dateFrom ?? null)} - ${formatDateBR(dateTo ?? null)}`;
    text(periodLabel, pw - m, 20, 7, 'normal', [148, 163, 184], 'right');
  }

  y = 28;

  // ─── KPI CARDS ────────────────────────────────────────────────────
  const cardGap = 4;
  const cardW = (cw - cardGap * 3) / 4;
  const cardH = 22;

  const kpis = [
    { label: 'TOTAL INICIATIVAS', value: String(metrics.total), color: [99, 102, 241] as [number, number, number] },
    {
      label: 'PROGRESSO MÉDIO',
      value: `${metrics.avgProgress}%`,
      color: [34, 197, 94] as [number, number, number],
      bar: metrics.avgProgress,
    },
    {
      label: 'MARCOS ENTREGUES',
      value: `${metrics.milestones.completed}/${metrics.milestones.total}`,
      color: [16, 185, 129] as [number, number, number],
      bar: metrics.milPct,
    },
    { label: 'ATRASADAS', value: String(metrics.atrasadas), color: [239, 68, 68] as [number, number, number] },
  ];

  kpis.forEach((kpi, i) => {
    const x = m + i * (cardW + cardGap);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');

    text(kpi.label, x + 4, y + 7, 6, 'bold', [100, 116, 139]);
    text(kpi.value, x + 4, y + 15, 14, 'bold', kpi.color);

    if (kpi.bar !== undefined) {
      const barY = y + cardH - 4;
      const barW = cardW - 8;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(x + 4, barY, barW, 2, 1, 1, 'F');
      if (kpi.bar > 0) {
        doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.roundedRect(x + 4, barY, Math.max(1, (barW * Math.min(100, kpi.bar)) / 100), 2, 1, 1, 'F');
      }
    }
  });

  y += cardH + 8;

  // ─── STATUS + LÍDERES (SIDE BY SIDE) ──────────────────────────────
  ensureSpace(50);
  const halfW = (cw - 4) / 2;

  // Status
  const statusX = m;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(statusX, y, halfW, 50, 2, 2, 'FD');

  text('DISTRIBUIÇÃO POR STATUS', statusX + 5, y + 7, 7, 'bold', [30, 41, 59]);

  let sY = y + 13;
  const statusEntries = Object.entries(metrics.byStatus).sort(([, a], [, b]) => b - a);
  statusEntries.forEach(([status, count]) => {
    const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
    text(status, statusX + 5, sY, 7, 'normal', [51, 65, 85]);
    text(`${count} (${pct}%)`, statusX + halfW - 5, sY, 7, 'bold', [51, 65, 85], 'right');
    sY += 1.5;
    const barW = halfW - 10;
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(statusX + 5, sY, barW, 2.5, 1, 1, 'F');
    const rgb = STATUS_BAR_RGB[status] || [148, 163, 184];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(statusX + 5, sY, Math.max(1, (barW * pct) / 100), 2.5, 1, 1, 'F');
    sY += 6;
  });

  // Leaders
  const leaderX = m + halfW + 4;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(leaderX, y, halfW, 50, 2, 2, 'FD');

  text('DESEMPENHO POR LÍDER', leaderX + 5, y + 7, 7, 'bold', [30, 41, 59]);

  let lY = y + 13;
  const leaderEntries = Object.entries(metrics.byLeader).sort(([, a], [, b]) => b.avgProgress - a.avgProgress);
  leaderEntries.forEach(([leader, info]) => {
    text(leader, leaderX + 5, lY, 7, 'normal', [51, 65, 85]);
    text(`${info.count} inic. · ${info.avgProgress}%`, leaderX + halfW - 5, lY, 7, 'bold', [51, 65, 85], 'right');
    lY += 1.5;
    const barW = halfW - 10;
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(leaderX + 5, lY, barW, 2.5, 1, 1, 'F');
    doc.setFillColor(99, 102, 241);
    doc.roundedRect(leaderX + 5, lY, Math.max(1, (barW * info.avgProgress) / 100), 2.5, 1, 1, 'F');
    lY += 6;
  });

  y += 54;

  const cols = [
    { label: 'Iniciativa', w: 48 },
    { label: 'Líder', w: 28 },
    { label: 'Status', w: 24 },
    { label: 'Período', w: 36 },
    { label: 'Progresso', w: 26 },
    { label: 'Marcos', w: cw - 48 - 28 - 24 - 36 - 26 },
  ];
  const renderInitiativesTable = (items: InitiativeWithProgress[]) => {
    ensureSpace(16);
    doc.setFillColor(241, 245, 249);
    doc.rect(m, y, cw, 7, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(m, y + 7, m + cw, y + 7);

    let cx = m;
    cols.forEach(col => {
      text(col.label, cx + 2, y + 5, 6, 'bold', [100, 116, 139]);
      cx += col.w;
    });
    y += 7;

    items.forEach((init, idx) => {
      ensureSpace(8);

      const rowH = 7;
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(m, y, cw, rowH, 'F');
      }
      doc.setDrawColor(241, 245, 249);
      doc.line(m, y + rowH, m + cw, y + rowH);

      let rx = m;
      const name = init.name.length > 28 ? init.name.slice(0, 26) + '…' : init.name;
      text(name, rx + 2, y + 5, 6.5, 'normal', [30, 41, 59], 'left', cols[0].w - 4);
      rx += cols[0].w;

      const leader = (init.leader || '—').length > 16 ? (init.leader || '').slice(0, 14) + '…' : init.leader || '—';
      text(leader, rx + 2, y + 5, 6.5, 'normal', [51, 65, 85]);
      rx += cols[1].w;

      const st = init.status || 'Não Iniciado';
      const stShort = st.length > 14 ? st.slice(0, 12) + '…' : st;
      text(stShort, rx + 2, y + 5, 6, 'bold', STATUS_BAR_RGB[st] || [100, 116, 139]);
      rx += cols[2].w;

      text(
        `${formatDateBR(init.start_date)} - ${formatDateBR(init.end_date)}`,
        rx + 2,
        y + 5,
        5.5,
        'normal',
        [100, 116, 139],
      );
      rx += cols[3].w;

      const prog = init.progress ?? 0;
      const barPW = cols[4].w - 12;
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(rx + 2, y + 2.5, barPW, 2, 1, 1, 'F');
      if (prog > 0) {
        const prgColor: [number, number, number] =
          prog >= 100 ? [34, 197, 94] : prog >= 50 ? [99, 102, 241] : [245, 158, 11];
        doc.setFillColor(prgColor[0], prgColor[1], prgColor[2]);
        doc.roundedRect(rx + 2, y + 2.5, Math.max(1, (barPW * Math.min(100, prog)) / 100), 2, 1, 1, 'F');
      }
      text(`${prog}%`, rx + barPW + 4, y + 5, 6, 'bold', [30, 41, 59]);
      rx += cols[4].w;

      const milestones = init.milestones || [];
      const completedMil = milestones.filter(mm => mm.completed === true).length;
      text(`${completedMil}/${milestones.length}`, rx + 2, y + 5, 6.5, 'normal', [51, 65, 85]);
      y += rowH;
    });
  };

  ensureSpace(20);
  if (deliveryGroups && deliveryGroups.length > 0) {
    text('DETALHAMENTO POR ENTREGA', m, y + 4, 8, 'bold', [30, 41, 59]);
    y += 8;

    deliveryGroups.forEach((group, idx) => {
      ensureSpace(14);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(m, y, cw, 10, 2, 2, 'FD');
      text(`${idx + 1}. ${group.title}`, m + 3, y + 4.8, 7, 'bold', [30, 41, 59], 'left', cw - 70);
      if (group.dueDate) {
        text(`Prazo: ${formatDateBR(group.dueDate)}`, m + cw - 3, y + 4.8, 6.5, 'normal', [100, 116, 139], 'right');
      }
      text(
        `${group.initiatives.length} inic. • ${group.milestonesCompleted}/${group.milestonesTotal} marcos • ${group.avgProgress}% médio`,
        m + 3,
        y + 8,
        6,
        'normal',
        [100, 116, 139],
      );
      y += 12;
      renderInitiativesTable(group.initiatives);
      y += 5;
    });
  } else {
    text('DETALHAMENTO POR INICIATIVA', m, y + 4, 8, 'bold', [30, 41, 59]);
    y += 8;
    renderInitiativesTable(initiatives);
  }

  // ─── FOOTER (ALL PAGES) ───────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const fy = ph - 10;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(m, fy - 3, pw - m, fy - 3);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Gerado por Gesttor — Relatório de Iniciativas', m, fy);
    doc.text(`Página ${p} de ${pageCount}`, pw - m, fy, { align: 'right' });
  }

  return doc;
}

export function generateInitiativesOverviewPdf(data: InitiativesOverviewPdfData): void {
  const doc = buildPdfDoc(data);
  const safeName = `visao-geral-iniciativas-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(safeName);
}

export function generateInitiativesOverviewPdfAsBase64(data: InitiativesOverviewPdfData): string {
  const doc = buildPdfDoc(data);
  return doc.output('datauristring').split(',')[1] || '';
}
