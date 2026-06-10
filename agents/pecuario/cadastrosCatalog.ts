import type { CadastroRef } from '../../hooks/useCadastroFavorites';

/**
 * Catálogo de cadastros da Pecuária exibido em "Ver todos os cadastros".
 * Os ids DEVEM bater com CADASTRO_SUBVIEWS (InttegraDashboard) e com os
 * cards de PecuarioCadastrosDesktop.
 */
export const PECUARIO_CADASTROS: CadastroRef[] = [
  { id: 'estoque-partida', label: 'Estoque de Partida' },
  { id: 'ficha-animal', label: 'Ficha Animal' },
  { id: 'mapao', label: 'Mapa Rebanho - Mapão' },
  { id: 'animal-categories', label: 'Categoria Animal' },
  { id: 'animal-breeds', label: 'Raças' },
  { id: 'padrao-racial', label: 'Padrão Racial e Grau de Sangue' },
  { id: 'pelagens', label: 'Pelagens' },
  { id: 'reprodutores', label: 'Sêmen e Embriões' },
  { id: 'motivos-morte', label: 'Motivos de Morte' },
  { id: 'tipos-chifre', label: 'Tipo de Chifre - Aspas' },
  { id: 'lotes', label: 'Cadastro de Lotes' },
  { id: 'people', label: 'Cadastro de Pessoas' },
];
