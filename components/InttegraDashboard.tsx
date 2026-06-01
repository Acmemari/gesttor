import React, { useState, useEffect, Suspense } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import SmartStart from './SmartStart';
import { lazyWithRetry } from '../lib/lazyWithRetry';

// Lazy-loaded components for Pecuária modules
const PecuarioCadastrosDesktop = lazyWithRetry(() => import('../agents/pecuario/PecuarioCadastrosDesktop'));
const EstoquePartida = lazyWithRetry(() => import('../agents/pecuario/EstoquePartida'));
const PecuarioMovimentos = lazyWithRetry(() => import('../agents/pecuario/PecuarioMovimentos'));
const AnimalCategoriesManagement = lazyWithRetry(() => import('../agents/AnimalCategoriesManagement'));
const AnimalBreedsManagement = lazyWithRetry(() => import('../agents/AnimalBreedsManagement'));
const FarmManagement = lazyWithRetry(() => import('../agents/FarmManagement'));
const PeopleManagement = lazyWithRetry(() => import('../agents/PeopleManagement'));

interface InttegraDashboardProps {
  view?: string;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <Loader2 size={24} className="animate-spin text-[#65C04A]" />
  </div>
);

const InttegraDashboard: React.FC<InttegraDashboardProps> = ({ view, onToast }) => {
  const [subView, setSubView] = useState<'desktop' | 'estoque-partida' | 'animal-categories' | 'animal-breeds' | 'people'>('desktop');

  // Reset to desktop when view changes
  useEffect(() => {
    setSubView('desktop');
  }, [view]);

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

  if (view === 'pecuario-cadastros') {
    if (subView === 'estoque-partida') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <EstoquePartida theme="dark" onToast={onToast} onBack={() => setSubView('desktop')} />
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
    if (subView === 'people') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <div className="bg-white text-gray-900 min-h-screen rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <PeopleManagement onToast={onToast} onBack={() => setSubView('desktop')} />
          </div>
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PecuarioCadastrosDesktop
          theme="dark"
          onSelectEstoquePartida={() => setSubView('estoque-partida')}
          onSelectAnimalCategories={() => setSubView('animal-categories')}
          onSelectAnimalBreeds={() => setSubView('animal-breeds')}
          onSelectPessoas={() => setSubView('people')}
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
