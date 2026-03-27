import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import InttegraSidebar from './components/InttegraSidebar';
import InttegraDashboard from './components/InttegraDashboard';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import ConvitePage from './components/ConvitePage';
import SubscriptionPage from './components/SubscriptionPage';
import SettingsPage from './components/SettingsPage';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocationProvider, useLocation } from './contexts/LocationContext';
import { useFarm } from './contexts/FarmContext';
import { HierarchyProvider, useHierarchy } from './contexts/HierarchyContext';
import AnalystHeader from './components/AnalystHeader';
import VisitorContentGuard from './components/VisitorContentGuard';
import Breadcrumb, { BreadcrumbItem } from './components/shared/Breadcrumb';
import { Agent } from './types';
import { Menu, Construction, Loader2, ArrowLeft, Plus } from 'lucide-react';
import { ToastContainer, Toast } from './components/Toast';
// Lazy load agents for code splitting
const CattleProfitCalculator = lazy(() => import('./agents/CattleProfitCalculator'));
const Comparator = lazy(() => import('./agents/Comparator'));
const CalculadorasDesktop = lazy(() => import('./agents/CalculadorasDesktop'));
const CadastrosDesktop = lazy(() => import('./agents/CadastrosDesktop'));
const AntonioChat = lazy(() => import('./agents/AntonioChat'));
const AntonioAdmin = lazy(() => import('./agents/AntonioAdmin'));
const AdminDashboard = lazy(() => import('./agents/AdminDashboard'));
const MarketTrends = lazy(() => import('./agents/MarketTrends'));
const SavedScenarios = lazy(() => import('./agents/SavedScenarios'));
const AIAgentConfigAdmin = lazy(() => import('./agents/AIAgentConfigAdmin'));
const FarmManagement = lazy(() => import('./agents/FarmManagement'));
const PerfisCargoConfig = lazy(() => import('./agents/PerfisCargoConfig'));
const EmpAssManagement = lazy(() => import('./agents/EmpAssManagement'));
const QuestionnaireFiller = lazy(() => import('./agents/QuestionnaireFiller'));
const ClientManagement = lazy(() => import('./agents/ClientManagement'));
const AgilePlanning = lazy(() => import('./agents/AgilePlanning'));
const AnalystManagement = lazy(() => import('./agents/AnalystManagement'));
const ClientDocuments = lazy(() => import('./agents/ClientDocuments'));
const InitiativesOverview = lazy(() => import('./agents/InitiativesOverview'));
const InitiativesActivities = lazy(() => import('./agents/InitiativesActivities'));
const InitiativesKanban = lazy(() => import('./agents/InitiativesKanban'));
const FeedbackAgent = lazy(() => import('./agents/FeedbackAgent'));
const ProjectStructureReport = lazy(() => import('./agents/ProjectStructureReport'));
const ProjetoDesktop = lazy(() => import('./agents/ProjetoDesktop'));
const PeopleManagement = lazy(() => import('./agents/PeopleManagement'));
const DeliveryManagement = lazy(() => import('./agents/DeliveryManagement'));
const ProjectManagement = lazy(() => import('./agents/ProjectManagement'));
const CalendarAgent = lazy(() => import('./agents/CalendarAgent'));
const SupportTicketsDashboard = lazy(() => import('./agents/SupportTicketsDashboard'));
const FeedbackList = lazy(() => import('./agents/FeedbackList'));
const AreaCertificadosDesktop = lazy(() => import('./agents/AreaCertificadosDesktop'));
const RotinasFazendaDesktop = lazy(() => import('./agents/RotinasFazendaDesktop'));
const GestaoSemanal = lazy(() => import('./agents/GestaoSemanal'));

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full">
    <Loader2 size={24} className="animate-spin text-ai-subtext" />
  </div>
);

