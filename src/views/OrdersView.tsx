import React, { useState, useMemo } from 'react';
import { Layers, Search, Filter, ChevronDown, User } from 'lucide-react';
import { RealOrder } from '../types/dashboard';

interface OrdersViewProps {
  orders: RealOrder[];
  onSelectOrder: (order: RealOrder) => void;
}

export function OrdersView({ orders, onSelectOrder }: OrdersViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
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

  const resetAllOrderFilters = () => {
    setSearchQuery('');
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
    setOpenHeaderCol(null);
  };

  const headerOptions = useMemo(() => {
    const countMap = (getter: (o: RealOrder) => string) => {
      const m = new Map<string, number>();
      orders.forEach((o) => {
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
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const qOrd = colFilters.orden.toLowerCase().trim();
    const qCli = colFilters.cliente.toLowerCase().trim();

    const list = orders.filter((o) => {
      const stWspLower = String(o.estado_wsp || '').toLowerCase().trim();
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

      const trkLabel = o.ingreso_tracking === 'SI' ? 'SÍ INGRESÓ' : 'NO';
      const partnerVal = String(o.partner || o.proveedor_ot || 'SIN PARTNER').trim();
      const sectorVal = String(o.sector_operativo || 'SIN SECTOR').trim();
      const opVal = String(o.servicio_tipo || '-').trim().toUpperCase();
      const otVal = String(o.estado_ot || 'Sin estado').trim();
      const fechaVal = String(o.fecha_solicitud_fmt || '-').trim();

      if (colFilters.fecha !== 'Todos' && fechaVal !== colFilters.fecha) return false;
      if (colFilters.operacion !== 'Todos' && opVal !== colFilters.operacion) return false;
      if (colFilters.sector !== 'Todos' && sectorVal !== colFilters.sector) return false;
      if (
        colFilters.partner !== 'Todos' &&
        partnerVal !== colFilters.partner &&
        !String(o.cuadrilla_completa || o.cuadrilla || '')
          .toLowerCase()
          .includes(colFilters.partner.toLowerCase())
      ) {
        return false;
      }
      if (colFilters.estadoOt !== 'Todos' && otVal !== colFilters.estadoOt) return false;
      if (colFilters.wsp !== 'Todos' && wspLabel !== colFilters.wsp) return false;
      if (colFilters.tracking !== 'Todos' && trkLabel !== colFilters.tracking) return false;

      if (qOrd) {
        const matchOrd =
          String(o.orden_id || '').toLowerCase().includes(qOrd) ||
          String(o.ticket || '').toLowerCase().includes(qOrd) ||
          String(o.codi_segui_ot || '').toLowerCase().includes(qOrd);
        if (!matchOrd) return false;
      }

      if (qCli) {
        const matchCli =
          String(o.cliente || '').toLowerCase().includes(qCli) ||
          String(o.numero_documento || '').toLowerCase().includes(qCli) ||
          String(o.codi_segui_clien || '').toLowerCase().includes(qCli) ||
          String(o.codi_clien || '').toLowerCase().includes(qCli) ||
          String(o.telefono || '').toLowerCase().includes(qCli);
        if (!matchCli) return false;
      }

      if (q) {
        const matchGlobal =
          String(o.orden_id || '').toLowerCase().includes(q) ||
          String(o.ticket || '').toLowerCase().includes(q) ||
          String(o.codi_segui_ot || '').toLowerCase().includes(q) ||
          String(o.codi_segui_clien || '').toLowerCase().includes(q) ||
          String(o.codi_clien || '').toLowerCase().includes(q) ||
          String(o.numero_documento || '').toLowerCase().includes(q) ||
          String(o.cliente || '').toLowerCase().includes(q) ||
          String(o.telefono || '').toLowerCase().includes(q) ||
          String(o.distrito || '').toLowerCase().includes(q) ||
          String(o.sector_operativo || '').toLowerCase().includes(q) ||
          String(o.cuadrilla_completa || o.cuadrilla || '').toLowerCase().includes(q) ||
          String(o.partner || o.proveedor_ot || '').toLowerCase().includes(q) ||
          String(o.datos_tecnicos || '').toLowerCase().includes(q);
        if (!matchGlobal) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
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
  }, [orders, searchQuery, colFilters, sortConfig]);

  return (
    <div
      className="bg-[#111827]/90 border border-gray-800 rounded-xl p-4 space-y-3"
      onClick={() => setOpenHeaderCol(null)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
        <div>
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Layers size={16} className="text-[#FF6B00]" />
            Explorador de Órdenes — Funnel 360°
            <span className="ml-1 px-2 py-0.5 text-[11px] rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-bold">
              {filteredOrders.length} de {orders.length} registros
            </span>
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Haz clic en cualquier <strong>cabecera de columna</strong> para filtrar u ordenar, o en una fila para abrir el detalle 360°
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(activeColFilterCount > 0 || searchQuery) && (
            <button
              onClick={resetAllOrderFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-semibold transition text-[11px]"
            >
              <span>✕ Limpiar filtros ({activeColFilterCount + (searchQuery ? 1 : 0)})</span>
            </button>
          )}

          <div className="flex items-center bg-[#090D16] border border-gray-700/80 rounded-lg px-3 py-1.5 w-80 focus-within:border-[#FF6B00]">
            <Search size={14} className="text-gray-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Búsqueda rápida global (Orden, DNI, Cód, CTO, Cuadrilla)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-gray-200 focus:outline-none w-full text-xs"
            />
          </div>
        </div>
      </div>

      {activeColFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-gray-400 mr-1">Filtros activos:</span>
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

      <div className="overflow-x-auto min-h-[420px] max-h-[720px]">
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
                    <div className="text-[11px] font-bold text-white">Filtrar N° Orden o Ticket</div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ej: 3575147 o VTEXT..."
                      value={colFilters.orden}
                      onChange={(e) => setColFilters({ ...colFilters, orden: e.target.value })}
                      className="w-full bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FF6B00]"
                    />
                    <div className="flex items-center justify-between pt-1 border-t border-gray-800 text-[11px]">
                      <button
                        onClick={() => setSortConfig({ col: 'orden', dir: 'desc' })}
                        className={`px-2 py-1 rounded ${sortConfig.col === 'orden' && sortConfig.dir === 'desc' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                      >
                        Mayor a menor ↓
                      </button>
                      <button
                        onClick={() => setSortConfig({ col: 'orden', dir: 'asc' })}
                        className={`px-2 py-1 rounded ${sortConfig.col === 'orden' && sortConfig.dir === 'asc' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                      >
                        Menor a mayor ↑
                      </button>
                    </div>
                  </div>
                )}
              </th>

              <th className="py-2.5 px-2 text-left whitespace-nowrap relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenHeaderCol(openHeaderCol === 'fecha' ? null : 'fecha');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    colFilters.fecha !== 'Todos'
                      ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold'
                      : 'hover:bg-gray-800/80'
                  }`}
                >
                  <span>Fecha</span>
                  <ChevronDown size={12} className={colFilters.fecha !== 'Todos' ? 'text-[#FF6B00]' : 'text-gray-500'} />
                </div>
                {openHeaderCol === 'fecha' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-1.5 w-48 bg-[#0B101B] border border-gray-700 rounded-xl shadow-2xl p-2 z-30 normal-case font-normal max-h-64 overflow-y-auto"
                  >
                    <div
                      onClick={() => { setColFilters({ ...colFilters, fecha: 'Todos' }); setOpenHeaderCol(null); }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs ${colFilters.fecha === 'Todos' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <span>Todas las fechas</span>
                      <span>{orders.length}</span>
                    </div>
                    {headerOptions.fechas.map(([val, cnt]) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, fecha: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.fecha === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span>{val}</span>
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
                    <div className="text-[11px] font-bold text-white">Buscar Cliente, DNI, Cód. o Teléfono</div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nombre, DNI, Cód.Clie o Celular..."
                      value={colFilters.cliente}
                      onChange={(e) => setColFilters({ ...colFilters, cliente: e.target.value })}
                      className="w-full bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FF6B00]"
                    />
                    <div className="flex items-center justify-between pt-1 border-t border-gray-800 text-[11px]">
                      <button
                        onClick={() => setSortConfig({ col: 'cliente', dir: 'asc' })}
                        className={`px-2 py-1 rounded ${sortConfig.col === 'cliente' && sortConfig.dir === 'asc' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                      >
                        Ordenar A → Z
                      </button>
                      <button
                        onClick={() => setSortConfig({ col: 'cliente', dir: 'desc' })}
                        className={`px-2 py-1 rounded ${sortConfig.col === 'cliente' && sortConfig.dir === 'desc' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                      >
                        Ordenar Z → A
                      </button>
                    </div>
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
                      <span>{orders.length}</span>
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
                      <span>{orders.length}</span>
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
                      <span>{orders.length}</span>
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
                    <div
                      onClick={() => { setColFilters({ ...colFilters, estadoOt: 'Todos' }); setOpenHeaderCol(null); }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs ${colFilters.estadoOt === 'Todos' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <span>Todos</span>
                      <span>{orders.length}</span>
                    </div>
                    {headerOptions.estadosOt.map(([val, cnt]) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, estadoOt: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.estadoOt === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span>{val}</span>
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
                    <div
                      onClick={() => { setColFilters({ ...colFilters, wsp: 'Todos' }); setOpenHeaderCol(null); }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs ${colFilters.wsp === 'Todos' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <span>Todos</span>
                      <span>{orders.length}</span>
                    </div>
                    {headerOptions.wsps.map(([val, cnt]) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, wsp: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.wsp === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span>{val}</span>
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
                    <div
                      onClick={() => { setColFilters({ ...colFilters, tracking: 'Todos' }); setOpenHeaderCol(null); }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs ${colFilters.tracking === 'Todos' ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <span>Todos</span>
                      <span>{orders.length}</span>
                    </div>
                    {headerOptions.trackings.map(([val, cnt]) => (
                      <div
                        key={val}
                        onClick={() => { setColFilters({ ...colFilters, tracking: val }); setOpenHeaderCol(null); }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex justify-between text-xs mt-0.5 ${colFilters.tracking === val ? 'bg-[#FF6B00] text-white font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <span>{val}</span>
                        <span className="text-[10px] opacity-75">{cnt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </th>

              <th className="py-2.5 px-2 text-right whitespace-nowrap">Detalle</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-800/60">
            {filteredOrders.map((o) => {
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