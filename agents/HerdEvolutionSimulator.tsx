import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { Toast } from '../components/Toast';

interface HerdEvolutionSimulatorProps {
  onToast?: (toast: Toast) => void;
}

const HerdEvolutionSimulator: React.FC<HerdEvolutionSimulatorProps> = () => {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <TrendingUp size={22} style={{ color: '#8B6914' }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#3a3a3a' }}>
          Evolução do Rebanho
        </h2>
      </div>
      <p style={{ color: '#888', fontSize: 14 }}>Em construção — implementação em etapas.</p>
    </div>
  );
};

export default HerdEvolutionSimulator;
