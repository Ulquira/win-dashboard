import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ClipboardList, Wrench, LogOut, Shield } from 'lucide-react';
import {
  ViewMode, NavSection, KpiData, EvolutionPoint,
  RealOrder, PartnerRankItem, CalculatedMetrics, AuthUser
} from './types/dashboard';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { OrderDetailDrawer } from './components/OrderDetailDrawer';
import { LoginView } from './views/LoginView';
import { apiFetch, API_BASE_URL, AUTH_TOKEN_KEY, AUTH_USER_KEY } from './config/api';

const HomeView = lazy(() => import('./views/HomeView').then((m) => ({ default: m.HomeView })));
const ExecutiveView = lazy(() => import('./views/ExecutiveView').then((m) => ({ default: m.ExecutiveView })));
const OperationalView = lazy(() => import('./views/OperationalView').then((m) => ({ default: m.OperationalView })));
const OperationsDashboardView = lazy(() => import('./views/OperationsDashboardView').then((m) => ({ default: m.OperationsDashboardView })));
const TrackingView = lazy(() => import('./views/TrackingView').then((m) => ({ default: m.TrackingView })));
const OrdersView = lazy(() => import('./views/OrdersView').then((m) => ({ default: m.OrdersView })));
const UsersRolesView = lazy(() => import('./views/UsersRolesView').then((m) => ({ default: m.UsersRolesView })));
const CsatView = lazy(() => import('./views/CsatView').then((m) => ({ default: m.CsatView })));

