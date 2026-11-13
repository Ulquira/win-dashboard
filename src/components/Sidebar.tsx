import React, { useState } from 'react';
import {
  Home, BarChart2, Layers, MessageSquare, Sparkles, Star,
  ChevronDown, Activity, ClipboardList, X, Wrench, Shield,
  LogOut, Menu
} from 'lucide-react';
import { AuthUser, NavSection, ViewMode } from '../types/dashboard';

interface SidebarProps {
  activeNav: NavSection;
  viewMode: ViewMode;
  setActiveNav: (nav: NavSection) => void;
  setViewMode: (mode: ViewMode) => void;
  isOpen?: boolean;
  onClose?: () => void;
  allowedViews?: string[];
  allowedSubviews?: string[];
  authUser?: AuthUser | null;
  onLogout?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  authUser,
  onLogout,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const [dashExpanded, setDashExpanded] = useState<boolean>(true);

  const canSeeView = (v: NavSection) =>
    v === 'Inicio' ||
    v === 'Eficiencia' ||
    v === 'Experiencia (CSAT)' ||
    allowedViews.includes('*') ||
    allowedViews.includes(v);

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
      className={`fixed inset-y-0 left-0 z-50 h-screen bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 select-none transform transition-all duration-200 ease-in-out md:sticky md:top-0 md:translate-x-0 ${
        isOpen ? 'translate-x-0 shadow-2xl w-60' : '-translate-x-full'
      } ${collapsed ? 'md:w-[72px]' : 'md:w-60'}`}
    >
      {/* BLOQUE SUPERIOR: FRANJA DE MARCA + NAVEGACIÓN */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Franja superior completa de marca WIN + Botón Retráctil */}
        <div
          className={`w-full bg-gradient-to-r from-[#FF5500] to-[#ff6a1a] mb-4 flex items-center shadow-sm transition-all ${
            collapsed ? 'px-2.5 py-4 justify-center' : 'px-4 py-4 justify-between'
          }`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/winlogo.png"
                alt="WIN"
                className="h-6 w-auto object-contain select-none shrink-0"
              />
              <div className="h-5 w-px bg-white/30 shrink-0" />
              <div className="leading-tight truncate">
                <span className="font-extrabold text-[11px] tracking-wide text-white uppercase block">
                  Control
                </span>
                <span className="text-[9.5px] text-orange-100 font-bold tracking-widest uppercase block">
                  en RUTA
                </span>
              </div>
            </div>
          )}

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
              className="hidden md:inline-flex p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition cursor-pointer shrink-0"
            >
              <Menu size={17} />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className={`${collapsed ? 'px-2.5' : 'px-3.5'} pb-4 space-y-1 text-xs`}>
          {canSeeView('Inicio') && (
            <NavItem
              icon={<Home size={16} />}
              label="Inicio"
              collapsed={collapsed}
              active={activeNav === 'Inicio'}
              onClick={() => handleSelectNav('Inicio')}
            />
          )}

          {canSeeView('Dashboard') && (
            <div>
              <button
                type="button"
                title="Dashboard"
                onClick={() => {
                  setActiveNav('Dashboard');
                  if (collapsed && onToggleCollapse) {
                    onToggleCollapse();
                    setDashExpanded(true);
                  } else {
                    setDashExpanded(!dashExpanded);
                  }
                }}
                className={`w-full flex items-center ${
                  collapsed ? 'justify-center px-2' : 'justify-between px-3'
                } py-2.5 rounded-xl transition font-semibold ${
                  activeNav === 'Dashboard'
                    ? 'bg-[#FFF0E5] text-[#FF5500]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <BarChart2 size={16} className="shrink-0" />
                  {!collapsed && <span>Dashboard</span>}
                </div>
                {!collapsed && (
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${
                      dashExpanded ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {dashExpanded && !collapsed && (
                <div className="mt-1 ml-4 pl-3 border-l border-slate-200 space-y-1">
                  {canSeeSubview('ejecutiva') && (
                    <button
                      type="button"
                      onClick={() => handleSelectSubView('ejecutiva')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition ${
                        activeNav === 'Dashboard' && viewMode === 'ejecutiva'
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
                      type="button"
                      onClick={() => handleSelectSubView('operativa')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition ${
                        activeNav === 'Dashboard' && viewMode === 'operativa'
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
                      type="button"
                      onClick={() => handleSelectSubView('operaciones')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition ${
                        activeNav === 'Dashboard' && viewMode === 'operaciones'
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
              collapsed={collapsed}
              active={activeNav === 'Órdenes'}
              onClick={() => handleSelectNav('Órdenes')}
            />
          )}
          {canSeeView('Seguimiento') && (
            <NavItem
              icon={<MessageSquare size={16} />}
              label="Seguimiento"
              collapsed={collapsed}
              active={activeNav === 'Seguimiento'}
              onClick={() => handleSelectNav('Seguimiento')}
            />
          )}
          {canSeeView('Eficiencia') && (
            <NavItem
              icon={<Sparkles size={16} />}
              label="Eficiencia"
              collapsed={collapsed}
              active={activeNav === 'Eficiencia'}
              onClick={() => handleSelectNav('Eficiencia')}
            />
          )}
          {canSeeView('Experiencia (CSAT)') && (
            <NavItem
              icon={<Star size={16} />}
              label="Experiencia (CSAT)"
              collapsed={collapsed}
              active={activeNav === 'Experiencia (CSAT)'}
              onClick={() => handleSelectNav('Experiencia (CSAT)')}
            />
          )}
          {canSeeView('Accesos') && (
            <NavItem
              icon={<Shield size={16} />}
              label="Usuarios y Roles"
              collapsed={collapsed}
              active={activeNav === 'Accesos'}
              onClick={() => handleSelectNav('Accesos')}
            />
          )}
        </nav>
      </div>

      {/* BLOQUE INFERIOR: TARJETA DE USUARIO Y BOTÓN SALIR */}
      {authUser && (
        <div className="p-3 border-t border-slate-200/80 bg-slate-50/70">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${authUser.nombre} (${authUser.permisos?.rolNombre || 'Usuario'})`}
                className="w-9 h-9 rounded-xl bg-[#FFF0E5] border border-orange-200 flex items-center justify-center text-[#FF5500] font-extrabold text-xs"
              >
                {String(authUser.nombre || 'U').charAt(0).toUpperCase()}
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  title="Cerrar sesión"
                  className="w-9 h-9 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200/80 flex items-center justify-center transition cursor-pointer"
                >
                  <LogOut size={14} />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFF0E5] border border-orange-200 flex items-center justify-center text-[#FF5500] font-black text-xs shrink-0">
                  {String(authUser.nombre || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-xs text-slate-900 truncate" title={authUser.nombre}>
                    {authUser.nombre}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold text-[9.5px] uppercase truncate">
                      <Shield size={10} className="shrink-0" />
                      <span className="truncate">{authUser.permisos?.rolNombre || 'ADMIN'}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      ({authUser.documento})
                    </span>
                  </div>
                </div>
              </div>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200/90 hover:border-rose-200 font-bold text-xs transition cursor-pointer shadow-2xs"
                >
                  <LogOut size={13} />
                  <span>Salir de sesión</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function NavItem({
  icon,
  label,
  collapsed = false,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center ${
        collapsed ? 'justify-center px-2' : 'gap-3 px-3'
      } py-2.5 rounded-xl transition font-medium ${
        active
          ? 'bg-[#FF5500] text-white font-semibold shadow-xs shadow-orange-500/20'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}