import React, { useState, useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface ExpandableCardProps {
  className?: string;
  children: React.ReactNode | ((isExpanded: boolean) => React.ReactNode);
}

export function ExpandableCard({ className = '', children }: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  const content = typeof children === 'function' ? children(expanded) : children;

  return (
    <div
      className={`${className} relative group/bi transition-all duration-200 ${
        expanded ? 'bi-focus-active z-20' : ''
      }`}
    >
      <div className="absolute top-3.5 right-3.5 z-30 flex items-center gap-2">
        {expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#FFF0E5] text-slate-700 hover:text-[#FF5500] border border-slate-200 hover:border-orange-200 font-bold text-xs transition cursor-pointer shadow-2xs"
          >
            <Minimize2 size={13} />
            <span>Volver al informe (Esc)</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Modo enfoque (Ampliar en pantalla)"
            className="p-1.5 rounded-xl bg-slate-50/90 hover:bg-[#FFF0E5] text-slate-400 hover:text-[#FF5500] border border-slate-200/80 hover:border-orange-200 opacity-0 group-hover/bi:opacity-100 focus:opacity-100 transition-all shadow-2xs cursor-pointer"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      {content}
    </div>
  );
}