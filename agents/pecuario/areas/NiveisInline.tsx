import React, { useMemo } from 'react';
import { MapPin, Check, ChevronRight, Loader2, Lock, Map } from 'lucide-react';
import { NIVEIS } from './types';
import type { NiveisCombo } from './NiveisSetup';

/* ===== Bloco compacto de níveis (rodapé de "Dados Gerais" da fazenda) =====
 * Versão enxuta do NiveisSetup: só os toggles "Personalizar níveis" + a prévia
 * "Estrutura escolhida" + o botão de salvar. A Fazenda é sempre a raiz (travada);
 * Retiro e Setor são intermediários opcionais; o Local é a folha onde os animais
 * "moram". Componente controlado — o estado/persistência ficam no pai.
 */

interface NiveisInlineProps {
  value: NiveisCombo;
  onChange: (combo: NiveisCombo) => void;
  onSave: () => void;
  /** Há alterações não salvas? (habilita o botão "Salvar estrutura") */
  dirty?: boolean;
  saving?: boolean;
  loading?: boolean;
  readOnly?: boolean;
}

const OPT_LEVELS: { key: keyof NiveisCombo; label: string; cor: string }[] = [
  { key: 'retiro', label: 'Retiro', cor: NIVEIS.retiro.cor },
  { key: 'setor', label: 'Setor', cor: NIVEIS.setor.cor },
  { key: 'local', label: 'Local', cor: NIVEIS.local.cor },
];

const NiveisInline: React.FC<NiveisInlineProps> = ({
  value,
  onChange,
  onSave,
  dirty = false,
  saving = false,
  loading = false,
  readOnly = false,
}) => {
  // Cadeia de níveis ativos, da raiz à folha, para o preview.
  const chain = useMemo(
    () =>
      [
        { nome: 'Fazenda', cor: NIVEIS.fazenda.cor },
        value.retiro && { nome: 'Retiro', cor: NIVEIS.retiro.cor },
        value.setor && { nome: 'Setor', cor: NIVEIS.setor.cor },
        value.local && { nome: 'Local', cor: NIVEIS.local.cor },
      ].filter(Boolean) as { nome: string; cor: string }[],
    [value],
  );

  const toggle = (key: keyof NiveisCombo) => {
    if (readOnly || saving || loading) return;
    onChange({ ...value, [key]: !value[key] });
  };

  // Controlar os locais com mapa (colunas + mapa) ou sem mapa (só colunas)?
  const comMapa = value.usarMapa !== false;
  const toggleMapa = () => {
    if (readOnly || saving || loading) return;
    onChange({ ...value, usarMapa: !comMapa });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {/* Personalizar */}
      <div className="flex items-center gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Personalizar níveis
        </div>
        {loading && <Loader2 size={13} className="animate-spin text-gray-300" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* Fazenda — sempre ativa */}
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: NIVEIS.fazenda.cor }} />
          <span className="text-[12.5px] font-semibold text-gray-700">Fazenda</span>
          <Lock size={11} className="text-gray-400" />
        </div>
        {OPT_LEVELS.map((lvl) => {
          const on = value[lvl.key];
          return (
            <button
              key={lvl.key}
              type="button"
              disabled={readOnly || saving || loading}
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

      {/* Controlar locais com mapa? */}
      <button
        type="button"
        role="switch"
        aria-checked={comMapa}
        disabled={readOnly || saving || loading}
        onClick={toggleMapa}
        title={comMapa ? 'Não usar mapa nos locais desta fazenda' : 'Usar mapa nos locais desta fazenda'}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-3 text-left transition-colors hover:border-gray-300 disabled:cursor-not-allowed"
      >
        <span className="flex items-start gap-2.5">
          <Map size={15} className="mt-0.5 shrink-0 text-gray-400" />
          <span>
            <span className="block text-[12.5px] font-semibold text-gray-700">Controlar locais com mapa</span>
            <span className="block text-[11.5px] text-gray-400">
              {comMapa
                ? 'A aba Locais mostra colunas + mapa para desenhar e importar áreas.'
                : 'A aba Locais mostra apenas as colunas (hectares digitados à mão).'}
            </span>
          </span>
        </span>
        <span
          className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
          style={{ background: comMapa ? NIVEIS.local.cor : '#d1d5db' }}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
              comMapa ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>

      {/* Preview da estrutura */}
      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
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

      {/* Ação */}
      <div className="mt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={readOnly || saving || loading || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Salvar estrutura
        </button>
      </div>
    </div>
  );
};

export default NiveisInline;
