import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Layers, MapPin, Leaf, Baby, ArrowLeftRight, Tag, Move, AlertTriangle,
  Loader2, List, LayoutGrid,
} from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import LoteAnimaisIcon from '../nascimento/LoteAnimaisIcon';
import TabSwitch from '../../../components/ui/TabSwitch';
import AnimalStatusBadge from '../fichaAnimal/AnimalStatusBadge';
import { listLotes, updateLote, createLote, type Lote } from '../../../lib/api/lotesClient';
import { listLoteEventos, createLoteEvento } from '../../../lib/api/loteEventosClient';
import { listAnimalCategories } from '../../../lib/api/animalCategoriesClient';
import { listFichasAnimal } from '../../../lib/api/fichasAnimalClient';
import { listMovimentos as listNascimentos } from '../../../lib/api/nascimentosClient';
import { listMovimentos as listMortes } from '../../../lib/api/mortesClient';
import type { CategoriaLookup, AnimalLite, LoteEventoRow } from './types';
import {
  groupByLote, saldo, composicao, pendencias, animaisVinculados,
  localAtual, planoNutri, protocolo, faseRepro, ultimoRepro, timeline, formatDateBR,
  ledgerLoteByAnimal, resolveLoteIdFromText,
} from './util';
import type { ReproDados } from './types';
import LoteTimeline from './LoteTimeline';
import {
  RemanejarModal, TransferirModal, MudarRegimeModal, RegistrarReproModal,
  LoteFormModal, EncerrarModal, type EventoDraft,
} from './LoteModals';
import { IncluirPorIdModal } from './IncluirPorIdModal';

interface GestaoLotesViewProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  /** Abre a ficha de um animal (stub por ora). */
  onAbrirFicha?: (animalId: string) => void;
}

type ModalKind =
  | { kind: 'remanejar' }
  | { kind: 'incluirId' }
  | { kind: 'transferir' }
  | { kind: 'regime' }
  | { kind: 'repro' }
  | { kind: 'novo' }
  | { kind: 'editar' }
  | { kind: 'encerrar' }
  | null;

