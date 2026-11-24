import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  CalendarClock,
  UserX,
  TrendingUp,
  Download,
  Layers,
  AlertTriangle,
  BarChart3,
  LifeBuoy,
  ArrowUpRight,
  ArrowDownRight,
  PhoneOff,
  PhoneCall,
  Headphones,
  Sparkles,
} from 'lucide-react';
import { apiFetch, API_BASE_URL, AUTH_TOKEN_KEY } from '../config/api';

interface CohortComparisonViewProps {
  startDate: string;
  endDate: string;
  service: string;
  serviceScope?: string;
  globalSearch: string;
  ignoreDates: boolean;
  consultTrigger?: number;
  onSetDateRange?: (start: string, end: string) => void;
}

type ImpactSubTab = 'CAMPO' | 'ATC';
type PeriodGranularity = 'MENSUAL' | 'SEMANAL' | 'DIARIO';

interface CohortCounters {
  orders: number;
  conWsp: number;
  finalizadas: number;
  canceladas: number;
  regestion: number;
  reprogTotal: number;
  reprogWeb: number;
  ausente: number;
  sos: number;
  enCurso: number;
  agendadas: number;
}

interface AtcCounters {
  orders: number;
  ordersWithCall: number;
  totalCalls: number;
}

function emptyCounters(): CohortCounters {
  return {
    orders: 0,
    conWsp: 0,
    finalizadas: 0,
    canceladas: 0,
    regestion: 0,
    reprogTotal: 0,
    reprogWeb: 0,
    ausente: 0,
    sos: 0,
    enCurso: 0,
    agendadas: 0,
  };
}

function emptyAtcCounters(): AtcCounters {
  return { orders: 0, ordersWithCall: 0, totalCalls: 0 };
}

function addCellToCounters(acc: CohortCounters, cell: any, onlyWspBase: boolean) {
  const useWsp = onlyWspBase;
  acc.orders += useWsp ? Number(cell.con_wsp || 0) : Number(cell.total || 0);
  acc.conWsp += Number(cell.con_wsp || 0);
  acc.finalizadas += useWsp ? Number(cell.fin_wsp || 0) : Number(cell.finalizadas || 0);
  acc.canceladas += useWsp ? Number(cell.can_wsp || 0) : Number(cell.canceladas || 0);
  acc.regestion += useWsp ? Number(cell.reg_wsp || 0) : Number(cell.regestion || 0);
  acc.reprogTotal += useWsp ? Number(cell.reprog_wsp || 0) : Number(cell.reprog_total || 0);
  acc.reprogWeb += useWsp
    ? Number(cell.reprog_web_wsp ?? cell.reprog_web ?? 0)
    : Number(cell.reprog_web || 0);
  acc.ausente += useWsp ? Number(cell.ausente_wsp || 0) : Number(cell.ausente || 0);
  acc.sos += useWsp ? Number(cell.sos_wsp || 0) : Number(cell.sos || 0);
  acc.enCurso += Number(cell.en_curso || 0);
  acc.agendadas += Number(cell.agendadas || 0);
}

