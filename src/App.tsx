import React, { useState, useMemo, useEffect } from 'react';
import {
  Home, BarChart2, Layers, CheckCircle, Activity, Smile, FileText,
  Calendar, ChevronDown, ClipboardList, Send, CheckCheck,
  MapPin, CalendarClock, MessageSquare, TrendingUp,
  Filter, Info, Settings, Laptop, Clock, Crown, Gem, Award, AlertTriangle, Target,
  Search, User, ExternalLink, Database, RefreshCw
} from 'lucide-react';

type ViewMode = 'ejecutiva' | 'operativa';
type NavSection = 'Inicio' | 'Dashboard' | 'Órdenes' | 'Seguimiento' | 'Eficiencia' | 'Experiencia (CSAT)';

interface KpiData {
  total_ordenes: number;
  whs_enviados: number;
  whs_leidos: number;
  whs_sent: number;
  whs_delivered: number;
  whs_failed: number;
  whs_no_enviado: number;
  ingreso_tracking: number;
  reprogramaciones: number;
  encuestas_respondidas: number;
  csat_avg?: number;
  leidos_sin_ingreso: number;
  av_total: number;
  av_enviados: number;
  av_leidos: number;
  av_tracking: number;
  pref_total: number;
  pref_enviados: number;
  pref_leidos: number;
  pref_tracking: number;
}

interface EvolutionPoint {
  fecha: string;
  total: number;
  enviados: number;
  leidos: number;
  tracking: number;
}

interface RealOrder {
  orden_id: number;
  ticket: string;
  cliente: string;
  telefono: string;
  producto: string;
  servicio_tipo: string;
  tipo_trabajo: string;
  estado_ot: string;
  fecha_solicitud_fmt: string;
  sector_operativo: string;
  distrito: string;
  partner: string;
  cuadrilla: string;
  se_envio_wsp: string;
  estado_wsp: string;
  ingreso_tracking: string;
  link_tracking: string;
  reprogramo?: string;
  respondio_encuesta?: string;
  [key: string]: any;
}

interface PartnerRankItem {
  rank: number;
  name: string;
  surveys: number;
  score: string;
  csat: string;
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('Dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('ejecutiva');
  const [dashOpen, setDashOpen] = useState<boolean>(true);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [service, setService] = useState<string>('Todos los servicios');
  const [zone, setZone] = useState<string>('Todas las zonas');

  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [zoneOptions, setZoneOptions] = useState<string[]>([]);

  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [evolution, setEvolution] = useState<EvolutionPoint[]>([]);
  const [dailyInRange, setDailyInRange] = useState<any[]>([]);
  const [byEstadoOt, setByEstadoOt] = useState<any[]>([]);
  const [bySector, setBySector] = useState<any[]>([]);
  const [byTipoOperacion, setByTipoOperacion] = useState<any[]>([]);
  const [orders, setOrders] = useState<RealOrder[]>([]);
  const [partners, setPartners] = useState<PartnerRankItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dbOnline, setDbOnline] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [otStatusFilter, setOtStatusFilter] = useState<string>('Todos');
  const [trackingFilter, setTrackingFilter] = useState<string>('Todos');
  const [selectedOrder, setSelectedOrder] = useState<RealOrder | null>(null);

  const fetchDashboardData = (
    sDate = startDate,
    eDate = endDate,
    srv = service,
    zn = zone,
    forceRefresh = false
  ) => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams({
      startDate: sDate,
      endDate: eDate,
      service: srv,
      zone: zn,
      refresh: forceRefresh ? 'true' : 'false',
    });

