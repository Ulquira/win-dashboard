import React, { useState, useMemo } from 'react';
import { 
  Home, BarChart2, Layers, CheckCircle, Activity, Smile, FileText, 
  Calendar, ChevronDown, Download, ClipboardList, Send, CheckCheck, 
  MapPin, CalendarClock, MessageSquare, TrendingUp, TrendingDown, Star,
  Filter, Info, Settings, Laptop, Clock, Crown, Gem, Award, AlertTriangle, Target,
  Search, User, Phone, ExternalLink
} from 'lucide-react';

// Tipos para filtros y vistas
type ViewMode = 'ejecutiva' | 'operativa';
type PeriodKey = 'Octubre 2026' | 'Septiembre 2026' | 'Últimos 7 días';
type ServiceKey = 'Todos los servicios' | 'Instalaciones FTTH' | 'Visitas Técnicas' | 'Migraciones';
type ZoneKey = 'Todas las zonas' | 'Lima Norte' | 'Lima Sur' | 'Lima Centro / Este';

// Órdenes de muestra para la Vista Operativa
const MOCK_ORDERS = [
  { id: 'ORD-98412', client: 'Carlos Mendoza', dni: '45892103', zone: 'Lima Norte', service: 'Instalaciones FTTH', partner: 'OLMA', tech: 'Jorge Quispe', whsStatus: 'Ingresó Tracking', time: '10:15 AM', slot: '09:00 - 13:00', csat: 5 },
  { id: 'ORD-98415', client: 'María Fernanda Ríos', dni: '71204982', zone: 'Lima Centro / Este', service: 'Visitas Técnicas', partner: 'AVANTEL', tech: 'Luis Paredes', whsStatus: 'Leído', time: '10:22 AM', slot: '09:00 - 13:00', csat: 5 },
  { id: 'ORD-98419', client: 'Roberto Sánchez', dni: '09481723', zone: 'Lima Sur', service: 'Instalaciones FTTH', partner: 'DOMINION', tech: 'Pedro Huamán', whsStatus: 'No enviado', time: '10:30 AM', slot: '14:00 - 18:00', csat: null },
  { id: 'ORD-98424', client: 'Lucía Vargas', dni: '48192034', zone: 'Lima Norte', service: 'Migraciones', partner: 'OLMA', tech: 'Miguel Ángel Castro', whsStatus: 'Ingresó Tracking', time: '10:45 AM', slot: '09:00 - 13:00', csat: 4 },
  { id: 'ORD-98430', client: 'Diego Altamirano', dni: '73910485', zone: 'Lima Sur', service: 'Visitas Técnicas', partner: 'EJAS', tech: 'Carlos Rojas', whsStatus: 'Fallido', time: '11:02 AM', slot: '14:00 - 18:00', csat: null },
  { id: 'ORD-98433', client: 'Ana Paula Chávez', dni: '41029384', zone: 'Lima Centro / Este', service: 'Instalaciones FTTH', partner: 'HODELPE', tech: 'Raúl Espinoza', whsStatus: 'Entregado', time: '11:15 AM', slot: '14:00 - 18:00', csat: 5 },
  { id: 'ORD-98441', client: 'Fernando Gutiérrez', dni: '10293847', zone: 'Lima Norte', service: 'Instalaciones FTTH', partner: 'AVANTEL', tech: 'Jorge Quispe', whsStatus: 'Leído', time: '11:28 AM', slot: '14:00 - 18:00', csat: 4 },
];