const AppContent: React.FC = () => {
  const { user, isLoading, logout, checkPermission, upgradePlan, authError, refreshProfile } = useAuth();
  const { country } = useLocation();
  const { selectedFarm, setSelectedFarm } = useFarm();
  const { refreshCurrentLevel } = useHierarchy();
  const [activeApp, setActiveApp] = useState<'gesttor' | 'inttegra'>('gesttor');
  const prevActiveAppRef = React.useRef<'gesttor' | 'inttegra'>('gesttor');
  const [activeAgentId, setActiveAgentId] = useState<string>('cattle-profit');
  const [viewMode, setViewMode] = useState<
    'desktop' | 'simulator' | 'comparator' | 'agile-planning' | 'avaliacao-protocolo'
  >('desktop');
  const [cadastroView, setCadastroView] = useState<'desktop' | 'farm' | 'client' | 'people' | 'delivery' | 'project' | 'perfis-config' | 'emp-ass'>(
    'desktop',
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [calculatorInputs, setCalculatorInputs] = useState<any>(null);
  const [comparatorScenarios, setComparatorScenarios] = useState<any>(null);
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<any>(null);
  // Sidebar starts closed on mobile, open on desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // Check if we're on desktop (window width >= 768px)
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true; // Default to open for SSR
  });
  const [isInttegraSidebarCollapsed, setIsInttegraSidebarCollapsed] = useState(false);
  
  // Estado para controlar se está no formulário de fazendas
  const [isFarmFormView, setIsFarmFormView] = useState(false);
  const [farmFormLabel, setFarmFormLabel] = useState<'form-new' | 'form-edit'>('form-edit');
  // Estado para controlar se está no formulário de clientes
  const [isClientFormView, setIsClientFormView] = useState(false);
  const [clientFormLabel, setClientFormLabel] = useState<'form-new' | 'form-edit'>('form-edit');
  // Estado para controlar se está no formulário de pessoas
  const [isPeopleFormView, setIsPeopleFormView] = useState(false);
  const [peopleFormLabel, setPeopleFormLabel] = useState<'form-new' | 'form-edit'>('form-edit');
  const [inttegraActiveView, setInttegraActiveView] = useState('dashboard');

  const canAccessFeedbackAgent = user?.qualification === 'analista';

  // Recarregar hierarquia (organizações e fazendas) quando retornar ao workspace Pecuária
  useEffect(() => {
    if (prevActiveAppRef.current === 'inttegra' && activeApp === 'gesttor' && user) {
      void refreshCurrentLevel('clients');
    }
    prevActiveAppRef.current = activeApp;
  }, [activeApp, user, refreshCurrentLevel]);

  // Handle window resize to adjust sidebar state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && !isSidebarOpen) {
        setIsSidebarOpen(true);
      } else if (window.innerWidth < 768 && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen]);

  // Escutar mudanças de view do FarmManagement
  useEffect(() => {
    const handleFarmViewChange = (e: CustomEvent) => {
      setIsFarmFormView(e.detail === 'form' || e.detail === 'form-new' || e.detail === 'form-edit');
      if (e.detail === 'form-new') setFarmFormLabel('form-new');
      if (e.detail === 'form-edit' || e.detail === 'form') setFarmFormLabel('form-edit');
    };

    window.addEventListener('farmViewChange', handleFarmViewChange as EventListener);
    return () => {
      window.removeEventListener('farmViewChange', handleFarmViewChange as EventListener);
    };
  }, []);

  // Escutar mudanças de view do ClientManagement
  useEffect(() => {
    const handleClientViewChange = (e: CustomEvent) => {
      setIsClientFormView(e.detail === 'form' || e.detail === 'form-new' || e.detail === 'form-edit');
      if (e.detail === 'form-new') setClientFormLabel('form-new');
      if (e.detail === 'form-edit' || e.detail === 'form') setClientFormLabel('form-edit');
    };

    window.addEventListener('clientViewChange', handleClientViewChange as EventListener);
    return () => {
      window.removeEventListener('clientViewChange', handleClientViewChange as EventListener);
    };
  }, []);

  // Escutar mudanças de view do PeopleManagement
  useEffect(() => {
    const handlePeopleViewChange = (e: CustomEvent) => {
      setIsPeopleFormView(e.detail === 'form' || e.detail === 'form-new' || e.detail === 'form-edit');
      if (e.detail === 'form-new') setPeopleFormLabel('form-new');
      if (e.detail === 'form-edit' || e.detail === 'form') setPeopleFormLabel('form-edit');
    };

    window.addEventListener('peopleViewChange', handlePeopleViewChange as EventListener);
    return () => {
      window.removeEventListener('peopleViewChange', handlePeopleViewChange as EventListener);
    };
  }, []);

  const addToast = React.useCallback((toast: Toast) => {
    setToasts(prev => [...prev, toast]);
  }, []);

  const handleToast = React.useCallback(
    (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
      addToast({ id: Date.now().toString(), message, type });
    },
    [addToast],
  );

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Define available agents with SaaS permissions (memoized)
  const agents = useMemo(() => {
    if (isLoading || !user) {
      return [];
    }

    try {
      // Define all potential agents
      const cadastrosAgent: Agent = {
        id: 'cadastros',
        name: 'Cadastros',
        description: 'Fazendas, organizações e pessoas.',
        icon: 'folder-plus',
        category: 'zootecnico',
        status: 'active',
      };

      const cattleProfit: Agent = {
        id: 'cattle-profit',
        name: 'Assistentes',
        description: 'Análise econômica completa.',
        icon: 'bot',
        category: 'financeiro',
        status: checkPermission('Calculadora') ? 'active' : 'locked',
      };

      const clientDocuments: Agent = {
        id: 'client-documents',
        name: 'Documentos',
        description: 'Gerenciar documentos da mentoria',
        icon: 'folder',
        category: 'admin',
        status: 'active',
      };

      const clientManagement: Agent = {
        id: 'client-management',
        name: 'Cadastro de Organizações',
        description: 'Cadastrar e gerenciar organizações',
        icon: 'users',
        category: 'admin',
        status: user?.role === 'admin' || user?.qualification === 'analista' ? 'active' : 'locked',
      };

      const peopleManagement: Agent = {
        id: 'people-management',
        name: 'Cadastro de Pessoas',
        description: 'Colaboradores, consultores, fornecedores e clientes familiares',
        icon: 'users',
        category: 'admin',
        status: 'active',
      };

      const calendarAgent: Agent = {
        id: 'calendar',
        name: 'Calendário',
        description: 'Visualização de eventos em calendário mensal, semanal e diário',
        icon: 'calendar',
        category: 'zootecnico',
        status: 'active',
      };

      const savedScenarios: Agent = {
        id: 'saved-scenarios',
        name: country === 'PY' ? 'Mis Guardados' : 'Meus Salvos',
        description: 'Cenários e simulações salvos.',
        icon: 'save',
        category: 'financeiro',
        status: checkPermission('Calculadora') ? 'active' : 'locked',
      };

      const askAntonio: Agent = {
        id: 'ask-antonio',
        name: country === 'PY' ? 'PREGUNTE /Antonio' : 'Pergunte p/ Antonio',
        description: 'Consultor virtual especialista.',
        icon: 'nutrition',
        category: 'consultoria',
        status: 'active',
      };

      const analystManagement: Agent = {
        id: 'analyst-management',
        name: 'Gerenciamento de Analistas',
        description: 'Visualize analistas, organizações e fazendas de forma hierárquica',
        icon: 'users',
        category: 'admin',
        status: 'active',
      };

      const aiAgentConfig: Agent = {
        id: 'ai-config',
        name: 'Especialista IA',
        description: 'Configurar instruções dos agentes',
        icon: 'settings',
        category: 'admin',
        status: 'active',
      };

      const adminDashboard: Agent = {
        id: 'admin-dashboard',
        name: 'Gestão de Usuários',
        description: 'Painel mestre administrativo',
        icon: 'users',
        category: 'admin',
        status: 'active',
      };

      const supportTickets: Agent = {
        id: 'support-tickets',
        name: 'Suporte Interno',
        description: 'Gestão de tickets e mensagens de suporte',
        icon: 'help-circle',
        category: 'admin',
        status: 'active',
      };

      // Build the ordered list
      const orderedList: Agent[] = [];

      // 1. Cadastros (área de trabalho com cards: Fazendas, Clientes, Pessoas)
      orderedList.push(cadastrosAgent);

      // 2. Assistente (inclui Rentabilidade na Engorda, Comparador e Planejamento Ágil)
      orderedList.push(cattleProfit);

      // 3. Documentos
      orderedList.push(clientDocuments);

      // 8. Calendário
      orderedList.push(calendarAgent);

      // Others (at the end)
      orderedList.push(savedScenarios);
      orderedList.push(askAntonio);

      // Admin exclusives
      if (user?.role === 'admin') {
        orderedList.push(analystManagement);
        orderedList.push({
          id: 'antonio-admin',
          name: 'Antonio (Base RAG)',
          description: 'Gerenciar base de conhecimento do Antonio',
          icon: 'brain',
          category: 'admin',
          status: 'active',
        });
        orderedList.push(aiAgentConfig);
        orderedList.push(adminDashboard);
        orderedList.push(supportTickets);
      }

      return orderedList;
    } catch (error) {
      console.error('Erro ao calcular agents:', error);
      // Fallback
      return [
        {
          id: 'cadastros',
          name: 'Cadastros',
          description: 'Fazendas, organizações e pessoas.',
          icon: 'folder-plus',
          category: 'zootecnico' as const,
          status: 'active' as const,
        },
        {
          id: 'cattle-profit',
          name: 'Assistentes',
          description: 'Análise econômica completa.',
          icon: 'bot',
          category: 'financeiro' as const,
          status: 'active' as const,
        },
        {
          id: 'ask-antonio',
          name: country === 'PY' ? 'PREGUNTE /Antonio' : 'Pergunte p/ Antonio',
          description: 'Consultor virtual especialista.',
          icon: 'nutrition',
          category: 'consultoria' as const,
          status: 'active' as const,
        },
      ];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, country]);

  // Reset active agent if access is lost or on role change
  useEffect(() => {
    // Only run if user is loaded (not loading)
    if (isLoading || !user) return;

    if (activeAgentId === 'admin-dashboard' && user?.role !== 'admin') {
      setActiveAgentId('cattle-profit');
      return;
    }
    if (activeAgentId === 'support-tickets' && user?.role !== 'admin') {
      setActiveAgentId('cattle-profit');
      return;
    }

    // Redirect if trying to access locked agents (market-trends)
    const lockedAgents = ['market-trends'];
    if (lockedAgents.includes(activeAgentId)) {
      setActiveAgentId('cattle-profit');
      return;
    }

    if (activeAgentId === 'agent-feedback' && !canAccessFeedbackAgent) {
      setViewMode('desktop');
      setActiveAgentId('cattle-profit');
      return;
    }

    // Plano essencial: Assistentes e Meus Salvos não estão disponíveis
    const isEssencial = user?.plan === 'essencial' && user?.role !== 'admin';
    if (isEssencial && (activeAgentId === 'cattle-profit' || activeAgentId === 'saved-scenarios')) {
      setActiveAgentId('ask-antonio');
      return;
    }
  }, [user, activeAgentId, isLoading, canAccessFeedbackAgent]);

  // Agents devem sempre estar preenchidos aqui (user existe, isLoading é false).
  // O useMemo já tem try-catch com fallback. Este useEffect é só um log de diagnóstico.
  useEffect(() => {
    if (agents.length === 0 && !isLoading && user) {
      console.warn('[App] Agents vazios com user autenticado — possível erro no useMemo');
    }
  }, [agents.length, isLoading, user]);

  // Diagnóstico: log dos estados críticos de inicialização
  console.log('[App] isLoading:', isLoading, '| user:', !!user, '| agents:', agents.length, '| path:', window.location.pathname);

  // Auth routes — SignIn/SignUp/ForgotPassword/ResetPassword
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname === '/convite';

    if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) {
      // Se já está logado, vai para home
      if (user) {
        window.location.replace('/');
        return (
          <div className="h-screen w-screen flex items-center justify-center bg-ai-bg text-ai-text">
            <Loader2 size={32} className="animate-spin" />
          </div>
        );
      }
      return pathname.startsWith('/sign-in') ? <LoginPage onForgotPassword={() => window.location.replace('/forgot-password')} /> : <SignUpPage />;
    }

    // Forgot password — solicita email de recuperação
    if (pathname === '/forgot-password') {
      return (
        <ForgotPasswordPage
          onToast={handleToast}
          onBack={() => window.location.replace('/sign-in')}
        />
      );
    }

    // Reset password — redefine senha com token
    if (pathname === '/reset-password') {
      return (
        <ResetPasswordPage
          onToast={handleToast}
          onSuccess={() => window.location.replace('/sign-in')}
        />
      );
    }

    // Aceitar convite — cria conta via link de convite
    if (pathname === '/convite') {
      return (
        <ConvitePage
          onToast={handleToast}
          onSuccess={() => window.location.replace('/sign-in')}
        />
      );
    }

    // Legacy OAuth callback — redirect to home
    if (pathname === '/auth/callback') {
      window.location.replace('/');
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-ai-bg text-ai-text">
          <Loader2 size={32} className="animate-spin" />
        </div>
      );
    }
  }

  const isAuthPage = typeof window !== 'undefined' &&
    (window.location.pathname === '/sign-in' || window.location.pathname === '/sign-up' || window.location.pathname === '/forgot-password' || window.location.pathname === '/reset-password' || window.location.pathname === '/convite');

  if (authError && !isAuthPage) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-ai-bg text-ai-text p-6">
        <div className="bg-ai-surface p-8 border border-white/10 rounded-xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Erro de Autenticação</h2>
          <p className="text-ai-subtext mb-6">
            Não foi possível carregar seu perfil. O servidor pode estar indisponível.
          </p>
          <div className="flex gap-4 w-full">
            <button
              onClick={() => logout()}
              className="px-4 py-2 border border-white/20 text-ai-subtext w-full rounded hover:bg-white/5 transition"
            >
              Sair
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-ai-primary font-medium w-full text-white rounded hover:bg-ai-primary/90 transition shadow-lg shadow-ai-primary/30"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-ai-bg text-ai-text">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') {
      if (!isAuthPage) {
        window.location.replace('/sign-in');
      }
      
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-ai-bg text-ai-text">
          <Loader2 size={32} className="animate-spin" />
        </div>
      );
    }
    return null;
  }

  if (agents.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-ai-bg text-ai-text">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  const activeAgent = agents.find(a => a.id === activeAgentId);
  const isSubscriptionPage = activeAgentId === 'subscription';
  const isSettingsPage = activeAgentId === 'settings';
  const isProjeto = activeAgentId === 'projeto';
  const isIniciativasOverview = activeAgentId === 'iniciativas-overview';
  const isIniciativasAtividades = activeAgentId === 'iniciativas-atividades';
  const isIniciativasKanban = activeAgentId === 'iniciativas-kanban';
  const isProjectStructure = activeAgentId === 'project-structure';
  const isCalendar = activeAgentId === 'calendar';
  const isRotinasFazenda = activeAgentId === 'rotinas-fazenda';
  const isGestaoSemanal = activeAgentId === 'gestao-semanal';
  const isAreaCertificados = activeAgentId === 'area-certificados';
  const isProjetoSubView =
    isIniciativasOverview || isIniciativasAtividades || isIniciativasKanban || isProjectStructure;
  const isRhFeedbackList = activeAgentId === 'rh-feedback-list';
  const isProjectCadastro = activeAgentId === 'cadastros' && cadastroView === 'project';
  const isAvaliacaoProtocolo = activeAgentId === 'cattle-profit' && viewMode === 'avaliacao-protocolo';
  const headerTitle = isAvaliacaoProtocolo
    ? 'Avaliação Protocolo 5-3-9'
    : isProjeto
      ? 'Projeto'
      : isIniciativasOverview
        ? 'Visão Geral'
        : isIniciativasAtividades
          ? 'Atividades'
          : isIniciativasKanban
            ? 'Kanban'
            : isProjectStructure
              ? 'Estrutura do Projeto'
              : isCalendar
                ? 'Calendário'
                : isRotinasFazenda
                  ? 'Rotinas Fazenda'
                  : isGestaoSemanal
                    ? 'Rotina Semanal'
                    : isAreaCertificados
                    ? 'Área Certificados'
                    : isRhFeedbackList
                      ? 'RH - Feedback'
                      : isProjectCadastro
                        ? 'Projeto'
                        : activeAgent?.name;

  const renderContent = () => {
    if (activeAgentId === 'settings') {
      return (
        <SettingsPage
          user={user}
          onBack={() => setActiveAgentId('cattle-profit')}
          onToast={handleToast}
          onLogout={logout}
        />
      );
    }

    if (activeAgentId === 'subscription') {
      return (
        <SubscriptionPage
          user={user}
          onUpgrade={planId => {
            upgradePlan(planId as any);
            setActiveAgentId('cattle-profit');
          }}
          onBack={() => setActiveAgentId('cattle-profit')}
        />
      );
    }

    switch (activeAgentId) {
      case 'cattle-profit':
        if (viewMode === 'desktop') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <CalculadorasDesktop
                onSelectSimulator={() => setViewMode('simulator')}
                onSelectComparador={() => setViewMode('comparator')}
                onSelectPlanejamentoAgil={() => setViewMode('agile-planning')}
                onSelectAvaliacaoProtocolo={() => setViewMode('avaliacao-protocolo')}
                onSelectFeedbackAgent={() => setActiveAgentId('agent-feedback')}
                showPlanejamentoAgil={user?.role === 'admin' || user?.qualification === 'analista' || user?.qualification === 'cliente'}
                feedbackAgentUnlocked={canAccessFeedbackAgent}
              />
            </Suspense>
          );
        }
        if (viewMode === 'avaliacao-protocolo') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <QuestionnaireFiller
                questionnaireId="gente-gestao-producao"
                onToast={handleToast}
                initialData={editingQuestionnaire}
                onClearInitialData={() => setEditingQuestionnaire(null)}
              />
            </Suspense>
          );
        }
        if (viewMode === 'agile-planning') {
          return user?.role === 'admin' || user?.qualification === 'analista' || user?.qualification === 'cliente' ? (
            <Suspense fallback={<LoadingFallback />}>
              <AgilePlanning onToast={handleToast} />
            </Suspense>
          ) : (
            <div className="p-8 text-ai-subtext">Acesso negado.</div>
          );
        }
        if (viewMode === 'comparator') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <Comparator onToast={addToast} initialScenarios={comparatorScenarios} />
            </Suspense>
          );
        }
        return (
          <Suspense fallback={<LoadingFallback />}>
            <CattleProfitCalculator
              initialInputs={calculatorInputs}
              onToast={addToast}
              onNavigateToSaved={() => setActiveAgentId('saved-scenarios')}
            />
          </Suspense>
        );
      case 'saved-scenarios':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <SavedScenarios
              key="saved-scenarios"
              onLoadScenario={inputs => {
                setCalculatorInputs(inputs);
                setViewMode('simulator');
                setActiveAgentId('cattle-profit');
              }}
              onNavigateToCalculator={() => {
                setViewMode('simulator');
                setActiveAgentId('cattle-profit');
              }}
              onLoadComparator={scenarios => {
                setComparatorScenarios(scenarios);
                setViewMode('comparator');
                setActiveAgentId('cattle-profit');
              }}
              onNavigateToComparator={() => {
                setViewMode('comparator');
                setActiveAgentId('cattle-profit');
              }}
              onEditQuestionnaire={q => {
                setEditingQuestionnaire(q);
                setViewMode('avaliacao-protocolo');
                setActiveAgentId('cattle-profit');
              }}
              onToast={addToast}
            />
          </Suspense>
        );
      case 'ask-antonio':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <AntonioChat />
          </Suspense>
        );
      case 'antonio-admin':
        return user.role === 'admin' ? (
          <Suspense fallback={<LoadingFallback />}>
            <AntonioAdmin />
          </Suspense>
        ) : (
          <div className="p-8 text-sm text-ai-subtext">Acesso restrito a administradores.</div>
        );
      case 'market-trends':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <MarketTrends />
          </Suspense>
        );
      case 'cadastros':
        if (cadastroView === 'desktop') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <CadastrosDesktop
                onSelectProjeto={() => setCadastroView('project')}
                onSelectFazendas={() => setCadastroView('farm')}
                onSelectClientes={() => setCadastroView('client')}
                onSelectPessoas={() => setCadastroView('people')}
                onSelectPerfisConfig={user?.role === 'admin' ? () => setCadastroView('perfis-config') : undefined}
                onSelectEmpAss={user?.role === 'admin' ? () => setCadastroView('emp-ass') : undefined}
                showClientes={user?.role === 'admin' || user?.qualification === 'analista'}
                showEmpAss={user?.role === 'admin'}
              />
            </Suspense>
          );
        }
        if (cadastroView === 'project') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <ProjectManagement onToast={handleToast} />
            </Suspense>
          );
        }
        if (cadastroView === 'farm') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <FarmManagement onToast={handleToast} />
            </Suspense>
          );
        }
        if (cadastroView === 'client') {
          if (user?.qualification === 'visitante') {
            return (
              <VisitorContentGuard
                isVisitor
                isAllowed={false}
                featureName="Cadastro de Organizações"
              >
                <div className="p-8 bg-ai-surface min-h-[200px]" />
              </VisitorContentGuard>
            );
          }
          return user?.role === 'admin' || user?.qualification === 'analista' ? (
            <Suspense fallback={<LoadingFallback />}>
              <ClientManagement onToast={handleToast} />
            </Suspense>
          ) : (
            <div className="p-8 text-ai-subtext">Acesso negado.</div>
          );
        }
        if (cadastroView === 'perfis-config') {
          return user?.role === 'admin' ? (
            <Suspense fallback={<LoadingFallback />}>
              <PerfisCargoConfig onToast={handleToast} />
            </Suspense>
          ) : (
            <div className="p-8 text-gray-500">Acesso restrito a administradores.</div>
          );
        }
        if (cadastroView === 'emp-ass') {
          return user?.role === 'admin' ? (
            <Suspense fallback={<LoadingFallback />}>
              <EmpAssManagement onToast={handleToast} onBack={() => setCadastroView('desktop')} />
            </Suspense>
          ) : (
            <div className="p-8 text-gray-500">Acesso restrito a administradores.</div>
          );
        }
        if (cadastroView === 'delivery') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <DeliveryManagement onToast={handleToast} />
            </Suspense>
          );
        }
        return (
          <Suspense fallback={<LoadingFallback />}>
            <PeopleManagement onToast={handleToast} />
          </Suspense>
        );
      case 'ai-config':
        if (user.qualification === 'visitante') {
          return <VisitorContentGuard isVisitor isAllowed={false} featureName="Especialista IA"><div className="p-8 bg-ai-surface min-h-[200px]" /></VisitorContentGuard>;
        }
        return user.role === 'admin' ? (
          <Suspense fallback={<LoadingFallback />}>
            <AIAgentConfigAdmin />
          </Suspense>
        ) : (
          <div>Acesso negado.</div>
        );
      case 'admin-dashboard':
        if (user.qualification === 'visitante') {
          return <VisitorContentGuard isVisitor isAllowed={false} featureName="Gestão de Usuários"><div className="p-8 bg-ai-surface min-h-[200px]" /></VisitorContentGuard>;
        }
        return user.role === 'admin' ? (
          <Suspense fallback={<LoadingFallback />}>
            <AdminDashboard />
          </Suspense>
        ) : (
          <div>Acesso negado.</div>
        );
      case 'support-tickets':
        if (user.qualification === 'visitante') {
          return <VisitorContentGuard isVisitor isAllowed={false} featureName="Suporte Interno"><div className="p-8 bg-ai-surface min-h-[200px]" /></VisitorContentGuard>;
        }
        return user.role === 'admin' ? (
          <Suspense fallback={<LoadingFallback />}>
            <SupportTicketsDashboard />
          </Suspense>
        ) : (
          <div>Acesso negado.</div>
        );
      case 'analyst-management':
        if (user.qualification === 'visitante') {
          return <VisitorContentGuard isVisitor isAllowed={false} featureName="Gerenciamento de Analistas"><div className="p-8 bg-ai-surface min-h-[200px]" /></VisitorContentGuard>;
        }
        return user.role === 'admin' ? (
          <Suspense fallback={<LoadingFallback />}>
            <AnalystManagement onToast={handleToast} />
          </Suspense>
        ) : (
          <div className="flex items-center justify-center h-full text-red-500">
            Acesso negado. Apenas administradores podem acessar esta página.
          </div>
        );
      case 'agile-planning':
        return user.role === 'admin' || user.qualification === 'analista' || user.qualification === 'cliente' ? (
          <Suspense fallback={<LoadingFallback />}>
            <AgilePlanning onToast={handleToast} />
          </Suspense>
        ) : (
          <div>Acesso negado.</div>
        );
      case 'agent-feedback':
        if (!canAccessFeedbackAgent) {
          return <div className="p-8 text-ai-subtext">Acesso negado.</div>;
        }
        return (
          <Suspense fallback={<LoadingFallback />}>
            <FeedbackAgent onToast={handleToast} />
          </Suspense>
        );
      case 'rh-feedback-list':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <FeedbackList onToast={handleToast} />
          </Suspense>
        );
      case 'client-documents':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ClientDocuments onToast={handleToast} />
          </Suspense>
        );
      case 'projeto':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ProjetoDesktop
              onSelectOverview={() => setActiveAgentId('iniciativas-overview')}
              onSelectAtividades={() => setActiveAgentId('iniciativas-atividades')}
              onSelectKanban={() => setActiveAgentId('iniciativas-kanban')}
              onSelectEstrutura={() => setActiveAgentId('project-structure')}
            />
          </Suspense>
        );
      case 'iniciativas-overview':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <InitiativesOverview />
          </Suspense>
        );
      case 'iniciativas-atividades':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ErrorBoundary
              fallback={
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <p className="text-sm font-medium text-ai-text mb-2">Erro ao carregar Atividades</p>
                  <p className="text-xs text-ai-subtext text-center max-w-sm mb-4">
                    Ocorreu um erro inesperado. Tente recarregar a página ou voltar ao menu.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 rounded-md bg-ai-accent text-white text-sm font-medium hover:opacity-90"
                    >
                      Recarregar
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAgentId('projeto')}
                      className="px-4 py-2 rounded-md border border-ai-border text-ai-text text-sm font-medium hover:bg-ai-surface2"
                    >
                      Voltar ao Projeto
                    </button>
                  </div>
                </div>
              }
            >
              <InitiativesActivities onToast={handleToast} />
            </ErrorBoundary>
          </Suspense>
        );
      case 'iniciativas-kanban':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <InitiativesKanban onToast={handleToast} />
          </Suspense>
        );
      case 'project-structure':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ProjectStructureReport onToast={handleToast} />
          </Suspense>
        );
      case 'calendar':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <CalendarAgent />
          </Suspense>
        );
      case 'rotinas-fazenda':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <RotinasFazendaDesktop onSelectRotinaSemanal={() => setActiveAgentId('gestao-semanal')} />
          </Suspense>
        );
      case 'gestao-semanal':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <GestaoSemanal onToast={handleToast} />
          </Suspense>
        );
      case 'area-certificados':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <AreaCertificadosDesktop />
          </Suspense>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-ai-subtext">
            <Construction size={32} className="mb-3 opacity-30" />
            <h2 className="text-lg font-medium mb-1 text-ai-text">Em Desenvolvimento</h2>
            <p className="text-sm">O agente estará disponível em breve.</p>
          </div>
        );
    }
  };

  if (activeApp === 'inttegra') {
    return (
      <div className="flex h-screen w-full bg-ai-bg overflow-hidden font-sans text-ai-text">
        <InttegraSidebar
          isOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isCollapsed={isInttegraSidebarCollapsed}
          onToggleCollapse={() => setIsInttegraSidebarCollapsed(!isInttegraSidebarCollapsed)}
          user={user}
          onLogout={logout}
          onSettingsClick={() => {
            setActiveApp('gesttor');
            setActiveAgentId('settings');
          }}
          onSwitchToGesttor={() => setActiveApp('gesttor')}
          onViewChange={setInttegraActiveView}
        />

        <div
          className={`flex-1 min-w-0 flex flex-col h-full transition-all duration-300 relative ${isSidebarOpen ? (isInttegraSidebarCollapsed ? 'md:ml-16' : 'md:ml-64') : 'ml-0'}`}
        >
          <AnalystHeader />

          <header className="h-12 bg-ai-bg border-b border-ai-border flex items-center justify-between px-4 shrink-0 sticky top-12 z-40">
            <div className="flex items-center gap-2 md:gap-0">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 text-ai-subtext hover:text-ai-text rounded hover:bg-ai-surface mr-1 md:mr-3 focus:outline-none transition-colors"
                aria-label={isSidebarOpen ? 'Fechar menu' : 'Abrir menu'}
                aria-expanded={isSidebarOpen}
                title={isSidebarOpen ? 'Fechar menu' : 'Abrir menu'}
              >
                <Menu size={20} />
              </button>
              <h1 className="text-sm font-semibold text-ai-text flex items-center gap-2 truncate max-w-[120px] md:max-w-none">
                Inttegra
              </h1>
            </div>
          </header>

          <main className="flex-1 min-h-0 bg-ai-bg overflow-hidden">
            <div className="h-full w-full max-w-[1600px] mx-auto flex flex-col min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <InttegraDashboard view={inttegraActiveView} />
              </div>
            </div>
          </main>
        </div>

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-ai-bg overflow-hidden font-sans text-ai-text">
      {/* Sidebar Navigation */}
      <Sidebar
        agents={agents}
        activeAgentId={activeAgentId}
        onSelectAgent={id => {
          if (id === 'cattle-profit') setViewMode('desktop');
          if (id === 'cadastros') setCadastroView('desktop');
          setActiveAgentId(id);
        }}
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        user={user}
        onLogout={logout}
        onSettingsClick={() => setActiveAgentId('settings')}
        onSwitchToInttegra={() => setActiveApp('inttegra')}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 min-w-0 flex flex-col h-full transition-all duration-300 relative ${isSidebarOpen ? 'md:ml-56' : 'md:ml-14'}`}
      >
        {/* Analyst Header - Above main header */}
        <AnalystHeader />

        {/* Header - Minimalist with hamburger button */}
        <header className="h-12 bg-ai-bg border-b border-ai-border flex items-center justify-between px-4 shrink-0 sticky top-12 z-40">
          <div className="flex items-center gap-2 md:gap-0">
            {/* Título / Breadcrumb */}
            {activeAgentId === 'cadastros' ? (
              <Breadcrumb
                items={(() => {
                  const items: BreadcrumbItem[] = [
                    { label: 'Cadastros', onClick: () => setCadastroView('desktop') },
                  ];
                  if (cadastroView === 'desktop') {
                    // só raíz — sem clique no último item
                    return [{ label: 'Cadastros' }];
                  }
                  const subLabel =
                    cadastroView === 'farm' ? 'Fazendas'
                    : cadastroView === 'client' ? 'Organizações'
                    : cadastroView === 'people' ? 'Pessoas'
                    : cadastroView === 'perfis-config' ? 'Perfis e Cargos'
                    : cadastroView === 'project' ? 'Projeto'
                    : cadastroView === 'delivery' ? 'Entregas'
                    : 'Cadastro';

                  const cancelEvent =
                    cadastroView === 'farm' ? 'farmCancelForm'
                    : cadastroView === 'client' ? 'clientCancelForm'
                    : 'peopleCancelForm';

                  const isFormView =
                    (cadastroView === 'farm' && isFarmFormView) ||
                    (cadastroView === 'client' && isClientFormView) ||
                    (cadastroView === 'people' && isPeopleFormView);

                  if (!isFormView) {
                    items.push({ label: subLabel });
                    return items;
                  }

                  // 3º nível: formulário
                  items.push({
                    label: subLabel,
                    onClick: () => window.dispatchEvent(new CustomEvent(cancelEvent)),
                  });
                  const formTitle =
                    cadastroView === 'farm'
                      ? (farmFormLabel === 'form-new' ? 'Nova Fazenda' : 'Editar Fazenda')
                    : cadastroView === 'client'
                      ? (clientFormLabel === 'form-new' ? 'Nova Organização' : 'Editar Organização')
                    : (peopleFormLabel === 'form-new' ? 'Nova Pessoa' : 'Editar Pessoa');
                  items.push({ label: formTitle });
                  return items;
                })()}
              />
            ) : (
              <h1 className="text-sm font-semibold text-ai-text flex items-center gap-2 truncate max-w-[120px] md:max-w-none">
                {isSettingsPage ? 'Configurações' : isSubscriptionPage ? 'Assinatura e Planos' : headerTitle}
              </h1>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Novo Cliente quando estiver na lista de clientes */}
            {((activeAgentId === 'cadastros' && cadastroView === 'client') || activeAgentId === 'client-management') &&
              !isClientFormView && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('clientNewClient'));
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 transition-colors text-sm"
                >
                  <Plus size={16} />
                  Nova Organização
                </button>
              )}
            {activeAgentId === 'cattle-profit' && viewMode !== 'desktop' && (
              <button
                onClick={() => setViewMode('desktop')}
                className="flex items-center gap-1.5 text-ai-subtext hover:text-ai-text transition-colors cursor-pointer text-sm px-2 py-1"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            {isProjetoSubView && (
              <button
                onClick={() => setActiveAgentId('projeto')}
                className="flex items-center gap-1.5 text-ai-subtext hover:text-ai-text transition-colors cursor-pointer text-sm px-2 py-1"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            {isGestaoSemanal && (
              <button
                onClick={() => setActiveAgentId('rotinas-fazenda')}
                className="flex items-center gap-1.5 text-ai-subtext hover:text-ai-text transition-colors cursor-pointer text-sm px-2 py-1"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
          </div>
        </header>

        {/* Workspace */}
        <main className="flex-1 min-h-0 bg-ai-bg overflow-hidden">
          <div className="h-full w-full max-w-[1600px] mx-auto flex flex-col min-h-0">
            <ErrorBoundary>
              <div className="flex-1 min-h-0 overflow-y-auto">{renderContent()}</div>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <LocationProvider>
        <HierarchyProvider>
          <AppContent />
        </HierarchyProvider>
      </LocationProvider>
    </AuthProvider>
  );
};

export default App;
