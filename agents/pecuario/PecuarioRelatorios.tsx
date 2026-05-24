import React from 'react';
import { BarChart3, Construction } from 'lucide-react';

const PecuarioRelatorios: React.FC = () => {
  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
      <header className="space-y-4 mb-8">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-gray-500" />
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Pecuário · Relatórios</h1>
        </div>
        <p className="text-sm text-gray-500 max-w-2xl">
          Indicadores zootécnicos, evolução do rebanho, produtividade e demais relatórios do módulo Pecuário.
        </p>
      </header>

      <div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500 border border-dashed border-gray-200 rounded-2xl p-12 bg-white">
        <Construction size={32} className="mb-3 opacity-40" />
        <h2 className="text-base font-semibold text-gray-700 mb-1">Em construção</h2>
        <p className="text-xs max-w-md">Os relatórios serão adicionados em breve.</p>
      </div>
    </div>
  );
};

export default PecuarioRelatorios;
