/**
 * Seletor reutilizável de pessoa.
 * Uso: em tarefas, iniciativas e outras telas que precisam selecionar uma pessoa.
 */
import React, { useEffect, useState } from 'react';
import { listPessoas, type Pessoa } from '../lib/api/pessoasClient';

export interface PessoaSelectorProps {
  organizationId?: string | null;
  farmId?: string | null;
  value: string | null;
  onChange: (pessoaId: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const PessoaSelector: React.FC<PessoaSelectorProps> = ({
  organizationId,
  farmId: _farmId,
  value,
  onChange,
  placeholder = 'Selecionar pessoa...',
  className = '',
  disabled = false,
}) => {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setPessoas([]);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    listPessoas({ organizationId, ativo: true, signal: controller.signal })
      .then(({ data }) => {
        if (!cancelled) setPessoas(data);
      })
      .catch(() => { /* silent on abort */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [organizationId]);

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      disabled={disabled || loading}
      className={`border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${className}`}
    >
      <option value="">{loading ? 'Carregando...' : placeholder}</option>
      {pessoas.map(p => (
        <option key={p.id} value={p.id}>
          {p.preferred_name || p.full_name}
        </option>
      ))}
    </select>
  );
};

export default PessoaSelector;
