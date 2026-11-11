import React, { useState } from 'react';
import {
  Home, BarChart2, Layers, MessageSquare, Settings, Star,
  ChevronDown, Activity, ClipboardList, X, Wrench, Shield, Headset
} from 'lucide-react';
import { NavSection, ViewMode } from '../types/dashboard';

interface SidebarProps {
  activeNav: NavSection;
  viewMode: ViewMode;
  setActiveNav: (nav: NavSection) => void;
  setViewMode: (mode: ViewMode) => void;
  isOpen?: boolean;
  onClose?: () => void;
  allowedViews?: string[];
  allowedSubviews?: string[];
}

export function Sidebar({
  activeNav,
  viewMode,
  setActiveNav,
  setViewMode,
  isOpen = false,
  onClose,
  allowedViews = ['*'],
  allowedSubviews = ['*'],
}: SidebarProps) {
  const [dashExpanded, setDashExpanded] = useState<boolean>(true);

  const canSeeView = (v: NavSection) =>
    v === 'Inicio' || v === 'Chat en Vivo' || v === 'Eficiencia' || v === 'Experiencia (CSAT)' || allowedViews.includes('*') || allowedViews.includes(v);

  const canSeeSubview = (sv: ViewMode) =>
    allowedSubviews.includes('*') || allowedSubviews.includes(sv);

  const handleSelectNav = (nav: NavSection) => {
    setActiveNav(nav);
    if (onClose) onClose();
  };

  const handleSelectSubView = (mode: ViewMode) => {
    setActiveNav('Dashboard');
    setViewMode(mode);
    if (onClose) onClose();
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-60 h-screen overflow-y-auto bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 select-none transform transition-transform duration-200 ease-in-out md:sticky md:top-0 md:translate-x-0 ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
    >
      <div className="p-5">
        <div className="flex items-center justify-between px-2 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF5500] flex items-center justify-center font-black text-white text-lg shadow-md shadow-orange-500/20">
              W
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-slate-900 block leading-none">
                Control WIN
              </span>
              <span className="text-[11px] text-[#FF5500] font-semibold">en RUTA</span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="space-y-1 text-xs">
          {canSeeView('Inicio') && (
            <NavItem
              icon={<Home size={16} />}
              label="Inicio"
              active={activeNav === 'Inicio'}
              onClick={() => handleSelectNav('Inicio')}
            />
          )}

          {canSeeView('Dashboard') && (
            <div>
              <button
                onClick={() => {
                  setActiveNav('Dashboard');
                  setDashExpanded(!dashExpanded);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition font-semibold ${activeNav === 'Dashboard'
                  ? 'bg-[#FFF0E5] text-[#FF5500]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <BarChart2 size={16} />
                  <span>Dashboard</span>
                </div>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${dashExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {dashExpanded && (
                <div className="mt-1 ml-4 pl-3 border-l border-slate-200 space-y-1">
                  {canSeeSubview('ejecutiva') && (
                    <button
                      onClick={() => handleSelectSubView('ejecutiva')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition ${activeNav === 'Dashboard' && viewMode === 'ejecutiva'
                        ? 'bg-[#FF5500] text-white font-semibold shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                      <Activity size={13} />
                      <span>Vista Ejecutiva</span>
                    </button>
                  )}
                  {canSeeSubview('operativa') && (
                    <button
                      onClick={() => handleSelectSubView('operativa')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition ${activeNav === 'Dashboard' && viewMode === 'operativa'
                        ? 'bg-[#FF5500] text-white font-semibold shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                      <ClipboardList size={13} />
                      <span>Vista Operativa</span>
                    </button>
                  )}
                  {canSeeSubview('operaciones') && (
                    <button
                      onClick={() => handleSelectSubView('operaciones')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition ${activeNav === 'Dashboard' && viewMode === 'operaciones'
                        ? 'bg-[#FF5500] text-white font-semibold shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                      <Wrench size={13} />
                      <span>Operaciones Campo</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {canSeeView('Órdenes') && (
            <NavItem
              icon={<Layers size={16} />}
              label="Órdenes"
              active={activeNav === 'Órdenes'}
              onClick={() => handleSelectNav('Órdenes')}
            />
          )}
          {canSeeView('Seguimiento') && (
            <NavItem
              icon={<MessageSquare size={16} />}
              label="Seguimiento"
              active={activeNav === 'Seguimiento'}
              onClick={() => handleSelectNav('Seguimiento')}
            />
          )}
          {canSeeView('Chat en Vivo') && (
            <NavItem
              icon={<Headset size={16} />}
              label="Chat en Vivo"
              active={activeNav === 'Chat en Vivo'}
              onClick={() => handleSelectNav('Chat en Vivo')}
            />
          )}
          {canSeeView('Eficiencia') && (
            <NavItem
              icon={<Settings size={16} />}
              label="Eficiencia"
              active={activeNav === 'Eficiencia'}
              onClick={() => handleSelectNav('Eficiencia')}
            />
          )}
          {canSeeView('Experiencia (CSAT)') && (
            <NavItem
              icon={<Star size={16} />}
              label="Experiencia (CSAT)"
              active={activeNav === 'Experiencia (CSAT)'}
              onClick={() => handleSelectNav('Experiencia (CSAT)')}
            />
          )}
          {canSeeView('Accesos') && (
            <NavItem
              icon={<Shield size={16} />}
              label="Usuarios y Roles"
              active={activeNav === 'Accesos'}
              onClick={() => handleSelectNav('Accesos')}
            />
          )}
        </nav>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition font-medium ${active
        ? 'bg-[#FF5500] text-white font-semibold shadow-xs shadow-orange-500/20'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}