import { useSyncExternalStore, useCallback } from 'react';

/**
 * Store compartilhado de favoritos/recentes dos cards de Cadastro do ambiente
 * Inttegra.
 *
 * O botão de favoritar fica em `PecuarioCadastrosDesktop`, mas a lista de
 * favoritos também é exibida na `InttegraSidebar` — dois componentes irmãos,
 * sem pai comum próximo. Em vez de subir esse estado até o `App`, usamos um
 * pequeno store externo (padrão `useSyncExternalStore`) persistido em
 * localStorage e sincronizado entre abas.
 *
 * A navegação para um cadastro específico a partir da sidebar é feita por um
 * evento (`openCadastro`/`onOpenCadastro`), consumido pelo `InttegraDashboard`.
 */

export interface CadastroRef {
  id: string;
  label: string;
}

const FAV_KEY = 'inttegra:cadastro-favoritos';
const RECENT_KEY = 'inttegra:cadastro-recentes';
const RECENT_LIMIT = 6;
const OPEN_EVENT = 'inttegra:open-cadastro';
const OPEN_TAB_EVENT = 'inttegra:open-cadastros-tab';

/** Abas da tela de cadastros (espelha `CadastroTab` em PecuarioCadastrosDesktop). */
export type CadastrosTab = 'favoritos' | 'recentes' | 'todos';

interface FavoritesState {
  favorites: CadastroRef[];
  recents: CadastroRef[];
}

const hasWindow = typeof window !== 'undefined';

function read(key: string): CadastroRef[] {
  if (!hasWindow) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (x): x is CadastroRef =>
            !!x && typeof x.id === 'string' && typeof x.label === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function load(): FavoritesState {
  return { favorites: read(FAV_KEY), recents: read(RECENT_KEY) };
}

let state: FavoritesState = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function setState(next: FavoritesState) {
  state = next;
  if (hasWindow) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites));
      localStorage.setItem(RECENT_KEY, JSON.stringify(state.recents));
    } catch {
      /* quota cheia ou modo privado — mantém apenas em memória */
    }
  }
  emit();
}

// Mantém o store sincronizado quando outra aba altera os favoritos.
if (hasWindow) {
  window.addEventListener('storage', e => {
    if (e.key === FAV_KEY || e.key === RECENT_KEY) {
      state = load();
      emit();
    }
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): FavoritesState {
  return state;
}

/** Adiciona ou remove um cadastro dos favoritos. */
export function toggleFavorite(card: CadastroRef) {
  const exists = state.favorites.some(f => f.id === card.id);
  const favorites = exists
    ? state.favorites.filter(f => f.id !== card.id)
    : [...state.favorites, { id: card.id, label: card.label }];
  setState({ ...state, favorites });
}

/** Registra um cadastro como aberto recentemente (mais recente primeiro). */
export function recordRecent(card: CadastroRef) {
  const recents = [
    { id: card.id, label: card.label },
    ...state.recents.filter(r => r.id !== card.id),
  ].slice(0, RECENT_LIMIT);
  setState({ ...state, recents });
}

/** Dispara a navegação para um cadastro específico (consumido pelo dashboard). */
export function openCadastro(id: string) {
  if (!hasWindow) return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
}

/** Inscreve um handler para pedidos de abertura de cadastro. Retorna o cleanup. */
export function onOpenCadastro(handler: (id: string) => void): () => void {
  if (!hasWindow) return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

/** Pede para a tela de cadastros abrir em uma aba específica (ex.: "todos"). */
export function openCadastrosTab(tab: CadastrosTab) {
  if (!hasWindow) return;
  window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: tab }));
}

/** Inscreve um handler para pedidos de troca de aba. Retorna o cleanup. */
export function onOpenCadastrosTab(handler: (tab: CadastrosTab) => void): () => void {
  if (!hasWindow) return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<CadastrosTab>).detail);
  window.addEventListener(OPEN_TAB_EVENT, listener);
  return () => window.removeEventListener(OPEN_TAB_EVENT, listener);
}

export function useCadastroFavorites() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isFavorite = useCallback(
    (id: string) => snapshot.favorites.some(f => f.id === id),
    [snapshot],
  );

  return {
    favorites: snapshot.favorites,
    recents: snapshot.recents,
    isFavorite,
    toggleFavorite,
    recordRecent,
  };
}
