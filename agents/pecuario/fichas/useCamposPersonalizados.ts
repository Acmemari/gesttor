/**
 * Carrega os Campos Personalizados (cadastro) da organização e os converte em
 * LrField[] do kit "Defina seus campos", filtrados pelo movimento atual. Cada
 * movimento mescla o resultado ao seu registry:
 *   const cpFields = useCamposPersonalizados(organizationId, 'compra');
 *   const registry = useMemo(() => [...COMPRA_FIELDS, ...cpFields], [cpFields]);
 *
 * O id de cada campo é prefixado com `cp_` para (1) não colidir com os campos
 * nativos e (2) identificar, no `values` da ficha, o que vai para a coluna
 * `extras` (jsonb) na hora de salvar.
 */
import { useEffect, useMemo, useState } from 'react';
import type { LrField } from './types';
import {
  listCamposPersonalizados,
  type CampoPersonalizado,
  type CampoMovimento,
} from '../../../lib/api/camposPersonalizadosClient';

/** Prefixo dos ids dos campos personalizados (estável entre recarregamentos). */
export const CAMPO_PERSONALIZADO_PREFIX = 'cp_';

/**
 * Extrai do `values` de uma ficha apenas os valores dos campos personalizados
 * (chaves `cp_*` não vazias) para gravar na coluna `extras` (jsonb).
 */
export function extractExtras(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(values)) {
    if (k.startsWith(CAMPO_PERSONALIZADO_PREFIX)) {
      const v = values[k];
      if (v != null && v !== '') out[k] = v;
    }
  }
  return out;
}

function toLrField(c: CampoPersonalizado): LrField {
  return {
    id: `${CAMPO_PERSONALIZADO_PREFIX}${c.id}`,
    label: c.nome,
    type: c.tipo === 'texto' ? 'text' : c.tipo === 'numero' ? 'number' : 'select',
    req: c.obrigatorio || undefined,
    options: c.tipo === 'lista' ? c.opcoes : undefined,
    placeholder: c.tipo === 'lista' ? 'Selecione' : undefined,
    def: 'dados',
    span: 1,
  };
}

export function useCamposPersonalizados(organizationId: string, movimento: CampoMovimento): LrField[] {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);

  useEffect(() => {
    if (!organizationId) {
      setCampos([]);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    listCamposPersonalizados(organizationId, ctrl.signal)
      .then((rows) => {
        if (!cancelled) setCampos(rows);
      })
      .catch(() => {
        /* silencioso: sem campos personalizados o painel segue só com os nativos */
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [organizationId]);

  return useMemo(
    () =>
      campos
        .filter((c) => Array.isArray(c.movimentos) && c.movimentos.includes(movimento))
        .map(toLrField),
    [campos, movimento],
  );
}
