import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import SmartStart from './SmartStart';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { onOpenCadastro, onOpenCadastrosTab, type CadastrosTab } from '../hooks/useCadastroFavorites';
import { useHierarchy } from '../contexts/HierarchyContext';

type SubView =
  | 'desktop'
  | 'estoque-partida'
  | 'mapao'
  | 'areas'
  | 'animal-categories'
  | 'animal-breeds'
  | 'padrao-racial'
  | 'pelagens'
  | 'reprodutores'
  | 'motivos-morte'
  | 'campos-personalizados'
  | 'tipos-chifre'
  | 'lotes'
  | 'estacao-monta'
  | 'especies-forrageiras'
  | 'tipos-local'
  | 'people'
  | 'ficha-animal'
  | 'propriedades';

const CADASTRO_SUBVIEWS: readonly SubView[] = [
  'estoque-partida',
  'mapao',
  'areas',
  'animal-categories',
  'animal-breeds',
  'padrao-racial',
  'pelagens',
  'reprodutores',
  'motivos-morte',
  'campos-personalizados',
  'tipos-chifre',
  'lotes',
  'estacao-monta',
  'especies-forrageiras',
  'tipos-local',
  'people',
  'ficha-animal',
  'propriedades',
];

// Lazy-loaded components for Pecuária modules
const PecuarioCadastrosDesktop = lazyWithRetry(() => import('../agents/pecuario/PecuarioCadastrosDesktop'));
const EstoquePartida = lazyWithRetry(() => import('../agents/pecuario/EstoquePartida'));
// Mapa Rebanho - Mapão reaproveita o mesmo componente em modo periódico.
const MapaoRebanho = lazyWithRetry(() => import('../agents/pecuario/EstoquePartida'));
const PecuarioMovimentos = lazyWithRetry(() => import('../agents/pecuario/PecuarioMovimentos'));
const MorteView = lazyWithRetry(() => import('../agents/pecuario/morte/MorteView'));
const VendaView = lazyWithRetry(() => import('../agents/pecuario/venda/VendaView'));
const CompraView = lazyWithRetry(() => import('../agents/pecuario/compra/CompraView'));
const DesmameView = lazyWithRetry(() => import('../agents/pecuario/desmame/DesmameView'));
const MudancaCategoriaView = lazyWithRetry(() => import('../agents/pecuario/mudancaCategoria/MudancaCategoriaView'));
const ConsumoView = lazyWithRetry(() => import('../agents/pecuario/consumo/ConsumoView'));
const GestaoLotesView = lazyWithRetry(() => import('../agents/pecuario/gestaoLotes/GestaoLotesView'));
const MovimentacaoAreasView = lazyWithRetry(() => import('../agents/pecuario/areas/MovimentacaoAreasView'));
const FichaAnimalView = lazyWithRetry(() => import('../agents/pecuario/fichaAnimal/FichaAnimalView'));
const AnimalCategoriesManagement = lazyWithRetry(() => import('../agents/AnimalCategoriesManagement'));
const AnimalBreedsManagement = lazyWithRetry(() => import('../agents/AnimalBreedsManagement'));
const PadraoRacialManagement = lazyWithRetry(() => import('../agents/PadraoRacialManagement'));
const PelagensManagement = lazyWithRetry(() => import('../agents/PelagensManagement'));
const ReprodutoresManagement = lazyWithRetry(() => import('../agents/ReprodutoresManagement'));
const MotivosMorteManagement = lazyWithRetry(() => import('../agents/MotivosMorteManagement'));
const CamposPersonalizadosManagement = lazyWithRetry(() => import('../agents/CamposPersonalizadosManagement'));
const TiposChifreManagement = lazyWithRetry(() => import('../agents/TiposChifreManagement'));
const LotesManagement = lazyWithRetry(() => import('../agents/LotesManagement'));
const EstacaoMontaManagement = lazyWithRetry(() => import('../agents/EstacaoMontaManagement'));
const EspeciesForrageirasManagement = lazyWithRetry(() => import('../agents/EspeciesForrageirasManagement'));
const TiposLocalManagement = lazyWithRetry(() => import('../agents/TiposLocalManagement'));
const FarmManagement = lazyWithRetry(() => import('../agents/FarmManagement'));
const PeopleManagement = lazyWithRetry(() => import('../agents/PeopleManagement'));

interface InttegraDashboardProps {
  view?: string;
  /** Incrementa a cada clique no sidebar; força voltar à tela inicial da seção mesmo na mesma view. */
  navNonce?: number;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <Loader2 size={24} className="animate-spin text-[#65C04A]" />
  </div>
);