    fetch(`http://localhost:3001/api/dashboard?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setKpis(data.kpis);
          setEvolution(data.evolution || []);
          setDailyInRange(data.dailyInRange || []);
          setByEstadoOt(data.byEstadoOt || []);
          setBySector(data.bySector || []);
          setByTipoOperacion(data.byTipoOperacion || []);
          setOrders(data.orders || []);
          setPartners(data.partners || []);
          setDbOnline(true);
        } else {
          setDbOnline(false);
          setErrorMsg(data.error || 'Error desconocido en la consulta');
        }
      })
      .catch((err) => {
        setDbOnline(false);
        setErrorMsg(`No se pudo conectar a localhost:3001 (${err.message})`);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();

    fetch('http://localhost:3001/api/filters')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setServiceOptions(data.servicios || []);
          setZoneOptions(data.zonas || []);
        }
      })
      .catch((err) => console.error('Error cargando filtros:', err));
  }, []);

  const calc = useMemo(() => {
    const total = Number(kpis?.total_ordenes || 0);
    const enviados = Number(kpis?.whs_enviados || 0);
    const leidos = Number(kpis?.whs_leidos || 0);
    const sent = Number(kpis?.whs_sent || 0);
    const delivered = Number(kpis?.whs_delivered || 0);
    const failed = Number(kpis?.whs_failed || 0);
    const noEnviado = Number(kpis?.whs_no_enviado || 0);
    const tracking = Number(kpis?.ingreso_tracking || 0);
    const reprog = Number(kpis?.reprogramaciones || 0);
    const encuestas = Number(kpis?.encuestas_respondidas || 0);
    const leidosSinIngreso = Number(kpis?.leidos_sin_ingreso || 0);

    const avTotal = Number(kpis?.av_total || 0);
    const avEnviados = Number(kpis?.av_enviados || 0);
    const avLeidos = Number(kpis?.av_leidos || 0);
    const avTracking = Number(kpis?.av_tracking || 0);

    const prefTotal = Number(kpis?.pref_total || 0);
    const prefEnviados = Number(kpis?.pref_enviados || 0);
    const prefLeidos = Number(kpis?.pref_leidos || 0);
    const prefTracking = Number(kpis?.pref_tracking || 0);

    const fmt = (n: number) => n.toLocaleString('es-PE');
    const pct = (num: number, den: number) =>
      den > 0 ? ((num / den) * 100).toFixed(1).replace('.', ',') : '0,0';

    const avPctNum = avEnviados > 0 ? (avTracking / avEnviados) * 100 : 0;
    const prefPctNum = prefEnviados > 0 ? (prefTracking / prefEnviados) * 100 : 0;

    return {
      ordenes: fmt(total),
      whsEnviados: fmt(enviados),
      whsPct: pct(enviados, total),
      leidos: fmt(leidos),
      readPct: pct(leidos, enviados),
      tracking: fmt(tracking),
      trackPct: pct(tracking, enviados),
      trackOverReadPct: pct(tracking, leidos),
      reprog: fmt(reprog),
      csatCount: fmt(encuestas),
      sent: fmt(sent),
      sentPct: pct(sent, enviados),
      delivered: fmt(delivered),
      deliveredPct: pct(delivered, enviados),
      failed: fmt(failed),
      failedPct: pct(failed, total),
      noEnviado: fmt(noEnviado),
      noEnviadoPct: pct(noEnviado, total),
      leidosSinIngreso: fmt(leidosSinIngreso),
      leidosSinIngresoPct: pct(leidosSinIngreso, enviados),
      avTotalFmt: fmt(avTotal),
      avEnviadosFmt: fmt(avEnviados),
      avTrackingFmt: fmt(avTracking),
      avPct: pct(avTracking, avEnviados),
      avOverReadPct: pct(avTracking, avLeidos),
      avBarWidth: avTracking > 0 ? Math.min(100, Math.max(8, Math.round(avPctNum * 2.2))) : 0,
      prefTotalFmt: fmt(prefTotal),
      prefEnviadosFmt: fmt(prefEnviados),
      prefTrackingFmt: fmt(prefTracking),
      prefPct: pct(prefTracking, prefEnviados),
      prefOverReadPct: pct(prefTracking, prefLeidos),
      prefBarWidth: prefTracking > 0 ? Math.min(100, Math.max(8, Math.round(prefPctNum * 2.2))) : 0,
    };
  }, [kpis]);

  const chartPolylines = useMemo(() => {
    if (!evolution || evolution.length === 0) {
      return {
        whs: '20,130 380,130',
        lectura: '20,130 380,130',
        tracking: '20,130 380,130',
        trackingLeidos: '20,130 380,130',
        points: [] as {
          x: number;
          fecha: string;
          yWhs: number;
          yLec: number;
          yTrkLei: number;
          yTrk: number;
          vWhs: string;
          vLec: string;
          vTrkLei: string;
          vTrk: string;
        }[],
      };
    }

    const maxIdx = Math.max(1, evolution.length - 1);
    const toY = (pctVal: number) => {
      const clamped = Math.max(0, Math.min(100, pctVal));
      return Math.round(130 - (clamped / 100) * 115);
    };
    const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

    const whsPts: string[] = [];
    const lecPts: string[] = [];
    const trkPts: string[] = [];
    const trkLeiPts: string[] = [];

    const points = evolution.map((pt, idx) => {
      const x = evolution.length === 1 ? 200 : Math.round(22 + (idx / maxIdx) * 356);
      const tot = Number(pt.total || 0);
      const env = Number(pt.enviados || 0);
      const lei = Number(pt.leidos || 0);
      const trk = Number(pt.tracking || 0);

      const pWhs = tot > 0 ? (env / tot) * 100 : 0;
      const pLec = env > 0 ? (lei / env) * 100 : 0;
      const pTrk = env > 0 ? (trk / env) * 100 : 0;
      const pTrkLei = lei > 0 ? (trk / lei) * 100 : 0;

      const yWhs = toY(pWhs);
      const yLec = toY(pLec);
      const yTrkLei = toY(pTrkLei);
      const yTrk = toY(pTrk);

      whsPts.push(`${x},${yWhs}`);
      lecPts.push(`${x},${yLec}`);
      trkPts.push(`${x},${yTrk}`);
      trkLeiPts.push(`${x},${yTrkLei}`);

      return {
        x,
        fecha: pt.fecha,
        yWhs,
        yLec,
        yTrkLei,
        yTrk,
        vWhs: fmtPct(pWhs),
        vLec: fmtPct(pLec),
        vTrkLei: fmtPct(pTrkLei),
        vTrk: fmtPct(pTrk),
      };
    });

    return {
      whs: whsPts.join(' '),
      lectura: lecPts.join(' '),
      tracking: trkPts.join(' '),
      trackingLeidos: trkLeiPts.join(' '),
      points,
    };
  }, [evolution]);

  const uniqueOtStatuses = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => {
      if (o.estado_ot) s.add(String(o.estado_ot).trim());
    });
    return Array.from(s).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const stWsp = (o.estado_wsp || 'NO ENVIADO').toUpperCase().trim();
      const matchWsp = statusFilter === 'Todos' || stWsp === statusFilter.toUpperCase();

      const stOt = (o.estado_ot || '').trim();
      const matchOt = otStatusFilter === 'Todos' || stOt === otStatusFilter;

      const trk = (o.ingreso_tracking || 'NO').toUpperCase().trim();
      const matchTrk = trackingFilter === 'Todos' || trk === trackingFilter;

      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        String(o.orden_id).includes(q) ||
        (o.ticket || '').toLowerCase().includes(q) ||
        (o.cliente || '').toLowerCase().includes(q) ||
        (o.numero_documento || '').toLowerCase().includes(q) ||
        (o.codi_segui_clien || '').toLowerCase().includes(q) ||
        (o.telefono || '').toLowerCase().includes(q) ||
        (o.distrito || '').toLowerCase().includes(q) ||
        (o.sector_operativo || '').toLowerCase().includes(q) ||
        (o.cuadrilla_completa || o.cuadrilla || '').toLowerCase().includes(q) ||
        (o.partner || '').toLowerCase().includes(q);

      return matchWsp && matchOt && matchTrk && matchSearch;
    });
  }, [orders, statusFilter, otStatusFilter, trackingFilter, searchQuery]);

  return (
    <div className="flex min-h-screen bg-[#090D16] text-gray-100 font-sans select-none">

      {/* SIDEBAR IZQUIERDO */}
      <aside className="w-60 bg-[#0B101B] border-r border-gray-800/80 flex flex-col justify-between p-4 shrink-0">
        <div>
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-9 h-9 rounded-lg bg-[#FF6B00] flex items-center justify-center font-black text-white text-lg shadow-lg shadow-orange-500/20">
              W
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-white">Control WIN</h1>
              <p className="text-[11px] text-gray-400">Operaciones</p>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-medium">
            <NavItem icon={<Home size={16} />} label="Inicio" active={activeNav === 'Inicio'} onClick={() => { setActiveNav('Inicio'); setViewMode('ejecutiva'); }} />

            {/* Desplegable Dashboard con las 2 vistas configuradas */}
            <div>
              <div
                onClick={() => {
                  setActiveNav('Dashboard');
                  setDashOpen(!dashOpen);
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition ${activeNav === 'Dashboard'
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
                    onClick={() => {
                      setActiveNav('Dashboard');
                      setViewMode('ejecutiva');
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition text-[11px] ${activeNav === 'Dashboard' && viewMode === 'ejecutiva'
                      ? 'bg-[#FF6B00]/15 text-[#FF6B00] font-bold border border-[#FF6B00]/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
                      }`}
                  >
                    <Activity size={13} />
                    <span>Vista Ejecutiva</span>
                  </div>

                  <div
                    onClick={() => {
                      setActiveNav('Dashboard');
                      setViewMode('operativa');
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition text-[11px] ${activeNav === 'Dashboard' && viewMode === 'operativa'
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

            <NavItem icon={<Layers size={16} />} label="Órdenes" active={activeNav === 'Órdenes'} onClick={() => setActiveNav('Órdenes')} />
            <NavItem icon={<CheckCircle size={16} />} label="Seguimiento" active={activeNav === 'Seguimiento'} onClick={() => { setActiveNav('Seguimiento'); setViewMode('operativa'); }} />
            <NavItem icon={<Activity size={16} />} label="Eficiencia" active={activeNav === 'Eficiencia'} onClick={() => { setActiveNav('Eficiencia'); setViewMode('ejecutiva'); }} />
            <NavItem icon={<Smile size={16} />} label="Experiencia (CSAT)" active={activeNav === 'Experiencia (CSAT)'} onClick={() => { setActiveNav('Experiencia (CSAT)'); setViewMode('ejecutiva'); }} />
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

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-5 overflow-y-auto space-y-4">

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between">
            <span><strong>Aviso de conexión:</strong> {errorMsg}</span>
            <button onClick={() => fetchDashboardData(startDate, endDate, service, zone, true)} className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded font-semibold">
              Reintentar
            </button>
          </div>
        )}

        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800/80 pb-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight">
                <span className="text-[#FF6B00]">WIN en RUTA</span>
                <span className="text-gray-600 mx-2">|</span>
                <span className="text-white">
                  {viewMode === 'ejecutiva' ? 'Dashboard Ejecutivo' : 'Vista Operativa de Casos 360'}
                </span>
              </h2>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${loading ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : dbOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
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
              onClick={() => fetchDashboardData(startDate, endDate, service, zone, true)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B00] hover:bg-[#e66000] disabled:opacity-50 text-white font-semibold rounded-lg transition"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Cargando...' : 'Consultar'}</span>
            </button>
          </div>
        </header>

        {/* TABS SUPERIORES (Solo visibles en sección Dashboard) */}
        {activeNav !== 'Órdenes' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('ejecutiva')}
                className={`flex items-center gap-2 px-4 py-1.5 font-semibold text-xs rounded-lg transition ${viewMode === 'ejecutiva'
                  ? 'bg-[#FF6B00] text-white shadow-md shadow-orange-500/10'
                  : 'bg-[#111827] text-gray-400 hover:text-gray-200 border border-gray-800'
                  }`}
              >
                <Activity size={14} />
                Vista Ejecutiva
              </button>
              <button
                onClick={() => setViewMode('operativa')}
                className={`flex items-center gap-2 px-4 py-1.5 font-semibold text-xs rounded-lg transition ${viewMode === 'operativa'
                  ? 'bg-[#FF6B00] text-white shadow-md shadow-orange-500/10'
                  : 'bg-[#111827] text-gray-400 hover:text-gray-200 border border-gray-800'
                  }`}
              >
                <ClipboardList size={14} />
                Vista Operativa
              </button>
            </div>
          </div>
        )}

        {/* FILA 1: 6 TARJETAS KPI HOMOLOGADAS (Solo visibles fuera de Órdenes) */}
        {activeNav !== 'Órdenes' && (
          <div className="grid grid-cols-6 gap-3">

            <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <ClipboardList size={18} />
                </div>
                <span className="text-xs text-gray-300 font-medium">Órdenes evaluadas</span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-extrabold text-white tracking-tight">{calc.ordenes}</span>
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Send size={18} />
                </div>
                <span className="text-xs text-gray-300 font-medium">Envío de WhatsApp</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-2xl font-extrabold text-white tracking-tight">{calc.whsEnviados}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  {calc.whsPct}%
                </span>
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <CheckCheck size={18} />
                </div>
                <span className="text-xs text-gray-300 font-medium">Lectura del mensaje</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-2xl font-extrabold text-white tracking-tight">{calc.leidos}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                  {calc.readPct}%
                </span>
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <MapPin size={18} />
                </div>
                <span className="text-xs text-gray-300 font-medium">Ingreso a Tracking</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl font-extrabold text-white tracking-tight">{calc.tracking}</span>
                <div className="flex flex-col gap-1">
                  <span className="w-[82px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 leading-none">
                    {calc.trackPct}% env.
                  </span>
                  <span className="w-[82px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-200 border border-yellow-500/30 leading-none">
                    {calc.trackOverReadPct}% leído
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <CalendarClock size={18} />
                </div>
                <span className="text-xs text-gray-300 font-medium">Reprogramaciones</span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-extrabold text-white tracking-tight">{calc.reprog}</span>
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <MessageSquare size={18} />
                </div>
                <span className="text-xs text-gray-300 font-medium">Encuestas (CSAT)</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-white tracking-tight">{calc.csatCount}</span>
                {Number(kpis?.csat_avg || 0) > 0 && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                    {Number(kpis?.csat_avg).toFixed(1).replace('.', ',')} ★
                  </span>
                )}
              </div>
            </div>

          </div>
        )}

