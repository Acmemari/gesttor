import React from 'react';
import { Boxes } from 'lucide-react';
import { CategoriaAnimalIcon } from '../../components/icons/CategoriaAnimalIcon';

interface PecuarioCardProps {
  title: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}

const PecuarioCard: React.FC<PecuarioCardProps> = ({ title, description, icon, onClick, active = true }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!active}
    className={`group relative flex flex-col p-6 rounded-2xl border bg-white text-left w-full transition-all duration-150 ${
      active
        ? 'border-gray-200 cursor-pointer hover:shadow-sm hover:border-gray-800'
        : 'border-gray-200 opacity-60 pointer-events-none'
    }`}
  >
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center justify-center text-gray-500">{icon}</div>
    </div>
    <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-xs text-gray-500 leading-relaxed line-clamp-5">{description}</p>
  </button>
);

const CadastroTitle: React.FC<{ entity: string }> = ({ entity }) => (
  <div className="flex flex-col items-start text-left">
    <span className="text-[0.6rem] font-medium text-gray-400">cadastro de</span>
    <span className="text-lg font-bold text-gray-900">{entity}</span>
  </div>
);

interface PecuarioCadastrosDesktopProps {
  onSelectEstoquePartida: () => void;
  onSelectAnimalCategories?: () => void;
}

const PecuarioCadastrosDesktop: React.FC<PecuarioCadastrosDesktopProps> = ({
  onSelectEstoquePartida,
  onSelectAnimalCategories,
}) => {
  const cards = [
    {
      id: 'estoque-partida',
      title: <CadastroTitle entity="Estoque de Partida" />,
      description: 'Registre o inventário inicial do rebanho por fazenda e categoria animal, base para movimentações e relatórios.',
      icon: <Boxes size={24} />,
      onClick: onSelectEstoquePartida,
      active: true,
    },
    ...(onSelectAnimalCategories
      ? [
          {
            id: 'animal-categories',
            title: <CadastroTitle entity="Categoria Animal" />,
            description: 'Defina as categorias do seu rebanho com pesos e valores de mercado.',
            icon: <CategoriaAnimalIcon size={24} />,
            onClick: onSelectAnimalCategories,
            active: true,
          },
        ]
      : []),
  ];

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
      <header className="space-y-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Pecuário · Cadastros</h1>
        <p className="text-sm text-gray-500 max-w-2xl">Escolha um bloco para um novo cadastro</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map(card => (
          <PecuarioCard
            key={card.id}
            title={card.title}
            description={card.description}
            icon={card.icon}
            onClick={card.onClick}
            active={card.active}
          />
        ))}
      </div>
    </div>
  );
};

export default PecuarioCadastrosDesktop;
