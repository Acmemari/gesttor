import React, { useState } from 'react';
import { X, Plus, IdCard } from 'lucide-react';
import { formatDateBR, parseWeight } from './util';
import type { AtribFicha, LookupItem, MovimentoNasc } from './types';

interface AtribuirIdPanelProps {
  movimento: MovimentoNasc;
  categories: LookupItem[];
  onAdd: (movId: string, ficha: Omit<AtribFicha, 'id'>) => void;
  onClose: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const cellInputCls =
  'w-full h-9 rounded-md border border-gray-200 bg-white px-2 text-[12.5px] text-gray-800 focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15';

const AtribuirIdPanel: React.FC<AtribuirIdPanelProps> = ({ movimento, categories, onAdd, onClose, onToast }) => {
  const catName = (id: string) => categories.find((c) => c.id === id)?.nome || '—';
  const declCatDefault = movimento.catDecl[0]?.catId || categories[0]?.id || '';

  const [catId, setCatId] = useState(declCatDefault);
  const [apelido, setApelido] = useState('');
  const [rfid, setRfid] = useState('');
  const [sisbov, setSisbov] = useState('');
  const [porte, setPorte] = useState('M');
  const [peso, setPeso] = useState('');

  const restantes = movimento.naoIdentificados;
  const detalhados = movimento.fichas.length;

  const tally: Record<string, number> = {};
  for (const f of movimento.fichas) tally[f.catId] = (tally[f.catId] || 0) + 1;

  const handleAdd = () => {
    if (!apelido.trim()) {
      onToast?.('Informe o Apelido/ID Usual', 'error');
      return;
    }
    if (!catId) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    if (restantes <= 0) {
      onToast?.('Lançamento já totalmente identificado', 'warning');
      return;
    }
    onAdd(movimento.id, {
      apelido: apelido.trim(),
      catId,
      rfid: rfid.trim() || undefined,
      sisbov: sisbov.trim() || undefined,
      porte,
      peso: parseWeight(peso) || undefined,
    });
    setApelido('');
    setRfid('');
    setSisbov('');
    setPeso('');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3.5">
        <h3 className="text-[15px] font-bold text-gray-900">Atribuição de ID</h3>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              restantes > 0 ? 'bg-[#fdeee3] text-[#ea580c]' : 'bg-[#e7f6ec] text-[#16a34a]'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${restantes > 0 ? 'bg-[#ea580c]' : 'bg-[#16a34a]'}`} />
            {detalhados} de {movimento.qtd} detalhados
          </span>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50">
            <X size={14} /> Fechar
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-[#fafbfc] px-4 py-3 text-[12.5px] text-gray-500">
        <IdCard size={15} className="mt-0.5 shrink-0 text-[#2563eb]" />
        <span>
          Individualizando o nascimento de <b className="text-gray-700">{formatDateBR(movimento.data)}</b> — total{' '}
          <b className="text-gray-700">{movimento.qtd} cab.</b> (a quantidade é a base de conciliação). A categoria de cada
          bezerro é definida aqui, no detalhamento.
        </span>
      </div>

      {/* Resumo por categoria */}
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {Object.keys(tally).map((cid) => (
          <span key={cid} className="inline-flex items-center rounded-full bg-[#e7f6ec] px-2.5 py-1 text-[12px] font-semibold text-[#16a34a]">
            {catName(cid)}: {tally[cid]}
          </span>
        ))}
        {restantes > 0 ? (
          <span className="inline-flex items-center rounded-full bg-[#eef0f2] px-2.5 py-1 text-[12px] font-semibold text-gray-500">
            {restantes} a detalhar
          </span>
        ) : null}
      </div>

      {/* Tabela de fichas — a inclusão acontece na linha do topo */}
      <div className="border-t border-gray-100">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#fcfcfd] text-[10.5px] uppercase tracking-wide text-gray-500">
              <th className="p-2.5 font-bold">ID interno</th>
              <th className="p-2.5 font-bold">Apelido / ID</th>
              <th className="p-2.5 font-bold">Categoria</th>
              <th className="p-2.5 font-bold">ID Eletrônica</th>
              <th className="p-2.5 font-bold">SISBOV</th>
              <th className="p-2.5 text-right font-bold">Peso</th>
              <th className="p-2.5 font-bold">Porte</th>
              <th className="p-2.5" />
            </tr>
          </thead>
          <tbody>
            {/* Linha de inclusão */}
            <tr className="border-t border-gray-100 bg-[#f7faff] align-middle">
              <td className="p-2 text-center">
                <Plus size={15} className="mx-auto text-[#2563eb]" />
              </td>
              <td className="p-2">
                <input
                  className={cellInputCls}
                  placeholder="Apelido/ID *"
                  value={apelido}
                  onChange={(e) => setApelido(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                />
              </td>
              <td className="p-2">
                <select className={cellInputCls} value={catId} onChange={(e) => setCatId(e.target.value)}>
                  <option value="">Selecione</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <input
                  className={cellInputCls}
                  placeholder="RFID"
                  value={rfid}
                  onChange={(e) => setRfid(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                />
              </td>
              <td className="p-2">
                <input
                  className={cellInputCls}
                  placeholder="SISBOV"
                  value={sisbov}
                  onChange={(e) => setSisbov(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                />
              </td>
              <td className="p-2">
                <div className={`${cellInputCls} flex items-center gap-1`}>
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-right text-[12.5px] font-semibold text-gray-800 outline-none"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  />
                  <span className="shrink-0 text-[11px] font-bold text-[#2563eb]">Kg</span>
                </div>
              </td>
              <td className="p-2">
                <select className={cellInputCls} value={porte} onChange={(e) => setPorte(e.target.value)}>
                  <option>P</option>
                  <option>M</option>
                  <option>G</option>
                </select>
              </td>
              <td className="p-2 text-right">
                <button
                  type="button"
                  onClick={handleAdd}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-[#1d4fd7]"
                >
                  <Plus size={14} /> Adicionar
                </button>
              </td>
            </tr>

            {movimento.fichas.length ? (
              movimento.fichas.map((f) => (
                <tr key={f.id} className="border-t border-gray-100">
                  <td className="p-2.5 font-mono font-semibold text-[#2563eb]">A-{String(f.id).padStart(4, '0')}</td>
                  <td className="p-2.5 font-semibold text-gray-800">{f.apelido}</td>
                  <td className="p-2.5 text-gray-700">{catName(f.catId)}</td>
                  <td className="p-2.5 font-mono text-[11px] text-gray-500">{f.rfid || '—'}</td>
                  <td className="p-2.5 font-mono text-[11px] text-gray-500">{f.sisbov || '—'}</td>
                  <td className="p-2.5 text-right tabular-nums text-gray-700">{f.peso ? `${f.peso} kg` : '—'}</td>
                  <td className="p-2.5 text-gray-600">{f.porte || '—'}</td>
                  <td className="p-2.5" />
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-5 text-center text-gray-400">
                  Nenhum bezerro individualizado neste lançamento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AtribuirIdPanel;
