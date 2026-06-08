import React from 'react';

/**
 * Controle de abas padrão (ex.: Lançamentos / Registros), com ícone opcional e
 * badge de contagem. Grid de colunas iguais → todas as abas têm a mesma largura.
 *
 * Padrão extraído de NascimentoView.
 */
export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Quando > 0, exibe um badge de contagem ao lado do label. */
  badge?: number;
}

interface TabSwitchProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

// Mapa estático: o JIT do Tailwind não gera classes interpoladas (`grid-cols-${n}`).
const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const TabSwitch: React.FC<TabSwitchProps> = ({ tabs, value, onChange }) => (
  <div className={`grid ${COLS[tabs.length] ?? 'grid-cols-2'} rounded-xl border border-gray-200 bg-white p-1`}>
    {tabs.map((tab) => {
      const active = tab.id === value;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            active ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.badge ? (
            <span
              className={`ml-0.5 rounded-full px-1.5 text-[11px] font-bold ${
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.badge}
            </span>
          ) : null}
        </button>
      );
    })}
  </div>
);

export default TabSwitch;
