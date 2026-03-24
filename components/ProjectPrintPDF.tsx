import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { ProjectRow } from '../lib/projects';
import type { DeliveryRow } from '../lib/deliveries';
import type { InitiativeWithProgress } from '../lib/initiatives';
import { formatDateBR, formatMonthYearBR, formatLongDateBR, getDurationLabel } from '../lib/dateFormatters';

export interface ProgramaImpressaoData {
  project: ProjectRow;
  deliveries: DeliveryRow[];
  initiativesByDeliveryId: Record<string, InitiativeWithProgress[]>;
  userName?: string;
}

// ─── Font Registration ────────────────────────────────────────────────────────
// Using standard fonts for reliability in react-pdf instead of custom woff2
// to ensure perfect rendering across all systems without complex loading.
// Reverted to default Helvetica to prevent excessive PDF payload sizes
// which causes errors when saving the document to the database.

// ─── Stylesheet matching the provided CSS ────────────────────────────────────
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
  warning: '#D4A017',
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
  
  // Cover
  cover: {
    backgroundColor: C.primary, // Fallback for gradient
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
    fontSize: 34,
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
  coverMetric: {
    flex: 1,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    paddingLeft: 20,
  },
  coverMetricFirst: {
    flex: 1,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    paddingRight: 20,
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
  
  // Inner Headers/Footers
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
  
  // General Sections
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
    marginLeft: 8,
    marginRight: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  descBox: {
    backgroundColor: C.bgLight,
    borderLeft: `3px solid ${C.accent}`,
    padding: '12px 16px',
    borderRadius: 4,
    marginBottom: 16,
    fontSize: 8.5,
    color: C.textMedium,
  },
  
  // Transforms
  tGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tCard: {
    width: '49%',
    backgroundColor: C.bgWhite,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
    borderTop: `2.5px solid ${C.accent}`,
  },
  tCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  tCardNum: {
    fontSize: 6.5,
    fontWeight: 600,
    color: C.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tCardTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: C.primary,
    marginTop: 2,
  },
  tCardItem: {
    fontSize: 7,
    color: C.textMedium,
    marginBottom: 4,
    paddingLeft: 8,
  },
  
  // Evidence
  evGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  evItem: {
    width: '32%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: '9px 10px',
    backgroundColor: C.bgLight,
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    marginBottom: 7,
  },
  evNum: {
    width: 20,
    height: 20,
    backgroundColor: C.primary,
    borderRadius: 10,
    color: C.accent,
    fontSize: 7,
    fontWeight: 700,
    textAlign: 'center',
    paddingTop: 5,
    marginRight: 8,
  },
  evText: {
    fontSize: 7,
    color: C.textMedium,
    flex: 1,
  },
  
  // Stakeholders
  stkTable: {
    width: '100%',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    marginBottom: 16,
  },
  stkHeader: {
    flexDirection: 'row',
    backgroundColor: C.primary,
    padding: '8px 14px',
  },
  stkHeaderText: {
    color: 'white',
    fontSize: 6.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stkRow: {
    flexDirection: 'row',
    padding: '8px 14px',
    borderBottom: `1px solid ${C.border}`,
    alignItems: 'center',
  },
  stkRowAlt: {
    backgroundColor: C.bgLight,
  },
  stkCell: {
    fontSize: 7.5,
    color: C.textMedium,
  },
  stkName: {
    fontWeight: 600,
    color: C.textDark,
  },
  roleBadge: {
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 6.5,
    fontWeight: 600,
  },
  
  // Deliveries
  eCard: {
    backgroundColor: C.bgWhite,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    marginBottom: 12,
    wrap: false,
  },
  eCardHead: {
    backgroundColor: C.primary,
    padding: '10px 16px',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eCardHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eCardNum: {
    backgroundColor: 'rgba(200,169,110,0.2)',
    color: C.accent,
    fontSize: 7,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 4,
    marginRight: 10,
  },
  eCardTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    color: 'white',
  },
  eCardPeriod: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 6.5,
  },
  eCardBody: {
    padding: '18px 16px 12px 16px', // Aumentado padding superior para dar respiro
  },
  eCardDesc: {
    fontSize: 7.5,
    color: C.textMedium,
    marginBottom: 10,
  },
  actTitle: {
    fontSize: 7.5,
    fontWeight: 700,
    color: C.primary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  
  // Activities Table
  actTable: {
    width: '100%',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
  },
  actHeader: {
    flexDirection: 'row',
    backgroundColor: C.bgLight,
    padding: '6px 8px',
    borderBottom: `1px solid ${C.border}`,
  },
  actHeaderText: {
    fontSize: 6,
    fontWeight: 600,
    textTransform: 'uppercase',
    color: C.textLight,
  },
  actRow: {
    flexDirection: 'row',
    padding: '6px 8px',
    borderBottom: `1px solid ${C.border}`,
    alignItems: 'center',
  },
  actCell: {
    fontSize: 7,
    color: C.textMedium,
  },
  
  // Statuses
  statusBadge: {
    padding: '2px 6px',
    borderRadius: 8,
    fontSize: 6,
    fontWeight: 600,
  },
  pbarContainer: {
    width: 55,
    height: 5,
    backgroundColor: '#E8E6E1',
    borderRadius: 3,
    marginRight: 6,
  },
  pbarFill: {
    height: '100%',
    borderRadius: 3,
  },
  
  // Last Page
  confBox: {
    backgroundColor: C.bgLight,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    padding: 20,
    marginBottom: 50,
  },
  confTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: C.primary,
    marginBottom: 8,
  },
  confText: {
    fontSize: 7.5,
    color: C.textMedium,
  },
  sigTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: C.primary,
    textAlign: 'center',
    marginBottom: 20,
  },
  sigGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sigItem: {
    width: '45%',
    marginBottom: 25,
    alignItems: 'center',
  },
  sigLine: {
    width: '100%',
    borderBottom: `1px solid ${C.textDark}`,
    height: 45,
    marginBottom: 5,
  },
  sigName: {
    fontSize: 8.5,
    fontWeight: 600,
    color: C.textDark,
  },
  sigRole: {
    fontSize: 7,
    color: C.textLight,
  },
});



