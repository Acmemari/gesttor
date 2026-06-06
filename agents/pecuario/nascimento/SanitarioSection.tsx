import React, { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { MEDICAMENTOS, PROTOCOLOS, TIPO_DOSE } from './fieldRegistry';
import { custoSanitario, fmtMoeda, parseWeight } from './util';
import type { SanItem } from './types';

interface SanitarioSectionProps {
  items: SanItem[];
  onItemsChange: (items: SanItem[]) => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const labelCls = 'text-[12.5px] font-semibold text-gray-700';

let SAN_SEQ = 1;

const SanitarioSection: React.FC<SanitarioSectionProps> = ({ items, onItemsChange, onToast }) => {
  const [aplic, setAplic] = useState<'unica' | 'protocolo'>('unica');
  const [protocolo, setProtocolo] = useState('');
  const [medId, setMedId] = useState('');
  const [tipoDose, setTipoDose] = useState('');
  const [dose, setDose] = useState('');
  const [porKg, setPorKg] = useState('');

  const med = MEDICAMENTOS.find((m) => m.id === medId);
  const total = custoSanitario(items);

  const resetForm = () => {
    setMedId('');
    setTipoDose('');
    setDose('');
    setPorKg('');
  };

  const handleAdd = () => {
    if (!med) {
      onToast?.('Selecione a vacina/medicamento', 'error');
      return;
    }
    const d = parseWeight(dose);
    if (d <= 0) {
      onToast?.('Informe a dose', 'error');
      return;
    }
    const item: SanItem = {
      id: SAN_SEQ++,
      medId: med.id,
      nome: med.nome,
      unidade: med.unidade,
      tipoDose,
      dose: d,
      porKg: parseWeight(porKg),
      custo: +(med.custoUnit * d).toFixed(2),
    };
    onItemsChange([...items, item]);
    resetForm();
    onToast?.(`Aplicação adicionada · ${med.nome}`, 'success');
  };

  const handleEdit = (id: number) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    onItemsChange(items.filter((i) => i.id !== id));
    setMedId(it.medId);
    setTipoDose(it.tipoDose);
    setDose(String(it.dose).replace('.', ','));
    setPorKg(it.porKg ? String(it.porKg).replace('.', ',') : '');
  };

  const handleRemove = (id: number) => onItemsChange(items.filter((i) => i.id !== id));

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="max-w-[380px]">
        <label className={labelCls}>Tipo de Aplicação</label>
        <div className="mt-2 flex flex-wrap items-center gap-5">
          {(['unica', 'protocolo'] as const).map((v) => (
            <label key={v} className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-gray-800">
              <input
                type="radio"
                name="san-aplic"
                checked={aplic === v}
                onChange={() => setAplic(v)}
                className="h-4 w-4 accent-[#16a34a]"
              />
              {v === 'unica' ? 'Aplicação Única' : 'Protocolo'}
            </label>
          ))}
        </div>
      </div>

      <div className="max-w-[520px]">
        <label className={labelCls}>Protocolo Sanitário</label>
        <select
          className={`${inputCls} mt-1.5 disabled:bg-gray-100 disabled:text-gray-400`}
          disabled={aplic === 'unica'}
          value={protocolo}
          onChange={(e) => setProtocolo(e.target.value)}
        >
          <option value="">Selecione um item</option>
          {PROTOCOLOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[230px] flex-1">
          <label className={labelCls}>Vacina/Medicamento</label>
          <select className={`${inputCls} mt-1.5`} value={medId} onChange={(e) => setMedId(e.target.value)}>
            <option value="">Selecione um item</option>
            {MEDICAMENTOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[130px]">
          <label className={labelCls}>Unidade de Medida</label>
          <input className={`${inputCls} mt-1.5 bg-gray-100 text-gray-400`} disabled value={med?.unidade || ''} placeholder="—" />
        </div>
        <div className="w-[130px]">
          <label className={labelCls}>Tipo de Dose</label>
          <select className={`${inputCls} mt-1.5`} value={tipoDose} onChange={(e) => setTipoDose(e.target.value)}>
            <option value="">Selecione</option>
            {TIPO_DOSE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[110px]">
          <label className={labelCls}>
            Dose <span className="text-red-500">*</span>
          </label>
          <input
            className={`${inputCls} mt-1.5`}
            inputMode="decimal"
            placeholder="0,00"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />
        </div>
        <div className="w-[150px]">
          <label className={labelCls}>Por Cada (X) Kg</label>
          <div className={`${inputCls} mt-1.5 flex items-center gap-1.5`}>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-gray-800 outline-none"
              inputMode="decimal"
              placeholder="0,00"
              value={porKg}
              onChange={(e) => setPorKg(e.target.value)}
            />
            <span className="shrink-0 text-xs font-bold text-[#16a34a]">Kg</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
        >
          <Plus size={16} /> Adicionar
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-[#fcfcfd] text-[11px] uppercase tracking-wide text-gray-500">
              <th className="p-2.5 font-bold">Vacina/Medicamento</th>
              <th className="p-2.5 font-bold">Tipo de Dose</th>
              <th className="p-2.5 text-right font-bold">Qtde/Por Cada (X) Kg</th>
              <th className="p-2.5 text-right font-bold">Dose</th>
              <th className="p-2.5 font-bold">Unidade</th>
              <th className="p-2.5 text-right font-bold">Custo da Aplicação</th>
              <th className="p-2.5 font-bold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((it) => (
                <tr key={it.id} className="border-t border-gray-100">
                  <td className="p-2.5 font-semibold text-gray-800">{it.nome}</td>
                  <td className="p-2.5 text-gray-600">{it.tipoDose || '—'}</td>
                  <td className="p-2.5 text-right tabular-nums text-gray-600">{it.porKg ? `${it.porKg} Kg` : '—'}</td>
                  <td className="p-2.5 text-right tabular-nums text-gray-700">{fmtMoeda(it.dose)}</td>
                  <td className="p-2.5 text-gray-600">{it.unidade}</td>
                  <td className="p-2.5 text-right tabular-nums text-gray-700">R$ {fmtMoeda(it.custo)}</td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => handleEdit(it.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleRemove(it.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-5 text-center text-sm text-gray-400">
                  Nenhuma aplicação adicionada.
                </td>
              </tr>
            )}
          </tbody>
          {items.length ? (
            <tfoot>
              <tr className="border-t border-gray-200 bg-[#fcfcfd]">
                <td colSpan={5} className="p-2.5 font-semibold text-gray-700">
                  Custo total da aplicação
                </td>
                <td className="p-2.5 text-right font-bold tabular-nums text-[#16a34a]">R$ {fmtMoeda(total)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
};

export default SanitarioSection;
