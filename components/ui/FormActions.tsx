import React from 'react';
import { Save } from 'lucide-react';

/**
 * Barra de ações padrão: status opcional à esquerda, botões Cancelar/Salvar
 * alinhados à direita. Salvar usa o verde do sistema (#16a34a) e um estado
 * desabilitado (#86cfa4).
 *
 * Padrão extraído de NascimentoView.
 */
interface FormActionsProps {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  /** Ícone do botão Salvar. Padrão: <Save size={16} />. Passe `null` para nenhum. */
  saveIcon?: React.ReactNode;
  /** Mensagem/indicador alinhado à esquerda (ex.: contagem, aviso). */
  status?: React.ReactNode;
}

const FormActions: React.FC<FormActionsProps> = ({
  onCancel,
  onSave,
  saveDisabled = false,
  saveLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  saveIcon,
  status,
}) => (
  <div className="mt-5 flex flex-wrap items-center gap-3">
    {status}
    <div className="flex-1" />
    <button
      type="button"
      onClick={onCancel}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
    >
      {cancelLabel}
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saveDisabled}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
        saveDisabled ? 'cursor-not-allowed bg-[#86cfa4]' : 'bg-[#16a34a] hover:bg-[#15803d]'
      }`}
    >
      {saveIcon === undefined ? <Save size={16} /> : saveIcon}
      {saveLabel}
    </button>
  </div>
);

export default FormActions;