export function CohortComparisonView({
  startDate,
  endDate,
  service,
  serviceScope = 'Todos los servicios',
  globalSearch,
  ignoreDates,
  consultTrigger = 0,
}: CohortComparisonViewProps) {
  const [subTab, setSubTab] = useState<ImpactSubTab>('CAMPO');
  const [debouncedQuery, setDebouncedQuery] = useState<string>(globalSearch);
  const [onlyWspBase, setOnlyWspBase] = useState<boolean>(true);
  const [granularity, setGranularity] = useState<PeriodGranularity>('SEMANAL');
  const [exporting, setExporting] = useState<boolean>(false);

  // Controles exclusivos para el análisis de Deflexión ATC
  const [windowDays, setWindowDays] = useState<number>(3);
  const [onlyVtMotivos, setOnlyVtMotivos] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(globalSearch), 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Query 1: Estudio A/B de Efectividad en Campo
  const {
    data: cohortData,
    isFetching: loadingCampo,
    isError: isErrorCampo,
    error: queryErrorCampo,
  } = useQuery<any>({
    queryKey: [
      'cohortsDashboard',
      startDate,
      endDate,
      serviceScope,
      debouncedQuery,
      ignoreDates,
      consultTrigger,
    ],
    queryFn: async ({ signal }): Promise<any> => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service: serviceScope,
        q: debouncedQuery,
        ignoreDates: ignoreDates ? 'true' : 'false',
        refresh: consultTrigger > 0 ? 'true' : 'false',
      });
      return (apiFetch as any)(`/api/cohorts?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  // Query 2: Estudio de Deflexión de Llamadas ATC (se activa al abrir la pestaña ATC)
  const {
    data: atcImpactData,
    isFetching: loadingAtc,
    isError: isErrorAtc,
    error: queryErrorAtc,
  } = useQuery<any>({
    queryKey: [
      'cohortsAtcImpact',
      startDate,
      endDate,
      serviceScope,
      debouncedQuery,
      ignoreDates,
      windowDays,
      consultTrigger,
    ],
    enabled: subTab === 'ATC',
    queryFn: async ({ signal }): Promise<any> => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service: serviceScope,
        q: debouncedQuery,
        ignoreDates: ignoreDates ? 'true' : 'false',
        windowDays: String(windowDays),
        refresh: consultTrigger > 0 ? 'true' : 'false',
      });
      return (apiFetch as any)(`/api/cohorts/atc-impact?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const loading = subTab === 'CAMPO' ? loadingCampo : loadingAtc;
  const error =
    subTab === 'CAMPO'
      ? isErrorCampo
        ? (queryErrorCampo as Error)?.message
        : cohortData && !cohortData.ok
          ? cohortData.error
          : null
      : isErrorAtc
        ? (queryErrorAtc as Error)?.message
        : atcImpactData && !atcImpactData.ok
          ? atcImpactData.error
          : null;

  const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');
  const fmtPct = (n?: number) => `${Number(n || 0).toFixed(1).replace('.', ',')}%`;
  const calcPct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: debouncedQuery,
        ignoreDates: ignoreDates ? 'true' : 'false',
      });
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const res = await fetch(`${API_BASE_URL}/api/cohorts/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Error al generar Excel');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Impacto_WIN_en_Ruta_${startDate}_al_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exportando Excel:', e);
    } finally {
      setExporting(false);
    }
  };

  const selectedSrvSet = useMemo(() => {
    return service && service !== 'Todos los servicios' && service !== 'Todos'
      ? new Set(
          service
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        )
      : null;
  }, [service]);

  // ============================================================================
  // 1. CÁLCULO EN MEMORIA (0 ms): IMPACTO EN CAMPO (A/B)
  // ============================================================================
  const computed = useMemo(() => {
    const dailyCells: any[] = cohortData?.dailyCells || [];
    const estadosCells: any[] = cohortData?.estadosCells || [];
    const motivosCells: any[] = cohortData?.motivosCells || [];

    const matchesFilters = (tipoOp: string) => {
      const tUpper = String(tipoOp || '').toUpperCase();
      if (selectedSrvSet && !selectedSrvSet.has(tUpper)) return false;
      return true;
    };

    const globalSi = emptyCounters();
    const globalNo = emptyCounters();

    const quadrants: Record<
      string,
      { label: string; sub: string; si: CohortCounters; no: CohortCounters }
    > = {
      INSTA_LIMA: {
        label: 'Instalaciones • Lima',
        sub: 'INSTA - LIMA (Altas nuevas)',
        si: emptyCounters(),
        no: emptyCounters(),
      },
      INSTA_PROV: {
        label: 'Instalaciones • Provincia',
        sub: 'INSTA - PROV (Altas regiones)',
        si: emptyCounters(),
        no: emptyCounters(),
      },
      VISITA_LIMA: {
        label: 'Visita Técnica • Lima',
        sub: 'Averías + Postventa / Garantía Lima',
        si: emptyCounters(),
        no: emptyCounters(),
      },
      VISITA_PROV: {
        label: 'Visita Técnica • Provincia',
        sub: 'Averías + Postventa / Garantía Prov.',
        si: emptyCounters(),
        no: emptyCounters(),
      },
    };

    const weekRanges = new Map<number, { min: string; max: string }>();
    for (const c of dailyCells) {
      const wr = weekRanges.get(c.yw) || { min: c.raw_date, max: c.raw_date };
      if (c.raw_date < wr.min) wr.min = c.raw_date;
      if (c.raw_date > wr.max) wr.max = c.raw_date;
      weekRanges.set(c.yw, wr);
    }

    const timelineMap = new Map<
      string,
      { key: string; label: string; subLabel: string; si: CohortCounters; no: CohortCounters }
    >();

    for (const c of dailyCells) {
      if (!selectedSrvSet || selectedSrvSet.has(c.tipo_operacion.toUpperCase())) {
        const isInsta = c.tipo_operacion.toUpperCase().startsWith('INSTA');
        const isLima = c.ambito.toUpperCase() === 'LIMA';
        const qKey = isInsta
          ? isLima
            ? 'INSTA_LIMA'
            : 'INSTA_PROV'
          : isLima
            ? 'VISITA_LIMA'
            : 'VISITA_PROV';
        addCellToCounters(
          c.ingreso_tracking === 'SI' ? quadrants[qKey].si : quadrants[qKey].no,
          c,
          onlyWspBase
        );
      }

      if (!matchesFilters(c.tipo_operacion)) continue;

      if (c.ingreso_tracking === 'SI') {
        addCellToCounters(globalSi, c, onlyWspBase);
      } else {
        addCellToCounters(globalNo, c, onlyWspBase);
      }

      let tKey = '';
      let tLabel = '';
      let tSub = '';
      if (granularity === 'MENSUAL') {
        tKey = c.mes;
        const [y, m] = String(c.mes).split('-');
        const mNames: Record<string, string> = {
          '01': 'Enero',
          '02': 'Febrero',
          '03': 'Marzo',
          '04': 'Abril',
          '05': 'Mayo',
          '06': 'Junio',
          '07': 'Julio',
          '08': 'Agosto',
          '09': 'Septiembre',
          '10': 'Octubre',
          '11': 'Noviembre',
          '12': 'Diciembre',
        };
        tLabel = `${mNames[m] || c.mes} ${y}`;
        tSub = c.mes;
      } else if (granularity === 'SEMANAL') {
        tKey = String(c.yw);
        const rng = weekRanges.get(c.yw) || { min: c.raw_date, max: c.raw_date };
        tLabel = `Semana W${String(c.yw).slice(4)}`;
        tSub = `${rng.min.slice(5)} al ${rng.max.slice(5)}`;
      } else {
        tKey = c.raw_date;
        tLabel = c.fecha_corta;
        tSub = c.raw_date;
      }

      let tNode = timelineMap.get(tKey);
      if (!tNode) {
        tNode = {
          key: tKey,
          label: tLabel,
          subLabel: tSub,
          si: emptyCounters(),
          no: emptyCounters(),
        };
        timelineMap.set(tKey, tNode);
      }
      addCellToCounters(c.ingreso_tracking === 'SI' ? tNode.si : tNode.no, c, onlyWspBase);
    }

    const estMap = new Map<string, { estado: string; si: number; no: number }>();
    for (const e of estadosCells) {
      if (!matchesFilters(e.tipo_operacion)) continue;
      const cur = estMap.get(e.estado) || { estado: e.estado, si: 0, no: 0 };
      if (e.ingreso_tracking === 'SI') cur.si += onlyWspBase ? e.con_wsp : e.total;
      else cur.no += onlyWspBase ? e.con_wsp : e.total;
      estMap.set(e.estado, cur);
    }

    const motMap = new Map<string, { motivo: string; si: number; no: number }>();
    for (const m of motivosCells) {
      if (!matchesFilters(m.tipo_operacion)) continue;
      const cur = motMap.get(m.motivo_fin) || { motivo: m.motivo_fin, si: 0, no: 0 };
      if (m.ingreso_tracking === 'SI') cur.si += onlyWspBase ? m.con_wsp : m.total;
      else cur.no += onlyWspBase ? m.con_wsp : m.total;
      motMap.set(m.motivo_fin, cur);
    }

    return {
      globalSi,
      globalNo,
      quadrants: Object.values(quadrants),
      timelineList: Array.from(timelineMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
      estadosList: Array.from(estMap.values())
        .filter((x) => x.si + x.no > 0)
        .sort((a, b) => b.si + b.no - (a.si + a.no)),
      motivosList: Array.from(motMap.values())
        .filter((x) => x.si + x.no > 0)
        .sort((a, b) => b.si + b.no - (a.si + a.no))
        .slice(0, 12),
    };
  }, [cohortData, selectedSrvSet, onlyWspBase, granularity]);

  // ============================================================================
  // 2. CÁLCULO EN MEMORIA (0 ms): DEFLEXIÓN DE LLAMADAS ATC
  // ============================================================================
  const atcComputed = useMemo(() => {
    const orderCells: any[] = atcImpactData?.orderCells || [];
    const motivoCells: any[] = atcImpactData?.motivoCells || [];

    const cIngreso = emptyAtcCounters();
    const cWspNoIngreso = emptyAtcCounters();
    const cSinWsp = emptyAtcCounters();

    const byServiceMap = new Map<
      string,
      {
        servicio: string;
        ingreso: AtcCounters;
        wspNoIngreso: AtcCounters;
        sinWsp: AtcCounters;
      }
    >();

    const weekRanges = new Map<number, { min: string; max: string }>();
    for (const c of orderCells) {
      const wr = weekRanges.get(c.yw) || { min: c.raw_date, max: c.raw_date };
      if (c.raw_date < wr.min) wr.min = c.raw_date;
      if (c.raw_date > wr.max) wr.max = c.raw_date;
      weekRanges.set(c.yw, wr);
    }

    const timelineMap = new Map<
      string,
      {
        key: string;
        label: string;
        subLabel: string;
        si: AtcCounters;
        no: AtcCounters;
      }
    >();

    const addAtc = (target: AtcCounters, row: any) => {
      target.orders += Number(row.total_ordenes || 0);
      target.ordersWithCall += onlyVtMotivos
        ? Number(row.ordenes_llamaron_vt || 0)
        : Number(row.ordenes_llamaron_all || 0);
      target.totalCalls += onlyVtMotivos
        ? Number(row.total_llamadas_vt || 0)
        : Number(row.total_llamadas_all || 0);
    };

    for (const row of orderCells) {
      const srv = String(row.tipo_operacion || 'OTROS').toUpperCase();
      if (selectedSrvSet && !selectedSrvSet.has(srv)) continue;

      if (row.cohorte_3 === 'INGRESO') addAtc(cIngreso, row);
      else if (row.cohorte_3 === 'WSP_SIN_INGRESO') addAtc(cWspNoIngreso, row);
      else addAtc(cSinWsp, row);

      let sNode = byServiceMap.get(srv);
      if (!sNode) {
        sNode = {
          servicio: srv,
          ingreso: emptyAtcCounters(),
          wspNoIngreso: emptyAtcCounters(),
          sinWsp: emptyAtcCounters(),
        };
        byServiceMap.set(srv, sNode);
      }
      if (row.cohorte_3 === 'INGRESO') addAtc(sNode.ingreso, row);
      else if (row.cohorte_3 === 'WSP_SIN_INGRESO') addAtc(sNode.wspNoIngreso, row);
      else addAtc(sNode.sinWsp, row);

      // Si onlyWspBase está activo, la comparación binaria SI vs NO excluye SIN_WSP
      if (onlyWspBase && row.cohorte_3 === 'SIN_WSP') continue;

      let tKey = '';
      let tLabel = '';
      let tSub = '';
      if (granularity === 'MENSUAL') {
        tKey = row.mes;
        tLabel = row.mes;
        tSub = 'Mensual';
      } else if (granularity === 'SEMANAL') {
        tKey = String(row.yw);
        const rng = weekRanges.get(row.yw) || { min: row.raw_date, max: row.raw_date };
        tLabel = `Semana W${String(row.yw).slice(4)}`;
        tSub = `${rng.min.slice(5)} al ${rng.max.slice(5)}`;
      } else {
        tKey = row.raw_date;
        tLabel = row.fecha_corta;
        tSub = row.raw_date;
      }

      let tNode = timelineMap.get(tKey);
      if (!tNode) {
        tNode = {
          key: tKey,
          label: tLabel,
          subLabel: tSub,
          si: emptyAtcCounters(),
          no: emptyAtcCounters(),
        };
        timelineMap.set(tKey, tNode);
      }
      addAtc(row.cohorte_3 === 'INGRESO' ? tNode.si : tNode.no, row);
    }

    // Cohorte "No Ingresó" según el switch (Solo con WSP vs Universo Total)
    const cNoIngreso: AtcCounters = onlyWspBase
      ? { ...cWspNoIngreso }
      : {
          orders: cWspNoIngreso.orders + cSinWsp.orders,
          ordersWithCall: cWspNoIngreso.ordersWithCall + cSinWsp.ordersWithCall,
          totalCalls: cWspNoIngreso.totalCalls + cSinWsp.totalCalls,
        };

    // Motivos de llamada comparados
    const motMap = new Map<string, { motivo: string; siCalls: number; noCalls: number }>();
    for (const m of motivoCells) {
      const srv = String(m.tipo_operacion || 'OTROS').toUpperCase();
      if (selectedSrvSet && !selectedSrvSet.has(srv)) continue;
      if (onlyVtMotivos && !m.is_vt) continue;
      if (onlyWspBase && m.cohorte_3 === 'SIN_WSP') continue;

      const cur = motMap.get(m.motivo) || { motivo: m.motivo, siCalls: 0, noCalls: 0 };
      if (m.cohorte_3 === 'INGRESO') cur.siCalls += Number(m.llamadas || 0);
      else cur.noCalls += Number(m.llamadas || 0);
      motMap.set(m.motivo, cur);
    }

    return {
      hasAtcData: Boolean(atcImpactData?.hasAtcData),
      totalAtcInPeriod: Number(atcImpactData?.totalAtcInPeriod || 0),
      cIngreso,
      cWspNoIngreso,
      cSinWsp,
      cNoIngreso,
      byService: Array.from(byServiceMap.values()).sort(
        (a, b) =>
          b.ingreso.orders +
          b.wspNoIngreso.orders +
          b.sinWsp.orders -
          (a.ingreso.orders + a.wspNoIngreso.orders + a.sinWsp.orders)
      ),
      timeline: Array.from(timelineMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
      motivos: Array.from(motMap.values())
        .filter((x) => x.siCalls + x.noCalls > 0)
        .sort((a, b) => b.siCalls + b.noCalls - (a.siCalls + a.noCalls))
        .slice(0, 12),
    };
  }, [atcImpactData, selectedSrvSet, onlyVtMotivos, onlyWspBase, granularity]);

  const { globalSi, globalNo, quadrants, timelineList, estadosList, motivosList } = computed;

  const effSi = calcPct(globalSi.finalizadas, globalSi.orders);
  const effNo = calcPct(globalNo.finalizadas, globalNo.orders);
  const deltaEff = effSi - effNo;

  const canSi = calcPct(globalSi.canceladas, globalSi.orders);
  const canNo = calcPct(globalNo.canceladas, globalNo.orders);
  const deltaCan = canSi - canNo;
  const relCanReduction = canNo > 0 ? ((canNo - canSi) / canNo) * 100 : 0;

  const repSi = calcPct(globalSi.reprogTotal, globalSi.orders);
  const repNo = calcPct(globalNo.reprogTotal, globalNo.orders);
  const deltaRep = repSi - repNo;

  const ausSi = calcPct(globalSi.ausente, globalSi.orders);
  const ausNo = calcPct(globalNo.ausente, globalNo.orders);
  const deltaAus = ausSi - ausNo;
  const relAusReduction = ausNo > 0 ? ((ausNo - ausSi) / ausNo) * 100 : 0;

  const totalWspNotified = globalSi.conWsp + globalNo.conWsp;
  const adoptionRateWsp = calcPct(globalSi.conWsp, totalWspNotified);

  // KPIs derivados de Deflexión ATC
  const { cIngreso, cWspNoIngreso, cSinWsp, cNoIngreso } = atcComputed;
  const contactRateSi = calcPct(cIngreso.ordersWithCall, cIngreso.orders);
  const contactRateNo = calcPct(cNoIngreso.ordersWithCall, cNoIngreso.orders);
  const deltaContactRate = contactRateSi - contactRateNo;
  const relDeflectionPct =
    contactRateNo > 0 ? ((contactRateNo - contactRateSi) / contactRateNo) * 100 : 0;

  const callsPer100Si = calcPct(cIngreso.totalCalls, cIngreso.orders);
  const callsPer100No = calcPct(cNoIngreso.totalCalls, cNoIngreso.orders);
  const deltaCallsPer100 = callsPer100Si - callsPer100No;

  const callsAvoided = Math.round(
    ((callsPer100No - callsPer100Si) / 100) * cIngreso.orders
  );

  const repeatRatioSi =
    cIngreso.ordersWithCall > 0 ? cIngreso.totalCalls / cIngreso.ordersWithCall : 0;
  const repeatRatioNo =
    cNoIngreso.ordersWithCall > 0 ? cNoIngreso.totalCalls / cNoIngreso.ordersWithCall : 0;

  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-75' : 'opacity-100'}`}>
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-semibold">
          Error cargando Impacto: {error}
        </div>
      )}

      {/* BARRA SUPERIOR DE PESTAÑAS DE IMPACTO + BASE WSP + EXPORTACIÓN */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Selector de Sub-Análisis dentro de Impacto */}
          <div className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/70 self-start">
            <button
              type="button"
              onClick={() => setSubTab('CAMPO')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                subTab === 'CAMPO'
                  ? 'bg-[#FF5500] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 size={14} />
              <span>1. Efectividad en Campo (A/B)</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('ATC')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                subTab === 'ATC'
                  ? 'bg-[#FF5500] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PhoneOff size={14} />
              <span>2. Deflexión Llamadas ATC</span>
            </button>
          </div>

          {/* Controles Globales: Base WSP vs Total + Exportar Excel */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => setOnlyWspBase(true)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  onlyWspBase
                    ? 'bg-white text-[#FF5500] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Compara solo órdenes con WhatsApp enviado (Comparación A/B justa)"
              >
                Solo con WSP
              </button>
              <button
                type="button"
                onClick={() => setOnlyWspBase(false)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  !onlyWspBase
                    ? 'bg-white text-[#FF5500] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Incluye órdenes sin envío de WhatsApp dentro de No Ingresó"
              >
                Universo Total
              </button>
            </div>

            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <Download size={14} />
              <span>{exporting ? 'Generando...' : 'Exportar Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {/* Subtítulo contextual según pestaña activa */}
        {subTab === 'CAMPO' ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-600 font-medium">
              <strong>Estudio en Campo:</strong> Compara tasas de finalización, cancelación y ausencias entre clientes que abrieron WIN en Ruta ({fmt(globalSi.orders)}) vs. no abrieron ({fmt(globalNo.orders)}).
            </span>
            <span className="font-bold text-slate-700">
              Adopción sobre WSP notificados: <span className="text-[#FF5500]">{fmtPct(adoptionRateWsp)}</span>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="text-slate-600 font-medium">
              <strong>Cruce Órdenes × ATC Llamadas (DNI o Celular):</strong> Evalúa si enviar el link y lograr que el cliente ingrese reduce las llamadas entrantes al Call Center.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro de Ventana de Días */}
              <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70 text-[11px]">
                <span className="px-2 font-bold text-slate-500">Ventana:</span>
                {[
                  { d: 0, label: 'Mismo día (0d)' },
                  { d: 2, label: '0 a +2d' },
                  { d: 3, label: '0 a +3d' },
                  { d: 7, label: '0 a +7d' },
                ].map((opt) => (
                  <button
                    key={opt.d}
                    type="button"
                    onClick={() => setWindowDays(opt.d)}
                    className={`px-2 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                      windowDays === opt.d
                        ? 'bg-white text-[#FF5500] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Switch Solo Motivos VT / Instalación */}
              <button
                type="button"
                onClick={() => setOnlyVtMotivos(!onlyVtMotivos)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                  onlyVtMotivos
                    ? 'bg-[#FFF0E5] text-[#FF5500] border-orange-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {onlyVtMotivos ? '✓ Solo motivos VT / Instalación' : 'Todas las llamadas ATC'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================
          VISTA 1: IMPACTO EN CAMPO (EFECTIVIDAD, CANCELACIÓN, REPROG, AUSENCIAS)
         ======================================================================== */}
      {subTab === 'CAMPO' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Efectividad */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Instalación / Atención Efectiva</span>
                </div>
                <span
                  className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                    deltaEff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {deltaEff >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {deltaEff >= 0 ? '+' : ''}
                  {deltaEff.toFixed(1).replace('.', ',')} pp
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <div className="text-[10px] font-extrabold uppercase text-[#FF5500]">
                    Ingresó a WIN ({fmt(globalSi.orders)})
                  </div>
                  <div className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                    {fmtPct(effSi)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {fmt(globalSi.finalizadas)} finalizadas
                  </div>
                </div>
                <div className="border-l border-slate-100 pl-3">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    No Ingresó ({fmt(globalNo.orders)})
                  </div>
                  <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                    {fmtPct(effNo)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {fmt(globalNo.finalizadas)} finalizadas
                  </div>
                </div>
              </div>
            </div>

            {/* KPI 2: Cancelaciones */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                    <XCircle size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Tasa de Cancelación / Anul.</span>
                </div>
                <span
                  className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                    deltaCan <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {deltaCan <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                  {deltaCan > 0 ? '+' : ''}
                  {deltaCan.toFixed(1).replace('.', ',')} pp
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <div className="text-[10px] font-extrabold uppercase text-[#FF5500]">
                    Ingresó a WIN
                  </div>
                  <div className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                    {fmtPct(canSi)}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-bold">
                    {fmt(globalSi.canceladas)} caídas ({relCanReduction > 0 ? `-${relCanReduction.toFixed(0)}% rel.` : '0%'})
                  </div>
                </div>
                <div className="border-l border-slate-100 pl-3">
                  <div className="text-[10px] font-bold uppercase text-slate-400">No Ingresó</div>
                  <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                    {fmtPct(canNo)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {fmt(globalNo.canceladas)} caídas
                  </div>
                </div>
              </div>
            </div>

            {/* KPI 3: Reprogramación */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                    <CalendarClock size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Reprogramación / Regestión</span>
                </div>
                <span
                  className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                    deltaRep <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {deltaRep > 0 ? '+' : ''}
                  {deltaRep.toFixed(1).replace('.', ',')} pp
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <div className="text-[10px] font-extrabold uppercase text-[#FF5500]">
                    Ingresó a WIN
                  </div>
                  <div className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                    {fmtPct(repSi)}
                  </div>
                  <div className="text-[11px] text-slate-600 font-semibold">
                    {fmt(globalSi.reprogTotal)} ({fmt(globalSi.reprogWeb)} vía web)
                  </div>
                </div>
                <div className="border-l border-slate-100 pl-3">
                  <div className="text-[10px] font-bold uppercase text-slate-400">No Ingresó</div>
                  <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                    {fmtPct(repNo)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {fmt(globalNo.reprogTotal)} en campo
                  </div>
                </div>
              </div>
            </div>

            {/* KPI 4: Cliente Ausente */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                    <UserX size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Quiebre "Cliente Ausente"</span>
                </div>
                <span
                  className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                    deltaAus <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {deltaAus > 0 ? '+' : ''}
                  {deltaAus.toFixed(1).replace('.', ',')} pp
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <div className="text-[10px] font-extrabold uppercase text-[#FF5500]">
                    Ingresó a WIN
                  </div>
                  <div className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                    {fmtPct(ausSi)}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-bold">
                    {fmt(globalSi.ausente)} ({relAusReduction > 0 ? `-${relAusReduction.toFixed(0)}% ausencias` : '0%'})
                  </div>
                </div>
                <div className="border-l border-slate-100 pl-3">
                  <div className="text-[10px] font-bold uppercase text-slate-400">No Ingresó</div>
                  <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                    {fmtPct(ausNo)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {fmt(globalNo.ausente)} ausentes
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Cuadrantes */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                  <Layers size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Matriz Comparativa por Tipo de Intervención y Ámbito Geográfico
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Barra superior (color): Ingresó a WIN en Ruta • Barra inferior (gris): No Ingresó
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                Base: {onlyWspBase ? 'Clientes con WhatsApp Enviado' : 'Universo Total de Órdenes'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {quadrants.map((q, idx) => {
                const qEffSi = calcPct(q.si.finalizadas, q.si.orders);
                const qEffNo = calcPct(q.no.finalizadas, q.no.orders);
                const qDeltaEff = qEffSi - qEffNo;
                const qCanSi = calcPct(q.si.canceladas, q.si.orders);
                const qCanNo = calcPct(q.no.canceladas, q.no.orders);
                const qRepSi = calcPct(q.si.reprogTotal, q.si.orders);
                const qRepNo = calcPct(q.no.reprogTotal, q.no.orders);
                const qAusSi = calcPct(q.si.ausente, q.si.orders);
                const qAusNo = calcPct(q.no.ausente, q.no.orders);

                return (
                  <div
                    key={idx}
                    className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50/40 flex flex-col justify-between space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-tight">
                          {q.label}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-medium">{q.sub}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums ${
                          qDeltaEff >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {qDeltaEff >= 0 ? '+' : ''}
                        {qDeltaEff.toFixed(1).replace('.', ',')} pp
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] font-extrabold text-[#FF5500] block">CON INGRESO</span>
                        <span className="font-black text-slate-900 tabular-nums">{fmt(q.si.orders)}</span>{' '}
                        <span className="text-[10px] text-slate-400">órd.</span>
                      </div>
                      <div className="border-l border-slate-100 pl-2.5">
                        <span className="text-[10px] font-bold text-slate-400 block">SIN INGRESO</span>
                        <span className="font-bold text-slate-600 tabular-nums">{fmt(q.no.orders)}</span>{' '}
                        <span className="text-[10px] text-slate-400">órd.</span>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-bold text-slate-700">Efectividad</span>
                          <span className="tabular-nums font-extrabold">
                            <span className="text-emerald-600">{fmtPct(qEffSi)}</span>{' '}
                            <span className="text-slate-400 font-normal">vs</span>{' '}
                            <span className="text-slate-500">{fmtPct(qEffNo)}</span>
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, qEffSi)}%` }} />
                          </div>
                          <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${Math.min(100, qEffNo)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-bold text-slate-700">Cancelaciones</span>
                          <span className="tabular-nums font-extrabold">
                            <span className="text-rose-600">{fmtPct(qCanSi)}</span>{' '}
                            <span className="text-slate-400 font-normal">vs</span>{' '}
                            <span className="text-slate-500">{fmtPct(qCanNo)}</span>
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, qCanSi)}%` }} />
                          </div>
                          <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${Math.min(100, qCanNo)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                        <span className="text-slate-600 font-medium">Reprog. / Regestión:</span>
                        <span className="tabular-nums font-bold">
                          <span className="text-amber-700">{fmtPct(qRepSi)}</span>{' '}
                          <span className="text-slate-400 font-normal">vs</span>{' '}
                          <span className="text-slate-500">{fmtPct(qRepNo)}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600 font-medium">Cliente Ausente:</span>
                        <span className="tabular-nums font-bold">
                          <span className="text-sky-700">{fmtPct(qAusSi)}</span>{' '}
                          <span className="text-slate-400 font-normal">vs</span>{' '}
                          <span className="text-slate-500">{fmtPct(qAusNo)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabla Evolutiva Campo */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                  <TrendingUp size={16} />
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  Evolución Comparativa ({granularity === 'MENSUAL' ? 'Mensual' : granularity === 'SEMANAL' ? 'Semanal ISO' : 'Diaria'})
                </h3>
              </div>
              <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70">
                {(['MENSUAL', 'SEMANAL', 'DIARIO'] as PeriodGranularity[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      granularity === g ? 'bg-white text-[#FF5500] shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    {g === 'MENSUAL' ? 'Por Mes' : g === 'SEMANAL' ? 'Por Semana' : 'Por Día'}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Periodo</th>
                    <th className="py-2.5 px-3 text-right">Órdenes (SI / NO)</th>
                    <th className="py-2.5 px-3 text-right">% Adopción WSP</th>
                    <th className="py-2.5 px-3 text-right">% Efectividad (SI vs NO)</th>
                    <th className="py-2.5 px-3 text-right">Lift Efect.</th>
                    <th className="py-2.5 px-3 text-right">% Cancelación (SI vs NO)</th>
                    <th className="py-2.5 px-3 text-right">Δ Cancelación</th>
                    <th className="py-2.5 px-3 text-right">% Reprog.</th>
                    <th className="py-2.5 px-3 text-right">% Ausente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {timelineList.map((row) => {
                    const rEffSi = calcPct(row.si.finalizadas, row.si.orders);
                    const rEffNo = calcPct(row.no.finalizadas, row.no.orders);
                    const rDeltaEff = rEffSi - rEffNo;
                    const rCanSi = calcPct(row.si.canceladas, row.si.orders);
                    const rCanNo = calcPct(row.no.canceladas, row.no.orders);
                    const rDeltaCan = rCanSi - rCanNo;
                    const rRepSi = calcPct(row.si.reprogTotal, row.si.orders);
                    const rRepNo = calcPct(row.no.reprogTotal, row.no.orders);
                    const rAusSi = calcPct(row.si.ausente, row.si.orders);
                    const rAusNo = calcPct(row.no.ausente, row.no.orders);
                    const rWspTot = row.si.conWsp + row.no.conWsp;
                    const rAdopt = calcPct(row.si.conWsp, rWspTot);

                    return (
                      <tr key={row.key} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3">
                          <div className="font-extrabold text-slate-900">{row.label}</div>
                          <div className="text-[10px] text-slate-400">{row.subLabel}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span className="font-extrabold text-[#FF5500]">{fmt(row.si.orders)}</span> /{' '}
                          <span className="text-slate-600 font-semibold">{fmt(row.no.orders)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-700">
                          {fmtPct(rAdopt)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span className="font-extrabold text-emerald-700">{fmtPct(rEffSi)}</span> vs{' '}
                          <span className="text-slate-600">{fmtPct(rEffNo)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                              rDeltaEff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {rDeltaEff >= 0 ? '+' : ''}
                            {rDeltaEff.toFixed(1).replace('.', ',')} pp
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span className="font-extrabold text-rose-600">{fmtPct(rCanSi)}</span> vs{' '}
                          <span className="text-slate-600">{fmtPct(rCanNo)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                              rDeltaCan <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {rDeltaCan > 0 ? '+' : ''}
                            {rDeltaCan.toFixed(1).replace('.', ',')} pp
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                          <span className="text-amber-700">{fmtPct(rRepSi)}</span> vs{' '}
                          <span className="text-slate-500">{fmtPct(rRepNo)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                          <span className="text-sky-700">{fmtPct(rAusSi)}</span> vs{' '}
                          <span className="text-slate-500">{fmtPct(rAusNo)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Estados e Incidencias */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                  <BarChart3 size={15} />
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  Distribución por Estado OT (Ingresó vs. No Ingresó)
                </h3>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {estadosList.map((st, idx) => {
                  const pctSi = calcPct(st.si, globalSi.orders);
                  const pctNo = calcPct(st.no, globalNo.orders);
                  const diff = pctSi - pctNo;
                  return (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-slate-800 uppercase">{st.estado}</span>
                        <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                          Δ {diff >= 0 ? '+' : ''}
                          {diff.toFixed(1).replace('.', ',')} pp
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                        <div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[#FF5500] font-bold">Con Ingreso:</span>
                            <span className="font-extrabold text-slate-900 tabular-nums">
                              {fmtPct(pctSi)} ({fmt(st.si)})
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-[#FF5500] rounded-full" style={{ width: `${Math.min(100, pctSi)}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-500 font-semibold">Sin Ingreso:</span>
                            <span className="font-bold text-slate-600 tabular-nums">
                              {fmtPct(pctNo)} ({fmt(st.no)})
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${Math.min(100, pctNo)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                    <AlertTriangle size={15} />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Incidencias y Motivos de Quiebre en Canceladas / Regestión
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-[#FF5500] text-[11px] font-bold">
                  <LifeBuoy size={13} />
                  {fmt(globalSi.sos)} alertas SOS
                </span>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Motivo de Quiebre</th>
                      <th className="py-2 px-3 text-right">Con Ingreso</th>
                      <th className="py-2 px-3 text-right">Sin Ingreso</th>
                      <th className="py-2 px-3 text-right">Impacto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {motivosList.map((m, idx) => {
                      const mPctSi = calcPct(m.si, globalSi.orders);
                      const mPctNo = calcPct(m.no, globalNo.orders);
                      const mDiff = mPctSi - mPctNo;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3 font-bold text-slate-800 max-w-[260px] truncate">{m.motivo}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <span className="font-extrabold text-slate-900">{fmtPct(mPctSi)}</span> ({fmt(m.si)})
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <span className="font-bold text-slate-600">{fmtPct(mPctNo)}</span> ({fmt(m.no)})
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                                mDiff <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {mDiff > 0 ? '+' : ''}
                              {mDiff.toFixed(2).replace('.', ',')} pp
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================
          VISTA 2: DEFLEXIÓN DE LLAMADAS ATC (TRACKING VS CALL CENTER)
         ======================================================================== */}
      {subTab === 'ATC' && (
        <>
          {!atcComputed.hasAtcData ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-2">
              <div className="text-sm font-extrabold text-amber-900">
                No se encontraron llamadas en <code>atc_llamadas</code> para las fechas seleccionadas
              </div>
              <p className="text-xs text-amber-800 max-w-xl mx-auto">
                Asegúrate de seleccionar un rango de fechas que coincida con las llamadas cargadas en el módulo <strong>ATC Llamadas</strong> (por ejemplo el mes que importaste en tu Excel) o activa el botón <strong>Todo el Histórico</strong> arriba.
              </p>
            </div>
          ) : (
            <>
              {/* 1. 4 TARJETAS EJECUTIVAS DE DEFLEXIÓN ATC */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: % Contactabilidad ATC (Órdenes que llaman) */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                        <PhoneOff size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">% Órdenes que Llaman ATC</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                        deltaContactRate <= 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {deltaContactRate <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                      {deltaContactRate > 0 ? '+' : ''}
                      {deltaContactRate.toFixed(1).replace('.', ',')} pp
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase text-[#FF5500]">
                        Ingresó Tracking ({fmt(cIngreso.orders)})
                      </div>
                      <div className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                        {fmtPct(contactRateSi)}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-bold">
                        {fmt(cIngreso.ordersWithCall)} OTs llamaron ({relDeflectionPct > 0 ? `-${relDeflectionPct.toFixed(0)}% rel.` : '0%'})
                      </div>
                    </div>
                    <div className="border-l border-slate-100 pl-3">
                      <div className="text-[10px] font-bold uppercase text-slate-400">
                        No Ingresó ({fmt(cNoIngreso.orders)})
                      </div>
                      <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                        {fmtPct(contactRateNo)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        {fmt(cNoIngreso.ordersWithCall)} OTs llamaron
                      </div>
                    </div>
                  </div>
                </div>

                {/* KPI 2: Intensidad de Llamadas (Llamadas por cada 100 Órdenes) */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-orange-50 text-[#FF5500]">
                        <PhoneCall size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Llamadas por cada 100 OTs</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                        deltaCallsPer100 <= 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {deltaCallsPer100 > 0 ? '+' : ''}
                      {deltaCallsPer100.toFixed(1).replace('.', ',')}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase text-[#FF5500]">
                        Ingresó Tracking
                      </div>
                      <div className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                        {callsPer100Si.toFixed(1).replace('.', ',')}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {fmt(cIngreso.totalCalls)} llamadas totales
                      </div>
                    </div>
                    <div className="border-l border-slate-100 pl-3">
                      <div className="text-[10px] font-bold uppercase text-slate-400">No Ingresó</div>
                      <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                        {callsPer100No.toFixed(1).replace('.', ',')}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        {fmt(cNoIngreso.totalCalls)} llamadas totales
                      </div>
                    </div>
                  </div>
                </div>

                {/* KPI 3: Llamadas Evitadas / Deflectadas */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                        <Sparkles size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Llamadas ATC Evitadas</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-extrabold">
                      Impacto Neto
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div
                      className={`text-3xl font-black tabular-nums ${
                        callsAvoided >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {callsAvoided > 0 ? `+${fmt(callsAvoided)}` : fmt(callsAvoided)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {callsAvoided >= 0
                        ? 'Llamadas ahorradas al Call Center gracias a clientes en Tracking'
                        : 'Exceso de llamadas en cohorte con ingreso (revisar quiebres de ruta)'}
                    </div>
                  </div>
                </div>

                {/* KPI 4: Reincidencia por Cliente que Llama */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                        <Headphones size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Insistencia (Llamadas / Cliente)</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase text-[#FF5500]">
                        Ingresó Tracking
                      </div>
                      <div className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                        {repeatRatioSi.toFixed(2).replace('.', ',')}x
                      </div>
                      <div className="text-[11px] text-slate-500">promedio si llama</div>
                    </div>
                    <div className="border-l border-slate-100 pl-3">
                      <div className="text-[10px] font-bold uppercase text-slate-400">No Ingresó</div>
                      <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                        {repeatRatioNo.toFixed(2).replace('.', ',')}x
                      </div>
                      <div className="text-[11px] text-slate-400">promedio si llama</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. ESCALERA DE 3 COHORTES: SIN WSP vs WSP SIN INGRESO vs INGRESÓ AL TRACKING */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-5">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Escalera de Deflexión en 3 Niveles: Efecto Notificación WhatsApp vs. Efecto Uso del Tracking Web
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Separa cuánto reduce llamadas el simple mensaje proactivo de WhatsApp frente a cuando el cliente abre e interactúa con el link de seguimiento
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 bg-orange-50 border border-orange-200 px-3 py-1 rounded-full">
                    Periodo acotado ATC: {atcImpactData?.atcCoverageRange?.effStart} al {atcImpactData?.atcCoverageRange?.effEnd} • {fmt(atcComputed.totalAtcInPeriod)} llamadas (ventana -1 a +{windowDays}d)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      title: '1. Sin Envío WhatsApp (Ciego)',
                      sub: 'No recibió link de seguimiento',
                      badge: 'bg-slate-100 text-slate-700',
                      bar: 'bg-slate-500',
                      data: cSinWsp,
                    },
                    {
                      title: '2. Recibió WSP • No Abrió Link',
                      sub: 'Notificado por WhatsApp sin abrir mapa',
                      badge: 'bg-amber-100 text-amber-800',
                      bar: 'bg-amber-500',
                      data: cWspNoIngreso,
                    },
                    {
                      title: '3. Ingresó a WIN en Ruta (Activo)',
                      sub: 'Vio estado de cuadrilla / tracking web',
                      badge: 'bg-emerald-100 text-emerald-800',
                      bar: 'bg-[#FF5500]',
                      data: cIngreso,
                    },
                  ].map((item, i) => {
                    const rate = calcPct(item.data.ordersWithCall, item.data.orders);
                    const per100 = calcPct(item.data.totalCalls, item.data.orders);
                    return (
                      <div
                        key={i}
                        className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50/40 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-extrabold text-xs text-slate-900">{item.title}</div>
                            <div className="text-[10px] text-slate-400">{item.sub}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${item.badge}`}>
                            {fmt(item.data.orders)} OTs
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-slate-100">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">
                              % Llaman al ATC
                            </div>
                            <div className="text-xl font-black text-slate-900 tabular-nums mt-0.5">
                              {fmtPct(rate)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {fmt(item.data.ordersWithCall)} clientes
                            </div>
                          </div>
                          <div className="border-l border-slate-100 pl-3">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">
                              Llamadas / 100 OTs
                            </div>
                            <div className="text-xl font-black text-[#FF5500] tabular-nums mt-0.5">
                              {per100.toFixed(1).replace('.', ',')}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {fmt(item.data.totalCalls)} llamadas
                            </div>
                          </div>
                        </div>

                        <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.bar}`}
                            style={{ width: `${Math.min(100, rate * 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. MATRIZ POR TIPO DE SERVICIO + TOP MOTIVOS DEFLECTADOS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Matriz por Servicio (7 segmentos incluidos GARANTIA y REITERADA) */}
                <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">
                        Contactabilidad ATC por Servicio (Ingresó vs. No Ingresó)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Identifica en qué tipo de orden el tracking ahorra más llamadas (valores negativos = reducción de llamadas)
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Servicio</th>
                          <th className="py-2.5 px-3 text-right">OTs (SI / NO)</th>
                          <th className="py-2.5 px-3 text-right">% Llama Con Tracking</th>
                          <th className="py-2.5 px-3 text-right">% Llama Sin Tracking</th>
                          <th className="py-2.5 px-3 text-right">Deflexión (Δ pp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {atcComputed.byService.map((s) => {
                          const noOrders = onlyWspBase
                            ? s.wspNoIngreso.orders
                            : s.wspNoIngreso.orders + s.sinWsp.orders;
                          const noWithCall = onlyWspBase
                            ? s.wspNoIngreso.ordersWithCall
                            : s.wspNoIngreso.ordersWithCall + s.sinWsp.ordersWithCall;

                          const rSi = calcPct(s.ingreso.ordersWithCall, s.ingreso.orders);
                          const rNo = calcPct(noWithCall, noOrders);
                          const diff = rSi - rNo;

                          return (
                            <tr key={s.servicio} className="hover:bg-slate-50/80 transition">
                              <td className="py-2.5 px-3 font-extrabold text-slate-900">{s.servicio}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums">
                                <span className="font-bold text-[#FF5500]">{fmt(s.ingreso.orders)}</span> /{' '}
                                <span className="text-slate-500">{fmt(noOrders)}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-extrabold text-slate-900">
                                {fmtPct(rSi)}{' '}
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({fmt(s.ingreso.ordersWithCall)})
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-600">
                                {fmtPct(rNo)}{' '}
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({fmt(noWithCall)})
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                                    diff <= 0
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {diff > 0 ? '+' : ''}
                                  {diff.toFixed(1).replace('.', ',')} pp
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Motivos en ATC (Incidencia por cada 100 órdenes) */}
                <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <h3 className="font-bold text-sm text-slate-900">
                      Top Motivos de Llamada ATC (Tasa por 100 OTs)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Qué consultas disminuyen cuando el cliente ve su orden en línea
                    </p>
                  </div>

                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-2.5">Motivo ATC</th>
                          <th className="py-2 px-2.5 text-right">Con Trk</th>
                          <th className="py-2 px-2.5 text-right">Sin Trk</th>
                          <th className="py-2 px-2.5 text-right">Δ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {atcComputed.motivos.map((m, idx) => {
                          const rateSi = calcPct(m.siCalls, cIngreso.orders);
                          const rateNo = calcPct(m.noCalls, cNoIngreso.orders);
                          const diff = rateSi - rateNo;
                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition">
                              <td className="py-2 px-2.5 font-semibold text-slate-800 max-w-[180px] truncate" title={m.motivo}>
                                {m.motivo}
                              </td>
                              <td className="py-2 px-2.5 text-right tabular-nums font-bold text-slate-900">
                                {rateSi.toFixed(1).replace('.', ',')}%{' '}
                                <span className="text-[10px] text-slate-400 font-normal">({fmt(m.siCalls)})</span>
                              </td>
                              <td className="py-2 px-2.5 text-right tabular-nums text-slate-600">
                                {rateNo.toFixed(1).replace('.', ',')}%{' '}
                                <span className="text-[10px] text-slate-400 font-normal">({fmt(m.noCalls)})</span>
                              </td>
                              <td className="py-2 px-2.5 text-right tabular-nums">
                                <span
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                                    diff <= 0
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {diff > 0 ? '+' : ''}
                                  {diff.toFixed(1).replace('.', ',')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}