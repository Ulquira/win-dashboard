import React, { useState, useMemo, useEffect } from 'react';
import { 
  Home, BarChart2, Layers, CheckCircle, Activity, Smile, FileText, 
  Calendar, ChevronDown, ClipboardList, Send, CheckCheck, 
  MapPin, CalendarClock, MessageSquare, TrendingUp, Star,
  Filter, Info, Settings, Laptop, Clock, Crown, Gem, Award, AlertTriangle, Target,
  Search, User, ExternalLink, Database, RefreshCw
} from 'lucide-react';

type ViewMode = 'ejecutiva' | 'operativa';
type NavSection = 'Inicio' | 'WIN en RUTA' | 'Órdenes' | 'Seguimiento' | 'Eficiencia' | 'Experiencia (CSAT)';

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
  leidos_sin_ingreso: number;
  av_enviados: number;
  av_tracking: number;
  pref_enviados: number;
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
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('WIN en RUTA');
  const [viewMode, setViewMode] = useState<ViewMode>('ejecutiva');

  // Rango inicial corto de 7 días para respuesta inmediata en vistas pesadas
  const todayStr = new Date().toLocaleDateString('en-CA'); // Formato YYYY-MM-DD local
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [service, setService] = useState<string>('Todos los servicios');
  const [zone, setZone] = useState<string>('Todas las zonas');

  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [zoneOptions, setZoneOptions] = useState<string[]>([]);

  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [evolution, setEvolution] = useState<EvolutionPoint[]>([]);
  const [orders, setOrders] = useState<RealOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dbOnline, setDbOnline] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');

  const fetchDashboardData = (sDate = startDate, eDate = endDate, srv = service, zn = zone) => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams({
      startDate: sDate,
      endDate: eDate,
      service: srv,
      zone: zn,
    });

    fetch(`http://localhost:3001/api/dashboard?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setKpis(data.kpis);
          setEvolution(data.evolution || []);
          setOrders(data.orders || []);
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
    // Cargamos primero el dashboard y en paralelo las listas de filtros
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
    const avEnviados = Number(kpis?.av_enviados || 0);
    const avTracking = Number(kpis?.av_tracking || 0);
    const prefEnviados = Number(kpis?.pref_enviados || 0);
    const prefTracking = Number(kpis?.pref_tracking || 0);

    const avPctNum = avEnviados > 0 ? (avTracking / avEnviados) * 100 : 0;
    const prefPctNum = prefEnviados > 0 ? (prefTracking / prefEnviados) * 100 : 0;

    const fmt = (n: number) => n.toLocaleString('es-PE');
    const pct = (num: number, den: number) =>
      den > 0 ? ((num / den) * 100).toFixed(1).replace('.', ',') : '0,0';

    return {
      ordenes: fmt(total),
      whsEnviados: fmt(enviados),
      whsPct: pct(enviados, total),
      leidos: fmt(leidos),
      readPct: pct(leidos, enviados),
      tracking: fmt(tracking),
      trackPct: pct(tracking, enviados),        // % sobre enviados
      trackOverReadPct: pct(tracking, leidos),  // % sobre leídos
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
      vTrackingFmt: fmt(avTracking),
      avEnviadosFmt: fmt(avEnviados),
      avPct: pct(avTracking, avEnviados),
      avBarWidth: Math.min(100, Math.max(6, Math.round(avPctNum * 2.2))), // Escala visual proporcional
      prefTrackingFmt: fmt(prefTracking),
      prefEnviadosFmt: fmt(prefEnviados),
      prefPct: pct(prefTracking, prefEnviados),
      prefBarWidth: Math.min(100, Math.max(6, Math.round(prefPctNum * 2.2))),
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
      // Dejamos un margen lateral de 22px (de 22 a 378) para que los % de los bordes no se corten
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

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const st = (o.estado_wsp || 'NO ENVIADO').toUpperCase().trim();
      const matchStatus = statusFilter === 'Todos' || st === statusFilter.toUpperCase();
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        String(o.orden_id).includes(q) ||
        (o.ticket || '').toLowerCase().includes(q) ||
        (o.cliente || '').toLowerCase().includes(q) ||
        (o.telefono || '').toLowerCase().includes(q) ||
        (o.cuadrilla || '').toLowerCase().includes(q) ||
        (o.partner || '').toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [orders, statusFilter, searchQuery]);

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
            <NavItem icon={<BarChart2 size={16} />} label="WIN en RUTA" active={activeNav === 'WIN en RUTA'} onClick={() => { setActiveNav('WIN en RUTA'); setViewMode('ejecutiva'); }} />
            <NavItem icon={<Layers size={16} />} label="Órdenes" active={activeNav === 'Órdenes'} onClick={() => { setActiveNav('Órdenes'); setViewMode('operativa'); }} />
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
        
        {/* BANNER DE ERROR SI EL BACKEND ESTÁ APAGADO O TARDA */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between">
            <span><strong>Aviso de conexión:</strong> {errorMsg}</span>
            <button onClick={() => fetchDashboardData()} className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded font-semibold">
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
              onClick={() => fetchDashboardData()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B00] hover:bg-[#e66000] disabled:opacity-50 text-white font-semibold rounded-lg transition"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Cargando...' : 'Consultar'}</span>
            </button>
          </div>
        </header>

        {/* TABS SUPERIORES */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('ejecutiva')}
              className={`flex items-center gap-2 px-4 py-1.5 font-semibold text-xs rounded-lg transition ${
                viewMode === 'ejecutiva'
                  ? 'bg-[#FF6B00] text-white shadow-md shadow-orange-500/10'
                  : 'bg-[#111827] text-gray-400 hover:text-gray-200 border border-gray-800'
              }`}
            >
              <Activity size={14} />
              Vista Ejecutiva
            </button>
            <button
              onClick={() => setViewMode('operativa')}
              className={`flex items-center gap-2 px-4 py-1.5 font-semibold text-xs rounded-lg transition ${
                viewMode === 'operativa'
                  ? 'bg-[#FF6B00] text-white shadow-md shadow-orange-500/10'
                  : 'bg-[#111827] text-gray-400 hover:text-gray-200 border border-gray-800'
              }`}
            >
              <ClipboardList size={14} />
              Vista Operativa ({orders.length})
            </button>
          </div>
        </div>

        {/* FILA 1: 6 TARJETAS KPI */}
        {/* FILA 1: 6 TARJETAS KPI HOMOLOGADAS */}
        <div className="grid grid-cols-6 gap-3">
          
          {/* KPI 1: Órdenes evaluadas */}
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

          {/* KPI 2: Envío de WhatsApp */}
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

          {/* KPI 3: Lectura del mensaje */}
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

          {/* KPI 4: Ingreso a Tracking (Porcentajes uno encima del otro justo al lado del número) */}
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

          {/* KPI 5: Reprogramaciones */}
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

          {/* KPI 6: Encuestas (CSAT) */}
          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <MessageSquare size={18} />
              </div>
              <span className="text-xs text-gray-300 font-medium">Encuestas (CSAT)</span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-extrabold text-white tracking-tight">{calc.csatCount}</span>
            </div>
          </div>
        </div>

        {viewMode === 'ejecutiva' ? (
          <>
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

                <div className="space-y-1.5 my-auto">
                  {/* Nivel 1: Órdenes (100% -> 84%) */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div 
                        className="w-full h-12 bg-gradient-to-r from-blue-700 to-blue-500 flex items-center justify-center shadow-md" 
                        style={{ clipPath: 'polygon(0% 0%, 100% 0%, 92% 100%, 8% 100%)' }}
                      >
                        <div className="flex items-center gap-2.5 w-36">
                          <ClipboardList size={16} className="text-blue-100 shrink-0" />
                          <div className="leading-tight">
                            <div className="font-extrabold text-sm text-white">{calc.ordenes}</div>
                            <div className="text-[10px] text-blue-100">Órdenes</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-24 text-right font-bold text-sm text-white shrink-0">100%</div>
                  </div>

                  {/* Nivel 2: Mensajes enviados (84% -> 68%) */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div 
                        className="w-full h-12 bg-gradient-to-r from-emerald-600 to-emerald-500 flex items-center justify-center shadow-md" 
                        style={{ clipPath: 'polygon(8% 0%, 92% 0%, 84% 100%, 16% 100%)' }}
                      >
                        <div className="flex items-center gap-2.5 w-36">
                          <Send size={15} className="text-emerald-100 shrink-0" />
                          <div className="leading-tight">
                            <div className="font-extrabold text-sm text-white">{calc.whsEnviados}</div>
                            <div className="text-[10px] text-emerald-100">Mensajes enviados</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-24 text-right font-bold text-sm text-white shrink-0">{calc.whsPct}%</div>
                  </div>

                  {/* Nivel 3: Mensajes leídos (68% -> 52%) */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div 
                        className="w-full h-12 bg-gradient-to-r from-cyan-600 to-cyan-500 flex items-center justify-center shadow-md" 
                        style={{ clipPath: 'polygon(16% 0%, 84% 0%, 76% 100%, 24% 100%)' }}
                      >
                        <div className="flex items-center gap-2.5 w-36">
                          <CheckCheck size={15} className="text-cyan-100 shrink-0" />
                          <div className="leading-tight">
                            <div className="font-extrabold text-sm text-white">{calc.leidos}</div>
                            <div className="text-[10px] text-cyan-100">Mensajes leídos</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-24 text-right leading-tight shrink-0">
                      <div className="font-bold text-sm text-white">{calc.readPct}%</div>
                      <div className="text-[10px] text-gray-400">(del enviado)</div>
                    </div>
                  </div>

                  {/* Nivel 4: Ingreso a tracking (52% -> 36%) */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div 
                        className="w-full h-12 bg-gradient-to-r from-amber-600 to-amber-500 flex items-center justify-center shadow-md" 
                        style={{ clipPath: 'polygon(24% 0%, 76% 0%, 68% 100%, 32% 100%)' }}
                      >
                        <div className="flex items-center gap-2.5 w-36">
                          <MapPin size={15} className="text-amber-100 shrink-0" />
                          <div className="leading-tight">
                            <div className="font-extrabold text-sm text-white">{calc.tracking}</div>
                            <div className="text-[10px] text-amber-100">Ingreso a tracking</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-24 text-right leading-tight space-y-0.5 shrink-0">
                      <div className="font-bold text-xs text-white">{calc.trackPct}% <span className="text-[9px] font-normal text-gray-400">(env.)</span></div>
                      <div className="font-bold text-xs text-amber-300">{calc.trackOverReadPct}% <span className="text-[9px] font-normal text-amber-400/80">(leído)</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Evolución de Indicadores Clave con nodos y % diario */}
              <div className="col-span-5 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-sm text-white">Evolución de Indicadores Clave</h3>
                  </div>
                  <span className="text-[11px] text-gray-400">Diario (Últimos {chartPolylines.points.length || 7} días)</span>
                </div>

                <div className="flex items-center gap-2 h-48 my-auto">
                  {/* Eje Y */}
                  <div className="flex flex-col justify-between h-36 text-[10px] text-gray-500 pr-1 text-right self-start mt-2">
                    <span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span>
                  </div>

                  {/* Lienzo SVG con líneas, puntos, porcentajes y fechas perfectamente alineadas */}
                  <div className="flex-1 h-full flex items-center">
                    <svg viewBox="0 0 400 152" className="w-full h-44 overflow-visible">
                      {/* Líneas guía horizontales */}
                      {[15, 38, 61, 84, 107, 130].map((y, idx) => (
                        <line key={idx} x1="10" y1={y} x2="390" y2={y} stroke="#1F2937" strokeDasharray="3 3" />
                      ))}

                      {/* Líneas guía verticales por día */}
                      {chartPolylines.points.map((pt, idx) => (
                        <line key={`v-${idx}`} x1={pt.x} y1="15" x2={pt.x} y2="130" stroke="#1F2937" strokeWidth="0.6" strokeDasharray="2 2" />
                      ))}

                      {/* 4 Curvas del evolutivo */}
                      <polyline fill="none" stroke="#10B981" strokeWidth="2.2" points={chartPolylines.whs} />
                      <polyline fill="none" stroke="#3B82F6" strokeWidth="2.2" points={chartPolylines.lectura} />
                      <polyline fill="none" stroke="#FDE047" strokeWidth="1.8" strokeDasharray="4 3" points={chartPolylines.trackingLeidos} />
                      <polyline fill="none" stroke="#F59E0B" strokeWidth="2.2" points={chartPolylines.tracking} />

                      {/* Puntos, etiquetas de % por día y fecha en eje X */}
                      {chartPolylines.points.map((pt, idx) => {
                        // Si hay más de 10 días seleccionados, mostramos los % día por medio para que no se pisen
                        const showLabel = chartPolylines.points.length <= 10 || idx % 2 === 0 || idx === chartPolylines.points.length - 1;
                        return (
                          <g key={idx}>
                            {/* Fecha en Eje X */}
                            <text x={pt.x} y={146} textAnchor="middle" fill="#9CA3AF" fontSize="9.5" fontWeight="500">
                              {pt.fecha}
                            </text>

                            {/* 1. Envío WHS (Verde) */}
                            <circle cx={pt.x} cy={pt.yWhs} r="3.5" fill="#10B981" stroke="#090D16" strokeWidth="1.5">
                              <title>{`${pt.fecha} • Envío WHS: ${pt.vWhs}`}</title>
                            </circle>
                            {showLabel && (
                              <text x={pt.x} y={pt.yWhs - 6} textAnchor="middle" fill="#6EE7B7" fontSize="8.5" fontWeight="700">
                                {pt.vWhs}
                              </text>
                            )}

                            {/* 2. Lectura (Azul) */}
                            <circle cx={pt.x} cy={pt.yLec} r="3.5" fill="#3B82F6" stroke="#090D16" strokeWidth="1.5">
                              <title>{`${pt.fecha} • Lectura: ${pt.vLec}`}</title>
                            </circle>
                            {showLabel && (
                              <text x={pt.x} y={pt.yLec - 6} textAnchor="middle" fill="#93C5FD" fontSize="8.5" fontWeight="700">
                                {pt.vLec}
                              </text>
                            )}

                            {/* 3. Tracking % s/Leído (Amarillo) */}
                            <circle cx={pt.x} cy={pt.yTrkLei} r="3.2" fill="#FDE047" stroke="#090D16" strokeWidth="1.5">
                              <title>{`${pt.fecha} • Tracking (s/Leído): ${pt.vTrkLei}`}</title>
                            </circle>
                            {showLabel && (
                              <text x={pt.x} y={pt.yTrkLei - 6} textAnchor="middle" fill="#FEF08A" fontSize="8.5" fontWeight="700">
                                {pt.vTrkLei}
                              </text>
                            )}

                            {/* 4. Tracking % s/Enviado (Naranja - etiqueta debajo del punto para no chocar con la amarilla) */}
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

                  {/* Resumen derecho del período */}
                  <div className="flex flex-col justify-between h-36 py-1 text-[10px] font-bold text-right shrink-0">
                    <span className="px-2 py-0.5 rounded bg-emerald-500 text-gray-950">{calc.whsPct}%</span>
                    <span className="px-2 py-0.5 rounded bg-blue-500 text-white">{calc.readPct}%</span>
                    <span className="px-2 py-0.5 rounded bg-yellow-300 text-gray-950">{calc.trackOverReadPct}% (leído)</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-gray-950">{calc.trackPct}% (env.)</span>
                  </div>
                </div>

                {/* Leyenda inferior */}
                <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-gray-800/60 text-[11px] text-gray-300">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Envío WHS</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>Lectura</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-300"></span><span>Tracking (% s/Leído)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Tracking (% s/Env.)</span></div>
                </div>
              </div>

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
                    <div className="flex items-center gap-2 w-28 shrink-0">
                      <Crown size={18} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-white">Alto Valor</span>
                    </div>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${calc.avBarWidth}%` }}
                      />
                    </div>
                    <div className="text-right w-28 leading-tight shrink-0">
                      <div className="font-extrabold text-xs text-white">{calc.avPct}%</div>
                      <div className="text-[10px] text-gray-400">
                        ({calc.avTrackingFmt} de {calc.avEnviadosFmt})
                      </div>
                    </div>
                  </div>

                  {/* Segmento Preferente */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-28 shrink-0">
                      <Gem size={18} className="text-amber-500 shrink-0" />
                      <span className="text-xs font-semibold text-white">Preferente</span>
                    </div>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                        style={{ width: `${calc.prefBarWidth}%` }}
                      />
                    </div>
                    <div className="text-right w-28 leading-tight shrink-0">
                      <div className="font-extrabold text-xs text-white">{calc.prefPct}%</div>
                      <div className="text-[10px] text-gray-400">
                        ({calc.prefTrackingFmt} de {calc.prefEnviadosFmt})
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
                    <PartnerRow rank={1} name="OLMA" surveys={32} score="4,8" csat="96,0%" />
                    <PartnerRow rank={2} name="AVANTEL" surveys={29} score="4,7" csat="94,0%" />
                    <PartnerRow rank={3} name="DOMINION" surveys={27} score="4,6" csat="92,0%" />
                    <PartnerRow rank={4} name="EJAS" surveys={27} score="4,5" csat="90,0%" />
                    <PartnerRow rank={5} name="HODELPE" surveys={28} score="4,4" csat="88,0%" />
                  </tbody>
                </table>
              </div>
            </div>

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
          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <ClipboardList size={16} className="text-[#FF6B00]" />
                  Órdenes Reales desde vw_reporte_funnel_casos_360
                </h3>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <div className="flex items-center bg-[#090D16] border border-gray-700 rounded-lg px-3 py-1.5 w-72">
                  <Search size={14} className="text-gray-400 mr-2" />
                  <input
                    type="text"
                    placeholder="Buscar orden, ticket, cliente, teléfono o cuadrilla..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-gray-200 focus:outline-none w-full text-xs"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#090D16] border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none cursor-pointer"
                >
                  <option value="Todos">Todos los estados_wsp</option>
                  <option value="READ">READ (Leído)</option>
                  <option value="DELIVERED">DELIVERED (Entregado)</option>
                  <option value="SENT">SENT (Enviado)</option>
                  <option value="NO ENVIADO">NO ENVIADO</option>
                  <option value="FAILED">FAILED (Fallido)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                    <th className="py-2 text-left">Orden / Ticket</th>
                    <th className="py-2 text-left">Cliente / Teléfono</th>
                    <th className="py-2 text-left">Servicio (Tipo) / Producto</th>
                    <th className="py-2 text-left">Sector Operativo / Distrito</th>
                    <th className="py-2 text-left">Partner / Cuadrilla</th>
                    <th className="py-2 text-center">Fecha Solicitud</th>
                    <th className="py-2 text-center">Estado WSP</th>
                    <th className="py-2 text-center">Tracking</th>
                    <th className="py-2 text-right">Link En Ruta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {filteredOrders.map((o) => (
                    <tr key={o.orden_id} className="hover:bg-gray-800/30 transition">
                      <td className="py-2.5">
                        <div className="font-bold text-[#FF6B00]">#{o.orden_id}</div>
                        <div className="text-[10px] text-gray-400">Ticket: {o.ticket || '-'}</div>
                      </td>
                      <td className="py-2.5">
                        <div className="font-semibold text-white max-w-[200px] truncate" title={o.cliente}>{o.cliente}</div>
                        <div className="text-[10px] text-gray-400">{o.telefono}</div>
                      </td>
                      <td className="py-2.5">
                        <div className="text-emerald-300 font-medium">{o.servicio_tipo}</div>
                        <div className="text-[10px] text-gray-400 max-w-[180px] truncate">{o.producto}</div>
                      </td>
                      <td className="py-2.5">
                        <div className="text-gray-200">{o.sector_operativo}</div>
                        <div className="text-[10px] text-gray-400">{o.distrito}</div>
                      </td>
                      <td className="py-2.5">
                        <div className="font-semibold text-white">{o.partner}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1"><User size={10} /> {o.cuadrilla}</div>
                      </td>
                      <td className="py-2.5 text-center text-gray-300">{o.fecha_solicitud_fmt}</td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          (o.estado_wsp || '').toLowerCase() === 'read' ? 'bg-emerald-500/20 text-emerald-300' :
                          (o.estado_wsp || '').toLowerCase().includes('deliver') ? 'bg-cyan-500/20 text-cyan-300' :
                          (o.estado_wsp || '').toLowerCase() === 'sent' ? 'bg-blue-500/20 text-blue-300' :
                          (o.estado_wsp || '').toLowerCase() === 'failed' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-800 text-gray-400'
                        }`}>
                          {o.estado_wsp || 'NO ENVIADO'}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${o.ingreso_tracking === 'SI' ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500'}`}>
                          {o.ingreso_tracking}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        {o.link_tracking ? (
                          <a
                            href={o.link_tracking}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1F2937] hover:bg-[#FF6B00] hover:text-white text-gray-300 rounded text-[11px] transition"
                          >
                            <span>Abrir</span><ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-gray-600 text-[10px]">Sin link</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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