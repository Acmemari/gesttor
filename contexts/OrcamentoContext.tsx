/**
 * Contexto do workspace de Gestão Orçamentária.
 *
 * Responsabilidades:
 * - Manter `orcamentoAtivo` (detalhado, com farms/versoes/colaboradores) e `versaoAtiva`.
 * - Restaurar automaticamente o último orçamento usado quando o workspace é (re)aberto.
 * - Persistir o id ativo em localStorage por (userId, organizationId) para sobrevida entre sessões.
 *
 * Reusa `useHierarchy()` para detectar a organização atual e listar orçamentos via API.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Orcamento, OrcamentoDetalhado, OrcamentoVersao } from '../components/orcamento/types';
import {
  createOrcamento as createOrcamentoApi,
  getOrcamentoById,
  listOrcamentos,
  type CreateOrcamentoPayload,
} from '../lib/api/orcamentosClient';
import { useHierarchy } from './HierarchyContext';
import { useAuth } from './AuthContext';

interface OrcamentoContextValue {
  orcamentoAtivo: OrcamentoDetalhado | null;
  versaoAtiva: OrcamentoVersao | null;
  /** Lista (resumida) de orçamentos disponíveis na organização atual — para o seletor. */
  orcamentosDisponiveis: Orcamento[];
  loading: boolean;
  setOrcamentoAtivoId: (id: string | null) => Promise<void>;
  setVersaoAtivaId: (id: string | null) => void;
  criarOrcamento: (
    payload: CreateOrcamentoPayload,
  ) => Promise<{ ok: true; orcamento: Orcamento; versao: OrcamentoVersao } | { ok: false; error: string }>;
  refreshOrcamento: () => Promise<void>;
}

const OrcamentoContext = createContext<OrcamentoContextValue | undefined>(undefined);

const LS_PREFIX = 'orcamentoAtivo.v1';

function lsKey(userId: string | null | undefined, orgId: string | null | undefined): string | null {
  if (!userId || !orgId) return null;
  return `${LS_PREFIX}.${userId}.${orgId}`;
}

