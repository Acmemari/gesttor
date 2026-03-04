import React from 'react';
import { Table, FileText, Users } from 'lucide-react';

const cards = [
  {
    id: 'tabela-precificacao',
    title: 'Tabela de Precificação Sistema',
    description: 'Visualize e gerencie tabelas de precificação do sistema.',
    icon: <Table size={24} />,
  },
  {
    id: 'elaboracao-bpo',
    title: 'Elaboração proposta BPO',
    description: 'Elabore propostas de BPO para suas organizações.',
    icon: <FileText size={24} />,
  },
  {
    id: 'meus-clientes',
    title: 'Minhas Organizações',
    description: 'Acesse a lista de suas organizações.',
    icon: <Users size={24} />,
  },
];

const AreaCertificadosDesktop: React.FC = () => {
  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
      <header className="space-y-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Área Certificados</h1>
        <p className="text-sm text-gray-500 max-w-2xl">Ferramentas de certificação e precificação</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map(card => (
          <div
            key={card.id}
            className="group relative flex flex-col p-6 rounded-2xl border border-gray-200 bg-white text-left w-full opacity-90"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center justify-center text-gray-500">{card.icon}</div>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{card.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-5">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AreaCertificadosDesktop;
