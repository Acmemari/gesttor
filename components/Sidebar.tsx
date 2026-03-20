import React, { useState, useEffect } from 'react';
import { Agent, User } from '../types';
import { useLocation } from '../contexts/LocationContext';
import { APP_VERSION } from '../src/version';
import {
  Calculator,
  TrendingUp,
  Sprout,
  Settings,
  Lock,
  LogOut,
  Users,
  UserCircle,
  X,
  Save,
  Brain,
  Building2,
  Briefcase,
  FileCheck,
  ChevronDown,
  Target,
  FolderOpen,
  FolderPlus,
  LayoutDashboard,
  ListTodo,
  Calendar,
  BrainCircuit,
  HelpCircle,
  Bot,
  ClipboardList,
  MessageSquareText,
  Layers,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

interface SidebarProps {
  agents: Agent[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  user: User | null;
  onLogout: () => void;
  onSettingsClick?: () => void;
  onSwitchToInttegra?: () => void;
}

const PROJETO_ID = 'projeto';
const INICIATIVAS_OVERVIEW_ID = 'iniciativas-overview';
const INICIATIVAS_ATIVIDADES_ID = 'iniciativas-atividades';
const INICIATIVAS_KANBAN_ID = 'iniciativas-kanban';
const PROJECT_STRUCTURE_ID = 'project-structure';
const ROTINAS_FAZENDA_ID = 'rotinas-fazenda';
const CALENDAR_ID = 'calendar';
const RH_FEEDBACK_ID = 'rh-feedback-list';
const isGerenciamentoView = (id: string) =>
  id === PROJETO_ID ||
  id === INICIATIVAS_OVERVIEW_ID ||
  id === INICIATIVAS_ATIVIDADES_ID ||
  id === INICIATIVAS_KANBAN_ID ||
  id === PROJECT_STRUCTURE_ID ||
  id === ROTINAS_FAZENDA_ID ||
  id === CALENDAR_ID ||
  id === 'gestao-semanal';

const Sidebar: React.FC<SidebarProps> = ({
  agents,
  activeAgentId,
  onSelectAgent,
  isOpen,
  toggleSidebar,
  user,
  onLogout,
  onSettingsClick,
  onSwitchToInttegra,
}) => {
  const { country, setCountry, paraguayEnabled } = useLocation();
  const [isIniciativasOpen, setIsIniciativasOpen] = useState(() => isGerenciamentoView(activeAgentId));
  const [isRhOpen, setIsRhOpen] = useState(() => activeAgentId === RH_FEEDBACK_ID);
  const canAccessRh = user?.role === 'admin' || user?.role === 'client' || user?.qualification === 'analista';
  const isVisitor = user?.qualification === 'visitante';


  // Manter submenu Gerenciamento aberto quando um filho estiver ativo
  useEffect(() => {
    if (isGerenciamentoView(activeAgentId)) setIsIniciativasOpen(true);
  }, [activeAgentId]);

  useEffect(() => {
    if (activeAgentId === RH_FEEDBACK_ID) setIsRhOpen(true);
  }, [activeAgentId]);

  // isOpen = true → expanded (w-56), isOpen = false → collapsed icons only (w-14 on desktop, hidden on mobile)
  const collapsed = !isOpen;

  return (
    <>
      {/* Overlay - visible on mobile when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <div
        className={`
        fixed top-0 left-0 h-full bg-ai-surface border-r border-ai-border z-30 transition-all duration-300 ease-in-out flex flex-col shadow-lg
        ${isOpen
          ? 'w-56 translate-x-0'
          : '-translate-x-full md:translate-x-0 md:w-14'
        }
      `}
      >
        {/* Header */}
        <div className={`h-12 shrink-0 flex items-center border-b border-ai-border bg-ai-bg ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {!collapsed && <span className="text-sm font-bold text-ai-text tracking-wide">Gesttor</span>}
          <div className="flex items-center gap-1">
            {/* Collapse button - desktop: toggle between expanded/collapsed */}
            <button
              onClick={toggleSidebar}
              className="hidden md:flex p-1.5 text-ai-subtext hover:text-ai-text hover:bg-ai-surface rounded transition-colors"
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            </button>
            {/* Close button - visible on mobile only when expanded */}
            {!collapsed && (
              <button
                onClick={toggleSidebar}
                className="md:hidden p-1.5 text-ai-subtext hover:text-ai-text hover:bg-ai-surface rounded transition-colors"
                aria-label="Fechar menu"
                title="Fechar menu"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Bandeiras BR e PY - só quando Paraguai estiver habilitado */}
          {paraguayEnabled && (
            <div className={`mb-3 flex items-center gap-2 ${collapsed ? 'justify-center px-1' : 'justify-start px-4'}`}>
              <button
                onClick={() => setCountry('BR')}
                className={`flex items-center gap-1.5 flex-shrink-0 transition-all duration-200 ${country === 'BR' ? 'opacity-100 scale-[1.2]' : 'opacity-50 hover:opacity-75 scale-[0.72]'}`}
                title="Brasil"
              >
                <svg
                  width="20"
                  height="14"
                  viewBox="0 0 20 14"
                  className="flex-shrink-0 cursor-pointer"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="20" height="14" fill="#009739" />
                  <path d="M10 0L20 7L10 14L0 7Z" fill="#FEDD00" />
                  <circle cx="10" cy="7" r="4.5" fill="#012169" />
                </svg>
                {!collapsed && <span className="text-[8px] font-semibold">BR</span>}
              </button>
              {!collapsed && (
                <button
                  onClick={() => setCountry('PY')}
                  className={`flex items-center gap-1.5 flex-shrink-0 transition-all duration-200 ${country === 'PY' ? 'opacity-100 scale-[1.2]' : 'opacity-50 hover:opacity-75 scale-[0.72]'}`}
                  title="Paraguai"
                >
                  <svg
                    width="20"
                    height="14"
                    viewBox="0 0 20 14"
                    className="flex-shrink-0 cursor-pointer"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect width="20" height="4.67" y="0" fill="#CE1126" />
                    <rect width="20" height="4.67" y="4.67" fill="#FFFFFF" />
                    <rect width="20" height="4.66" y="9.34" fill="#0038A8" />
                  </svg>
                  <span className="text-[8px] font-semibold">PY</span>
                </button>
              )}
            </div>
          )}
          {!collapsed && (
            <div className="px-4 mb-2">
              <span className="text-[10px] font-bold text-ai-subtext uppercase tracking-widest">Ferramentas</span>
            </div>
          )}

          <nav className={`space-y-0.5 ${collapsed ? 'px-1' : 'px-2'}`}>
            {/* Cadastros - sempre primeiro */}
            {agents
              .filter(a => a.id === 'cadastros')
              .map(agent => {
                const isActive = activeAgentId === agent.id;
                const isLocked = agent.status !== 'active' || isVisitor;
                return (
                  <div key={agent.id} className="space-y-0.5 mb-1">
                    <button
                      onClick={() => !isLocked && onSelectAgent(agent.id)}
                      disabled={isLocked}
                      className={`
                      w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md transition-all relative group
                      ${isActive ? 'bg-ai-accent/10 text-ai-accent' : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'}
                      ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                      title={agent.name}
                    >
                      <div
                        className={`flex-shrink-0 ${isActive ? 'text-ai-accent' : 'text-ai-subtext group-hover:text-ai-text'}`}
                      >
                        <ClipboardList size={16} />
                      </div>
                      {!collapsed && <span className="ml-3 text-sm font-medium block text-left truncate">{agent.name}</span>}
                      {!collapsed && isLocked && (
                        <Lock size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-ai-subtext/50" />
                      )}
                    </button>
                  </div>
                );
              })}
            {/* Gerenciamento (menu retrátil: Projeto + Calendário) */}
            <div className="space-y-0.5 mb-1">
              <button
                type="button"
                onClick={() => !isVisitor && (collapsed ? onSelectAgent(PROJETO_ID) : setIsIniciativasOpen(!isIniciativasOpen))}
                disabled={isVisitor}
                className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2 rounded-md transition-all duration-200 text-left group ${
                  isVisitor
                    ? 'opacity-50 cursor-not-allowed text-ai-subtext'
                    : `cursor-pointer ${isGerenciamentoView(activeAgentId) ? 'bg-ai-accent/5 text-ai-accent' : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'}`
                }`}
                title="Gerenciamento"
              >
                <div className="flex items-center">
                  <FolderOpen size={16} className="flex-shrink-0 text-ai-subtext group-hover:text-ai-text" />
                  {!collapsed && <span className="ml-3 text-sm font-medium block truncate">Gerenciamento</span>}
                </div>
                {!collapsed && (
                  <ChevronDown
                    size={14}
                    className={`flex-shrink-0 transition-transform duration-200 ${isIniciativasOpen ? 'rotate-180' : ''}`}
                  />
                )}
              </button>
              {!collapsed && isIniciativasOpen && (
                <div className="ml-4 space-y-0.5 border-l border-ai-border pl-2 overflow-hidden transition-all duration-200">
                  <button
                    type="button"
                    onClick={() => !isVisitor && onSelectAgent(PROJETO_ID)}
                    disabled={isVisitor}
                    className={`w-full flex items-center px-2 py-1.5 rounded-md transition-all text-xs ${
                      isVisitor
                        ? 'opacity-50 cursor-not-allowed text-ai-subtext'
                        : activeAgentId === PROJETO_ID ||
                          activeAgentId === INICIATIVAS_OVERVIEW_ID ||
                          activeAgentId === INICIATIVAS_ATIVIDADES_ID ||
                          activeAgentId === INICIATIVAS_KANBAN_ID ||
                          activeAgentId === PROJECT_STRUCTURE_ID
                          ? 'bg-ai-accent/10 text-ai-accent'
                          : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'
                    }`}
                  >
                    <LayoutDashboard size={14} className="flex-shrink-0 mr-2" />
                    <span className="truncate">Projeto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => !isVisitor && onSelectAgent(ROTINAS_FAZENDA_ID)}
                    disabled={isVisitor}
                    className={`w-full flex items-center px-2 py-1.5 rounded-md transition-all text-xs ${
                      isVisitor
                        ? 'opacity-50 cursor-not-allowed text-ai-subtext'
                        : activeAgentId === ROTINAS_FAZENDA_ID
                          ? 'bg-ai-accent/10 text-ai-accent'
                          : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'
                    }`}
                  >
                    <ListTodo size={14} className="flex-shrink-0 mr-2" />
                    <span className="truncate">Rotinas Fazenda</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => !isVisitor && onSelectAgent(CALENDAR_ID)}
                    disabled={isVisitor}
                    className={`w-full flex items-center px-2 py-1.5 rounded-md transition-all text-xs ${
                      isVisitor
                        ? 'opacity-50 cursor-not-allowed text-ai-subtext'
                        : activeAgentId === CALENDAR_ID
                          ? 'bg-ai-accent/10 text-ai-accent'
                          : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'
                    }`}
                  >
                    <Calendar size={14} className="flex-shrink-0 mr-2" />
                    <span className="truncate">Calendário</span>
                  </button>
                </div>
              )}
            </div>

            {agents
              .filter(a => a.id !== 'cadastros' && a.id !== 'calendar' && a.id !== 'area-certificados')
              .map(agent => {
                const isActive = activeAgentId === agent.id;
                const isLockedByStatus = agent.status !== 'active';
                const isLockedForVisitor = isVisitor && agent.id !== 'ask-antonio';
                const isLocked = isLockedByStatus || isLockedForVisitor;

                return (
                  <React.Fragment key={agent.id}>
                    <button
                      onClick={() => !isLocked && onSelectAgent(agent.id)}
                      disabled={isLocked}
                      className={`
                      w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md transition-all relative group
                      ${
                        isActive
                          ? 'bg-ai-accent/10 text-ai-accent'
                          : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'
                      }
                      ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                      title={agent.name}
                    >
                      <div
                        className={`flex-shrink-0 ${isActive ? 'text-ai-accent' : 'text-ai-subtext group-hover:text-ai-text'}`}
                      >
                        {agent.icon === 'calculator' && <Calculator size={16} />}
                        {agent.icon === 'save' && <Save size={16} />}
                        {agent.icon === 'chart' && <TrendingUp size={16} />}
                        {agent.icon === 'nutrition' && <Sprout size={16} />}
                        {agent.icon === 'users' && <Users size={16} />}
                        {agent.icon === 'brain' && <Brain size={16} />}
                        {agent.icon === 'farm' && <Building2 size={16} />}
                        {agent.icon === 'target' && <Target size={16} />}
                        {agent.icon === 'folder' && <FolderOpen size={16} />}
                        {agent.icon === 'file-check' && <FileCheck size={16} />}
                        {agent.icon === 'calendar' && <Calendar size={16} />}
                        {agent.icon === 'brain-circuit' && <BrainCircuit size={16} />}
                        {agent.icon === 'bot' && <Bot size={16} />}
                        {agent.icon === 'help-circle' && <HelpCircle size={16} />}
                        {agent.icon === 'folder-plus' && <FolderPlus size={16} />}
                      </div>

                      {!collapsed && <span className="ml-3 text-sm font-medium block text-left truncate">{agent.name}</span>}

                      {!collapsed && isLocked && (
                        <Lock size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-ai-subtext/50" />
                      )}
                    </button>
                    {agent.id === 'cattle-profit' && canAccessRh && (
                      <div className="space-y-0.5 mb-1">
                        <button
                          type="button"
                          onClick={() => !isVisitor && (collapsed ? onSelectAgent(RH_FEEDBACK_ID) : setIsRhOpen(!isRhOpen))}
                          disabled={isVisitor}
                          className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2 rounded-md transition-all duration-200 text-left group ${
                            isVisitor
                              ? 'opacity-50 cursor-not-allowed text-ai-subtext'
                              : `cursor-pointer ${activeAgentId === RH_FEEDBACK_ID ? 'bg-ai-accent/5 text-ai-accent' : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'}`
                          }`}
                          title="Equipe"
                        >
                          <div className="flex items-center">
                            <Users size={16} className="flex-shrink-0 text-ai-subtext group-hover:text-ai-text" />
                            {!collapsed && <span className="ml-3 text-sm font-medium block truncate">Equipe</span>}
                          </div>
                          {!collapsed && (
                            <ChevronDown
                              size={14}
                              className={`flex-shrink-0 transition-transform duration-200 ${isRhOpen ? 'rotate-180' : ''}`}
                            />
                          )}
                        </button>
                        {!collapsed && isRhOpen && (
                          <div className="ml-4 space-y-0.5 border-l border-ai-border pl-2 overflow-hidden transition-all duration-200">
                            <button
                              type="button"
                              onClick={() => !isVisitor && onSelectAgent(RH_FEEDBACK_ID)}
                              disabled={isVisitor}
                              className={`w-full flex items-center px-2 py-1.5 rounded-md transition-all text-xs ${
                                isVisitor
                                  ? 'opacity-50 cursor-not-allowed text-ai-subtext'
                                  : activeAgentId === RH_FEEDBACK_ID
                                    ? 'bg-ai-accent/10 text-ai-accent'
                                    : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'
                              }`}
                            >
                              <MessageSquareText size={14} className="flex-shrink-0 mr-2" />
                              <span className="truncate">Feedback</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

            {/* Área Certificados - último item (oculto para cliente) */}
            {(user?.role === 'admin' || user?.qualification === 'analista') && (
              <button
                onClick={() => onSelectAgent('area-certificados')}
                className={`
                  w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md transition-all relative group
                  ${
                    activeAgentId === 'area-certificados'
                      ? 'bg-ai-accent/10 text-ai-accent'
                      : 'text-ai-subtext hover:bg-ai-surface2 hover:text-ai-text'
                  }
                  cursor-pointer
                `}
                title="Área Certificados"
              >
                <div
                  className={`flex-shrink-0 ${activeAgentId === 'area-certificados' ? 'text-ai-accent' : 'text-ai-subtext group-hover:text-ai-text'}`}
                >
                  <Briefcase size={16} />
                </div>
                {!collapsed && <span className="ml-3 text-sm font-medium block text-left truncate">Área Certificados</span>}
              </button>
            )}
          </nav>
        </div>

        {/* User Profile & Footer */}
        <div className={`border-t border-ai-border bg-ai-bg shrink-0 ${collapsed ? 'p-1.5' : 'p-3'}`}>
          {/* Switch to Inttegra - apenas admin */}
          {onSwitchToInttegra && user?.role === 'admin' && (
            <button
              type="button"
              onClick={onSwitchToInttegra}
              className={`w-full flex items-center ${collapsed ? 'justify-center p-2 mb-1' : 'gap-2 px-3 py-2 mb-3'} rounded-md text-sm font-medium text-ai-subtext hover:text-emerald-600 hover:bg-emerald-50 transition-colors`}
              title="Ir para Inttegra"
            >
              <Layers size={14} className="text-emerald-500" />
              {!collapsed && (
                <>
                  <span>Inttegra</span>
                  <ArrowLeftRight size={12} className="ml-auto opacity-50" />
                </>
              )}
            </button>
          )}

          {user && (
            <div className={`flex items-center ${collapsed ? 'justify-center mb-1' : 'mb-3 px-2 gap-3'}`}>
              <div className="w-8 h-8 rounded-full bg-ai-text text-white flex items-center justify-center text-xs font-bold shrink-0">
                {user.name.charAt(0)}
              </div>
              {!collapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-bold text-ai-text truncate">{user.name}</p>
                  <p className="text-[10px] text-ai-subtext truncate capitalize">
                    {user.role === 'admin' ? 'Administrador' : user.qualification}
                  </p>
                  <p className="text-[9px] text-ai-subtext font-bold uppercase tracking-wide mt-1">v{APP_VERSION} SaaS</p>
                </div>
              )}
            </div>
          )}

          <div className={`grid gap-1 ${collapsed ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={onSettingsClick}
              className="flex items-center justify-center p-2 text-ai-subtext hover:text-ai-text hover:bg-ai-surface2 rounded-md transition-colors"
              title="Configurações"
            >
              <Settings size={16} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center justify-center p-2 text-ai-subtext hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
