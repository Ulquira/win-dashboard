import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, LifeBuoy, Send, CalendarClock, Truck,
  CheckCircle, Clock, Users, ArrowUpRight, Activity,
  ClipboardList, MessageSquare, Wrench, RefreshCw, Sparkles
} from 'lucide-react';
import {
  AuthUser, CalculatedMetrics, KpiData, NavSection,
  OperationsKpis, RealOrder, ViewMode
} from '../types/dashboard';
import { apiFetch } from '../config/api';

interface HomeViewProps {
  authUser: AuthUser;
  calc: CalculatedMetrics;
  kpis?: KpiData | null;
  startDate: string;
  endDate: string;
  service: string;
  serviceOptions?: string[];
  canSeeView: (v: NavSection) => boolean;
  canSeeSubview: (sv: ViewMode) => boolean;
  onNavigate: (nav: NavSection, subview?: ViewMode) => void;
  onSelectOrder: (order: RealOrder) => void;
}

export function HomeView({
  authUser,
  calc,
  startDate,
  endDate,
  service,
  canSeeView,
  canSeeSubview,
  onNavigate,
  onSelectOrder,
}: HomeViewProps) {
  const [quickQuery, setQuickQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [quickResults, setQuickResults] = useState<RealOrder[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Pulso de Operaciones de Campo (reutiliza caché de /api/operations)
  const { data: opsData } = useQuery<any>({
    queryKey: ['operationsDashboard', startDate, endDate, service, '', false, 0],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: '',
        ignoreDates: 'false',
        refresh: 'false',
      });
      return apiFetch(`/api/operations?${params.toString()}`, { signal });
    },
  });

  const opsKpis: OperationsKpis | null = opsData?.kpis || null;
  const topPartners: any[] = (opsData?.byPartner || []).slice(0, 4);

  const handleQuickLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickQuery.trim();
    if (!q) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({
        q,
        service,
        ignoreDates: 'true',
        page: '1',
        pageSize: '10',
      });
      const res: any = await apiFetch(`/api/orders/search?${params.toString()}`);
      const list: RealOrder[] = res?.orders || [];
      setQuickResults(list);
      if (list.length === 1) {
        onSelectOrder(list[0]);
      }
    } catch {
      setQuickResults([]);
    } finally {
      setSearching(false);
    }
  };

  const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');
  const fmtDec = (n?: number) => Number(n || 0).toFixed(1).replace('.', ',');

  return (
    <div className="space-y-6">
      {/* 1. HERO CENTRO DE MANDO + BUSCADOR INSTANTÁNEO DE OT */}
      <div className="relative overflow-hidden rounded-2xl bg-[#090D16] text-white p-6 sm:p-8 shadow-lg border border-slate-800">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#FF5500]/20 rounded-full blur-[110px] pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-80 h-80 bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF5500]/15 border border-[#FF5500]/30 text-[#FF5500] text-[11px] font-extrabold uppercase tracking-wider">
              <Sparkles size={12} />
              <span>Centro de Control Operativo</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Hola, {authUser.nombre.split(' ')[0]}
            </h2>
          </div>

          {/* Buscador directo de Orden / DNI / Ticket */}
          <div className="lg:col-span-5">
            <form
              onSubmit={handleQuickLookup}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md space-y-3"
            >
              <div className="flex items-center text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Search size={14} className="text-[#FF5500]" />
                  Inspección Rápida de Orden
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickQuery}
                  onChange={(e) => setQuickQuery(e.target.value)}
                  placeholder="N° Orden, Ticket, DNI o Celular..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FF5500]"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 h-10 rounded-xl bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {searching ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                  <span>Buscar</span>
                </button>
              </div>

              {hasSearched && (
                <div className="max-h-44 overflow-y-auto divide-y divide-white/10 rounded-xl bg-slate-900/90 border border-white/10">
                  {quickResults.length > 0 ? (
                    quickResults.map((ord) => (
                      <button
                        key={ord.orden_id}
                        type="button"
                        onClick={() => onSelectOrder(ord)}
                        className="w-full px-3 py-2 text-left hover:bg-white/5 transition flex items-center justify-between gap-2 text-xs cursor-pointer"
                      >
                        <div className="truncate">
                          <span className="font-extrabold text-[#FF5500]">#{ord.orden_id}</span>{' '}
                          <span className="text-white font-semibold">{ord.cliente}</span>
                          <div className="text-[10px] text-slate-400">
                            {ord.servicio_tipo} • {ord.sector_operativo || ord.distrito}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-slate-200 shrink-0">
                          {ord.estado_ot || 'Ver'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="py-3 text-center text-[11px] text-slate-400">
                      No se encontraron órdenes para "{quickQuery}"
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* 2. SEMÁFORO DE ATENCIÓN INMEDIATA (TARJETAS INTERACTIVAS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Alerta 1: SOS Soporte */}
        <button
          type="button"
          onClick={() => canSeeView('Seguimiento') && onNavigate('Seguimiento')}
          className="text-left bg-white border border-rose-100 hover:border-rose-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <LifeBuoy size={18} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 group-hover:translate-x-0.5 transition">
              Atender <ArrowUpRight size={13} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{calc.sosCount}</div>
            <div className="text-xs font-bold text-slate-700 mt-0.5">Alertas SOS (Soporte)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {calc.sosOverTrackPct}% de clientes en tracking
            </div>
          </div>
        </button>

        {/* Alerta 2: Sin Envío WhatsApp */}
        <button
          type="button"
          onClick={() => canSeeView('Órdenes') && onNavigate('Órdenes')}
          className="text-left bg-white border border-amber-100 hover:border-amber-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <Send size={18} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 group-hover:translate-x-0.5 transition">
              Revisar OTs <ArrowUpRight size={13} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{calc.noEnviado}</div>
            <div className="text-xs font-bold text-slate-700 mt-0.5">Órdenes sin Envío WSP</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {calc.noEnviadoPct}% sobre el total ({calc.ordenes})
            </div>
          </div>
        </button>

        {/* Alerta 3: Autogestión Digital */}
        <button
          type="button"
          onClick={() => canSeeView('Dashboard') && onNavigate('Dashboard', 'ejecutiva')}
          className="text-left bg-white border border-sky-100 hover:border-sky-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-600">
              <Activity size={18} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 group-hover:translate-x-0.5 transition">
              Ver Embudo <ArrowUpRight size={13} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {calc.autogestionCount}
            </div>
            <div className="text-xs font-bold text-slate-700 mt-0.5">Autogestionados Web</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {calc.autogestionPct}% sin requerir soporte
            </div>
          </div>
        </button>

        {/* Alerta 4: Reprogramaciones y CSAT */}
        <button
          type="button"
          onClick={() => canSeeView('Dashboard') && onNavigate('Dashboard', 'operativa')}
          className="text-left bg-white border border-emerald-100 hover:border-emerald-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <CalendarClock size={18} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 group-hover:translate-x-0.5 transition">
              Detalle <ArrowUpRight size={13} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{calc.reprog}</div>
            <div className="text-xs font-bold text-slate-700 mt-0.5">Reprogramaciones</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {calc.csatCount} encuestas CSAT recibidas
            </div>
          </div>
        </button>
      </div>

      {/* 3. PULSO EN CAMPO VS DIGITAL + ACCESOS RÁPIDOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pulso de Ejecución en Campo (vw_winordetraba) */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Wrench size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Pulso de Ejecución en Campo</h3>
            </div>
            {canSeeSubview('operaciones') && (
              <button
                type="button"
                onClick={() => onNavigate('Dashboard', 'operaciones')}
                className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Abrir Operaciones Campo <ArrowUpRight size={13} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-bold">
                <CheckCircle size={13} /> Finalizadas
              </div>
              <div className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {fmt(opsKpis?.finalizadas)}
              </div>
              <div className="text-[10px] font-bold text-emerald-700">
                {fmtDec(opsKpis?.efectividad_pct)}% efectividad
              </div>
            </div>

            <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-sky-700 text-[11px] font-bold">
                <Truck size={13} /> En Ruta
              </div>
              <div className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {fmt(opsKpis?.en_curso)}
              </div>
              <div className="text-[10px] text-slate-500">Iniciadas hoy</div>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-amber-700 text-[11px] font-bold">
                <Clock size={13} /> Agendadas
              </div>
              <div className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {fmt(opsKpis?.agendadas)}
              </div>
              <div className="text-[10px] text-slate-500">Pendientes</div>
            </div>

            <div className="bg-orange-50/60 border border-orange-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[#FF5500] text-[11px] font-bold">
                <Users size={13} /> Cuadrillas
              </div>
              <div className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {fmt(opsKpis?.cuadrillas_activas)}
              </div>
              <div className="text-[10px] font-bold text-[#FF5500]">
                {fmtDec(opsKpis?.prod_fin_por_cuadrilla)} fin/cuad
              </div>
            </div>
          </div>

          {/* Top 4 Contratas en Vivo */}
          <div className="pt-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Principales Contratas en el Rango
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {topPartners.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{p.partner}</div>
                    <div className="text-[10px] text-slate-400">
                      {fmt(p.cuadrillas)} cuad. • {fmt(p.total)} OTs
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      {fmtDec(p.efectividad_pct)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Módulos de Acceso Directo según Permisos RBAC */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Módulos Habilitados</h3>
          </div>

          <div className="space-y-2.5 my-auto">
            {canSeeView('Dashboard') && canSeeSubview('ejecutiva') && (
              <button
                type="button"
                onClick={() => onNavigate('Dashboard', 'ejecutiva')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-[#FFF0E5]/60 border border-slate-100 hover:border-orange-200 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white text-[#FF5500] shadow-2xs">
                    <Activity size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Vista Ejecutiva</div>
                    <div className="text-[11px] text-slate-500">Embudo WhatsApp, segmentos y CSAT</div>
                  </div>
                </div>
                <ArrowUpRight size={15} className="text-slate-400" />
              </button>
            )}

            {canSeeView('Dashboard') && canSeeSubview('operaciones') && (
              <button
                type="button"
                onClick={() => onNavigate('Dashboard', 'operaciones')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-[#FFF0E5]/60 border border-slate-100 hover:border-orange-200 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white text-[#FF5500] shadow-2xs">
                    <Wrench size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Operaciones de Campo</div>
                    <div className="text-[11px] text-slate-500">Productividad de cuadrillas y contratas</div>
                  </div>
                </div>
                <ArrowUpRight size={15} className="text-slate-400" />
              </button>
            )}

            {canSeeView('Órdenes') && (
              <button
                type="button"
                onClick={() => onNavigate('Órdenes')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-[#FFF0E5]/60 border border-slate-100 hover:border-orange-200 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white text-[#FF5500] shadow-2xs">
                    <ClipboardList size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Bandeja de Órdenes 360</div>
                    <div className="text-[11px] text-slate-500">Auditoría técnica y mapa georreferenciado</div>
                  </div>
                </div>
                <ArrowUpRight size={15} className="text-slate-400" />
              </button>
            )}

            {canSeeView('Seguimiento') && (
              <button
                type="button"
                onClick={() => onNavigate('Seguimiento')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-[#FFF0E5]/60 border border-slate-100 hover:border-orange-200 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white text-[#FF5500] shadow-2xs">
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Seguimiento & Chats SOS</div>
                    <div className="text-[11px] text-slate-500">Conversaciones Mantra Live y logs de bot</div>
                  </div>
                </div>
                <ArrowUpRight size={15} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}