import React from 'react';

interface RetiroFieldProps {
  /** Valor atual (nome do retiro). */
  value: string;
  /** Chamado apenas quando o nível Retiro está ativo (campo editável). */
  onChange: (value: string) => void;
  /** Nomes selecionáveis (nível ativo). */
  retiros: string[];
  /** O nível Retiro está ativo nesta fazenda? */
  retiroAtivo: boolean;
  /** Retiro padrão do sistema — mostrado quando o nível está desligado. */
  defaultRetiroName: string;
  inputCls: string;
  labelCls: string;
  /** Margem do input (varia por tela: 'mt-1' ou 'mt-1.5'). */
  inputMargin?: string;
}

/**
 * Campo "Retiro" das telas de movimento. Com o nível Retiro ATIVO no cadastro da
 * fazenda, é um seletor normal. Com o nível DESATIVADO, o campo permanece visível
 * porém desabilitado, mostrando o retiro padrão do sistema (espelha a coluna
 * RETIROS do cadastro de áreas) — mantém a referência de estoque à vista.
 */
const RetiroField: React.FC<RetiroFieldProps> = ({
  value,
  onChange,
  retiros,
  retiroAtivo,
  defaultRetiroName,
  inputCls,
  labelCls,
  inputMargin = 'mt-1.5',
}) => {
  if (!retiroAtivo) {
    return (
      <>
        <label className={labelCls}>Retiro</label>
        <select
          disabled
          title="O nível Retiro está desativado no cadastro desta fazenda (retiro padrão do sistema)."
          className={`${inputCls} ${inputMargin} cursor-not-allowed bg-gray-50 text-gray-500`}
          value={defaultRetiroName}
          onChange={() => {}}
        >
          <option value={defaultRetiroName}>{defaultRetiroName || '—'}</option>
        </select>
      </>
    );
  }
  return (
    <>
      <label className={labelCls}>Retiro</label>
      <select className={`${inputCls} ${inputMargin}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {retiros.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </>
  );
};

export default RetiroField;
