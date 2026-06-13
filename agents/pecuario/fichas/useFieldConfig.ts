/**
 * Hook de configuração de campos do painel "Defina seus campos". Mantém
 * places/order/autonum + modal, carrega/salva a configuração por organização
 * (funções `load`/`save` injetadas pelo movimento) e aplica as restrições de
 * campos travados. Compartilhado por todos os movimentos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildFieldById, constrainPlace, defaultOrder, defaultPlaces } from './fieldConfig';
import type { FieldPlace, FieldPlaces, LrField, MovimentoFieldConfig } from './types';

interface UseFieldConfigArgs {
  registry: LrField[];
  organizationId: string;
  load: (orgId: string) => Promise<{ config: MovimentoFieldConfig | null }>;
  save: (orgId: string, config: MovimentoFieldConfig) => Promise<void>;
  onError?: (msg: string) => void;
}

export function useFieldConfig({ registry, organizationId, load, save, onError }: UseFieldConfigArgs) {
  const fieldById = useMemo(() => buildFieldById(registry), [registry]);
  const baseOrder = useMemo(() => defaultOrder(registry), [registry]);
  const [places, setPlaces] = useState<FieldPlaces>(() => defaultPlaces(registry));
  const [order, setOrder] = useState<string[]>(baseOrder);
  const [autonum, setAutonum] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Carrega a configuração salva (destino + ordem + Nº auto) por organização.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    load(organizationId)
      .then((row) => {
        if (cancelled || !row?.config) return;
        const cfg = row.config;
        if (cfg.places && typeof cfg.places === 'object') {
          setPlaces(() => {
            const merged = defaultPlaces(registry);
            for (const id of Object.keys(merged)) {
              const saved = (cfg.places as Record<string, string>)[id];
              if (saved === 'top' || saved === 'bottom' || saved === 'dados' || saved === 'off') merged[id] = saved;
            }
            return merged;
          });
        }
        if (Array.isArray(cfg.order)) {
          const known = cfg.order.filter((id) => fieldById[id]);
          const missing = baseOrder.filter((id) => !known.includes(id));
          setOrder([...known, ...missing]);
        }
        if (typeof cfg.autonum === 'boolean') setAutonum(cfg.autonum);
      })
      .catch(() => {
        /* sem config salva ou erro de rede: mantém os defaults */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const setPlace = useCallback(
    (id: string, val: FieldPlace) => {
      setPlaces((prev) => ({ ...prev, [id]: constrainPlace(fieldById[id], val) }));
    },
    [fieldById],
  );

  const reset = useCallback(() => {
    setPlaces(defaultPlaces(registry));
    setOrder(baseOrder);
    setAutonum(false);
  }, [registry, baseOrder]);

  // Fecha o modal e persiste destino + ordem + Nº auto (por organização).
  const closeConfig = useCallback(() => {
    setConfigOpen(false);
    if (organizationId) {
      save(organizationId, { places, order, autonum }).catch((err: any) =>
        onError?.(err?.message || 'Erro ao salvar configuração de campos'),
      );
    }
  }, [organizationId, places, order, autonum, save, onError]);

  return {
    fieldById,
    places,
    order,
    setOrder,
    autonum,
    setAutonum,
    configOpen,
    setConfigOpen,
    setPlace,
    reset,
    closeConfig,
  };
}
