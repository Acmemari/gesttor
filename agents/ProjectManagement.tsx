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

  const [isExporting, setIsExporting] = useState<'download' | 'save' | null>(null);

  const handleExport = async (mode: 'download' | 'save') => {
    if (!effectiveUserId || isExporting) return;
    setIsExporting(mode);
    try {
      const tree = await loadFullEAPTree(effectiveUserId, {
        clientId: selectedClient?.id ?? undefined,
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

        if (mode === 'download') {
          generateProgramaImpressao(pdfData);
        } else {
          const base64 = generateProgramaImpressaoBase64(pdfData);
          const safeName = project.name.slice(0, 60) || 'Programa de Trabalho';
          await saveReportPdf(effectiveUserId, `Programa de Trabalho — ${safeName}`, base64, 'programa_impressao_pdf', {
            clientId: selectedClient?.id ?? null,
            farmId: selectedFarm?.id ?? null,
          });
          onToast?.('Documento salvo com sucesso!', 'success');
        }
      }
    } catch (err) {
      console.error('[handleExport]', err);
      onToast?.('Erro ao gerar o documento. Tente novamente.', 'error');
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
    <div className="h-full flex flex-col p-6 md:p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ai-text tracking-tight">Programa de Trabalho</h1>
          <p className="text-sm text-ai-subtext">
            {viewMode === 'columns'
              ? 'Gestão visual da estrutura hierárquica em colunas: Programa, Entrega, Atividade e Tarefa.'
              : viewMode === 'mindmap'
                ? 'Mapa Mental EAP — visualize e edite a estrutura do projeto em formato de árvore.'
                : 'Documento — edite os dados diretamente no conteúdo, como em um documento de texto.'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="flex rounded-lg border border-ai-border p-1 bg-ai-surface/50">
            <button
              type="button"
              onClick={() => setViewMode('columns')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'columns' ? 'bg-ai-accent text-white shadow-sm' : 'text-ai-subtext hover:text-ai-text'
              }`}
            >
              <Columns3 size={16} />
              Colunas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mindmap')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'mindmap' ? 'bg-ai-accent text-white shadow-sm' : 'text-ai-subtext hover:text-ai-text'
              }`}
            >
              <Network size={16} />
              Mapa Mental
            </button>
            <button
              type="button"
              onClick={() => setViewMode('document')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'document' ? 'bg-ai-accent text-white shadow-sm' : 'text-ai-subtext hover:text-ai-text'
              }`}
            >
              <FileText size={16} />
              Documento
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport('download')}
              disabled={!!isExporting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ai-border bg-ai-surface text-sm font-medium text-ai-text hover:bg-ai-border/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar PDF do Programa de Trabalho"
            >
              {isExporting === 'download' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}
              Download
            </button>
            <button
              type="button"
              onClick={() => handleExport('save')}
              disabled={!!isExporting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ai-accent/30 bg-ai-accent/10 text-sm font-medium text-ai-accent hover:bg-ai-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Salvar PDF do Programa de Trabalho"
            >
              {isExporting === 'save' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              Salvar
            </button>
          </div>
        </div>
      </header>
      {viewMode === 'columns' && (
        <ProgramaWorkbench
          effectiveUserId={effectiveUserId ?? ''}
          selectedClientId={selectedClient?.id || null}
          selectedFarmId={selectedFarm?.id || null}
          readonly={isCliente}
          onToast={onToast}
        />
      )}
      {viewMode === 'mindmap' && (
        <EAPMindMap
          effectiveUserId={effectiveUserId ?? ''}
          selectedClientId={selectedClient?.id || null}
          selectedFarmId={selectedFarm?.id || null}
          readonly={isCliente}
          onToast={onToast}
        />
      )}
      {viewMode === 'document' && (
        <ProgramaDocumento
          effectiveUserId={effectiveUserId ?? ''}
          selectedClientId={selectedClient?.id || null}
          selectedFarmId={selectedFarm?.id || null}
          readonly={isCliente}
          onToast={onToast}
        />
      )}
    </div>
  );
};

export default ProjectManagement;