const VALID_NAVS: NavSection[] = [
  'Inicio',
  'Dashboard',
  'Órdenes',
  'Seguimiento',
  'Eficiencia',
  'Experiencia (CSAT)',
  'Accesos',
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
  // Estado de Autenticación y Permisos RBAC
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(AUTH_USER_KEY);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (saved && token) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    const onForceLogout = () => setAuthUser(null);
    window.addEventListener('win-auth-logout', onForceLogout);
    return () => window.removeEventListener('win-auth-logout', onForceLogout);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.clear();
    setSelectedServices([]);
    setAuthUser(null);
  };

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

  const [selectedOrder, setSelectedOrder] = useState<RealOrder | null>(null);
  const [consultTrigger, setConsultTrigger] = useState<number>(0);

  const { data: filtersData } = useQuery<any>({
    queryKey: ['catalogFilters'],
    enabled: Boolean(authUser),
    queryFn: ({ signal }): Promise<any> => (apiFetch as any)('/api/filters', { signal }),
    staleTime: 1000 * 60 * 30,
  });

  // Filtrar servicios disponibles según el Rol del usuario logueado
  const rawServiceOptions: string[] =
    filtersData?.ok && Array.isArray(filtersData.servicios) && filtersData.servicios.length > 0
      ? filtersData.servicios
      : DEFAULT_SERVICES;

  const allowedRoleServices = authUser?.permisos?.servicios || ['*'];
  const isAllServicesAllowed = allowedRoleServices.includes('*');

  const serviceOptions: string[] = isAllServicesAllowed
    ? rawServiceOptions
    : rawServiceOptions.filter((s) => allowedRoleServices.includes(s));

  // Subvistas del Dashboard permitidas por el Rol
  const allowedViews = authUser?.permisos?.vistas || ['*'];
  const canSeeView = (v: NavSection) =>
    v === 'Inicio' || v === 'Experiencia (CSAT)' || allowedViews.includes('*') || allowedViews.includes(v);

  const allowedSubviews = authUser?.permisos?.subvistas || ['*'];
  const canSeeSubview = (sv: ViewMode) =>
    allowedSubviews.includes('*') || allowedSubviews.includes(sv);

  // Sincronizar permisos y renovar token JWT desde la BD al montar
  useEffect(() => {
    if (!authUser) return;
    apiFetch('/api/auth/me')
      .then((res) => {
        if (res?.ok && res.user) {
          if (res.token) localStorage.setItem(AUTH_TOKEN_KEY, res.token);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
          setAuthUser(res.user);
        }
      })
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  // Forzar limpieza de servicios, vistas y subvistas cuando cambia el rol del usuario
  useEffect(() => {
    if (!authUser) return;

    // 1. Limpiar servicios seleccionados en el Header que no pertenezcan al rol
    if (!isAllServicesAllowed) {
      setSelectedServices((prev) => {
        const valid = prev.filter((s) => allowedRoleServices.includes(s));
        return valid.length !== prev.length ? valid : prev;
      });
    }

    // 2. Si la vista actual (ej. 'Accesos') no está permitida para el rol, redirigir a la primera permitida
    if (!canSeeView(activeNav)) {
      const firstAllowed = VALID_NAVS.find((v) => canSeeView(v)) || 'Dashboard';
      setActiveNav(firstAllowed);
    }

    // 3. Si la subvista del Dashboard (ej. 'operaciones') no está permitida, redirigir a la primera permitida
    if (!canSeeSubview(viewMode)) {
      const firstSub = VALID_VIEWS.find((sv) => canSeeSubview(sv)) || 'ejecutiva';
      setViewMode(firstSub);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, activeNav, viewMode]);

  const validSelectedServices = isAllServicesAllowed
    ? selectedServices
    : selectedServices.filter((s) => allowedRoleServices.includes(s));

  const service =
    validSelectedServices.length > 0
      ? validSelectedServices.join(',')
      : isAllServicesAllowed
        ? 'Todos los servicios'
        : serviceOptions.join(',');

  // Base scope permitido para la consulta inicial según el rol (permite filtrado en memoria a 0 ms)
  const baseServiceScope = isAllServicesAllowed
    ? 'Todos los servicios'
    : serviceOptions.join(',');

  const zone = 'Todas las zonas';
  const sectorOptions: string[] = filtersData?.sectores || filtersData?.zonas || EMPTY_ARRAY;
  const partnerOptions: string[] = filtersData?.partners || EMPTY_ARRAY;

  const needsMainDashboard =
    activeNav === 'Inicio' || (activeNav === 'Dashboard' && viewMode !== 'operaciones');

  const {
    data: dashData,
    isFetching: loading,
    isError,
    error: queryError,
    refetch: refetchDashboard,
  } = useQuery<any>({
    queryKey: ['dashboardMain', startDate, endDate, baseServiceScope, zone, consultTrigger, authUser?.documento],
    enabled: Boolean(authUser) && needsMainDashboard,
    queryFn: async ({ signal }): Promise<any> => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service: baseServiceScope,
        zone,
        refresh: consultTrigger > 0 ? 'true' : 'false',
      });
      return (apiFetch as any)(`/api/dashboard?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const queryClient = useQueryClient();

  // Pre-cargar Operaciones de Campo, CSAT, Órdenes y Seguimiento en segundo plano cuando el Dashboard termina de cargar
  useEffect(() => {
    if (!authUser || !dashData?.ok) return;
    const timer = setTimeout(() => {
      const opsParams = new URLSearchParams({
        startDate,
        endDate,
        service: baseServiceScope,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
        refresh: 'false',
      });
      queryClient.prefetchQuery({
        queryKey: ['operationsDashboard', startDate, endDate, baseServiceScope, globalSearch, ignoreDates, 0],
        queryFn: () => apiFetch(`/api/operations?${opsParams.toString()}`),
        staleTime: 1000 * 60 * 5,
      });

      const csatParams = new URLSearchParams({
        startDate,
        endDate,
        service: baseServiceScope,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
        refresh: 'false',
      });
      queryClient.prefetchQuery({
        queryKey: ['csatApp', startDate, endDate, baseServiceScope, globalSearch, ignoreDates, 0],
        queryFn: () => apiFetch(`/api/csat?${csatParams.toString()}`),
        staleTime: 1000 * 60 * 5,
      });

      const defaultColFilters = {
        orden: '',
        cliente: '',
        operacion: [],
        sector: [],
        partner: [],
        estadoOt: [],
        wsp: [],
        tracking: [],
      };
      const ordParams = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
        orden: '',
        cliente: '',
        operacion: 'Todos',
        sector: 'Todos',
        partner: 'Todos',
        estadoOt: 'Todos',
        wsp: 'Todos',
        tracking: 'Todos',
        page: '1',
        pageSize: '50',
      });
      queryClient.prefetchQuery({
        queryKey: ['ordersSearch', startDate, endDate, service, globalSearch, ignoreDates, defaultColFilters, 1],
        queryFn: () => apiFetch(`/api/orders/search?${ordParams.toString()}`),
        staleTime: 1000 * 60 * 3,
      });

      for (const soloConChatBool of [true, false]) {
        const params = new URLSearchParams({
          startDate,
          endDate,
          service,
          q: globalSearch,
          ignoreDates: ignoreDates ? 'true' : 'false',
          soloConChat: soloConChatBool ? 'true' : 'false',
          soloSos: 'false',
          soloLogChat: 'false',
          sla: 'Todos',
          turno: 'Todos',
          page: '1',
          pageSize: '50',
          refresh: 'false',
        });
        queryClient.prefetchQuery({
          queryKey: ['trackingSearch', startDate, endDate, service, globalSearch, ignoreDates, soloConChatBool, false, false, 'Todos', 'Todos', 1, 0],
          queryFn: () => apiFetch(`/api/tracking/search?${params.toString()}`),
          staleTime: 1000 * 60 * 3,
        });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [authUser, dashData?.ok, startDate, endDate, service, baseServiceScope, globalSearch, ignoreDates, queryClient]);

  const dbOnline = Boolean(dashData?.ok && !isError);
  const errorMsg = isError
    ? `No se pudo conectar a la API ${API_BASE_URL} (${(queryError as Error)?.message || 'Error'})`
    : dashData && !dashData.ok
      ? dashData.error || 'Error desconocido en la respuesta de la API'
      : null;

  // Nivel 1: Filtrado y Rollup reactivo en memoria para respuesta instantánea (0 ms)
  const filteredDashboard = useMemo(() => {
    if (!dashData?.ok) {
      return {
        kpis: null,
        evolution: EMPTY_ARRAY,
        dailyInRange: EMPTY_ARRAY,
        byEstadoOt: EMPTY_ARRAY,
        bySector: EMPTY_ARRAY,
        byTipoOperacion: EMPTY_ARRAY,
        orders: EMPTY_ARRAY,
        partners: EMPTY_ARRAY,
      };
    }

    const rawAggregated: any[] = dashData.rawAggregated || [];
    const allOrders: RealOrder[] = dashData.orders || [];
    const allPartners: PartnerRankItem[] = dashData.partners || [];

    // Fallback si no viniera rawAggregated
    if (rawAggregated.length === 0) {
      return {
        kpis: dashData.kpis || null,
        evolution: dashData.evolution || EMPTY_ARRAY,
        dailyInRange: dashData.dailyInRange || EMPTY_ARRAY,
        byEstadoOt: dashData.byEstadoOt || EMPTY_ARRAY,
        bySector: dashData.bySector || EMPTY_ARRAY,
        byTipoOperacion: dashData.byTipoOperacion || EMPTY_ARRAY,
        orders: allOrders,
        partners: allPartners,
      };
    }

    const isFiltering = validSelectedServices.length > 0;
    const filterSet = new Set(validSelectedServices.map((s) => s.toUpperCase()));

    // 1. Filtrar filas agregadas si hay selección específica de tipos de servicio
    const activeRows = isFiltering
      ? rawAggregated.filter((r) => filterSet.has(String(r.tipo_operacion || '').toUpperCase()))
      : rawAggregated;

    const dailyMap = new Map<string, any>();
    const estadoOtMap = new Map<string, any>();
    const sectorMap = new Map<string, any>();
    const tipoOpMap = new Map<string, any>();

    for (const r of activeRows) {
      const tot = Number(r.total || 0);
      const env = Number(r.enviados || 0);
      const lei = Number(r.leidos || 0);
      const trk = Number(r.tracking || 0);

      // Agrupación Diaria (evolutiva)
      const day = dailyMap.get(r.raw_date) || {
        raw_date: r.raw_date,
        fecha: r.fecha,
        fecha_full: r.fecha_full,
        total: 0,
        enviados: 0,
        leidos: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        no_enviado: 0,
        tracking: 0,
        sos_soporte: 0,
        autogestionados: 0,
        reprogramaciones: 0,
        encuestas: 0,
        leidos_sin_ingreso: 0,
        av_total: 0,
        av_enviados: 0,
        av_leidos: 0,
        av_tracking: 0,
        pref_total: 0,
        pref_enviados: 0,
        pref_leidos: 0,
        pref_tracking: 0,
      };
      day.total += tot;
      day.enviados += env;
      day.leidos += lei;
      day.sent += Number(r.sent || 0);
      day.delivered += Number(r.delivered || 0);
      day.failed += Number(r.failed || 0);
      day.no_enviado += Number(r.no_enviado || 0);
      day.tracking += trk;
      day.sos_soporte += Number(r.sos_soporte || 0);
      day.autogestionados += Number(r.autogestionados || 0);
      day.reprogramaciones += Number(r.reprogramaciones || 0);
      day.encuestas += Number(r.encuestas || 0);
      day.leidos_sin_ingreso += Number(r.leidos_sin_ingreso || 0);
      day.av_total += Number(r.av_total || 0);
      day.av_enviados += Number(r.av_enviados || 0);
      day.av_leidos += Number(r.av_leidos || 0);
      day.av_tracking += Number(r.av_tracking || 0);
      day.pref_total += Number(r.pref_total || 0);
      day.pref_enviados += Number(r.pref_enviados || 0);
      day.pref_leidos += Number(r.pref_leidos || 0);
      day.pref_tracking += Number(r.pref_tracking || 0);
      dailyMap.set(r.raw_date, day);

      // Desglose para el rango seleccionado (startDate..endDate)
      if (r.raw_date >= startDate && r.raw_date <= endDate) {
        // Estado OT
        const stKey = r.estado_ot || 'Sin estado';
        const st = estadoOtMap.get(stKey) || { estado_ot: stKey, total: 0, enviados: 0, leidos: 0, tracking: 0 };
        st.total += tot;
        st.enviados += env;
        st.leidos += lei;
        st.tracking += trk;
        estadoOtMap.set(stKey, st);

        // Sector Operativo
        const secKey = r.sector_operativo || 'SIN SECTOR';
        const sec = sectorMap.get(secKey) || { sector_operativo: secKey, total: 0, enviados: 0, no_enviados: 0, tracking: 0, leidos: 0 };
        sec.total += tot;
        sec.enviados += env;
        sec.no_enviados += Number(r.no_enviado || 0);
        sec.tracking += trk;
        sec.leidos += lei;
        sectorMap.set(secKey, sec);

        // Tipo de Operación
        const topKey = r.tipo_operacion || 'OTROS';
        const top = tipoOpMap.get(topKey) || { tipo: topKey, total: 0, enviados: 0 };
        top.total += tot;
        top.enviados += env;
        tipoOpMap.set(topKey, top);
      }
    }

    const dailyRows = Array.from(dailyMap.values()).sort((a, b) => a.raw_date.localeCompare(b.raw_date));
    const kpiRowsInRange = dailyRows.filter((r) => r.raw_date >= startDate && r.raw_date <= endDate);
    const byEstadoOt = Array.from(estadoOtMap.values()).sort((a, b) => b.total - a.total);
    const bySector = Array.from(sectorMap.values()).sort((a, b) => b.total - a.total);
    const byTipoOperacion = Array.from(tipoOpMap.values()).sort((a, b) => b.total - a.total);

    const computedKpis: KpiData = kpiRowsInRange.reduce(
      (acc, row) => ({
        total_ordenes: acc.total_ordenes + Number(row.total || 0),
        whs_enviados: acc.whs_enviados + Number(row.enviados || 0),
        whs_leidos: acc.whs_leidos + Number(row.leidos || 0),
        whs_sent: acc.whs_sent + Number(row.sent || 0),
        whs_delivered: acc.whs_delivered + Number(row.delivered || 0),
        whs_failed: acc.whs_failed + Number(row.failed || 0),
        whs_no_enviado: acc.whs_no_enviado + Number(row.no_enviado || 0),
        ingreso_tracking: acc.ingreso_tracking + Number(row.tracking || 0),
        sos_soporte: acc.sos_soporte + Number(row.sos_soporte || 0),
        autogestionados: acc.autogestionados + Number(row.autogestionados || 0),
        reprogramaciones: acc.reprogramaciones + Number(row.reprogramaciones || 0),
        encuestas_respondidas: acc.encuestas_respondidas + Number(row.encuestas || 0),
        csat_avg: dashData.kpis?.csat_avg || '0.0',
        leidos_sin_ingreso: acc.leidos_sin_ingreso + Number(row.leidos_sin_ingreso || 0),
        av_total: acc.av_total + Number(row.av_total || 0),
        av_enviados: acc.av_enviados + Number(row.av_enviados || 0),
        av_leidos: acc.av_leidos + Number(row.av_leidos || 0),
        av_tracking: acc.av_tracking + Number(row.av_tracking || 0),
        pref_total: acc.pref_total + Number(row.pref_total || 0),
        pref_enviados: acc.pref_enviados + Number(row.pref_enviados || 0),
        pref_leidos: acc.pref_leidos + Number(row.pref_leidos || 0),
        pref_tracking: acc.pref_tracking + Number(row.pref_tracking || 0),
      }),
      {
        total_ordenes: 0,
        whs_enviados: 0,
        whs_leidos: 0,
        whs_sent: 0,
        whs_delivered: 0,
        whs_failed: 0,
        whs_no_enviado: 0,
        ingreso_tracking: 0,
        sos_soporte: 0,
        autogestionados: 0,
        reprogramaciones: 0,
        encuestas_respondidas: 0,
        csat_avg: dashData.kpis?.csat_avg || '0.0',
        leidos_sin_ingreso: 0,
        av_total: 0,
        av_enviados: 0,
        av_leidos: 0,
        av_tracking: 0,
        pref_total: 0,
        pref_enviados: 0,
        pref_leidos: 0,
        pref_tracking: 0,
      }
    );

    const encuestasByService: any[] = dashData.encuestasByService || [];
    let filteredPartners: PartnerRankItem[] = allPartners;

    if (!isFiltering && dashData.kpis) {
      if (dashData.kpis.reprogramaciones !== undefined) {
        computedKpis.reprogramaciones = dashData.kpis.reprogramaciones;
      }
      if (dashData.kpis.encuestas_respondidas !== undefined) {
        computedKpis.encuestas_respondidas = dashData.kpis.encuestas_respondidas;
      }
      if (dashData.kpis.csat_avg !== undefined) {
        computedKpis.csat_avg = dashData.kpis.csat_avg;
      }
    } else if (isFiltering && encuestasByService.length > 0) {
      const activeEnc = encuestasByService.filter((e) =>
        filterSet.has(String(e.tipo_operacion || '').toUpperCase())
      );

      const pMap = new Map<string, { partner: string; surveys: number; sumPoints: number }>();
      let totalSv = 0;
      let totalPts = 0;

      for (const e of activeEnc) {
        const sv = Number(e.surveys || 0);
        const avg = Number(e.avg_score || 0);
        totalSv += sv;
        totalPts += avg * sv;

        const cur = pMap.get(e.partner) || { partner: e.partner, surveys: 0, sumPoints: 0 };
        cur.surveys += sv;
        cur.sumPoints += avg * sv;
        pMap.set(e.partner, cur);
      }

      computedKpis.encuestas_respondidas = totalSv;
      computedKpis.csat_avg = totalSv > 0 ? Number((totalPts / totalSv).toFixed(2)) : 0;

      filteredPartners = Array.from(pMap.values())
        .map((p) => ({
          partner: p.partner,
          surveys: p.surveys,
          avg_score: p.surveys > 0 ? p.sumPoints / p.surveys : 0,
        }))
        .sort((a, b) => b.avg_score - a.avg_score || b.surveys - a.surveys)
        .slice(0, 6)
        .map((r, idx) => {
          const csatPct = (r.avg_score / 5) * 100;
          return {
            rank: idx + 1,
            name: r.partner,
            surveys: r.surveys,
            score: r.avg_score.toFixed(1).replace('.', ','),
            csat: `${csatPct.toFixed(1).replace('.', ',')}%`,
          };
        });
    }

    const filteredOrders = isFiltering
      ? allOrders.filter((o: any) =>
          filterSet.has(String(o.servicio_tipo || o.tipo_operacion || '').toUpperCase())
        )
      : allOrders;

    return {
      kpis: computedKpis,
      evolution: dailyRows,
      dailyInRange: kpiRowsInRange,
      byEstadoOt,
      bySector,
      byTipoOperacion,
      orders: filteredOrders,
      partners: filteredPartners,
    };
  }, [dashData, validSelectedServices, startDate, endDate]);

  const {
    kpis,
    evolution,
    dailyInRange,
    byEstadoOt,
    bySector,
    byTipoOperacion,
    orders,
    partners,
  } = filteredDashboard;

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

  // Si no hay sesión activa, renderizar pantalla de Login
  if (!authUser) {
    return <LoginView onLoginSuccess={(user) => setAuthUser(user)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA] text-slate-800 font-sans relative">
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
        allowedViews={authUser.permisos?.vistas || ['*']}
        allowedSubviews={authUser.permisos?.subvistas || ['*']}
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-5 max-w-full min-w-0">
        {/* Barra superior de sesión activa y rol */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-100 rounded-2xl px-4 py-2 shadow-2xs text-xs">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-extrabold text-[11px]">
              <Shield size={12} />
              <span>{authUser.permisos?.rolNombre || 'Usuario'}</span>
            </span>
            <span className="text-slate-700 font-bold">{authUser.nombre}</span>
            <span className="text-slate-400 text-[11px]">({authUser.documento})</span>
          </div>

          <div className="flex items-center gap-3">
            {!isAllServicesAllowed && (
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Alcance:{' '}
                <strong className="text-slate-800">{serviceOptions.join(' • ')}</strong>
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 font-bold text-[11px] transition cursor-pointer"
            >
              <LogOut size={12} />
              <span>Salir</span>
            </button>
          </div>
        </div>

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

        <Suspense fallback={<div className="h-64 rounded-2xl bg-white/60 animate-pulse border border-slate-100" />}>
          {activeNav === 'Inicio' && (
            <HomeView
              authUser={authUser}
              calc={calc}
              kpis={kpis}
              startDate={startDate}
              endDate={endDate}
              service={service}
              serviceOptions={serviceOptions}
              canSeeView={canSeeView}
              canSeeSubview={canSeeSubview}
              onNavigate={(nav, subview) => {
                setActiveNav(nav);
                if (subview) setViewMode(subview);
              }}
              onSelectOrder={setSelectedOrder}
            />
          )}

          {activeNav === 'Dashboard' && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2 bg-slate-200/60 p-1 rounded-2xl border border-slate-200/60">
                  {canSeeSubview('ejecutiva') && (
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
                  )}
                  {canSeeSubview('operativa') && (
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
                  )}
                  {canSeeSubview('operaciones') && (
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
                  )}
                </div>
              </div>

              {viewMode === 'operaciones' ? (
                <OperationsDashboardView
                  startDate={startDate}
                  endDate={endDate}
                  service={service}
                  serviceScope={baseServiceScope}
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

          {activeNav === 'Experiencia (CSAT)' && (
            <CsatView
              startDate={startDate}
              endDate={endDate}
              service={service}
              serviceScope={baseServiceScope}
              globalSearch={globalSearch}
              ignoreDates={ignoreDates}
              consultTrigger={consultTrigger}
              onSelectOrder={setSelectedOrder}
            />
          )}

          {activeNav === 'Accesos' && canSeeView('Accesos') && <UsersRolesView />}
        </Suspense>

        <OrderDetailDrawer
          selectedOrder={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      </main>
    </div>
  );
}