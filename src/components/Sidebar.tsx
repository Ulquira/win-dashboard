import React, { useState } from 'react';
import {
  Home, BarChart2, Layers, CheckCircle, Activity, Smile, FileText,
  ChevronDown, ClipboardList, MapPin, X
} from 'lucide-react';
import { NavSection, ViewMode } from '../types/dashboard';

interface SidebarProps {
  activeNav: NavSection;
  viewMode: ViewMode;
  setActiveNav: (nav: NavSection) => void;
  setViewMode: (mode: ViewMode) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  activeNav,
  viewMode,
  setActiveNav,
  setViewMode,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const [dashOpen, setDashOpen] = useState<boolean>(true);

  const handleNav = (nav: NavSection, mode?: ViewMode) => {
    setActiveNav(nav);
    if (mode) setViewMode(mode);
    if (onClose) onClose();
  };

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between p-4 shrink-0 transition-transform duration-300 ease-in-out shadow-xs
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        md:static md:translate-x-0 md:w-60
      `}
    >
      <div>
        {/* LOGO SUPERIOR */}
        <div className="flex items-center justify-between px-2 mb-7">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF5500] flex items-center justify-center font-black text-white text-lg shadow-sm shadow-orange-500/30">
              W
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-slate-900 tracking-tight">Control WIN</h1>
              <p className="text-[11px] font-semibold text-[#FF5500]">en RUTA</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
              title="Cerrar menú"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* NAVEGACIÓN PRINCIPAL */}
        <nav className="space-y-1.5 text-xs font-medium">
          <NavItem
            icon={<Home size={16} />}
            label="Inicio"
            active={activeNav === 'Inicio'}
            onClick={() => handleNav('Inicio', 'ejecutiva')}
          />

          <div>
            <div
              onClick={() => {
                setActiveNav('Dashboard');
                setDashOpen(!dashOpen);
              }}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition ${activeNav === 'Dashboard'
                ? 'bg-[#FFF0E5] text-[#FF5500] font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <BarChart2 size={16} />
                <span>Dashboard</span>
              </div>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${dashOpen ? 'rotate-180 text-[#FF5500]' : 'text-slate-400'}`}
              />
            </div>

            {dashOpen && (
              <div className="mt-1.5 ml-4 pl-3 border-l-2 border-orange-100 space-y-1">
                <div
                  onClick={() => handleNav('Dashboard', 'ejecutiva')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition text-[11px] ${activeNav === 'Dashboard' && viewMode === 'ejecutiva'
                    ? 'bg-[#FF5500] text-white font-bold shadow-xs shadow-orange-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                  <Activity size={13} />
                  <span>Vista Ejecutiva</span>
                </div>

                <div
                  onClick={() => handleNav('Dashboard', 'operativa')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition text-[11px] ${activeNav === 'Dashboard' && viewMode === 'operativa'
                      ? 'bg-[#FF5500] text-white font-bold shadow-xs shadow-orange-500/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                  <ClipboardList size={13} />
                  <span>Vista Operativa</span>
                </div>
                <div
                  onClick={() => handleNav('Dashboard', 'operaciones')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition text-[11px] ${activeNav === 'Dashboard' && viewMode === 'operaciones'
                      ? 'bg-[#FF5500] text-white font-bold shadow-xs shadow-orange-500/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                  <BarChart2 size={13} />
                  <span>Operaciones Campo</span>
                </div>
              </div>
            )}
          </div>

          <NavItem icon={<Layers size={16} />} label="Órdenes" active={activeNav === 'Órdenes'} onClick={() => handleNav('Órdenes')} />
          <NavItem icon={<CheckCircle size={16} />} label="Seguimiento" active={activeNav === 'Seguimiento'} onClick={() => handleNav('Seguimiento')} />
          <NavItem icon={<Activity size={16} />} label="Eficiencia" active={activeNav === 'Eficiencia'} onClick={() => handleNav('Eficiencia')} />
          <NavItem icon={<Smile size={16} />} label="Experiencia (CSAT)" active={activeNav === 'Experiencia (CSAT)'} onClick={() => handleNav('Experiencia (CSAT)')} />

          <div className="flex items-center justify-between px-3.5 py-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl cursor-pointer transition">
            <div className="flex items-center gap-3">
              <FileText size={16} />
              <span>Reportes</span>
            </div>
            <ChevronDown size={14} className="text-slate-400" />
          </div>
        </nav>
      </div>

      {/* FOOTER INFORMACIÓN DE MARCA */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 relative">
        <div className="flex items-center gap-1.5 mb-1">
          <MapPin size={16} className="text-[#FF5500]" />
          <span className="font-black text-sm tracking-tight text-slate-900">WIN</span>
          <span className="text-xs font-semibold text-[#FF5500]">en RUTA</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-snug">
          Seguimiento y autogestión de tus instalaciones y visitas técnicas en tiempo real.
        </p>
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
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition ${active
        ? 'bg-[#FFF0E5] text-[#FF5500] font-bold shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }`}
    >
      <span className={active ? 'text-[#FF5500]' : 'text-slate-500'}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}
