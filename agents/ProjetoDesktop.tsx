import React from 'react';
import { LayoutDashboard, ListTodo, FolderOpen, ClipboardList } from 'lucide-react';

interface ProjetoCardProps {
  title: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const ProjetoCard: React.FC<ProjetoCardProps> = ({ title, description, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group relative flex flex-col p-6 rounded-2xl border border-gray-200 bg-white hover:border-gray-800 hover:shadow-sm transition-all duration-200 text-left w-full"
  >
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center justify-center text-gray-500">{icon}</div>
    </div>
    <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-xs text-gray-500 leading-relaxed line-clamp-5">{description}</p>
  </button>
);

const ProjetoTitle: React.FC<{ entity: string }> = ({ entity }) => (
  <div className="flex flex-col items-start text-left">
    <span className="text-[0.6rem] font-medium text-gray-400">projeto</span>
    <span className="text-lg font-bold text-gray-900">{entity}</span>
  </div>
);

interface ProjetoDesktopProps {
  onSelectOverview: () => void;
  onSelectAtividades: () => void;
  onSelectKanban: () => void;
  onSelectEstrutura: () => void;
}

const ProjetoDesktop: React.FC<ProjetoDesktopProps> = ({
  onSelectOverview,
  onSelectAtividades,
  onSelectKanban,
  onSelectEstrutura,
}) => {
  const cards = [
    {
      id: 'overview',
      title: <ProjetoTitle entity="Visão Geral" />,
      description: 'Resumo das iniciativas, entregas e progresso. Visualize indicadores e status geral do projeto.',
      icon: <LayoutDashboard size={24} />,
      onClick: onSelectOverview,
    },
    {
      id: 'atividades',
      title: <ProjetoTitle entity="Atividades" />,
      description:
        'Gerencie iniciativas e macro atividades. Crie, edite e acompanhe o desenvolvimento de cada atividade.',
      icon: <ListTodo size={24} />,
      onClick: onSelectAtividades,
    },
    {
      id: 'kanban',
      title: <ProjetoTitle entity="Kanban" />,
      description: 'Visualize tarefas em quadro Kanban. Arraste cards entre colunas para atualizar o status.',
      icon: <ClipboardList size={24} />,
      onClick: onSelectKanban,
    },
    {
      id: 'estrutura',
      title: <ProjetoTitle entity="Estrutura do Projeto" />,
      description: 'Projetos, entregas, atividades e tarefas em hierarquia. Exporte relatórios em PDF.',
      icon: <FolderOpen size={24} />,
      onClick: onSelectEstrutura,
    },
  ];

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
      <header className="space-y-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Projeto</h1>
        <p className="text-sm text-gray-500 max-w-2xl">Escolha um bloco para gerenciar seu projeto</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map(card => (
          <ProjetoCard
            key={card.id}
            title={card.title}
            description={card.description}
            icon={card.icon}
            onClick={card.onClick}
          />
        ))}
      </div>
    </div>
  );
};

export default ProjetoDesktop;
