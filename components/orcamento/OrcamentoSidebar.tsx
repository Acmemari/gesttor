import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  TrendingUp,
  LineChart,
  DollarSign,
  Receipt,
  FlaskConical,
  Sparkles,
  Clock,
  ListTree,
} from 'lucide-react';
import type { OrcamentoView } from './types';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSwitchToGesttor: () => void;
  activeView: OrcamentoView;
  onViewChange: (view: OrcamentoView) => void;
}

type SubItem = {
  id: string;
  label: string;
  emBreve?: boolean;
  view?: OrcamentoView;
};

type SectionItem = {
  id: OrcamentoView | 'em-breve';
  label: string;
  icon: React.ElementType;
  view?: OrcamentoView;
  emBreve?: boolean;
  /** Quando presente, item vira expansível (chevron ▸/▾). */
  subItems?: SubItem[];
};

type Section = {
  id: string;
  label: string;
  items: SectionItem[];
};

const SECTIONS: Section[] = [
  {
    id: 'visoes',
    label: 'Visões',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
      { id: 'prev-real', label: 'Previsto × Realizado', icon: TrendingUp, view: 'prev-real', emBreve: true },
      { id: 'fluxo', label: 'Fluxo de Caixa', icon: LineChart, view: 'fluxo', emBreve: true },
    ],
  },
  {
    id: 'planejamento',
    label: 'Planejamento',
    items: [
      {
        id: 'receitas',
        label: 'Receitas',
        icon: DollarSign,
        view: 'receitas',
        emBreve: true,
        subItems: [
          { id: 'receitas-pecuarias', label: 'Pecuárias', emBreve: true },
          { id: 'receitas-agricolas', label: 'Agrícolas e Silviculturais', emBreve: true },
          { id: 'receitas-tropa', label: 'Tropa e Outros Animais', emBreve: true },
          { id: 'receitas-outros', label: 'Outros', emBreve: true },
          { id: 'receitas-outros-creditos', label: 'Outros Créditos', emBreve: true },
        ],
      },
      { id: 'despesas', label: 'Despesas', icon: Receipt, view: 'despesas' },
    ],
  },
  {
    id: 'inteligencia',
    label: 'Inteligência',
    items: [
      { id: 'simulador', label: 'Simulador', icon: FlaskConical, view: 'simulador', emBreve: true },
      { id: 'copiloto', label: 'Copiloto', icon: Sparkles, view: 'copiloto', emBreve: true },
    ],
  },
  {
    id: 'configuracao',
    label: 'Configuração',
    items: [
      { id: 'config:plano-contas', label: 'Plano de Contas', icon: ListTree, view: 'config:plano-contas' },
    ],
  },
];

export default function OrcamentoSidebar({
  isOpen,
  toggleSidebar,
  isCollapsed,
  onToggleCollapse,
  onSwitchToGesttor,
  activeView,
  onViewChange,
}: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['receitas']));

  function toggleItemExpansion(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Atalho `[` para colapsar/expandir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
        e.preventDefault();
        onToggleCollapse();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleCollapse]);

  if (!isOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="md:hidden fixed top-2 left-2 z-50 p-2 bg-white rounded-md border border-slate-200 shadow-sm"
        aria-label="Abrir menu"
      >
        <ChevronRight size={18} />
      </button>
    );
  }

  const widthClass = isCollapsed ? 'w-16' : 'w-60';

  return (
    <aside
      className={`fixed left-0 top-0 h-screen ${widthClass} bg-white border-r border-slate-200 flex flex-col transition-all duration-200 z-40`}
    >
      {/* Header com volta ao Gesttor */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-slate-200 shrink-0">
        <button
          onClick={onSwitchToGesttor}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 focus:outline-none"
          title="Voltar para Gesttor"
        >
          <ArrowLeft size={16} />
          {!isCollapsed && <span>Gesttor</span>}
        </button>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 focus:outline-none"
          aria-label={isCollapsed ? 'Expandir' : 'Colapsar'}
          title="Tecla [ alterna"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Título do workspace */}
      {!isCollapsed && (
        <div className="px-3 pt-3 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">Gestão Orçamentária</h2>
        </div>
      )}

      {/* Seções de navegação */}
      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => (
          <div key={section.id} className="mb-2">
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {section.label}
              </div>
            )}
            <ul>
              {section.items.map((item, idx) => {
                const Icon = item.icon;
                const isActive = item.view ? item.view === activeView : false;
                const disabled = item.emBreve;
                const hasSubItems = !!item.subItems && item.subItems.length > 0;
                const isExpanded = hasSubItems && expandedItems.has(item.id);
                return (
                  <li key={`${section.id}-${idx}`}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        disabled={disabled && !hasSubItems}
                        onClick={() => {
                          if (hasSubItems && !isCollapsed) {
                            toggleItemExpansion(item.id);
                            return;
                          }
                          if (item.view && !disabled) onViewChange(item.view);
                        }}
                        className={[
                          'group relative flex flex-1 items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                          isActive
                            ? 'bg-slate-900 text-white'
                            : disabled && !hasSubItems
                              ? 'text-slate-400 cursor-not-allowed opacity-60'
                              : 'text-slate-700 hover:bg-slate-100',
                          isCollapsed ? 'justify-center' : '',
                        ].join(' ')}
                        title={isCollapsed ? item.label : disabled && !hasSubItems ? 'Disponível em uma próxima versão' : undefined}
                      >
                        <Icon size={16} className="shrink-0" />
                        {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {!isCollapsed && hasSubItems && (
                          isExpanded
                            ? <ChevronDown size={12} className="text-slate-400" />
                            : <ChevronRight size={12} className="text-slate-400" />
                        )}
                        {!isCollapsed && !hasSubItems && disabled && (
                          <Clock size={12} className="text-slate-400" />
                        )}
                      </button>
                    </div>
                    {hasSubItems && isExpanded && !isCollapsed && (
                      <ul className="border-l border-slate-200 ml-6 my-1">
                        {item.subItems!.map((sub) => {
                          const subActive = sub.view ? sub.view === activeView : false;
                          const subDisabled = sub.emBreve && !sub.view;
                          return (
                            <li key={sub.id}>
                              <button
                                type="button"
                                disabled={subDisabled}
                                onClick={() => sub.view && onViewChange(sub.view)}
                                className={[
                                  'flex w-full items-center gap-2 pl-3 pr-3 py-1.5 text-xs text-left transition-colors',
                                  subActive
                                    ? 'bg-slate-900 text-white'
                                    : subDisabled
                                      ? 'text-slate-400 cursor-not-allowed'
                                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                                ].join(' ')}
                                title={subDisabled ? 'Disponível em uma próxima versão' : undefined}
                              >
                                <span className="flex-1 truncate">{sub.label}</span>
                                {sub.emBreve && !sub.view && <Clock size={10} className="text-slate-400" />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer fixo: marca inttegra Planejamento */}
      <div
        className={`border-t border-slate-200 shrink-0 flex items-center ${
          isCollapsed ? 'justify-center px-0 py-3' : 'gap-2 px-3 py-3'
        }`}
      >
        <span className="h-7 w-7 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0">
          <TrendingUp size={14} />
        </span>
        {!isCollapsed && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-bold text-slate-900">inttegra</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Planejamento
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
