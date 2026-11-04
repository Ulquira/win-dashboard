import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Database, RefreshCw, Search, Globe, Check } from 'lucide-react';
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
    selectedServices.length === 0
      ? 'Todos los servicios'
      : selectedServices.length === 1
      ? selectedServices[0]
      : `${selectedServices.length} servicios seleccionados`;

  const titleLabel =
    activeNav === 'Órdenes'
      ? 'Órdenes'
      : activeNav === 'Seguimiento'
      ? 'Seguimiento'
      : activeNav === 'Eficiencia'
      ? 'Eficiencia'
      : activeNav === 'Experiencia (CSAT)'
      ? 'Experiencia (CSAT)'
      : activeNav === 'Inicio'
      ? 'Inicio'
      : viewMode === 'ejecutiva'
      ? 'Vista Ejecutiva'
      : 'Vista Operativa';

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/80 pb-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight text-white">
          {titleLabel}
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
            loading
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : dbOnline
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              loading ? 'bg-amber-400 animate-pulse' : dbOnline ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {loading ? 'Cargando' : dbOnline ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      {/* BARRA UNIFICADA DE FILTROS GLOBALES */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* 1. Buscador Dinámico Único */}
        <div className="flex items-center bg-[#111827] border border-gray-700/80 rounded-lg px-2.5 py-1.5 w-64 focus-within:border-[#FF6B00] transition">
          <Search size={13} className="text-gray-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Buscar DNI, tlf, orden, CTO, cliente..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="bg-transparent text-gray-200 focus:outline-none w-full text-xs"
          />
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch('')}
              className="text-gray-500 hover:text-white ml-1 text-[11px]"
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Botón Histórico BD (Ignorar rango de fechas al buscar) */}
        <button
          onClick={() => setIgnoreDates(!ignoreDates)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
            ignoreDates
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              : 'bg-[#111827] text-gray-400 border-gray-700/70 hover:text-gray-200'
          }`}
          title="Buscar en todo el histórico sin límite de fechas"
        >
          <Globe size={13} />
          <span>{ignoreDates ? 'Todo el Histórico' : 'Rango Fechas'}</span>
        </button>

        {/* 2. Rango de Fechas */}
        <div
          className={`flex items-center gap-1.5 bg-[#111827] border border-gray-700/70 rounded-lg px-2.5 py-1 transition ${
            ignoreDates ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          <Calendar size={13} className="text-[#FF6B00] shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-transparent text-gray-200 focus:outline-none text-[11px] cursor-pointer"
          />
          <span className="text-gray-500">–</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-transparent text-gray-200 focus:outline-none text-[11px] cursor-pointer"
          />
        </div>

        {/* 3. Filtro Multiselección de Servicios */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center justify-between gap-2 bg-[#111827] border rounded-lg px-3 py-1.5 text-xs transition min-w-[175px] ${
              selectedServices.length > 0
                ? 'border-[#FF6B00] text-white font-semibold'
                : 'border-gray-700/70 text-gray-200'
            }`}
          >
            <span className="truncate">{serviceSummaryLabel}</span>
            <ChevronDown size={13} className="text-gray-400 shrink-0" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-50 space-y-1 max-h-72 overflow-y-auto">
              <div
                onClick={() => setSelectedServices([])}
                className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between text-xs font-semibold transition ${
                  selectedServices.length === 0
                    ? 'bg-[#FF6B00] text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span>Todos los servicios</span>
                {selectedServices.length === 0 && <Check size={13} />}
              </div>

              <div className="border-t border-gray-800 my-1" />

              {serviceOptions.map((srv) => {
                const checked = selectedServices.includes(srv);
                return (
                  <div
                    key={srv}
                    onClick={() => toggleServiceItem(srv)}
                    className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between text-xs transition ${
                      checked
                        ? 'bg-[#FF6B00]/20 text-white font-bold border border-[#FF6B00]/40'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <span className="truncate pr-2">{srv}</span>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        checked
                          ? 'bg-[#FF6B00] border-[#FF6B00] text-white'
                          : 'border-gray-600 bg-[#111827]'
                      }`}
                    >
                      {checked && <Check size={11} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Botón Consultar */}
        <button
          onClick={onConsult}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B00] hover:bg-[#e66000] disabled:opacity-50 text-white font-semibold rounded-lg transition"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Cargando...' : 'Consultar'}</span>
        </button>
      </div>
    </header>
  );
}