const GestaoLotesView: React.FC<GestaoLotesViewProps> = ({ onToast, onAbrirFicha }) => {
  const { selectedOrganization } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [eventos, setEventos] = useState<LoteEventoRow[]>([]);
  const [categorias, setCategorias] = useState<CategoriaLookup[]>([]);
  const [animais, setAnimais] = useState<AnimalLite[]>([]);
  const [animaisLoading, setAnimaisLoading] = useState(false);
  const [animaisCarregados, setAnimaisCarregados] = useState(false);

  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  // Abas do painel do lote: Lançamentos (cards operacionais) / Registros (animais).
  const [aba, setAba] = useState<'lancamentos' | 'registros'>('lancamentos');

  // ── Carga ──────────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const [ls, evs, cats] = await Promise.all([
        listLotes(organizationId),
        listLoteEventos(organizationId),
        listAnimalCategories(organizationId),
      ]);
      setLotes(ls);
      setEventos(evs);
      setCategorias(cats.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome })));
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar lotes', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => { carregar(); }, [carregar]);

  // Recarrega só os eventos (após lançar um evento).
  const recarregarEventos = useCallback(async () => {
    if (!organizationId) return;
    try {
      const evs = await listLoteEventos(organizationId);
      setEventos(evs);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao recarregar eventos', 'error');
    }
  }, [organizationId, onToast]);

  // Carrega animais sob demanda (modo "por ID"). Mesma relação da Ficha Animal:
  // fichas persistidas + fichas derivadas dos nascimentos ainda não persistidas
  // (dedup por ID Manejo, a do banco tem prioridade), com a situação de Morte
  // aplicada a partir das baixas — assim todos os animais do plantel aparecem.
  const carregarAnimais = useCallback(async () => {
    if (!organizationId || animaisCarregados) return;
    try {
      setAnimaisLoading(true);
      const [fichas, nascimentos, mortes] = await Promise.all([
        listFichasAnimal(organizationId),
        listNascimentos(organizationId),
        listMortes(organizationId),
      ]);

      // Índice de baixas por ID Manejo / ID Eletrônico → marca o animal como morto.
      const morteByManejo = new Set<string>();
      const morteByRfid = new Set<string>();
      for (const m of mortes) {
        for (const f of m.fichas) {
          if (f.apelido) morteByManejo.add(f.apelido.trim().toLowerCase());
          if (f.rfid) morteByRfid.add(f.rfid.trim().toLowerCase());
        }
      }
      const situacaoDe = (apelido: string | null, rfid: string | null, base: string): string => {
        const a = (apelido || '').trim().toLowerCase();
        const r = (rfid || '').trim().toLowerCase();
        if ((a && morteByManejo.has(a)) || (r && morteByRfid.has(r))) return 'morte';
        return base;
      };

      // Fichas persistidas no banco.
      const out: AnimalLite[] = fichas.map((r) => ({
        id: r.id, apelido: r.apelido, rfid: r.rfid, raca: r.raca,
        categoriaId: r.categoriaId, lote: r.lote,
        situacao: situacaoDe(r.apelido, r.rfid, r.situacao || 'ativo'),
      }));

      // Fichas derivadas dos nascimentos ainda não persistidas (dedup por ID Manejo).
      const seen = new Set(out.map((a) => a.apelido.trim().toLowerCase()).filter(Boolean));
      for (const m of nascimentos) {
        for (const f of m.fichas) {
          const key = f.apelido.trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: f.id, apelido: f.apelido, rfid: f.rfid, raca: f.raca,
            categoriaId: f.categoriaId, lote: null,
            situacao: situacaoDe(f.apelido, f.rfid, 'ativo'),
          });
        }
      }

      setAnimais(out);
      setAnimaisCarregados(true);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar animais', 'error');
    } finally {
      setAnimaisLoading(false);
    }
  }, [organizationId, animaisCarregados, onToast]);

  // Seleção válida.
  useEffect(() => {
    setSelectedId((prev) => (prev && lotes.some((l) => l.id === prev) ? prev : lotes[0]?.id ?? null));
  }, [lotes]);

  const eventosByLote = useMemo(() => groupByLote(eventos), [eventos]);
  const catNome = useCallback((id: string | null) => categorias.find((c) => c.id === id)?.nome || '', [categorias]);
  const loteNome = useCallback((id: string | null) => {
    const l = lotes.find((x) => x.id === id);
    return l ? (l.codigo || l.nome) : (id ?? '');
  }, [lotes]);

  const selected = lotes.find((l) => l.id === selectedId) || null;
  const selectedEventos = selectedId ? (eventosByLote[selectedId] ?? []) : [];
  const isCria = selected?.finalidade === 'Cria';
  const encerrado = !!selected?.finalizado;

  // Animais individualizados que pertencem ao lote selecionado (ledger + ficha).
  const ledger = useMemo(() => ledgerLoteByAnimal(eventosByLote), [eventosByLote]);
  const animaisDoLote = useMemo(() => {
    if (!selected) return [];
    return animais.filter((a) => (ledger.get(a.id) ?? resolveLoteIdFromText(a.lote, lotes)) === selected.id);
  }, [animais, ledger, lotes, selected]);

  // Carrega os animais ao abrir a aba Registros (cacheado; recarrega após sync).
  useEffect(() => {
    if (aba === 'registros') carregarAnimais();
  }, [aba, selectedId, carregarAnimais]);

  // ── Persistência de eventos ──────────────────────────────────────────────────
  const lancarEventos = useCallback(async (drafts: EventoDraft[]) => {
    if (!selected) return;
    let totalNaoIdent = 0;
    for (const d of drafts) {
      await createLoteEvento({
        organizationId,
        loteId: selected.id,
        tipo: d.tipo,
        data: d.data,
        resp: d.resp,
        dados: d.dados,
        syncFichas: d.syncFichas,
      });
      totalNaoIdent += Number(d.dados?.naoIdent) || 0;
    }
    await recarregarEventos();
    // Animais podem ter mudado de lote (sync) — invalida cache.
    setAnimaisCarregados(false);
    if (totalNaoIdent > 0) {
      onToast?.(`Evento lançado. ${totalNaoIdent} cabeça(s) sem identificação enviadas à Mesa.`, 'warning');
    } else {
      onToast?.('Evento lançado com sucesso.', 'success');
    }
  }, [selected, organizationId, recarregarEventos, onToast]);

  // ── Lote (cadastro) ──────────────────────────────────────────────────────────
  const salvarNovoLote = useCallback(async (data: any) => {
    const novo = await createLote({ organizationId, finalizado: false, ...data });
    await carregar();
    setSelectedId(novo.id);
    onToast?.('Lote criado. Lance os primeiros eventos.', 'success');
  }, [organizationId, carregar, onToast]);

  const salvarEdicaoLote = useCallback(async (data: any) => {
    if (!selected) return;
    await updateLote(selected.id, { codigo: data.codigo, nome: data.nome, sistema: data.sistema, descricao: data.descricao });
    await carregar();
    onToast?.('Lote atualizado.', 'success');
  }, [selected, carregar, onToast]);

  const encerrarLote = useCallback(async () => {
    if (!selected) return;
    await updateLote(selected.id, { finalizado: true });
    await carregar();
    onToast?.('Lote encerrado. Segue consultável na lista.', 'success');
  }, [selected, carregar, onToast]);

  // ── Abertura de modais ───────────────────────────────────────────────────────
  const abrirIncluirId = () => { carregarAnimais(); setModal({ kind: 'incluirId' }); };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 size={24} className="animate-spin text-[#16a34a]" /></div>;
  }

  return (
    <div className="flex h-full flex-col bg-[#f8fafc]">
      <div className="px-6 pt-5">
        <h1 className="text-[20px] font-bold text-gray-900">Gestão de Lotes</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">Opere os lotes cadastrados: lance eventos e os estados se recalculam.</p>
      </div>

      <div className="flex min-h-0 flex-1 gap-5 overflow-hidden p-6 pt-4">
        {/* ── Coluna esquerda: lista ─────────────────────────────────────────── */}
        <aside className="flex w-[280px] shrink-0 flex-col gap-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Lotes</span>
            <button
              type="button"
              onClick={() => setModal({ kind: 'novo' })}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#16a34a] px-2.5 text-[12.5px] font-bold text-white hover:bg-[#15803d]"
            >
              <Plus size={14} /> Novo lote
            </button>
          </div>

          {lotes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-[12.5px] text-gray-400">
              Nenhum lote. Crie um lote ou cadastre em Cadastros › Lotes.
            </div>
          ) : (
            lotes.map((l) => {
              const evs = eventosByLote[l.id] ?? [];
              const s = saldo(evs);
              const pend = pendencias(evs);
              const local = localAtual(evs);
              const sel = l.id === selectedId;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedId(l.id)}
                  className={`rounded-xl border bg-white p-3 text-left transition-all ${sel ? 'border-[#16a34a] ring-2 ring-[#16a34a]/15' : 'border-gray-200 hover:border-gray-300'} ${l.finalizado ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {l.codigo && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-gray-700">{l.codigo}</span>}
                      {l.finalidade && <span className="rounded-full bg-[#e7f6ec] px-2 py-0.5 text-[10.5px] font-semibold text-[#16a34a]">{l.finalidade}</span>}
                    </div>
                    {l.finalizado && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-semibold text-gray-500">Encerrado</span>}
                  </div>
                  <p className="mt-1.5 text-[13.5px] font-bold text-gray-900">{l.nome}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Layers size={12} /> {s} cab.</span>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {local}</span>
                    {pend > 0 && <span className="inline-flex items-center gap-1 text-[#b45309]"><AlertTriangle size={12} /> {pend}</span>}
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* ── Coluna direita: ficha ──────────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-gray-400">Selecione um lote.</div>
          ) : (
            <>
              {/* Abas: Lançamentos (cards operacionais) / Registros (animais do lote) */}
              <TabSwitch
                tabs={[
                  { id: 'lancamentos', label: 'Lançamentos', icon: <LayoutGrid size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: saldo(selectedEventos) },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancamentos' | 'registros')}
              />

              {aba === 'lancamentos' ? (
                <>
              {/* Cards de controle */}
              <div className={`grid gap-4 ${isCria ? 'grid-cols-1 lg:grid-cols-4' : 'grid-cols-1 lg:grid-cols-3'}`}>
                <ControleCard
                  cor="#f97316" icon={<LoteAnimaisIcon size={18} />} titulo="Composição" pergunta="Quais animais estão nele?"
                  mudaPor="Movimento de Alocação"
                  acoes={encerrado ? null : (
                    <div className="flex flex-wrap gap-2">
                      <CardBtn onClick={() => setModal({ kind: 'remanejar' })} icon={<Move size={13} />}>Remanejar animais</CardBtn>
                      <CardBtn onClick={abrirIncluirId} variant="ghost" icon={<Tag size={13} />}>Incluir por ID</CardBtn>
                    </div>
                  )}
                >
                  <ComposicaoEstado eventos={selectedEventos} catNome={catNome} onAbrirFicha={onAbrirFicha} />
                </ControleCard>

                <ControleCard
                  cor="#0891b2" icon={<MapPin size={16} />} titulo="Localização" pergunta="Onde ele está?"
                  mudaPor="Transferência de Lote"
                  acoes={encerrado ? null : <CardBtn onClick={() => setModal({ kind: 'transferir' })} icon={<ArrowLeftRight size={13} />}>Transferir lote</CardBtn>}
                >
                  <p className="text-[15px] font-bold text-gray-900">{localAtual(selectedEventos)}</p>
                  <p className="mt-0.5 text-[12px] text-gray-500">Local atual derivado da última transferência.</p>
                </ControleCard>

                <ControleCard
                  cor="#16a34a" icon={<Leaf size={16} />} titulo="Regime nutricional" pergunta="Como é alimentado?"
                  mudaPor="Evento de Manejo"
                  acoes={encerrado ? null : <CardBtn onClick={() => setModal({ kind: 'regime' })} icon={<Leaf size={13} />}>Mudar regime</CardBtn>}
                >
                  <p className="text-[14px] font-bold text-gray-900">{planoNutri(selectedEventos) || 'Sem plano definido'}</p>
                  {protocolo(selectedEventos) ? (
                    <span className="mt-1.5 inline-block rounded-full bg-[#e7f6ec] px-2 py-0.5 text-[11px] font-semibold text-[#16a34a]">
                      Protocolo: {protocolo(selectedEventos)}
                    </span>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-gray-500">Sem protocolo reprodutivo ativo.</p>
                  )}
                </ControleCard>

                {isCria && (
                  <ControleCard
                    cor="#0d9488" icon={<Baby size={16} />} titulo="Processo reprodutivo" pergunta="Em que fase está?"
                    mudaPor="Evento Reprodutivo"
                    acoes={encerrado ? null : <CardBtn onClick={() => setModal({ kind: 'repro' })} icon={<Baby size={13} />}>Registrar evento</CardBtn>}
                  >
                    <p className="text-[14px] font-bold text-gray-900">{faseRepro(selectedEventos)}</p>
                    <ReproDetalhe eventos={selectedEventos} />
                  </ControleCard>
                )}
              </div>

              {/* Linha do tempo */}
              <LoteTimeline items={timeline(selectedEventos, { catNome, loteNome })} />
                </>
              ) : (
                <RegistrosLote
                  animais={animaisDoLote}
                  loading={!animaisCarregados || animaisLoading}
                  saldoTotal={saldo(selectedEventos)}
                  pend={pendencias(selectedEventos)}
                  catNome={catNome}
                  encerrado={encerrado}
                  onAbrirFicha={onAbrirFicha}
                  onIncluir={abrirIncluirId}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Modais ───────────────────────────────────────────────────────────── */}
      {modal?.kind === 'remanejar' && selected && (
        <RemanejarModal
          lote={selected} lotes={lotes} categorias={categorias}
          onClose={() => setModal(null)} onSubmit={lancarEventos}
        />
      )}
      {modal?.kind === 'incluirId' && selected && (
        <IncluirPorIdModal
          lote={selected} lotes={lotes} categorias={categorias} animais={animais} animaisLoading={animaisLoading}
          eventosByLote={eventosByLote} onClose={() => setModal(null)} onSubmit={lancarEventos}
        />
      )}
      {modal?.kind === 'transferir' && selected && (
        <TransferirModal lote={selected} localOrigem={localAtual(selectedEventos)} onClose={() => setModal(null)} onSubmit={lancarEventos} />
      )}
      {modal?.kind === 'regime' && selected && (
        <MudarRegimeModal lote={selected} onClose={() => setModal(null)} onSubmit={lancarEventos} />
      )}
      {modal?.kind === 'repro' && selected && (
        <RegistrarReproModal lote={selected} onClose={() => setModal(null)} onSubmit={lancarEventos} />
      )}
      {modal?.kind === 'novo' && (
        <LoteFormModal modo="novo" onClose={() => setModal(null)} onSubmit={salvarNovoLote} />
      )}
      {modal?.kind === 'editar' && selected && (
        <LoteFormModal modo="editar" inicial={selected} onClose={() => setModal(null)} onSubmit={salvarEdicaoLote} />
      )}
      {modal?.kind === 'encerrar' && selected && (
        <EncerrarModal lote={selected} onClose={() => setModal(null)} onConfirm={encerrarLote} />
      )}
    </div>
  );
};

// ── Subcomponentes ─────────────────────────────────────────────────────────────

/** Aba Registros: relação dos animais individualizados do lote selecionado. */
const RegistrosLote: React.FC<{
  animais: AnimalLite[];
  loading: boolean;
  saldoTotal: number;
  pend: number;
  catNome: (id: string | null) => string;
  encerrado: boolean;
  onAbrirFicha?: (id: string) => void;
  onIncluir: () => void;
}> = ({ animais, loading, saldoTotal, pend, catNome, encerrado, onAbrirFicha, onIncluir }) => (
  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
      <div>
        <h3 className="text-[14px] font-bold text-gray-900">Animais do lote</h3>
        <p className="mt-0.5 text-[12px] text-gray-500">
          {saldoTotal} cab.{animais.length > 0 ? ` · ${animais.length} identificado(s)` : ''}
          {pend > 0 ? ` · ${pend} sem identificação` : ''}
        </p>
      </div>
      {!encerrado && (
        <button
          type="button"
          onClick={onIncluir}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 text-[12.5px] font-bold text-white hover:bg-[#15803d]"
        >
          <Tag size={14} /> Incluir por ID
        </button>
      )}
    </div>
    {loading ? (
      <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
    ) : animais.length === 0 ? (
      <div className="px-4 py-12 text-center">
        <div className="mb-2 flex justify-center text-gray-300"><LoteAnimaisIcon size={34} /></div>
        <p className="text-[13px] font-semibold text-gray-500">
          {saldoTotal > 0 ? 'Nenhum animal identificado individualmente.' : 'Lote sem animais.'}
        </p>
        <p className="mt-1 text-[12px] text-gray-400">
          {saldoTotal > 0
            ? `${saldoTotal} cabeça(s) no lote sem ID. Use "Incluir por ID" para vincular.`
            : 'Inclua animais por ID ou remaneje um grupo na aba Lançamentos.'}
        </p>
      </div>
    ) : (
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#fafbfc]">
          <tr className="text-[11px] uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2 font-bold">ID de manejo</th>
            <th className="px-4 py-2 font-bold">Categoria</th>
            <th className="px-4 py-2 font-bold">Raça</th>
            <th className="px-4 py-2 text-right font-bold">Situação</th>
          </tr>
        </thead>
        <tbody>
          {animais.map((a) => (
            <tr
              key={a.id}
              onClick={() => onAbrirFicha?.(a.id)}
              className="cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50"
            >
              <td className="px-4 py-2.5 font-mono font-bold text-gray-800">{a.apelido}</td>
              <td className="px-4 py-2.5 text-gray-600">{catNome(a.categoriaId) || '—'}</td>
              <td className="px-4 py-2.5 text-gray-600">{a.raca || '—'}</td>
              <td className="px-4 py-2.5 text-right"><AnimalStatusBadge situacao={a.situacao} size="sm" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {pend > 0 && animais.length > 0 && (
      <div className="flex items-center gap-1.5 border-t border-gray-100 px-4 py-2.5 text-[11.5px] font-semibold text-[#b45309]">
        <AlertTriangle size={13} /> {pend} cabeça(s) sem identificação individual (pendência na Mesa).
      </div>
    )}
  </div>
);

const ControleCard: React.FC<{
  cor: string; icon: React.ReactNode; titulo: string; pergunta: string; mudaPor: string;
  acoes: React.ReactNode; children: React.ReactNode;
}> = ({ cor, icon, titulo, pergunta, mudaPor, acoes, children }) => (
  <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4">
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: cor }}>{icon}</span>
      <div>
        <h3 className="text-[13.5px] font-bold text-gray-900">{titulo}</h3>
        <p className="text-[11px] text-gray-400">{pergunta}</p>
      </div>
    </div>
    <div className="min-h-[64px] flex-1">{children}</div>
    <p className="mt-3 text-[11px] text-gray-400">muda por: <strong className="text-gray-500">{mudaPor}</strong></p>
    {acoes && <div className="mt-2">{acoes}</div>}
  </div>
);

const CardBtn: React.FC<{ onClick: () => void; icon?: React.ReactNode; variant?: 'solid' | 'ghost'; children: React.ReactNode }> = ({ onClick, icon, variant = 'solid', children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-bold transition-colors ${variant === 'solid' ? 'bg-[#16a34a] text-white hover:bg-[#15803d]' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
  >
    {icon}{children}
  </button>
);

const ComposicaoEstado: React.FC<{
  eventos: LoteEventoRow[]; catNome: (id: string | null) => string; onAbrirFicha?: (id: string) => void;
}> = ({ eventos, catNome, onAbrirFicha }) => {
  const s = saldo(eventos);
  const comp = composicao(eventos);
  const pend = pendencias(eventos);
  const vinc = animaisVinculados(eventos);
  return (
    <div>
      <p className="text-[20px] font-bold leading-none text-gray-900">{s} <span className="text-[13px] font-semibold text-gray-400">cab.</span></p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {comp.length === 0 ? (
          <span className="text-[12px] text-gray-400">Sem animais.</span>
        ) : comp.map((c) => (
          <span key={c.categoriaId ?? c.categoriaNome} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11.5px] font-semibold text-gray-700">
            {c.categoriaNome || catNome(c.categoriaId) || 'Sem categoria'}: {c.qtd}
          </span>
        ))}
      </div>
      {vinc.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {vinc.slice(0, 12).map((id) => (
            <button key={id} type="button" onClick={() => onAbrirFicha?.(id)} className="rounded bg-[#e7f6ec] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#16a34a] hover:underline">
              {id.slice(0, 8)}
            </button>
          ))}
          {vinc.length > 12 && <span className="text-[11px] text-gray-400">+{vinc.length - 12}</span>}
        </div>
      )}
      {pend > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#b45309]">
          <AlertTriangle size={12} /> {pend} sem identificação (pendência na Mesa)
        </p>
      )}
      {pend === 0 && vinc.length === 0 && comp.length > 0 && (
        <p className="mt-2 text-[11.5px] text-gray-400">Nenhum animal vinculado por ID ainda.</p>
      )}
    </div>
  );
};

const ReproDetalhe: React.FC<{ eventos: LoteEventoRow[] }> = ({ eventos }) => {
  const ev = ultimoRepro(eventos);
  if (!ev) return <p className="mt-0.5 text-[12px] text-gray-500">Sem evento reprodutivo ainda.</p>;
  const d = ev.dados as ReproDados;
  return (
    <p className="mt-0.5 text-[12px] text-gray-500">
      {d.detalhe ? `${d.detalhe} · ` : ''}{formatDateBR(ev.data)}
    </p>
  );
};

export default GestaoLotesView;
