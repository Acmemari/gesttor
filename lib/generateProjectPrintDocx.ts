import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
} from 'docx';
import type { ProjectPrintData } from './generateProjectPrint';
import { formatDateBR, formatMonthYearBR, getDurationLabel } from './dateFormatters';



export async function generateProjectPrintDocx(data: ProjectPrintData): Promise<Blob> {
  const { project, deliveries, initiativesByDeliveryId, userName } = data;

  const totalActs = Object.values(initiativesByDeliveryId).reduce((s, a) => s + a.length, 0);
  const stakeholders = project.stakeholder_matrix || [];
  const duration = getDurationLabel(project.start_date, project.end_date);
  const dateLong = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Common border for tables
  const borderSingle = { style: BorderStyle.SINGLE, size: 1, color: "E8E6E1" };
  const tableBorders = { top: borderSingle, bottom: borderSingle, left: borderSingle, right: borderSingle };

  const sections: any[] = [];

  // --- Capa (Cover Page) ---
  const coverChildren: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1440, after: 720 }, // 1 inch before
      children: [
        new TextRun({ text: "GESTTOR INTTEGRA", bold: true, size: 48, color: "C8A96E" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 2880 }, // 2 inches after
      children: [
        new TextRun({ text: "| Advisory", size: 24, color: "7A7A8A" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 360 },
      children: [
        new TextRun({ text: "PROJETO", bold: true, size: 24, color: "C8A96E" }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 720 },
      children: [
        new TextRun({ text: project.name || "Projeto", bold: true, size: 64, color: "1B2A4A" }),
      ],
    }),
  ];

  if (project.description) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 1440 },
        children: [
          new TextRun({ text: project.description, size: 20, color: "4A4A5A" }),
        ],
      })
    );
  }

  // Cover Metrics Table
  coverChildren.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2340, 2340, 2340, 2340],
      borders: { top: borderSingle, bottom: borderSingle, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: borderSingle, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
      rows: [
        new TableRow({
          children: [
            new TableCell({ width: { size: 2340, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 120, right: 120 }, children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(deliveries.length), bold: true, size: 36, color: "1B2A4A" })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ENTREGAS", size: 16, color: "7A7A8A" })] })
            ]}),
            new TableCell({ width: { size: 2340, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 120, right: 120 }, children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(totalActs), bold: true, size: 36, color: "1B2A4A" })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ATIVIDADES", size: 16, color: "7A7A8A" })] })
            ]}),
            new TableCell({ width: { size: 2340, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 120, right: 120 }, children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(stakeholders.length), bold: true, size: 36, color: "1B2A4A" })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "STAKEHOLDERS", size: 16, color: "7A7A8A" })] })
            ]}),
            new TableCell({ width: { size: 2340, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 120, right: 120 }, children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: duration.split(' ')[0], bold: true, size: 36, color: "1B2A4A" })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (duration.split(' ')[1] || 'MESES').toUpperCase(), size: 16, color: "7A7A8A" })] })
            ]})
          ]
        })
      ]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // --- Visão Geral (Overview) ---
  const overviewChildren: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Descrição do Projeto", color: "1B2A4A" })], spacing: { after: 240 } }),
  ];

  if (project.description) {
    overviewChildren.push(
      new Paragraph({ children: [new TextRun({ text: project.description, size: 20 })], spacing: { after: 360 } })
    );
  }

  if (project.transformations && project.transformations.length > 0) {
    overviewChildren.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Transformações Esperadas e Evidências de Sucesso", color: "1B2A4A" })], spacing: { before: 360, after: 240 } })
    );
    project.transformations.forEach((tr: { text: string; evidence: string[] }, tIdx: number) => {
      overviewChildren.push(
        new Paragraph({ children: [new TextRun({ text: `${tIdx + 1}. ${tr.text}`, size: 20, bold: true })], spacing: { after: 120 } })
      );
      const evs = (tr.evidence || []).filter((e: string) => e.trim());
      evs.forEach((ev: string, eIdx: number) => {
        overviewChildren.push(
          new Paragraph({ children: [new TextRun({ text: `   ${eIdx + 1}. ${ev}`, size: 20 })], spacing: { after: 80 }, indent: { left: 360 } })
        );
      });
    });
  } else if (project.transformations_achievements) {
    overviewChildren.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Transformações e Conquistas Esperadas", color: "1B2A4A" })], spacing: { before: 360, after: 240 } }),
      new Paragraph({ children: [new TextRun({ text: project.transformations_achievements, size: 20 })], spacing: { after: 360 } })
    );
    const evList = (project.success_evidence || []).filter((e: string) => e.trim());
    if (evList.length > 0) {
      overviewChildren.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Evidências de Sucesso", color: "1B2A4A" })], spacing: { before: 360, after: 240 } })
      );
      evList.forEach((ev: string, i: number) => {
        overviewChildren.push(
          new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${ev}`, size: 20 })], spacing: { after: 120 } })
        );
      });
    }
  }

  if (stakeholders.length > 0) {
    overviewChildren.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Matriz de Stakeholders", color: "1B2A4A" })], spacing: { before: 360, after: 240 } })
    );

    const stRows = stakeholders.map((s, i) => new TableRow({
      children: [
        new TableCell({ borders: tableBorders, width: { size: 4680, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? "FFFFFF" : "F8F7F4", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: s.name || '\u2014', size: 18, bold: true })] })] }),
        new TableCell({ borders: tableBorders, width: { size: 2340, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? "FFFFFF" : "F8F7F4", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: s.activity || '\u2014', size: 18 })] })] }),
        new TableCell({ borders: tableBorders, width: { size: 2340, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? "FFFFFF" : "F8F7F4", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: (s.activity || '').split(' ')[0], size: 18, color: "7A7A8A" })] })] }),
      ]
    }));

    overviewChildren.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 2340, 2340],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: tableBorders, shading: { fill: "1B2A4A", type: ShadingType.CLEAR }, width: { size: 4680, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "NOME", bold: true, size: 18, color: "FFFFFF" })] })] }),
              new TableCell({ borders: tableBorders, shading: { fill: "1B2A4A", type: ShadingType.CLEAR }, width: { size: 2340, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "ATIVIDADE / PAPEL", bold: true, size: 18, color: "FFFFFF" })] })] }),
              new TableCell({ borders: tableBorders, shading: { fill: "1B2A4A", type: ShadingType.CLEAR }, width: { size: 2340, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "CLASSIFICAÇÃO", bold: true, size: 18, color: "FFFFFF" })] })] }),
            ]
          }),
          ...stRows
        ]
      })
    );
  }

  overviewChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // --- Entregas (Deliveries) ---
  const deliveriesChildren: (Paragraph | Table)[] = [];
  if (deliveries.length > 0) {
    deliveriesChildren.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Entregas e Atividades", color: "1B2A4A" })], spacing: { after: 360 } })
    );

    deliveries.forEach((delivery, dIdx) => {
      const activities = initiativesByDeliveryId[delivery.id] || [];
      const dNum = `E${String(dIdx + 1).padStart(2, '0')}`;
      const dStart = formatDateBR(delivery.start_date);
      const dEnd = formatDateBR(delivery.end_date ?? delivery.due_date ?? null);
      const dDur = getDurationLabel(delivery.start_date, delivery.end_date ?? delivery.due_date ?? null);

      deliveriesChildren.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: "1B2A4A" },
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({ text: ` ${dNum} `, bold: true, size: 22, color: "C8A96E" }), // Removed yellow highlight, using accent color
            new TextRun({ text: `  ${delivery.name} `, bold: true, size: 22, color: "FFFFFF" }),
            new TextRun({ text: `  (${dStart} — ${dEnd} | ${dDur})`, size: 18, color: "E8E6E1" }),
          ]
        })
      );

      const dDesc = delivery.description || delivery.transformations_achievements || '';
      if (dDesc) {
        deliveriesChildren.push(
          new Paragraph({ children: [new TextRun({ text: dDesc, size: 18 })], spacing: { after: 240 } })
        );
      }

      if (activities.length > 0) {
        const actRows = activities.map(act => {
          const prog = act.progress ?? 0;
          let sLabel = 'Não Iniciado';
          if (prog === 100) sLabel = 'Concluído';
          else if (prog > 0) sLabel = 'Em Andamento';

          const period = `${formatMonthYearBR(act.start_date)} \u2014 ${formatMonthYearBR(act.end_date)}`;
          const leader = act.leader?.split(' ')[0] || '\u2014';

          return new TableRow({
            children: [
              new TableCell({ borders: tableBorders, width: { size: 3744, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: act.name, size: 16, bold: true })] })] }),
              new TableCell({ borders: tableBorders, width: { size: 1872, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: sLabel, size: 16 })] })] }),
              new TableCell({ borders: tableBorders, width: { size: 936, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: `${prog}%`, size: 16 })] })] }),
              new TableCell({ borders: tableBorders, width: { size: 1872, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: period, size: 16 })] })] }),
              new TableCell({ borders: tableBorders, width: { size: 936, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: leader, size: 16 })] })] }),
            ]
          });
        });

        deliveriesChildren.push(
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [3744, 1872, 936, 1872, 936],
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  new TableCell({ borders: tableBorders, shading: { fill: "F8F7F4", type: ShadingType.CLEAR }, width: { size: 3744, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "ATIVIDADE", bold: true, size: 16 })] })] }),
                  new TableCell({ borders: tableBorders, shading: { fill: "F8F7F4", type: ShadingType.CLEAR }, width: { size: 1872, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "STATUS", bold: true, size: 16 })] })] }),
                  new TableCell({ borders: tableBorders, shading: { fill: "F8F7F4", type: ShadingType.CLEAR }, width: { size: 936, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "PROGRESSO", bold: true, size: 16 })] })] }),
                  new TableCell({ borders: tableBorders, shading: { fill: "F8F7F4", type: ShadingType.CLEAR }, width: { size: 1872, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "PERIODO", bold: true, size: 16 })] })] }),
                  new TableCell({ borders: tableBorders, shading: { fill: "F8F7F4", type: ShadingType.CLEAR }, width: { size: 936, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "LÍDER", bold: true, size: 16 })] })] }),
                ]
              }),
              ...actRows
            ]
          })
        );
      } else {
        deliveriesChildren.push(
          new Paragraph({ children: [new TextRun({ text: "Nenhuma atividade vinculada a esta entrega.", size: 18, color: "7A7A8A" })] })
        );
      }
      deliveriesChildren.push(new Paragraph({ spacing: { after: 360 }, children: [] }));
    });
  }

  // Set up the document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Helvetica",
            size: 20, // 10pt
            color: "4A4A5A"
          }
        }
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 28, bold: true, color: "1B2A4A", font: "Helvetica" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
        }
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: `Gesttor Inttegra — Projeto (${dateLong})`, size: 16, color: "7A7A8A" })
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "[ Confidencial ] Documento de uso interno", size: 16, color: "C8A96E" })
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Página ", size: 16, color: "7A7A8A" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "7A7A8A" }),
                new TextRun({ text: " de ", size: 16, color: "7A7A8A" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "7A7A8A" }),
              ]
            })
          ]
        })
      },
      children: [
        ...coverChildren,
        ...overviewChildren,
        ...deliveriesChildren,
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Aviso de Confidencialidade", color: "1B2A4A" })], spacing: { after: 240 } }),
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: "F8F7F4" },
          spacing: { before: 120, after: 360 },
          children: [
            new TextRun({ text: "Este documento é de propriedade da Gesttor Inttegra e contém informações confidenciais e privilegiadas. A reprodução, distribuição ou divulgação total ou parcial deste material sem autorização prévia por escrito é estritamente proibida. O uso deste documento é restrito aos stakeholders identificados neste projeto." })
          ]
        }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Termos de Aceite e Assinaturas", color: "1B2A4A" })], spacing: { after: 240 } }),
        new Paragraph({
          spacing: { after: 960 },
          children: [
            new TextRun({ text: "Pelo presente termo, as partes abaixo identificadas aprovam o escopo, as entregas, as atividades e o cronograma estabelecidos neste Projeto, comprometendo-se com sua execução conforme as condições estipuladas." })
          ]
        }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [4200, 960, 4200], // Two columns of 4200 with a 960 (gap) in between
          borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 4200, type: WidthType.DXA }, children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "________________________________________________________" })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: "Gesttor Inttegra", bold: true, size: 16 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: userName || 'Consultoria e Advisory', size: 16, color: "7A7A8A" })] })
                ]}),
                new TableCell({ width: { size: 960, type: WidthType.DXA }, children: [new Paragraph("")] }),
                new TableCell({ width: { size: 4200, type: WidthType.DXA }, children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "________________________________________________________" })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: "Cliente", bold: true, size: 16 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Responsável pelo Projeto", size: 16, color: "7A7A8A" })] })
                ]}),
              ]
            })
          ]
        })
      ]
    }]
  });

  return Packer.toBlob(doc);
}
