import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  Trash2,
  Eye,
  Edit,
  Calendar,
  AlertCircle,
  Save,
  Download,
  FileCheck,
  X,
  FileText,
  Building2,
  Filter,
  FileBarChart,
  Calculator,
  GitCompare,
} from 'lucide-react';
import { CattleScenario, ComparatorResult, CalculationResults, SavedQuestionnaire } from '../types';
import { getSavedScenarios, deleteScenario, getScenario } from '../lib/scenarios';
import {
  getSavedQuestionnaires,
  getSavedQuestionnaire,
  deleteSavedQuestionnaire,
  updateSavedQuestionnaireName,
  updateSavedQuestionnaire,
} from '../lib/savedQuestionnaires';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyst } from '../contexts/AnalystContext';
import { useClient } from '../contexts/ClientContext';
import { useFarm } from '../contexts/FarmContext';
import { useLocation } from '../contexts/LocationContext';
import EditScenarioNameModal from '../components/EditScenarioNameModal';
import { updateScenario } from '../lib/scenarios';
import { CattleCalculatorInputs } from '../types';
import { generateReportPDF } from '../lib/generateReportPDF';
import QuestionnaireResultsDashboard from './QuestionnaireResultsDashboard';

type SavedItem = { type: 'scenario'; data: CattleScenario } | { type: 'questionnaire'; data: SavedQuestionnaire };

interface SavedScenariosProps {
  onLoadScenario: (inputs: CattleCalculatorInputs) => void;
  onNavigateToCalculator: () => void;
  onLoadComparator?: (scenarios: any[]) => void;
  onNavigateToComparator?: () => void;
  onEditQuestionnaire?: (q: SavedQuestionnaire) => void;
  onToast?: (toast: { id: string; message: string; type: 'success' | 'error' | 'info' }) => void;
}

