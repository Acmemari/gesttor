import React from 'react';

/**
 * Árvore genealógica (pedigree) da Ficha Animal. Lê-se da esquerda (ancestrais
 * mais distantes) para a direita (o Animal), no formato clássico de pedigree:
 *
 *   Avô Paterno ♂ ┐
 *                 ├── Pai ♀♂ ┐
 *   Avó Paterna ♀ ┘          │
 *                            ├── [ Animal ]
 *   Avô Materno ♂ ┐          │
 *                 ├── Mãe ♀ ─┘
 *   Avó Materna ♀ ┘
 *
 * O nó do Animal (sujeito) fica à DIREITA e é somente leitura — reflete o ID
 * Manejo/sexo da ficha. Os 6 ancestrais (Pai, Mãe e os 4 avós) são editáveis e
 * gravam nas chaves pai/mae/avoPaterno/avoPaterna/avoMaterno/avoMaterna.
 */

interface GenealogiaTreeProps {
  values: Record<string, string>;
  setValue: (id: string, v: string) => void;
}

const MALE = '#2563eb';
const FEMALE = '#db2777';

/** Cartão editável de um ancestral. */
const PedigreeNode: React.FC<{
  role: string;
  glyph: string;
  glyphColor: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ role, glyph, glyphColor, value, onChange }) => (
  <div className="w-[168px] shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-[#16a34a] focus-within:ring-[3px] focus-within:ring-[#16a34a]/15">
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{role}</span>
      <span className="text-sm font-bold leading-none" style={{ color: glyphColor }}>
        {glyph}
      </span>
    </div>
    <input
      className="w-full border-0 bg-transparent p-0 text-[13px] font-semibold text-gray-800 outline-none placeholder:font-normal placeholder:text-gray-300"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="ID / Nome"
    />
  </div>
);

/**
 * Conector que MESCLA dois cartões à esquerda (topo + base) num único à direita.
 * Os cartões ficam centrados em 1/4 e 3/4 da altura; a haste sai do centro (1/2).
 */
const Merge: React.FC = () => (
  <div className="relative w-6 shrink-0 self-stretch sm:w-8">
    {/* haste até o cartão mesclado (direita), no centro vertical */}
    <div className="absolute left-1/2 right-0 top-1/2 h-px bg-gray-300" />
    {/* barra vertical ligando os dois tiques */}
    <div className="absolute left-1/2 top-1/4 bottom-1/4 w-px bg-gray-300" />
    {/* tique do cartão superior */}
    <div className="absolute left-0 right-1/2 top-1/4 h-px bg-gray-300" />
    {/* tique do cartão inferior */}
    <div className="absolute left-0 right-1/2 bottom-1/4 h-px bg-gray-300" />
  </div>
);

interface NodeDef {
  role: string;
  key: string;
  glyph: string;
  color: string;
}

/** Uma linha de linhagem: dois avós (esquerda) mesclam num progenitor (direita). */
const Lineage: React.FC<{
  values: Record<string, string>;
  setValue: (id: string, v: string) => void;
  gpTop: NodeDef;
  gpBottom: NodeDef;
  parent: NodeDef;
}> = ({ values, setValue, gpTop, gpBottom, parent }) => (
  <div className="flex flex-1 items-stretch">
    {/* Avós empilhados (centros em 1/4 e 3/4 da altura da linhagem) */}
    <div className="flex flex-col">
      {[gpTop, gpBottom].map((g) => (
        <div key={g.key} className="flex flex-1 items-center py-2">
          <PedigreeNode
            role={g.role}
            glyph={g.glyph}
            glyphColor={g.color}
            value={values[g.key] ?? ''}
            onChange={(v) => setValue(g.key, v)}
          />
        </div>
      ))}
    </div>
    <Merge />
    {/* Progenitor (centrado) */}
    <div className="flex items-center">
      <PedigreeNode
        role={parent.role}
        glyph={parent.glyph}
        glyphColor={parent.color}
        value={values[parent.key] ?? ''}
        onChange={(v) => setValue(parent.key, v)}
      />
    </div>
  </div>
);

const GenealogiaTree: React.FC<GenealogiaTreeProps> = ({ values, setValue }) => {
  const subjectFemale = (values.sexo || '').toLowerCase().startsWith('f');
  const subjectGlyph = subjectFemale ? '♀' : '♂';
  const subjectColor = subjectFemale ? FEMALE : MALE;
  const apelido = (values.apelido || values.nome || '').trim();

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max items-stretch py-1">
        {/* Esquerda: linhagem paterna (topo) e materna (base), cada uma com 2 avós */}
        <div className="flex flex-col">
          <Lineage
            values={values}
            setValue={setValue}
            gpTop={{ role: 'Avô Paterno', key: 'avoPaterno', glyph: '♂', color: MALE }}
            gpBottom={{ role: 'Avó Paterna', key: 'avoPaterna', glyph: '♀', color: FEMALE }}
            parent={{ role: 'Pai', key: 'pai', glyph: '♂', color: MALE }}
          />
          <Lineage
            values={values}
            setValue={setValue}
            gpTop={{ role: 'Avô Materno', key: 'avoMaterno', glyph: '♂', color: MALE }}
            gpBottom={{ role: 'Avó Materna', key: 'avoMaterna', glyph: '♀', color: FEMALE }}
            parent={{ role: 'Mãe', key: 'mae', glyph: '♀', color: FEMALE }}
          />
        </div>

        {/* Mescla Pai/Mãe → Animal */}
        <Merge />

        {/* Direita: o Animal (sujeito), somente leitura */}
        <div className="flex items-center">
          <div className="w-[176px] shrink-0 rounded-xl border-2 border-[#16a34a] bg-[#e7f6ec] px-3 py-2.5 shadow-sm">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#16a34a]">
                Animal
              </span>
              <span className="text-sm font-bold leading-none" style={{ color: subjectColor }}>
                {subjectGlyph}
              </span>
            </div>
            <div className="truncate text-[15px] font-extrabold text-gray-800">
              {apelido || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenealogiaTree;