        {activeNav === 'Órdenes' ? null : viewMode === 'ejecutiva' ? (
          <>
            {/* FILA 2: EMBUDO ALINEADO + EVOLUCIÓN CON PUNTOS DIARIOS + EFICIENCIA */}
            <div className="grid grid-cols-12 gap-4">

              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="border-b border-gray-800 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Filter size={15} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-sm text-white">Embudo de Interacción del Cliente</h3>
                    <Info size={13} className="text-gray-500" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Desde la orden hasta el ingreso a tracking</p>
                </div>

                <div className="space-y-2 my-auto py-1">
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 h-12 flex items-center justify-center">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 shadow-lg"
                        style={{ clipPath: 'polygon(0% 0%, 100% 0%, 93% 100%, 7% 100%)' }}
                      />
                      <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                          <ClipboardList size={15} />
                        </div>
                        <div className="text-left leading-tight">
                          <div className="font-extrabold text-base text-white tracking-tight">{calc.ordenes}</div>
                          <div className="text-[11px] font-medium text-blue-100">Órdenes</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-28 text-right shrink-0">
                      <div className="font-extrabold text-sm text-white">100%</div>
                      <div className="text-[10px] text-gray-500">Total base</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 h-12 flex items-center justify-center">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 shadow-lg"
                        style={{ clipPath: 'polygon(7% 0%, 93% 0%, 86% 100%, 14% 100%)' }}
                      />
                      <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                          <Send size={14} />
                        </div>
                        <div className="text-left leading-tight">
                          <div className="font-extrabold text-base text-white tracking-tight">{calc.whsEnviados}</div>
                          <div className="text-[11px] font-medium text-emerald-50 whitespace-nowrap">Mensajes enviados</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-28 text-right shrink-0">
                      <div className="font-extrabold text-sm text-emerald-400">{calc.whsPct}%</div>
                      <div className="text-[10px] text-gray-400">del total</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 h-12 flex items-center justify-center">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-cyan-700 via-cyan-600 to-cyan-500 shadow-lg"
                        style={{ clipPath: 'polygon(14% 0%, 86% 0%, 79% 100%, 21% 100%)' }}
                      />
                      <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                          <CheckCheck size={15} />
                        </div>
                        <div className="text-left leading-tight">
                          <div className="font-extrabold text-base text-white tracking-tight">{calc.leidos}</div>
                          <div className="text-[11px] font-medium text-cyan-50 whitespace-nowrap">Mensajes leídos</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-28 text-right shrink-0">
                      <div className="font-extrabold text-sm text-cyan-300">{calc.readPct}%</div>
                      <div className="text-[10px] text-gray-400">del enviado</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 h-12 flex items-center justify-center">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 shadow-lg"
                        style={{ clipPath: 'polygon(21% 0%, 79% 0%, 72% 100%, 28% 100%)' }}
                      />
                      <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                          <MapPin size={15} />
                        </div>
                        <div className="text-left leading-tight">
                          <div className="font-extrabold text-base text-white tracking-tight">{calc.tracking}</div>
                          <div className="text-[11px] font-medium text-amber-50 whitespace-nowrap">Ingreso a tracking</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-28 flex flex-col items-end justify-center gap-1 shrink-0">
                      <div className="flex items-center justify-between w-full px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px]">
                        <span className="text-gray-300">s/env.</span>
                        <span className="font-extrabold text-white">{calc.trackPct}%</span>
                      </div>
                      <div className="flex items-center justify-between w-full px-1.5 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/30 text-[10px]">
                        <span className="text-yellow-200/80">s/leído</span>
                        <span className="font-extrabold text-yellow-300">{calc.trackOverReadPct}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Evolución de Indicadores Clave */}
              <div className="col-span-5 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-sm text-white">Evolución de Indicadores Clave</h3>
                  </div>
                  <span className="text-[11px] text-gray-400">Diario (Últimos {chartPolylines.points.length || 7} días)</span>
                </div>

                <div className="flex items-center gap-2 h-48 my-auto">
                  <div className="flex flex-col justify-between h-36 text-[10px] text-gray-500 pr-1 text-right self-start mt-2">
                    <span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span>
                  </div>

                  <div className="flex-1 h-full flex items-center">
                    <svg viewBox="0 0 400 152" className="w-full h-44 overflow-visible">
                      {[15, 38, 61, 84, 107, 130].map((y, idx) => (
                        <line key={idx} x1="10" y1={y} x2="390" y2={y} stroke="#1F2937" strokeDasharray="3 3" />
                      ))}

                      {chartPolylines.points.map((pt, idx) => (
                        <line key={`v-${idx}`} x1={pt.x} y1="15" x2={pt.x} y2="130" stroke="#1F2937" strokeWidth="0.6" strokeDasharray="2 2" />
                      ))}

                      <polyline fill="none" stroke="#10B981" strokeWidth="2.2" points={chartPolylines.whs} />
                      <polyline fill="none" stroke="#3B82F6" strokeWidth="2.2" points={chartPolylines.lectura} />
                      <polyline fill="none" stroke="#FDE047" strokeWidth="1.8" strokeDasharray="4 3" points={chartPolylines.trackingLeidos} />
                      <polyline fill="none" stroke="#F59E0B" strokeWidth="2.2" points={chartPolylines.tracking} />

                      {chartPolylines.points.map((pt, idx) => {
                        const showLabel = chartPolylines.points.length <= 10 || idx % 2 === 0 || idx === chartPolylines.points.length - 1;
                        return (
                          <g key={idx}>
                            <text x={pt.x} y={146} textAnchor="middle" fill="#9CA3AF" fontSize="9.5" fontWeight="500">
                              {pt.fecha}
                            </text>

                            <circle cx={pt.x} cy={pt.yWhs} r="3.5" fill="#10B981" stroke="#090D16" strokeWidth="1.5">
                              <title>{`${pt.fecha} • Envío WHS: ${pt.vWhs}`}</title>
                            </circle>
                            {showLabel && (
                              <text x={pt.x} y={pt.yWhs - 6} textAnchor="middle" fill="#6EE7B7" fontSize="8.5" fontWeight="700">
                                {pt.vWhs}
                              </text>
                            )}

                            <circle cx={pt.x} cy={pt.yLec} r="3.5" fill="#3B82F6" stroke="#090D16" strokeWidth="1.5">
                              <title>{`${pt.fecha} • Lectura: ${pt.vLec}`}</title>
                            </circle>
                            {showLabel && (
                              <text x={pt.x} y={pt.yLec - 6} textAnchor="middle" fill="#93C5FD" fontSize="8.5" fontWeight="700">
                                {pt.vLec}
                              </text>
                            )}

                            <circle cx={pt.x} cy={pt.yTrkLei} r="3.2" fill="#FDE047" stroke="#090D16" strokeWidth="1.5">
                              <title>{`${pt.fecha} • Tracking (s/Leído): ${pt.vTrkLei}`}</title>
                            </circle>
                            {showLabel && (
                              <text x={pt.x} y={pt.yTrkLei - 6} textAnchor="middle" fill="#FEF08A" fontSize="8.5" fontWeight="700">
                                {pt.vTrkLei}
                              </text>
                            )}

                            <circle cx={pt.x} cy={pt.yTrk} r="3.5" fill="#F59E0B" stroke="#090D16" strokeWidth="1.5">
                              <title>{`${pt.fecha} • Tracking (s/Env.): ${pt.vTrk}`}</title>
                            </circle>
                            {showLabel && (
                              <text x={pt.x} y={pt.yTrk + 11} textAnchor="middle" fill="#FCD34D" fontSize="8.5" fontWeight="700">
                                {pt.vTrk}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="flex flex-col justify-between h-36 py-1 text-[10px] font-bold text-right shrink-0">
                    <span className="px-2 py-0.5 rounded bg-emerald-500 text-gray-950">{calc.whsPct}%</span>
                    <span className="px-2 py-0.5 rounded bg-blue-500 text-white">{calc.readPct}%</span>
                    <span className="px-2 py-0.5 rounded bg-yellow-300 text-gray-950">{calc.trackOverReadPct}% (leído)</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-gray-950">{calc.trackPct}% (env.)</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-gray-800/60 text-[11px] text-gray-300">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Envío WHS</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>Lectura</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-300"></span><span>Tracking (% s/Leído)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Tracking (% s/Env.)</span></div>
                </div>
              </div>

              {/* Eficiencia Operativa */}
              <div className="col-span-3 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between space-y-2.5">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Settings size={15} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-sm text-white">Eficiencia Operativa</h3>
                  </div>
                </div>
                <div className="bg-[#0D1F1C]/50 border border-emerald-500/30 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-400"><Settings size={16} /></div>
                    <div>
                      <div className="text-[11px] text-gray-300">Gestiones automatizadas</div>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-xl font-extrabold text-white">{calc.noEnviado}</span>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{calc.noEnviadoPct}%</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-[#0D1F1C]/50 border border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400"><Laptop size={16} /></div>
                    <div>
                      <div className="flex items-center gap-1 text-[11px] text-gray-200 font-medium"><span>Tasa de Autogestión Web</span></div>
                      <div className="text-2xl font-extrabold text-white mt-0.5">75,8%</div>
                    </div>
                  </div>
                  <div className="border-l border-gray-700 pl-3 text-right"><div className="text-sm font-extrabold text-white">{calc.tracking}</div><div className="text-[10px] text-gray-400">tracking</div></div>
                </div>
                <div className="flex items-center justify-between px-1 py-1">
                  <div className="flex items-center gap-2"><Clock size={15} className="text-cyan-400" /><span className="text-[11px] text-gray-300 leading-tight">Tiempo promedio de<br />respuesta al cliente</span></div>
                  <div className="flex items-center gap-2"><span className="text-base font-extrabold text-white">2,6 min</span></div>
                </div>
                <div className="bg-[#1F2937]/50 rounded-lg p-2 flex items-start gap-2 text-[10px] text-gray-400 leading-snug">
                  <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>Clientes que ingresaron al tracking sin contacto en MANTRA.</span>
                </div>
              </div>
            </div>

            {/* FILA 3: DONA + SEGMENTO POR DISTRITO (CON CASOS TOTALES) + RANKING DE PARTNERS REAL */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2.5 mb-3">
                  <Send size={15} className="text-[#FF6B00]" />
                  <h3 className="font-bold text-sm text-white">Distribución por Estado del Mensaje</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#10B981" strokeWidth="5" strokeDasharray="45 100" />
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#3B82F6" strokeWidth="5" strokeDasharray="21 100" strokeDashoffset="-45" />
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#38BDF8" strokeWidth="5" strokeDasharray="14 100" strokeDashoffset="-66" />
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#6B7280" strokeWidth="5" strokeDasharray="13 100" strokeDashoffset="-80" />
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#EF4444" strokeWidth="5" strokeDasharray="7 100" strokeDashoffset="-93" />
                    </svg>
                    <div className="absolute text-center leading-tight"><div className="font-extrabold text-sm text-white">{calc.whsEnviados}</div><div className="text-[10px] text-gray-400">Enviados</div></div>
                  </div>
                  <div className="flex-1 space-y-1.5 text-xs">
                    <StatusRow color="bg-emerald-500" label="Leído (read)" count={calc.leidos} pct={`${calc.readPct}%`} />
                    <StatusRow color="bg-blue-500" label="Enviado (sent)" count={calc.sent} pct={`${calc.sentPct}%`} />
                    <StatusRow color="bg-sky-400" label="Entregado (delivered)" count={calc.delivered} pct={`${calc.deliveredPct}%`} />
                    <StatusRow color="bg-gray-500" label="No enviado" count={calc.noEnviado} pct={`${calc.noEnviadoPct}%`} />
                    <StatusRow color="bg-red-500" label="Fallido (failed)" count={calc.failed} pct={`${calc.failedPct}%`} />
                  </div>
                </div>
              </div>

              {/* TARJETA INGRESO A TRACKING POR SEGMENTO */}
              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-sm text-white">Ingreso a Tracking por Segmento</h3>
                  </div>
                  <span className="text-[10px] text-gray-400">Por distrito</span>
                </div>

                <div className="space-y-5 my-auto py-2">
                  {/* Segmento Alto Valor */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <Crown size={18} className="text-amber-400 shrink-0" />
                      <div className="leading-tight">
                        <div className="text-xs font-semibold text-white">Alto Valor</div>
                        <div className="text-[10px] text-gray-400">{calc.avTotalFmt} casos</div>
                      </div>
                    </div>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${calc.avBarWidth}%` }}
                      />
                    </div>
                    <div className="text-right w-36 leading-tight shrink-0">
                      <div className="font-extrabold text-xs text-white">
                        {calc.avPct}% <span className="text-[10px] font-normal text-amber-300">({calc.avOverReadPct}% leído)</span>
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {calc.avTrackingFmt} ing. / {calc.avEnviadosFmt} env.
                      </div>
                    </div>
                  </div>

                  {/* Segmento Preferente */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <Gem size={18} className="text-amber-500 shrink-0" />
                      <div className="leading-tight">
                        <div className="text-xs font-semibold text-white">Preferente</div>
                        <div className="text-[10px] text-gray-400">{calc.prefTotalFmt} casos</div>
                      </div>
                    </div>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                        style={{ width: `${calc.prefBarWidth}%` }}
                      />
                    </div>
                    <div className="text-right w-36 leading-tight shrink-0">
                      <div className="font-extrabold text-xs text-white">
                        {calc.prefPct}% <span className="text-[10px] font-normal text-yellow-300">({calc.prefOverReadPct}% leído)</span>
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {calc.prefTrackingFmt} ing. / {calc.prefEnviadosFmt} env.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* TARJETA RANKING DE PARTNERS (CSAT) CONECTADA A vw_reporte_encuestas_enriquecido */}
              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Award size={15} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-sm text-white">Ranking de Partners (CSAT)</h3>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                      <th className="py-1 text-left">#</th><th className="py-1 text-left">Partner</th><th className="py-1 text-center">Encuestas</th><th className="py-1 text-center">Nota (1–5)</th><th className="py-1 text-right">CSAT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {partners.length > 0 ? (
                      partners.map((p) => (
                        <PartnerRow key={p.name} rank={p.rank} name={p.name} surveys={p.surveys} score={p.score} csat={p.csat} />
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-gray-500 text-xs">
                          Sin encuestas en este rango
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FILA 4: ALERTAS OPERATIVAS + OPORTUNIDADES */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-2">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <h3 className="font-bold text-sm text-white">Alertas Operativas</h3>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                      <th className="py-1.5 text-left">Motivo</th><th className="py-1.5 text-center">Cantidad</th><th className="py-1.5 text-center">% sobre base</th><th className="py-1.5 text-left">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    <tr>
                      <td className="py-2 flex items-center gap-2 font-medium text-white"><AlertTriangle size={14} className="text-red-500" /> Mensajes no enviados</td>
                      <td className="py-2 text-center font-bold">{calc.noEnviado}</td>
                      <td className="py-2 text-center">{calc.noEnviadoPct}%</td>
                      <td className="py-2 text-gray-400 text-[11px]">Órdenes con se_envio_wsp = 'NO' o estado_wsp = 'NO ENVIADO'.</td>
                    </tr>
                    <tr>
                      <td className="py-2 flex items-center gap-2 font-medium text-white"><AlertTriangle size={14} className="text-amber-400" /> Mensajes leídos sin ingreso</td>
                      <td className="py-2 text-center font-bold">{calc.leidosSinIngreso}</td>
                      <td className="py-2 text-center">{calc.leidosSinIngresoPct}%</td>
                      <td className="py-2 text-gray-400 text-[11px]">Clientes con estado_wsp = 'read' pero ingreso_tracking = 'NO'.</td>
                    </tr>
                    <tr>
                      <td className="py-2 flex items-center gap-2 font-medium text-white"><AlertTriangle size={14} className="text-amber-400" /> Fallidos en envío</td>
                      <td className="py-2 text-center font-bold">{calc.failed}</td>
                      <td className="py-2 text-center">{calc.failedPct}%</td>
                      <td className="py-2 text-gray-400 text-[11px]">Errores de entrega con estado_wsp = 'failed'.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-3">
                  <Target size={15} className="text-[#FF6B00]" />
                  <h3 className="font-bold text-sm text-white">Oportunidades de Mejora</h3>
                </div>
                <ul className="space-y-2.5 text-xs text-gray-200">
                  <li className="flex items-start gap-2"><CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" /><span>Incrementar el ingreso a tracking en segmento Preferente (+2,5 pp).</span></li>
                  <li className="flex items-start gap-2"><CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" /><span>Elevar la tasa de autogestión web ≥ 80%.</span></li>
                  <li className="flex items-start gap-2"><CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" /><span>Mantener la satisfacción de partners ≥ 4,5 (≥ 92% CSAT).</span></li>
                </ul>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {/* FILA 1 OPERATIVA: RESUMEN EJECUTIVO DIARIO + DISTRIBUCIÓN POR ESTADO WSP */}
            <div className="grid grid-cols-12 gap-4">
              {/* Tabla Resumen Ejecutivo */}
              <div className="col-span-8 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-start">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-cyan-400" />
                    <h3 className="font-bold text-xs tracking-wider uppercase text-white">Resumen Ejecutivo</h3>
                  </div>
                  <span className="text-[11px] text-gray-400">{dailyInRange.length} {dailyInRange.length === 1 ? 'día' : 'días'}</span>
                </div>

                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-800 text-[10px] uppercase">
                        <th className="py-2 text-left">Fecha</th>
                        <th className="py-2 text-right">Total Base</th>
                        <th className="py-2 text-right">WSP Env.</th>
                        <th className="py-2 text-right">Leídos (Read)</th>
                        <th className="py-2 text-right">Tracking</th>
                        <th className="py-2 text-right">Reprog.</th>
                        <th className="py-2 text-right">Encuestas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {[...dailyInRange].reverse().map((d, i) => {
                        const tot = Number(d.total || 0);
                        const env = Number(d.enviados || 0);
                        const lei = Number(d.leidos || 0);
                        const trk = Number(d.tracking || 0);
                        const pEnv = tot > 0 ? ((env / tot) * 100).toFixed(1) : '0.0';
                        const pLei = env > 0 ? ((lei / env) * 100).toFixed(1) : '0.0';
                        const pTrkEnv = env > 0 ? ((trk / env) * 100).toFixed(1) : '0.0';
                        const pTrkLei = lei > 0 ? ((trk / lei) * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={i} className="hover:bg-gray-800/30">
                            <td className="py-2.5 font-bold text-white">{d.fecha_full || d.raw_date}</td>
                            <td className="py-2.5 text-right font-bold text-gray-200">{tot.toLocaleString('es-PE')}</td>
                            <td className="py-2.5 text-right">
                              <span className="text-emerald-400 font-bold">{env.toLocaleString('es-PE')}</span>{' '}
                              <span className="text-[10px] text-emerald-500/80">({pEnv}%)</span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="text-cyan-400 font-bold">{lei.toLocaleString('es-PE')}</span>{' '}
                              <span className="text-[10px] text-cyan-500/80">({pLei}%)</span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="text-amber-400 font-bold">{trk.toLocaleString('es-PE')}</span>{' '}
                              <span className="text-[10px] text-amber-500/90">({pTrkEnv}%)</span>{' '}
                              <span className="text-[10px] text-cyan-300 font-semibold">[{pTrkLei}%]</span>
                            </td>
                            <td className="py-2.5 text-right font-bold text-purple-400">{Number(d.reprogramaciones || 0)}</td>
                            <td className="py-2.5 text-right font-bold text-emerald-400">{Number(d.encuestas || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Barras Distribución por Estado WSP */}
              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Send size={14} className="text-emerald-400" />
                    <h3 className="font-bold text-xs tracking-wider uppercase text-white">Distribución por Estado WSP</h3>
                  </div>
                  <span className="text-[11px] text-gray-400">{calc.ordenes} msgs</span>
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'READ', count: Number(kpis?.whs_leidos || 0), badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', bar: 'bg-emerald-500' },
                    { label: 'DELIVERED', count: Number(kpis?.whs_delivered || 0), badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', bar: 'bg-cyan-400' },
                    { label: 'NO ENVIADO', count: Number(kpis?.whs_no_enviado || 0), badge: 'bg-gray-700/40 text-gray-300 border-gray-600/40', bar: 'bg-gray-500' },
                    { label: 'SENT', count: Number(kpis?.whs_sent || 0), badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', bar: 'bg-blue-500' },
                    { label: 'FAILED', count: Number(kpis?.whs_failed || 0), badge: 'bg-red-500/15 text-red-400 border-red-500/30', bar: 'bg-red-500' },
                  ].map((st) => {
                    const tot = Number(kpis?.total_ordenes || 0);
                    const pctVal = tot > 0 ? (st.count / tot) * 100 : 0;
                    return (
                      <div key={st.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.badge}`}>{st.label}</span>
                          <div>
                            <span className="font-extrabold text-white mr-1.5">{st.count.toLocaleString('es-PE')}</span>
                            <span className="text-[11px] text-gray-400">({pctVal.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.min(100, pctVal)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* FILA 2 OPERATIVA: CONVERSIÓN POR ESTADO OT (% LEÍDO & % INGRESO) */}
            <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <Activity size={15} className="text-emerald-400" />
                  <h3 className="font-bold text-xs tracking-wider uppercase text-white">Conversión por Estado OT (% Leído & % Ingreso)</h3>
                </div>
                <span className="text-[11px] text-gray-400">{byEstadoOt.length} estados</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800 text-[10px] uppercase">
                      <th className="py-2 text-left">Estado OT</th>
                      <th className="py-2 text-right">Total OTs</th>
                      <th className="py-2 text-right">WSP Env.</th>
                      <th className="py-2 text-right">Leídos (Read)</th>
                      <th className="py-2 text-right">% Leído</th>
                      <th className="py-2 text-right">Tracking</th>
                      <th className="py-2 text-right">% Ingreso s/Env</th>
                      <th className="py-2 text-right">% Ingreso s/Read</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {byEstadoOt.map((r, i) => {
                      const tot = Number(r.total || 0);
                      const env = Number(r.enviados || 0);
                      const lei = Number(r.leidos || 0);
                      const trk = Number(r.tracking || 0);
                      const pEnv = tot > 0 ? ((env / tot) * 100).toFixed(1) : '0.0';
                      const pLei = env > 0 ? ((lei / env) * 100).toFixed(1) : '0.0';
                      const pTrkEnv = env > 0 ? ((trk / env) * 100).toFixed(1) : '0.0';
                      const pTrkLei = lei > 0 ? ((trk / lei) * 100).toFixed(1) : '0.0';

                      const stLower = String(r.estado_ot || '').toLowerCase();
                      const badgeCls =
                        stLower.includes('iniciada') || stLower.includes('finalizada')
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : stLower.includes('agendada')
                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                            : stLower.includes('cancel') || stLower.includes('anul')
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

                      return (
                        <tr key={i} className="hover:bg-gray-800/30">
                          <td className="py-2.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeCls}`}>
                              {r.estado_ot}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-bold text-white">{tot.toLocaleString('es-PE')}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-emerald-400 font-bold">{env.toLocaleString('es-PE')}</span>{' '}
                            <span className="text-[10px] text-emerald-500/80">({pEnv}%)</span>
                          </td>
                          <td className="py-2.5 text-right font-bold text-cyan-400">{lei.toLocaleString('es-PE')}</td>
                          <td className="py-2.5 text-right font-bold text-cyan-300">{pLei}%</td>
                          <td className="py-2.5 text-right font-bold text-amber-400">{trk.toLocaleString('es-PE')}</td>
                          <td className="py-2.5 text-right font-bold text-amber-400">{pTrkEnv}%</td>
                          <td className="py-2.5 text-right font-bold text-cyan-300">[{pTrkLei}%]</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FILA 3 OPERATIVA: RENDIMIENTO POR SECTOR OPERATIVO + TIPO DE OPERACIÓN */}
            <div className="grid grid-cols-12 gap-4">
              {/* Rendimiento por Sector Operativo */}
              <div className="col-span-8 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-xs tracking-wider uppercase text-white">Rendimiento por Sector Operativo (Top Sectores)</h3>
                  </div>
                  <span className="text-[11px] text-gray-400">{bySector.length} sectores</span>
                </div>

                <div className="overflow-y-auto max-h-80 pr-1">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#111827]">
                      <tr className="text-gray-400 border-b border-gray-800 text-[10px] uppercase">
                        <th className="py-2 text-left">Sector Operativo</th>
                        <th className="py-2 text-right">Total OTs</th>
                        <th className="py-2 text-right">Enviados</th>
                        <th className="py-2 text-right">No Env.</th>
                        <th className="py-2 text-center">% Cobertura WSP</th>
                        <th className="py-2 text-right">Tracking</th>
                        <th className="py-2 text-right">Leídos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {bySector.map((s, i) => {
                        const tot = Number(s.total || 0);
                        const env = Number(s.enviados || 0);
                        const noEnv = Number(s.no_enviados || 0);
                        const cobPct = tot > 0 ? Math.round((env / tot) * 100) : 0;
                        return (
                          <tr key={i} className="hover:bg-gray-800/30">
                            <td className="py-2.5 font-bold text-white uppercase">{s.sector_operativo}</td>
                            <td className="py-2.5 text-right font-bold text-white">{tot.toLocaleString('es-PE')}</td>
                            <td className="py-2.5 text-right font-bold text-emerald-400">{env.toLocaleString('es-PE')}</td>
                            <td className="py-2.5 text-right text-gray-400">{noEnv.toLocaleString('es-PE')}</td>
                            <td className="py-2.5">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, cobPct)}%` }} />
                                </div>
                                <span className="text-[11px] font-bold text-amber-400 w-8">{cobPct}%</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-bold text-amber-400">{Number(s.tracking || 0)}</td>
                            <td className="py-2.5 text-right font-bold text-cyan-400">{Number(s.leidos || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tipo de Operación */}
              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Layers size={15} className="text-amber-400" />
                    <h3 className="font-bold text-xs tracking-wider uppercase text-white">Tipo de Operación</h3>
                  </div>
                  <span className="text-[11px] text-gray-400">{byTipoOperacion.length} tipos</span>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-80 pr-1">
                  {byTipoOperacion.map((t, i) => {
                    const totalGlobal = Number(kpis?.total_ordenes || 0);
                    const totalTipo = Number(t.total || 0);
                    const envTipo = Number(t.enviados || 0);
                    const sharePct = totalGlobal > 0 ? ((totalTipo / totalGlobal) * 100).toFixed(1) : '0.0';
                    const cobPct = totalTipo > 0 ? Math.round((envTipo / totalTipo) * 100) : 0;
                    return (
                      <div key={i} className="bg-[#090D16]/70 border border-gray-800/80 rounded-xl p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-white uppercase">{t.tipo}</span>
                          <span className="font-bold text-gray-200">
                            {totalTipo.toLocaleString('es-PE')} <span className="text-gray-400 font-normal">({sharePct}%)</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-400">
                            Enviados WSP: <strong className="text-emerald-400">{envTipo.toLocaleString('es-PE')}</strong>
                          </span>
                          <span className="text-gray-400">
                            Cobertura: <strong className="text-[#FF6B00]">{cobPct}%</strong>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#FF6B00] to-amber-500 rounded-full" style={{ width: `${Math.min(100, cobPct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SECCIÓN PESTAÑA "ÓRDENES": TABLA FUNNEL HOMOLOGADA + DRAWER DE DETALLE 360° */}
        {activeNav === 'Órdenes' && (
          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-4 space-y-4">
            {/* Barra de herramientas y filtros homologados */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3.5">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Layers size={16} className="text-[#FF6B00]" />
                  Explorador de Órdenes — Funnel 360°
                  <span className="ml-1 px-2 py-0.5 text-[11px] rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-bold">
                    {filteredOrders.length} registros
                  </span>
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Haz clic sobre cualquier orden para abrir la ficha técnica completa del caso
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Buscador */}
                <div className="flex items-center bg-[#090D16] border border-gray-700/80 rounded-lg px-3 py-1.5 w-72 focus-within:border-[#FF6B00]">
                  <Search size={14} className="text-gray-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Buscar N° orden, ticket, cliente, distrito, partner..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-gray-200 focus:outline-none w-full text-xs"
                  />
                </div>

                {/* Filtro Estado OT */}
                <select
                  value={otStatusFilter}
                  onChange={(e) => setOtStatusFilter(e.target.value)}
                  className="bg-[#090D16] border border-gray-700/80 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none cursor-pointer"
                >
                  <option value="Todos">Estado OT: Todos</option>
                  {uniqueOtStatuses.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>

                {/* Filtro Estado WhatsApp */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#090D16] border border-gray-700/80 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none cursor-pointer"
                >
                  <option value="Todos">Estado WSP: Todos</option>
                  <option value="READ">Leído (READ)</option>
                  <option value="DELIVERED">Entregado (DELIVERED)</option>
                  <option value="SENT">Enviado (SENT)</option>
                  <option value="NO ENVIADO">No enviado</option>
                  <option value="FAILED">Fallido (FAILED)</option>
                </select>

                {/* Filtro Ingreso Tracking */}
                <select
                  value={trackingFilter}
                  onChange={(e) => setTrackingFilter(e.target.value)}
                  className="bg-[#090D16] border border-gray-700/80 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none cursor-pointer"
                >
                  <option value="Todos">Tracking: Todos</option>
                  <option value="SI">Ingresó (SÍ)</option>
                  <option value="NO">Sin ingreso (NO)</option>
                </select>
              </div>
            </div>

            {/* Tabla homologada e interactiva */}
            <div className="overflow-x-auto max-h-[720px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-[#111827] z-10">
                  <tr className="text-gray-400 border-b border-gray-800 text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-2 text-left whitespace-nowrap">N° Orden / Ticket</th>
                    <th className="py-2.5 px-2 text-left whitespace-nowrap">Fecha</th>
                    <th className="py-2.5 px-2 text-left">Cliente / Doc. / Cód. Seg.</th>
                    <th className="py-2.5 px-2 text-left">Operación / Producto</th>
                    <th className="py-2.5 px-2 text-left">Sector / Distrito</th>
                    <th className="py-2.5 px-2 text-left">Partner / Cuadrilla</th>
                    <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Estado OT</th>
                    <th className="py-2.5 px-1.5 text-center whitespace-nowrap">WhatsApp</th>
                    <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Tracking</th>
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
                      stWspLower === 'read' ? 'LEÍDO' :
                        stWspLower.includes('deliver') ? 'ENTREGADO' :
                          stWspLower === 'sent' ? 'ENVIADO' :
                            stWspLower === 'failed' ? 'FALLIDO' : 'NO ENVIADO';

                    const docCliente = o.numero_documento || '-';
                    const codSegui = o.codi_segui_clien || o.codi_clien || '-';
                    const nombreCuadrillaCompleto = o.cuadrilla_completa || o.cuadrilla || '-';

                    return (
                      <tr
                        key={o.orden_id}
                        onClick={() => setSelectedOrder(o)}
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
                          <div className="font-bold text-white leading-snug">
                            {o.cliente || '-'}
                          </div>
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
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${stWspLower === 'read' ? 'bg-emerald-500/20 text-emerald-300' :
                            stWspLower.includes('deliver') ? 'bg-cyan-500/20 text-cyan-300' :
                              stWspLower === 'sent' ? 'bg-blue-500/20 text-blue-300' :
                                stWspLower === 'failed' ? 'bg-red-500/20 text-red-400' :
                                  'bg-gray-800 text-gray-400'
                            }`}>
                            {wspLabel}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${o.ingreso_tracking === 'SI'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-gray-800/60 text-gray-500'
                            }`}>
                            {o.ingreso_tracking === 'SI' ? 'SÍ INGRESÓ' : 'NO'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedOrder(o)}
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
        )}

        {/* MODAL / DRAWER LATERAL CON TODO EL DETALLE 360° DE LA ORDEN */}
        {selectedOrder && (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end"
            onClick={() => setSelectedOrder(null)}
          >
            <div
              className="w-full max-w-2xl bg-[#0B101B] border-l border-gray-800 h-full overflow-y-auto p-6 space-y-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabecera del Modal */}
              <div className="flex items-start justify-between border-b border-gray-800 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-lg bg-[#FF6B00] text-white font-black text-sm">
                      Orden #{selectedOrder.orden_id}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      {selectedOrder.estado_ot || 'Sin Estado OT'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Ticket: <strong className="text-gray-200">{selectedOrder.ticket || '-'}</strong> • Fecha Solicitud:{' '}
                    <strong className="text-gray-200">{selectedOrder.fecha_solicitud_fmt || '-'}</strong>
                  </p>
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition"
                >
                  ✕ Cerrar
                </button>
              </div>

              {/* Resumen del Funnel de la Orden */}
              <div className="grid grid-cols-4 gap-2.5">
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 uppercase">Envío WhatsApp</div>
                  <div className={`text-sm font-extrabold mt-1 ${selectedOrder.se_envio_wsp === 'SI' ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {selectedOrder.se_envio_wsp || 'NO'}
                  </div>
                </div>
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 uppercase">Estado Mensaje</div>
                  <div className="text-sm font-extrabold text-cyan-400 mt-1 uppercase">
                    {selectedOrder.estado_wsp || 'NO ENVIADO'}
                  </div>
                </div>
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 uppercase">Ingreso Tracking</div>
                  <div className={`text-sm font-extrabold mt-1 ${selectedOrder.ingreso_tracking === 'SI' ? 'text-amber-400' : 'text-gray-400'}`}>
                    {selectedOrder.ingreso_tracking || 'NO'}
                  </div>
                </div>
                <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 uppercase">Reprogramó / CSAT</div>
                  <div className="text-sm font-extrabold text-purple-300 mt-1">
                    {selectedOrder.reprogramo || 'NO'} / {selectedOrder.respondio_encuesta || 'NO'}
                  </div>
                </div>
              </div>

              {/* Bloques Principales Homologados */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#FF6B00] uppercase tracking-wider mb-1">Datos del Cliente y Ubicación</div>
                  <div><span className="text-gray-400">Cliente:</span> <strong className="text-white">{selectedOrder.cliente || '-'}</strong></div>
                  <div><span className="text-gray-400">Documento:</span> <strong className="text-white">{selectedOrder.numero_documento || '-'}</strong> <span className="text-gray-500 text-[10px]">({selectedOrder.tipo_documento || 'DNI'})</span></div>
                  <div><span className="text-gray-400">Cód. Seguimiento Cliente:</span> <strong className="text-cyan-300">{selectedOrder.codi_segui_clien || selectedOrder.codi_clien || '-'}</strong></div>
                  <div><span className="text-gray-400">Teléfono / Email:</span> <strong className="text-white">{selectedOrder.telefono || '-'}</strong> {selectedOrder.email_cliente ? `• ${selectedOrder.email_cliente}` : ''}</div>
                  <div><span className="text-gray-400">Sector / Distrito:</span> <strong className="text-white">{selectedOrder.sector_operativo || '-'} • {selectedOrder.distrito || '-'}</strong></div>
                  <div><span className="text-gray-400">Dirección:</span> <strong className="text-gray-200">{selectedOrder.direccion_cliente || '-'}</strong></div>
                </div>

                <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#FF6B00] uppercase tracking-wider mb-1">Asignación Técnica</div>
                  <div><span className="text-gray-400">Tipo Operación:</span> <strong className="text-emerald-300">{selectedOrder.servicio_tipo || '-'}</strong></div>
                  <div><span className="text-gray-400">Producto / Trabajo:</span> <strong className="text-white">{selectedOrder.producto || '-'} ({selectedOrder.tipo_trabajo || '-'})</strong></div>
                  <div><span className="text-gray-400">Partner:</span> <strong className="text-white">{selectedOrder.partner || selectedOrder.proveedor_ot || '-'}</strong></div>
                  <div><span className="text-gray-400">Cuadrilla Completa:</span> <strong className="text-amber-300">{selectedOrder.cuadrilla_completa || selectedOrder.cuadrilla || '-'}</strong></div>
                  {selectedOrder.plan_contratado && (
                    <div className="pt-1 border-t border-gray-800/80 text-[11px]">
                      <span className="text-gray-400">Detalle Plan:</span>{' '}
                      <span className="text-gray-300">{String(selectedOrder.plan_contratado).replace(/<br\s*\/?>/gi, ' • ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* MAPA INTERACTIVO TIPO GOOGLE MAPS CON PUNTOS CTO, CLIENTE Y TÉCNICO */}
              <OrderGeoMap order={selectedOrder} />

              {/* Botón directo a Link de Tracking si existe */}
              {selectedOrder.link_tracking && (
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="text-xs">
                    <div className="font-bold text-white">Enlace de Seguimiento WIN en Ruta</div>
                    <div className="text-[11px] text-gray-400 truncate max-w-md">{selectedOrder.link_tracking}</div>
                  </div>
                  <a
                    href={selectedOrder.link_tracking}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold rounded-lg text-xs transition shrink-0"
                  >
                    <span>Abrir Tracking</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              )}

              {/* Todos los campos adicionales de la vista vw_reporte_funnel_casos_360 */}
              <div className="bg-[#111827]/80 border border-gray-800 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-3 border-b border-gray-800 pb-2">
                  Ficha Completa de Campos (vw_reporte_funnel_casos_360)
                </h4>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {Object.entries(selectedOrder)
                    .filter(([k]) => k !== 'fecha_solicitud_fmt')
                    .map(([key, val]) => (
                      <div key={key} className="bg-[#090D16] border border-gray-800/80 rounded-lg p-2.5">
                        <div className="text-[10px] font-semibold uppercase text-gray-400">
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs font-bold text-gray-100 mt-0.5 break-all">
                          {val !== null && val !== undefined && String(val) !== '' ? String(val) : '-'}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition ${active ? 'bg-gradient-to-r from-[#FF6B00] to-[#FF8533] text-white font-semibold shadow-md shadow-orange-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-800/40'}`}>
      {icon}<span>{label}</span>
    </div>
  );
}

function StatusRow({ color, label, count, pct }: { color: string; label: string; count: string; pct: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-sm ${color}`}></span><span className="text-gray-300">{label}</span></div>
      <div className="flex items-center gap-3"><span className="text-gray-200 font-semibold">{count}</span><span className="text-gray-400 w-12 text-right">{pct}</span></div>
    </div>
  );
}

function PartnerRow({ rank, name, surveys, score, csat }: { rank: number; name: string; surveys: number; score: string; csat: string }) {
  return (
    <tr>
      <td className="py-1.5"><span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${rank <= 3 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-gray-400'}`}>{rank}</span></td>
      <td className="py-1.5 font-semibold text-white">{name}</td>
      <td className="py-1.5 text-center text-gray-300">{surveys}</td>
      <td className="py-1.5 text-center font-bold text-white">{score} <span className="text-amber-400">★</span></td>
      <td className="py-1.5 text-right"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">{csat}</span></td>
    </tr>
  );
}

interface GeoPoint {
    id: string;
    kind: 'cliente' | 'tecnico' | 'cto';
    label: string;
    detail?: string;
    lat: number;
    lng: number;
  }

  function parseCoordPair(raw?: string | null): { lat: number; lng: number } | null {
    if (!raw) return null;
    const matches = String(raw).match(/-?\d+\.\d+/g);
    if (!matches || matches.length < 2) return null;
    const lat = parseFloat(matches[0]);
    const lng = parseFloat(matches[1]);
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  function parseTechnicalData(rawDatos?: string | null, geoCliente?: string | null, geoTecnico?: string | null) {
    const points: GeoPoint[] = [];
    const attributes: { key: string; value: string }[] = [];
    const ctoNames: Record<string, string> = {};

    // 1. Coordenada del Cliente
    const cliCoord = parseCoordPair(geoCliente);
    if (cliCoord) {
      points.push({
        id: 'cliente',
        kind: 'cliente',
        label: 'Domicilio Cliente',
        detail: `${cliCoord.lat}, ${cliCoord.lng}`,
        lat: cliCoord.lat,
        lng: cliCoord.lng,
      });
    }

    // 2. Coordenada del Técnico
    const tecCoord = parseCoordPair(geoTecnico);
    if (tecCoord) {
      points.push({
        id: 'tecnico',
        kind: 'tecnico',
        label: 'Ubicación Técnico',
        detail: `${tecCoord.lat}, ${tecCoord.lng}`,
        lat: tecCoord.lat,
        lng: tecCoord.lng,
      });
    }

    // 3. Parsear el campo Datos Técnicos (ej. CTO1/Alfanumérico/WN-11C...;COORDENADA CTO1/Númerico/-11.961892-77.0107)
    if (rawDatos) {
      const segments = String(rawDatos)
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const seg of segments) {
        const parts = seg.split('/');
        const rawKey = (parts[0] || '').trim();
        const rawVal = (parts.slice(2).join('/') || parts[1] || '').trim();
        if (!rawKey || !rawVal) continue;

        if (/^CTO\d*$/i.test(rawKey)) {
          ctoNames[rawKey.toUpperCase()] = rawVal;
          attributes.push({ key: rawKey.toUpperCase(), value: rawVal });
        } else if (/COORDENADA\s*(CTO\d*)/i.test(rawKey)) {
          const matchCto = rawKey.match(/(CTO\d*)/i);
          const ctoKey = matchCto ? matchCto[1].toUpperCase() : 'CTO';
          const coord = parseCoordPair(rawVal);
          if (coord) {
            points.push({
              id: `coord_${ctoKey}_${points.length}`,
              kind: 'cto',
              label: ctoKey,
              detail: ctoNames[ctoKey] ? `Código: ${ctoNames[ctoKey]}` : `${coord.lat}, ${coord.lng}`,
              lat: coord.lat,
              lng: coord.lng,
            });
          }
        } else {
          attributes.push({ key: rawKey, value: rawVal });
        }
      }
    }

    return { points, attributes };
  }

  function OrderGeoMap({ order }: { order: RealOrder }) {
    const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = React.useRef<any>(null);
    const [mapStyle, setMapStyle] = useState<'google_streets' | 'google_hybrid' | 'dark'>('google_streets');

    const { points, attributes } = useMemo(
      () =>
        parseTechnicalData(
          order.datos_tecnicos,
          order.georeferencia_cliente || order.Georeferencia,
          order.georeferencia_tecnico || order.Georeferencia_tecnico
        ),
      [order]
    );

    useEffect(() => {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current || points.length === 0) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      });
      mapInstanceRef.current = map;

      const tileUrl =
        mapStyle === 'google_streets'
          ? 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
          : mapStyle === 'google_hybrid'
            ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
            : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

      L.tileLayer(tileUrl, { maxZoom: 20 }).addTo(map);

      const bounds: [number, number][] = [];

      points.forEach((pt) => {
        bounds.push([pt.lat, pt.lng]);

        const color =
          pt.kind === 'cliente' ? '#10B981' : pt.kind === 'tecnico' ? '#3B82F6' : '#FF6B00';
        const badgeText =
          pt.kind === 'cliente' ? '🏠' : pt.kind === 'tecnico' ? '🚐' : pt.label.replace('CTO', '');

        const customIcon = L.divIcon({
          className: 'custom-geo-pin',
          html: `
          <div style="
            display:flex;align-items:center;gap:4px;
            background:${color};color:#fff;font-weight:800;font-size:10px;
            padding:3px 7px;border-radius:9999px;border:2px solid #0B101B;
            box-shadow:0 4px 10px rgba(0,0,0,0.45);white-space:nowrap;
            transform:translate(-50%, -50%);
          ">
            <span>${badgeText}</span>
            <span>${pt.label}</span>
          </div>
        `,
          iconSize: [0, 0],
        });

        const marker = L.marker([pt.lat, pt.lng], { icon: customIcon }).addTo(map);
        marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;line-height:1.4;color:#111827;">
          <strong>${pt.label}</strong><br/>
          ${pt.detail ? `<span>${pt.detail}</span><br/>` : ''}
          <span style="color:#4B5563;font-size:11px;">${pt.lat}, ${pt.lng}</span><br/>
          <a href="https://www.google.com/maps?q=${pt.lat},${pt.lng}" target="_blank" rel="noreferrer" style="color:#FF6B00;font-weight:bold;text-decoration:none;">
            Abrir en Google Maps ↗
          </a>
        </div>
      `);
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 17);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 18 });
      }

      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }, [points, mapStyle]);

    return (
      <div className="bg-[#111827]/95 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <MapPin size={15} className="text-[#FF6B00]" />
              Mapa de Georreferencia (Cliente, Técnico y CTOs)
            </h4>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Ubicación espacial de cajas terminales ópticas (CTO), domicilio y técnico asignado
            </p>
          </div>

          {/* Selector de capa tipo Google Maps / Satélite / Oscuro */}
          <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-lg border border-gray-800 text-[10px]">
            <button
              onClick={() => setMapStyle('google_streets')}
              className={`px-2 py-1 rounded font-semibold transition ${mapStyle === 'google_streets' ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
                }`}
            >
              Google Calles
            </button>
            <button
              onClick={() => setMapStyle('google_hybrid')}
              className={`px-2 py-1 rounded font-semibold transition ${mapStyle === 'google_hybrid' ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
                }`}
            >
              Satélite
            </button>
            <button
              onClick={() => setMapStyle('dark')}
              className={`px-2 py-1 rounded font-semibold transition ${mapStyle === 'dark' ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
                }`}
            >
              Oscuro
            </button>
          </div>
        </div>

        {/* Etiquetas limpias de Datos Técnicos (CTOs, Puerto, DNI, RRINST, etc.) */}
        {attributes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attributes.map((attr, idx) => (
              <div
                key={idx}
                className="px-2.5 py-1 rounded-lg bg-[#090D16] border border-gray-800 text-[11px] flex items-center gap-1.5"
              >
                <span className="text-gray-400 font-semibold">{attr.key}:</span>
                <span className="text-amber-300 font-bold">{attr.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Contenedor del Mapa */}
        {points.length > 0 ? (
          <>
            <div
              ref={mapContainerRef}
              className="w-full h-72 rounded-xl overflow-hidden border border-gray-700/80 z-0"
            />

            {/* Leyenda interactiva y enlaces directos a Google Maps */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {points.map((pt) => {
                const badgeColor =
                  pt.kind === 'cliente'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : pt.kind === 'tecnico'
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                      : 'border-orange-500/40 bg-[#FF6B00]/10 text-amber-300';

                return (
                  <a
                    key={pt.id}
                    href={`https://www.google.com/maps?q=${pt.lat},${pt.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`p-2 rounded-lg border ${badgeColor} hover:brightness-125 transition flex items-center justify-between text-[11px]`}
                  >
                    <div className="truncate pr-1">
                      <div className="font-bold text-white flex items-center gap-1">
                        <span>{pt.kind === 'cliente' ? '🏠' : pt.kind === 'tecnico' ? '🚐' : '📦'}</span>
                        <span>{pt.label}</span>
                      </div>
                      <div className="text-[10px] opacity-80 truncate">{pt.detail}</div>
                    </div>
                    <ExternalLink size={12} className="shrink-0 opacity-75" />
                  </a>
                );
              })}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-xs text-gray-500 bg-[#090D16]/60 rounded-xl border border-gray-800/60">
            Esta orden no registra coordenadas geográficas en Datos Técnicos ni en Georeferencia.
          </div>
        )}
      </div>
    );
  }