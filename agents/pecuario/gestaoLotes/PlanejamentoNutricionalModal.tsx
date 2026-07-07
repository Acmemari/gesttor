import React from 'react';
import type { Lote } from '../../../lib/api/lotesClient';
import { ModalShell } from './LoteModals';
import PlanejamentoNutricionalTab from './PlanejamentoNutricionalTab';

/**
 * Modal do Planejamento Nutricional do lote (metas de abate + plano por fases).
 * Aberto pelo botão "Planejamento" no card Regime nutricional — mantém o card do
 * tamanho dos demais e dá espaço à tabela de fases. O formulário e o "Salvar"
 * ficam dentro de `PlanejamentoNutricionalTab`.
 */
const PlanejamentoNutricionalModal: React.FC<{
  lote: Lote;
  organizationId: string;
  encerrado: boolean;
  onClose: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}> = ({ lote, organizationId, encerrado, onClose, onToast }) => (
  <ModalShell
    title="Planejamento nutricional"
    subtitle={`Lote ${lote.nome}${lote.codigo ? ` (${lote.codigo})` : ''} — metas de abate + plano por fases`}
    maxWidthClass="max-w-5xl"
    onClose={onClose}
    footer={
      <button
        type="button"
        onClick={onClose}
        className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        Fechar
      </button>
    }
  >
    <PlanejamentoNutricionalTab
      lote={lote}
      organizationId={organizationId}
      encerrado={encerrado}
      onToast={onToast}
    />
  </ModalShell>
);

export default PlanejamentoNutricionalModal;
