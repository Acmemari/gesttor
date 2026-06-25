import React, { useMemo, useState } from 'react';
import { X, Info, Loader2, MapPin } from 'lucide-react';
import type { Lote } from '../../../lib/api/lotesClient';
import {
  TIPOS_LOCAL,
  FASES_REPRO,
  FINALIDADES,
  type LoteEventoTipo,
} from './types';
import { todayISO, localLabel } from './util';

/** Rascunho de evento a ser empilhado (o container adiciona org/lote e persiste). */
export interface EventoDraft {
  tipo: LoteEventoTipo;
  data: string;
  resp: string | null;
  dados: Record<string, any>;
  syncFichas?: boolean;
  /** Sobrepõe o lote em foco — usado pelo Manejo de lotes (movimentos lote→lote). */
  loteId?: string;
}

export const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
export const labelCls = 'mb-1 block text-[12.5px] font-semibold text-gray-700';
const reqMark = <span className="text-[#DC2626]">*</span>;

// ── Casca do modal ────────────────────────────────────────────────────────────

export const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  info?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
  /** Classe de largura máxima (sobrepõe `wide`). Ex.: 'max-w-5xl'. */
  maxWidthClass?: string;
}> = ({ title, subtitle, info, onClose, children, footer, wide, maxWidthClass }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
    <div
      className={`flex max-h-[90vh] w-full ${maxWidthClass ?? (wide ? 'max-w-2xl' : 'max-w-lg')} flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-[15px] font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {info && (
          <div className="flex gap-2 rounded-lg border border-[#b7e0c4] bg-[#f1faf4] px-3 py-2 text-[12px] leading-relaxed text-[#15803d]">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>{info}</span>
          </div>
        )}
        {children}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-[#fafbfc] px-5 py-3">{footer}</div>
    </div>
  </div>
);

const CancelBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
    Cancelar
  </button>
);

const SaveBtn: React.FC<{ onClick: () => void; saving?: boolean; label?: string; disabled?: boolean }> = ({ onClick, saving, label, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={saving || disabled}
    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#15803d] disabled:opacity-50"
  >
    {saving && <Loader2 size={15} className="animate-spin" />}
    {label || 'Lançar evento'}
  </button>
);

const DataResp: React.FC<{
  data: string; setData: (v: string) => void; resp: string; setResp: (v: string) => void;
}> = ({ data, setData, resp, setResp }) => (
  <div className="flex flex-col gap-4 sm:flex-row">
    <div className="sm:w-44">
      <label className={labelCls}>Data {reqMark}</label>
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
    </div>
    <div className="flex-1">
      <label className={labelCls}>Responsável</label>
      <input type="text" value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Quem lançou" className={inputCls} />
    </div>
  </div>
);

// ── 1) Transferir lote (Transferência) ───────────────────────────────────────

export const TransferirModal: React.FC<{
  lote: Lote;
  localOrigem: string;
  /** Locais cadastrados da fazenda do lote (alimenta o seletor de Destino). */
  locais?: { id: string; name: string; tipo?: string | null }[];
  onClose: () => void;
  onSubmit: (eventos: EventoDraft[]) => Promise<void>;
}> = ({ lote, localOrigem, locais = [], onClose, onSubmit }) => {
  const [tipoLocal, setTipoLocal] = useState(TIPOS_LOCAL[1]); // Pasto
  const [para, setPara] = useState('');
  const [data, setData] = useState(todayISO());
  const [resp, setResp] = useState('');
  const [saving, setSaving] = useState(false);

  // Locais cadastrados, ordenados por nome. Quando há lista, o Destino vira um
  // seletor; sem lista carregada (ex.: filtro "Todas" no header) cai p/ texto livre.
  const locaisOrdenados = useMemo(
    () => [...locais].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [locais],
  );
  const temLocais = locaisOrdenados.length > 0;

  // Ao escolher um local, herda o "Tipo de local" quando o tipo cadastrado casa
  // com a lista fixa (Retiro/Pasto/Setor/Confinamento/Curral); senão mantém o atual.
  const selecionarDestino = (nome: string) => {
    setPara(nome);
    const tipoCad = locaisOrdenados.find((l) => l.name === nome)?.tipo?.trim().toLowerCase();
    const match = tipoCad && TIPOS_LOCAL.find((t) => t.toLowerCase() === tipoCad);
    if (match) setTipoLocal(match);
  };

  const handleSave = async () => {
    if (!para.trim()) { window.alert('Informe o local de destino.'); return; }
    setSaving(true);
    try {
      await onSubmit([{ tipo: 'transferencia', data, resp: resp.trim() || null, dados: { de: localOrigem === '—' ? '' : localOrigem, para: para.trim(), tipoLocal } }]);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <ModalShell
      title="Movimentar lote"
      subtitle={`Lote ${lote.nome}${lote.codigo ? ` (${lote.codigo})` : ''} — Transferência de Lote`}
      info="O lote inteiro muda de local. Cada animal herda o novo local; o anterior fica preservado na linha do tempo."
      onClose={onClose}
      footer={<><CancelBtn onClick={onClose} /><SaveBtn onClick={handleSave} saving={saving} /></>}
    >
      <div>
        <label className={labelCls}>Origem (atual)</label>
        <input type="text" value={localLabel(localOrigem)} readOnly className={`${inputCls} bg-gray-50 text-gray-500`} />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-48">
          <label className={labelCls}>Tipo de local</label>
          <select value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value as any)} className={inputCls}>
            {TIPOS_LOCAL.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className={labelCls}>Destino {reqMark}</label>
          {temLocais ? (
            <select value={para} onChange={(e) => selecionarDestino(e.target.value)} className={inputCls}>
              <option value="">Selecione um local…</option>
              {locaisOrdenados.map((l) => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          ) : (
            <input type="text" value={para} onChange={(e) => setPara(e.target.value)} placeholder="Ex.: Pasto Cabeceira" className={inputCls} />
          )}
        </div>
      </div>
      <DataResp data={data} setData={setData} resp={resp} setResp={setResp} />
    </ModalShell>
  );
};

// ── 3) Mudar regime (Manejo) ──────────────────────────────────────────────────

export const MudarRegimeModal: React.FC<{
  lote: Lote;
  onClose: () => void;
  onSubmit: (eventos: EventoDraft[]) => Promise<void>;
}> = ({ lote, onClose, onSubmit }) => {
  const [dim, setDim] = useState<'nutricional' | 'reprodutivo'>('nutricional');
  const [plano, setPlano] = useState('');
  const [data, setData] = useState(todayISO());
  const [resp, setResp] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!plano.trim()) { window.alert('Descreva o plano.'); return; }
    setSaving(true);
    try {
      await onSubmit([{ tipo: 'manejo', data, resp: resp.trim() || null, dados: { dim, plano: plano.trim() } }]);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <ModalShell
      title="Mudar regime"
      subtitle={`Lote ${lote.nome}${lote.codigo ? ` (${lote.codigo})` : ''} — Evento de Manejo`}
      info="O plano anterior não é apagado — vira passado no histórico. Você lança um novo evento de manejo."
      onClose={onClose}
      footer={<><CancelBtn onClick={onClose} /><SaveBtn onClick={handleSave} saving={saving} /></>}
    >
      <div>
        <label className={labelCls}>Dimensão</label>
        <select value={dim} onChange={(e) => setDim(e.target.value as any)} className={inputCls}>
          <option value="nutricional">Nutricional</option>
          <option value="reprodutivo">Reprodutivo (protocolo)</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Plano {reqMark}</label>
        <input type="text" value={plano} onChange={(e) => setPlano(e.target.value)} placeholder="Ex.: Terminação — alto grão 88% NDT" className={inputCls} />
      </div>
      <DataResp data={data} setData={setData} resp={resp} setResp={setResp} />
    </ModalShell>
  );
};

// ── 4) Registrar evento reprodutivo (Repro — só Cria) ─────────────────────────

export const RegistrarReproModal: React.FC<{
  lote: Lote;
  onClose: () => void;
  onSubmit: (eventos: EventoDraft[]) => Promise<void>;
}> = ({ lote, onClose, onSubmit }) => {
  const [fase, setFase] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [data, setData] = useState(todayISO());
  const [resp, setResp] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!fase) { window.alert('Escolha a fase.'); return; }
    setSaving(true);
    try {
      await onSubmit([{ tipo: 'repro', data, resp: resp.trim() || null, dados: { fase, detalhe: detalhe.trim() } }]);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <ModalShell
      title="Registrar evento reprodutivo"
      subtitle={`Lote ${lote.nome}${lote.codigo ? ` (${lote.codigo})` : ''} — Evento Reprodutivo`}
      info="O estado reprodutivo é a última fase lançada. Cada registro empilha na linha do tempo."
      onClose={onClose}
      footer={<><CancelBtn onClick={onClose} /><SaveBtn onClick={handleSave} saving={saving} /></>}
    >
      <div>
        <label className={labelCls}>Fase {reqMark}</label>
        <select value={fase} onChange={(e) => setFase(e.target.value)} className={inputCls}>
          <option value="">Selecione…</option>
          {FASES_REPRO.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Detalhe</label>
        <input type="text" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Ex.: 112 prenhes (80%) · 28 vazias" className={inputCls} />
      </div>
      <DataResp data={data} setData={setData} resp={resp} setResp={setResp} />
    </ModalShell>
  );
};

// ── 5) Novo lote / Editar lote (atributos — não mexem em histórico) ───────────

export const LoteFormModal: React.FC<{
  modo: 'novo' | 'editar';
  inicial?: Partial<Lote>;
  /** Fazenda › Retiro em que o lote será criado (modo "novo"), herdado do header. */
  contexto?: string;
  /** Locais cadastrados da fazenda (alimenta o "Local inicial" no modo "novo"). */
  locais?: { id: string; name: string; tipo?: string | null }[];
  onClose: () => void;
  onSubmit: (data: { codigo: string | null; nome: string; finalidade: string | null; dataInicio: string; descricao: string | null; localInicial: string | null }) => Promise<void>;
}> = ({ modo, inicial, contexto, locais = [], onClose, onSubmit }) => {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? '');
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [finalidade, setFinalidade] = useState(inicial?.finalidade ?? '');
  const [dataInicio, setDataInicio] = useState(inicial?.dataInicio ?? todayISO());
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [localInicial, setLocalInicial] = useState('');
  const [saving, setSaving] = useState(false);

  const locaisOrdenados = useMemo(
    () => [...locais].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [locais],
  );

  const handleSave = async () => {
    if (!nome.trim()) { window.alert('Informe o nome do lote.'); return; }
    if (!codigo.trim()) { window.alert('Informe o código do lote.'); return; }
    if (!finalidade) { window.alert('Escolha a finalidade.'); return; }
    setSaving(true);
    try {
      await onSubmit({
        codigo: codigo.trim() || null,
        nome: nome.trim(),
        finalidade: finalidade || null,
        dataInicio,
        descricao: descricao.trim() || null,
        localInicial: localInicial.trim() || null,
      });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <ModalShell
      title={modo === 'novo' ? 'Novo lote' : 'Editar lote'}
      subtitle="A finalidade é a identidade do lote — não muda enquanto ele viver."
      onClose={onClose}
      footer={<><CancelBtn onClick={onClose} /><SaveBtn onClick={handleSave} saving={saving} label="Salvar" /></>}
    >
      {modo === 'novo' && contexto && (
        <div className="-mt-1 flex items-center gap-1.5 rounded-lg bg-[#f0fdf4] px-3 py-2 text-[12.5px] font-semibold text-[#16a34a]">
          <MapPin size={14} /> {contexto}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-40">
          <label className={labelCls}>Código {reqMark}</label>
          <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="RC-01" className={`${inputCls} font-mono`} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Nome {reqMark}</label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Recria Machos 24" className={inputCls} />
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className={labelCls}>Finalidade {reqMark}</label>
          <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)} className={inputCls} disabled={modo === 'editar'}>
            <option value="">Selecione…</option>
            {FINALIDADES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="sm:w-48">
          <label className={labelCls}>Data de abertura {reqMark}</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={inputCls} disabled={modo === 'editar'} />
        </div>
      </div>
      {modo === 'novo' && (
        <div>
          <label className={labelCls}>Local inicial</label>
          {locaisOrdenados.length > 0 ? (
            <select value={localInicial} onChange={(e) => setLocalInicial(e.target.value)} className={inputCls}>
              <option value="">Sem local definido</option>
              {locaisOrdenados.map((l) => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          ) : (
            <input type="text" value={localInicial} onChange={(e) => setLocalInicial(e.target.value)} placeholder="Ex.: Pasto Cabeceira (opcional)" className={inputCls} />
          )}
          <p className="mt-1 text-[11.5px] text-gray-500">Onde o lote começa. Vira a origem da primeira movimentação.</p>
        </div>
      )}
      <div>
        <label className={labelCls}>Observações</label>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="opcional" className={`${inputCls.replace('h-10', '')} py-2 resize-none`} />
      </div>
    </ModalShell>
  );
};

// ── 6) Confirmar encerramento ─────────────────────────────────────────────────

export const EncerrarModal: React.FC<{
  lote: Lote;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}> = ({ lote, onClose, onConfirm }) => {
  const [saving, setSaving] = useState(false);
  const handle = async () => { setSaving(true); try { await onConfirm(); onClose(); } finally { setSaving(false); } };
  return (
    <ModalShell
      title="Encerrar lote"
      subtitle={`Lote ${lote.nome}${lote.codigo ? ` (${lote.codigo})` : ''}`}
      info="Encerrar NÃO deleta. O lote sai das ações operacionais, mas segue consultável e na lista (esmaecido)."
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <button type="button" onClick={handle} disabled={saving} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#DC2626] px-4 text-sm font-bold text-white hover:bg-[#b91c1c] disabled:opacity-50">
            {saving && <Loader2 size={15} className="animate-spin" />}
            Encerrar lote
          </button>
        </>
      }
    >
      <p className="text-[13.5px] text-gray-700">Confirma o encerramento de <strong>{lote.nome}</strong>? Os eventos e a biografia continuam disponíveis para consulta.</p>
    </ModalShell>
  );
};
