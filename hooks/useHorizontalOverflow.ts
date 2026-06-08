import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Detecta overflow horizontal de um elemento rolável e informa se ainda dá para
 * rolar para a esquerda/direita. Útil para barras de abas em uma única linha que
 * precisam de setas de rolagem quando o conteúdo não cabe na largura disponível
 * (ex.: zoom alto, telas menores).
 *
 * @param deps Dependências extras que devem disparar um recálculo quando mudam
 *             (ex.: número de abas, badges) — além do ResizeObserver/resize.
 *
 * Uso:
 *   const { ref, canScrollLeft, canScrollRight, update, scrollByDir } =
 *     useHorizontalOverflow<HTMLDivElement>([abas.length]);
 *   <div ref={ref} onScroll={update} className="overflow-x-auto">…</div>
 */
export function useHorizontalOverflow<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState({ left: false, right: false });

  // Recalcula se há conteúdo escondido em cada direção (epsilon evita falso
  // positivo por arredondamento sub-pixel). Só atualiza o estado se algo mudou.
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setState((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);

  // Rola ~70% da largura visível na direção pedida (-1 = esquerda, 1 = direita).
  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    // ResizeObserver capta mudança de zoom/redimensionamento (altera o
    // clientWidth em px CSS); o listener de resize é um reforço.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, ...deps]);

  return { ref, canScrollLeft: state.left, canScrollRight: state.right, update, scrollByDir };
}
