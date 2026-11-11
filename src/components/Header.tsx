import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, RefreshCw, Search, Globe, Check, Menu, Sun, Moon } from 'lucide-react';
import { NavSection, ViewMode } from '../types/dashboard';

interface HeaderProps {
  activeNav: NavSection;
  viewMode: ViewMode;
  loading: boolean;
  dbOnline: boolean;
  startDate: string;
  endDate: string;
  selectedServices: string[];
  serviceOptions: string[];
  globalSearch: string;
  ignoreDates: boolean;
  setStartDate: (val: string) => void;
  setEndDate: (val: string) => void;
  setSelectedServices: (val: string[]) => void;
  setGlobalSearch: (val: string) => void;
  setIgnoreDates: (val: boolean) => void;
  onConsult: () => void;
  onToggleSidebar?: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export function Header({
  activeNav,
  viewMode,
  loading,
  dbOnline,
  startDate,
  endDate,
  selectedServices,
  serviceOptions,
  globalSearch,
  ignoreDates,
  setStartDate,
  setEndDate,
  setSelectedServices,
  setGlobalSearch,
  setIgnoreDates,
  onConsult,
  onToggleSidebar,
  darkMode = false,
  onToggleDarkMode,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleServiceItem = (srv: string) => {
    if (selectedServices.includes(srv)) {
      setSelectedServices(selectedServices.filter((s) => s !== srv));
    } else {
      setSelectedServices([...selectedServices, srv]);
    }
  };

  const serviceSummaryLabel =
    serviceOptions.length === 1
      ? serviceOptions[0]
      : selectedServices.length === 0
        ? serviceOptions.length < 5
          ? `Mis servicios (${serviceOptions.length})`
          : 'Todos los servicios'
        : selectedServices.length === 1
          ? selectedServices[0]
          : `${selectedServices.length} servicios seleccionados`;

  const titleLabel =
    activeNav === 'Órdenes'
      ? 'Órdenes'
      : activeNav === 'Seguimiento'
        ? 'Seguimiento'
        : activeNav === 'Chat en Vivo'
          ? 'Atención de Chats en Vivo'
          : activeNav === 'Eficiencia'
            ? 'Eficiencia'
            : activeNav === 'Experiencia (CSAT)'
              ? 'Experiencia (CSAT)'
              : activeNav === 'Accesos'
                ? 'Usuarios y Roles'
                : activeNav === 'Inicio'
                  ? 'Inicio'
                  : viewMode === 'ejecutiva'
                    ? 'Vista Ejecutiva'
                    : viewMode === 'operativa'
                      ? 'Vista Operativa'
                      : 'Operaciones de Campo';

  return (
    <header className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
      {/* TÍTULO Y BADGE DE ESTADO */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 shadow-xs transition"
              title="Abrir menú"
            >
              <Menu size={18} />
            </button>
          )}
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {titleLabel}
          </h2>
        </div>

        {/* BADGES PASTEL PILL */}
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${loading
            ? 'bg-amber-100 text-amber-800'
            : dbOnline
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
            }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : dbOnline ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
          />
          {loading ? 'Cargando' : dbOnline ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      {/* BARRA UNIFICADA DE FILTROS GLOBALES */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs w-full lg:w-auto">
        {/* 1. Buscador Dinámico */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-[200px] sm:w-64 focus-within:border-[#FF5500] focus-within:ring-2 focus-within:ring-orange-100 shadow-xs transition">
          <Search size={14} className="text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Buscar DNI, tlf, orden, cliente..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none w-full text-xs"
          />
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch('')}
              className="text-slate-400 hover:text-slate-700 ml-1 text-xs"
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Botón Histórico BD */}
        <button
          onClick={() => setIgnoreDates(!ignoreDates)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${ignoreDates
            ? 'bg-sky-100 text-sky-800 font-bold border border-sky-200'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-xs'
            }`}
          title="Buscar en todo el histórico sin límite de fechas"
        >
          <Globe size={14} className={ignoreDates ? 'text-sky-700' : 'text-slate-400'} />
          <span>{ignoreDates ? 'Todo el Histórico' : 'Rango Fechas'}</span>
        </button>

        {/* 2. Rango de Fechas */}
        <div
          className={`flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs transition shrink-0 ${ignoreDates ? 'opacity-40 pointer-events-none' : ''
            }`}
        >
          <Calendar size={14} className="text-[#FF5500] shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-transparent text-slate-700 focus:outline-none text-xs cursor-pointer font-medium"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-transparent text-slate-700 focus:outline-none text-xs cursor-pointer font-medium"
          />
        </div>

        {/* 3. Filtro Multiselección de Servicios */}
        <div className="relative shrink-0 flex-1 sm:flex-initial" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center justify-between gap-2 bg-white border rounded-xl px-3.5 py-2 text-xs transition w-full sm:min-w-[175px] shadow-xs ${selectedServices.length > 0
              ? 'border-[#FF5500] text-[#FF5500] font-bold bg-[#FFF0E5]'
              : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
          >
            <span className="truncate">{serviceSummaryLabel}</span>
            <ChevronDown size={14} className={selectedServices.length > 0 ? 'text-[#FF5500]' : 'text-slate-400'} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 space-y-1 max-h-72 overflow-y-auto">
              {serviceOptions.length > 1 && (
                <>
                  <div
                    onClick={() => setSelectedServices([])}
                    className={`px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between text-xs font-semibold transition ${selectedServices.length === 0
                      ? 'bg-[#FF5500] text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <span>{serviceOptions.length < 5 ? `Todos mis servicios (${serviceOptions.length})` : 'Todos los servicios'}</span>
                    {selectedServices.length === 0 && <Check size={14} />}
                  </div>

                  <div className="border-t border-slate-100 my-1" />
                </>
              )}

              {serviceOptions.map((srv) => {
                const checked = selectedServices.includes(srv);
                return (
                  <div
                    key={srv}
                    onClick={() => toggleServiceItem(srv)}
                    className={`px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between text-xs transition ${checked
                      ? 'bg-[#FFF0E5] text-[#FF5500] font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <span>{srv}</span>
                    {checked && <Check size={14} className="text-[#FF5500]" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Botón Primario de Marca "Consultar" */}
        <button
          onClick={onConsult}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#FF5500] hover:bg-[#E04B00] disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-sm shadow-orange-500/30 transition flex-1 sm:flex-initial"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Cargando...' : 'Consultar'}</span>
        </button>

        {/* 5. Botón Conmutador Dark / Light Mode */}
        {onToggleDarkMode && (
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="flex items-center justify-center p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-[#FF5500] hover:text-[#FF5500] shadow-xs transition shrink-0"
            title={darkMode ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
          >
            {darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} />}
          </button>
        )}
      </div>
    </header>
  );
}
