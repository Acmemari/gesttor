import React from 'react';
import NascimentoView from './nascimento/NascimentoView';

interface PecuarioMovimentosProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/**
 * Pecuário · Movimentos.
 * Por enquanto, hospeda a tela de Nascimento (Movimentação › Nascimento).
 * Futuras movimentações (Compra, Venda, Morte, Transferência) entram aqui como blocos/abas.
 */
const PecuarioMovimentos: React.FC<PecuarioMovimentosProps> = ({ onToast }) => {
  return <NascimentoView onToast={onToast} />;
};

export default PecuarioMovimentos;
