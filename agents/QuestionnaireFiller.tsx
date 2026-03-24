import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FileCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyst } from '../contexts/AnalystContext';
import { useClient } from '../contexts/ClientContext';
import { useFarm } from '../contexts/FarmContext';
import { Farm, SavedQuestionnaire } from '../types';
import {
  saveQuestionnaire,
  getSavedQuestionnaires,
  updateSavedQuestionnaireName,
  deleteSavedQuestionnaire,
  updateSavedQuestionnaire,
} from '../lib/savedQuestionnaires';
import QuestionnaireResultsDashboard from './QuestionnaireResultsDashboard';
import { QuestionnaireIntro } from '../components/questionnaire/QuestionnaireIntro';
import { QuestionnaireForm } from '../components/questionnaire/QuestionnaireForm';
import { QuestionnaireHistory } from '../components/questionnaire/QuestionnaireHistory';
import { useQuestions } from '../hooks/useQuestions';
import { QUESTIONNAIRE_CONSTANTS } from '../constants/questionnaireConstants';
import { validateAnswers, validateQuestionnaireName, validateUserId } from '../lib/questionnaireValidation';
import { handleQuestionnaireError } from '../lib/errorHandler';
import { generateQuestionnaireName } from '../lib/dateUtils';

interface QuestionnaireFillerProps {
  questionnaireId?: string;
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  selectedFarm?: Farm | null;
  initialData?: SavedQuestionnaire | null;
  onClearInitialData?: () => void;
}

