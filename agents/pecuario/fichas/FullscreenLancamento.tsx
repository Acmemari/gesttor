import React, { useEffect } from 'react';

interface FullscreenLancamentoProps {
  /** ícone do título (mesmo da tela). */
  icon: React.ReactNode;
  title: string;
  /** canto direito do cabeçalho (ex.: toggle de abas). */
  headerRight?: React.ReactNode;
  /** linha compacta de dados básicos (Data · Proprietário · Fazenda · Retiro). */
  compactHeader?: React.ReactNode;
  /** fecha a tela cheia (também acionado por Esc). */
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Shell da tela cheia do painel de lançamento: cabeçalho fixo (título + abas +
 * linha compacta) e corpo rolável. Trava o scroll do fundo e fecha com Esc.
 * z-40 (abaixo dos modais z-50, que continuam aparecendo por cima).
 */
const FullscreenLancamento: React.FC<FullscreenLancamentoProps> = ({
  icon,
  title,
  headerRight,
  compactHeader,
  onClose,
  children,
}) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#f9fafb]">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-[#f9fafb]/95 px-6 py-3 backdrop-blur-sm md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {icon}
            <h1 className="text-lg font-black tracking-tight text-[#0F172A] md:text-xl">{title}</h1>
          </div>
          {headerRight}
        </div>
        {compactHeader ? <div className="mt-3 flex flex-wrap items-end gap-3">{compactHeader}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 md:px-8">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </div>
    </div>
  );
};

export default FullscreenLancamento;
