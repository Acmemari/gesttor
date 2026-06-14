import React, { useState, useEffect } from 'react';
import {
  Play,
  BookOpen,
  AlertCircle,
  X,
  Tv,
  Clock,
  ExternalLink,
  ShieldAlert,
  Star,
} from 'lucide-react';
import { useCadastroFavorites } from '../../hooks/useCadastroFavorites';

type CadastroTab = 'favoritos' | 'recentes' | 'todos';

interface PecuarioCardProps {
  title: React.ReactNode;
  description: string;
  onClick?: () => void;
  active?: boolean;
  theme?: 'light' | 'dark';
  alertColor?: 'green' | 'yellow' | 'red' | 'gray';
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
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
  isFavorite = false,
  onToggleFavorite,
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
      className={`group relative flex flex-col p-5 rounded-2xl border bg-white text-left w-full transition-all duration-300 shadow-md outline-none ${
        active
          ? isDark
            ? 'border-[#5E6D82]/20 cursor-pointer hover:shadow-xl hover:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-500/50'
            : 'border-gray-200 cursor-pointer hover:shadow-lg hover:border-gray-800 focus-visible:ring-2 focus-visible:ring-gray-800'
          : 'border-gray-200 opacity-60 pointer-events-none'
      }`}
    >
      {/* Botão de Favoritar (canto superior direito) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite?.();
        }}
        className={`absolute top-4 right-4 z-10 p-1.5 rounded-lg transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 hover:bg-amber-50 active:scale-95 ${
          isFavorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'
        }`}
        aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        aria-pressed={isFavorite}
        title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        <Star size={18} className={isFavorite ? 'fill-amber-400' : ''} />
      </button>

      <div className="mb-3 pr-8">
        {title}
      </div>
      <p className="text-xs leading-relaxed text-gray-500 line-clamp-3 mb-4">
        {description}
      </p>

      {/* Divisor de seção */}
      <div className="w-full h-px bg-gray-100 mb-3 mt-auto" />

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
      <span className="text-base font-black tracking-tight text-gray-900 group-hover:text-emerald-600 transition-colors duration-300">
        {entity}
      </span>
    </div>
  );
};

interface PecuarioCadastrosDesktopProps {
  onSelectEstoquePartida: () => void;
  onSelectMapao?: () => void;
  onSelectAreas?: () => void;
  onSelectAnimalCategories?: () => void;
  onSelectAnimalBreeds?: () => void;
  onSelectPadraoRacial?: () => void;
  onSelectPelagens?: () => void;
  onSelectReprodutores?: () => void;
  onSelectMotivosMorte?: () => void;
  onSelectCamposPersonalizados?: () => void;
  onSelectTiposChifre?: () => void;
  onSelectLotes?: () => void;
  onSelectPessoas?: () => void;
  onSelectFichaAnimal?: () => void;
  onSelectPropriedades?: () => void;
  theme?: 'light' | 'dark';
  /** Aba solicitada externamente (ex.: "Ver todos os cadastros" no sidebar). */
  initialTab?: CadastroTab;
  /** Muda a cada pedido externo para reaplicar `initialTab` mesmo já montado. */
  tabNonce?: number;
}

