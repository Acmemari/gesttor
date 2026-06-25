import { useEffect, useMemo, useState } from 'react';

export interface FarmLocal {
  id: string;
  name: string;
  retiroName?: string;
}

interface BundleRetiro { id: string; name: string; isDefault?: boolean | null }
interface BundleLocal { id: string; name: string; retiroName?: string | null; isDefault?: boolean | null }
interface BundleLevels { retiro: boolean; setor: boolean; local: boolean }

export interface UseRetirosResult {
  /** Locais (não-padrão) da fazenda — alimenta o seletor de Local das movimentações. */
  farmLocais: FarmLocal[];
  /** Nomes de retiro selecionáveis quando o nível Retiro está ativo. */
  retiros: string[];
  /** O nível Retiro está ativo no cadastro desta fazenda? */
  retiroAtivo: boolean;
  /** Nome do retiro padrão do sistema — exibido (desabilitado) quando o nível está desligado. */
  defaultRetiroName: string;
  loading: boolean;
}

/**
 * Estado de retiros/locais de uma fazenda para as telas de movimento, numa única
 * chamada ao bundle de farm-locations. Quando o nível Retiro está DESATIVADO no
 * cadastro da fazenda ("Personalizar níveis"), `retiroAtivo` é false e
 * `defaultRetiroName` traz o retiro padrão (espelha a coluna RETIROS do cadastro
 * de áreas), para o campo aparecer preenchido e desabilitado — a referência de
 * estoque continua visível em todos os movimentos.
 */
export function useRetiros(fazenda: string, farmName?: string): UseRetirosResult {
  const [farmLocais, setFarmLocais] = useState<FarmLocal[]>([]);
  const [retiroAtivo, setRetiroAtivo] = useState(true);
  const [defaultRetiroName, setDefaultRetiroName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fazenda) {
      setFarmLocais([]);
      setRetiroAtivo(true);
      setDefaultRetiroName('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/farm-locations?bundle=${encodeURIComponent(fazenda)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const data = json?.data ?? json ?? {};
        const locais = (data.locais ?? []) as BundleLocal[];
        const retirosRaw = (data.retiros ?? []) as BundleRetiro[];
        const levels = (data.levels ?? {}) as Partial<BundleLevels>;
        setFarmLocais(
          locais
            .filter((l) => !l.isDefault)
            .map((l) => ({ id: l.id, name: l.name, retiroName: l.retiroName ?? undefined })),
        );
        setRetiroAtivo(levels.retiro !== false);
        const padrao = retirosRaw.find((r) => r.isDefault);
        setDefaultRetiroName(padrao?.name || farmName || '');
      })
      .catch(() => {
        if (cancelled) return;
        setFarmLocais([]);
        setRetiroAtivo(true);
        setDefaultRetiroName(farmName || '');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fazenda, farmName]);

  const retiros = useMemo(() => {
    const set = new Set<string>();
    for (const l of farmLocais) if (l.retiroName) set.add(l.retiroName);
    return [...set];
  }, [farmLocais]);

  return { farmLocais, retiros, retiroAtivo, defaultRetiroName, loading };
}