const SavedScenarios: React.FC<SavedScenariosProps> = ({
  onLoadScenario,
  onNavigateToCalculator,
  onLoadComparator,
  onNavigateToComparator,
  onEditQuestionnaire,
  onToast,
}) => {
  const { user } = useAuth();
  const { selectedAnalyst } = useAnalyst();
  const { selectedClient } = useClient();
  const { selectedFarm } = useFarm();
  const { country, currencySymbol } = useLocation();

  // Determine target user ID (admin viewing analyst's data or regular user)
  const targetUserId = user?.role === 'admin' && selectedAnalyst ? selectedAnalyst.id : user?.id;

  // Verificar se o usuário é analista ou admin
  const isAnalystOrAdmin = user?.qualification === 'analista' || user?.role === 'admin';

  const [scenarios, setScenarios] = useState<CattleScenario[]>([]);
  const [questionnaires, setQuestionnaires] = useState<SavedQuestionnaire[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingScenario, setEditingScenario] = useState<CattleScenario | null>(null);
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<SavedQuestionnaire | null>(null);
  const [viewingQuestionnaire, setViewingQuestionnaire] = useState<SavedQuestionnaire | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingQuestionnaireId, setDeletingQuestionnaireId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAutoPrint, setIsAutoPrint] = useState(false);
  const [isAutoDownloadPdf, setIsAutoDownloadPdf] = useState(false);
  const [downloadModalQuestionnaire, setDownloadModalQuestionnaire] = useState<SavedQuestionnaire | null>(null);
  const [includeInsightsInDownload, setIncludeInsightsInDownload] = useState(false);

  // Filtro local para mostrar todos ou apenas da fazenda selecionada
  const [filterMode, setFilterMode] = useState<'all' | 'farm'>('farm');

  // Filtro por tipo: questionários, calculadora, comparador (default todos marcados)
  const [filterQuestionnaires, setFilterQuestionnaires] = useState(true);
  const [filterCalculadora, setFilterCalculadora] = useState(true);
  const [filterComparador, setFilterComparador] = useState(true);

  const savedItems: SavedItem[] = useMemo(() => {
    const scenarioItems: SavedItem[] = scenarios.map(s => ({ type: 'scenario' as const, data: s }));
    const questionnaireItems: SavedItem[] = questionnaires.map(q => ({ type: 'questionnaire' as const, data: q }));
    return [...scenarioItems, ...questionnaireItems].sort(
      (a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime(),
    );
  }, [scenarios, questionnaires]);

  const isScenarioComparador = (s: CattleScenario) =>
    s.results && 'type' in s.results && s.results.type === 'comparator_pdf';
  const isScenarioOverviewReport = (s: CattleScenario) =>
    s.results && 'type' in s.results && s.results.type === 'initiatives_overview_pdf';
  const isScenarioProjectStructure = (s: CattleScenario) =>
    s.results && 'type' in s.results && s.results.type === 'project_structure_pdf';

  const filteredSavedItems: SavedItem[] = useMemo(() => {
    return savedItems.filter(item => {
      if (item.type === 'questionnaire') return filterQuestionnaires;
      const isComparador = isScenarioComparador(item.data);
      const isOverviewReport = isScenarioOverviewReport(item.data);
      const isProjectStructureReport = isScenarioProjectStructure(item.data);
      if (isComparador || isOverviewReport || isProjectStructureReport) return filterComparador;
      return filterCalculadora;
    });
  }, [savedItems, filterQuestionnaires, filterCalculadora, filterComparador]);

  // Recarregar quando cliente, fazenda ou filtro mudar
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, targetUserId, selectedClient?.id, selectedFarm?.id, filterMode]);

  // Refetch when the tab becomes visible (ex.: usuário voltou do Questionário)
  useEffect(() => {
    if (!user) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [user]);

  const loadData = async () => {
    if (!targetUserId) {
      setError('Usuário não identificado');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Construir filtros baseado no contexto
      const filters: { clientId?: string; farmId?: string } = {};

      // Para analistas/admins com cliente selecionado
      if (isAnalystOrAdmin && selectedClient) {
        filters.clientId = selectedClient.id;

        // Se tiver fazenda selecionada e filtro por fazenda ativo
        if (selectedFarm && filterMode === 'farm') {
          filters.farmId = selectedFarm.id;
        }
      }

      const [scenariosData, questionnairesData] = await Promise.all([
        getSavedScenarios(targetUserId, Object.keys(filters).length > 0 ? filters : undefined),
        getSavedQuestionnaires(targetUserId, Object.keys(filters).length > 0 ? filters : undefined).catch(() => []),
      ]);
      setScenarios(scenariosData);
      setQuestionnaires(questionnairesData);
    } catch (err: any) {
      console.error('Error loading saved items:', err);
      setError(err.message || 'Erro ao carregar itens salvos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (scenarioId: string) => {
    if (!targetUserId) return;

    if (!confirm('Tem certeza que deseja excluir este cenário?')) {
      return;
    }

    setDeletingId(scenarioId);
    try {
      await deleteScenario(scenarioId, targetUserId);
      setScenarios(prev => prev.filter(s => s.id !== scenarioId));
      onToast?.({
        id: Date.now().toString(),
        message: 'Cenário excluído com sucesso',
        type: 'success',
      });
    } catch (err: any) {
      onToast?.({
        id: Date.now().toString(),
        message: err.message || 'Erro ao excluir cenário',
        type: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleView = async (scenarioId: string) => {
    if (!targetUserId) return;

    try {
      const scenario = await getScenario(scenarioId, targetUserId!);
      if (scenario) {
        // Verificar se é um comparativo
        const results = scenario.results;

        if (results && 'type' in results && results.type === 'comparator_pdf') {
          // É um comparativo - carregar no comparador
          if (onLoadComparator && onNavigateToComparator) {
            onLoadComparator(results.scenarios);
            onNavigateToComparator();
          } else {
            onToast?.({
              id: Date.now().toString(),
              message: 'Funcionalidade de carregar comparativos não está disponível nesta visualização',
              type: 'info',
            });
          }
        } else if (
          results &&
          'type' in results &&
          (results.type === 'initiatives_overview_pdf' || results.type === 'project_structure_pdf')
        ) {
          await handleDownloadReport(scenario);
        } else if (results) {
          // É um cenário individual - carregar na calculadora
          // TypeScript needs assurance that results is CalculationResults here if we were using it,
          // but we just use inputs.
          onLoadScenario(scenario.inputs);
          onNavigateToCalculator();
        }
      }
    } catch (err: any) {
      onToast?.({
        id: Date.now().toString(),
        message: err.message || 'Erro ao carregar cenário',
        type: 'error',
      });
    }
  };

  const handleEdit = (item: SavedItem) => {
    if (item.type === 'scenario') {
      setEditingScenario(item.data);
      setEditingQuestionnaire(null); // Clear questionnaire editing state
    } else {
      // item.type === 'questionnaire'
      // If we have an edit handler for questionnaire content, use it.
      // Otherwise, fallback to renaming (which was the default behavior before).
      if (onEditQuestionnaire) {
        onEditQuestionnaire(item.data);
        setEditingScenario(null); // Clear scenario editing state
        setEditingQuestionnaire(null); // Clear internal questionnaire editing state as external handler is used
      } else {
        setEditingQuestionnaire(item.data);
        setEditingScenario(null); // Clear scenario editing state
      }
    }
  };

  const handleSaveEdit = async (name: string) => {
    if (!targetUserId) return;

    if (editingScenario) {
      setIsUpdating(true);
      try {
        await updateScenario(editingScenario.id, targetUserId!, { name });
        await loadData();
        setEditingScenario(null);
        onToast?.({ id: Date.now().toString(), message: 'Cenário atualizado', type: 'success' });
      } catch (err: any) {
        onToast?.({ id: Date.now().toString(), message: err.message || 'Erro ao atualizar cenário', type: 'error' });
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    if (editingQuestionnaire) {
      setIsUpdating(true);
      try {
        await updateSavedQuestionnaireName(editingQuestionnaire.id, targetUserId!, name);
        await loadData();
        setEditingQuestionnaire(null);
        onToast?.({ id: Date.now().toString(), message: 'Questionário atualizado', type: 'success' });
      } catch (err: any) {
        onToast?.({ id: Date.now().toString(), message: err.message || 'Erro ao atualizar', type: 'error' });
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleDeleteQuestionnaire = async (id: string) => {
    if (!targetUserId || !confirm('Tem certeza que deseja excluir este questionário?')) return;
    setDeletingQuestionnaireId(id);
    setDeletingQuestionnaireId(id);
    try {
      await deleteSavedQuestionnaire(id, targetUserId!);
      setQuestionnaires(prev => prev.filter(q => q.id !== id));
      onToast?.({ id: Date.now().toString(), message: 'Questionário excluído com sucesso', type: 'success' });
    } catch (err: any) {
      onToast?.({ id: Date.now().toString(), message: err.message || 'Erro ao excluir', type: 'error' });
    } finally {
      setDeletingQuestionnaireId(null);
    }
  };

  const handleDownloadQuestionnaire = (q: SavedQuestionnaire) => {
    setDownloadModalQuestionnaire(q);
    setIncludeInsightsInDownload(false);
  };

  const handleConfirmDownload = () => {
    if (downloadModalQuestionnaire) {
      setViewingQuestionnaire(downloadModalQuestionnaire);
      setIsAutoPrint(false); // Don't use print
      setIsAutoDownloadPdf(false); // Don't auto download, let user click button in UI
      setDownloadModalQuestionnaire(null);
    }
  };

  const handleViewQuestionnaire = (q: SavedQuestionnaire) => {
    setViewingQuestionnaire(q);
    setIsAutoPrint(false);
    setIsAutoDownloadPdf(false);
  };

  const handleDownloadReport = async (scenario: CattleScenario) => {
    if (!scenario.results) {
      onToast?.({
        id: Date.now().toString(),
        message: 'Este cenário não possui resultados para gerar o relatório',
        type: 'error',
      });
      return;
    }

    try {
      // Verificar se é um comparativo
      const results = scenario.results;

      if (
        results &&
        'type' in results &&
        (results.type === 'comparator_pdf' ||
          results.type === 'initiatives_overview_pdf' ||
          results.type === 'project_structure_pdf') &&
        results.pdf_base64
      ) {
        // É um relatório salvo (comparativo ou visão geral) - baixar o PDF armazenado
        const pdfBase64 = results.pdf_base64;

        // Validação de segurança: verificar se é base64 válido
        if (typeof pdfBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(pdfBase64)) {
          throw new Error('PDF inválido ou corrompido');
        }

        // Validação de segurança: verificar tamanho (máx 10MB em base64)
        if (pdfBase64.length > 14000000) {
          // ~10MB em base64
          throw new Error('PDF muito grande para download');
        }

        // Converter base64 para Blob
        const byteCharacters = atob(pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });

        // Criar link de download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        // Sanitizar nome do arquivo para prevenir XSS
        const safeName = scenario.name
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
          .substring(0, 50); // Limitar tamanho
        const filePrefix =
          results.type === 'initiatives_overview_pdf'
            ? 'relatorio-visao-geral'
            : results.type === 'project_structure_pdf'
              ? 'estrutura-projeto'
              : 'comparativo';
        const fileName = `${filePrefix}-${safeName}.pdf`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (results && !('type' in results)) {
        // É um cenário normal - gerar PDF
        // Cast to make TS happy knowing it's CalculationResults
        const calcResults = results as CalculationResults;

        generateReportPDF({
          inputs: scenario.inputs,
          results: calcResults,
          scenarioName: scenario.name,
          createdAt: scenario.created_at,
          userName: user?.name,
        });
      }
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      onToast?.({
        id: Date.now().toString(),
        message: 'Erro ao gerar relatório PDF: ' + (err.message || 'Erro desconhecido'),
        type: 'error',
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-ai-subtext" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-900 mb-1">Erro ao carregar cenários</h3>
              <p className="text-xs text-red-700 mb-4">{error}</p>
              <button
                onClick={loadData}
                className="text-xs px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleUpdateQuestionnaire = async () => {
    if (!targetUserId || !viewingQuestionnaire?.id || !viewingQuestionnaire.answers) return;
    try {
      await updateSavedQuestionnaire(viewingQuestionnaire.id, targetUserId, viewingQuestionnaire.answers);
      onToast?.({ id: Date.now().toString(), message: 'Questionário atualizado com sucesso!', type: 'success' });
      await loadData();
    } catch (err: any) {
      onToast?.({ id: Date.now().toString(), message: err.message || 'Erro ao atualizar', type: 'error' });
    }
  };

  if (viewingQuestionnaire) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-hidden">
        <QuestionnaireResultsDashboard
          questionnaire={viewingQuestionnaire}
          onClose={() => {
            setViewingQuestionnaire(null);
            setIsAutoPrint(false);
            setIsAutoDownloadPdf(false);
            setIncludeInsightsInDownload(false);
          }}
          onToast={(msg, type) => onToast?.({ id: Date.now().toString(), message: msg, type })}
          autoPrint={isAutoPrint}
          autoDownloadPdf={isAutoDownloadPdf}
          autoGenerateInsights={includeInsightsInDownload}
          onUpdate={viewingQuestionnaire.id ? handleUpdateQuestionnaire : undefined}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Save size={20} className="text-ai-accent" />
            <h1 className="text-xl font-bold text-ai-text">Meus Salvos</h1>
          </div>

          {/* Filtros para analistas/admins */}
          {isAnalystOrAdmin && selectedClient && selectedFarm && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterMode('farm')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                  filterMode === 'farm' ? 'bg-ai-accent text-white' : 'bg-ai-surface text-ai-subtext hover:bg-ai-border'
                }`}
              >
                <Building2 size={14} />
                {selectedFarm.name}
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                  filterMode === 'all' ? 'bg-ai-accent text-white' : 'bg-ai-surface text-ai-subtext hover:bg-ai-border'
                }`}
              >
                <Filter size={14} />
                Todas as Fazendas
              </button>
            </div>
          )}
        </div>

        {/* Contexto atual */}
        {isAnalystOrAdmin && (
          <div className="flex items-center gap-2 mb-2">
            {selectedClient ? (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                Organização: {selectedClient.name}
              </span>
            ) : (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                Selecione uma organização no cabeçalho
              </span>
            )}
            {selectedFarm && filterMode === 'farm' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                Fazenda: {selectedFarm.name}
              </span>
            )}
          </div>
        )}

        {/* Filtro por tipo: Questionários, Calculadora, Comparador */}
        <div className="flex flex-wrap items-center gap-4 mt-3 p-3 bg-ai-surface/50 rounded-lg border border-ai-border/60">
          <span className="text-xs font-semibold text-ai-subtext">Exibir:</span>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterQuestionnaires}
              onChange={e => setFilterQuestionnaires(e.target.checked)}
              className="rounded border-ai-border text-ai-accent focus:ring-ai-accent"
            />
            <FileBarChart size={14} className="text-ai-subtext" />
            <span className="text-xs text-ai-text">Questionários</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterCalculadora}
              onChange={e => setFilterCalculadora(e.target.checked)}
              className="rounded border-ai-border text-ai-accent focus:ring-ai-accent"
            />
            <Calculator size={14} className="text-ai-subtext" />
            <span className="text-xs text-ai-text">Calculadora</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterComparador}
              onChange={e => setFilterComparador(e.target.checked)}
              className="rounded border-ai-border text-ai-accent focus:ring-ai-accent"
            />
            <GitCompare size={14} className="text-ai-subtext" />
            <span className="text-xs text-ai-text">Comparador</span>
          </label>
        </div>

        <p className="text-sm text-ai-subtext mt-3">
          {savedItems.length === 0
            ? isAnalystOrAdmin && !selectedClient
              ? 'Selecione uma organização para ver os itens salvos.'
              : 'Nenhum item salvo encontrado.'
            : `${filteredSavedItems.length} de ${savedItems.length} item${savedItems.length !== 1 ? 'ns' : ''} (${scenarios.length} cenário${scenarios.length !== 1 ? 's' : ''}, ${questionnaires.length} questionário${questionnaires.length !== 1 ? 's' : ''})`}
        </p>
      </div>

      {/* List */}
      {filteredSavedItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Save size={48} className="mx-auto mb-4 text-ai-subtext opacity-30" />
            <h3 className="text-lg font-medium text-ai-text mb-2">
              {isAnalystOrAdmin && !selectedClient
                ? 'Selecione uma organização'
                : savedItems.length > 0
                  ? 'Nenhum item nos filtros'
                  : 'Nenhum item salvo'}
            </h3>
            <p className="text-sm text-ai-subtext mb-4">
              {isAnalystOrAdmin && !selectedClient
                ? 'Use o seletor no cabeçalho para escolher uma organização e visualizar seus itens salvos.'
                : savedItems.length > 0
                  ? 'Marque ao menos um tipo (Questionários, Calculadora ou Comparador) acima para exibir itens.'
                  : isAnalystOrAdmin && selectedFarm && filterMode === 'farm'
                    ? `Nenhum item encontrado para a fazenda "${selectedFarm.name}". Tente ver todos os itens da organização.`
                    : 'Salve cenários da calculadora ou questionários preenchidos para acessá-los aqui.'}
            </p>
            {isAnalystOrAdmin && selectedFarm && filterMode === 'farm' && savedItems.length === 0 ? (
              <button
                onClick={() => setFilterMode('all')}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accent/90 transition-colors text-sm font-medium"
              >
                Ver todos da organização
              </button>
            ) : !isAnalystOrAdmin || selectedClient ? (
              <button
                onClick={onNavigateToCalculator}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accent/90 transition-colors text-sm font-medium"
              >
                Ir para Calculadora
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSavedItems.map(item =>
              item.type === 'scenario' ? (
                <div
                  key={`s-${item.data.id}`}
                  className="bg-white rounded-lg border border-ai-border p-4 hover:shadow-md transition-shadow"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-ai-text flex-1 pr-2 truncate" title={item.data.name}>
                      {item.data.name}
                    </h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleView(item.data.id)}
                        className="p-1.5 text-ai-subtext hover:text-ai-accent hover:bg-ai-surface rounded transition-colors"
                        title="Visualizar"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleDownloadReport(item.data)}
                        disabled={!item.data.results}
                        className="p-1.5 text-ai-subtext hover:text-purple-600 hover:bg-ai-surface rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download Relatório PDF"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => handleEdit({ type: 'scenario', data: item.data })}
                        className="p-1.5 text-ai-subtext hover:text-blue-600 hover:bg-ai-surface rounded transition-colors"
                        title="Editar nome"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.data.id)}
                        disabled={deletingId === item.data.id}
                        className="p-1.5 text-ai-subtext hover:text-red-600 hover:bg-ai-surface rounded transition-colors disabled:opacity-50"
                        title="Excluir"
                      >
                        {deletingId === item.data.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Date and Farm */}
                  <div className="flex items-center gap-1.5 text-xs text-ai-subtext mb-3">
                    <Calendar size={12} />
                    <span>{formatDate(item.data.created_at)}</span>
                  </div>

                  {/* Farm name - mostrar quando filtro é "all" ou quando cenário tem farm_name */}
                  {item.data.farm_name && filterMode === 'all' && (
                    <div className="flex items-center gap-1.5 text-xs text-ai-subtext mb-3 bg-ai-surface px-2 py-1 rounded">
                      <Building2 size={12} />
                      <span>{item.data.farm_name}</span>
                    </div>
                  )}

                  {/* Summary */}
                  {(() => {
                    const scenario = item.data;
                    const results = scenario.results;
                    const isComparatorPDF = results && 'type' in results && results.type === 'comparator_pdf';
                    const isOverviewReportPDF =
                      results && 'type' in results && results.type === 'initiatives_overview_pdf';
                    const isProjectStructureReportPDF =
                      results && 'type' in results && results.type === 'project_structure_pdf';

                    if (isComparatorPDF) {
                      return (
                        <div className="pt-3 border-t border-ai-border">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                              Análise Comparativa
                            </div>
                          </div>
                          <p className="text-xs text-ai-subtext">
                            Comparação de 3 cenários com relatório PDF completo. Clique no ícone de download para
                            visualizar o relatório.
                          </p>
                        </div>
                      );
                    } else if (isOverviewReportPDF) {
                      return (
                        <div className="pt-3 border-t border-ai-border">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                              Relatório Visão Geral
                            </div>
                          </div>
                          <p className="text-xs text-ai-subtext">
                            PDF da Visão Geral de iniciativas salvo em Meus Salvos. Clique no ícone de download para
                            baixar o relatório.
                          </p>
                        </div>
                      );
                    } else if (isProjectStructureReportPDF) {
                      return (
                        <div className="pt-3 border-t border-ai-border">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                              Estrutura do Projeto
                            </div>
                          </div>
                          <p className="text-xs text-ai-subtext">
                            PDF da Estrutura do Projeto salvo em Meus Salvos. Clique no ícone de download para baixar o
                            relatório.
                          </p>
                        </div>
                      );
                    } else if (results && !('type' in results)) {
                      const calcResults = results as CalculationResults;
                      return (
                        <div className="pt-3 border-t border-ai-border">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-ai-subtext">Resultado:</span>
                              <span
                                className={`ml-1 font-medium ${(calcResults.resultadoPorBoi || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}
                              >
                                {currencySymbol}{' '}
                                {(calcResults.resultadoPorBoi || 0).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            <div>
                              <span className="text-ai-subtext">Margem:</span>
                              <span
                                className={`ml-1 font-medium ${(calcResults.margemVenda || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}
                              >
                                {(calcResults.margemVenda || 0).toFixed(2)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-ai-subtext">Permanência:</span>
                              <span className="ml-1 font-medium text-ai-text">
                                {(calcResults.diasPermanencia || 0).toFixed(0)} dias
                              </span>
                            </div>
                            <div>
                              <span className="text-ai-subtext">Arrobas:</span>
                              <span className="ml-1 font-medium text-ai-text">
                                {(calcResults.arrobasProduzidas || 0).toFixed(2)} @
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // Fallback para cenários legados sem results.type; usar optional chaining se inputs for {} (ex.: comparativos antigos)
                      const inp = scenario.inputs;
                      return (
                        <div className="pt-3 border-t border-ai-border">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-ai-subtext">Peso Compra:</span>
                              <span className="ml-1 font-medium text-ai-text">{inp?.pesoCompra ?? '-'} kg</span>
                            </div>
                            <div>
                              <span className="text-ai-subtext">Valor Compra:</span>
                              <span className="ml-1 font-medium text-ai-text">
                                {currencySymbol} {inp?.valorCompra != null ? Number(inp.valorCompra).toFixed(2) : '-'}
                                /kg
                              </span>
                            </div>
                            <div>
                              <span className="text-ai-subtext">Peso Venda:</span>
                              <span className="ml-1 font-medium text-ai-text">{inp?.pesoAbate ?? '-'} kg</span>
                            </div>
                            <div>
                              <span className="text-ai-subtext">Valor Venda:</span>
                              <span className="ml-1 font-medium text-ai-text">
                                {currencySymbol} {inp?.valorVenda != null ? Number(inp.valorVenda) : '-'}
                                {country === 'PY' ? '/kg' : '/@'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              ) : (
                <div
                  key={`q-${item.data.id}`}
                  className="bg-white rounded-lg border border-ai-border p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-ai-text flex-1 pr-2 truncate" title={item.data.name}>
                      {item.data.name}
                    </h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleViewQuestionnaire(item.data)}
                        className="p-1.5 text-ai-subtext hover:text-ai-accent hover:bg-ai-surface rounded transition-colors"
                        title="Visualizar"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleDownloadQuestionnaire(item.data)}
                        className="p-1.5 text-ai-subtext hover:text-purple-600 hover:bg-ai-surface rounded transition-colors"
                        title="Download PDF"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => handleEdit({ type: 'questionnaire', data: item.data })}
                        className="p-1.5 text-ai-subtext hover:text-blue-600 hover:bg-ai-surface rounded transition-colors"
                        title={onEditQuestionnaire ? 'Editar questionário' : 'Editar nome'}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteQuestionnaire(item.data.id)}
                        disabled={deletingQuestionnaireId === item.data.id}
                        className="p-1.5 text-ai-subtext hover:text-red-600 hover:bg-ai-surface rounded transition-colors disabled:opacity-50"
                        title="Excluir"
                      >
                        {deletingQuestionnaireId === item.data.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ai-subtext mb-3">
                    <Calendar size={12} />
                    <span>{formatDate(item.data.created_at)}</span>
                  </div>
                  <div className="pt-3 border-t border-ai-border">
                    <div className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium inline-block mb-2">
                      Questionário
                    </div>
                    {item.data.farm_name && <p className="text-xs text-ai-subtext">Fazenda: {item.data.farm_name}</p>}
                    <p className="text-xs text-ai-subtext">{item.data.answers?.length || 0} respostas</p>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* Edit Modal - Cenário ou Questionário */}
      {(editingScenario || editingQuestionnaire) && (
        <EditScenarioNameModal
          isOpen={true}
          onClose={() => {
            setEditingScenario(null);
            setEditingQuestionnaire(null);
          }}
          onSave={handleSaveEdit}
          currentName={editingScenario?.name ?? editingQuestionnaire?.name ?? ''}
          isLoading={isUpdating}
        />
      )}

      {/* Download Configuration Modal */}
      {downloadModalQuestionnaire && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setDownloadModalQuestionnaire(null)}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-ai-border">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-ai-accent" />
                <h3 className="font-semibold text-ai-text">Configurar Download</h3>
              </div>
              <button
                onClick={() => setDownloadModalQuestionnaire(null)}
                className="p-1.5 text-ai-subtext hover:bg-ai-surface rounded"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-ai-subtext">Configure as opções do relatório PDF antes de baixar.</p>

              <label className="flex items-start gap-3 p-3 border border-ai-border rounded-lg hover:bg-ai-surface cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-ai-border text-ai-accent focus:ring-ai-accent"
                  checked={includeInsightsInDownload}
                  onChange={e => setIncludeInsightsInDownload(e.target.checked)}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-ai-text">Incluir Insights da IA</div>
                  <div className="text-xs text-ai-subtext mt-0.5">
                    Adiciona análise e recomendações geradas por inteligência artificial ao relatório.
                  </div>
                </div>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDownloadModalQuestionnaire(null)}
                  className="flex-1 px-4 py-2 border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDownload}
                  className="flex-1 px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors"
                >
                  Baixar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavedScenarios;
