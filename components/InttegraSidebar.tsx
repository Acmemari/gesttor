import React, { useState } from 'react';
import { User } from '../types';
import { APP_VERSION } from '../src/version';
import ProdutoCadastroModal from './ProdutoCadastroModal';
import {
  Settings,
  LogOut,
  X,
  Search,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Beef,
  Package,
  Tractor,
  Sprout,
  CloudRain,
  ClipboardList,
  RefreshCw,
  Leaf,
  Star,
  Clock,
} from 'lucide-react';

interface InttegraSidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  user: User | null;
  onLogout: () => void;
  onSettingsClick?: () => void;
  onSwitchToPecuaria: () => void;
  onViewChange?: (view: string) => void;
}

const INTEGRA_SIDEBAR_BG = '#1A212E';
const INTEGRA_SURFACE = '#37404E';
const INTEGRA_TEXT = '#FFFFFF';
const INTEGRA_PLACEHOLDER = '#A9B0BB';
const INTEGRA_ACCENT = '#65C04A';
const INTEGRA_BORDER = '#5E6D82';

const LOGO_SRC = '/inttegra-logo.png';

type SubItem = { label: string; icon?: 'chevron' | 'star' };
type ExpandableItem = { id: string; label: string; icon: React.ElementType; subItems: SubItem[] };

