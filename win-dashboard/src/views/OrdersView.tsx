import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Layers, Search, Filter, ChevronDown, User,
  ChevronLeft, ChevronRight, RefreshCw, Globe
} from 'lucide-react';
import { RealOrder } from '../types/dashboard';

interface OrdersViewProps {
  orders: RealOrder[];
  startDate: string;
  endDate: string;
  service: string;
  zone: string;
  onSelectOrder: (order: RealOrder) => void;
}

export function OrdersView({
  orders: initialOrders,
  startDate,
  endDate,
  service,
  zone,
  onSelectOrder,
}: OrdersViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [ignoreDates, setIgnoreDates] = useState<boolean>(false);

  const [page, setPage] = useState<number>(1);
  const pageSize = 50;
  const [totalRecords, setTotalRecords] = useState<number>(initialOrders.length);
  const [totalPages, setTotalPages] = useState<number>(
    Math.max(1, Math.ceil((initialOrders.length || 1) / 50))
  );
  const [serverOrders, setServerOrders] = useState<RealOrder[]>(initialOrders.slice(0, 50));
  const [loadingPage, setLoadingPage] = useState<boolean>(false);

  const [openHeaderCol, setOpenHeaderCol] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' }>({
    col: 'orden',
    dir: 'desc',
  });
  const [colFilters, setColFilters] = useState({
    orden: '',
    fecha: 'Todos',
    cliente: '',
    operacion: 'Todos',
    sector: 'Todos',
    partner: 'Todos',
    estadoOt: 'Todos',
    wsp: 'Todos',
    tracking: 'Todos',
  });

  const activeColFilterCount = useMemo(() => {
    return Object.entries(colFilters).filter(([_, val]) => val !== '' && val !== 'Todos').length;
  }, [colFilters]);

  // Sincronizar lote inicial apenas llega de App.tsx
  useEffect(() => {
    if (
      initialOrders.length > 0 &&
      serverOrders.length === 0 &&
      !debouncedQuery &&
      activeColFilterCount === 0
    ) {
      setServerOrders(initialOrders.slice(0, pageSize));
      setTotalRecords(initialOrders.length);
      setTotalPages(Math.max(1, Math.ceil(initialOrders.length / pageSize)));
    }
  }, [initialOrders, serverOrders.length, debouncedQuery, activeColFilterCount]);

  // Debounce de 350ms para disparar consulta SQL al escribir DNI, teléfono, orden, etc.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reiniciar a página 1 cuando cambian los filtros de columna o fechas
  useEffect(() => {
    setPage(1);
  }, [colFilters, startDate, endDate, service, zone, ignoreDates]);

  const fetchPaginatedOrders = useCallback(() => {
    setLoadingPage(true);
    const params = new URLSearchParams({
      startDate,
      endDate,
      service,
      zone,
      q: debouncedQuery,
      ignoreDates: ignoreDates ? 'true' : 'false',
      orden: colFilters.orden,
      cliente: colFilters.cliente,
      operacion: colFilters.operacion,
      sector: colFilters.sector,
      partner: colFilters.partner,
      estadoOt: colFilters.estadoOt,
      wsp: colFilters.wsp,
      tracking: colFilters.tracking,
      page: String(page),
      pageSize: String(pageSize),
    });

    fetch(`http://localhost:3001/api/orders/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.orders)) {
          setServerOrders(data.orders);
          setTotalRecords(Number(data.total || 0));
          setTotalPages(Number(data.totalPages || 1));
        }
      })
      .catch((err) => console.error('Error buscando órdenes en BD:', err))
      .finally(() => setLoadingPage(false));
  }, [startDate, endDate, service, zone, debouncedQuery, ignoreDates, colFilters, page]);

  useEffect(() => {
    fetchPaginatedOrders();
  }, [fetchPaginatedOrders]);

  const resetAllOrderFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setIgnoreDates(false);
    setColFilters({
      orden: '',
      fecha: 'Todos',
      cliente: '',
      operacion: 'Todos',
      sector: 'Todos',
      partner: 'Todos',
      estadoOt: 'Todos',
      wsp: 'Todos',
      tracking: 'Todos',
    });
    setSortConfig({ col: 'orden', dir: 'desc' });
    setPage(1);
    setOpenHeaderCol(null);
  };

  const headerOptions = useMemo(() => {
    const sourceList = serverOrders.length > 0 ? serverOrders : initialOrders;
    const countMap = (getter: (o: RealOrder) => string) => {
      const m = new Map<string, number>();
      sourceList.forEach((o) => {
        const val = getter(o);
        if (val) m.set(val, (m.get(val) || 0) + 1);
      });
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };

    const getWspLabel = (o: RealOrder) => {
      const st = String(o.estado_wsp || '').toLowerCase().trim();
      if (st === 'read') return 'LEÍDO';
      if (st.includes('deliver')) return 'ENTREGADO';
      if (st === 'sent') return 'ENVIADO';
      if (st === 'failed') return 'FALLIDO';
      return 'NO ENVIADO';
    };

    return {
      fechas: countMap((o) => String(o.fecha_solicitud_fmt || '-').trim()),
      operaciones: countMap((o) => String(o.servicio_tipo || '-').trim().toUpperCase()),
      sectores: countMap((o) => String(o.sector_operativo || 'SIN SECTOR').trim()),
      partners: countMap((o) => String(o.partner || o.proveedor_ot || 'SIN PARTNER').trim()),
      estadosOt: countMap((o) => String(o.estado_ot || 'Sin estado').trim()),
      wsps: countMap(getWspLabel),
      trackings: countMap((o) => (o.ingreso_tracking === 'SI' ? 'SÍ INGRESÓ' : 'NO')),
    };
  }, [serverOrders, initialOrders]);

  const displayedOrders = useMemo(() => {
    return [...serverOrders].sort((a, b) => {
      const dir = sortConfig.dir === 'asc' ? 1 : -1;
      if (sortConfig.col === 'orden') return (Number(a.orden_id) - Number(b.orden_id)) * dir;
      if (sortConfig.col === 'cliente')
        return String(a.cliente || '').localeCompare(String(b.cliente || '')) * dir;
      if (sortConfig.col === 'operacion')
        return String(a.servicio_tipo || '').localeCompare(String(b.servicio_tipo || '')) * dir;
      if (sortConfig.col === 'sector')
        return String(a.sector_operativo || '').localeCompare(String(b.sector_operativo || '')) * dir;
      if (sortConfig.col === 'partner')
        return String(a.partner || '').localeCompare(String(b.partner || '')) * dir;
      if (sortConfig.col === 'estadoOt')
        return String(a.estado_ot || '').localeCompare(String(b.estado_ot || '')) * dir;
      return 0;
    });
  }, [serverOrders, sortConfig]);

  const startIdx = totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(totalRecords, page * pageSize);

  return (
    <div
      className="bg-[#111827]/90 border border-gray-800 rounded-xl p-4 space-y-3"
      onClick={() => setOpenHeaderCol(null)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
        <div>
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Layers size={16} className="text-[#FF6B00]" />
            Explorador Total de Órdenes — Funnel 360°
            <span className="ml-1 px-2.5 py-0.5 text-[11px] rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-bold">
              {totalRecords.toLocaleString('es-PE')} registros encontrados
            </span>
            {loadingPage && (
              <RefreshCw size={13} className="text-[#FF6B00] animate-spin ml-1" />
            )}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Búsqueda directa en Azure MySQL (Mostrando {startIdx}–{endIdx} de {totalRecords.toLocaleString('es-PE')} en páginas de 50)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(activeColFilterCount > 0 || searchQuery || ignoreDates) && (
            <button
              onClick={resetAllOrderFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-semibold transition text-[11px]"
            >
              <span>✕ Limpiar filtros</span>
            </button>
          )}

          <button
            onClick={() => setIgnoreDates(!ignoreDates)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
              ignoreDates
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-[#090D16] text-gray-400 border-gray-700/80 hover:text-gray-200'
            }`}
            title="Actívalo para buscar un DNI, teléfono u orden en cualquier fecha de toda la historia"
          >
            <Globe size={13} />
            <span>{ignoreDates ? 'Buscando en Todo el Histórico' : 'Solo Rango de Fechas'}</span>
          </button>

          <div className="flex items-center bg-[#090D16] border border-gray-700/80 rounded-lg px-3 py-1.5 w-80 focus-within:border-[#FF6B00]">
            <Search size={14} className="text-gray-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Buscar DNI, teléfono, orden, Cód.Clie, CTO, cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-gray-200 focus:outline-none w-full text-xs"
            />
          </div>
        </div>
      </div>

      {/* Controles de Paginación Superior */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#090D16]/70 border border-gray-800/80 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-gray-300">
          <span>
            Página <strong className="text-white">{page}</strong> de{' '}
            <strong className="text-white">{totalPages.toLocaleString('es-PE')}</strong>
          </span>
          <span className="text-gray-600">•</span>
          <span>50 órdenes por página</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1 || loadingPage}
            className="px-2 py-1 rounded bg-[#111827] border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40 text-[11px] font-semibold"
          >
            « Primera
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#111827] border border-gray-700 text-gray-200 hover:bg-[#FF6B00] hover:text-white disabled:opacity-40 text-[11px] font-semibold transition"
          >
            <ChevronLeft size={13} /> Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#111827] border border-gray-700 text-gray-200 hover:bg-[#FF6B00] hover:text-white disabled:opacity-40 text-[11px] font-semibold transition"
          >
            Siguiente <ChevronRight size={13} />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages || loadingPage}
            className="px-2 py-1 rounded bg-[#111827] border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40 text-[11px] font-semibold"
          >
            Última »
          </button>
        </div>
      </div>

      {activeColFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-gray-400 mr-1">Filtros de columna activos:</span>
          {Object.entries(colFilters).map(([key, val]) => {
            if (!val || val === 'Todos') return null;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF6B00]/15 text-amber-300 border border-[#FF6B00]/40 font-semibold"
              >
                <span className="uppercase text-[10px] text-gray-300">{key}:</span>
                <span>{val}</span>
                <button
                  onClick={() =>
                    setColFilters((prev) => ({
                      ...prev,
                      [key]: key === 'orden' || key === 'cliente' ? '' : 'Todos',
                    }))
                  }
                  className="hover:text-white ml-0.5"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto min-h-[420px] max-h-[680px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-[#111827] z-20 shadow-md">
            <tr className="text-gray-300 border-b border-gray-800 text-[10px] uppercase tracking-wider select-none">
              <th className="py-2.5 px-2 text-left whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'orden' ? null : 'orden');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.orden
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>N° Orden / Ticket</span>
                  <Filter size={11} className={colFilters.orden ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'orden' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-60 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-3 z-30 space-y-2.5 normal-case font-normal"
                  >
                    <div className="text-[11px] font-bold text-white">Filtrar N° Orden o Ticket en BD</div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ej: 3575147 o VTEXT..."
                      value={colFilters.orden}
                      onChange={(e) => setColFilters({ ...colFilters, orden: e.target.value })}
                      className="w-full bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FF6B00]"
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
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.cliente
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>Cliente / Doc. / Cód. Seg.</span>
                  <Filter size={11} className={colFilters.cliente ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'cliente' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-64 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-3 z-30 space-y-2.5 normal-case font-normal"
                  >
                    <div className="text-[11px] font-bold text-white">Buscar Cliente, DNI, Cód. o Teléfono en BD</div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nombre, DNI, Cód.Clie o Celular..."
                      value={colFilters.cliente}
                      onChange={(e) => setColFilters({ ...colFilters, cliente: e.target.value })}
                      className="w-full bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FF6B00]"
                    />
                  </div>
                )}
              </th>

              <th className="py-2.5 px-2 text-left relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'operacion' ? null : 'operacion');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.operacion !== 'Todos'
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>Operación / Producto</span>
                  <ChevronDown size={12} className={colFilters.operacion !== 'Todos' ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'operacion' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-56 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-30 normal-case font-normal max-h-64 overflow-y-auto"
                  >
                    <div
                      onClick={() => { setColFilters({ ...colFilters, operacion: 'Todos' }); setOpenHeaderCol(null); }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs ${colFilters.operacion === 'Todos' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <span>Todas las operaciones</span>
                    </div>
                    {headerOptions.operaciones.map(([val, cnt]) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, operacion: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.operacion === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span className="truncate pr-2">{val}</span>
                        <span className="text-[10px] opacity-75">{cnt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </th>

              <th className="py-2.5 px-2 text-left relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'sector' ? null : 'sector');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.sector !== 'Todos'
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>Sector / Distrito</span>
                  <ChevronDown size={12} className={colFilters.sector !== 'Todos' ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'sector' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-60 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-30 normal-case font-normal max-h-72 overflow-y-auto"
                  >
                    <div
                      onClick={() => { setColFilters({ ...colFilters, sector: 'Todos' }); setOpenHeaderCol(null); }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs ${colFilters.sector === 'Todos' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <span>Todos los sectores</span>
                    </div>
                    {headerOptions.sectores.map(([val, cnt]) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, sector: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.sector === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span className="truncate pr-2">{val}</span>
                        <span className="text-[10px] opacity-75">{cnt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </th>

              <th className="py-2.5 px-2 text-left relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'partner' ? null : 'partner');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.partner !== 'Todos'
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>Partner / Cuadrilla</span>
                  <ChevronDown size={12} className={colFilters.partner !== 'Todos' ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'partner' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-60 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-30 normal-case font-normal max-h-72 overflow-y-auto"
                  >
                    <div
                      onClick={() => { setColFilters({ ...colFilters, partner: 'Todos' }); setOpenHeaderCol(null); }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs ${colFilters.partner === 'Todos' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <span>Todos los partners</span>
                    </div>
                    {headerOptions.partners.map(([val, cnt]) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, partner: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.partner === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span className="truncate pr-2">{val}</span>
                        <span className="text-[10px] opacity-75">{cnt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </th>

              <th className="py-2.5 px-1.5 text-center whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'estadoOt' ? null : 'estadoOt');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.estadoOt !== 'Todos'
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>Estado OT</span>
                  <ChevronDown size={12} className={colFilters.estadoOt !== 'Todos' ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'estadoOt' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-1.5 w-48 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-30 normal-case font-normal text-left max-h-64 overflow-y-auto"
                  >
                    {['Todos', 'Iniciada', 'Agendada', 'Finalizada', 'Pendiente', 'En camino', 'Cancelada', 'Anulada'].map((val) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, estadoOt: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.estadoOt === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </th>

              <th className="py-2.5 px-1.5 text-center whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'wsp' ? null : 'wsp');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.wsp !== 'Todos'
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>WhatsApp</span>
                  <ChevronDown size={12} className={colFilters.wsp !== 'Todos' ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'wsp' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-1.5 w-48 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-30 normal-case font-normal text-left"
                  >
                    {['Todos', 'LEÍDO', 'ENTREGADO', 'ENVIADO', 'NO ENVIADO', 'FALLIDO'].map((val) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, wsp: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.wsp === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </th>

              <th className="py-2.5 px-1.5 text-center whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'tracking' ? null : 'tracking');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.tracking !== 'Todos'
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>Tracking</span>
                  <ChevronDown size={12} className={colFilters.tracking !== 'Todos' ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'tracking' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-1.5 w-44 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-30 normal-case font-normal text-left"
                  >
                    {['Todos', 'SÍ INGRESÓ', 'NO'].map((val) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, tracking: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.tracking === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </th>

              <th className="py-2.5 px-2 text-right whitespace-nowrap">Detalle</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-800/60">
            {displayedOrders.map((o) => {
              const stOtLower = String(o.estado_ot || '').toLowerCase();
              const otBadge =
                stOtLower.includes('iniciada') || stOtLower.includes('finalizada')
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : stOtLower.includes('agendada')
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : stOtLower.includes('cancel') || stOtLower.includes('anul')
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

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
                  onClick={() => onSelectOrder(o)}
                  className="hover:bg-[#FF6B00]/10 cursor-pointer transition group"
                >
                  <td className="py-2 px-2 whitespace-nowrap">
                    <div className="font-extrabold text-[#FF6B00] group-hover:underline">#{o.orden_id}</div>
                    <div className="text-[10px] text-gray-400">{o.ticket || o.codi_segui_ot || 'Sin ticket'}</div>
                  </td>
                  <td className="py-2 px-2 text-left text-gray-300 font-medium whitespace-nowrap">
                    {o.fecha_solicitud_fmt || '-'}
                  </td>
                  <td className="py-2 px-2">
                    <div className="font-bold text-white leading-snug">{o.cliente || '-'}</div>
                    <div className="text-[10px] text-gray-400 flex flex-wrap items-center gap-x-2 mt-0.5">
                      <span>DNI/Doc: <strong className="text-gray-200">{docCliente}</strong></span>
                      <span>•</span>
                      <span>Cód.Clie: <strong className="text-cyan-300">{codSegui}</strong></span>
                      {o.telefono && (
                        <>
                          <span>•</span>
                          <span>Tel: <strong className="text-gray-300">{o.telefono}</strong></span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <div className="text-emerald-300 font-bold text-[11px] uppercase leading-tight">{o.servicio_tipo}</div>
                    <div className="text-[10px] text-gray-400">{o.producto || o.tipo_trabajo || '-'}</div>
                  </td>
                  <td className="py-2 px-2">
                    <div className="text-gray-200 font-medium leading-tight">{o.sector_operativo || '-'}</div>
                    <div className="text-[10px] text-gray-400">{o.distrito || '-'}</div>
                  </td>
                  <td className="py-2 px-2 min-w-[260px]">
                    <div className="font-semibold text-white leading-tight">{o.partner || o.proveedor_ot || '-'}</div>
                    <div className="text-[10px] text-gray-300 flex items-start gap-1 mt-0.5 whitespace-normal break-words">
                      <User size={11} className="shrink-0 mt-0.5 text-[#FF6B00]" />
                      <span>{nombreCuadrillaCompleto}</span>
                    </div>
                  </td>
                  <td className="py-2 px-1.5 text-center whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${otBadge}`}>
                      {o.estado_ot || 'Sin estado'}
                    </span>
                  </td>
                  <td className="py-2 px-1.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        stWspLower === 'read'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : stWspLower.includes('deliver')
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : stWspLower === 'sent'
                          ? 'bg-blue-500/20 text-blue-300'
                          : stWspLower === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {wspLabel}
                    </span>
                  </td>
                  <td className="py-2 px-1.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        o.ingreso_tracking === 'SI'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-gray-800/60 text-gray-500'
                      }`}
                    >
                      {o.ingreso_tracking === 'SI' ? 'SÍ INGRESÓ' : 'NO'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onSelectOrder(o)}
                      className="px-2.5 py-1 bg-[#1F2937] hover:bg-[#FF6B00] text-gray-200 hover:text-white rounded text-[11px] font-semibold transition"
                    >
                      Ver detalle
                    </button>
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