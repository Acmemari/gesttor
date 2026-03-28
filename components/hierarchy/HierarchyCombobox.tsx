import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';

interface HierarchyComboboxProps<T> {
  label: string;
  icon?: React.ReactNode;
  items: T[];
  selectedItem: T | null;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemDescription?: (item: T) => string | null;
  onSelect: (item: T) => void;
  onSearch: (term: string) => Promise<void> | void;
  onLoadMore: () => Promise<void> | void;
  hasMore: boolean;
  isLoading: boolean;
  error?: string | null;
  disabled?: boolean;
  emptyLabel?: string;
  dropdownTitle?: string;
  className?: string;
}

const SEARCH_DEBOUNCE_MS = 300;

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(regex);
  return parts.map((part, index) => {
    const isMatch = part.toLowerCase() === term.toLowerCase();
    if (!isMatch) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    return (
      <mark key={`${part}-${index}`} className="bg-ai-accent/20 text-ai-accent rounded px-0.5">
        {part}
      </mark>
    );
  });
}

function HierarchyCombobox<T>({
  label,
  icon,
  items,
  selectedItem,
  getItemId,
  getItemLabel,
  getItemDescription,
  onSelect,
  onSearch,
  onLoadMore,
  hasMore,
  isLoading,
  error,
  disabled = false,
  emptyLabel = 'Nenhum item encontrado',
  dropdownTitle,
  className,
}: HierarchyComboboxProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  const selectedId = selectedItem ? getItemId(selectedItem) : null;
  const selectedLabel = selectedItem ? getItemLabel(selectedItem) : `Selecione ${label.toLowerCase()}`;

  const activeItem = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= items.length) return null;
    return items[activeIndex];
  }, [activeIndex, items]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void onSearch(searchTerm);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [isOpen, onSearch, searchTerm]);

  const handleScroll = async () => {
    if (!listRef.current || !hasMore || isLoading) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 32) {
      await onLoadMore();
    }
  };

  const handleKeyDown = async (event: React.KeyboardEvent) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex(0);
      return;
    }

    if (!isOpen) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, items.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter' && activeItem) {
      event.preventDefault();
      onSelect(activeItem);
      setIsOpen(false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={`relative ${className || ''}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm text-ai-text transition-colors ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-ai-surface2'
        }`}
        title={label}
      >
        <span className="truncate text-left font-medium">{selectedLabel}</span>
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-ai-subtext flex-shrink-0" />
        ) : (
          <div className="border border-ai-border rounded p-0.5 flex-shrink-0">
            <ChevronsUpDown className="w-3 h-3 text-ai-subtext" />
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-72 bg-white rounded-lg border border-ai-border shadow-lg z-50">
          {dropdownTitle && (
            <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-ai-subtext uppercase tracking-wide">
              {dropdownTitle}
            </p>
          )}
          <div className={`p-2 ${dropdownTitle ? '' : 'border-b border-ai-border'}`}>
            <div className="relative">
              <Search className="w-4 h-4 text-ai-subtext absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-8 pr-2 py-2 rounded border border-ai-border text-sm focus:outline-none focus:ring-1 focus:ring-ai-accent"
                placeholder={`Buscar...`}
                autoFocus
              />
            </div>
          </div>

          <div ref={listRef} onScroll={handleScroll} className="max-h-80 overflow-y-auto py-1">
            {error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}
            {!error && items.length === 0 && !isLoading && (
              <div className="px-3 py-4 text-center text-xs text-ai-subtext">{emptyLabel}</div>
            )}
            {items.map((item, index) => {
              const itemId = getItemId(item);
              const isActive = index === activeIndex;
              const isSelected = selectedId === itemId;
              const description = getItemDescription ? getItemDescription(item) : null;
              return (
                <button
                  type="button"
                  key={itemId}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onSelect(item);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                    isActive ? 'bg-ai-surface2' : ''
                  } ${isSelected ? 'text-ai-accent font-medium' : 'text-ai-text'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{highlight(getItemLabel(item), searchTerm)}</p>
                    {description && <p className="text-xs text-ai-subtext truncate">{description}</p>}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-ai-accent flex-shrink-0" />}
                </button>
              );
            })}
            {isLoading && (
              <div className="px-3 py-2 text-xs text-ai-subtext flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Carregando...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HierarchyCombobox;
