import React, { useState } from 'react';
import { 
  Play, 
  BookOpen, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Tv, 
  Clock, 
  ExternalLink, 
  ShieldAlert 
} from 'lucide-react';

interface PecuarioCardProps {
  title: React.ReactNode;
  description: string;
  onClick?: () => void;
  active?: boolean;
  theme?: 'light' | 'dark';
  alertColor?: 'green' | 'yellow' | 'red' | 'gray';
  onVideoClick: () => void;
  onInstructionsClick: () => void;
  onAlertClick: () => void;
}

const PecuarioCard: React.FC<PecuarioCardProps> = ({
  title,
  description,
  onClick,
  active = true,
  theme = 'light',
  alertColor = 'gray',
  onVideoClick,
  onInstructionsClick,
  onAlertClick,
}) => {
  const isDark = theme === 'dark';

  // Configuração visual de cores para cada status de alerta
  const alertConfig = {
    green: {
      styles: 'bg-emerald-50/70 border-emerald-100/50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 hover:border-emerald-300',
      iconClass: 'text-emerald-500',
      label: 'Módulo Regularizado',
      pulse: 'bg-emerald-400',
      badge: 'bg-emerald-500',
    },
    yellow: {
      styles: 'bg-amber-50/70 border-amber-100/50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 hover:border-amber-300',
      iconClass: 'text-amber-500',
      label: 'Atenção Necessária',
      pulse: 'bg-amber-400',
      badge: 'bg-amber-500',
    },
    red: {
      styles: 'bg-rose-50/70 border-rose-100/50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 hover:border-rose-300',
      iconClass: 'text-rose-500',
      label: 'Pendência Crítica',
      pulse: 'bg-rose-400',
      badge: 'bg-rose-500',
    },
    gray: {
      styles: 'bg-gray-50/70 border-gray-100/50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:border-gray-300',
      iconClass: 'text-gray-400',
      label: 'Sem Alertas',
      pulse: '',
      badge: '',
    },
  };

  const cfg = alertConfig[alertColor];

  const handleCardClick = () => {
    if (onClick && active) {
      onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick && active) {
        onClick();
      }
    }
  };

  return (
    <div
      role="button"
      tabIndex={active ? 0 : -1}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col p-8 rounded-2xl border bg-white text-left w-full transition-all duration-300 shadow-md outline-none ${
        active
          ? isDark
            ? 'border-[#5E6D82]/20 cursor-pointer hover:shadow-xl hover:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-500/50'
            : 'border-gray-200 cursor-pointer hover:shadow-lg hover:border-gray-800 focus-visible:ring-2 focus-visible:ring-gray-800'
          : 'border-gray-200 opacity-60 pointer-events-none'
      }`}
    >
      <div className="mb-4">
        {title}
      </div>
      <p className="text-xs leading-relaxed text-gray-500 line-clamp-3 mb-6">
        {description}
      </p>

      {/* Divisor de seção */}
      <div className="w-full h-px bg-gray-100 mb-4 mt-auto" />

      {/* Linha de Símbolos de Ações Rápidas */}
      <div 
        className="flex items-center space-x-3" 
        onClick={(e) => e.stopPropagation()} // Previne disparo do card ao clicar nas ações
      >
        {/* 1) Símbolo Vídeo com Tooltip */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onVideoClick();
          }}
          className="group/btn relative flex items-center justify-center p-2 rounded-lg bg-gray-50/70 border border-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all duration-300 shadow-sm hover:scale-105 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
          aria-label="Instrução de 1 minuto"
        >
          <Play size={16} fill="currentColor" className="opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 absolute" />
          <Play size={16} className="group-hover/btn:opacity-0 transition-opacity duration-300" />
          
          {/* Tooltip */}
          <div className="absolute bottom-full mb-2.5 left-1/2 transform -translate-x-1/2 scale-0 group-hover/btn:scale-100 transition-all duration-200 origin-bottom pointer-events-none z-30">
            <div className="bg-gray-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded shadow-xl whitespace-nowrap">
              Instrução de 1 minuto
            </div>
            <div className="w-1.5 h-1.5 bg-gray-900 rotate-45 mx-auto -mt-1" />
          </div>
        </button>

        {/* 2) Símbolo de Instruções */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInstructionsClick();
          }}
          className="group/btn relative flex items-center justify-center p-2 rounded-lg bg-gray-50/70 border border-gray-100 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 hover:border-emerald-100 transition-all duration-300 shadow-sm hover:scale-105 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          aria-label="Como funciona esta tela"
        >
          <BookOpen size={16} />
          
          {/* Tooltip */}
          <div className="absolute bottom-full mb-2.5 left-1/2 transform -translate-x-1/2 scale-0 group-hover/btn:scale-100 transition-all duration-200 origin-bottom pointer-events-none z-30">
            <div className="bg-gray-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded shadow-xl whitespace-nowrap">
              Como funciona esta tela
            </div>
            <div className="w-1.5 h-1.5 bg-gray-900 rotate-45 mx-auto -mt-1" />
          </div>
        </button>

        {/* 3) Símbolo de Alerta */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAlertClick();
          }}
          className={`group/btn relative flex items-center justify-center p-2 rounded-lg border transition-all duration-300 shadow-sm hover:scale-105 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${cfg.styles}`}
          aria-label={`Status do módulo: ${cfg.label}`}
        >
          <AlertCircle size={16} className={cfg.iconClass} />
          
          {/* Indicador pulsante para alertas urgentes */}
          {alertColor !== 'gray' && alertColor !== 'green' && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.pulse}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.badge}`}></span>
            </span>
          )}

          {/* Tooltip */}
          <div className="absolute bottom-full mb-2.5 left-1/2 transform -translate-x-1/2 scale-0 group-hover/btn:scale-100 transition-all duration-200 origin-bottom pointer-events-none z-30">
            <div className="bg-gray-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded shadow-xl whitespace-nowrap">
              Status: {cfg.label}
            </div>
            <div className="w-1.5 h-1.5 bg-gray-900 rotate-45 mx-auto -mt-1" />
          </div>
        </button>
      </div>
    </div>
  );
};

