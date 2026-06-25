/**
 * Client HTTP da sugestão de destino do Geocadastro de Áreas (/api/areas-suggest-destino).
 *
 * Envia o catálogo "Tipos de Locais" da fazenda + as feições importadas (nome + tipo de
 * geometria) e recebe, para cada feição, o tipo do catálogo recomendado pela IA (Claude).
 * É a camada "se necessário": o frontend só chama isto para as feições que a heurística
 * local (nome/sinônimos) não resolveu. Lança em falha de rede/servidor — o chamador
 * deve tratar (cair no padrão por geometria).
 */
import { getAuthHeaders, clearToken } from '../session';

export interface SuggestCatIn {
  id: string;
  nome: string;
}
export interface SuggestTipoIn {
  id: string;
  categoriaId: string;
  nome: string;
}
export interface SuggestFeatIn {
  id: string;
  nome: string;
  /** tipo de geometria da origem. */
  geom: 'poligono' | 'ponto' | 'linha';
  /** tipo cru vindo da coluna "tipo" do KML, se houver. */
  tipoArquivo?: string | null;
}
export interface SuggestDestinoResult {
  id: string;
  /** categoria do catálogo (id) e tipo (nome exato) recomendados. */
  categoriaId: string;
  tipo: string;
}

/**
 * Pede à IA o destino (tipo do catálogo) de cada feição. Retorna só as feições que a
 * IA conseguiu classificar (as demais ficam de fora do array).
 */
export async function suggestDestinos(input: {
  categorias: SuggestCatIn[];
  tipos: SuggestTipoIn[];
  features: SuggestFeatIn[];
}): Promise<SuggestDestinoResult[]> {
  if (!input.features.length || !input.tipos.length) return [];
  const headers = await getAuthHeaders();
  const res = await fetch('/api/areas-suggest-destino', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      clearToken();
      window.location.replace('/sign-in');
    }
    throw new Error('Não autorizado');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return (json.data?.results ?? []) as SuggestDestinoResult[];
}