export default function App() {
  // Estados de navegación y filtros
  const [activeNav, setActiveNav] = useState<string>('WIN en RUTA');
  const [viewMode, setViewMode] = useState<ViewMode>('ejecutiva');
  const [period, setPeriod] = useState<PeriodKey>('Octubre 2026');
  const [service, setService] = useState<ServiceKey>('Todos los servicios');
  const [zone, setZone] = useState<ZoneKey>('Todas las zonas');
  const [chartGranularity, setChartGranularity] = useState<'Diario' | 'Semanal'>('Diario');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');

  // Multiplicador dinámico según los filtros seleccionados para simular datos reales
  const metrics = useMemo(() => {
    let mult = 1;
    if (period === 'Septiembre 2026') mult *= 0.92;
    if (period === 'Últimos 7 días') mult *= 0.24;

    if (service === 'Instalaciones FTTH') mult *= 0.58;
    if (service === 'Visitas Técnicas') mult *= 0.28;
    if (service === 'Migraciones') mult *= 0.14;

    if (zone === 'Lima Norte') mult *= 0.36;
    if (zone === 'Lima Sur') mult *= 0.31;
    if (zone === 'Lima Centro / Este') mult *= 0.33;

    const fmt = (n: number) => Math.round(n * mult).toLocaleString('es-PE');

    // Variaciones sutiles de porcentajes según zona/servicio
    const offset = (zone === 'Lima Norte' ? 1.4 : zone === 'Lima Sur' ? -1.1 : 0) + (service === 'Instalaciones FTTH' ? 1.2 : 0);
    const whsPct = (76.7 + offset).toFixed(1).replace('.', ',');
    const readPct = (51.8 + offset * 0.8).toFixed(1).replace('.', ',');
    const trackPct = (12.8 + offset * 0.5).toFixed(1).replace('.', ',');
    const autoWebPct = (75.8 + offset * 0.6).toFixed(1).replace('.', ',');

    return {
      ordenes: fmt(84180),
      whsEnviados: fmt(64585),
      whsPct,
      leidos: fmt(33440),
      readPct,
      tracking: fmt(8256),
      trackPct,
      reprog: Math.max(2, Math.round(41 * mult)),
      csatCount: Math.max(8, Math.round(143 * mult)),
      gestionesAuto: fmt(19595),
      autoWebPct,
      autoWebClients: fmt(6256),
      enviados: fmt(15211),
      entregados: fmt(11722),
      noEnviados: fmt(19595),
      fallidos: fmt(4212),
      leidosSinIngreso: fmt(25184),
      altoValorIngresos: fmt(5861),
      preferenteIngresos: fmt(2395),
    };
  }, [period, service, zone]);

  // Filtrado de órdenes para la Vista Operativa
  const filteredOrders = useMemo(() => {
    return MOCK_ORDERS.filter((o) => {
      const matchService = service === 'Todos los servicios' || o.service === service;
      const matchZone = zone === 'Todas las zonas' || o.zone === zone;
      const matchStatus = statusFilter === 'Todos' || o.whsStatus === statusFilter;
      const matchSearch =
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.tech.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.dni.includes(searchQuery);
      return matchService && matchZone && matchStatus && matchSearch;
    });
  }, [service, zone, statusFilter, searchQuery]);

  const periodLabel = period === 'Octubre 2026' ? '01/10/2026 – 31/10/2026' : period === 'Septiembre 2026' ? '01/09/2026 – 30/09/2026' : '25/10/2026 – 31/10/2026';

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
            <NavItem icon={<Home size={16} />} label="Inicio" active={activeNav === 'Inicio'} onClick={() => setActiveNav('Inicio')} />
            <NavItem icon={<BarChart2 size={16} />} label="WIN en RUTA" active={activeNav === 'WIN en RUTA'} onClick={() => setActiveNav('WIN en RUTA')} />
            <NavItem icon={<Layers size={16} />} label="Órdenes" active={activeNav === 'Órdenes'} onClick={() => { setActiveNav('Órdenes'); setViewMode('operativa'); }} />
            <NavItem icon={<CheckCircle size={16} />} label="Seguimiento" active={activeNav === 'Seguimiento'} onClick={() => setActiveNav('Seguimiento')} />
            <NavItem icon={<Activity size={16} />} label="Eficiencia" active={activeNav === 'Eficiencia'} onClick={() => setActiveNav('Eficiencia')} />
            <NavItem icon={<Smile size={16} />} label="Experiencia (CSAT)" active={activeNav === 'Experiencia (CSAT)'} onClick={() => setActiveNav('Experiencia (CSAT)')} />
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
        
        {/* HEADER CON FILTROS INTERACTIVOS */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800/80 pb-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              <span className="text-[#FF6B00]">WIN en RUTA</span>
              <span className="text-gray-600 mx-2">|</span>
              <span className="text-white">
                {viewMode === 'ejecutiva' ? 'Dashboard Ejecutivo' : 'Monitoreo Operativo en Tiempo Real'}
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Seguimiento, autogestión y eficiencia operativa • <span className="text-gray-300 font-medium">{service}</span> • <span className="text-gray-300 font-medium">{zone}</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            {/* Selector de Período */}
            <div className="relative flex items-center bg-[#111827] border border-gray-700/70 rounded-lg px-2.5 py-1.5 hover:border-gray-500 transition">
              <Calendar size={14} className="text-gray-400 mr-2 shrink-0" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                className="bg-transparent text-gray-200 focus:outline-none cursor-pointer pr-4 appearance-none"
              >
                <option value="Octubre 2026" className="bg-[#111827]">01/10/2026 – 31/10/2026</option>
                <option value="Septiembre 2026" className="bg-[#111827]">01/09/2026 – 30/09/2026</option>
                <option value="Últimos 7 días" className="bg-[#111827]">25/10/2026 – 31/10/2026</option>
              </select>
              <ChevronDown size={13} className="text-gray-400 pointer-events-none absolute right-2.5" />
            </div>

            {/* Selector de Servicio */}
            <div className="relative flex items-center bg-[#111827] border border-gray-700/70 rounded-lg px-2.5 py-1.5 hover:border-gray-500 transition">
              <select
                value={service}
                onChange={(e) => setService(e.target.value as ServiceKey)}
                className="bg-transparent text-gray-200 focus:outline-none cursor-pointer pr-5 appearance-none"
              >
                <option value="Todos los servicios" className="bg-[#111827]">Todos los servicios</option>
                <option value="Instalaciones FTTH" className="bg-[#111827]">Instalaciones FTTH</option>
                <option value="Visitas Técnicas" className="bg-[#111827]">Visitas Técnicas</option>
                <option value="Migraciones" className="bg-[#111827]">Migraciones</option>
              </select>
              <ChevronDown size={13} className="text-gray-400 pointer-events-none absolute right-2.5" />
            </div>

            {/* Selector de Zona */}
            <div className="relative flex items-center bg-[#111827] border border-gray-700/70 rounded-lg px-2.5 py-1.5 hover:border-gray-500 transition">
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value as ZoneKey)}
                className="bg-transparent text-gray-200 focus:outline-none cursor-pointer pr-5 appearance-none"
              >
                <option value="Todas las zonas" className="bg-[#111827]">Todas las zonas</option>
                <option value="Lima Norte" className="bg-[#111827]">Lima Norte</option>
                <option value="Lima Sur" className="bg-[#111827]">Lima Sur</option>
                <option value="Lima Centro / Este" className="bg-[#111827]">Lima Centro / Este</option>
              </select>
              <ChevronDown size={13} className="text-gray-400 pointer-events-none absolute right-2.5" />
            </div>

            <button 
              onClick={() => alert(`Exportando reporte (${periodLabel} | ${service} | ${zone})...`)}
              title="Descargar reporte"
              className="p-2 bg-[#111827] border border-gray-700/70 rounded-lg hover:bg-gray-800 text-gray-300 transition"
            >
              <Download size={15} />
            </button>
          </div>
        </header>

        {/* TABS DE VISTA + BOTÓN RESET DE FILTROS */}
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
              Vista Operativa
            </button>
          </div>

          {(period !== 'Octubre 2026' || service !== 'Todos los servicios' || zone !== 'Todas las zonas') && (
            <button
              onClick={() => {
                setPeriod('Octubre 2026');
                setService('Todos los servicios');
                setZone('Todas las zonas');
              }}
              className="text-[11px] text-[#FF6B00] hover:underline"
            >
              Restablecer filtros originales
            </button>
          )}
        </div>

        {/* FILA 1: 6 TARJETAS KPI (Siempre visibles y reactivas a los filtros) */}
        <div className="grid grid-cols-6 gap-3">
          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400"><ClipboardList size={18} /></div>
              <span className="text-xs text-gray-300 font-medium">Órdenes evaluadas</span>
            </div>
            <div className="my-2">
              <span className="text-2xl font-extrabold text-white tracking-tight">{metrics.ordenes}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-400">
              <TrendingUp size={12} />
              <span>+2,9% <span className="text-gray-400">vs. período anterior</span></span>
            </div>
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-3 bg-[#0D1F1C]/40 border border-emerald-500/30 rounded-xl p-1.5">
            <div className="bg-[#111827]/90 rounded-lg p-2.5 flex flex-col justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400"><Send size={16} /></div>
                <span className="text-xs text-gray-300 font-medium">Envío de WhatsApp</span>
              </div>
              <div className="my-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-white tracking-tight">{metrics.whsEnviados}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{metrics.whsPct}%</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                <TrendingUp size={12} />
                <span>+1,8 pp <span className="text-gray-400">vs. período anterior</span></span>
              </div>
            </div>

            <div className="bg-[#111827]/90 rounded-lg p-2.5 flex flex-col justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400"><CheckCheck size={16} /></div>
                <span className="text-xs text-gray-300 font-medium">Lectura del mensaje</span>
              </div>
              <div className="my-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-white tracking-tight">{metrics.leidos}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">{metrics.readPct}%</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                <TrendingUp size={12} />
                <span>+3,1 pp <span className="text-gray-400">vs. período anterior</span></span>
              </div>
            </div>
          </div>

          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400"><MapPin size={16} /></div>
              <span className="text-xs text-gray-300 font-medium">Ingreso a Tracking</span>
            </div>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white tracking-tight">{metrics.tracking}</span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">{metrics.trackPct}%</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-amber-400">
              <TrendingUp size={12} />
              <span>+2,6 pp <span className="text-gray-400">vs. período anterior</span></span>
            </div>
          </div>

          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400"><CalendarClock size={16} /></div>
              <span className="text-xs text-gray-300 font-medium">Reprogramaciones</span>
            </div>
            <div className="my-2">
              <span className="text-2xl font-extrabold text-white tracking-tight">{metrics.reprog}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-400">
              <TrendingDown size={12} />
              <span>-37,9% <span className="text-gray-400">vs. período anterior</span></span>
            </div>
          </div>

          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400"><MessageSquare size={16} /></div>
              <span className="text-xs text-gray-300 font-medium">Encuestas (CSAT)</span>
            </div>
            <div className="my-2">
              <span className="text-2xl font-extrabold text-white tracking-tight">{metrics.csatCount}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
              <Star size={12} fill="currentColor" />
              <span className="text-white">4,6 / 5 <span className="text-gray-400">(92,3%)</span></span>
            </div>
          </div>
        </div>

        {/* RENDERIZADO CONDICIONAL SEGÚN LA PESTAÑA ACTIVA */}
        {viewMode === 'ejecutiva' ? (
          <>
            {/* FILA 2: EMBUDO + EVOLUCIÓN + EFICIENCIA OPERATIVA */}
            <div className="grid grid-cols-12 gap-4">
              
              {/* Embudo de Interacción */}
              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="border-b border-gray-800 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Filter size={15} className="text-[#FF6B00]" />
                    <h3 className="font-bold text-sm text-white">Embudo de Interacción del Cliente</h3>
                    <Info size={13} className="text-gray-500" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Desde la orden hasta el ingreso a tracking</p>
                </div>

                <div className="space-y-2 my-auto">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex justify-center">
                      <div className="w-full bg-gradient-to-r from-blue-700 to-blue-500 py-2 px-4 flex items-center justify-center gap-3" style={{ clipPath: 'polygon(0 0, 100% 0, 93% 100%, 7% 100%)' }}>
                        <ClipboardList size={16} className="text-blue-100 shrink-0" />
                        <div className="leading-tight">
                          <div className="font-extrabold text-sm text-white">{metrics.ordenes}</div>
                          <div className="text-[10px] text-blue-100">Órdenes</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-20 text-right font-bold text-sm text-white">100%</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex justify-center">
                      <div className="w-[86%] bg-gradient-to-r from-emerald-600 to-emerald-500 py-2 px-4 flex items-center justify-center gap-3" style={{ clipPath: 'polygon(0 0, 100% 0, 91% 100%, 9% 100%)' }}>
                        <Send size={15} className="text-emerald-100 shrink-0" />
                        <div className="leading-tight">
                          <div className="font-extrabold text-sm text-white">{metrics.whsEnviados}</div>
                          <div className="text-[10px] text-emerald-100">Mensajes enviados</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-20 text-right font-bold text-sm text-white">{metrics.whsPct}%</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex justify-center">
                      <div className="w-[70%] bg-gradient-to-r from-cyan-600 to-cyan-500 py-2 px-4 flex items-center justify-center gap-2.5" style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 12% 100%)' }}>
                        <CheckCheck size={15} className="text-cyan-100 shrink-0" />
                        <div className="leading-tight">
                          <div className="font-extrabold text-sm text-white">{metrics.leidos}</div>
                          <div className="text-[10px] text-cyan-100">Mensajes leídos</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-20 text-right leading-tight">
                      <div className="font-bold text-sm text-white">{metrics.readPct}%</div>
                      <div className="text-[10px] text-gray-400">(del enviado)</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex justify-center">
                      <div className="w-[52%] bg-gradient-to-r from-amber-600 to-amber-500 py-2 px-3 flex items-center justify-center gap-2" style={{ clipPath: 'polygon(0 0, 100% 0, 84% 100%, 16% 100%)' }}>
                        <MapPin size={15} className="text-amber-100 shrink-0" />
                        <div className="leading-tight">
                          <div className="font-extrabold text-sm text-white">{metrics.tracking}</div>
                          <div className="text-[10px] text-amber-100">Ingreso a tracking</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-20 text-right leading-tight">
                      <div className="font-bold text-sm text-white">{metrics.trackPct}%</div>
                      <div className="text-[10px] text-gray-400">(del enviado)</div>
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
                  <button 
                    onClick={() => setChartGranularity(chartGranularity === 'Diario' ? 'Semanal' : 'Diario')}
                    className="flex items-center gap-2 px-2.5 py-1 bg-[#1F2937] hover:bg-gray-700 border border-gray-700 rounded text-[11px] text-gray-200 transition"
                  >
                    <span>{chartGranularity}</span>
                    <ChevronDown size={12} />
                  </button>
                </div>

                <div className="flex items-center gap-2 h-44 my-auto">
                  <div className="flex flex-col justify-between h-full text-[10px] text-gray-500 py-2 pr-1 text-right">
                    <span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span>
                  </div>
                  <div className="flex-1 h-full flex flex-col justify-between">
                    <svg viewBox="0 0 400 130" className="w-full h-36 overflow-visible">
                      {[10, 34, 58, 82, 106, 130].map((y, idx) => (
                        <line key={idx} x1="0" y1={y} x2="400" y2={y} stroke="#1F2937" strokeDasharray="3 3" />
                      ))}
                      <polyline 
                        fill="none" 
                        stroke="#10B981" 
                        strokeWidth="2.5" 
                        points={chartGranularity === 'Diario' 
                          ? "0,46 30,42 60,39 90,38 120,38 150,37 180,38 210,37 240,38 270,37 300,38 330,38 360,38 400,38"
                          : "0,48 100,41 200,39 300,38 400,37"} 
                      />
                      <polyline 
                        fill="none" 
                        stroke="#3B82F6" 
                        strokeWidth="2.5" 
                        points={chartGranularity === 'Diario'
                          ? "0,75 30,72 60,70 90,69 120,68 150,68 180,68 210,67 240,68 270,67 300,67 330,68 360,67 400,67"
                          : "0,76 100,71 200,68 300,67 400,66"} 
                      />
                      <polyline 
                        fill="none" 
                        stroke="#F59E0B" 
                        strokeWidth="2.5" 
                        points={chartGranularity === 'Diario'
                          ? "0,118 30,116 60,115 90,115 120,114 150,114 180,114 210,114 240,114 270,114 300,114 330,114 360,114 400,114"
                          : "0,119 100,116 200,114 300,114 400,113"} 
                      />
                    </svg>
                    <div className="flex justify-between text-[10px] text-gray-500 pt-1">
                      {chartGranularity === 'Diario' ? (
                        <><span>01/10</span><span>05/10</span><span>09/10</span><span>13/10</span><span>17/10</span><span>21/10</span><span>25/10</span><span>29/10</span></>
                      ) : (
                        <><span>Sem 1</span><span>Sem 2</span><span>Sem 3</span><span>Sem 4</span></>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col justify-between h-32 py-2 text-[11px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-gray-950">{metrics.whsPct}%</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white">{metrics.readPct}%</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500 text-gray-950">{metrics.trackPct}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6 pt-2 border-t border-gray-800/60 text-[11px] text-gray-300">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Envío WHS</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>Lectura</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Ingreso a Tracking</span></div>
                </div>
              </div>

              {/* Eficiencia Operativa */}
              <div className="col-span-3 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between space-y-2.5">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                  <Settings size={15} className="text-[#FF6B00]" />
                  <h3 className="font-bold text-sm text-white">Eficiencia Operativa</h3>
                  <Info size={13} className="text-gray-500" />
                </div>

                <div className="bg-[#0D1F1C]/50 border border-emerald-500/30 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-400"><Settings size={16} /></div>
                    <div>
                      <div className="text-[11px] text-gray-300">Gestiones automatizadas</div>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-xl font-extrabold text-white">{metrics.gestionesAuto}</span>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">23,3%</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-[10px]">
                    <div className="text-emerald-400 font-bold">▼ -2,1 pp</div>
                    <div className="text-gray-400">vs. período anterior</div>
                  </div>
                </div>

                <div className="bg-[#0D1F1C]/50 border border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400"><Laptop size={16} /></div>
                    <div>
                      <div className="flex items-center gap-1 text-[11px] text-gray-200 font-medium">
                        <span>Tasa de Autogestión Web</span><Info size={11} className="text-gray-400" />
                      </div>
                      <div className="text-2xl font-extrabold text-white mt-0.5">{metrics.autoWebPct}%</div>
                    </div>
                  </div>
                  <div className="border-l border-gray-700 pl-3 text-right">
                    <div className="text-sm font-extrabold text-white">{metrics.autoWebClients}</div>
                    <div className="text-[10px] text-gray-400">clientes</div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1 py-1">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-cyan-400" />
                    <span className="text-[11px] text-gray-300 leading-tight">Tiempo promedio de<br />respuesta al cliente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-white">2,6 min</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">▼ -18,7%</span>
                  </div>
                </div>

                <div className="bg-[#1F2937]/50 rounded-lg p-2 flex items-start gap-2 text-[10px] text-gray-400 leading-snug">
                  <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>Clientes que ingresaron al tracking y resolvieron sus necesidades sin contacto con un asesor en MANTRA.</span>
                </div>
              </div>
            </div>

            {/* FILA 3: DISTRIBUCIÓN POR ESTADO + SEGMENTO + RANKING PARTNERS */}
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
                    <div className="absolute text-center leading-tight">
                      <div className="font-extrabold text-sm text-white">{metrics.whsEnviados}</div>
                      <div className="text-[10px] text-gray-400">Mensajes</div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-1.5 text-xs">
                    <StatusRow color="bg-emerald-500" label="Leído (Read)" count={metrics.leidos} pct={`${metrics.readPct}%`} />
                    <StatusRow color="bg-blue-500" label="Enviado (Sent)" count={metrics.enviados} pct="23,6%" />
                    <StatusRow color="bg-sky-400" label="Entregado (Delivered)" count={metrics.entregados} pct="18,1%" />
                    <StatusRow color="bg-gray-500" label="No enviado" count={metrics.noEnviados} pct="23,3%" />
                    <StatusRow color="bg-red-500" label="Fallido (Failed)" count={metrics.fallidos} pct="5,0%" />
                  </div>
                </div>
              </div>

              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2.5">
                  <MapPin size={15} className="text-[#FF6B00]" />
                  <h3 className="font-bold text-sm text-white">Ingreso a Tracking por Segmento</h3>
                  <Info size={13} className="text-gray-500" />
                </div>

                <div className="space-y-5 my-auto py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-28">
                      <Crown size={18} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-white">Alto Valor</span>
                    </div>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full w-[68%] bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"></div>
                    </div>
                    <div className="text-right w-24 leading-tight">
                      <div className="font-extrabold text-xs text-white">18,9%</div>
                      <div className="text-[10px] text-gray-400">({metrics.altoValorIngresos} ingresos)</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-28">
                      <Gem size={18} className="text-amber-500 shrink-0" />
                      <span className="text-xs font-semibold text-white">Preferente</span>
                    </div>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full w-[48%] bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full"></div>
                    </div>
                    <div className="text-right w-24 leading-tight">
                      <div className="font-extrabold text-xs text-white">14,6%</div>
                      <div className="text-[10px] text-gray-400">({metrics.preferenteIngresos} ingresos)</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-2">
                  <Award size={15} className="text-[#FF6B00]" />
                  <h3 className="font-bold text-sm text-white">Ranking de Partners – Satisfacción (CSAT)</h3>
                  <Info size={13} className="text-gray-500" />
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                      <th className="py-1 text-left">#</th>
                      <th className="py-1 text-left">Partner</th>
                      <th className="py-1 text-center">Encuestas</th>
                      <th className="py-1 text-center">Nota (1–5)</th>
                      <th className="py-1 text-right">CSAT</th>
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

            {/* FILA 4: ALERTAS OPERATIVAS + OPORTUNIDADES DE MEJORA */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-2">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <h3 className="font-bold text-sm text-white">Alertas Operativas</h3>
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                      <th className="py-1.5 text-left">Motivo</th>
                      <th className="py-1.5 text-center">Cantidad</th>
                      <th className="py-1.5 text-center">% sobre base</th>
                      <th className="py-1.5 text-center">Tendencia</th>
                      <th className="py-1.5 text-left">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    <tr>
                      <td className="py-2 flex items-center gap-2 font-medium text-white">
                        <AlertTriangle size={14} className="text-red-500" /> Mensajes no enviados
                      </td>
                      <td className="py-2 text-center font-bold">{metrics.noEnviados}</td>
                      <td className="py-2 text-center">23,3%</td>
                      <td className="py-2 text-center text-red-400 font-bold">▲ +2,1 pp</td>
                      <td className="py-2 text-gray-400 text-[11px]">Órdenes sin WhatsApp válido o con rechazo de envío.</td>
                    </tr>
                    <tr>
                      <td className="py-2 flex items-center gap-2 font-medium text-white">
                        <AlertTriangle size={14} className="text-amber-400" /> Mensajes leídos sin ingreso
                      </td>
                      <td className="py-2 text-center font-bold">{metrics.leidosSinIngreso}</td>
                      <td className="py-2 text-center">39,0%</td>
                      <td className="py-2 text-center text-red-400 font-bold">▲ +1,9 pp</td>
                      <td className="py-2 text-gray-400 text-[11px]">Clientes que leen el mensaje, pero no ingresan al tracking.</td>
                    </tr>
                    <tr>
                      <td className="py-2 flex items-center gap-2 font-medium text-white">
                        <AlertTriangle size={14} className="text-amber-400" /> Fallidos en envío
                      </td>
                      <td className="py-2 text-center font-bold">{metrics.fallidos}</td>
                      <td className="py-2 text-center">5,0%</td>
                      <td className="py-2 text-center text-emerald-400 font-bold">▼ -1,3 pp</td>
                      <td className="py-2 text-gray-400 text-[11px]">Errores de entrega (número inválido, bloqueo, otros).</td>
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
                  <li className="flex items-start gap-2">
                    <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>Incrementar el ingreso a tracking en segmento Preferente (+2,5 pp).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>Elevar la tasa de autogestión web ≥ 80%.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>Mantener la satisfacción de partners ≥ 4,5 (≥ 92% CSAT).</span>
                  </li>
                </ul>
              </div>
            </div>
          </>
        ) : (
          /* VISTA OPERATIVA: TABLA INTERACTIVA DE ÓRDENES EN RUTA */
          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <ClipboardList size={16} className="text-[#FF6B00]" />
                  Detalle Operativo de Órdenes y Despacho en Campo
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Filtra por cliente, código de orden, técnico asignado o estado del mensaje WhatsApp
                </p>
              </div>

              <div className="flex items-center gap-2.5 text-xs">
                {/* Buscador */}
                <div className="flex items-center bg-[#090D16] border border-gray-700 rounded-lg px-3 py-1.5 w-64">
                  <Search size={14} className="text-gray-400 mr-2" />
                  <input
                    type="text"
                    placeholder="Buscar orden, cliente, DNI o técnico..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-gray-200 focus:outline-none w-full text-xs"
                  />
                </div>

                {/* Filtro por Estado WHS */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#090D16] border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none cursor-pointer"
                >
                  <option value="Todos">Todos los estados WHS</option>
                  <option value="Ingresó Tracking">Ingresó Tracking</option>
                  <option value="Leído">Leído</option>
                  <option value="Entregado">Entregado</option>
                  <option value="No enviado">No enviado</option>
                  <option value="Fallido">Fallido</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                    <th className="py-2 text-left">Código Orden</th>
                    <th className="py-2 text-left">Cliente / DNI</th>
                    <th className="py-2 text-left">Servicio / Zona</th>
                    <th className="py-2 text-left">Partner / Técnico</th>
                    <th className="py-2 text-center">Franja Horaria</th>
                    <th className="py-2 text-center">Estado WhatsApp</th>
                    <th className="py-2 text-center">CSAT</th>
                    <th className="py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500">
                        No se encontraron órdenes para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-800/30 transition">
                        <td className="py-2.5 font-bold text-[#FF6B00]">{order.id}</td>
                        <td className="py-2.5">
                          <div className="font-semibold text-white">{order.client}</div>
                          <div className="text-[10px] text-gray-400">DNI: {order.dni}</div>
                        </td>
                        <td className="py-2.5">
                          <div className="text-gray-200">{order.service}</div>
                          <div className="text-[10px] text-gray-400">{order.zone}</div>
                        </td>
                        <td className="py-2.5">
                          <div className="font-semibold text-white">{order.partner}</div>
                          <div className="text-[10px] text-gray-400 flex items-center gap-1">
                            <User size={10} /> {order.tech}
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[11px]">{order.slot}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            order.whsStatus === 'Ingresó Tracking' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            order.whsStatus === 'Leído' ? 'bg-emerald-500/20 text-emerald-300' :
                            order.whsStatus === 'Entregado' ? 'bg-cyan-500/20 text-cyan-300' :
                            order.whsStatus === 'No enviado' ? 'bg-gray-700 text-gray-300' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {order.whsStatus}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {order.csat ? (
                            <span className="font-bold text-amber-400">{order.csat},0 ★</span>
                          ) : (
                            <span className="text-gray-500 text-[11px]">Pendiente</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <button 
                            onClick={() => alert(`Abriendo enlace de tracking en vivo para ${order.id} (${order.client})`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1F2937] hover:bg-[#FF6B00] hover:text-white text-gray-300 rounded text-[11px] transition"
                          >
                            <span>Ver ruta</span>
                            <ExternalLink size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

/* Subcomponentes */
function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition ${
        active
          ? 'bg-gradient-to-r from-[#FF6B00] to-[#FF8533] text-white font-semibold shadow-md shadow-orange-500/20'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
      }`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function StatusRow({ color, label, count, pct }: { color: string; label: string; count: string; pct: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-sm ${color}`}></span>
        <span className="text-gray-300">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-200 font-semibold">{count}</span>
        <span className="text-gray-400 w-10 text-right">{pct}</span>
      </div>
    </div>
  );
}

function PartnerRow({ rank, name, surveys, score, csat }: { rank: number; name: string; surveys: number; score: string; csat: string }) {
  return (
    <tr>
      <td className="py-1.5">
        <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${rank <= 3 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-gray-400'}`}>
          {rank}
        </span>
      </td>
      <td className="py-1.5 font-semibold text-white">{name}</td>
      <td className="py-1.5 text-center text-gray-300">{surveys}</td>
      <td className="py-1.5 text-center font-bold text-white">
        {score} <span className="text-amber-400">★</span>
      </td>
      <td className="py-1.5 text-right">
        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">{csat}</span>
      </td>
    </tr>
  );
}