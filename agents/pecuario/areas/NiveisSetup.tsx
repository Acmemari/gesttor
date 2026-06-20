import React, { useMemo, useState } from 'react';
import { Layers, MapPin, Check, ChevronRight, Loader2, Lock } from 'lucide-react';
import { NIVEIS } from './types';

/* ===== Cadastro da combinação de níveis da fazenda (gate da aba "Locais") =====
 * Antes de alocar locais no mapa, o usuário escolhe QUAL combinação de níveis a
 * fazenda usa: a Fazenda é sempre a raiz; Retiro e Setor são níveis intermediários
 * opcionais; o Local é a folha onde os animais/lotes "moram". A escolha vira a
 * config persistida (farm_location_levels.configured = true) e só então o mapa e as
 * colunas de cadastro são liberados.
 */

export interface NiveisCombo {
  retiro: boolean;
  setor: boolean;
  local: boolean;
  // Controlar os locais com mapa (colunas + mapa) ou sem mapa (só colunas)?
  // Opcional aqui (os presets de níveis não o definem); o cadastro de fazenda
  // sempre fornece um valor concreto ao editar a estrutura.
  usarMapa?: boolean;
}

interface NiveisSetupProps {
  farmName: string;
  initial?: NiveisCombo;
  readOnly?: boolean;
  saving?: boolean;
  /** Há uma combinação já configurada? (modo "reconfigurar") → permite cancelar. */
  reconfiguring?: boolean;
  onConfirm: (combo: NiveisCombo) => void;
  onCancel?: () => void;
}

interface Preset {
  key: string;
  combo: NiveisCombo;
  titulo: string;
  desc: string;
}

const PRESETS: Preset[] = [
  {
    key: 'faz-local',
    combo: { retiro: false, setor: false, local: true },
    titulo: 'Fazenda › Local',
    desc: 'Os locais (pastos, currais…) ficam direto na fazenda. Estrutura mais simples.',
  },
  {
    key: 'faz-retiro-local',
    combo: { retiro: true, setor: false, local: true },
    titulo: 'Fazenda › Retiro › Local',
    desc: 'Retiros agrupam os locais. Comum em fazendas divididas por retiros.',
  },
  {
    key: 'faz-setor-local',
    combo: { retiro: false, setor: true, local: true },
    titulo: 'Fazenda › Setor › Local',
    desc: 'Setores agrupam os locais, sem o nível de retiro.',
  },
  {
    key: 'faz-retiro-setor-local',
    combo: { retiro: true, setor: true, local: true },
    titulo: 'Fazenda › Retiro › Setor › Local',
    desc: 'Estrutura completa: retiros, setores dentro deles e locais nos setores.',
  },
];

const sameCombo = (a: NiveisCombo, b: NiveisCombo) =>
  a.retiro === b.retiro && a.setor === b.setor && a.local === b.local;

const OPT_LEVELS: { key: keyof NiveisCombo; label: string; plural: string; cor: string }[] = [
  { key: 'retiro', label: 'Retiro', plural: NIVEIS.retiro.plural, cor: NIVEIS.retiro.cor },
  { key: 'setor', label: 'Setor', plural: NIVEIS.setor.plural, cor: NIVEIS.setor.cor },
  { key: 'local', label: 'Local', plural: NIVEIS.local.plural, cor: NIVEIS.local.cor },
];

const NiveisSetup: React.FC<NiveisSetupProps> = ({
  farmName,
  initial,
  readOnly = false,
  saving = false,
  reconfiguring = false,
  onConfirm,
  onCancel,
}) => {
  const [combo, setCombo] = useState<NiveisCombo>(initial ?? { retiro: true, setor: false, local: true });

  const matchedPreset = useMemo(() => PRESETS.find((p) => sameCombo(p.combo, combo)) ?? null, [combo]);

  // Cadeia de níveis ativos, da raiz à folha, para o preview.
  const chain = useMemo(
    () =>
      [
        { nome: 'Fazenda', cor: NIVEIS.fazenda.cor },
        combo.retiro && { nome: 'Retiro', cor: NIVEIS.retiro.cor },
        combo.setor && { nome: 'Setor', cor: NIVEIS.setor.cor },
        combo.local && { nome: 'Local', cor: NIVEIS.local.cor },
      ].filter(Boolean) as { nome: string; cor: string }[],
    [combo],
  );

  const toggle = (key: keyof NiveisCombo) => {
    if (readOnly || saving) return;
    setCombo((c) => ({ ...c, [key]: !c[key] }));
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,.08)]">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-bold text-gray-900">
              {reconfiguring ? 'Alterar a estrutura de níveis' : 'Defina a estrutura de níveis da fazenda'}
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-gray-500">
              Antes de alocar os locais no mapa, escolha quais níveis a fazenda
              <span className="font-semibold text-gray-700"> {farmName || ''} </span>
              vai usar. A <b>Fazenda</b> é sempre a raiz e o <b>Local</b> é onde os animais ficam.
            </p>
          </div>
        </div>

        {/* Presets */}
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Combinações comuns
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {PRESETS.map((p) => {
              const active = matchedPreset?.key === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => setCombo(p.combo)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                    active
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className={`text-[13.5px] font-bold ${active ? 'text-emerald-700' : 'text-gray-800'}`}>
                      {p.titulo}
                    </span>
                    {active && <Check size={15} className="ml-auto text-emerald-600" />}
                  </div>
                  <span className="text-[11.5px] leading-snug text-gray-500">{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Personalizar */}
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Personalizar níveis
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Fazenda — sempre ativa */}
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: NIVEIS.fazenda.cor }} />
              <span className="text-[12.5px] font-semibold text-gray-700">Fazenda</span>
              <Lock size={11} className="text-gray-400" />
            </div>
            {OPT_LEVELS.map((lvl) => {
              const on = combo[lvl.key];
              return (
                <button
                  key={lvl.key}
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => toggle(lvl.key)}
                  className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors disabled:cursor-not-allowed ${
                    on ? 'border-gray-300 bg-white shadow-sm' : 'border-dashed border-gray-200 bg-gray-50/60'
                  } hover:border-gray-400`}
                  title={on ? `Não usar o nível ${lvl.label}` : `Usar o nível ${lvl.label}`}
                >
                  <span
                    className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
                    style={{ background: on ? lvl.cor : '#d1d5db' }}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                        on ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  <span className={`text-[12.5px] font-semibold ${on ? 'text-gray-800' : 'text-gray-400'}`}>
                    {lvl.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview da estrutura */}
        <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            <MapPin size={13} /> Estrutura escolhida
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {chain.map((c, i) => (
              <React.Fragment key={c.nome}>
                {i > 0 && <ChevronRight size={14} className="text-emerald-400" />}
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[12.5px] font-semibold text-gray-800 shadow-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.cor }} />
                  {c.nome}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Ações */}
        <div className="mt-6 flex items-center gap-2.5">
          <div className="flex-1" />
          {reconfiguring && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm(combo)}
            disabled={readOnly || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {reconfiguring ? 'Salvar estrutura' : 'Confirmar e alocar locais'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NiveisSetup;
