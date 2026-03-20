import { jsPDF } from 'jspdf';
import type { ProjectRow } from './projects';
import type { DeliveryRow } from './deliveries';
import type { InitiativeWithTeam } from './initiatives';

export interface ProjectStructurePdfData {
  project: ProjectRow;
  deliveries: DeliveryRow[];
  initiativesByDeliveryId: Record<string, InitiativeWithTeam[]>;
  userName?: string;
}

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

const getDurationLabel = (startDate: string | null, endDate: string | null): string => {
  if (!startDate || !endDate) return 'Prazo em definição';
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 'Prazo em definição';
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
  if (diffDays < 30) return `${diffDays} dias previstos`;
  const months = Math.round((diffDays / 30) * 10) / 10;
  return `${months.toLocaleString('pt-BR')} meses previstos`;
};

const buildProjectStructurePdfDoc = (data: ProjectStructurePdfData): jsPDF => {
  const { project, deliveries, initiativesByDeliveryId, userName } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;
  const cw = pw - m * 2;
  let y = m;

  const COLORS = {
    slate800: [30, 41, 59] as const,
    slate600: [51, 65, 85] as const,
    slate500: [100, 116, 139] as const,
    slate400: [148, 163, 184] as const,
    border: [226, 232, 240] as const,
    softBg: [248, 250, 252] as const,
    tableBg: [241, 245, 249] as const,
  };

  const safeNum = (n: number, fallback: number) => (typeof n === 'number' && !Number.isNaN(n) ? n : fallback);
  const normalizeText = (v: unknown, fallback = '—'): string => {
    const raw = typeof v === 'string' ? v : String(v ?? '');
    const trimmed = raw.trim();
    return trimmed || fallback;
  };

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
    const safeSize = Math.max(1, Math.min(72, safeNum(size, 8)));
    const safeT = typeof t === 'string' ? t : String(t ?? '');
    doc.setFontSize(safeSize);
    doc.setFont('helvetica', weight);
    doc.setTextColor(color[0], color[1], color[2]);
    if (maxW != null && maxW > 0) {
      const lines = doc.splitTextToSize(safeT, Math.max(1, maxW));
      const safeLines = Array.isArray(lines) ? lines.filter(l => typeof l === 'string') : [safeT];
      if (safeLines.length > 0) doc.text(safeLines, x, yy, { align });
      return safeLines;
    }
    doc.text(safeT, x, yy, { align });
    return [safeT];
  };

  const ensureSpace = (need: number): boolean => {
    if (y + need > ph - 18) {
      doc.addPage();
      y = m;
      return true;
    }
    return false;
  };

  const splitLines = (value: string, maxWidth: number): string[] => {
    const lines = doc.splitTextToSize(value, Math.max(1, maxWidth));
    return Array.isArray(lines) ? lines.filter(line => typeof line === 'string') : [value];
  };

  const sectionTitle = (title: string) => {
    ensureSpace(8);
    text(title, m, y, 9, 'bold', [...COLORS.slate800]);
    y += 6;
  };

  const drawSeparator = () => {
    y += 3;
    ensureSpace(2);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(m, y, pw - m, y);
    y += 3;
  };

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 22, 'F');
  text('Gesttor', m, 9, 16, 'bold', [255, 255, 255]);
  text('Estrutura do Projeto — Relatório de planejamento', m, 17, 9, 'normal', [203, 213, 225]);
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
  y = 28;

  // Nome do projeto (hero)
  ensureSpace(14);
  text('Projeto selecionado', m, y, 7, 'bold', [...COLORS.slate500]);
  y += 5;
  const projectNameStr = normalizeText(project.name, 'Projeto sem nome');
  const projectNameLines = doc.splitTextToSize(projectNameStr, Math.max(1, cw));
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.slate800);
  const safeProjectNameLines = Array.isArray(projectNameLines)
    ? projectNameLines.filter(l => typeof l === 'string')
    : [projectNameStr];
  if (safeProjectNameLines.length > 0) doc.text(safeProjectNameLines, m, y);
  y += safeProjectNameLines.length * 6.4 + 6;

  // Cards de métricas
  ensureSpace(20);
  const cardH = 14;
  const cardGap = 4;
  const cardW = (cw - cardGap * 3) / 4;
  const cards = [
    { label: 'Período', value: `${formatDateBR(project.start_date)} — ${formatDateBR(project.end_date)}` },
    { label: 'Prazo previsto', value: getDurationLabel(project.start_date, project.end_date) },
    { label: 'Entregas', value: String(deliveries.length) },
    { label: 'Stakeholders', value: String(project.stakeholder_matrix?.length ?? 0) },
  ];
  const safeCardW = Math.max(10, cardW);
  cards.forEach((card, i) => {
    const x = m + i * (safeCardW + cardGap);
    doc.setDrawColor(...COLORS.border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, safeCardW, cardH, 2, 2, 'FD');
    text(card.label, x + 3, y + 4.7, 7, 'bold', [...COLORS.slate500]);
    const valStr = normalizeText(card.value, '—');
    const valLines = doc.splitTextToSize(valStr, Math.max(1, safeCardW - 6));
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.slate800);
    const safeValLines = Array.isArray(valLines) ? valLines.filter(l => typeof l === 'string') : [valStr];
    if (safeValLines.length > 0) doc.text(safeValLines, x + 3, y + 10);
  });
  y += cardH + 5;
  drawSeparator();

  // Conquistas esperadas
  sectionTitle('Transformações e conquistas esperadas');
  const trans = normalizeText(project.transformations_achievements, 'Não informado.');
  const transTextLines = splitLines(trans, cw - 8);
  const transBoxH = Math.max(12, transTextLines.length * 4 + 6);
  ensureSpace(transBoxH + 2);
  doc.setFillColor(...COLORS.softBg);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(m, y, cw, transBoxH, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.slate600);
  doc.text(transTextLines, m + 4, y + 5);
  y += transBoxH + 2;
  drawSeparator();

  // Evidências de sucesso
  sectionTitle('Evidências de sucesso');
  const evidence = project.success_evidence || [];
  if (evidence.length === 0) {
    text('Nenhuma evidência cadastrada.', m, y, 8, 'normal', [...COLORS.slate500]);
    y += 6;
  } else {
    evidence.forEach((item, idx) => {
      const itemStr = normalizeText(item, '—');
      const lines = splitLines(itemStr, cw - 7);
      const evidenceBlockH = Math.max(4.2, lines.length * 3.8);
      ensureSpace(evidenceBlockH + 1);
      text(`${idx + 1}.`, m, y, 8, 'bold', [...COLORS.slate500]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.slate600);
      doc.text(lines, m + 7, y);
      y += evidenceBlockH;
    });
    y += 2;
  }
  drawSeparator();

  // Stakeholders em tabela compacta
  sectionTitle('Matriz de stakeholders');
  const stakeholders = project.stakeholder_matrix || [];
  if (stakeholders.length === 0) {
    text('Nenhum stakeholder cadastrado.', m, y, 8, 'normal', [...COLORS.slate500]);
    y += 8;
  } else {
    const nameColW = cw * 0.38;
    const activityColW = cw - nameColW;
    ensureSpace(10);
    doc.setFillColor(...COLORS.tableBg);
    doc.setDrawColor(...COLORS.border);
    doc.rect(m, y, cw, 7, 'FD');
    text('Nome', m + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
    text('Atividade', m + nameColW + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
    y += 7;

    stakeholders.forEach(row => {
      const name = normalizeText(row.name);
      const activity = normalizeText(row.activity);
      const safeNameLines = splitLines(name, nameColW - 4);
      const safeActivityLines = splitLines(activity, activityColW - 4);
      const lineCount = Math.max(safeNameLines.length, safeActivityLines.length);
      const rowH = Math.max(6.5, lineCount * 3.6 + 1.5);
      const brokePage = ensureSpace(rowH + 1);
      if (brokePage) {
        doc.setFillColor(...COLORS.tableBg);
        doc.setDrawColor(...COLORS.border);
        doc.rect(m, y, cw, 7, 'FD');
        text('Nome', m + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
        text('Atividade', m + nameColW + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
        y += 7;
      }
      doc.setDrawColor(...COLORS.border);
      doc.rect(m, y, cw, rowH);
      doc.line(m + nameColW, y, m + nameColW, y + rowH);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.slate600);
      doc.text(safeNameLines, m + 2, y + 4);
      doc.text(safeActivityLines, m + nameColW + 2, y + 4);
      y += rowH;
    });
    y += 2;
  }
  drawSeparator();

  // Entregas + atividades + marcos
  sectionTitle('Entregas planejadas');

  if (deliveries.length === 0) {
    text('Este projeto ainda não possui entregas vinculadas.', m, y, 8, 'normal', [...COLORS.slate500]);
    y += 10;
  } else {
    deliveries.forEach((delivery, deliveryIndex) => {
      ensureSpace(22);
      doc.setDrawColor(...COLORS.border);
      doc.setFillColor(...COLORS.softBg);
      doc.roundedRect(m, y, cw, 9, 2, 2, 'FD');
      text(`${deliveryIndex + 1}. ${normalizeText(delivery.name)}`, m + 3, y + 5.7, 8, 'bold', [...COLORS.slate800]);
      text(
        `Prazo: ${formatDateBR(delivery.due_date ?? null)}`,
        pw - m - 3,
        y + 5.7,
        7,
        'normal',
        [...COLORS.slate500],
        'right',
      );
      y += 11;

      const scope =
        (typeof delivery.transformations_achievements === 'string' && delivery.transformations_achievements.trim()) ||
        (typeof delivery.description === 'string' && delivery.description.trim()) ||
        'Escopo da entrega não informado.';
      const safeScopeLines = splitLines(scope, cw - 10);
      const scopeH = Math.max(9, safeScopeLines.length * 3.8 + 3);
      ensureSpace(scopeH + 2);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...COLORS.border);
      doc.roundedRect(m + 2, y, cw - 4, scopeH, 1.5, 1.5, 'FD');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.slate600);
      doc.text(safeScopeLines, m + 5, y + 4);
      y += scopeH + 3;

      const deliveryInitiatives = initiativesByDeliveryId[delivery.id] || [];
      if (deliveryInitiatives.length === 0) {
        text('Nenhuma atividade vinculada a esta entrega.', m + 2, y, 7, 'normal', [...COLORS.slate500]);
        y += 7;
      } else {
        const nameColW = cw * 0.5;
        const periodColW = cw * 0.3;
        const progressColW = cw - nameColW - periodColW;
        ensureSpace(9);
        doc.setFillColor(...COLORS.tableBg);
        doc.setDrawColor(...COLORS.border);
        doc.rect(m, y, cw, 7, 'FD');
        text('Atividade', m + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
        text('Período', m + nameColW + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
        text('Progresso', m + nameColW + periodColW + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
        y += 7;

        deliveryInitiatives.forEach(init => {
          const initName = normalizeText(init.name);
          const initPeriod = `${formatDateBR(init.start_date)} — ${formatDateBR(init.end_date)}`;
          const initProgress = `${Math.round(safeNum(init.progress, 0))}%`;
          const safeNameLines = splitLines(initName, nameColW - 4);
          const safePeriodLines = splitLines(initPeriod, periodColW - 4);
          const safeProgressLines = splitLines(initProgress, progressColW - 4);
          const rowLineCount = Math.max(safeNameLines.length, safePeriodLines.length, safeProgressLines.length);
          const rowH = Math.max(6.5, rowLineCount * 3.6 + 1.5);
          const brokePage = ensureSpace(rowH + 3);
          if (brokePage) {
            doc.setFillColor(...COLORS.tableBg);
            doc.setDrawColor(...COLORS.border);
            doc.rect(m, y, cw, 7, 'FD');
            text('Atividade', m + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
            text('Período', m + nameColW + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
            text('Progresso', m + nameColW + periodColW + 2, y + 4.5, 7, 'bold', [...COLORS.slate500]);
            y += 7;
          }
          doc.setDrawColor(...COLORS.border);
          doc.rect(m, y, cw, rowH);
          doc.line(m + nameColW, y, m + nameColW, y + rowH);
          doc.line(m + nameColW + periodColW, y, m + nameColW + periodColW, y + rowH);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.slate600);
          doc.text(safeNameLines, m + 2, y + 4);
          doc.text(safePeriodLines, m + nameColW + 2, y + 4);
          doc.text(safeProgressLines, m + nameColW + periodColW + 2, y + 4);
          y += rowH + 1;

          const milestones = Array.isArray(init.milestones) ? init.milestones : [];
          if (milestones.length > 0) {
            milestones.forEach(milestone => {
              const milestoneLabel = `${normalizeText(milestone.title)} (${Math.round(safeNum(milestone.percent, 0))}%)${
                milestone.due_date ? ` — prazo: ${formatDateBR(milestone.due_date)}` : ''
              }`;
              const milestoneLines = splitLines(milestoneLabel, cw - 10);
              const milestoneH = Math.max(3.8, milestoneLines.length * 3.3);
              ensureSpace(milestoneH + 1.5);
              const done = milestone.completed === true;
              const circleX = m + 4;
              const circleY = y + 1.5;
              doc.setDrawColor(...COLORS.slate400);
              doc.setFillColor(...COLORS.slate500);
              doc.circle(circleX, circleY, 1.1, done ? 'FD' : 'D');
              doc.setFontSize(7);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(...COLORS.slate500);
              doc.text(milestoneLines, m + 7, y + 2.2);
              y += milestoneH;
            });
            y += 1;
          }
        });
      }

      if (deliveryIndex < deliveries.length - 1) {
        drawSeparator();
      }
    });
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const fy = ph - 10;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(m, fy - 3, pw - m, fy - 3);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Gerado por Gesttor — Estrutura do Projeto', m, fy);
    doc.text(`Página ${p} de ${pageCount}`, pw - m, fy, { align: 'right' });
  }

  return doc;
};

export function generateProjectStructurePdf(data: ProjectStructurePdfData): void {
  const doc = buildProjectStructurePdfDoc(data);
  const safeProjectName = data.project.name.replace(/[^a-z0-9\u00C0-\u024F]/gi, '-').slice(0, 40) || 'projeto';
  const fileName = `estrutura-projeto-${safeProjectName}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

export function generateProjectStructurePdfAsBase64(data: ProjectStructurePdfData): string {
  const doc = buildProjectStructurePdfDoc(data);
  return doc.output('datauristring').split(',')[1] || '';
}