const QuestionnaireFiller: React.FC<QuestionnaireFillerProps> = ({
  questionnaireId = QUESTIONNAIRE_CONSTANTS.DEFAULT_QUESTIONNAIRE_ID,
  onToast,
  selectedFarm: externalSelectedFarm,
  initialData,
  onClearInitialData,
}) => {
  const { user } = useAuth();
  const { selectedAnalyst } = useAnalyst();
  const { selectedClient } = useClient();
  const { selectedFarm: contextSelectedFarm } = useFarm();
  const { questions, loading: loadingQuestions } = useQuestions();

  // Determine target user ID (admin viewing analyst's data or regular user)
  const targetUserId = user?.role === 'admin' && selectedAnalyst ? selectedAnalyst.id : user?.id;

  // Internal state for farms (used only when no external farm is provided)
  const [farms, setFarms] = useState<Farm[]>([]);
  const [internalSelectedFarm, setInternalSelectedFarm] = useState<Farm | null>(null);

  // Use external farm if provided, then context farm, otherwise use internal state
  const selectedFarm =
    externalSelectedFarm !== undefined ? externalSelectedFarm : contextSelectedFarm || internalSelectedFarm;
  const isControlled = externalSelectedFarm !== undefined || contextSelectedFarm !== null;

  // Questionnaire State
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, 'Sim' | 'Não' | null>>({});

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Results/History State
  const [savedForFarm, setSavedForFarm] = useState<SavedQuestionnaire[]>([]);
  const [viewResultsQuestionnaire, setViewResultsQuestionnaire] = useState<SavedQuestionnaire | null>(null);
  const [showResultsList, setShowResultsList] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingQuestionnaireId, setEditingQuestionnaireId] = useState<string | null>(null);
  const autoAdvanceTimeout = useRef<NodeJS.Timeout>(undefined);

  const loadFarms = useCallback(() => {
    try {
      const stored = localStorage.getItem(QUESTIONNAIRE_CONSTANTS.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const farmsArray = Array.isArray(parsed) ? parsed : [];
        setFarms(farmsArray);
      } else {
        setFarms([]);
      }
    } catch {
      setFarms([]);
    }
  }, []);

  useEffect(() => {
    loadFarms();
  }, [loadFarms]);

  // Filter and shuffle questions based on farm
  const filteredQuestions = useMemo(() => {
    if (!selectedFarm || !showQuestionnaire || questions.length === 0) {
      return [];
    }

    // Filter by farm type
    const filtered = questions.filter(
      q =>
        !q.applicableTypes ||
        q.applicableTypes.length === 0 ||
        q.applicableTypes.includes(selectedFarm.productionSystem),
    );

    // Shuffle (Fisher-Yates)
    const shuffled = [...filtered];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }, [selectedFarm, showQuestionnaire, questions]);

  // Initialize answers when filteredQuestions change
  useEffect(() => {
    if (filteredQuestions.length > 0 && showQuestionnaire) {
      const initialAnswers: Record<string, 'Sim' | 'Não' | null> = {};
      filteredQuestions.forEach(q => {
        initialAnswers[q.id] = null;
      });
      setAnswers(initialAnswers);
      setCurrentQuestionIndex(0);
    }
  }, [filteredQuestions, showQuestionnaire]);

  // Load saved questionnaires
  const loadSavedForFarm = useCallback(() => {
    if (!targetUserId || !selectedFarm) {
      setSavedForFarm([]);
      return;
    }
    getSavedQuestionnaires(targetUserId)
      .then(all => {
        const forFarm = all.filter(
          q => q.farm_id === selectedFarm.id || (q.farm_name && q.farm_name === selectedFarm.name),
        );
        setSavedForFarm(forFarm);
      })
      .catch(err => {
        console.error('Erro ao carregar questionários salvos:', err);
        setSavedForFarm([]);
      });
  }, [targetUserId, selectedFarm]);

  useEffect(() => {
    loadSavedForFarm();
  }, [loadSavedForFarm]);

  // Handle initial data for editing
  useEffect(() => {
    if (initialData && questions.length > 0) {
      // Find the farm from the initial data
      const farm =
        farms.find(f => f.id === initialData.farm_id) ||
        ({
          id: initialData.farm_id,
          name: initialData.farm_name || 'Fazenda Desconhecida',
          productionSystem: initialData.production_system || 'Ciclo Completo',
          area: 0,
          city: '',
          state: '',
          country: 'BR',
          propertyType: 'Fazenda',
          weightMetric: 'kg',
          commercializesGenetics: false,
          technologies: [],
          infrastructure: [],
        } as unknown as Farm);

      // Set farm using the appropriate method
      if (!isControlled) {
        setInternalSelectedFarm(farm);
      }

      // Load answers
      const newAnswers: Record<string, 'Sim' | 'Não' | null> = {};
      initialData.answers.forEach(a => {
        newAnswers[a.questionId] = a.answer;
      });
      setAnswers(newAnswers);

      setShowQuestionnaire(true);

      // Clear initial data to prevent loop/re-trigger
      if (onClearInitialData) {
        onClearInitialData();
      }
    }
  }, [initialData, questions, farms, isControlled, onClearInitialData]);

  // Handlers
  const handleFarmSelect = useCallback(
    (farm: Farm) => {
      if (!isControlled) {
        setInternalSelectedFarm(farm);
      }
      setShowQuestionnaire(false);
      setViewResultsQuestionnaire(null);
    },
    [isControlled],
  );

  const handleStartQuestionnaire = useCallback(() => {
    setShowQuestionnaire(true);
  }, []);

  const handleBackToFarms = useCallback(() => {
    if (!isControlled) {
      setInternalSelectedFarm(null);
    }
    if (autoAdvanceTimeout.current) {
      clearTimeout(autoAdvanceTimeout.current);
    }
    setShowQuestionnaire(false);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowSuccess(false);
  }, [isControlled]);

  const handleAnswerChange = useCallback((questionId: string, answer: 'Sim' | 'Não') => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer,
    }));
  }, []);

  const handleUpdateName = useCallback(
    async (id: string, newName: string) => {
      if (!targetUserId) return;

      const validation = validateQuestionnaireName(newName);
      if (!validation.valid) {
        onToast?.(validation.error!, 'error');
        return;
      }

      setIsUpdating(true);
      try {
        await updateSavedQuestionnaireName(id, targetUserId, newName);
        loadSavedForFarm();
        onToast?.('Nome atualizado.', 'success');
      } catch (err: any) {
        handleQuestionnaireError(err, 'updateQuestionnaireName', onToast);
      } finally {
        setIsUpdating(false);
      }
    },
    [targetUserId, loadSavedForFarm, onToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!targetUserId) return;
      if (!window.confirm('Tem certeza que deseja excluir este questionário?')) return;

      const wasOnlyOne = savedForFarm.length <= 1;
      setDeletingId(id);
      try {
        await deleteSavedQuestionnaire(id, targetUserId);
        loadSavedForFarm();
        if (wasOnlyOne) setShowResultsList(false);
        onToast?.('Questionário excluído.', 'success');
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao excluir.', 'error');
      } finally {
        setDeletingId(null);
      }
    },
    [targetUserId, savedForFarm.length, loadSavedForFarm, onToast],
  );

  const handleManualSave = useCallback(async () => {
    if (!targetUserId || !selectedFarm || !viewResultsQuestionnaire) return;

    // Only save if it doesn't have an ID (i.e., it's a new unsaved one)
    // OR if we are updating an existing one (editingQuestionnaireId is set)
    if (viewResultsQuestionnaire.id && !editingQuestionnaireId) {
      onToast?.('Este questionário já foi salvo.', 'info');
      return;
    }

    try {
      if (editingQuestionnaireId) {
        // UPDATE existing
        await updateSavedQuestionnaire(editingQuestionnaireId, targetUserId!, viewResultsQuestionnaire.answers!);
        onToast?.('Questionário atualizado com sucesso!', 'success');

        // Refresh and clear edit state
        setEditingQuestionnaireId(null);
        await loadSavedForFarm();

        // Update view to reflect saved state
        const updated = savedForFarm.find(q => q.id === editingQuestionnaireId);
        if (updated) setViewResultsQuestionnaire(updated);
      } else {
        // CREATE new - usar user.id (auth.uid) para INSERT respeitar RLS
        const name = generateQuestionnaireName(selectedFarm.name);

        const newQuestionnaire = await saveQuestionnaire(user!.id, name, {
          organizationId: selectedClient?.id,
          farmId: selectedFarm.id,
          farmName: selectedFarm.name,
          productionSystem: selectedFarm.productionSystem,
          questionnaireId,
          answers: viewResultsQuestionnaire.answers!,
        });

        onToast?.('Questionário salvo com sucesso em Meus Salvos!', 'success');
        setViewResultsQuestionnaire(newQuestionnaire);
        loadSavedForFarm();
      }
    } catch (err: any) {
      handleQuestionnaireError(err, 'saveQuestionnaire', onToast);
    }
  }, [
    targetUserId,
    selectedFarm,
    viewResultsQuestionnaire,
    questionnaireId,
    loadSavedForFarm,
    onToast,
    editingQuestionnaireId,
    savedForFarm,
  ]);

  const handleEditQuestionnaire = useCallback((q: SavedQuestionnaire) => {
    setEditingQuestionnaireId(q.id);
    setAnswers(q.answers.reduce((acc, curr) => ({ ...acc, [curr.questionId]: curr.answer }), {}));
    setShowResultsList(false);
    setShowQuestionnaire(true);
    setViewResultsQuestionnaire(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedFarm) return;

    const questionIds = filteredQuestions.map(q => q.id);
    const validation = validateAnswers(answers, questionIds);

    if (!validation.valid) {
      const firstUnansweredIndex = filteredQuestions.findIndex(
        q => answers[q.id] === null || answers[q.id] === undefined,
      );
      setCurrentQuestionIndex(firstUnansweredIndex >= 0 ? firstUnansweredIndex : 0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onToast?.(validation.error!, 'error');
      return;
    }

    setIsSubmitting(true);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, QUESTIONNAIRE_CONSTANTS.SUBMIT_SIMULATION_DELAY));

    try {
      const answersPayload = filteredQuestions.map(q => ({
        questionId: q.id,
        answer: answers[q.id]!,
        isPositive: answers[q.id] === q.positiveAnswer,
      }));

      // Create a temporary questionnaire object for preview
      const tempQuestionnaire: SavedQuestionnaire = {
        id: '', // Empty ID signifies unsaved
        user_id: user?.id || '',
        name: 'Novo Diagnóstico (Não salvo)',
        farm_id: selectedFarm.id,
        farm_name: selectedFarm.name,
        production_system: selectedFarm.productionSystem,
        questionnaire_id: questionnaireId,
        answers: answersPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setShowSuccess(true);

      setTimeout(() => {
        setIsSubmitting(false);
        setShowSuccess(false);
        setShowQuestionnaire(false);
        setViewResultsQuestionnaire(tempQuestionnaire);
        setAnswers({});
        setCurrentQuestionIndex(0);
      }, QUESTIONNAIRE_CONSTANTS.SUCCESS_DISPLAY_DURATION);
    } catch (err: any) {
      console.error(err);
      setIsSubmitting(false);
    }
  }, [selectedFarm, filteredQuestions, answers, user?.id, questionnaireId, onToast]);

  // Loading view
  if (loadingQuestions) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileCheck size={48} className="mx-auto text-ai-subtext/30 mb-3 animate-pulse" />
          <p className="text-sm text-ai-subtext">Carregando...</p>
        </div>
      </div>
    );
  }

  // View Results View
  if (selectedFarm && viewResultsQuestionnaire) {
    const isNewQuestionnaire = !viewResultsQuestionnaire.id;
    const isEditing = !!editingQuestionnaireId;

    return (
      <div className="h-full flex flex-col overflow-hidden">
        <QuestionnaireResultsDashboard
          questionnaire={viewResultsQuestionnaire}
          onClose={() => setViewResultsQuestionnaire(null)}
          onToast={onToast}
          onSave={isNewQuestionnaire ? handleManualSave : undefined}
          onUpdate={!isNewQuestionnaire || isEditing ? handleManualSave : undefined}
        />
      </div>
    );
  }

  // Active Questionnaire View
  if (selectedFarm && showQuestionnaire) {
    return (
      <QuestionnaireForm
        farm={selectedFarm}
        questions={filteredQuestions}
        currentQuestionIndex={currentQuestionIndex}
        answers={answers}
        showSuccess={showSuccess}
        isSubmitting={isSubmitting}
        onAnswer={(qId, ans) => {
          handleAnswerChange(qId, ans);
          // Auto advance safely
          if (autoAdvanceTimeout.current) {
            clearTimeout(autoAdvanceTimeout.current);
          }
          autoAdvanceTimeout.current = setTimeout(() => {
            setCurrentQuestionIndex(prev => {
              if (prev < filteredQuestions.length - 1) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return prev + 1;
              }
              return prev;
            });
          }, 300);
        }}
        onNext={() => {
          if (currentQuestionIndex < filteredQuestions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        onPrevious={() => {
          if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        onSubmit={handleSubmit}
        onExit={handleBackToFarms}
      />
    );
  }

  // Intro / Farm Selection View
  return (
    <QuestionnaireIntro
      selectedFarm={selectedFarm}
      farms={farms}
      isLoading={loadingQuestions}
      savedQuestionnaires={savedForFarm}
      onSelectFarm={handleFarmSelect}
      onStart={handleStartQuestionnaire}
      onBack={() => {
        if (!isControlled) handleBackToFarms();
      }}
      onView={q => setViewResultsQuestionnaire(q)}
      onEdit={handleEditQuestionnaire}
      onRename={handleUpdateName}
      onDelete={handleDelete}
      isUpdating={isUpdating}
      deletingId={deletingId}
    />
  );
};

export default QuestionnaireFiller;