// ─── Document Component ──────────────────────────────────────────────────────
const ProgramaImpressaoPDF = ({ data }: { data: ProgramaImpressaoData }) => {
  const { project, deliveries, initiativesByDeliveryId, userName } = data;

  const totalActivities = Object.values(initiativesByDeliveryId).reduce((s, arr) => s + arr.length, 0);
  const stakeholders = project.stakeholder_matrix || [];
  const duration = getDurationLabel(project.start_date, project.end_date);
  
  const now = new Date();
  const dateShort = now.toLocaleDateString('pt-BR');
  const dateLong = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  
  // Title splitting logic
  const pName = project.name || 'Programa de Trabalho';
  const words = pName.split(' ');
  const titleLine1 = words.length > 1 ? words[0] : pName;
  const titleLine2 = words.length > 1 ? words.slice(1).join(' ') : '';

  const periodStart = formatLongDateBR(project.start_date);
  const periodEnd = formatLongDateBR(project.end_date);

  // Render Page Header for inner pages
  const InnerHeader = () => (
    <View style={styles.pageHeader} fixed>
      <View style={styles.pageHeaderLeft}>
        <Text style={styles.pageHeaderLogo}>Gesttor Inttegra</Text>
        <View style={styles.pageHeaderSep} />
        <Text style={styles.pageHeaderDoc}>Programa de Trabalho — {project.name}</Text>
      </View>
      <Text style={styles.pageHeaderRight}>{dateShort}</Text>
    </View>
  );

  // Render Page Footer
  const InnerFooter = () => (
    <View style={styles.pageFooter} fixed>
      <Text style={{ color: C.accent }}>[ Confidencial ] Documento de uso interno</Text>
      <Text>Gesttor Inttegra — Programa de Trabalho</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );

  return (
    <Document title={`${project.name} - Programa de Trabalho`}>
      {/* PAGE 1: COVER */}
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
            <Text style={styles.coverSubtitle}>Programa de Trabalho</Text>
            <Text style={styles.coverTitle}>{titleLine1}</Text>
            {titleLine2 && <Text style={[styles.coverTitle, styles.coverTitleAccent]}>{titleLine2}</Text>}
            <Text style={styles.coverDesc}>{project.description || ''}</Text>

            <View style={styles.coverMetrics}>
              <View style={styles.coverMetricFirst}>
                <Text style={styles.metricValue}>{deliveries.length}</Text>
                <Text style={styles.metricLabel}>Entregas</Text>
              </View>
              <View style={styles.coverMetric}>
                <Text style={styles.metricValue}>{totalActivities}</Text>
                <Text style={styles.metricLabel}>Atividades</Text>
              </View>
              <View style={styles.coverMetric}>
                <Text style={styles.metricValue}>{stakeholders.length}</Text>
                <Text style={styles.metricLabel}>Stakeholders</Text>
              </View>
              <View style={styles.coverMetricLast}>
                <Text style={styles.metricValue}>{duration.split(' ')[0]}</Text>
                <Text style={styles.metricLabel}>{duration.split(' ')[1] || 'Meses'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.coverFooter}>
            <View>
              <Text style={styles.coverFooterLeft}>Gesttor Inttegra — Programa de Trabalho</Text>
              <Text style={styles.coverFooterLeft}>Documento confidencial e de uso interno</Text>
            </View>
            <View>
              <Text style={styles.coverPeriod}>{periodStart} — {periodEnd}</Text>
              <Text style={styles.coverPeriodDates}>Gerado em {dateLong}{userName ? ` por ${userName}` : ''}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* PAGE 2: OVERVIEW */}
      <Page size="A4" style={[styles.page, styles.innerPage]}>
        <InnerHeader />
        
        {/* Descrição */}
        <View style={styles.sectionTitleBox}>
          <Text style={styles.sectionTitleText}>Descrição do Programa</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.descBox}>
          <Text>{project.description || 'Nenhuma descrição fornecida.'}</Text>
        </View>

        {/* Transformações */}
        {project.transformations_achievements && (
          <View wrap={false}>
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitleText}>Transformações e Conquistas Esperadas</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.descBox}>
               <Text>{project.transformations_achievements}</Text>
            </View>
          </View>
        )}

        {/* Evidências */}
        {project.success_evidence && project.success_evidence.filter(e => e.trim()).length > 0 && (
          <View wrap={false} style={{ marginTop: 10 }}>
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitleText}>Evidências de Sucesso</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.evGrid}>
              {project.success_evidence.filter(e => e.trim()).map((ev, i) => (
                <View key={i} style={styles.evItem} wrap={false}>
                  <Text style={styles.evNum}>{i + 1}</Text>
                  <Text style={styles.evText}>{ev}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Stakeholders */}
        {stakeholders.length > 0 && (
          <View wrap={false} style={{ marginTop: 10 }}>
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitleText}>Matriz de Stakeholders</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.stkTable}>
              <View style={styles.stkHeader}>
                <Text style={[styles.stkHeaderText, { width: '40%' }]}>Nome</Text>
                <Text style={[styles.stkHeaderText, { width: '40%' }]}>Atividade / Papel</Text>
                <Text style={[styles.stkHeaderText, { width: '20%' }]}>Classificação</Text>
              </View>
              {stakeholders.map((s, i) => {
                const roleLow = s.activity.toLowerCase();
                let bBg = 'rgba(122,122,138,0.1)', bCol = C.textLight;
                if (roleLow.includes('mentor')) { bBg = 'rgba(200,169,110,0.15)'; bCol = '#8B7340'; }
                else if (roleLow.includes('int') || roleLow.includes('interno')) { bBg = 'rgba(41,128,185,0.12)'; bCol = '#2471A3'; }
                else if (roleLow.includes('cons')) { bBg = 'rgba(142,68,173,0.12)'; bCol = '#7D3C98'; }
                else if (roleLow.includes('ext') || roleLow.includes('externo')) { bBg = 'rgba(45,139,85,0.12)'; bCol = '#1E8449'; }

                return (
                  <View key={i} style={[styles.stkRow, i % 2 !== 0 ? styles.stkRowAlt : {}]} wrap={false}>
                    <Text style={[styles.stkCell, styles.stkName, { width: '40%' }]}>{s.name}</Text>
                    <Text style={[styles.stkCell, { width: '40%' }]}>{s.activity}</Text>
                    <View style={{ width: '20%' }}>
                      <Text style={[styles.roleBadge, { backgroundColor: bBg, color: bCol }]}>{s.activity.split(' ')[0]}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <InnerFooter />
      </Page>

      {/* PAGE 3+: DELIVERIES */}
      {deliveries.length > 0 ? (
        <Page size="A4" style={[styles.page, styles.innerPage]}>
            <InnerHeader />
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitleText}>Entregas e Atividades</Text>
              <View style={styles.sectionLine} />
            </View>

            {deliveries.map((delivery, dIdx) => {
              const activities = initiativesByDeliveryId[delivery.id] || [];
              const dNum = `E${String(dIdx + 1).padStart(2, '0')}`;
              const dStart = formatDateBR(delivery.start_date);
              const dEnd = formatDateBR(delivery.end_date ?? delivery.due_date ?? null);
              const dDur = getDurationLabel(delivery.start_date, delivery.end_date ?? delivery.due_date ?? null);
              
              return (
                <View key={delivery.id} style={styles.eCard} wrap={false}>
                  <View style={styles.eCardHead}>
                    <View style={styles.eCardHeadLeft}>
                      <Text style={styles.eCardNum}>{dNum}</Text>
                      <Text style={styles.eCardTitle}>{delivery.name}</Text>
                    </View>
                    <Text style={styles.eCardPeriod}>{dStart} — {dEnd} | {dDur}</Text>
                  </View>
                  
                  <View style={styles.eCardBody}>
                    <Text style={styles.eCardDesc}>{delivery.description || delivery.transformations_achievements || ''}</Text>
                    
                    {activities.length > 0 ? (
                      <View>
                        <Text style={styles.actTitle}>Atividades ({activities.length})</Text>
                        <View style={styles.actTable}>
                          <View style={styles.actHeader}>
                            <Text style={[styles.actHeaderText, { width: '40%' }]}>Atividade</Text>
                            <Text style={[styles.actHeaderText, { width: '15%' }]}>Status</Text>
                            <Text style={[styles.actHeaderText, { width: '15%' }]}>Progresso</Text>
                            <Text style={[styles.actHeaderText, { width: '20%' }]}>Período</Text>
                            <Text style={[styles.actHeaderText, { width: '10%' }]}>Líder</Text>
                          </View>
                          {activities.map(act => {
                            const prog = act.progress ?? 0;
                            let sBg = 'rgba(122,122,138,0.1)', sCol = C.textLight, sTxt = 'Não Iniciado';
                            let pCol = '#D5D5D5';
                            
                            if (prog === 100) {
                              sBg = 'rgba(45,139,85,0.12)'; sCol = C.success; sTxt = 'Concluído'; pCol = C.success;
                            } else if (prog > 0) {
                              sBg = 'rgba(212,160,23,0.12)'; sCol = C.warning; sTxt = 'Em Andamento'; pCol = C.warning;
                            }

                            return (
                              <View key={act.id} style={styles.actRow} wrap={false}>
                                <Text style={[styles.actCell, { width: '40%', fontWeight: 600, color: C.textDark }]}>{act.name}</Text>
                                <View style={{ width: '15%' }}>
                                  <Text style={[styles.statusBadge, { backgroundColor: sBg, color: sCol }]}>{sTxt}</Text>
                                </View>
                                <View style={{ width: '15%', flexDirection: 'row', alignItems: 'center' }}>
                                  <View style={styles.pbarContainer}>
                                    <View style={[styles.pbarFill, { width: `${prog}%`, backgroundColor: pCol }]} />
                                  </View>
                                  <Text style={{ fontSize: 6, fontWeight: 600 }}>{prog}%</Text>
                                </View>
                                <Text style={[styles.actCell, { width: '20%', fontSize: 6.5 }]}>
                                  {formatMonthYearBR(act.start_date)} — {formatMonthYearBR(act.end_date)}
                                </Text>
                                <Text style={[styles.actCell, { width: '10%' }]}>
                                  {act.leader?.split(' ')[0] || '—'}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ) : (
                      <Text style={{ textAlign: 'center', fontSize: 7, color: C.textLight, fontStyle: 'italic', marginTop: 10 }}>
                        Nenhuma atividade vinculada a esta entrega.
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            <InnerFooter />
        </Page>
      ) : null}

      {/* LAST PAGE: ASSIGNMENTS & DISCLOSURE */}
      <Page size="A4" style={[styles.page, styles.innerPage]}>
        <InnerHeader />
        
        <View style={styles.confBox}>
          <Text style={styles.confTitle}>Aviso de Confidencialidade</Text>
          <Text style={styles.confText}>Este documento é de propriedade da Gesttor Inttegra e contém informações confidenciais e privilegiadas. A reprodução, distribuição ou divulgação total ou parcial deste material sem autorização prévia por escrito é estritamente proibida. O uso deste documento é restrito aos stakeholders identificados neste programa de trabalho.</Text>
        </View>

        <Text style={styles.sigTitle}>TERMOS DE ACEITE E ASSINATURAS</Text>
        
        <View style={styles.sigGrid}>
          {stakeholders.map((s, i) => (
            <View key={i} style={styles.sigItem} wrap={false}>
              <View style={styles.sigLine} />
              <Text style={styles.sigName}>{s.name}</Text>
              <Text style={styles.sigRole}>{s.activity}</Text>
            </View>
          ))}
        </View>

        <InnerFooter />
      </Page>
    </Document>
  );
};

// Shared blob builder — renders the PDF only once
const buildBlob = async (data: ProgramaImpressaoData): Promise<Blob> => {
  const doc = pdf();
  doc.updateContainer(<ProgramaImpressaoPDF data={data} />);
  return doc.toBlob();
};

// Fast ArrayBuffer → btoa (2-3x faster than FileReader)
export const generateProgramaImpressaoBase64 = async (data: ProgramaImpressaoData): Promise<string> => {
  const blob = await buildBlob(data);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export const generateProgramaImpressao = async (data: ProgramaImpressaoData) => {
  const blob = await buildBlob(data);
  const safeName = (data.project.name || 'programa').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `programa_trabalho_${safeName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
};
