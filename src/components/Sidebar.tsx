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
        fixed inset-y-0 left-0 z-50 w-64 bg-[#0B101B] border-r border-gray-800/80 flex flex-col justify-between p-4 shrink-0 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        md:static md:translate-x-0 md:w-60
      `}
    >
      <div>
        <div className="flex items-center justify-between px-2 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#FF6B00] flex items-center justify-center font-black text-white text-lg shadow-lg shadow-orange-500/20">
              W
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-white">Control WIN</h1>
              <p className="text-[11px] text-gray-400">Operaciones</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800/60 transition"
              title="Cerrar menú"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="space-y-1 text-xs font-medium">
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
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition ${
                activeNav === 'Dashboard'
                  ? 'bg-gradient-to-r from-[#FF6B00] to-[#FF8533] text-white font-semibold shadow-md shadow-orange-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <BarChart2 size={16} />
                <span>Dashboard</span>
              </div>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${dashOpen ? 'rotate-180' : ''}`}
              />
            </div>

            {dashOpen && (
              <div className="mt-1 ml-4 pl-3 border-l border-gray-800 space-y-1">
                <div
                  onClick={() => handleNav('Dashboard', 'ejecutiva')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition text-[11px] ${
                    activeNav === 'Dashboard' && viewMode === 'ejecutiva'
                      ? 'bg-[#FF6B00]/15 text-[#FF6B00] font-bold border border-[#FF6B00]/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
                  }`}
                >
                  <Activity size={13} />
                  <span>Vista Ejecutiva</span>
                </div>

                <div
                  onClick={() => handleNav('Dashboard', 'operativa')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition text-[11px] ${
                    activeNav === 'Dashboard' && viewMode === 'operativa'
                      ? 'bg-[#FF6B00]/15 text-[#FF6B00] font-bold border border-[#FF6B00]/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
                  }`}
                >
                  <ClipboardList size={13} />
                  <span>Vista Operativa</span>
                </div>
              </div>
            )}
          </div>

          <NavItem icon={<Layers size={16} />} label="Órdenes" active={activeNav === 'Órdenes'} onClick={() => handleNav('Órdenes')} />
          <NavItem icon={<CheckCircle size={16} />} label="Seguimiento" active={activeNav === 'Seguimiento'} onClick={() => handleNav('Seguimiento')} />
          <NavItem icon={<Activity size={16} />} label="Eficiencia" active={activeNav === 'Eficiencia'} onClick={() => handleNav('Eficiencia')} />
          <NavItem icon={<Smile size={16} />} label="Experiencia (CSAT)" active={activeNav === 'Experiencia (CSAT)'} onClick={() => handleNav('Experiencia (CSAT)')} />

          <div className="flex items-center justify-between px-3 py-2.5 text-gray-400 hover:text-white hover:bg-gray-800/40 rounded-lg cursor-pointer transition">
            <div className="flex items-center gap-3">
              <FileText size={16} />
              <span>Reportes</span>
            </div>
            <ChevronDown size={14} />
          </div>
        </nav>
      </div>

      <div className="px-2 pb-2 relative">
        <div className="flex items-center gap-1.5 mb-1">
          <MapPin size={18} className="text-[#FF6B00]" />
          <span className="font-black text-base tracking-tight text-white">WIN</span>
        </div>
        <div className="text-[#FF6B00] font-black text-xl leading-none mb-3">
          <span className="text-xs font-normal text-gray-300 mr-1">en</span>RUTA
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed pr-6">
          Seguimiento y autogestión de tus instalaciones y visitas técnicas
        </p>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition ${
        active
          ? 'bg-gradient-to-r from-[#FF6B00] to-[#FF8533] text-white font-semibold shadow-md shadow-orange-500/20'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
      }`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
