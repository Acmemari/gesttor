import React from 'react';
import { Layers } from 'lucide-react';
import SmartStart from './SmartStart';

interface InttegraDashboardProps {
  view?: string;
}

const InttegraDashboard: React.FC<InttegraDashboardProps> = ({ view }) => {
  if (view === 'smart-start') {
    return <SmartStart />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-ai-subtext px-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
        <Layers size={32} className="text-emerald-500" />
      </div>
      <h2 className="text-xl font-semibold text-ai-text mb-2">Inttegra</h2>
      <p className="text-sm text-center max-w-md">
        Workspace em construção. Utilize o menu lateral para navegar pelos módulos.
      </p>
    </div>
  );
};

export default InttegraDashboard;
