/* ===== Movimentação de Áreas — selectors puros da linha do tempo ===== */
import type { AreaMovimentoRow } from './types';

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
export function formatDataBR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export interface MovimentoDescrito {
  titulo: string;
  detalhe: string | null;
}

/** Descreve um movimento em pt-BR para exibição na linha do tempo. */
export function descreverMovimento(m: AreaMovimentoRow): MovimentoDescrito {
  const nome = (s: any) => s?.name ?? '—';
  switch (m.tipo) {
    case 'abertura':
      return { titulo: 'Abertura (cadastro inicial)', detalhe: m.depois?.name ? `“${m.depois.name}”` : null };
    case 'renomear':
      return { titulo: 'Renomeado', detalhe: `de “${nome(m.antes)}” para “${nome(m.depois)}”` };
    case 'remodelar': {
      const a1 = m.antes?.area, a2 = m.depois?.area;
      return { titulo: 'Forma ajustada', detalhe: (a1 || a2) ? `${a1 ?? '—'} ha → ${a2 ?? '—'} ha` : null };
    }
    case 'mover':
      return { titulo: 'Movido de retiro/setor', detalhe: null };
    case 'aposentar':
      return { titulo: 'Aposentado', detalhe: m.dados?.motivo ? String(m.dados.motivo) : null };
    case 'reativar':
      return { titulo: 'Reativado', detalhe: null };
    case 'dividir': {
      const filhos = Array.isArray(m.dados?.filhos) ? m.dados.filhos.map((f: any) => f.name).join(', ') : '';
      return { titulo: 'Dividido', detalhe: filhos ? `em ${filhos}` : null };
    }
    case 'criado_divisao':
      return { titulo: 'Criado por divisão', detalhe: m.dados?.divididoDeName ? `de “${m.dados.divididoDeName}”` : null };
    case 'unir': {
      const origens = Array.isArray(m.dados?.origens) ? m.dados.origens.map((o: any) => o.name).join(', ') : '';
      return { titulo: 'Unido (área de destino)', detalhe: origens ? `de ${origens}` : null };
    }
    case 'unido':
      return { titulo: 'Unido em outra área', detalhe: m.dados?.unidoEmName ? `→ “${m.dados.unidoEmName}”` : null };
    case 'nivel': {
      const para = m.dados?.para;
      const ativos = para ? (['retiro', 'setor', 'local'] as const).filter((k) => para[k]).join(', ') : '';
      return { titulo: 'Níveis de localização', detalhe: ativos ? `ativos: ${ativos}` : null };
    }
    case 'correcao':
      return { titulo: 'Correção de cadastro', detalhe: null };
    default:
      return { titulo: m.tipo, detalhe: null };
  }
}
