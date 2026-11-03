import React from 'react';
import { Calendar, ChevronDown, Database, RefreshCw } from 'lucide-react';
import { NavSection, ViewMode } from '../types/dashboard';

interface HeaderProps {
  activeNav: NavSection;
  viewMode: ViewMode;
  loading: boolean;
  dbOnline: boolean;
  startDate: string;
  endDate: string;
  service: string;
  zone: string;
  serviceOptions: string[];
  zoneOptions: string[];
  setStartDate: (val: string) => void;
  setEndDate: (val: string) => void;
  setService: (val: string) => void;
  setZone: (val: string) => void;
  onConsult: () => void;
}

export function Header({
  activeNav, viewMode, loading, dbOnline,
  startDate, endDate, service, zone,
  serviceOptions, zoneOptions,
  setStartDate, setEndDate, setService, setZone,
  onConsult,
}: HeaderProps) {
  const titleLabel =
    activeNav === 'Órdenes'
      ? 'Explorador de Órdenes 360°'
      : activeNav === 'Seguimiento'
      ? 'Monitoreo y Seguimiento en Ruta'
      : viewMode === 'ejecutiva'
      ? 'Dashboard Ejecutivo'
      : 'Vista Operativa de Casos 360';

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800/80 pb-3">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight">
            <span className="text-[#FF6B00]">WIN en RUTA</span>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-white">{titleLabel}</span>
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
            <Database size={11} />
            {loading ? 'Consultando Azure...' : dbOnline ? 'Azure MySQL En Vivo' : 'Desconectado'}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          Seguimiento, autogestión y eficiencia operativa • <span className="text-gray-300">{service}</span> • <span className="text-gray-300">{zone}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5 bg-[#111827] border border-gray-700/70 rounded-lg px-2.5 py-1">
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

        <div className="relative flex items-center bg-[#111827] border border-gray-700/70 rounded-lg px-2.5 py-1.5">
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="bg-transparent text-gray-200 focus:outline-none cursor-pointer pr-5 appearance-none"
          >
            <option value="Todos los servicios" className="bg-[#111827]">Todos los servicios</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s} className="bg-[#111827]">{s}</option>
            ))}
          </select>
          <ChevronDown size={13} className="text-gray-400 pointer-events-none absolute right-2" />
        </div>

        <div className="relative flex items-center bg-[#111827] border border-gray-700/70 rounded-lg px-2.5 py-1.5">
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="bg-transparent text-gray-200 focus:outline-none cursor-pointer pr-5 appearance-none"
          >
            <option value="Todas las zonas" className="bg-[#111827]">Todas las zonas</option>
            {zoneOptions.map((z) => (
              <option key={z} value={z} className="bg-[#111827]">{z}</option>
            ))}
          </select>
          <ChevronDown size={13} className="text-gray-400 pointer-events-none absolute right-2" />
        </div>

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