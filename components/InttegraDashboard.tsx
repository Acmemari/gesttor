import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import SmartStart from './SmartStart';

// Lazy-loaded components for Pecuária modules
const PecuarioCadastrosDesktop = lazy(() => import('../agents/pecuario/PecuarioCadastrosDesktop'));
const EstoquePartida = lazy(() => import('../agents/pecuario/EstoquePartida'));
const AnimalCategoriesManagement = lazy(() => import('../agents/AnimalCategoriesManagement'));
const FarmManagement = lazy(() => import('../agents/FarmManagement'));

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
  const [subView, setSubView] = useState<'desktop' | 'estoque-partida' | 'animal-categories'>('desktop');

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
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PecuarioCadastrosDesktop
          theme="dark"
          onSelectEstoquePartida={() => setSubView('estoque-partida')}
          onSelectAnimalCategories={() => setSubView('animal-categories')}
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