const PecuarioCadastrosDesktop: React.FC<PecuarioCadastrosDesktopProps> = ({
  onSelectEstoquePartida,
  onSelectMapao,
  onSelectAreas,
  onSelectAnimalCategories,
  onSelectAnimalBreeds,
  onSelectPadraoRacial,
  onSelectPelagens,
  onSelectReprodutores,
  onSelectMotivosMorte,
  onSelectCamposPersonalizados,
  onSelectTiposChifre,
  onSelectLotes,
  onSelectPessoas,
  onSelectFichaAnimal,
  onSelectPropriedades,
  theme = 'light',
  initialTab,
  tabNonce,
}) => {

  const isDark = theme === 'dark';
  const { favorites, recents, isFavorite, toggleFavorite, recordRecent } = useCadastroFavorites();
  const [activeTab, setActiveTab] = useState<CadastroTab>(initialTab ?? 'favoritos');

  // Aplica a aba pedida pelo sidebar (ex.: "Todos"); o nonce permite reaplicar
  // mesmo quando o componente já está montado.
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, tabNonce]);

  const cards: {
    id: string;
    label: string;
    title: React.ReactNode;
    description: string;
    onClick?: () => void;
    active: boolean;
    alertColor: 'green' | 'yellow' | 'red' | 'gray';
    instructions: {
      intro: string;
      steps: { title: string; desc: string }[];
      proTip: string;
    };
    alert: {
      status: string;
      message: string;
      impact: string;
      actionLabel?: string;
    };
  }[] = [
    {
      id: 'estoque-partida',
      label: 'Estoque de Partida',
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
    ...(onSelectFichaAnimal
      ? [
          {
            id: 'ficha-animal',
            label: 'Ficha Animal',
            title: <CadastroTitle entity="Ficha Animal" theme={theme} />,
            description: 'Cadastre fichas individuais dos animais: identificação, genealogia, pesagens, reprodução e mais.',
            onClick: onSelectFichaAnimal,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'A Ficha Animal centraliza todas as informações de cada animal do rebanho em um único registro, organizado em abas: Identificação, Genealogia, Progênies, Pesagens e GMD, Reprodutivo, Sanitário, Nutricional e Programa de Melhoramento. É a base do controle individual (zootécnico e genético) do rebanho.',
              steps: [
                {
                  title: 'Identificar o Animal',
                  desc: 'Informe ao menos o ID Manejo (chave da ficha). Brinco, SISBOV, raça, categoria e demais dados podem ser preenchidos depois.',
                },
                {
                  title: 'Registrar a Genealogia',
                  desc: 'Vincule Pai, Mãe, Avô Paterno e Avô Materno para acompanhar a linhagem e o melhoramento genético.',
                },
                {
                  title: 'Complementar o Desempenho',
                  desc: 'Use as abas de Pesagens/GMD, Reprodutivo, Sanitário e Nutricional para acompanhar a evolução do animal ao longo do tempo.',
                },
              ],
              proTip: 'Padronize o ID Manejo seguindo a mesma lógica usada nos Nascimentos para manter a rastreabilidade entre as telas.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'A ficha animal usa as mesmas categorias e raças cadastradas no ambiente, garantindo consistência com os lançamentos de Nascimento.',
              impact: 'O controle individual alimenta os relatórios zootécnicos e de melhoramento genético do rebanho.',
              actionLabel: 'Abrir Ficha Animal',
            }
          },
        ]
      : []),
    ...(onSelectMapao
      ? [
          {
            id: 'mapao',
            label: 'Mapa Rebanho - Mapão',
            title: <CadastroTitle entity="Mapa Rebanho - Mapão" theme={theme} />,
            description: 'Lance periodicamente o mapa do rebanho por fazenda e categoria. Acompanhe a evolução do efetivo ao longo do tempo.',
            onClick: onSelectMapao,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Mapa Rebanho (Mapão) tem a mesma estrutura do Estoque de Partida, porém é lançado periodicamente. Enquanto o Estoque de Partida é uma fotografia única que inicia o controle, o Mapão é uma série de fotografias ao longo do tempo, permitindo acompanhar a evolução do rebanho por fazenda, local e categoria.',
              steps: [
                {
                  title: 'Selecionar Fazenda e Data',
                  desc: 'Escolha a fazenda e a data de referência do período que você está lançando (ex: fechamento mensal).',
                },
                {
                  title: 'Lançar Saldos por Categoria',
                  desc: 'Informe o número de cabeças e o peso médio de cada categoria animal em cada local/pasto.',
                },
                {
                  title: 'Salvar e Consolidar',
                  desc: 'Confira os totais e salve o mapa. A cada período, crie um novo mapa com uma nova data de referência.',
                }
              ],
              proTip: 'Mantenha uma cadência regular de lançamento (ex: sempre no último dia do mês) para que os relatórios de evolução de rebanho fiquem consistentes.'
            },
            alert: {
              status: 'Lançamento Periódico',
              message: 'Cada fazenda pode ter vários mapas, um por data de referência.',
              impact: 'O acompanhamento periódico alimenta os relatórios de evolução e comparação de rebanho entre períodos.',
              actionLabel: 'Lançar Mapa',
            }
          },
        ]
      : []),
    ...(onSelectAreas
      ? [
          {
            id: 'areas',
            label: 'Cadastro de Áreas',
            title: <CadastroTitle entity="Áreas" theme={theme} />,
            description: 'Desenhe ou importe (KMZ/KML) o perímetro da propriedade em camadas: Fazenda › Retiros › Setores › Locais.',
            onClick: onSelectAreas,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Áreas define o território da propriedade em um mapa interativo, organizado em quatro camadas hierárquicas encaixadas: Fazenda › Retiros › Setores › Locais. Essa hierarquia geográfica é a base de localização de todo o sistema — lotes, animais e movimentações "moram" em um Local que pertence a um Setor, Retiro e Fazenda.',
              steps: [
                {
                  title: 'Escolher a Camada',
                  desc: 'Selecione o nível (Fazenda, Retiro, Setor ou Local) no seletor do mapa. A camada ativa filtra o mapa e define o nível do que você vai desenhar ou importar.',
                },
                {
                  title: 'Desenhar ou Importar',
                  desc: 'Use "Desenhar" para marcar o polígono direto no mapa ou "Importar KMZ/KML" para trazer áreas de um arquivo. O sistema calcula a área em hectares e sugere o vínculo hierárquico pela posição.',
                },
                {
                  title: 'Organizar as Camadas',
                  desc: 'No painel à direita, navegue por Fazenda › Retiros › Setores › Locais, ajuste nomes/vínculos, mostre/oculte e centralize cada área no mapa.',
                },
              ],
              proTip: 'Comece sempre pelo perímetro da Fazenda. Retiros e Setores são opcionais ("quando houver"); o Local é onde o gado fica e deve sempre existir.',
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'As áreas cadastradas servem de base de localização para lotes, animais e movimentações.',
              impact: 'A hierarquia geográfica garante consistência na localização do rebanho em todo o sistema.',
              actionLabel: 'Abrir Cadastro de Áreas',
            },
          },
        ]
      : []),
    ...(onSelectAnimalCategories
      ? [
          {
            id: 'animal-categories',
            label: 'Categoria Animal',
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
    ...(onSelectAnimalBreeds
      ? [
          {
            id: 'animal-breeds',
            label: 'Raças',
            title: <CadastroTitle entity="Raças" theme={theme} />,
            description: 'Cadastre as raças do rebanho para usar nos lançamentos de nascimento e nas categorias de animais.',
            onClick: onSelectAnimalBreeds,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Raças centraliza a lista de raças utilizadas no rebanho. As raças aqui cadastradas ficam disponíveis para seleção na tela de Nascimentos e no Cadastro de Categoria de Animais, garantindo padronização da informação em todo o sistema.',
              steps: [
                {
                  title: 'Cadastrar Raça',
                  desc: 'Clique em "Nova Raça" e informe o nome da raça (ex: Nelore, Angus, Brangus).',
                },
                {
                  title: 'Ordenar a Lista',
                  desc: 'Arraste as raças para definir a ordem em que aparecem nas listas de seleção do sistema.',
                },
                {
                  title: 'Ativar ou Inativar',
                  desc: 'Mantenha ativas apenas as raças em uso. Raças inativas deixam de aparecer nas telas de lançamento sem perder o histórico.',
                },
              ],
              proTip: 'Padronize a grafia das raças (ex: sempre "Nelore", não "nelore") para manter relatórios e filtros consistentes.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'As raças cadastradas estão disponíveis para seleção nas telas de Nascimento e Categoria de Animais.',
              impact: 'A padronização das raças garante consistência nos lançamentos e relatórios do rebanho.',
              actionLabel: 'Gerenciar Raças',
            }
          },
        ]
      : []),
    ...(onSelectPadraoRacial
      ? [
          {
            id: 'padrao-racial',
            label: 'Padrão Racial e Grau de Sangue',
            title: <CadastroTitle entity="Padrão Racial e Grau de Sangue" theme={theme} />,
            description: 'Cadastre os padrões raciais (PO, PC, PA, LA, CEIP, Comercial) usados na classificação genealógica do rebanho.',
            onClick: onSelectPadraoRacial,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Padrão Racial e Grau de Sangue centraliza as classificações genealógicas do rebanho. Para cada registro você define o padrão racial (PO, PC, PA, LA ou Comercial) e, quando aplicável, o CEIP. Os padrões aqui cadastrados ficam disponíveis para seleção nas telas de lançamento, garantindo padronização da informação em todo o sistema.',
              steps: [
                {
                  title: 'Cadastrar Padrão Racial',
                  desc: 'Na aba "Lançamentos", informe o nome do registro e selecione o padrão racial correspondente.',
                },
                {
                  title: 'Definir o Padrão Racial',
                  desc: 'Selecione apenas um padrão entre PO, PC, PA, LA e Comercial. O CEIP pode ser marcado em conjunto com PO, PC, PA ou LA.',
                },
                {
                  title: 'Ordenar e Ativar',
                  desc: 'Arraste os registros para ordená-los e mantenha ativos apenas os padrões em uso. Registros inativos deixam de aparecer nos lançamentos sem perder o histórico.',
                },
              ],
              proTip: 'O padrão racial indica a classificação genealógica do animal. Use o CEIP apenas em conjunto com animais PO, PC, PA ou LA, conforme a certificação.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'Os padrões raciais cadastrados estão disponíveis para seleção nos lançamentos do rebanho.',
              impact: 'A padronização dos padrões raciais garante consistência na classificação genealógica e nos relatórios do rebanho.',
              actionLabel: 'Gerenciar Padrões Raciais',
            }
          },
        ]
      : []),
    ...(onSelectMotivosMorte
      ? [
          {
            id: 'motivos-morte',
            label: 'Motivos de Morte',
            title: <CadastroTitle entity="Motivos de Morte" theme={theme} />,
            description: 'Cadastre os motivos de morte do rebanho para padronizar os lançamentos de mortalidade e os relatórios de causas.',
            onClick: onSelectMotivosMorte,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Motivos de Morte centraliza a lista de causas de mortalidade utilizadas no rebanho (ex: Pneumonia, Picada de Cobra, Tristeza Parasitária). Os motivos aqui cadastrados ficam disponíveis para seleção nos lançamentos de morte, garantindo padronização e relatórios consistentes de causa mortis.',
              steps: [
                {
                  title: 'Cadastrar Motivo',
                  desc: 'Clique em "Adicionar" e informe o nome do motivo (ex: Pneumonia, Raio, Intoxicação).',
                },
                {
                  title: 'Ordenar a Lista',
                  desc: 'Arraste os motivos para definir a ordem em que aparecem nas listas de seleção do sistema.',
                },
                {
                  title: 'Ativar ou Inativar',
                  desc: 'Mantenha ativos apenas os motivos em uso. Motivos inativos deixam de aparecer nos lançamentos sem perder o histórico.',
                },
              ],
              proTip: 'O sistema já vem com uma lista padrão de motivos pré-cadastrada. Ajuste, inative ou complemente conforme a realidade da sua propriedade.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'Os motivos de morte cadastrados estão disponíveis para seleção nos lançamentos de mortalidade do rebanho.',
              impact: 'A padronização das causas de morte garante consistência nos relatórios de mortalidade e análise de perdas.',
              actionLabel: 'Gerenciar Motivos',
            }
          },
        ]
      : []),
    ...(onSelectCamposPersonalizados
      ? [
          {
            id: 'campos-personalizados',
            label: 'Campos Personalizados',
            title: <CadastroTitle entity="Campos Personalizados" theme={theme} />,
            description: 'Crie campos extras (texto, número ou lista) que aparecem no painel "Defina seus campos" das movimentações do rebanho.',
            onClick: onSelectCamposPersonalizados,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Campos Personalizados permite expandir as fichas das movimentações com informações específicas da sua operação (ex: Nº do brinco, lote de vacina, observação do comprador). Cada campo passa a aparecer no painel "Defina seus campos" das movimentações que você escolher.',
              steps: [
                {
                  title: 'Criar Campo',
                  desc: 'Informe o nome, escolha o tipo (Texto, Número ou Lista suspensa com até 4 opções) e marque em quais movimentações ele aparece.',
                },
                {
                  title: 'Posicionar no Lançamento',
                  desc: 'Em cada movimentação, abra "Defina seus campos" (ícone do lápis) para reposicionar ou ocultar o campo conforme a necessidade daquela tela.',
                },
                {
                  title: 'Ordenar a Lista',
                  desc: 'Arraste os campos para definir a ordem em que aparecem.',
                },
              ],
              proTip: 'Campos do tipo Lista suspensa padronizam o preenchimento; marque "Obrigatório" para destacar os campos essenciais com asterisco.'
            },
            alert: {
              status: 'Módulo Customizável',
              message: 'Os campos cadastrados ficam disponíveis no painel "Defina seus campos" das movimentações escolhidas.',
              impact: 'Adicione informações próprias da sua operação aos lançamentos de Compra, Venda, Nascimento, Morte e Consumo.',
              actionLabel: 'Gerenciar Campos',
            }
          },
        ]
      : []),
    ...(onSelectPelagens
      ? [
          {
            id: 'pelagens',
            label: 'Pelagens',
            title: <CadastroTitle entity="Pelagens" theme={theme} />,
            description: 'Cadastre as pelagens dos animais para utilizar nos lançamentos e fichas zootécnicas de bovinos e equídeos.',
            onClick: onSelectPelagens,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Pelagens centraliza as cores e padrões de pelagens dos animais. Permite categorizar quais pelagens se aplicam a Bovinos, Equídeos ou a ambos, garantindo a padronização e relatórios zootécnicos precisos.',
              steps: [
                {
                  title: 'Cadastrar Pelagem',
                  desc: 'Informe a descrição da pelagem (ex: Tordilha, Alazã, Preta) e selecione a quais espécies ela se aplica.',
                },
                {
                  title: 'Ordenar a Lista',
                  desc: 'Arraste as pelagens para definir a ordem em que aparecem nas listas de seleção do sistema.',
                },
                {
                  title: 'Visualizar e Editar',
                  desc: 'Clique em uma pelagem para carregar seus detalhes no painel de edição e atualizar suas observações ou espécies vinculadas.',
                },
              ],
              proTip: 'O sistema pré-cadastra pelagens padrão baseadas na tabela técnica de pelagens do Gesttor. Adapte ou adicione novos padrões conforme a necessidade da fazenda.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'As pelagens cadastradas estão disponíveis para seleção e visualização nos cadastros e relatórios.',
              impact: 'A padronização das pelagens garante consistência nos dados zootécnicos e identificação visual do rebanho.',
              actionLabel: 'Gerenciar Pelagens',
            }
          },
        ]
      : []),
    ...(onSelectReprodutores
      ? [
          {
            id: 'reprodutores',
            label: 'Sêmen e Embriões',
            title: <CadastroTitle entity="Sêmen e Embriões" theme={theme} />,
            description: 'Cadastre os reprodutores (touros e material genético) usados na inseminação, com fotos e genealogia.',
            onClick: onSelectReprodutores,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Sêmen e Embriões centraliza os reprodutores (touros e material genético) utilizados na inseminação da fazenda. Cada registro reúne identificação (nome, registro, data de nascimento, raça e central), fotos e a genealogia completa (pai, mãe e avós), na aba Genealogia em estilo pedigree.',
              steps: [
                {
                  title: 'Identificar o Reprodutor',
                  desc: 'Na aba "Dados", informe o Nome completo (obrigatório), Registro, Data de nascimento, Tipo (Sêmen ou Embrião), Raça e Central.',
                },
                {
                  title: 'Lançar a Genealogia',
                  desc: 'Na aba "Genealogia", preencha pai, mãe e os avós paternos e maternos, cada um com nome e registro.',
                },
                {
                  title: 'Importar das Centrais',
                  desc: 'Use o botão "Localizar das centrais" para importar um touro pré-cadastrado e pré-preencher o formulário automaticamente.',
                },
              ],
              proTip: 'Anexe fotos do reprodutor e mantenha a genealogia completa para facilitar a seleção dos acasalamentos e o acompanhamento do melhoramento genético.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'Os reprodutores cadastrados ficam disponíveis para consulta de genealogia e seleção nas inseminações.',
              impact: 'A padronização do sêmen e embriões garante rastreabilidade genética e consistência nos acasalamentos do rebanho.',
              actionLabel: 'Gerenciar Sêmen e Embriões',
            }
          },
        ]
      : []),
    ...(onSelectTiposChifre
      ? [
          {
            id: 'tipos-chifre',
            label: 'Tipo de Chifre - Aspas',
            title: <CadastroTitle entity="Tipo de Chifre - Aspas" theme={theme} />,
            description: 'Cadastre os tipos de chifre (aspas) do rebanho para padronizar os lançamentos e a caracterização dos animais.',
            onClick: onSelectTiposChifre,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Tipo de Chifre - Aspas centraliza a lista de tipos de chifre utilizados na caracterização do rebanho (ex: Aspado, Mocho, Aspas curtas, Aspas longas). Os tipos aqui cadastrados ficam disponíveis para seleção nos lançamentos, garantindo padronização e relatórios consistentes.',
              steps: [
                {
                  title: 'Cadastrar Tipo de Chifre',
                  desc: 'Na aba "Lançamentos", informe a Descrição (ex: Aspado, Mocho) e uma Observação opcional, e clique em Salvar.',
                },
                {
                  title: 'Ordenar a Lista',
                  desc: 'Arraste os tipos para definir a ordem em que aparecem nas listas de seleção do sistema.',
                },
                {
                  title: 'Ativar ou Inativar',
                  desc: 'Use a coluna Situações para manter ativos apenas os tipos em uso. Tipos inativos deixam de aparecer nos lançamentos sem perder o histórico.',
                },
              ],
              proTip: 'Use a Observação para descrever o que caracteriza cada tipo de chifre e evitar dúvidas no momento do lançamento.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'Os tipos de chifre cadastrados estão disponíveis para seleção nos lançamentos do rebanho.',
              impact: 'A padronização dos tipos de chifre garante consistência na caracterização dos animais e nos relatórios.',
              actionLabel: 'Gerenciar Tipos de Chifre',
            }
          },
        ]
      : []),
    ...(onSelectLotes
      ? [
          {
            id: 'lotes',
            label: 'Cadastro de Lotes',
            title: <CadastroTitle entity="Lotes" theme={theme} />,
            description: 'Cadastre os lotes da fazenda para agrupar e acompanhar os animais ao longo do manejo.',
            onClick: onSelectLotes,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Lotes centraliza os lotes utilizados para agrupar animais no manejo. Cada lote possui um nome, uma data de início e pode ser marcado como finalizado quando encerrado, ficando disponível para seleção nos lançamentos do rebanho.',
              steps: [
                {
                  title: 'Cadastrar Lote',
                  desc: 'Na aba "Lançamentos", informe o Nome, a Data Início e uma Descrição opcional, e clique em Salvar.',
                },
                {
                  title: 'Ordenar a Lista',
                  desc: 'Arraste os lotes para definir a ordem em que aparecem nas listas de seleção do sistema.',
                },
                {
                  title: 'Finalizar um Lote',
                  desc: 'Use o controle "Lote Finalizado" para encerrar um lote. Lotes finalizados mantêm o histórico, mas indicam que não estão mais em andamento.',
                },
              ],
              proTip: 'Use a Descrição para registrar a finalidade do lote (ex.: recria, engorda, desmama) e facilitar a identificação no momento do lançamento.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'Os lotes cadastrados estão disponíveis para seleção nos lançamentos e no manejo do rebanho.',
              impact: 'A padronização dos lotes garante o agrupamento correto dos animais e a consistência dos relatórios.',
              actionLabel: 'Gerenciar Lotes',
            }
          },
        ]
      : []),
    ...(onSelectPessoas
      ? [
          {
            id: 'people',
            label: 'Cadastro de Pessoas',
            title: <CadastroTitle entity="Pessoas" theme={theme} />,
            description: 'Gerencie colaboradores, consultores, fornecedores, transportadoras e proprietários da fazenda.',
            onClick: onSelectPessoas,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Pessoas centraliza todas as pessoas e entidades que interagem com o ecossistema das fazendas, incluindo colaboradores, gerentes, parceiros comerciais e consultores.',
              steps: [
                {
                  title: 'Definir o Tipo de Pessoa',
                  desc: 'Selecione as funções da pessoa (ex: Cliente, Fornecedor, Funcionário, Proprietário, Transportadora).',
                },
                {
                  title: 'Preencher Dados Cadastrais',
                  desc: 'Informe o Nome Completo, Razão Social (se houver), Documento (CPF/CNPJ), E-mail e Telefone.',
                },
                {
                  title: 'Vincular Fazendas e Perfis',
                  desc: 'Defina a qual fazenda a pessoa pertence, associe seu perfil de acesso e defina suas permissões operacionais.',
                }
              ],
              proTip: 'Insira sempre o e-mail correto para que a pessoa possa receber convites de acesso à plataforma.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'O cadastro de pessoas está sincronizado com os perfis de acesso e fazendas do ambiente.',
              impact: 'Garante que os colaboradores e parceiros cadastrados tenham acesso e visibilidade corretos no sistema.',
              actionLabel: 'Gerenciar Pessoas',
            }
          },
        ]
      : []),
    ...(onSelectPropriedades
      ? [
          {
            id: 'propriedades',
            label: 'Cadastro de Fazendas',
            title: <CadastroTitle entity="Cadastro de Fazendas" theme={theme} />,
            description: 'Cadastre e gerencie propriedades rurais, dados da fazenda e configurações por organização.',
            onClick: onSelectPropriedades,
            active: true,
            alertColor: 'green' as const,
            instructions: {
              intro: 'O Cadastro de Fazendas permite gerenciar as propriedades rurais, dados da fazenda e configurações por organização. É a base onde as safras, locais e animais estão vinculados.',
              steps: [
                {
                  title: 'Cadastrar Propriedade',
                  desc: 'Informe o Nome da Fazenda, Sistema de Produção, Localização (Cidade e Estado) e a Área Total.',
                },
                {
                  title: 'Definir Sub-áreas',
                  desc: 'Insira os dados de pastagem, agricultura e reserva legal. O sistema valida se a soma das sub-áreas fecha com a área total.',
                },
                {
                  title: 'Associar Valores',
                  desc: 'Configure o valor da propriedade e do rebanho para os relatórios de avaliação financeira e patrimonial.',
                },
              ],
              proTip: 'A soma das sub-áreas deve fechar com a área total cadastrada para garantir relatórios patrimoniais precisos.'
            },
            alert: {
              status: 'Módulo Regularizado',
              message: 'As propriedades cadastradas servem de base para a divisão geográfica de locais e pastos.',
              impact: 'Permite o controle e a divisão correta das áreas da propriedade zootécnica.',
              actionLabel: 'Gerenciar Fazendas',
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

  const handleCardOpen = (card: typeof cards[0]) => {
    recordRecent({ id: card.id, label: card.label });
    card.onClick?.();
  };

  // Filtra os cards conforme a aba ativa. Em "Recentes" a ordem segue a do
  // store (mais recente primeiro); itens já removidos do menu são descartados.
  const visibleCards =
    activeTab === 'favoritos'
      ? cards.filter(c => isFavorite(c.id))
      : activeTab === 'recentes'
        ? recents
            .map(r => cards.find(c => c.id === r.id))
            .filter((c): c is typeof cards[0] => !!c)
        : cards;

  const tabs: { id: CadastroTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'favoritos', label: 'Favoritos', icon: Star, count: favorites.length },
    { id: 'recentes', label: 'Recentes', icon: Clock, count: recents.length },
    { id: 'todos', label: 'Todos', icon: BookOpen, count: cards.length },
  ];

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto animate-in fade-in duration-500">
      <header className="space-y-4 mb-8">
        <h1 className={`text-3xl md:text-4xl font-black tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {isDark ? 'Pecuária · Cadastros' : 'Pecuário · Cadastros'}
        </h1>
        <p className={`text-sm max-w-2xl font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Escolha um bloco para um novo cadastro
        </p>

        {/* Abas: Favoritos · Recentes · Todos */}
        <div className={`flex flex-wrap gap-1.5 pt-2 ${isDark ? '' : ''}`}>
          {tabs.map(({ id, label, icon: Icon, count }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold tracking-tight border transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                  selected
                    ? isDark
                      ? 'bg-emerald-500/15 text-[#65C04A] border-emerald-500/30'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isDark
                      ? 'text-gray-400 border-transparent hover:text-white hover:bg-white/5'
                      : 'text-gray-500 border-transparent hover:text-gray-900 hover:bg-gray-100'
                }`}
                aria-pressed={selected}
              >
                <Icon size={14} className={id === 'favoritos' && selected ? 'fill-current' : ''} />
                <span>{label}</span>
                {typeof count === 'number' && count > 0 && (
                  <span
                    className={`min-w-[1.25rem] h-5 px-1 inline-flex items-center justify-center rounded-full text-[10px] font-black ${
                      selected
                        ? isDark
                          ? 'bg-emerald-500/25 text-[#65C04A]'
                          : 'bg-emerald-100 text-emerald-700'
                        : isDark
                          ? 'bg-white/10 text-gray-300'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Grid de Cards */}
      {visibleCards.length === 0 ? (
        <div className={`flex flex-col items-center justify-center text-center rounded-2xl border border-dashed py-16 px-6 ${
          isDark ? 'border-[#5E6D82]/30 text-gray-400' : 'border-gray-200 text-gray-500'
        }`}>
          {activeTab === 'favoritos' ? (
            <>
              <Star size={28} className="mb-3 opacity-50" />
              <p className="text-sm font-medium">Nenhum cadastro favoritado ainda.</p>
              <p className="text-xs mt-1 opacity-80">Toque na estrela no canto de um card para favoritá-lo.</p>
            </>
          ) : (
            <>
              <Clock size={28} className="mb-3 opacity-50" />
              <p className="text-sm font-medium">Nenhum cadastro aberto recentemente.</p>
              <p className="text-xs mt-1 opacity-80">Os cadastros que você abrir aparecerão aqui.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {visibleCards.map(card => (
            <PecuarioCard
              key={card.id}
              title={card.title}
              description={card.description}
              onClick={() => handleCardOpen(card)}
              active={card.active}
              theme={theme}
              alertColor={card.alertColor}
              isFavorite={isFavorite(card.id)}
              onToggleFavorite={() => toggleFavorite({ id: card.id, label: card.label })}
              onVideoClick={() => handleVideoTrigger(card)}
              onInstructionsClick={() => handleInstructionsTrigger(card)}
              onAlertClick={() => handleAlertTrigger(card)}
            />
          ))}
        </div>
      )}

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
                  Vídeo Instrução · {selectedCard.label}
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
                    {selectedCard.label}
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
