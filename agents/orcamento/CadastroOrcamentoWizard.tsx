import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X as XIcon,
  Trash2,
  UserPlus,
  AlertCircle,
} from 'lucide-react';
import { useHierarchy } from '../../contexts/HierarchyContext';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import { listUsuariosDisponiveis } from '../../lib/api/orcamentosClient';
import type { PapelColaborador } from '../../components/orcamento/types';

interface WizardProps {
  onCancel: () => void;
  onCreated: () => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

const STEPS = ['Identificação', 'Fazendas', 'Colaboradores', 'Premissas', 'Revisão'] as const;

const SAFRAS = ['25/26', '26/27', '27/28'];

const PREMISSAS_PADRAO: { chave: string; label: string; valor: number; unidade: string; fonte: string }[] = [
  { chave: 'preco_arroba_boi_gordo', label: 'Preço da @ (boi gordo)', valor: 280, unidade: 'R$/@', fonte: 'manual' },
  { chave: 'preco_arroba_bezerro', label: 'Preço da @ (bezerro)', valor: 320, unidade: 'R$/@', fonte: 'manual' },
  { chave: 'preco_saca_soja', label: 'Preço da saca de soja', valor: 130, unidade: 'R$/sc 60kg', fonte: 'manual' },
  { chave: 'preco_saca_milho', label: 'Preço da saca de milho', valor: 60, unidade: 'R$/sc 60kg', fonte: 'manual' },
  { chave: 'dolar_projetado', label: 'Dólar projetado', valor: 5.2, unidade: 'R$/USD', fonte: 'manual' },
  { chave: 'ipca_projetado_anual', label: 'IPCA projetado anual', valor: 4.5, unidade: '% a.a.', fonte: 'manual' },
  { chave: 'taxa_juros_anual', label: 'Taxa de juros anual', valor: 12, unidade: '% a.a.', fonte: 'manual' },
  { chave: 'custo_medio_diesel', label: 'Custo médio do diesel', valor: 6.2, unidade: 'R$/L', fonte: 'manual' },
];

const FONTES = ['manual', 'cepea', 'b3', 'usda', 'bcb', 'ibge', 'anp'] as const;

/**
 * Funções no orçamento (3 checkboxes na UI). Combinação permitida: Editar + Aprovar.
 * Demais combinações entre Consultar e (Editar/Aprovar) são bloqueadas.
 */
type FuncoesColab = { editar: boolean; aprovar: boolean; consultar: boolean };

function funcoesParaApi(f: FuncoesColab): { papel: PapelColaborador; eAprovador: boolean } {
  // Editar (com ou sem Aprovar) → editor
  if (f.editar) return { papel: 'editor', eAprovador: f.aprovar };
  // Aprovar sem Editar → consultor + eAprovador
  if (f.aprovar) return { papel: 'consultor', eAprovador: true };
  // Consultar puro
  return { papel: 'consultor', eAprovador: false };
}

function funcoesValidas(f: FuncoesColab): boolean {
  if (!f.editar && !f.aprovar && !f.consultar) return false;
  if (f.consultar && (f.editar || f.aprovar)) return false;
  return true;
}

function defaultDateRange(safra: string): { inicio: string; fim: string } {
  // Safras agropecuárias: 1º de julho a 30 de junho do ano seguinte.
  const [a] = safra.split('/');
  const ano = 2000 + Number(a);
  return {
    inicio: `${ano}-07-01`,
    fim: `${ano + 1}-06-30`,
  };
}

export default function CadastroOrcamentoWizard({ onCancel, onCreated, onToast }: WizardProps) {
  const { selectedOrganization, selectedFarm, farms } = useHierarchy();
  const { criarOrcamento } = useOrcamento();

  const [step, setStep] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const [identificacao, setIdentificacao] = useState(() => {
    const safra = SAFRAS[1];
    const { inicio, fim } = defaultDateRange(safra);
    return { nome: '', safra, dataInicio: inicio, dataFim: fim, descricao: '' };
  });
  const [fazendasSelecionadas, setFazendasSelecionadas] = useState<string[]>(
    () => (selectedFarm ? [selectedFarm.id] : []),
  );
  const [usuariosDisponiveis, setUsuariosDisponiveis] = useState<
    { id: string; name: string | null; email: string; role: string }[]
  >([]);
  const [colaboradores, setColaboradores] = useState<{ userId: string; funcoes: FuncoesColab }[]>([]);
  const [premissas, setPremissas] = useState(PREMISSAS_PADRAO.map((p) => ({ ...p })));

  // Carrega usuários da org ao entrar na etapa 3.
  useEffect(() => {
    if (step !== 2) return;
    if (!selectedOrganization) return;
    const ac = new AbortController();
    listUsuariosDisponiveis(selectedOrganization.id, ac.signal).then((data) => {
      setUsuariosDisponiveis(data);
    });
    return () => ac.abort();
  }, [step, selectedOrganization]);

  // Atualiza datas ao mudar safra.
  useEffect(() => {
    const r = defaultDateRange(identificacao.safra);
    setIdentificacao((prev) => ({ ...prev, dataInicio: r.inicio, dataFim: r.fim }));
  }, [identificacao.safra]);

  const validations = useMemo(() => {
    const erros: string[] = [];
    if (step === 0) {
      if (!identificacao.nome.trim()) erros.push('Nome é obrigatório');
      if (!identificacao.dataInicio || !identificacao.dataFim) erros.push('Período é obrigatório');
    }
    if (step === 1 && fazendasSelecionadas.length === 0) {
      erros.push('Selecione ao menos uma fazenda');
    }
    if (step === 2) {
      const semFuncao = colaboradores.filter((c) => !funcoesValidas(c.funcoes));
      if (semFuncao.length > 0) {
        erros.push(`${semFuncao.length} colaborador(es) com função inválida`);
      }
    }
    return erros;
  }, [step, identificacao, fazendasSelecionadas, colaboradores]);

  const canAdvance = validations.length === 0;

  function handleNext() {
    if (!canAdvance) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleCancel() {
    if (window.confirm('Cancelar criação do orçamento? As informações preenchidas serão perdidas.')) {
      onCancel();
    }
  }

  async function handleSubmit() {
    if (!selectedOrganization) {
      onToast?.('Selecione uma organização antes de criar o orçamento.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await criarOrcamento({
      organizationId: selectedOrganization.id,
      nome: identificacao.nome.trim(),
      safra: identificacao.safra,
      dataInicio: identificacao.dataInicio,
      dataFim: identificacao.dataFim,
      descricao: identificacao.descricao.trim() || null,
      fazendas: fazendasSelecionadas,
      colaboradores: colaboradores.map((c) => {
        const { papel, eAprovador } = funcoesParaApi(c.funcoes);
        return { userId: c.userId, papel, eAprovador };
      }),
      premissasIniciais: premissas.map((p) => ({
        chave: p.chave,
        valor: Number(p.valor),
        unidade: p.unidade,
        fonte: p.fonte,
      })),
    });
    setSubmitting(false);
    if ('error' in result) {
      onToast?.(`Erro ao criar orçamento: ${result.error}`, 'error');
      return;
    }
    onToast?.('Orçamento criado em rascunho V1.0', 'success');
    onCreated();
  }

  const orgName = selectedOrganization?.name ?? '—';
  const fazendasLista = farms.filter((f) => fazendasSelecionadas.includes(f.id));

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header do wizard */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Novo Orçamento</h1>
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 focus:outline-none"
        >
          <XIcon size={14} />
          Cancelar
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center px-6 py-4 border-b border-slate-200 gap-2 overflow-x-auto shrink-0">
        {STEPS.map((label, idx) => {
          const done = idx < step;
          const active = idx === step;
          return (
            <React.Fragment key={label}>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={[
                    'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border',
                    done
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : active
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-white border-slate-300 text-slate-500',
                  ].join(' ')}
                >
                  {done ? <Check size={14} /> : idx + 1}
                </div>
                <span
                  className={[
                    'text-xs font-medium whitespace-nowrap',
                    active ? 'text-emerald-700' : done ? 'text-slate-700' : 'text-slate-500',
                  ].join(' ')}
                >
                  {label}
                </span>
              </div>
              {idx < STEPS.length - 1 && <div className="h-px bg-slate-300 flex-1 min-w-4" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto">
          {step === 0 && (
            <section className="space-y-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Etapa 1 — Identificação</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome do orçamento *</label>
                <input
                  type="text"
                  value={identificacao.nome}
                  onChange={(e) => setIdentificacao((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Safra 26/27 — Principal"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Safra *</label>
                  <select
                    value={identificacao.safra}
                    onChange={(e) => setIdentificacao((prev) => ({ ...prev, safra: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {SAFRAS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Início *</label>
                  <input
                    type="date"
                    value={identificacao.dataInicio}
                    onChange={(e) => setIdentificacao((prev) => ({ ...prev, dataInicio: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fim *</label>
                  <input
                    type="date"
                    value={identificacao.dataFim}
                    onChange={(e) => setIdentificacao((prev) => ({ ...prev, dataFim: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                <textarea
                  value={identificacao.descricao}
                  onChange={(e) => setIdentificacao((prev) => ({ ...prev, descricao: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Etapa 2 — Fazendas <span className="ml-2 text-slate-400">({orgName})</span>
              </p>
              {farms.length === 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
                  Nenhuma fazenda disponível para esta organização.
                </div>
              ) : (
                <ul className="space-y-2">
                  {farms.map((f) => {
                    const checked = fazendasSelecionadas.includes(f.id);
                    return (
                      <li key={f.id}>
                        <label
                          className={[
                            'flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                            checked ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:bg-slate-50',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFazendasSelecionadas((prev) => [...prev, f.id]);
                              } else {
                                setFazendasSelecionadas((prev) => prev.filter((id) => id !== f.id));
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800">{f.name}</div>
                            <div className="text-xs text-slate-500">
                              {f.city ?? '—'}{f.totalArea ? ` · ${f.totalArea} ha` : ''}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Etapa 3 — Colaboradores e funções</p>
              <p className="text-sm text-slate-600">
                Para cada colaborador, marque uma ou mais funções. <strong>Editar</strong> e <strong>Aprovar</strong> podem ser combinados;{' '}
                <strong>Consultar</strong> é exclusivo.
              </p>

              <div className="rounded-md border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Usuário</th>
                      <th className="text-center px-2 py-2 font-medium w-24">Editar</th>
                      <th className="text-center px-2 py-2 font-medium w-24">Aprovar</th>
                      <th className="text-center px-2 py-2 font-medium w-24">Consultar</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {colaboradores.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-sm text-slate-500 text-center">
                          Nenhum colaborador adicionado ainda.
                        </td>
                      </tr>
                    )}
                    {colaboradores.map((c, idx) => {
                      const u = usuariosDisponiveis.find((uu) => uu.id === c.userId);
                      const f = c.funcoes;
                      const consultarMarcado = f.consultar;
                      const editaOuAprovaMarcado = f.editar || f.aprovar;
                      const erro = !funcoesValidas(f);

                      const updateFuncoes = (patch: Partial<FuncoesColab>) => {
                        setColaboradores((prev) => {
                          const next = [...prev];
                          const merged = { ...next[idx].funcoes, ...patch };
                          // Regra: Consultar é exclusivo. Marcar Editar/Aprovar desmarca Consultar.
                          if (patch.consultar === true) {
                            merged.editar = false;
                            merged.aprovar = false;
                          } else if (patch.editar === true || patch.aprovar === true) {
                            merged.consultar = false;
                          }
                          next[idx] = { ...next[idx], funcoes: merged };
                          return next;
                        });
                      };

                      return (
                        <tr
                          key={c.userId}
                          className={`border-t border-slate-200 ${erro ? 'bg-red-50/50' : ''}`}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">{u?.name || '—'}</div>
                            <div className="text-xs text-slate-500">{u?.email}</div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={f.editar}
                              disabled={consultarMarcado}
                              onChange={(e) => updateFuncoes({ editar: e.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={f.aprovar}
                              disabled={consultarMarcado}
                              onChange={(e) => updateFuncoes({ aprovar: e.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={f.consultar}
                              disabled={editaOuAprovaMarcado}
                              onChange={(e) => updateFuncoes({ consultar: e.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setColaboradores((prev) => prev.filter((cc) => cc.userId !== c.userId));
                              }}
                              className="p-1 text-slate-500 hover:text-red-600 focus:outline-none"
                              title="Remover"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Adicionar usuário</p>
                <div className="flex flex-wrap gap-2">
                  {usuariosDisponiveis
                    .filter((u) => !colaboradores.some((c) => c.userId === u.id))
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() =>
                          setColaboradores((prev) => [
                            ...prev,
                            { userId: u.id, funcoes: { editar: false, aprovar: false, consultar: true } },
                          ])
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
                      >
                        <UserPlus size={12} />
                        {u.name || u.email}
                      </button>
                    ))}
                  {usuariosDisponiveis.length === colaboradores.length && usuariosDisponiveis.length > 0 && (
                    <span className="text-xs text-slate-500">
                      Todos os usuários disponíveis já foram adicionados.
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Etapa 4 — Premissas iniciais</p>
              <p className="text-sm text-slate-600">
                Os valores abaixo já vêm pré-preenchidos. Ajuste conforme a realidade da safra.
              </p>
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Premissa</th>
                      <th className="text-left px-3 py-2 font-medium w-32">Valor</th>
                      <th className="text-left px-3 py-2 font-medium w-28">Unidade</th>
                      <th className="text-left px-3 py-2 font-medium w-28">Fonte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {premissas.map((p, idx) => (
                      <tr key={p.chave} className="border-t border-slate-200">
                        <td className="px-3 py-2 text-slate-800">{p.label}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="any"
                            value={p.valor}
                            onChange={(e) => {
                              const v = e.target.valueAsNumber;
                              setPremissas((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], valor: Number.isFinite(v) ? v : 0 };
                                return next;
                              });
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-600">{p.unidade}</td>
                        <td className="px-3 py-2">
                          <select
                            value={p.fonte}
                            onChange={(e) => {
                              const fonte = e.target.value;
                              setPremissas((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], fonte };
                                return next;
                              });
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            {FONTES.map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Etapa 5 — Revisão</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-md border border-slate-200 p-4">
                  <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Identificação</h4>
                  <p className="text-sm font-medium text-slate-800">{identificacao.nome || '—'}</p>
                  <p className="text-xs text-slate-500">
                    Safra {identificacao.safra} · {identificacao.dataInicio} → {identificacao.dataFim}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Fazendas</h4>
                  <p className="text-sm text-slate-800">
                    {fazendasLista.length > 0
                      ? fazendasLista.map((f) => f.name).join(', ')
                      : '—'}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Colaboradores</h4>
                  <p className="text-sm text-slate-800">
                    {colaboradores.length} colaborador(es) ·{' '}
                    {colaboradores.filter((c) => c.funcoes.aprovar).length} aprovador(es)
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Premissas</h4>
                  <p className="text-sm text-slate-800">{premissas.length} premissas iniciais</p>
                </div>
              </div>

              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>Será criada a versão <strong>V1.0</strong> em <strong>Rascunho</strong>.</span>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Footer com erros + nav */}
      <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="text-xs text-red-600 min-w-0">
          {validations.length > 0 && validations.join(' · ')}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <ChevronLeft size={14} />
            Voltar
          </button>
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              Próximo
              <ChevronRight size={14} />
            </button>
          )}
          {step === STEPS.length - 1 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedOrganization}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <Check size={14} />
              {submitting ? 'Criando…' : 'Criar Orçamento'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