const InttegraDashboard: React.FC<InttegraDashboardProps> = ({ view, navNonce, onToast }) => {
  const { selectedFarm } = useHierarchy();
  const [subView, setSubView] = useState<SubView>('desktop');
  // Aba pedida pela sidebar ("Ver todos os cadastros" → "todos"); o nonce força
  // a tela de cadastros a reaplicar a aba mesmo já montada.
  const [cadastrosTab, setCadastrosTab] = useState<{ tab: CadastrosTab; nonce: number } | null>(null);
  // Guarda um cadastro pedido pela sidebar enquanto a troca de view acontece,
  // para que o reset de subView abaixo não sobrescreva o destino.
  const pendingCadastroRef = useRef<SubView | null>(null);

  // Navegação direta para um cadastro a partir da sidebar (Favoritos/Recentes).
  useEffect(() => {
    return onOpenCadastro(id => {
      if ((CADASTRO_SUBVIEWS as readonly string[]).includes(id)) {
        pendingCadastroRef.current = id as SubView;
        setSubView(id as SubView);
      }
    });
  }, []);

  // Pedido de aba específica ("Ver todos os cadastros" no sidebar): volta ao
  // desktop de cards e marca a aba a ser aberta.
  useEffect(() => {
    return onOpenCadastrosTab(tab => {
      pendingCadastroRef.current = null;
      setSubView('desktop');
      setCadastrosTab({ tab, nonce: (Date.now()) });
    });
  }, []);

  // Ao trocar de view OU reclicar no item da sidebar (navNonce muda), volta ao
  // desktop — exceto quando há um cadastro pendente solicitado pela sidebar
  // (abre direto a sub-tela correspondente).
  useEffect(() => {
    if (view === 'pecuario-cadastros' && pendingCadastroRef.current) {
      setSubView(pendingCadastroRef.current);
      pendingCadastroRef.current = null;
    } else {
      setSubView('desktop');
    }
  }, [view, navNonce]);

  if (view === 'smart-start') {
    return <SmartStart />;
  }

  if (view === 'propriedades') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <FarmManagement onToast={onToast} isInttegra={true} />
      </Suspense>
    );
  }

  if (view === 'pecuario-movimentacao') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PecuarioMovimentos onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-morte') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <MorteView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-venda') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <VendaView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-compra') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <CompraView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-desmame') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <DesmameView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-mudanca-categoria') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <MudancaCategoriaView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-consumo') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <ConsumoView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-gestao-lotes') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <GestaoLotesView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-mov-areas') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <MovimentacaoAreasView onToast={onToast} />
      </Suspense>
    );
  }

  if (view === 'pecuario-cadastros') {
    if (subView === 'estoque-partida') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <EstoquePartida theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'mapao') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <MapaoRebanho mode="mapao" theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'areas') {
      // "Cadastro de Áreas" agora é a aba Locais (lista + mapa) da fazenda.
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <FarmManagement
              onToast={onToast}
              isInttegra={true}
              onBack={() => setSubView('desktop')}
              initialEditFarmId={selectedFarm?.id}
              initialTab="locais"
            />
          </div>
        </Suspense>
      );
    }
    if (subView === 'animal-categories') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <AnimalCategoriesManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'animal-breeds') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <AnimalBreedsManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'padrao-racial') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <PadraoRacialManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'pelagens') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <PelagensManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'reprodutores') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <ReprodutoresManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'motivos-morte') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <MotivosMorteManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'campos-personalizados') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <CamposPersonalizadosManagement onToast={onToast} onBack={() => setSubView('desktop')} />
          </div>
        </Suspense>
      );
    }
    if (subView === 'tipos-chifre') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <TiposChifreManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'lotes') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <LotesManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
        </Suspense>
      );
    }
    if (subView === 'estacao-monta') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <EstacaoMontaManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
          </div>
        </Suspense>
      );
    }
    if (subView === 'especies-forrageiras') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <EspeciesForrageirasManagement theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
          </div>
        </Suspense>
      );
    }
    if (subView === 'tipos-local') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <TiposLocalManagement
              theme="dark"
              onToast={onToast}
              onBack={() => setSubView('desktop')}
              onNavigateToEspecies={() => setSubView('especies-forrageiras')}
            />
          </div>
        </Suspense>
      );
    }
    if (subView === 'people') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <PeopleManagement onToast={onToast} onBack={() => setSubView('desktop')} isInttegra />
          </div>
        </Suspense>
      );
    }
    if (subView === 'ficha-animal') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <FichaAnimalView onToast={onToast} onBack={() => setSubView('desktop')} />
          </div>
        </Suspense>
      );
    }
    if (subView === 'propriedades') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <FarmManagement onToast={onToast} isInttegra={true} onBack={() => setSubView('desktop')} />
          </div>
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PecuarioCadastrosDesktop
          theme="dark"
          onSelectEstoquePartida={() => setSubView('estoque-partida')}
          onSelectMapao={() => setSubView('mapao')}
          onSelectAreas={() => setSubView('areas')}
          onSelectAnimalCategories={() => setSubView('animal-categories')}
          onSelectAnimalBreeds={() => setSubView('animal-breeds')}
          onSelectPadraoRacial={() => setSubView('padrao-racial')}
          onSelectPelagens={() => setSubView('pelagens')}
          onSelectReprodutores={() => setSubView('reprodutores')}
          onSelectMotivosMorte={() => setSubView('motivos-morte')}
          onSelectCamposPersonalizados={() => setSubView('campos-personalizados')}
          onSelectTiposChifre={() => setSubView('tipos-chifre')}
          onSelectLotes={() => setSubView('lotes')}
          onSelectEstacaoMonta={() => setSubView('estacao-monta')}
          onSelectEspeciesForrageiras={() => setSubView('especies-forrageiras')}
          onSelectTiposLocal={() => setSubView('tipos-local')}
          onSelectPessoas={() => setSubView('people')}
          onSelectFichaAnimal={() => setSubView('ficha-animal')}
          onSelectPropriedades={() => setSubView('propriedades')}
          initialTab={cadastrosTab?.tab}
          tabNonce={cadastrosTab?.nonce}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 px-4 py-20">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
        <Layers size={32} className="text-[#65C04A]" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">Inttegra Pecuária</h2>
      <p className="text-sm text-center max-w-md text-gray-400 leading-relaxed">
        Workspace em construção. Utilize o menu lateral para navegar pelos módulos.
      </p>
    </div>
  );
};

export default InttegraDashboard;
