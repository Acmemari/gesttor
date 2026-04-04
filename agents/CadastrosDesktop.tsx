import React from 'react';
import { Building2, Users, UserCircle, ClipboardList, TrendingUp, Settings2, Briefcase, Beef } from 'lucide-react';

interface CadastroCardProps {
  title: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const CadastroCard: React.FC<CadastroCardProps> = ({ title, description, icon, onClick }) => (
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

const CadastroTitle: React.FC<{ entity: string }> = ({ entity }) => (
  <div className="flex flex-col items-start text-left">
    <span className="text-[0.6rem] font-medium text-gray-400">cadastro de</span>
    <span className="text-lg font-bold text-gray-900">{entity}</span>
  </div>
);

const ProgramWorkIcon: React.FC = () => (
  <div className="relative w-6 h-6">
    <ClipboardList size={24} className="text-gray-500" />
    <TrendingUp size={14} className="text-gray-700 absolute -right-1 -bottom-1" />
  </div>
);

interface CadastrosDesktopProps {
  onSelectProjeto?: () => void;
  onSelectFazendas: () => void;
  onSelectClientes?: () => void;
  onSelectPessoas: () => void;
  onSelectAnimalCategories?: () => void;
  onSelectPerfisConfig?: () => void;
  onSelectEmpAss?: () => void;
  showClientes?: boolean;
  showEmpAss?: boolean;
}

const CadastrosDesktop: React.FC<CadastrosDesktopProps> = ({
  onSelectProjeto,
  onSelectFazendas,
  onSelectClientes,
  onSelectPessoas,
  onSelectAnimalCategories,
  onSelectPerfisConfig,
  onSelectEmpAss,
  showClientes = false,
  showEmpAss = false,
}) => {
  const cards = [
    ...(showClientes && onSelectClientes
      ? [
          {
            id: 'clientes',
            title: <CadastroTitle entity="Organizações" />,
            description: 'Cadastre e gerencie organizações, vinculando fazendas e acompanhando o relacionamento.',
            icon: <Users size={24} />,
            onClick: onSelectClientes,
          },
        ]
      : []),
    {
      id: 'fazendas',
      title: <CadastroTitle entity="Fazendas" />,
      description: 'Gerencie propriedades rurais, dados da fazenda e configurações por organização.',
      icon: <Building2 size={24} />,
      onClick: onSelectFazendas,
    },
    ...(onSelectProjeto
      ? [
          {
            id: 'projeto',
            title: <CadastroTitle entity="Projeto" />,
            description:
              'Gerencie projetos, defina transformações esperadas, stakeholders e organize entregas, atividades e tarefas.',
            icon: <ProgramWorkIcon />,
            onClick: onSelectProjeto,
          },
        ]
      : []),
    {
      id: 'pessoas',
      title: <CadastroTitle entity="Pessoas" />,
      description: 'Colaboradores, consultores, fornecedores e clientes familiares.',
      icon: <UserCircle size={24} />,
      onClick: onSelectPessoas,
    },
    ...(onSelectAnimalCategories
      ? [
          {
            id: 'animal-categories',
            title: <CadastroTitle entity="Categoria Animal" />,
            description: 'Defina as categorias do seu rebanho com pesos e valores de mercado.',
            icon: <Beef size={24} />,
            onClick: onSelectAnimalCategories,
          },
        ]
      : []),
    ...(onSelectPerfisConfig
      ? [
          {
            id: 'perfis-config',
            title: <CadastroTitle entity="Perfis e Cargos" />,
            description: 'Configure os perfis (Proprietário, Gerente, Vaqueiro…) e cargos/funções disponíveis para associação com pessoas.',
            icon: <Settings2 size={24} />,
            onClick: onSelectPerfisConfig,
          },
        ]
      : []),
    ...(showEmpAss && onSelectEmpAss
      ? [
          {
            id: 'emp-ass',
            title: <CadastroTitle entity="Empresas de Assessoria" />,
            description: 'Cadastre e gerencie empresas de assessoria que utilizam o sistema.',
            icon: <Briefcase size={24} />,
            onClick: onSelectEmpAss,
          },
        ]
      : []),
  ];

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
      <header className="space-y-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Cadastros</h1>
        <p className="text-sm text-gray-500 max-w-2xl">Escolha um bloco para um novo cadastro</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map(card => (
          <CadastroCard
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

export default CadastrosDesktop;
