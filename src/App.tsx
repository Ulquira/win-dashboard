import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Activity, ClipboardList, Wrench } from 'lucide-react';
import {
  ViewMode, NavSection, KpiData, EvolutionPoint,
  RealOrder, PartnerRankItem, CalculatedMetrics
} from './types/dashboard';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { OrderDetailDrawer } from './components/OrderDetailDrawer';
import { ExecutiveView } from './views/ExecutiveView';
import { OperationalView } from './views/OperationalView';
import { OperationsDashboardView } from './views/OperationsDashboardView';
import { TrackingView } from './views/TrackingView';
import { OrdersView } from './views/OrdersView';
import { apiFetch, API_BASE_URL } from './config/api';

const VALID_NAVS: NavSection[] = [
  'Inicio',
  'Dashboard',
  'Órdenes',
  'Seguimiento',
  'Eficiencia',
  'Experiencia (CSAT)',
];
const VALID_VIEWS: ViewMode[] = ['ejecutiva', 'operativa', 'operaciones'];

const DEFAULT_SERVICES = [
  'INSTA - LIMA',
  'INSTA - PROV',
  'AVER - LIMA',
  'AVER - PROV',
  'POSTVENTA',
];

const EMPTY_ARRAY: any[] = [];

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('nav') as NavSection;
    if (fromUrl && VALID_NAVS.includes(fromUrl)) return fromUrl;
    const saved = localStorage.getItem('win_active_nav') as NavSection;
    return saved && VALID_NAVS.includes(saved) ? saved : 'Dashboard';
  });

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('view') as ViewMode;
    if (fromUrl && VALID_VIEWS.includes(fromUrl)) return fromUrl;
    const saved = localStorage.getItem('win_view_mode') as ViewMode;
    return saved && VALID_VIEWS.includes(saved) ? saved : 'ejecutiva';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('win_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('win_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('win_theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('win_active_nav', activeNav);
    localStorage.setItem('win_view_mode', viewMode);

    const url = new URL(window.location.href);
    url.searchParams.set('nav', activeNav);
    if (activeNav === 'Dashboard') {
      url.searchParams.set('view', viewMode);
    } else {
      url.searchParams.delete('view');
    }
    window.history.replaceState({}, '', url.toString());
  }, [activeNav, viewMode]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const navParam = params.get('nav') as NavSection;
      const viewParam = params.get('view') as ViewMode;
      if (navParam && VALID_NAVS.includes(navParam)) setActiveNav(navParam);
      if (viewParam && VALID_VIEWS.includes(viewParam)) setViewMode(viewParam);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [startDate, setStartDate] = useState<string>(() => {
    return sessionStorage.getItem('win_startDate') || new Date().toLocaleDateString('en-CA');
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return sessionStorage.getItem('win_endDate') || new Date().toLocaleDateString('en-CA');
  });
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    const saved = sessionStorage.getItem('win_selectedServices');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [globalSearch, setGlobalSearch] = useState<string>(() => {
    return sessionStorage.getItem('win_globalSearch') || '';
  });
  const [ignoreDates, setIgnoreDates] = useState<boolean>(() => {
    return sessionStorage.getItem('win_ignoreDates') === 'true';
  });

  useEffect(() => {
    sessionStorage.setItem('win_startDate', startDate);
    sessionStorage.setItem('win_endDate', endDate);
    sessionStorage.setItem('win_selectedServices', JSON.stringify(selectedServices));
    sessionStorage.setItem('win_globalSearch', globalSearch);
    sessionStorage.setItem('win_ignoreDates', String(ignoreDates));
  }, [startDate, endDate, selectedServices, globalSearch, ignoreDates]);

  const service = selectedServices.length > 0 ? selectedServices.join(',') : 'Todos los servicios';
  const zone = 'Todas las zonas';

  const [selectedOrder, setSelectedOrder] = useState<RealOrder | null>(null);
  const [consultTrigger, setConsultTrigger] = useState<number>(0);

  const { data: filtersData } = useQuery<any>({
    queryKey: ['catalogFilters'],
    queryFn: ({ signal }) => apiFetch('/api/filters', { signal }),
    staleTime: 1000 * 60 * 30,
  });

  const serviceOptions: string[] =
    filtersData?.ok && Array.isArray(filtersData.servicios) && filtersData.servicios.length > 0
      ? filtersData.servicios
      : DEFAULT_SERVICES;
  const sectorOptions: string[] = filtersData?.sectores || filtersData?.zonas || EMPTY_ARRAY;
  const partnerOptions: string[] = filtersData?.partners || EMPTY_ARRAY;

  const {
    data: dashData,
    isFetching: loading,
    isError,
    error: queryError,
    refetch: refetchDashboard,
  } = useQuery<any>({
    queryKey: ['dashboardMain', startDate, endDate, service, zone, consultTrigger],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        zone,
        refresh: consultTrigger > 0 ? 'true' : 'false',
      });
      return apiFetch(`/api/dashboard?${params.toString()}`, { signal });
    },
    placeholderData: keepPreviousData,
  });

  const dbOnline = Boolean(dashData?.ok && !isError);
  const errorMsg = isError
    ? `No se pudo conectar a la API ${API_BASE_URL} (${(queryError as Error)?.message || 'Error'})`
    : dashData && !dashData.ok
      ? dashData.error || 'Error desconocido en la respuesta de la API'
      : null;

  const kpis: KpiData | null = dashData?.kpis || null;
  const evolution: EvolutionPoint[] = dashData?.evolution || EMPTY_ARRAY;
  const dailyInRange: any[] = dashData?.dailyInRange || EMPTY_ARRAY;
  const byEstadoOt: any[] = dashData?.byEstadoOt || EMPTY_ARRAY;
  const bySector: any[] = dashData?.bySector || EMPTY_ARRAY;
  const byTipoOperacion: any[] = dashData?.byTipoOperacion || EMPTY_ARRAY;
  const orders: RealOrder[] = dashData?.orders || EMPTY_ARRAY;
  const partners: PartnerRankItem[] = dashData?.partners || EMPTY_ARRAY;

  const calc: CalculatedMetrics = useMemo(() => {
    const total = Number(kpis?.total_ordenes || 0);
    const enviados = Number(kpis?.whs_enviados || 0);
    const leidos = Number(kpis?.whs_leidos || 0);
    const sent = Number(kpis?.whs_sent || 0);
    const delivered = Number(kpis?.whs_delivered || 0);
    const failed = Number(kpis?.whs_failed || 0);
    const noEnviado = Number(kpis?.whs_no_enviado || 0);
    const tracking = Number(kpis?.ingreso_tracking || 0);
    const sos = Number(kpis?.sos_soporte || 0);
    const autogestion =
      kpis?.autogestionados !== undefined
        ? Number(kpis.autogestionados)
        : Math.max(0, tracking - sos);
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
      sosCount: fmt(sos),
      sosOverEnvPct: pct(sos, enviados),
      sosOverTrackPct: pct(sos, tracking),
      autogestionCount: fmt(autogestion),
      autogestionPct: pct(autogestion, tracking),
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

  return (
    <div className="flex min-h-screen bg-[#F8F9FA] text-slate-800 font-sans relative">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        activeNav={activeNav}
        viewMode={viewMode}
        setActiveNav={setActiveNav}
        setViewMode={setViewMode}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6 max-w-full min-w-0">
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs flex items-center justify-between shadow-xs">
            <span><strong>Aviso de conexión:</strong> {errorMsg}</span>
            <button
              onClick={() => {
                setConsultTrigger((prev) => prev + 1);
                refetchDashboard();
              }}
              className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-900 rounded-lg font-bold transition"
            >
              Reintentar
            </button>
          </div>
        )}

        <Header
          activeNav={activeNav}
          viewMode={viewMode}
          loading={loading}
          dbOnline={dbOnline}
          startDate={startDate}
          endDate={endDate}
          selectedServices={selectedServices}
          serviceOptions={serviceOptions}
          globalSearch={globalSearch}
          ignoreDates={ignoreDates}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          setSelectedServices={setSelectedServices}
          setGlobalSearch={setGlobalSearch}
          setIgnoreDates={setIgnoreDates}
          onConsult={() => setConsultTrigger((prev) => prev + 1)}
          onToggleSidebar={() => setMobileMenuOpen(!mobileMenuOpen)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        />

        {activeNav === 'Dashboard' && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 bg-slate-200/60 p-1 rounded-2xl border border-slate-200/60">
                <button
                  onClick={() => setViewMode('ejecutiva')}
                  className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-xl transition ${viewMode === 'ejecutiva'
                      ? 'bg-white text-[#FF5500] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <Activity size={14} className={viewMode === 'ejecutiva' ? 'text-[#FF5500]' : 'text-slate-400'} />
                  <span>Vista Ejecutiva</span>
                </button>
                <button
                  onClick={() => setViewMode('operativa')}
                  className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-xl transition ${viewMode === 'operativa'
                      ? 'bg-white text-[#FF5500] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <ClipboardList size={14} className={viewMode === 'operativa' ? 'text-[#FF5500]' : 'text-slate-400'} />
                  <span>Vista Operativa</span>
                </button>
                <button
                  onClick={() => setViewMode('operaciones')}
                  className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-xl transition ${viewMode === 'operaciones'
                      ? 'bg-white text-[#FF5500] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <Wrench size={14} className={viewMode === 'operaciones' ? 'text-[#FF5500]' : 'text-slate-400'} />
                  <span>Operaciones Campo</span>
                </button>
              </div>
            </div>

            {viewMode === 'operaciones' ? (
              <OperationsDashboardView
                startDate={startDate}
                endDate={endDate}
                service={service}
                globalSearch={globalSearch}
                ignoreDates={ignoreDates}
                consultTrigger={consultTrigger}
              />
            ) : (
              <>
                <KpiCards calc={calc} kpis={kpis} />
                {viewMode === 'ejecutiva' ? (
                  <ExecutiveView calc={calc} evolution={evolution} partners={partners} />
                ) : (
                  <OperationalView
                    calc={calc}
                    kpis={kpis}
                    dailyInRange={dailyInRange}
                    byEstadoOt={byEstadoOt}
                    bySector={bySector}
                    byTipoOperacion={byTipoOperacion}
                  />
                )}
              </>
            )}
          </>
        )}

        {activeNav === 'Órdenes' && (
          <OrdersView
            orders={orders}
            startDate={startDate}
            endDate={endDate}
            service={service}
            globalSearch={globalSearch}
            ignoreDates={ignoreDates}
            serviceOptions={serviceOptions}
            sectorOptions={sectorOptions}
            partnerOptions={partnerOptions}
            onSelectOrder={setSelectedOrder}
          />
        )}
        {activeNav === 'Seguimiento' && (
          <TrackingView
            orders={orders}
            startDate={startDate}
            endDate={endDate}
            service={service}
            globalSearch={globalSearch}
            ignoreDates={ignoreDates}
            consultTrigger={consultTrigger}
            onSelectOrder={setSelectedOrder}
          />
        )}
        <OrderDetailDrawer
          selectedOrder={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      </main>
    </div>
  );
}