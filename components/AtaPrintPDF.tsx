import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { AtaConteudo } from '../lib/api/atasClient';

// ─── Color Palette (matching ProjectPrintPDF) ────────────────────────────────
const C = {
  primary: '#1B2A4A',
  primaryLight: '#2C4470',
  accent: '#C8A96E',
  accentLight: '#E8D5B0',
  textDark: '#1a1a2e',
  textMedium: '#4a4a5a',
  textLight: '#7a7a8a',
  bgLight: '#F8F7F4',
  bgWhite: '#FFFFFF',
  border: '#E8E6E1',
  success: '#2D8B55',
  successBg: 'rgba(45,139,85,0.08)',
  warning: '#D4A017',
  warningBg: 'rgba(212,160,23,0.08)',
  info: '#2563EB',
  infoBg: 'rgba(37,99,235,0.06)',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: C.bgWhite,
    color: C.textDark,
    fontSize: 8.5,
    lineHeight: 1.5,
  },
  innerPage: {
    padding: '25px 38px 40px 38px',
    position: 'relative',
    height: '100%',
  },

  // ── Cover ──────────────────────────────────────────────────────────────────
  cover: {
    backgroundColor: C.primary,
    height: '100%',
    padding: '30px 45px',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  coverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverLogo: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coverLogoSpan: {
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 400,
    marginLeft: 8,
    fontSize: 8.5,
    letterSpacing: 1,
  },
  coverBadge: {
    backgroundColor: 'rgba(200,169,110,0.15)',
    border: '1px solid rgba(200,169,110,0.3)',
    padding: '5px 14px',
    borderRadius: 20,
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.accent,
  },
  coverCentral: {
    flex: 1,
    justifyContent: 'center',
  },
  coverDivider: {
    width: 55,
    height: 3,
    backgroundColor: C.accent,
    marginBottom: 22,
  },
  coverSubtitle: {
    fontSize: 8.5,
    fontWeight: 600,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: C.accent,
    marginBottom: 10,
  },
  coverTitle: {
    fontSize: 30,
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: -0.5,
    color: 'white',
  },
  coverTitleAccent: {
    color: C.accent,
  },
  coverDesc: {
    fontSize: 10,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 14,
    width: '80%',
  },
  coverMetrics: {
    flexDirection: 'row',
    marginTop: 40,
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: 25,
  },
  coverMetricFirst: {
    flex: 1,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    paddingRight: 20,
  },
  coverMetric: {
    flex: 1,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    paddingLeft: 20,
  },
  coverMetricLast: {
    flex: 1,
    paddingLeft: 20,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 3,
    color: 'white',
  },
  metricLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.4)',
  },
  coverFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: 25,
  },
  coverFooterLeft: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.3)',
    lineHeight: 1.7,
  },
  coverPeriod: {
    fontSize: 8,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'right',
  },
  coverPeriodDates: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
    textAlign: 'right',
  },

  // ── Inner Header / Footer ──────────────────────────────────────────────────
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottom: `2px solid ${C.primary}`,
    marginBottom: 18,
  },
  pageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageHeaderLogo: {
    fontSize: 9,
    fontWeight: 700,
    color: C.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pageHeaderSep: {
    width: 1,
    height: 16,
    backgroundColor: C.border,
    marginHorizontal: 10,
  },
  pageHeaderDoc: {
    fontSize: 7.5,
    color: C.textLight,
  },
  pageHeaderRight: {
    fontSize: 7,
    color: C.textLight,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 15,
    left: 38,
    right: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTop: `1px solid ${C.border}`,
    fontSize: 6.5,
    color: C.textLight,
  },

  // ── Section title ──────────────────────────────────────────────────────────
  sectionTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 15,
  },
  sectionTitleText: {
    fontSize: 12,
    fontWeight: 700,
    color: C.primary,
    marginRight: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },

  // ── Tables ─────────────────────────────────────────────────────────────────
  table: {
    width: '100%',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.primary,
    padding: '7px 10px',
  },
  tableHeaderText: {
    color: 'white',
    fontSize: 6.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '6px 10px',
    borderBottom: `1px solid ${C.border}`,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: C.bgLight,
  },
  tableCell: {
    fontSize: 7.5,
    color: C.textMedium,
  },
  tableCellBold: {
    fontSize: 7.5,
    fontWeight: 600,
    color: C.textDark,
  },

  // ── Badges ─────────────────────────────────────────────────────────────────
  badge: {
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 6.5,
    fontWeight: 600,
  },

  // ── Cards ──────────────────────────────────────────────────────────────────
  summaryBox: {
    backgroundColor: C.bgLight,
    borderLeft: `3px solid ${C.accent}`,
    padding: '12px 16px',
    borderRadius: 4,
    marginBottom: 16,
    fontSize: 8.5,
    color: C.textMedium,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bullet: {
    width: 12,
    fontSize: 7.5,
    color: C.accent,
    fontWeight: 700,
  },
  listText: {
    flex: 1,
    fontSize: 7.5,
    color: C.textMedium,
  },

  // ── Action items card ──────────────────────────────────────────────────────
  actionCard: {
    backgroundColor: C.bgWhite,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    marginBottom: 8,
    borderTop: `2.5px solid ${C.accent}`,
    padding: '10px 12px',
  },
  actionTitle: {
    fontSize: 7.5,
    fontWeight: 700,
    color: C.primary,
    marginBottom: 3,
  },
  actionMeta: {
    fontSize: 6.5,
    color: C.textLight,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDateBR(d: string | null | undefined): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function modalidadeBadge(mod: 'online' | 'presencial') {
  const isOnline = mod === 'online';
  return {
    backgroundColor: isOnline ? C.infoBg : C.successBg,
    color: isOnline ? C.info : C.success,
  };
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    'a fazer': 'A Fazer',
    'em andamento': 'Em Andamento',
    'pausada': 'Pausada',
    'concluída': 'Concluida',
  };
  return map[s] || s;
}

// ─── Document Component ──────────────────────────────────────────────────────
const AtaPrintPDF = ({ data }: { data: AtaConteudo }) => {
  const { metadata, participantes, atividadesConcluidas, atividadesPendentes, atividadesPlanejadas, resumoTranscricao } = data;

  const presentes = participantes.filter(p => p.presente);
  const now = new Date();
  const dateShort = now.toLocaleDateString('pt-BR');

  const InnerHeader = () => (
    <View style={styles.pageHeader} fixed>
      <View style={styles.pageHeaderLeft}>
        <Text style={styles.pageHeaderLogo}>Gesttor Inttegra</Text>
        <View style={styles.pageHeaderSep} />
        <Text style={styles.pageHeaderDoc}>Ata de Reuniao — Semana {metadata.semanaFechada}/{metadata.semanaAberta}</Text>
      </View>
      <Text style={styles.pageHeaderRight}>{dateShort}</Text>
    </View>
  );

  const InnerFooter = () => (
    <View style={styles.pageFooter} fixed>
      <Text style={{ color: C.accent }}>[ Confidencial ] Documento de uso interno</Text>
      <Text>Gesttor Inttegra — Ata Semanal</Text>
      <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} de ${totalPages}`} />
    </View>
  );

  return (
    <Document title={`Ata Reuniao Semana ${metadata.semanaFechada}-${metadata.semanaAberta}`}>
      {/* ── PAGE 1: COVER ──────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <View style={styles.coverHeader}>
            <View style={styles.coverLogo}>
              <Text>Gesttor Inttegra</Text>
              <Text style={styles.coverLogoSpan}>| Advisory</Text>
            </View>
            <View style={styles.coverBadge}>
              <Text>Confidencial</Text>
            </View>
          </View>

          <View style={styles.coverCentral}>
            <View style={styles.coverDivider} />
            <Text style={styles.coverSubtitle}>Ata de Reuniao Semanal</Text>
            <Text style={styles.coverTitle}>Semana {metadata.semanaFechada}</Text>
            <Text style={[styles.coverTitle, styles.coverTitleAccent]}>Semana {metadata.semanaAberta}</Text>
            <Text style={styles.coverDesc}>
              Relatorio da reuniao de transicao entre a semana {metadata.semanaFechada} e a semana {metadata.semanaAberta}.
              {metadata.farmName ? ` ${metadata.farmName}.` : ''}
            </Text>

            <View style={styles.coverMetrics}>
              <View style={styles.coverMetricFirst}>
                <Text style={styles.metricValue}>{presentes.length}</Text>
                <Text style={styles.metricLabel}>Participantes</Text>
              </View>
              <View style={styles.coverMetric}>
                <Text style={styles.metricValue}>{atividadesConcluidas.length}</Text>
                <Text style={styles.metricLabel}>Concluidas</Text>
              </View>
              <View style={styles.coverMetric}>
                <Text style={styles.metricValue}>{atividadesPendentes.length}</Text>
                <Text style={styles.metricLabel}>Pendentes</Text>
              </View>
              <View style={styles.coverMetricLast}>
                <Text style={styles.metricValue}>{atividadesPlanejadas.length}</Text>
                <Text style={styles.metricLabel}>Planejadas</Text>
              </View>
            </View>
          </View>

          <View style={styles.coverFooter}>
            <View>
              <Text style={styles.coverFooterLeft}>Gesttor Inttegra — Ata Semanal</Text>
              <Text style={styles.coverFooterLeft}>Documento confidencial e de uso interno</Text>
            </View>
            <View>
              <Text style={styles.coverPeriod}>
                {formatDateBR(metadata.periodoFechada.inicio)} — {formatDateBR(metadata.periodoAberta.fim)}
              </Text>
              <Text style={styles.coverPeriodDates}>
                Reuniao em {formatDateBR(metadata.dataReuniao)}
              </Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ── PAGE 2: PARTICIPANTES + ATIVIDADES CONCLUIDAS ──────────────────── */}
      <Page size="A4" style={[styles.page, styles.innerPage]}>
        <InnerHeader />

        {/* Participantes */}
        <View style={styles.sectionTitleBox}>
          <Text style={styles.sectionTitleText}>Participantes da Reuniao</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { width: '60%' }]}>Nome</Text>
            <Text style={[styles.tableHeaderText, { width: '40%' }]}>Modalidade</Text>
          </View>
          {participantes.map((p, i) => (
            <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
              <Text style={[styles.tableCellBold, { width: '60%' }]}>{p.nome}</Text>
              <View style={{ width: '40%' }}>
                <Text style={[styles.badge, modalidadeBadge(p.modalidade)]}>
                  {p.modalidade === 'online' ? 'Online' : 'Presencial'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Atividades Concluidas */}
        {atividadesConcluidas.length > 0 && (
          <View wrap={false}>
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitleText}>Atividades Concluidas — Semana {metadata.semanaFechada}</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.table}>
              <View style={[styles.tableHeader, { backgroundColor: C.success }]}>
                <Text style={[styles.tableHeaderText, { width: '50%' }]}>Atividade</Text>
                <Text style={[styles.tableHeaderText, { width: '30%' }]}>Responsavel</Text>
                <Text style={[styles.tableHeaderText, { width: '20%' }]}>Tag</Text>
              </View>
              {atividadesConcluidas.map((a, i) => (
                <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.tableCellBold, { width: '50%' }]}>{a.titulo}</Text>
                  <Text style={[styles.tableCell, { width: '30%' }]}>{a.responsavel || '—'}</Text>
                  <Text style={[styles.tableCell, { width: '20%' }]}>{a.tag || '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Atividades Pendentes */}
        {atividadesPendentes.length > 0 && (
          <View wrap={false}>
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitleText}>Atividades Pendentes — Semana {metadata.semanaFechada}</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.table}>
              <View style={[styles.tableHeader, { backgroundColor: C.warning }]}>
                <Text style={[styles.tableHeaderText, { width: '40%' }]}>Atividade</Text>
                <Text style={[styles.tableHeaderText, { width: '25%' }]}>Responsavel</Text>
                <Text style={[styles.tableHeaderText, { width: '15%' }]}>Status</Text>
                <Text style={[styles.tableHeaderText, { width: '20%' }]}>Tag</Text>
              </View>
              {atividadesPendentes.map((a, i) => (
                <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.tableCellBold, { width: '40%' }]}>{a.titulo}</Text>
                  <Text style={[styles.tableCell, { width: '25%' }]}>{a.responsavel || '—'}</Text>
                  <Text style={[styles.tableCell, { width: '15%' }]}>{statusLabel(a.status)}</Text>
                  <Text style={[styles.tableCell, { width: '20%' }]}>{a.tag || '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <InnerFooter />
      </Page>

      {/* ── PAGE 3: ATIVIDADES PLANEJADAS ──────────────────────────────────── */}
      {atividadesPlanejadas.length > 0 && (
        <Page size="A4" style={[styles.page, styles.innerPage]}>
          <InnerHeader />

          <View style={styles.sectionTitleBox}>
            <Text style={styles.sectionTitleText}>Atividades Programadas — Semana {metadata.semanaAberta}</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.table}>
            <View style={[styles.tableHeader, { backgroundColor: C.info }]}>
              <Text style={[styles.tableHeaderText, { width: '40%' }]}>Atividade</Text>
              <Text style={[styles.tableHeaderText, { width: '25%' }]}>Responsavel</Text>
              <Text style={[styles.tableHeaderText, { width: '15%' }]}>Status</Text>
              <Text style={[styles.tableHeaderText, { width: '20%' }]}>Tag</Text>
            </View>
            {atividadesPlanejadas.map((a, i) => (
              <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
                <Text style={[styles.tableCellBold, { width: '40%' }]}>{a.titulo}</Text>
                <Text style={[styles.tableCell, { width: '25%' }]}>{a.responsavel || '—'}</Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>{statusLabel(a.status)}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>{a.tag || '—'}</Text>
              </View>
            ))}
          </View>

          <InnerFooter />
        </Page>
      )}

      {/* ── PAGE 4: RELATORIO DA REUNIAO (AI) ─────────────────────────────── */}
      {resumoTranscricao && (
        <Page size="A4" style={[styles.page, styles.innerPage]}>
          <InnerHeader />

          <View style={styles.sectionTitleBox}>
            <Text style={styles.sectionTitleText}>Relatorio da Reuniao</Text>
            <View style={styles.sectionLine} />
          </View>

          {/* Resumo */}
          <View style={styles.summaryBox}>
            <Text>{resumoTranscricao.sumario}</Text>
          </View>

          {/* Decisoes */}
          {resumoTranscricao.decisoes.length > 0 && (
            <View wrap={false} style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: C.primary, marginBottom: 8 }}>Decisoes Tomadas</Text>
              {resumoTranscricao.decisoes.map((d, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>{i + 1}.</Text>
                  <Text style={styles.listText}>{d}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Acoes */}
          {resumoTranscricao.acoes.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: C.primary, marginBottom: 8 }}>Acoes Definidas</Text>
              {resumoTranscricao.acoes.map((a, i) => (
                <View key={i} style={styles.actionCard} wrap={false}>
                  <Text style={styles.actionTitle}>{a.descricao}</Text>
                  <Text style={styles.actionMeta}>Responsavel: {a.responsavel} | Prazo: {a.prazo}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Estacionamento */}
          {resumoTranscricao.estacionamento.length > 0 && (
            <View wrap={false} style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: C.primary, marginBottom: 8 }}>Itens de Estacionamento</Text>
              {resumoTranscricao.estacionamento.map((item, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>-</Text>
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Riscos e Bloqueios */}
          {resumoTranscricao.riscosBlockers.length > 0 && (
            <View wrap={false} style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: C.primary, marginBottom: 8 }}>Riscos e Bloqueios</Text>
              {resumoTranscricao.riscosBlockers.map((r, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={[styles.bullet, { color: '#DC2626' }]}>!</Text>
                  <Text style={styles.listText}>{r}</Text>
                </View>
              ))}
            </View>
          )}

          <InnerFooter />
        </Page>
      )}

      {/* ── FOTOS ──────────────────────────────────────────────────────────── */}
      {data.fotos && data.fotos.length > 0 && (() => {
        const chunks: Array<typeof data.fotos> = [];
        for (let i = 0; i < data.fotos.length; i += 6) {
          chunks.push(data.fotos.slice(i, i + 6));
        }
        return chunks.map((chunk, ci) => (
          <Page key={`fotos-${ci}`} size="A4" style={[styles.page, styles.innerPage]}>
            <InnerHeader />
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitleText}>Registro Fotografico{chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ''}</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {chunk.map((foto, fi) => (
                <View key={fi} style={{ width: '48%', marginBottom: 14 }} wrap={false}>
                  <Image src={foto.url} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 4 }} />
                  <Text style={{ fontSize: 7.5, color: C.textMedium, marginTop: 4 }}>{foto.legenda || ''}</Text>
                </View>
              ))}
            </View>
            <InnerFooter />
          </Page>
        ));
      })()}

      {/* ── LAST PAGE: OBSERVACOES ─────────────────────────────────────────── */}
      <Page size="A4" style={[styles.page, styles.innerPage]}>
        <InnerHeader />

        <View style={styles.sectionTitleBox}>
          <Text style={styles.sectionTitleText}>Observacoes</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.summaryBox}>
          <Text>{data.observacoes || 'Nenhuma observacao registrada.'}</Text>
        </View>

        <View style={{ marginTop: 30, padding: 20, backgroundColor: C.bgLight, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <Text style={{ fontSize: 10, fontWeight: 700, color: C.primary, marginBottom: 8 }}>Aviso de Confidencialidade</Text>
          <Text style={{ fontSize: 7.5, color: C.textMedium }}>
            Este documento e de propriedade da Gesttor Inttegra e contem informacoes confidenciais e privilegiadas.
            A reproducao, distribuicao ou divulgacao total ou parcial deste material sem autorizacao previa por escrito e estritamente proibida.
          </Text>
        </View>

        <InnerFooter />
      </Page>
    </Document>
  );
};

// ─── Blob builder ────────────────────────────────────────────────────────────
const buildBlob = async (data: AtaConteudo): Promise<Blob> => {
  const doc = pdf();
  doc.updateContainer(<AtaPrintPDF data={data} />);
  return doc.toBlob();
};

export const generateAtaPdfBase64 = async (data: AtaConteudo): Promise<string> => {
  const blob = await buildBlob(data);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export const generateAtaPdf = async (data: AtaConteudo, semanaFechada: number, semanaAberta: number) => {
  const blob = await buildBlob(data);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `ata_reuniao_semana_${semanaFechada}_${semanaAberta}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export default AtaPrintPDF;
