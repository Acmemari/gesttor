import React from 'react';
import { CalendarDays, CalendarRange, Calendar } from 'lucide-react';

interface RotinasFazendaDesktopProps {
  onSelectRotinaSemanal?: () => void;
}

const RotinasFazendaDesktop: React.FC<RotinasFazendaDesktopProps> = ({ onSelectRotinaSemanal }) => {
  const cards = [
    {
      id: 'rotina-semanal',
      title: 'Rotina Semanal',
      description: 'Gestão semanal de atividades por responsável, com ciclo de abertura e fechamento de semanas, agrupamento por tags, filtros e histórico.',
      icon: <CalendarDays size={24} />,
      onClick: onSelectRotinaSemanal,
      active: !!onSelectRotinaSemanal,
    },
    {
      id: 'rotina-mensal',
      title: 'Rotina Mensal',
      description: 'Rotinas e tarefas de acompanhamento mensal.',
      icon: <CalendarRange size={24} />,
      onClick: undefined,
      active: false,
    },
    {
      id: 'rotina-trimestral',
      title: 'Rotina Trimestral',
      description: 'Rotinas e tarefas de acompanhamento trimestral.',
      icon: <Calendar size={24} />,
      onClick: undefined,
      active: false,
    },
  ];

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
      <header className="space-y-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Rotinas Fazenda</h1>
        <p className="text-sm text-gray-500 max-w-2xl">Rotinas de acompanhamento da fazenda</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map(card => (
          <div
            key={card.id}
            onClick={card.onClick}
            className={`group relative flex flex-col p-6 rounded-2xl border bg-white text-left w-full transition-all duration-150 ${
              card.active
                ? 'border-gray-200 opacity-100 cursor-pointer hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5'
                : 'border-gray-200 opacity-60 pointer-events-none'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className={`flex items-center justify-center ${card.active ? 'text-indigo-500' : 'text-gray-400'}`}>
                {card.icon}
              </div>
              {card.active && (
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Disponível</span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{card.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-5">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RotinasFazendaDesktop;
