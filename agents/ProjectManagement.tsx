import React, { useMemo, useState } from 'react';
import { AlertTriangle, Columns3, Network, FileText, Download, Save, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyst } from '../contexts/AnalystContext';
import { useClient } from '../contexts/ClientContext';
import { useFarm } from '../contexts/FarmContext';
import ProgramaWorkbench from '../components/ProgramaWorkbench';
import EAPMindMap from '../components/EAPMindMap';
import ProgramaDocumento from '../components/ProgramaDocumento';
import { loadFullEAPTree } from '../lib/eapTree';
import type { DeliveryRow } from '../lib/deliveries';
import type { InitiativeWithProgress } from '../lib/initiatives';
import { generateProgramaImpressao, generateProgramaImpressaoBase64 } from '../lib/generateProgramaImpressao';
import { generateProgramaImpressaoDocx } from '../lib/generateProgramaImpressaoDocx';
import { saveReportPdf } from '../lib/scenarios';

type ViewMode = 'columns' | 'mindmap' | 'document';

interface ProjectManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const ProjectManagement: React.FC<ProjectManagementProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedAnalyst } = useAnalyst();
  const { selectedClient } = useClient();
  const { selectedFarm } = useFarm();
  const [viewMode, setViewMode] = useState<ViewMode>('columns');

  const isAdmin = user?.role === 'admin';
  const isCliente = user?.qualification === 'cliente';
  const effectiveUserId = useMemo(
    () => (isAdmin && selectedAnalyst ? selectedAnalyst.id : user?.id),
    [isAdmin, selectedAnalyst, user?.id],
  );

  const [isExporting, setIsExporting] = useState<'download_pdf' | 'download_word' | 'save' | null>(null);
  const [showFormatModal, setShowFormatModal] = useState(false);

  const handleExport = async (mode: 'download_pdf' | 'download_word' | 'save') => {
    if (!effectiveUserId || isExporting) return;
    const userId = effectiveUserId; // narrowed — guaranteed string
    setIsExporting(mode);
    try {
      const tree = await loadFullEAPTree(userId, {
        organizationId: selectedClient?.id ?? undefined,
        farmId: selectedFarm?.id ?? undefined,
        clientMode: isCliente,
      });
      const programNodes = tree.filter(n => n.level === 'program');

      if (programNodes.length === 0) {
        onToast?.('Nenhum programa encontrado para exportar.', 'warning');
        return;
      }

      for (const programNode of programNodes) {
        const project = programNode.data.project!;
        const deliveries: DeliveryRow[] = [];
        const initiativesByDeliveryId: Record<string, InitiativeWithProgress[]> = {};

        for (const deliveryNode of programNode.children) {
          if (deliveryNode.level !== 'delivery') continue;
          const delivery = deliveryNode.data.delivery!;
          deliveries.push(delivery);
          initiativesByDeliveryId[delivery.id] = deliveryNode.children
            .filter(n => n.level === 'activity')
            .map(n => n.data.initiative!);
        }

        const pdfData = {
          project,
          deliveries,
          initiativesByDeliveryId,
          userName: user?.full_name ?? user?.email ?? undefined,
        };

        if (mode === 'download_pdf') {
          await generateProgramaImpressao(pdfData);
        } else if (mode === 'download_word') {
          const blob = await generateProgramaImpressaoDocx(pdfData);
          const safeName = (project.name || 'programa').replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const url = URL.createObjectURL(blob);
          try {
            const a = document.createElement('a');
            a.href = url;
            a.download = `programa_trabalho_${safeName}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } finally {
            URL.revokeObjectURL(url);
          }
        } else {
          const base64 = await generateProgramaImpressaoBase64(pdfData);
          const safeName = (project.name || 'Programa de Trabalho').slice(0, 60);
          await saveReportPdf(userId, `Programa de Trabalho — ${safeName}`, base64, 'programa_impressao_pdf', {
            organizationId: selectedClient?.id ?? null,
            farmId: selectedFarm?.id ?? null,
          });
          onToast?.('Documento salvo com sucesso!', 'success');
        }
      }
    } catch (err) {
      console.error('[handleExport]', err);
      const label = mode === 'download_pdf' ? 'o PDF' : mode === 'download_word' ? 'o Word' : 'o documento';
      onToast?.(`Erro ao gerar ${label}. Tente novamente.`, 'error');
    } finally {
      setIsExporting(null);
    }
  };

  if (isAdmin && !selectedAnalyst) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-xl w-full rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Selecione um <strong>Analista</strong> no cabeçalho para gerenciar programas.
          </p>
        </div>
      </div>
    );
  }

  if (isCliente && !selectedFarm) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-xl w-full rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Selecione uma <strong>Fazenda</strong> no cabeçalho para visualizar os programas.
          </p>
        </div>
      </div>
    );
  }

  if (!effectiveUserId && !isCliente) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <p className="text-sm text-ai-subtext">Selecione um usuário para continuar.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6 w-full">
      <header className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ai-text tracking-tight">Programa de Trabalho</h1>
          <p className="text-sm text-ai-subtext mt-1 max-w-2xl">
            {viewMode === 'columns'
              ? 'Gestão visual da estrutura hierárquica em colunas: Programa, Entrega, Atividade e Tarefa.'
              : viewMode === 'mindmap'
                ? 'Mapa Mental EAP — visualize e edite a estrutura do projeto em formato de árvore.'
                : 'Documento — edite os dados diretamente no conteúdo, como em um documento de texto.'}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="flex rounded-lg border border-ai-border p-1 bg-ai-surface/50">
              <button
                type="button"
                onClick={() => setViewMode('columns')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'columns' ? 'bg-ai-accent text-white shadow-sm' : 'text-ai-subtext hover:text-ai-text'
                }`}
              >
                <Columns3 size={16} />
                Colunas
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mindmap')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'mindmap' ? 'bg-ai-accent text-white shadow-sm' : 'text-ai-subtext hover:text-ai-text'
                }`}
              >
                <Network size={16} />
                Mapa Mental
              </button>
              <button
                type="button"
                onClick={() => setViewMode('document')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'document' ? 'bg-ai-accent text-white shadow-sm' : 'text-ai-subtext hover:text-ai-text'
                }`}
              >
                <FileText size={16} />
                Documento
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowFormatModal(true)}
                disabled={!!isExporting}
                className="inline-flex items-center justify-center p-2 rounded-lg border border-ai-border bg-ai-surface text-ai-text hover:bg-ai-border/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Baixar Documento"
              >
                {isExporting?.startsWith('download') ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Download size={18} />
                )}
              </button>
              <button
                type="button"
                onClick={() => handleExport('save')}
                disabled={!!isExporting}
                className="inline-flex items-center justify-center p-2 rounded-lg border border-ai-accent/30 bg-ai-accent/10 text-ai-accent hover:bg-ai-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Salvar PDF"
              >
                {isExporting === 'save' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
              </button>
            </div>
          </div>
          {isCliente && (
            <div className="flex flex-col gap-0.5 text-right">
              <p className="text-sm font-medium text-red-600">Disponível para apenas visualização</p>
              <p className="text-xs text-ai-subtext">Edição permitida para o time de analistas.</p>
            </div>
          )}
        </div>
      </header>
      {viewMode === 'columns' && (
        <ProgramaWorkbench
          effectiveUserId={effectiveUserId ?? ''}
          selectedOrganizationId={selectedClient?.id || null}
          selectedFarmId={selectedFarm?.id || null}
          readonly={isCliente}
          onToast={onToast}
        />
      )}
      {viewMode === 'mindmap' && (
        <EAPMindMap
          effectiveUserId={effectiveUserId ?? ''}
          selectedOrganizationId={selectedClient?.id || null}
          selectedFarmId={selectedFarm?.id || null}
          readonly={isCliente}
          onToast={onToast}
        />
      )}
      {viewMode === 'document' && (
        <ProgramaDocumento
          effectiveUserId={effectiveUserId ?? ''}
          selectedOrganizationId={selectedClient?.id || null}
          selectedFarmId={selectedFarm?.id || null}
          readonly={isCliente}
          onToast={onToast}
        />
      )}

      {/* Format Selection Modal */}
      {showFormatModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-fade-in">
            <h3 className="text-lg font-bold text-ai-text mb-2">Formato do Documento</h3>
            <p className="text-sm text-ai-subtext mb-6">Em qual formato você deseja baixar o Programa de Trabalho?</p>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowFormatModal(false);
                  handleExport('download_pdf');
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-ai-border hover:bg-gray-50 text-ai-text font-medium transition-colors"
                style={{ borderColor: '#e2e8f0' }}
              >
                <FileText size={18} className="text-red-500" />
                Documento PDF (.pdf)
              </button>
              
              <button
                onClick={() => {
                  setShowFormatModal(false);
                  handleExport('download_word');
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-white font-medium transition-colors"
                style={{ backgroundColor: '#1a73e8' }} // Assuming standard primary brand color here, could be ai-accent
              >
                <FileText size={18} />
                Documento Word (.docx)
              </button>
              
              <button
                onClick={() => setShowFormatModal(false)}
                className="mt-2 w-full py-2 text-sm text-ai-subtext hover:text-ai-text transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManagement;
