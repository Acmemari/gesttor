import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({ title, subtitle, onClose, children }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4" onClick={handleBackdrop}>
      <div
        ref={contentRef}
        className="w-full max-w-4xl rounded-xl border border-ai-border bg-ai-bg shadow-xl max-h-[88vh] flex flex-col"
      >
        <header className="flex items-start justify-between px-6 py-4 border-b border-ai-border shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-ai-text">{title}</h3>
            {subtitle && <p className="text-sm text-ai-subtext mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="mt-1 text-ai-subtext hover:text-ai-text transition-colors">
            <X size={18} />
          </button>
        </header>
        <div className="p-6 space-y-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const SectionHeader: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-2 pt-1">
    {icon}
    <span className="text-xs font-semibold tracking-wider text-ai-subtext uppercase">{label}</span>
  </div>
);
