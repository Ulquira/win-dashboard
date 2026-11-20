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
  MapPin,
  ShieldCheck,
  AlertTriangle,
  BarChart3,
  Calendar,
  LifeBuoy,
  ArrowUpRight,
  ArrowDownRight,
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

type MacroFilter = 'TODOS' | 'INSTALACION' | 'VISITA_TECNICA';
type AmbitoFilter = 'TODOS' | 'LIMA' | 'PROVINCIA';
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

function addCellToCounters(acc: CohortCounters, cell: any, onlyWspBase: boolean) {
  const isSi = cell.ingreso_tracking === 'SI';
  // Para la cohorte SI usamos siempre el universo real (o con_wsp si se filtra base WSP); para NO usamos *_wsp cuando onlyWspBase está activo
  const useWsp = onlyWspBase && !isSi;
  acc.orders += useWsp ? Number(cell.con_wsp || 0) : Number(cell.total || 0);
  acc.conWsp += Number(cell.con_wsp || 0);
  acc.finalizadas += useWsp ? Number(cell.fin_wsp || 0) : Number(cell.finalizadas || 0);
  acc.canceladas += useWsp ? Number(cell.can_wsp || 0) : Number(cell.canceladas || 0);
  acc.regestion += useWsp ? Number(cell.reg_wsp || 0) : Number(cell.regestion || 0);
  acc.reprogTotal += useWsp ? Number(cell.reprog_wsp || 0) : Number(cell.reprog_total || 0);
  acc.reprogWeb += Number(cell.reprog_web || 0);
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
  const [debouncedQuery, setDebouncedQuery] = useState<string>(globalSearch);
  const onlyWspBase = false;
  const [granularity, setGranularity] = useState<PeriodGranularity>('SEMANAL');
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(globalSearch), 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  const {
    data: cohortData,
    isFetching: loading,
    isError,
    error: queryError,
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

  const error = isError
    ? (queryError as Error)?.message
    : cohortData && !cohortData.ok
      ? cohortData.error || 'No se pudo cargar /api/cohorts'
      : null;

  const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');
  const fmtPct = (n?: number) => `${Number(n || 0).toFixed(1).replace('.', ',')}%`;
  const calcPct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

  // Obtener fecha de ayer en formato YYYY-MM-DD para presets de días cerrados
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA');
  }, []);

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
      a.download = `Analisis_WIN_en_Ruta_${startDate}_al_${endDate}.xlsx`;
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

  // Filtrado y agregación reactiva en memoria (0 ms al cambiar Servicio, Macro-Tipo, Ámbito, Base WSP o Granularidad)
  const computed = useMemo(() => {
    const dailyCells: any[] = cohortData?.dailyCells || [];
    const estadosCells: any[] = cohortData?.estadosCells || [];
    const motivosCells: any[] = cohortData?.motivosCells || [];

    const selectedSrvSet =
      service && service !== 'Todos los servicios'
        ? new Set(
            service
              .split(',')
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean)
          )
        : null;

    const matchesFilters = (tipoOp: string) => {
      const tUpper = String(tipoOp || '').toUpperCase();
      if (selectedSrvSet && !selectedSrvSet.has(tUpper)) return false;
      return true;
    };

    const globalSi = emptyCounters();
    const globalNo = emptyCounters();

    // 4 Cuadrantes: Instalación Lima, Instalación Provincia, Visita Técnica Lima, Visita Técnica Provincia
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
      // Alimentar los 4 cuadrantes respetando el selector global de servicio si aplica
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
      addCellToCounters(
        c.ingreso_tracking === 'SI' ? tNode.si : tNode.no,
        c,
        onlyWspBase
      );
    }

    // Estados OT filtrados
    const estMap = new Map<string, { estado: string; si: number; no: number }>();
    for (const e of estadosCells) {
      if (!matchesFilters(e.tipo_operacion)) continue;
      const cur = estMap.get(e.estado) || { estado: e.estado, si: 0, no: 0 };
      if (e.ingreso_tracking === 'SI') {
        cur.si += e.total;
      } else {
        cur.no += onlyWspBase ? e.con_wsp : e.total;
      }
      estMap.set(e.estado, cur);
    }

    // Motivos de Cancelación / Quiebre filtrados
    const motMap = new Map<string, { motivo: string; si: number; no: number }>();
    for (const m of motivosCells) {
      if (!matchesFilters(m.tipo_operacion)) continue;
      const cur = motMap.get(m.motivo_fin) || { motivo: m.motivo_fin, si: 0, no: 0 };
      if (m.ingreso_tracking === 'SI') {
        cur.si += m.total;
      } else {
        cur.no += onlyWspBase ? m.con_wsp : m.total;
      }
      motMap.set(m.motivo_fin, cur);
    }

    const estadosList = Array.from(estMap.values())
      .filter((x) => x.si + x.no > 0)
      .sort((a, b) => b.si + b.no - (a.si + a.no));

    const motivosList = Array.from(motMap.values())
      .filter((x) => x.si + x.no > 0)
      .sort((a, b) => b.si + b.no - (a.si + a.no))
      .slice(0, 12);

    const timelineList = Array.from(timelineMap.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    );

    return {
      globalSi,
      globalNo,
      quadrants: Object.values(quadrants),
      timelineList,
      estadosList,
      motivosList,
    };
  }, [cohortData, service, onlyWspBase, granularity]);

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
  const adoptionRateWsp = calcPct(globalSi.orders, totalWspNotified);

  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-75' : 'opacity-100'}`}>
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-semibold">
          Error cargando Comparativo A/B WIN en Ruta: {error}
        </div>
      )}

      {/* CABECERA LIMPIA REGIDA 100% POR LOS FILTROS DEL HEADER SUPERIOR + EXPORTACIÓN EXCEL */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-[#FF5500] text-[11px] font-extrabold uppercase tracking-wider">
                Estudio A/B • Universo Total
              </span>
              <span className="text-xs font-semibold text-slate-400">
                Total evaluado: <strong className="text-slate-700">{fmt(globalSi.orders + globalNo.orders)} órdenes</strong> ({fmt(globalSi.orders)} con ingreso vs. {fmt(globalNo.orders)} sin ingreso • Adopción s/WSP: <strong className="text-slate-700">{fmtPct(adoptionRateWsp)}</strong>)
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
              Clientes que Ingresaron a WIN en Ruta vs. Clientes que No Ingresaron
            </h3>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
          >
            <Download size={14} />
            <span>{exporting ? 'Generando Excel...' : 'Exportar Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* 1. 4 TARJETAS EJECUTIVAS DE IMPACTO A/B (LIFT DE EFECTIVIDAD, REDUCCIÓN DE CANCELACIÓN, REPROGRAMACIÓN Y AUSENCIA) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Instalación / Atención Efectiva */}
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

        {/* KPI 2: Cancelaciones y Anulaciones */}
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
                { fmt(globalSi.canceladas) } caídas ({relCanReduction > 0 ? `-${relCanReduction.toFixed(0)}% rel.` : '0%'})
              </div>
            </div>
            <div className="border-l border-slate-100 pl-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                No Ingresó
              </div>
              <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                {fmtPct(canNo)}
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                {fmt(globalNo.canceladas)} caídas
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Reprogramación y Regestión */}
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
              <div className="text-[10px] font-bold uppercase text-slate-400">
                No Ingresó
              </div>
              <div className="text-2xl font-bold text-slate-500 tabular-nums mt-0.5">
                {fmtPct(repNo)}
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                {fmt(globalNo.reprogTotal)} en campo
              </div>
            </div>
          </div>
        </div>

        {/* KPI 4: Quiebre por Cliente Ausente + Uso SOS */}
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
              <div className="text-[10px] font-bold uppercase text-slate-400">
                No Ingresó
              </div>
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

      {/* 2. MATRIZ DE 4 CUADRANTES: INSTALACIÓN VS VISITA TÉCNICA × LIMA VS PROVINCIA */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
              <Layers size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Matriz Comparativa por Tipo de Intervención y Ámbito Geográfico (Instalación vs. Visita Técnica × Lima vs. Provincia)
              </h3>
              <p className="text-[11px] text-slate-400">
                Comparación directa de tasas de efectividad, cancelación, reprogramación y cliente ausente en los 4 segmentos operativos
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
                    {qDeltaEff.toFixed(1).replace('.', ',')} pp Efect.
                  </span>
                </div>

                {/* Volúmenes de cohorte */}
                <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] font-extrabold text-[#FF5500] block">
                      CON INGRESO
                    </span>
                    <span className="font-black text-slate-900 tabular-nums">
                      {fmt(q.si.orders)}
                    </span>{' '}
                    <span className="text-[10px] text-slate-400">órd.</span>
                  </div>
                  <div className="border-l border-slate-100 pl-2.5">
                    <span className="text-[10px] font-bold text-slate-400 block">
                      SIN INGRESO
                    </span>
                    <span className="font-bold text-slate-600 tabular-nums">
                      {fmt(q.no.orders)}
                    </span>{' '}
                    <span className="text-[10px] text-slate-400">órd.</span>
                  </div>
                </div>

                {/* Barras comparativas de las 4 métricas */}
                <div className="space-y-2.5 text-xs">
                  {/* Efectividad */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-bold text-slate-700">Efectividad (Finalizada)</span>
                      <span className="tabular-nums font-extrabold">
                        <span className="text-emerald-600">{fmtPct(qEffSi)}</span>{' '}
                        <span className="text-slate-400 font-normal">vs</span>{' '}
                        <span className="text-slate-500">{fmtPct(qEffNo)}</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, qEffSi)}%` }}
                      />
                    </div>
                  </div>

                  {/* Cancelaciones */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-bold text-slate-700">Cancelaciones</span>
                      <span className="tabular-nums font-extrabold">
                        <span className="text-rose-600">{fmtPct(qCanSi)}</span>{' '}
                        <span className="text-slate-400 font-normal">vs</span>{' '}
                        <span className="text-slate-500">{fmtPct(qCanNo)}</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-rose-500 rounded-full"
                        style={{ width: `${Math.min(100, qCanSi)}%` }}
                      />
                    </div>
                  </div>

                  {/* Reprogramación */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                    <span className="text-slate-600 font-medium">Reprog. / Regestión:</span>
                    <span className="tabular-nums font-bold">
                      <span className="text-amber-700">{fmtPct(qRepSi)}</span>{' '}
                      <span className="text-slate-400 font-normal">vs</span>{' '}
                      <span className="text-slate-500">{fmtPct(qRepNo)}</span>
                    </span>
                  </div>

                  {/* Cliente Ausente */}
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

      {/* 3. TABLA EVOLUTIVA SEGMENTADA POR MESES / SEMANAS / DÍAS */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
              <TrendingUp size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Evolución Comparativa ({granularity === 'MENSUAL' ? 'Mensual' : granularity === 'SEMANAL' ? 'Semanal ISO (Lun-Dom)' : 'Diaria'}) — Con Ingreso vs. Sin Ingreso
              </h3>
              <p className="text-[11px] text-slate-400">
                Seguimiento continuo de adopción, diferencial de instalación efectiva (Lift), reducción de cancelaciones, reprogramación y ausencias
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70">
              <button
                onClick={() => setGranularity('MENSUAL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  granularity === 'MENSUAL'
                    ? 'bg-white text-[#FF5500] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Mes
              </button>
              <button
                onClick={() => setGranularity('SEMANAL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  granularity === 'SEMANAL'
                    ? 'bg-white text-[#FF5500] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Semana
              </button>
              <button
                onClick={() => setGranularity('DIARIO')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  granularity === 'DIARIO'
                    ? 'bg-white text-[#FF5500] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Día
              </button>
            </div>
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
                <th className="py-2.5 px-3 text-right">% Reprog. (SI vs NO)</th>
                <th className="py-2.5 px-3 text-right">% Ausente (SI vs NO)</th>
                <th className="py-2.5 px-3 text-right">SOS (#)</th>
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
                const rAdopt = calcPct(row.si.orders, rWspTot);

                return (
                  <tr key={row.key} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3">
                      <div className="font-extrabold text-slate-900">{row.label}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{row.subLabel}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span className="font-extrabold text-[#FF5500]">{fmt(row.si.orders)}</span>{' '}
                      <span className="text-slate-400">/</span>{' '}
                      <span className="text-slate-600 font-semibold">{fmt(row.no.orders)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-700">
                      {fmtPct(rAdopt)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span className="font-extrabold text-emerald-700">{fmtPct(rEffSi)}</span>{' '}
                      <span className="text-slate-400">vs</span>{' '}
                      <span className="text-slate-600">{fmtPct(rEffNo)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                          rDeltaEff >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {rDeltaEff >= 0 ? '+' : ''}
                        {rDeltaEff.toFixed(1).replace('.', ',')} pp
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span className="font-extrabold text-rose-600">{fmtPct(rCanSi)}</span>{' '}
                      <span className="text-slate-400">vs</span>{' '}
                      <span className="text-slate-600">{fmtPct(rCanNo)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                          rDeltaCan <= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {rDeltaCan > 0 ? '+' : ''}
                        {rDeltaCan.toFixed(1).replace('.', ',')} pp
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                      <span className="text-amber-700">{fmtPct(rRepSi)}</span>{' '}
                      <span className="text-slate-400">vs</span>{' '}
                      <span className="text-slate-500">{fmtPct(rRepNo)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                      <span className="text-sky-700">{fmtPct(rAusSi)}</span>{' '}
                      <span className="text-slate-400">vs</span>{' '}
                      <span className="text-slate-500">{fmtPct(rAusNo)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-700">
                      {fmt(row.si.sos)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. DESGLOSE DE ESTADOS OT E INCIDENCIAS / MOTIVOS DE QUIEBRE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Estados OT: Con Ingreso vs Sin Ingreso */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <BarChart3 size={15} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Distribución por Estado OT (Ingresó vs. No Ingresó)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Peso porcentual de cada estado dentro de su respectiva cohorte
                </p>
              </div>
            </div>
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
                        <div
                          className="h-full bg-[#FF5500] rounded-full"
                          style={{ width: `${Math.min(100, pctSi)}%` }}
                        />
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
                        <div
                          className="h-full bg-slate-400 rounded-full"
                          style={{ width: `${Math.min(100, pctNo)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Incidencias y Motivos de Quiebre/Cancelación */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle size={15} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Incidencias y Motivos de Quiebre en Canceladas / Regestión
                </h3>
                <p className="text-[11px] text-slate-400">
                  Incidencia real (% sobre el total de órdenes de cada cohorte) y reducción de quiebres en puerta
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-[#FF5500] text-[11px] font-bold">
              <LifeBuoy size={13} />
              <span>{fmt(globalSi.sos)} alertas SOS atendidas</span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Motivo de Quiebre / Regestión</th>
                  <th className="py-2 px-3 text-right">Con Ingreso (# / % cohorte)</th>
                  <th className="py-2 px-3 text-right">Sin Ingreso (# / % cohorte)</th>
                  <th className="py-2 px-3 text-right">Impacto (Δ pp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {motivosList.map((m, idx) => {
                  const mPctSi = calcPct(m.si, globalSi.orders);
                  const mPctNo = calcPct(m.no, globalNo.orders);
                  const mDiff = mPctSi - mPctNo;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-bold text-slate-800 max-w-[260px] truncate" title={m.motivo}>
                        {m.motivo}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <span className="font-extrabold text-slate-900">{fmtPct(mPctSi)}</span>{' '}
                        <span className="text-[11px] text-slate-400">({fmt(m.si)})</span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <span className="font-bold text-slate-600">{fmtPct(mPctNo)}</span>{' '}
                        <span className="text-[11px] text-slate-400">({fmt(m.no)})</span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                            mDiff <= 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
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
    </div>
  );
}
