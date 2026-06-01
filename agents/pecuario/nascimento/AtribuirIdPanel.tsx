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

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/15';
const labelCls = 'text-[12.5px] font-semibold text-gray-700';

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

      {/* Formulário de entrada */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        <div className="w-[160px]">
          <label className={labelCls}>
            Categoria <span className="text-red-500">*</span>
          </label>
          <select className={`${inputCls} mt-1.5`} value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">Selecione</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[140px]">
          <label className={labelCls}>
            ID Usual <span className="text-red-500">*</span>
          </label>
          <input className={`${inputCls} mt-1.5`} placeholder="Apelido/ID" value={apelido} onChange={(e) => setApelido(e.target.value)} />
        </div>
        <div className="w-[130px]">
          <label className={labelCls}>ID Eletrônica</label>
          <input className={`${inputCls} mt-1.5`} placeholder="RFID" value={rfid} onChange={(e) => setRfid(e.target.value)} />
        </div>
        <div className="w-[120px]">
          <label className={labelCls}>Nº SISBOV</label>
          <input className={`${inputCls} mt-1.5`} placeholder="SISBOV" value={sisbov} onChange={(e) => setSisbov(e.target.value)} />
        </div>
        <div className="w-[90px]">
          <label className={labelCls}>Porte</label>
          <select className={`${inputCls} mt-1.5`} value={porte} onChange={(e) => setPorte(e.target.value)}>
            <option>P</option>
            <option>M</option>
            <option>G</option>
          </select>
        </div>
        <div className="w-[120px]">
          <label className={labelCls}>Peso</label>
          <div className={`${inputCls} mt-1.5 flex items-center gap-1.5`}>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-gray-800 outline-none"
              inputMode="decimal"
              placeholder="0,00"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
            />
            <span className="shrink-0 text-xs font-bold text-[#2563eb]">Kg</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4fd7]"
        >
          <Plus size={16} /> Adicionar
        </button>
      </div>

      {/* Tabela de fichas */}
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
            </tr>
          </thead>
          <tbody>
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
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-5 text-center text-gray-400">
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
