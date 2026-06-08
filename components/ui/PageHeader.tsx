import React from 'react';

/**
 * Cabeçalho padrão do sistema Inttegra: título (com ícone) à esquerda e um slot
 * livre à direita — normalmente o controle de abas Lançamentos/Registros
 * (`TabSwitch`) ou um botão de ação.
 *
 * Padrão extraído de NascimentoView (título à esquerda / indicadores à direita).
 */
interface PageHeaderProps {
  /** Ícone à esquerda do título. Passe a cor/tamanho, ex.: <Dna size={22} className="text-[#16a34a]" /> */
  icon?: React.ReactNode;
  title: string;
  /** Conteúdo alinhado à direita (abas, badges ou ações). */
  right?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, right }) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2.5">
      {icon}
      <h1 className="text-lg font-black tracking-tight text-[#0F172A] md:text-xl">{title}</h1>
    </div>
    {right}
  </div>
);

export default PageHeader;