const expandableSections: ExpandableItem[] = [
  {
    id: 'pecuaria',
    label: 'Pecuária',
    icon: Beef,
    subItems: [
      { label: 'Cadastros', icon: 'chevron' },
      { label: 'Movimentações', icon: 'chevron' },
      { label: 'Efetivo Pecuário', icon: 'chevron' },
      { label: 'Reprodução', icon: 'chevron' },
      { label: 'Aprovações', icon: 'chevron' },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    icon: Package,
    subItems: [
      { label: 'Cadastros', icon: 'chevron' },
      { label: 'Movimentações', icon: 'chevron' },
      { label: 'Relatórios', icon: 'chevron' },
    ],
  },
  {
    id: 'maquinas',
    label: 'Máquinas',
    icon: Tractor,
    subItems: [
      { label: 'Cadastros', icon: 'chevron' },
      { label: 'Movimentações', icon: 'chevron' },
    ],
  },
  {
    id: 'agricultura',
    label: 'Agricultura',
    icon: Sprout,
    subItems: [
      { label: 'Cadastros', icon: 'chevron' },
      { label: 'Movimentações', icon: 'chevron' },
    ],
  },
  {
    id: 'clima',
    label: 'Clima',
    icon: CloudRain,
    subItems: [
      { label: 'Cadastros', icon: 'chevron' },
      { label: 'Movimentações', icon: 'chevron' },
    ],
  },
  {
    id: 'planejamento',
    label: 'Planejamento Fazenda',
    icon: ClipboardList,
    subItems: [
      { label: 'DISC', icon: 'star' },
      { label: 'Mapa Cultural', icon: 'star' },
      { label: 'Metas', icon: 'chevron' },
    ],
  },
  {
    id: 'rotinas',
    label: 'Rotinas Gerenciais',
    icon: RefreshCw,
    subItems: [
      { label: 'Tarefas', icon: 'star' },
      { label: 'Painel de Consultas', icon: 'chevron' },
      { label: 'Terminação Intensiva a Pasto (TIP)', icon: 'star' },
      { label: 'Desempenho Animal', icon: 'star' },
      { label: 'Evolução de Categoria Individual', icon: 'star' },
    ],
  },
  {
    id: 'sustentabilidade',
    label: 'Sustentabilidade',
    icon: Leaf,
    subItems: [{ label: 'Saúde e Bem-Estar Animal', icon: 'star' }],
  },
  {
    id: 'cadastros-gerais',
    label: 'Cadastros Gerais',
    icon: Settings,
    subItems: [
      { label: 'Smart Start', icon: 'star' },
      { label: 'Propriedades', icon: 'chevron' },
      { label: 'Safras', icon: 'chevron' },
      { label: 'Dispositivos', icon: 'chevron' },
      { label: 'Importação Resultta', icon: 'star' },
    ],
  },
];

const simpleItems: { label: string; icon: React.ElementType }[] = [
  { label: 'Favoritos', icon: Star },
  { label: 'Recentes', icon: Clock },
];

const financeiroHierarchy = {
  cadastros: [
    'Produtos',
    'Grupo de Projetos',
    'Contas',
    'Centros de Custo',
    'Pessoas',
    'Natureza da Operação',
    'Certificado Digital',
    'Matriz Fiscal',
  ],
  movimentacoes: [
    'Receita',
    'Despesa',
    'Transferência entre Contas',
    'Conciliação Bancária',
  ],
  relatorios: [
    'Movimentação de Caixa',
    'Balanço Mensal',
    'Balancete',
    'Despesas e Receitas',
  ],
};

const InttegraSidebar: React.FC<InttegraSidebarProps> = ({
  isOpen,
  toggleSidebar,
  isCollapsed,
  onToggleCollapse,
  user,
  onLogout,
  onSettingsClick,
  onSwitchToPecuaria,
  onViewChange,
}) => {
  const [isFinanceiroOpen, setIsFinanceiroOpen] = useState(false);
  const [openFinanceiroSub, setOpenFinanceiroSub] = useState<Record<string, boolean>>({
    cadastros: false,
    movimentacoes: false,
    relatorios: false,
  });
  const [isProdutoModalOpen, setIsProdutoModalOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    pecuaria: false,
    estoque: false,
    maquinas: false,
    agricultura: false,
    clima: false,
    planejamento: false,
    rotinas: false,
    sustentabilidade: false,
    'cadastros-gerais': false,
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFinanceiroSub = (id: string) => {
    setOpenFinanceiroSub(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const sidebarWidth = isCollapsed ? 'w-16' : 'w-64';
  const sidebarVisible = isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden';

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <div
        className={`
          fixed top-0 left-0 h-full z-30 transition-all duration-300 ease-in-out flex flex-col shadow-lg
          ${isOpen ? `${sidebarWidth} translate-x-0` : sidebarVisible}
        `}
        style={{ backgroundColor: INTEGRA_SIDEBAR_BG }}
      >
        {/* Logo - imagem exata no topo */}
        <div
          className={`shrink-0 flex items-center border-b relative ${isCollapsed ? 'justify-center py-3 px-2' : 'justify-between py-4 px-4'}`}
          style={{ borderColor: INTEGRA_BORDER }}
        >
          {isCollapsed ? (
            <>
              <img
                src={LOGO_SRC}
                alt="Inttegra"
                className="h-8 w-8 object-contain"
              />
              <button
                onClick={onSwitchToPecuaria}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:opacity-90"
                style={{ backgroundColor: INTEGRA_SURFACE, color: INTEGRA_TEXT }}
                title="Voltar para Gesttor"
                aria-label="Voltar para Gesttor"
              >
                <ArrowLeft size={14} />
              </button>
            </>
          ) : (
            <>
              <img
                src={LOGO_SRC}
                alt="Inttegra"
                className="h-8 object-contain max-w-[180px]"
              />
              <div className="flex items-center gap-1">
                <button
                  onClick={onSwitchToPecuaria}
                  className="p-1.5 rounded transition-colors hover:opacity-90"
                  style={{ backgroundColor: INTEGRA_SURFACE, color: INTEGRA_TEXT }}
                  title="Voltar para Gesttor"
                  aria-label="Voltar para Gesttor"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={toggleSidebar}
                  className="md:hidden p-1.5 rounded transition-colors hover:opacity-90"
                  style={{ backgroundColor: INTEGRA_SURFACE, color: INTEGRA_TEXT }}
                  aria-label="Fechar menu"
                  title="Fechar menu"
                >
                  <X size={18} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Navigation Area */}
        <div className="flex-1 min-h-0 overflow-y-auto pt-4 pb-2 px-0 space-y-0.5">
          {/* Painel Inicial */}
          <div
            className={`flex items-center transition-colors hover:bg-white/5 cursor-pointer ${isCollapsed ? 'justify-center p-2' : 'py-2 pr-4 pl-[16px] border-l-[3px] border-transparent'}`}
            style={{ color: INTEGRA_TEXT }}
          >
            {!isCollapsed && <span className="text-[13px]">Painel Inicial</span>}
          </div>

          {/* Financeiro */}
          <div>
            <button
              type="button"
              onClick={() => !isCollapsed && setIsFinanceiroOpen(!isFinanceiroOpen)}
              className={`w-full flex items-center transition-colors hover:bg-white/5 ${isCollapsed ? 'justify-center p-2' : 'justify-between py-2 pr-4 pl-[13px] border-l-[3px]'}`}
              style={{
                color: isFinanceiroOpen ? INTEGRA_ACCENT : INTEGRA_TEXT,
                borderColor: isFinanceiroOpen ? INTEGRA_ACCENT : 'transparent',
                backgroundColor: isFinanceiroOpen ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}
              title="Financeiro"
            >
              {!isCollapsed && <span className="text-[13px] font-semibold">Financeiro</span>}
              {!isCollapsed && (isFinanceiroOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
            </button>
            {!isCollapsed && isFinanceiroOpen && (
              <div className="ml-[16px] mr-0 mt-1 space-y-0.5 border-l" style={{ borderColor: INTEGRA_BORDER }}>
                {([
                  { id: 'cadastros', label: 'Cadastros' },
                  { id: 'movimentacoes', label: 'Movimentações' },
                  { id: 'relatorios', label: 'Relatórios' },
                ] as const).map(({ id, label }) => (
                  <div key={id}>
                    <button
                      type="button"
                      onClick={() => toggleFinanceiroSub(id)}
                      className="w-full flex items-center justify-between pl-4 pr-4 py-1.5 hover:bg-white/5 transition-colors"
                      style={{ color: openFinanceiroSub[id] ? INTEGRA_ACCENT : INTEGRA_TEXT }}
                    >
                      <span className="text-[13px] truncate">{label}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${openFinanceiroSub[id] ? 'rotate-180' : ''}`}
                        style={{ color: INTEGRA_PLACEHOLDER }}
                      />
                    </button>
                    {openFinanceiroSub[id] && (
                      <div className="ml-4 border-l space-y-0.5" style={{ borderColor: INTEGRA_BORDER }}>
                        {financeiroHierarchy[id].map(subItem => (
                          <div
                            key={subItem}
                            className="flex items-center justify-between pl-4 pr-4 py-1.5 hover:bg-white/5 cursor-pointer transition-colors"
                            style={{ color: INTEGRA_TEXT }}
                            onClick={() => {
                              if (subItem === 'Produtos') {
                                setIsProdutoModalOpen(true);
                              }
                            }}
                          >
                            <span className="text-[13px] truncate">{subItem}</span>
                            <Star size={14} className="flex-shrink-0 opacity-0 hover:opacity-100" style={{ color: INTEGRA_PLACEHOLDER }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expandable sections (Pecuária, Estoque, etc.) */}
          {expandableSections.map(({ id, label, icon: Icon, subItems }) => {
            const isOpen = openSections[id] ?? false;
            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => !isCollapsed && toggleSection(id)}
                  className={`w-full flex items-center transition-colors hover:bg-white/5 ${isCollapsed ? 'justify-center p-2' : 'justify-between py-2 pr-4 pl-[13px] border-l-[3px]'}`}
                  style={{
                    color: isOpen ? INTEGRA_ACCENT : INTEGRA_TEXT,
                    borderColor: isOpen ? INTEGRA_ACCENT : 'transparent',
                    backgroundColor: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}
                  title={label}
                >
                  {!isCollapsed && <span className={`text-[13px] ${isOpen ? 'font-semibold' : ''}`}>{label}</span>}
                  {!isCollapsed && (isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                </button>
                {!isCollapsed && isOpen && (
                  <div className="ml-[16px] mr-0 mt-1 space-y-0.5 border-l" style={{ borderColor: INTEGRA_BORDER }}>
                    {subItems.map(sub => (
                      <div
                        key={sub.label}
                        className="flex items-center justify-between gap-2 pl-4 pr-4 py-1.5 hover:bg-white/5 cursor-pointer transition-colors min-w-0"
                        style={{ color: INTEGRA_TEXT }}
                        onClick={() => {
                          if (sub.label === 'Smart Start' && onViewChange) {
                            onViewChange('smart-start');
                          }
                        }}
                      >
                        <span className="text-[13px] truncate">{sub.label}</span>
                        {sub.icon === 'star' ? (
                          <Star size={14} style={{ color: INTEGRA_PLACEHOLDER }} className="opacity-50" />
                        ) : (
                          <ChevronDown size={14} style={{ color: INTEGRA_PLACEHOLDER }} className="opacity-50" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Simple items (Favoritos, Recentes) */}
          <div className="pt-2 space-y-0.5">
            {simpleItems.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className={`flex items-center cursor-pointer transition-colors hover:bg-white/5 ${isCollapsed ? 'justify-center p-2' : 'justify-between py-2 pr-4 pl-[16px] border-l-[3px] border-transparent'}`}
                style={{ color: INTEGRA_TEXT }}
                title={isCollapsed ? label : undefined}
              >
                {!isCollapsed && <span className="text-[13px]">{label}</span>}
                {!isCollapsed && <ChevronDown size={16} style={{ color: INTEGRA_PLACEHOLDER }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-3 border-t shrink-0 ${isCollapsed ? 'flex flex-col items-center gap-2' : ''}`}
          style={{ borderColor: INTEGRA_BORDER, backgroundColor: INTEGRA_SIDEBAR_BG }}
        >
          {user && (
            <div className={`flex items-center gap-3 ${isCollapsed ? 'flex-col' : 'mb-3 px-2'}`}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: INTEGRA_ACCENT, color: INTEGRA_TEXT }}
              >
                {user.name.charAt(0)}
              </div>
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-bold truncate" style={{ color: INTEGRA_TEXT }}>
                    {user.name}
                  </p>
                  {user.role === 'admin' && (
                    <p className="text-[10px] truncate capitalize" style={{ color: INTEGRA_PLACEHOLDER }}>
                      Administrador
                    </p>
                  )}
                  <p
                    className="text-[9px] font-bold uppercase tracking-wide mt-1"
                    style={{ color: INTEGRA_PLACEHOLDER }}
                  >
                    v{APP_VERSION} SaaS
                  </p>
                </div>
              )}
            </div>
          )}

          <div className={`grid gap-1 ${isCollapsed ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={onSettingsClick}
              className="flex items-center justify-center p-2 rounded-md transition-colors hover:opacity-90"
              style={{ color: INTEGRA_PLACEHOLDER, backgroundColor: INTEGRA_SURFACE }}
              title="Configurações"
            >
              <Settings size={16} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center justify-center p-2 rounded-md transition-colors hover:opacity-90"
              style={{ color: INTEGRA_PLACEHOLDER, backgroundColor: INTEGRA_SURFACE }}
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      <ProdutoCadastroModal
        open={isProdutoModalOpen}
        onClose={() => setIsProdutoModalOpen(false)}
      />
    </>
  );
};

export default InttegraSidebar;