export function OrcamentoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { selectedOrganization } = useHierarchy();

  const [orcamentoAtivo, setOrcamentoAtivo] = useState<OrcamentoDetalhado | null>(null);
  const [versaoAtivaId, setVersaoAtivaIdState] = useState<string | null>(null);
  const [orcamentosDisponiveis, setOrcamentosDisponiveis] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(false);

  const versaoAtiva = useMemo<OrcamentoVersao | null>(() => {
    if (!orcamentoAtivo) return null;
    if (versaoAtivaId) {
      const v = orcamentoAtivo.versoes.find((vv) => vv.id === versaoAtivaId);
      if (v) return v;
    }
    return orcamentoAtivo.versoes[0] ?? null;
  }, [orcamentoAtivo, versaoAtivaId]);

  const orgIdAtual = selectedOrganization?.id ?? null;
  const userIdAtual = user?.id ?? null;

  /**
   * Effect de restore: quando organização ou usuário muda, listar orçamentos da org
   * e ativar o último usado (via localStorage) ou o mais recente disponível.
   *
   * Espera até que `user` esteja carregado — chamadas API antes disso podem
   * falhar (401) e poluir o cache de "lista vazia".
   */
  useEffect(() => {
    if (!orgIdAtual) {
      setOrcamentoAtivo(null);
      setVersaoAtivaIdState(null);
      setOrcamentosDisponiveis([]);
      return;
    }
    if (!userIdAtual) {
      // Auth ainda não pronta — não dispara fetch.
      return;
    }

    let aborted = false;
    setLoading(true);

    (async () => {
      console.debug('[OrcamentoContext] restore: listando orçamentos da org', orgIdAtual);
      const { data } = await listOrcamentos({ organizationId: orgIdAtual });
      if (aborted) return;
      console.debug('[OrcamentoContext] restore: recebidos', data.length, 'orçamentos');
      setOrcamentosDisponiveis(data);

      if (data.length === 0) {
        setOrcamentoAtivo(null);
        setVersaoAtivaIdState(null);
        setLoading(false);
        return;
      }

      // Decide qual ativar: last-active (localStorage) ou mais recente.
      const key = lsKey(userIdAtual, orgIdAtual);
      let alvoId: string | null = null;
      if (key && typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(key);
        if (stored && data.some((o) => o.id === stored)) alvoId = stored;
      }
      if (!alvoId) alvoId = data[0].id; // backend retorna desc por createdAt

      const detalhado = await getOrcamentoById(alvoId);
      if (aborted) return;
      setOrcamentoAtivo(detalhado);
      setVersaoAtivaIdState(detalhado?.versoes[0]?.id ?? null);
      setLoading(false);
    })().catch(() => {
      if (!aborted) setLoading(false);
    });

    return () => {
      aborted = true;
    };
  }, [orgIdAtual, userIdAtual]);

  /** Persiste id do orçamento ativo no localStorage. */
  useEffect(() => {
    const key = lsKey(userIdAtual, orgIdAtual);
    if (!key || typeof window === 'undefined') return;
    if (orcamentoAtivo) {
      window.localStorage.setItem(key, orcamentoAtivo.id);
    } else {
      // Não removemos a chave aqui — manter o último ativo conhecido para próxima sessão.
    }
  }, [orcamentoAtivo, userIdAtual, orgIdAtual]);

  const setOrcamentoAtivoId = useCallback(async (id: string | null) => {
    if (!id) {
      setOrcamentoAtivo(null);
      setVersaoAtivaIdState(null);
      return;
    }
    setLoading(true);
    const detalhado = await getOrcamentoById(id);
    setOrcamentoAtivo(detalhado);
    setVersaoAtivaIdState(detalhado?.versoes[0]?.id ?? null);
    setLoading(false);
  }, []);

  const setVersaoAtivaId = useCallback((id: string | null) => {
    setVersaoAtivaIdState(id);
  }, []);

  const refreshOrcamento = useCallback(async () => {
    if (!orcamentoAtivo) return;
    const detalhado = await getOrcamentoById(orcamentoAtivo.id);
    setOrcamentoAtivo(detalhado);
  }, [orcamentoAtivo]);

  const criarOrcamento = useCallback(async (payload: CreateOrcamentoPayload) => {
    const res = await createOrcamentoApi(payload);
    if ('error' in res) return { ok: false as const, error: res.error };
    // Recarrega o detalhado para popular farms/versoes/colaboradores.
    const detalhado = await getOrcamentoById(res.data.orcamento.id);
    if (detalhado) {
      setOrcamentoAtivo(detalhado);
      setVersaoAtivaIdState(detalhado.versoes[0]?.id ?? null);
    }
    // Atualiza lista disponível
    if (orgIdAtual) {
      const { data } = await listOrcamentos({ organizationId: orgIdAtual });
      setOrcamentosDisponiveis(data);
    }
    return { ok: true as const, orcamento: res.data.orcamento, versao: res.data.versao };
  }, [orgIdAtual]);

  const value = useMemo<OrcamentoContextValue>(
    () => ({
      orcamentoAtivo,
      versaoAtiva,
      orcamentosDisponiveis,
      loading,
      setOrcamentoAtivoId,
      setVersaoAtivaId,
      criarOrcamento,
      refreshOrcamento,
    }),
    [orcamentoAtivo, versaoAtiva, orcamentosDisponiveis, loading, setOrcamentoAtivoId, setVersaoAtivaId, criarOrcamento, refreshOrcamento],
  );

  return <OrcamentoContext.Provider value={value}>{children}</OrcamentoContext.Provider>;
}

export function useOrcamento(): OrcamentoContextValue {
  const ctx = useContext(OrcamentoContext);
  if (!ctx) throw new Error('useOrcamento deve ser usado dentro de <OrcamentoProvider>');
  return ctx;
}
