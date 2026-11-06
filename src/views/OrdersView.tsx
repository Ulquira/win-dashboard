import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Filter, ChevronDown, User, ChevronLeft, ChevronRight, RefreshCw, Check
} from 'lucide-react';
import { RealOrder } from '../types/dashboard';
import { apiFetch } from '../config/api';

interface OrdersViewProps {
  orders: RealOrder[];
  startDate: string;
  endDate: string;
  service: string;
  globalSearch: string;
  ignoreDates: boolean;
  serviceOptions?: string[];
  sectorOptions?: string[];
  partnerOptions?: string[];
  onSelectOrder: (order: RealOrder) => void;
}

export function OrdersView({
  orders: initialOrders,
  startDate,
  endDate,
  service,
  globalSearch,
  ignoreDates,
  serviceOptions = [],
  sectorOptions = [],
  partnerOptions = [],
  onSelectOrder,
}: OrdersViewProps) {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(globalSearch);
  const [page, setPage] = useState<number>(() => {
    return Number(sessionStorage.getItem('ord_page')) || 1;
  });
  const pageSize = 50;

  const [openHeaderCol, setOpenHeaderCol] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' }>({
    col: 'orden',
    dir: 'desc',
  });

  // Filtros de cabecera con persistencia en sessionStorage
  const [colFilters, setColFilters] = useState<{
    orden: string;
    cliente: string;
    operacion: string[];
    sector: string[];
    partner: string[];
    estadoOt: string[];
    wsp: string[];
    tracking: string[];
  }>(() => {
    const saved = sessionStorage.getItem('ord_colFilters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback al estado limpio
      }
    }
    return {
      orden: '',
      cliente: '',
      operacion: [],
      sector: [],
      partner: [],
      estadoOt: [],
      wsp: [],
      tracking: [],
    };
  });

  useEffect(() => {
    sessionStorage.setItem('ord_page', String(page));
    sessionStorage.setItem('ord_colFilters', JSON.stringify(colFilters));
  }, [page, colFilters]);

  const toggleMultiFilter = (
    key: 'operacion' | 'sector' | 'partner' | 'estadoOt' | 'wsp' | 'tracking',
    val: string
  ) => {
    setColFilters((prev) => {
      const arr = prev[key];
      const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
      return { ...prev, [key]: next };
    });
    setPage(1);
  };

  const activeColFilterCount = useMemo(() => {
    let count = 0;
    if (colFilters.orden.trim()) count++;
    if (colFilters.cliente.trim()) count++;
    count +=
      colFilters.operacion.length +
      colFilters.sector.length +
      colFilters.partner.length +
      colFilters.estadoOt.length +
      colFilters.wsp.length +
      colFilters.tracking.length;
    return count;
  }, [colFilters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery((prev) => {
        if (prev !== globalSearch) setPage(1);
        return globalSearch;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  const {
    data: ordersData,
    isFetching: loadingPage,
  } = useQuery<any>({
    queryKey: [
      'ordersSearch',
      startDate,
      endDate,
      service,
      debouncedQuery,
      ignoreDates,
      colFilters,
      page,
    ],
    queryFn: async ({ signal }): Promise<any> => {
      const serializeArr = (arr: string[]) => (arr.length > 0 ? arr.join(',') : 'Todos');
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: debouncedQuery,
        ignoreDates: ignoreDates ? 'true' : 'false',
        orden: colFilters.orden,
        cliente: colFilters.cliente,
        operacion: serializeArr(colFilters.operacion),
        sector: serializeArr(colFilters.sector),
        partner: serializeArr(colFilters.partner),
        estadoOt: serializeArr(colFilters.estadoOt),
        wsp: serializeArr(colFilters.wsp),
        tracking: serializeArr(colFilters.tracking),
        page: String(page),
        pageSize: String(pageSize),
      });
      return (apiFetch as any)(`/api/orders/search?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
  });

  const serverOrders: RealOrder[] = ordersData?.orders || initialOrders.slice(0, 50);
  const totalRecords = Number(ordersData?.total ?? initialOrders.length);
  const totalPages = Number(
    ordersData?.totalPages ?? Math.max(1, Math.ceil((initialOrders.length || 1) / 50))
  );

  const resetAllOrderFilters = () => {
    setColFilters({
      orden: '',
      cliente: '',
      operacion: [],
      sector: [],
      partner: [],
      estadoOt: [],
      wsp: [],
      tracking: [],
    });
    setSortConfig({ col: 'orden', dir: 'desc' });
    setPage(1);
    setOpenHeaderCol(null);
  };

  const headerOptions = useMemo(() => {
    const sourceList = serverOrders.length > 0 ? serverOrders : initialOrders;
    const countMap = (getter: (o: RealOrder) => string, defaultList: string[] = []) => {
      const m = new Map<string, number>();
      defaultList.forEach((d) => {
        if (d && d.trim()) m.set(d.trim(), 0);
      });
      sourceList.forEach((o) => {
        const val = getter(o);
        if (val) m.set(val, (m.get(val) || 0) + 1);
      });
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };

    return {
      operaciones: countMap(
        (o) => String(o.servicio_tipo || '-').trim().toUpperCase(),
        (serviceOptions || []).map((s) => s.toUpperCase())
      ),
      sectores: countMap(
        (o) => String(o.sector_operativo || 'SIN SECTOR').trim(),
        sectorOptions || []
      ),
      partners: countMap(
        (o) => String(o.partner || o.proveedor_ot || 'SIN PARTNER').trim(),
        partnerOptions || []
      ),
    };
  }, [serverOrders, initialOrders, serviceOptions, sectorOptions, partnerOptions]);

  const displayedOrders = useMemo(() => {
    return [...serverOrders].sort((a, b) => {
      const dir = sortConfig.dir === 'asc' ? 1 : -1;
      if (sortConfig.col === 'orden') return (Number(a.orden_id) - Number(b.orden_id)) * dir;
      if (sortConfig.col === 'cliente')
        return String(a.cliente || '').localeCompare(String(b.cliente || '')) * dir;
      return 0;
    });
  }, [serverOrders, sortConfig]);

  const startIdx = totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(totalRecords, page * pageSize);

  return (
    <div
      className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-4 sm:p-5 space-y-3"
      onClick={() => setOpenHeaderCol(null)}
    >
      {/* BARRA COMPACTA DE PAGINACIÓN Y ESTADO DE REGISTROS */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <span className="px-2.5 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-bold">
            {totalRecords.toLocaleString('es-PE')} registros
          </span>
          <span className="text-slate-300">•</span>
          <span>
            Mostrando <strong className="text-slate-900">{startIdx}–{endIdx}</strong> (Página{' '}
            <strong className="text-slate-900">{page}</strong> de{' '}
            <strong className="text-slate-900">{totalPages.toLocaleString('es-PE')}</strong>)
          </span>
          {loadingPage && <RefreshCw size={13} className="text-[#FF5500] animate-spin ml-1" />}
          {activeColFilterCount > 0 && (
            <button
              onClick={resetAllOrderFilters}
              className="ml-2 px-2.5 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold transition text-[11px]"
            >
              ✕ Limpiar filtros de columna ({activeColFilterCount})
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1 || loadingPage}
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 text-[11px] font-semibold transition"
          >
            « Primera
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-[#FF5500] hover:border-[#FF5500] hover:text-white disabled:opacity-40 text-[11px] font-semibold transition"
          >
            <ChevronLeft size={13} /> Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-[#FF5500] hover:border-[#FF5500] hover:text-white disabled:opacity-40 text-[11px] font-semibold transition"
          >
            Siguiente <ChevronRight size={13} />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages || loadingPage}
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 text-[11px] font-semibold transition"
          >
            Última »
          </button>
        </div>
      </div>

      {/* TABLA CON CABECERAS MULTISELECCIÓN */}
      <div className="overflow-x-auto min-h-[420px] max-h-[700px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-white z-20 shadow-[0_1px_0_0_#f1f5f9]">
            <tr className="text-slate-500 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider select-none">
              <th className="py-2.5 px-2 text-left whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'orden' ? null : 'orden');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.orden
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>N° Orden / Ticket</span>
                  <Filter size={11} className={colFilters.orden ? 'text-[#FF5500]' : 'text-slate-400'} />
                </div>
                {openHeaderCol === 'orden' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-30 space-y-2.5 normal-case font-normal"
                  >
                    <div className="text-[11px] font-bold text-slate-800">Filtrar N° Orden o Ticket</div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ej: 3575583 o VTR..."
                      value={colFilters.orden}
                      onChange={(e) => setColFilters({ ...colFilters, orden: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#FF5500]"
                    />
                  </div>
                )}
              </th>

              <th className="py-2.5 px-2 text-left whitespace-nowrap">Fecha</th>

              <th className="py-2.5 px-2 text-left relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'cliente' ? null : 'cliente');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.cliente
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>Cliente / Doc. / Cód. Seg.</span>
                  <Filter size={11} className={colFilters.cliente ? 'text-[#FF5500]' : 'text-slate-400'} />
                </div>
                {openHeaderCol === 'cliente' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-30 space-y-2.5 normal-case font-normal"
                  >
                    <div className="text-[11px] font-bold text-slate-800">Filtrar Cliente, DNI o Teléfono</div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nombre, DNI, Cód.Clie o Celular..."
                      value={colFilters.cliente}
                      onChange={(e) => setColFilters({ ...colFilters, cliente: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#FF5500]"
                    />
                  </div>
                )}
              </th>

              {/* OPERACIÓN MULTISELECCIÓN */}
              <th className="py-2.5 px-2 text-left relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'operacion' ? null : 'operacion');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.operacion.length > 0
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>Operación / Producto</span>
                  {colFilters.operacion.length > 0 && (
                    <span className="px-1.5 rounded-full bg-[#FF5500] text-white text-[9px]">
                      {colFilters.operacion.length}
                    </span>
                  )}
                  <ChevronDown size={12} />
                </div>
                {openHeaderCol === 'operacion' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-30 normal-case font-normal max-h-64 overflow-y-auto"
                  >
                    <div
                      onClick={() => setColFilters({ ...colFilters, operacion: [] })}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex justify-between text-xs ${colFilters.operacion.length === 0 ? 'bg-[#FF5500] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>Todas las operaciones</span>
                    </div>
                    {headerOptions.operaciones.map(([val, cnt]) => {
                      const active = colFilters.operacion.includes(val);
                      return (
                        <div
                          key={val}
                          onClick={() => toggleMultiFilter('operacion', val)}
                          className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex items-center justify-between text-xs mt-0.5 ${active ? 'bg-[#FFF0E5] text-[#FF5500] font-bold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span className="truncate pr-2">{val}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] opacity-75">{cnt}</span>
                            {active && <Check size={12} className="text-[#FF5500]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </th>

              {/* SECTOR MULTISELECCIÓN */}
              <th className="py-2.5 px-2 text-left relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'sector' ? null : 'sector');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.sector.length > 0
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>Sector / Distrito</span>
                  {colFilters.sector.length > 0 && (
                    <span className="px-1.5 rounded-full bg-[#FF5500] text-white text-[9px]">
                      {colFilters.sector.length}
                    </span>
                  )}
                  <ChevronDown size={12} />
                </div>
                {openHeaderCol === 'sector' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-30 normal-case font-normal max-h-72 overflow-y-auto"
                  >
                    <div
                      onClick={() => setColFilters({ ...colFilters, sector: [] })}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex justify-between text-xs ${colFilters.sector.length === 0 ? 'bg-[#FF5500] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>Todos los sectores</span>
                    </div>
                    {headerOptions.sectores.map(([val, cnt]) => {
                      const active = colFilters.sector.includes(val);
                      return (
                        <div
                          key={val}
                          onClick={() => toggleMultiFilter('sector', val)}
                          className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex items-center justify-between text-xs mt-0.5 ${active ? 'bg-[#FFF0E5] text-[#FF5500] font-bold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span className="truncate pr-2">{val}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] opacity-75">{cnt}</span>
                            {active && <Check size={12} className="text-[#FF5500]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </th>

              {/* PARTNER MULTISELECCIÓN */}
              <th className="py-2.5 px-2 text-left relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'partner' ? null : 'partner');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.partner.length > 0
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>Partner / Cuadrilla</span>
                  {colFilters.partner.length > 0 && (
                    <span className="px-1.5 rounded-full bg-[#FF5500] text-white text-[9px]">
                      {colFilters.partner.length}
                    </span>
                  )}
                  <ChevronDown size={12} />
                </div>
                {openHeaderCol === 'partner' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-30 normal-case font-normal max-h-72 overflow-y-auto"
                  >
                    <div
                      onClick={() => setColFilters({ ...colFilters, partner: [] })}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex justify-between text-xs ${colFilters.partner.length === 0 ? 'bg-[#FF5500] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>Todos los partners</span>
                    </div>
                    {headerOptions.partners.map(([val, cnt]) => {
                      const active = colFilters.partner.includes(val);
                      return (
                        <div
                          key={val}
                          onClick={() => toggleMultiFilter('partner', val)}
                          className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex items-center justify-between text-xs mt-0.5 ${active ? 'bg-[#FFF0E5] text-[#FF5500] font-bold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span className="truncate pr-2">{val}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] opacity-75">{cnt}</span>
                            {active && <Check size={12} className="text-[#FF5500]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </th>

              {/* ESTADO OT MULTISELECCIÓN */}
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'estadoOt' ? null : 'estadoOt');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.estadoOt.length > 0
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>Estado OT</span>
                  {colFilters.estadoOt.length > 0 && (
                    <span className="px-1.5 rounded-full bg-[#FF5500] text-white text-[9px]">
                      {colFilters.estadoOt.length}
                    </span>
                  )}
                  <ChevronDown size={12} />
                </div>
                {openHeaderCol === 'estadoOt' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-30 normal-case font-normal text-left max-h-64 overflow-y-auto"
                  >
                    <div
                      onClick={() => setColFilters({ ...colFilters, estadoOt: [] })}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex justify-between text-xs ${colFilters.estadoOt.length === 0 ? 'bg-[#FF5500] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>Todos</span>
                    </div>
                    {['Iniciada', 'Agendada', 'Finalizada', 'Pendiente', 'En camino', 'Cancelada', 'Anulada'].map((val) => {
                      const active = colFilters.estadoOt.includes(val);
                      return (
                        <div
                          key={val}
                          onClick={() => toggleMultiFilter('estadoOt', val)}
                          className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex items-center justify-between text-xs mt-0.5 ${active ? 'bg-[#FFF0E5] text-[#FF5500] font-bold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span>{val}</span>
                          {active && <Check size={12} className="text-[#FF5500]" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </th>

              {/* WHATSAPP MULTISELECCIÓN */}
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'wsp' ? null : 'wsp');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.wsp.length > 0
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>WhatsApp</span>
                  {colFilters.wsp.length > 0 && (
                    <span className="px-1.5 rounded-full bg-[#FF5500] text-white text-[9px]">
                      {colFilters.wsp.length}
                    </span>
                  )}
                  <ChevronDown size={12} />
                </div>
                {openHeaderCol === 'wsp' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-30 normal-case font-normal text-left"
                  >
                    <div
                      onClick={() => setColFilters({ ...colFilters, wsp: [] })}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex justify-between text-xs ${colFilters.wsp.length === 0 ? 'bg-[#FF5500] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>Todos</span>
                    </div>
                    {['LEÍDO', 'ENTREGADO', 'ENVIADO', 'NO ENVIADO', 'FALLIDO'].map((val) => {
                      const active = colFilters.wsp.includes(val);
                      return (
                        <div
                          key={val}
                          onClick={() => toggleMultiFilter('wsp', val)}
                          className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex items-center justify-between text-xs mt-0.5 ${active ? 'bg-[#FFF0E5] text-[#FF5500] font-bold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span>{val}</span>
                          {active && <Check size={12} className="text-[#FF5500]" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </th>

              {/* TRACKING MULTISELECCIÓN */}
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'tracking' ? null : 'tracking');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition ${colFilters.tracking.length > 0
                    ? 'bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold'
                    : 'hover:bg-slate-100'
                    }`}
                >
                  <span>Tracking</span>
                  {colFilters.tracking.length > 0 && (
                    <span className="px-1.5 rounded-full bg-[#FF5500] text-white text-[9px]">
                      {colFilters.tracking.length}
                    </span>
                  )}
                  <ChevronDown size={12} />
                </div>
                {openHeaderCol === 'tracking' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-30 normal-case font-normal text-left"
                  >
                    <div
                      onClick={() => setColFilters({ ...colFilters, tracking: [] })}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex justify-between text-xs ${colFilters.tracking.length === 0 ? 'bg-[#FF5500] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>Todos</span>
                    </div>
                    {['SÍ INGRESÓ', 'NO'].map((val) => {
                      const active = colFilters.tracking.includes(val);
                      return (
                        <div
                          key={val}
                          onClick={() => toggleMultiFilter('tracking', val)}
                          className={`px-2.5 py-1.5 rounded-xl cursor-pointer flex items-center justify-between text-xs mt-0.5 ${active ? 'bg-[#FFF0E5] text-[#FF5500] font-bold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span>{val}</span>
                          {active && <Check size={12} className="text-[#FF5500]" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {displayedOrders.map((o) => {
              const stOtLower = String(o.estado_ot || '').toLowerCase();
              const otBadge =
                stOtLower.includes('iniciada') || stOtLower.includes('finalizada')
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : stOtLower.includes('agendada')
                    ? 'bg-sky-100 text-sky-800 border-sky-200'
                    : stOtLower.includes('cancel') || stOtLower.includes('anul')
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200';

              const stWspLower = String(o.estado_wsp || '').toLowerCase();
              const wspLabel =
                stWspLower === 'read'
                  ? 'LEÍDO'
                  : stWspLower.includes('deliver')
                    ? 'ENTREGADO'
                    : stWspLower === 'sent'
                      ? 'ENVIADO'
                      : stWspLower === 'failed'
                        ? 'FALLIDO'
                        : 'NO ENVIADO';

              const docCliente = o.numero_documento || '-';
              const codSegui = o.codi_segui_clien || o.codi_clien || '-';
              const nombreCuadrillaCompleto = o.cuadrilla_completa || o.cuadrilla || 'Sin Asignar';

              return (
                <tr
                  key={o.orden_id}
                  onClick={() => {
                    const selection = window.getSelection()?.toString();
                    if (selection && selection.length > 0) return;
                    onSelectOrder(o);
                  }}
                  className="hover:bg-[#FFF0E5]/50 cursor-pointer transition group"
                >
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <div className="font-extrabold text-[#FF5500] group-hover:underline">#{o.orden_id}</div>
                    <div className="text-[10px] text-slate-400">{o.ticket || o.codi_segui_ot || 'Sin ticket'}</div>
                  </td>
                  <td className="py-2.5 px-2 text-left text-slate-600 font-medium whitespace-nowrap">
                    {o.fecha_solicitud_fmt || '-'}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="font-bold text-slate-900 leading-snug">{o.cliente || '-'}</div>
                    <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-x-2 mt-0.5">
                      <span>DNI/Doc: <strong className="text-slate-700">{docCliente}</strong></span>
                      <span>•</span>
                      <span>Cód.Clie: <strong className="text-sky-700">{codSegui}</strong></span>
                      {o.telefono && (
                        <>
                          <span>•</span>
                          <span>Tel: <strong className="text-slate-700">{o.telefono}</strong></span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="text-emerald-700 font-bold text-[11px] uppercase leading-tight">{o.servicio_tipo}</div>
                    <div className="text-[10px] text-slate-400">{o.producto || o.tipo_trabajo || '-'}</div>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="text-slate-800 font-semibold leading-tight">{o.sector_operativo || '-'}</div>
                    <div className="text-[10px] text-slate-400">{o.distrito || '-'}</div>
                  </td>
                  <td className="py-2.5 px-2 min-w-[260px]">
                    <div className="font-bold text-slate-900 leading-tight">{o.partner || o.proveedor_ot || '-'}</div>
                    <div className="text-[10px] text-slate-600 flex items-start gap-1 mt-0.5 whitespace-normal break-words">
                      <User size={11} className="shrink-0 mt-0.5 text-[#FF5500]" />
                      <span>{nombreCuadrillaCompleto}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${otBadge}`}>
                      {o.estado_ot || 'Sin estado'}
                    </span>
                  </td>
                  <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stWspLower === 'read'
                        ? 'bg-emerald-100 text-emerald-800'
                        : stWspLower.includes('deliver')
                          ? 'bg-sky-100 text-sky-800'
                          : stWspLower === 'sent'
                            ? 'bg-blue-100 text-blue-800'
                            : stWspLower === 'failed'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {wspLabel}
                    </span>
                  </td>
                  <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${o.ingreso_tracking === 'SI'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {o.ingreso_tracking === 'SI' ? 'SÍ INGRESÓ' : 'NO'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}