const CadastroTitle: React.FC<{ entity: string; theme?: 'light' | 'dark' }> = ({ entity, theme = 'light' }) => {
  const isDark = theme === 'dark';
  return (
    <div className="flex flex-col items-start text-left">
      <span className={`text-[0.65rem] font-bold uppercase tracking-wider mb-0.5 ${isDark ? 'text-[#65C04A]' : 'text-gray-400'}`}>
        cadastro de
      </span>
      <span className="text-lg font-black tracking-tight text-gray-900 group-hover:text-emerald-600 transition-colors duration-300">
        {entity}
      </span>
    </div>
  );
};

interface PecuarioCadastrosDesktopProps {
  onSelectEstoquePartida: () => void;
  onSelectAnimalCategories?: () => void;
  theme?: 'light' | 'dark';
}

const PecuarioCadastrosDesktop: React.FC<PecuarioCadastrosDesktopProps> = ({
  onSelectEstoquePartida,
  onSelectAnimalCategories,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';

  const cards = [
    {
      id: 'estoque-partida',
      title: <CadastroTitle entity="Estoque de Partida" theme={theme} />,
      description: 'Registre o inventário inicial do rebanho por fazenda e categoria animal, base para movimentações e relatórios.',
      onClick: onSelectEstoquePartida,
      active: true,
      alertColor: 'yellow' as const,
      instructions: {
        intro: 'O Estoque de Partida serve para definir o saldo inicial do seu rebanho no início do ano civil ou na implantação do sistema. É a base de cálculo para todas as movimentações subsequentes, como nascimentos, compras, mortes e vendas.',
        steps: [
          {
            title: 'Filtrar Fazenda e Período',
            desc: 'Selecione a fazenda e o ano correspondente na barra de filtros superior para começar.',
          },
          {
            title: 'Lançar Saldos por Categoria',
            desc: 'Informe o número exato de cabeças e o peso médio estimado para cada categoria animal (ex: Vacas de Cria, Garrotes, Bezerros).',
          },
          {
            title: 'Definir Local de Pasto',
            desc: 'Associe cada lote de estoque ao local/pasto específico onde os animais se encontram na propriedade.',
          },
          {
            title: 'Salvar e Consolidar',
            desc: 'Verifique se a soma total bate com o inventário real de campo e clique em Salvar para consolidar a base.',
          }
        ],
        proTip: 'Certifique-se de que a data de estoque seja anterior ao primeiro lançamento de movimentação ou pesagem para evitar saldos negativos na evolução de rebanho.'
      },
      alert: {
        status: 'Aviso Importante',
        message: 'Existem 2 fazendas ativas sem registro de estoque inicial de partida para o ano corrente.',
        impact: 'Sem o Estoque de Partida cadastrado, os relatórios de evolução de rebanho, taxa de natalidade e avaliação patrimonial destas propriedades não serão exibidos adequadamente.',
        actionLabel: 'Preencher Estoque Inicial',
      }
    },
    ...(onSelectAnimalCategories
      ? [
          {
            id: 'animal-categories',
            title: <CadastroTitle entity="Categoria Animal" theme={theme} />,
            description: 'Defina as categorias do seu rebanho com pesos e valores de mercado.',
            onClick: onSelectAnimalCategories,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Categorias de Animais permite classificar e organizar o rebanho de acordo com as faixas etárias, sexo e aptidão produtiva. Permite também parametrizar pesos médios de referência e valores de mercado por arroba ou cabeça para precificação do patrimônio.',
              steps: [
                {
                  title: 'Definir Faixa Etária e Sexo',
                  desc: 'Cadastre as categorias necessárias (ex: Fêmea 0-12m, Macho 12-24m) informando a denominação zootécnica correta.',
                },
                {
                  title: 'Ajustar Pesos de Referência',
                  desc: 'Configure o peso médio ideal esperado para o rebanho de cada categoria, servindo como benchmark nas pesagens.',
                },
                {
                  title: 'Atualizar Valores de Mercado',
                  desc: 'Atualize periodicamente o valor estimado da cabeça ou arroba para calcular automaticamente a avaliação financeira total do rebanho.',
                }
              ],
              proTip: 'Mantenha as cotações de mercado atualizadas no início de cada mês para garantir a acurácia dos balanços patrimoniais automáticos gerados pelo Gesttor.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'Todas as categorias de animais cadastradas possuem peso padrão e preço de mercado atualizados no período atual.',
              impact: 'O cálculo do valor patrimonial do rebanho está sendo gerado com 100% de acurácia com base nos preços configurados.',
              actionLabel: 'Gerenciar Categorias',
            }
          },
        ]
      : []),
  ];

  // Estados dos Modais e da Gaveta Lateral (Slide-over)
  const [selectedCard, setSelectedCard] = useState<typeof cards[0] | null>(null);
  const [activeModal, setActiveModal] = useState<'video' | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<'instructions' | 'alert' | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMessage, setVideoMessage] = useState('');

  const handleVideoTrigger = (card: typeof cards[0]) => {
    setSelectedCard(card);
    setActiveModal('video');
    setVideoPlaying(false);
    setVideoMessage('');
  };

  const handleInstructionsTrigger = (card: typeof cards[0]) => {
    setSelectedCard(card);
    setActiveDrawer('instructions');
  };

  const handleAlertTrigger = (card: typeof cards[0]) => {
    setSelectedCard(card);
    setActiveDrawer('alert');
  };

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto animate-in fade-in duration-500">
      <header className="space-y-4 mb-12">
        <h1 className={`text-3xl md:text-4xl font-black tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {isDark ? 'Pecuária · Cadastros' : 'Pecuário · Cadastros'}
        </h1>
        <p className={`text-sm max-w-2xl font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Escolha um bloco para um novo cadastro
        </p>
      </header>

      {/* Grid de Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {cards.map(card => (
          <PecuarioCard
            key={card.id}
            title={card.title}
            description={card.description}
            onClick={card.onClick}
            active={card.active}
            theme={theme}
            alertColor={card.alertColor}
            onVideoClick={() => handleVideoTrigger(card)}
            onInstructionsClick={() => handleInstructionsTrigger(card)}
            onAlertClick={() => handleAlertTrigger(card)}
          />
        ))}
      </div>

      {/* --- MODAL DO VIDEO TUTORIAL MOCKUP --- */}
      {activeModal === 'video' && selectedCard && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => {
            setActiveModal(null);
            setVideoPlaying(false);
            setVideoMessage('');
          }}
        >
          <div 
            className="relative bg-[#111C24] border border-[#5E6D82]/20 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="flex items-center justify-between p-5 border-b border-[#5E6D82]/20 bg-[#162430]">
              <div className="flex items-center space-x-2.5 text-white">
                <Tv size={20} className="text-[#65C04A]" />
                <h3 className="text-sm font-black tracking-tight uppercase">
                  Vídeo Instrução · {selectedCard.id === 'estoque-partida' ? 'Estoque de Partida' : 'Categoria Animal'}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setActiveModal(null);
                  setVideoPlaying(false);
                  setVideoMessage('');
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tela de Vídeo Fictícia */}
            <div className="w-full aspect-video bg-black relative flex flex-col items-center justify-center overflow-hidden group/player">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 z-10" />

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 z-20">
                {videoPlaying ? (
                  <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-500">
                    <div className="w-14 h-14 rounded-full border-4 border-t-red-500 border-red-500/20 animate-spin" />
                    <span className="text-white font-bold text-xs tracking-wider uppercase">Conectando ao Player de Instruções...</span>
                    <span className="text-[11px] text-red-400 font-bold max-w-xs leading-relaxed mt-2 bg-red-950/40 border border-red-500/20 px-4 py-2.5 rounded-xl">
                      {videoMessage}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-4">
                    <button
                      onClick={() => {
                        setVideoPlaying(true);
                        setVideoMessage('Vídeo de instrução em fase de gravação! Estará disponível em breve no seu painel.');
                      }}
                      className="w-20 h-20 rounded-full bg-red-600/10 border border-red-500/30 flex items-center justify-center shadow-lg hover:bg-red-600/20 transition-all duration-300 hover:scale-105 active:scale-95 group/playbtn"
                    >
                      <Play size={32} fill="currentColor" className="text-red-500 ml-1 transition-transform group-hover/playbtn:scale-110 duration-300" />
                    </button>
                    <h4 className="text-lg font-black text-white tracking-tight uppercase">Assista ao tutorial de 1 minuto</h4>
                    <p className="text-xs text-gray-300 max-w-sm leading-relaxed">
                      Clique no play para entender os conceitos básicos e operações práticas recomendadas nesta tela.
                    </p>
                  </div>
                )}
              </div>

              {/* Barra de Controles Mockup do Player */}
              <div className="absolute bottom-0 left-0 w-full p-4 flex flex-col space-y-2 z-20 bg-gradient-to-t from-black/90 to-transparent">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-gray-400 font-mono">0:00</span>
                  <div className="flex-1 h-1 bg-white/20 rounded-full relative overflow-hidden">
                    <div className="absolute top-0 left-0 h-full w-[0%] bg-red-500 rounded-full" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">1:00</span>
                </div>
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <div className="flex items-center space-x-4">
                    <button className="hover:text-white transition-colors duration-200">
                      <Play size={14} fill="currentColor" />
                    </button>
                    <div className="flex items-center space-x-1.5 cursor-pointer">
                      <span className="text-[10px] font-mono">Vol</span>
                      <div className="w-12 h-1 bg-white/20 rounded-full">
                        <div className="h-full w-4/5 bg-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-white/10 text-[9px] font-bold text-white uppercase tracking-wider">
                      <Clock size={8} />
                      <span>1 Minuto</span>
                    </div>
                    <span className="text-[10px] font-mono">HD</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="p-5 bg-[#0e171f] border-t border-[#5E6D82]/10 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-semibold">Protótipo Funcional</span>
              </div>
              <button 
                onClick={() => {
                  setActiveModal(null);
                  setVideoPlaying(false);
                  setVideoMessage('');
                }}
                className="text-xs font-black uppercase text-emerald-500 hover:text-emerald-400 transition-colors duration-200"
              >
                Entendi, Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- GAVETA LATERAL (SLIDE-OVER RIGHT DRAWER) --- */}
      {activeDrawer && selectedCard && (
        <>
          {/* Overlay de Desfoque de Fundo */}
          <div 
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
            onClick={() => setActiveDrawer(null)}
          />

          {/* Container Deslizante do Painel */}
          <div 
            className="fixed inset-y-0 right-0 z-[90] w-full max-w-md bg-[#111C24] border-l border-[#5E6D82]/20 text-white shadow-2xl flex flex-col justify-between transition-transform duration-500 ease-out transform translate-x-0 animate-in slide-in-from-right duration-300"
          >
            {/* Header da Gaveta */}
            <div className="flex items-center justify-between p-6 border-b border-[#5E6D82]/20 bg-[#162430]">
              <div className="flex items-center space-x-3">
                {activeDrawer === 'instructions' ? (
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <BookOpen size={20} className="text-[#65C04A]" />
                  </div>
                ) : (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                    selectedCard.alertColor === 'yellow' 
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                      : selectedCard.alertColor === 'red' 
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                        : selectedCard.alertColor === 'green'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-[#65C04A]'
                          : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                  }`}>
                    <ShieldAlert size={20} />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                    {activeDrawer === 'instructions' ? 'Instruções de Uso' : 'Avisos e Status'}
                  </span>
                  <h3 className="text-base font-black tracking-tight leading-none text-white">
                    {selectedCard.id === 'estoque-partida' ? 'Estoque de Partida' : 'Categoria Animal'}
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setActiveDrawer(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo com Barra de Rolar */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              {activeDrawer === 'instructions' ? (
                /* --- CONTEÚDO DE INSTRUÇÕES --- */
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                      O que faz esta tela?
                    </h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {selectedCard.instructions?.intro}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                      Fluxo de Lançamento Recomendado
                    </h4>
                    <div className="space-y-4">
                      {selectedCard.instructions?.steps.map((step, idx) => (
                        <div key={idx} className="flex space-x-3 items-start animate-in fade-in duration-300" style={{ animationDelay: `${idx * 80}ms` }}>
                          <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-[#65C04A]">{idx + 1}</span>
                          </div>
                          <div className="space-y-1">
                            <h5 className="text-xs font-bold text-white leading-tight">{step.title}</h5>
                            <p className="text-[11px] text-gray-400 leading-relaxed">{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card de Dica Extra */}
                  <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-200/90 text-xs leading-relaxed space-y-2">
                    <div className="flex items-center space-x-2 font-bold text-[11px] uppercase tracking-wider text-amber-500">
                      <AlertCircle size={14} />
                      <span>Dica Importante do Gesttor</span>
                    </div>
                    <p className="text-amber-300/80 text-[11px]">
                      {selectedCard.instructions?.proTip}
                    </p>
                  </div>
                </div>
              ) : (
                /* --- CONTEÚDO DE ALERTA --- */
                <div className="space-y-6">
                  {/* Status Box */}
                  <div className={`p-5 rounded-2xl border flex items-center space-x-4 ${
                    selectedCard.alertColor === 'yellow' 
                      ? 'bg-amber-500/5 border-amber-500/20 text-amber-200' 
                      : selectedCard.alertColor === 'red' 
                        ? 'bg-rose-500/5 border-rose-500/20 text-rose-200' 
                        : selectedCard.alertColor === 'green'
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200'
                          : 'bg-gray-500/5 border-gray-500/20 text-gray-300'
                  }`}>
                    <div className="relative flex h-3 w-3 shrink-0">
                      {selectedCard.alertColor !== 'gray' && selectedCard.alertColor !== 'green' && (
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                          selectedCard.alertColor === 'yellow' ? 'bg-amber-400' : 'bg-rose-400'
                        }`}></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${
                        selectedCard.alertColor === 'yellow' 
                          ? 'bg-amber-500' 
                          : selectedCard.alertColor === 'red' 
                            ? 'bg-rose-500' 
                            : selectedCard.alertColor === 'green'
                              ? 'bg-emerald-500'
                              : 'bg-gray-500'
                      }`}></span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 leading-none mb-1">
                        Status do Módulo
                      </span>
                      <span className="text-sm font-black tracking-tight leading-none text-white">
                        {selectedCard.alert?.status}
                      </span>
                    </div>
                  </div>

                  {/* Informações de Alerta */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        O que está ocorrendo?
                      </h4>
                      <p className="text-xs text-white leading-relaxed">
                        {selectedCard.alert?.message}
                      </p>
                    </div>

                    <div className="w-full h-px bg-white/5" />

                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Impacto no Sistema
                      </h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {selectedCard.alert?.impact}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ações do Rodapé da Gaveta */}
            <div className="p-6 border-t border-[#5E6D82]/20 bg-[#162430] flex flex-col space-y-3">
              {activeDrawer === 'alert' && selectedCard.alert?.actionLabel && (
                <button
                  onClick={() => {
                    setActiveDrawer(null);
                    selectedCard.onClick();
                  }}
                  className={`w-full py-3.5 rounded-xl text-center font-black uppercase text-[10px] tracking-widest shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2 ${
                    selectedCard.alertColor === 'yellow'
                      ? 'bg-amber-500 hover:bg-amber-600 text-gray-900'
                      : selectedCard.alertColor === 'red'
                        ? 'bg-rose-500 hover:bg-rose-600 text-white'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  }`}
                >
                  <span>{selectedCard.alert.actionLabel}</span>
                  <ExternalLink size={12} />
                </button>
              )}
              <button
                onClick={() => setActiveDrawer(null)}
                className="w-full py-3.5 rounded-xl border border-white/10 text-center font-bold text-[10px] uppercase tracking-wider text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-200"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PecuarioCadastrosDesktop;
