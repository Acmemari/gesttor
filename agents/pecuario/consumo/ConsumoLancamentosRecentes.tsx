import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FilePen, IdCard, MoreHorizontal, Trash2, Beef, Tag, Cpu, Plus, Check, Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { formatDateBR } from './util';
import { CONSUMO_TIPOS, tipoNome, type LookupItem, type MovimentoConsumo } from './types';

/** Ficha de atribuição de ID emitida pelo formulário inline. */
export interface AtribConsumoFicha {
  idManejo: string;
  idEletronico: string;
  catId: string;
  tipo: string;
  pesoVivo: number | null;
  pesoMorto: number | null;
  valor: number | null;
  obs: string;
}

interface ConsumoLancamentosRecentesProps {
  movimentos: MovimentoConsumo[];
  categories: LookupItem[];
  catName: (id: string) => string;
  /** individualiza uma baixa coletiva pendente (atribuição de ID) */
  onAddFicha: (movId: string, ficha: AtribConsumoFicha) => void;
  onEditar: (movId: string) => void;
  onExcluir: (movId: string) => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/** Número formatado (kg) ou travessão. */
function kg(v: number | null): string {
  return v != null && v > 0 ? `${v} kg` : '—';
}
/** R$ formatado ou travessão. */
function brl(v: number | null): string {
  return v != null && v > 0 ? `R$ ${v}` : '—';
}

/**
 * Resumo da distribuição por categoria do movimento (ex.: "Boi gordo (2),
 * Vaca (1)"). Consolida os animais identificados (fichas, por catId) com as
 * baixas coletivas declaradas (catDecl).
 */
function catSummary(m: MovimentoConsumo, catName: (id: string) => string): string {
  const tally: Record<string, number> = {};
  for (const f of m.fichas) if (f.catId) tally[f.catId] = (tally[f.catId] || 0) + 1;
  for (const c of m.catDecl) if (c.catId) tally[c.catId] = (tally[c.catId] || 0) + c.qtd;
  const ids = Object.keys(tally);
  return ids.length ? ids.map((id) => `${catName(id)} (${tally[id]})`).join(', ') : 'A detalhar';
}

const StatusBadge: React.FC<{ status: 'pendente' | 'conciliado' }> = ({ status }) =>
  status === 'conciliado' ? (
    <span className="inline-flex items-center rounded-full bg-[#e7f6ec] px-2 py-0.5 text-[11px] font-bold text-[#16a34a]">
      Conciliado
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-bold text-[#b45309]">
      A detalhar
    </span>
  );

/** Item do menu de ações (•••). */
const MenuItem: React.FC<{ icon: React.ReactNode; label: string; danger?: boolean; disabled?: boolean; onClick: () => void }> = ({
  icon,
  label,
  danger,
  disabled,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className={danger ? 'text-red-500' : 'text-[#16a34a]'}>{icon}</span>
    {label}
  </button>
);

/**
 * Formulário inline de atribuição de ID: individualiza uma baixa coletiva
 * pendente (informa ID de Manejo/Eletrônico, categoria, tipo, pesos e valor).
 * Mantém estado próprio para resetar a cada animal adicionado.
 */
const AtribuirForm: React.FC<{
  movId: string;
  categories: LookupItem[];
  restantes: number;
  onAddFicha: (movId: string, ficha: AtribConsumoFicha) => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}> = ({ movId, categories, restantes, onAddFicha, onToast }) => {
  const [idManejo, setIdManejo] = useState('');
  const [idEletronico, setIdEletronico] = useState('');
  const [catId, setCatId] = useState('');
  const [tipo, setTipo] = useState('');
  const [pesoVivo, setPesoVivo] = useState('');
  const [pesoMorto, setPesoMorto] = useState('');
  const [valor, setValor] = useState('');
  const [obs, setObs] = useState('');

  const inputCls =
    'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
  const labelCls = 'text-[12px] font-semibold text-gray-700';

  const num = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const add = () => {
    const manejo = idManejo.trim();
    const eletronico = idEletronico.trim();
    if (!manejo && !eletronico) {
      onToast?.('Informe o ID de Manejo ou o ID Eletrônico', 'error');
      return;
    }
    if (!catId) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    if (!tipo) {
      onToast?.('Selecione o tipo (consumo ou doação)', 'error');
      return;
    }
    if (restantes <= 0) {
      onToast?.('Baixa já totalmente identificada', 'warning');
      return;
    }
    onAddFicha(movId, {
      idManejo: manejo,
      idEletronico: eletronico,
      catId,
      tipo,
      pesoVivo: num(pesoVivo),
      pesoMorto: num(pesoMorto),
      valor: num(valor),
      obs: obs.trim(),
    });
    setIdManejo('');
    setIdEletronico('');
    setPesoVivo('');
    setPesoMorto('');
    setValor('');
    setObs('');
  };

  return (
    <div
      className="mb-3 rounded-lg border border-[#b7e0c4] bg-white p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          add();
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[130px] flex-1">
          <label className={`${labelCls} inline-flex items-center gap-1.5`}>
            <Tag size={14} className="text-[#16a34a]" /> ID de Manejo
          </label>
          <input
            type="text"
            className={`${inputCls} mt-1.5`}
            placeholder="Ex.: 504A"
            value={idManejo}
            onChange={(e) => setIdManejo(e.target.value)}
          />
        </div>
        <div className="min-w-[130px] flex-1">
          <label className={`${labelCls} inline-flex items-center gap-1.5`}>
            <Cpu size={14} className="text-[#16a34a]" /> ID Eletrônico
          </label>
          <input
            type="text"
            className={`${inputCls} mt-1.5`}
            placeholder="Ex.: 982000123456789"
            value={idEletronico}
            onChange={(e) => setIdEletronico(e.target.value)}
          />
        </div>
        <div className="min-w-[130px] flex-1">
          <label className={labelCls}>Categoria</label>
          <select className={`${inputCls} mt-1.5`} value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">Selecione</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[150px] flex-1">
          <label className={labelCls}>Tipo</label>
          <select className={`${inputCls} mt-1.5`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Selecione</option>
            {CONSUMO_TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[110px]" style={{ flex: '0 0 110px' }}>
          <label className={labelCls}>Peso Vivo/Cab.</label>
          <input type="text" inputMode="decimal" className={`${inputCls} mt-1.5`} placeholder="kg" value={pesoVivo} onChange={(e) => setPesoVivo(e.target.value)} />
        </div>
        <div className="min-w-[110px]" style={{ flex: '0 0 110px' }}>
          <label className={labelCls}>Peso Morto/Cab.</label>
          <input type="text" inputMode="decimal" className={`${inputCls} mt-1.5`} placeholder="kg" value={pesoMorto} onChange={(e) => setPesoMorto(e.target.value)} />
        </div>
        <div className="min-w-[110px]" style={{ flex: '0 0 110px' }}>
          <label className={labelCls}>Valor Cabeça</label>
          <input type="text" inputMode="decimal" className={`${inputCls} mt-1.5`} placeholder="R$" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="min-w-[120px] flex-1">
          <label className={labelCls}>Observação</label>
          <input type="text" className={`${inputCls} mt-1.5`} placeholder="Opcional" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
        <button
          type="button"
          onClick={add}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
        >
          <Plus size={16} /> Atribuir
        </button>
      </div>
    </div>
  );
};

/**
 * Relação dos lançamentos de consumo/doação (master-detail). Cada linha
 * abre/fecha para mostrar os animais detalhados, as baixas coletivas e — quando
 * há baixa pendente — o formulário de Atribuir ID. Ações por linha: Ver, Editar,
 * Atribuir ID e Excluir (paridade com a tela de Mortes).
 */
const ConsumoLancamentosRecentes: React.FC<ConsumoLancamentosRecentesProps> = ({
  movimentos,
  categories,
  catName,
  onAddFicha,
  onEditar,
  onExcluir,
  onToast,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [atribuindo, setAtribuindo] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  };
  const closeMenu = () => setMenu(null);

  const ver = (id: string) => {
    setExpanded(id);
    setAtribuindo(null);
  };
  const atribuir = (id: string, restantes: number) => {
    setExpanded(id);
    if (restantes > 0) {
      setAtribuindo(id);
    } else {
      setAtribuindo(null);
      onToast?.('Baixa já totalmente identificada — nada a atribuir', 'warning');
    }
  };

  if (!movimentos.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f6ec] text-[#16a34a]">
          <Beef size={26} />
        </div>
        <h4 className="text-sm font-bold text-gray-700">Nenhuma baixa registrada ainda</h4>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-gray-400">
          Vá até a aba “Lançamentos” para registrar o primeiro consumo ou doação do rebanho.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#fcfcfd] text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
            <th className="w-[36px] border-b border-gray-200 px-3 py-3" />
            <th className="border-b border-gray-200 px-4 py-3">Data</th>
            <th className="border-b border-gray-200 px-4 py-3">Categoria</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right">Total</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right">Com ID</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right">Coletivo</th>
            <th className="border-b border-gray-200 px-4 py-3">Status</th>
            <th className="w-[70px] border-b border-gray-200 px-4 py-3 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {movimentos.map((m) => {
            const open = expanded === m.id;
            const restantes = m.naoIdentificados;
            return (
              <React.Fragment key={m.id}>
                <tr className="cursor-pointer hover:bg-[#fafbfc]" onClick={() => (open ? setExpanded(null) : ver(m.id))}>
                  <td className="border-b border-[#f1f2f4] px-3 py-3 text-gray-400">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 font-semibold text-gray-800">{formatDateBR(m.data)}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-700">{catSummary(m, catName)}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{m.qtd} cab.</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-right tabular-nums text-[#2563eb]">{m.fichas.length}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-right tabular-nums text-gray-700">{restantes}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={(e) => toggleMenu(e, m.id)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        menu?.id === m.id ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                      title="Ações"
                      aria-label="Ações"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>

                {open ? (
                  <tr>
                    <td colSpan={8} className="border-b border-[#f1f2f4] bg-[#fbfcfd] px-6 py-4">
                      {/* Resumo de identificação */}
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-[#eef0f2] px-2.5 py-1 text-[11.5px] font-semibold text-gray-600">
                          {m.qtd} cab.
                        </span>
                        {restantes > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeee3] px-2.5 py-1 text-[11.5px] font-semibold text-[#ea580c]">
                            <Info size={12} /> {m.fichas.length} de {m.qtd} identificados
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#16a34a]">
                            <Check size={12} /> Totalmente identificado
                          </span>
                        )}
                        {restantes > 0 ? (
                          <button
                            type="button"
                            onClick={() => setAtribuindo((prev) => (prev === m.id ? null : m.id))}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-[#15803d]"
                          >
                            <IdCard size={14} /> {atribuindo === m.id ? 'Fechar atribuição' : 'Atribuir ID'}
                          </button>
                        ) : null}
                      </div>

                      {/* Formulário de atribuição de ID */}
                      {restantes > 0 && atribuindo === m.id ? (
                        <AtribuirForm
                          movId={m.id}
                          categories={categories}
                          restantes={restantes}
                          onAddFicha={onAddFicha}
                          onToast={onToast}
                        />
                      ) : null}

                      {m.obs ? (
                        <p className="mb-3 text-[12.5px] text-gray-600">
                          <span className="font-semibold text-gray-500">Observação: </span>
                          {m.obs}
                        </p>
                      ) : null}

                      {m.fichas.length ? (
                        <div className="mb-3">
                          <h5 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">Animais identificados</h5>
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <table className="w-full border-collapse text-[12.5px]">
                              <thead>
                                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                                  <th className="border-b border-gray-100 px-3 py-2">ID Manejo</th>
                                  <th className="border-b border-gray-100 px-3 py-2">ID Eletrônico</th>
                                  <th className="border-b border-gray-100 px-3 py-2">Categoria</th>
                                  <th className="border-b border-gray-100 px-3 py-2">Tipo</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Peso Vivo/Cab.</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Peso Morto/Cab.</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Valor Cabeça</th>
                                  <th className="border-b border-gray-100 px-3 py-2">Observação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.fichas.map((f) => (
                                  <tr key={f.id}>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 font-semibold text-gray-800">{f.idManejo || '—'}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 font-mono text-[11px] text-gray-500">{f.idEletronico || '—'}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-gray-600">{catName(f.catId)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-gray-600">{tipoNome(f.tipo)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{kg(f.pesoVivo)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{kg(f.pesoMorto)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{brl(f.valor)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-gray-500">{f.obs || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}

                      {m.catDecl.length ? (
                        <div>
                          <h5 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">Baixas coletivas</h5>
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <table className="w-full border-collapse text-[12.5px]">
                              <thead>
                                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                                  <th className="border-b border-gray-100 px-3 py-2">Categoria</th>
                                  <th className="border-b border-gray-100 px-3 py-2">Tipo</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Peso Vivo/Cab.</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Peso Morto/Cab.</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Valor Cabeça</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Quantidade</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.catDecl.map((c, i) => (
                                  <tr key={`${c.catId}-${i}`}>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 font-semibold text-gray-800">{catName(c.catId)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-gray-600">{c.tipo ? tipoNome(c.tipo) : '—'}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{kg(c.pesoVivo ?? null)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{kg(c.pesoMorto ?? null)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{brl(c.valor ?? null)}</td>
                                    <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{c.qtd} cab.</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}

                      {!m.fichas.length && !m.catDecl.length ? (
                        <p className="text-[12.5px] text-gray-400">Sem detalhes registrados.</p>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Menu de ações (•••): Ver, Editar, Atribuir ID, Excluir */}
      {menu
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenu} />
              <div
                className="fixed z-50 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                style={{ top: menu.y + 6, right: Math.max(8, window.innerWidth - menu.x) }}
              >
                <MenuItem
                  icon={<Eye size={15} />}
                  label="Ver"
                  onClick={() => {
                    ver(menu.id);
                    closeMenu();
                  }}
                />
                <MenuItem
                  icon={<FilePen size={15} />}
                  label="Editar"
                  onClick={() => {
                    onEditar(menu.id);
                    closeMenu();
                  }}
                />
                <MenuItem
                  icon={<IdCard size={15} />}
                  label="Atribuir ID"
                  onClick={() => {
                    const restantes = movimentos.find((x) => x.id === menu.id)?.naoIdentificados ?? 0;
                    atribuir(menu.id, restantes);
                    closeMenu();
                  }}
                />
                <div className="my-1 border-t border-gray-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label="Excluir"
                  danger
                  onClick={() => {
                    onExcluir(menu.id);
                    closeMenu();
                  }}
                />
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
};

export default ConsumoLancamentosRecentes;
