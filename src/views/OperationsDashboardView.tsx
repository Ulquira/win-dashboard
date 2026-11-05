import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ClipboardList, CheckCircle, Truck, Clock, XCircle, Users,
    TrendingUp, Award, MapPin, Wrench, Layers, RefreshCw,
    BarChart2, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { apiFetch } from '../config/api';
import { OperationsKpis } from '../types/dashboard';

interface OperationsDashboardViewProps {
    startDate: string;
    endDate: string;
    service: string;
    globalSearch: string;
    ignoreDates: boolean;
    consultTrigger?: number;
}

export function OperationsDashboardView({
    startDate,
    endDate,
    service,
    globalSearch,
    ignoreDates,
    consultTrigger = 0,
}: OperationsDashboardViewProps) {
    const [debouncedQuery, setDebouncedQuery] = useState<string>(globalSearch);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [kpis, setKpis] = useState<OperationsKpis | null>(null);
    const [byEstado, setByEstado] = useState<any[]>([]);
    const [daily, setDaily] = useState<any[]>([]);
    const [byPartner, setByPartner] = useState<any[]>([]);
    const [byZona, setByZona] = useState<any[]>([]);
    const [topCuadrillas, setTopCuadrillas] = useState<any[]>([]);
    const [byMotivoTrabajo, setByMotivoTrabajo] = useState<any[]>([]);
    const [byMotivoFin, setByMotivoFin] = useState<any[]>([]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(globalSearch), 350);
        return () => clearTimeout(timer);
    }, [globalSearch]);

    const fetchOperations = useCallback((forceRefresh = false) => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
            startDate,
            endDate,
            service,
            q: debouncedQuery,
            ignoreDates: ignoreDates ? 'true' : 'false',
            refresh: forceRefresh ? 'true' : 'false',
        });

        apiFetch(`/api/operations?${params.toString()}`)
            .then((res) => {
                if (res.ok) {
                    setKpis(res.kpis);
                    setByEstado(res.byEstado || []);
                    setDaily(res.daily || []);
                    setByPartner(res.byPartner || []);
                    setByZona(res.byZona || []);
                    setTopCuadrillas(res.topCuadrillas || []);
                    setByMotivoTrabajo(res.byMotivoTrabajo || []);
                    setByMotivoFin(res.byMotivoFin || []);
                } else {
                    setError(res.error || 'No se pudo cargar /api/operations');
                }
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [startDate, endDate, service, debouncedQuery, ignoreDates]);

    useEffect(() => {
        fetchOperations(consultTrigger > 0);
    }, [fetchOperations, consultTrigger]);

    const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');
    const fmtDec = (n?: number) => Number(n || 0).toFixed(1).replace('.', ',');

    // Polilíneas y barras para el gráfico evolutivo de Avance Diario y Cuadrillas
    const dailyChart = useMemo(() => {
        if (!daily || daily.length === 0) return { points: [], effLine: '', prodLine: '' };
        const slice = daily.slice(-14); // últimos 14 días máximo para legibilidad
        const maxTotal = Math.max(1, ...slice.map((d) => Number(d.total || 0)));
        const maxCrews = Math.max(1, ...slice.map((d) => Number(d.cuadrillas || 0)));
        const maxIdx = Math.max(1, slice.length - 1);

        const effPts: string[] = [];
        const points = slice.map((d, idx) => {
            const x = slice.length === 1 ? 210 : Math.round(28 + (idx / maxIdx) * 364);
            const tot = Number(d.total || 0);
            const fin = Number(d.finalizadas || 0);
            const crw = Number(d.cuadrillas || 0);
            const eff = tot > 0 ? (fin / tot) * 100 : 0;

            const yEff = Math.round(130 - (Math.min(100, Math.max(0, eff)) / 100) * 110);
            const barH = Math.round((tot / maxTotal) * 95);
            const finH = Math.round((fin / maxTotal) * 95);

            effPts.push(`${x},${yEff}`);
            return {
                x,
                fecha: d.fecha,
                tot,
                fin,
                crw,
                prodFin: d.prod_fin,
                eff: `${eff.toFixed(1).replace('.', ',')}%`,
                yEff,
                barH,
                finH,
                crewRatio: Math.round((crw / maxCrews) * 100),
            };
        });

        return {
            points,
            effLine: effPts.join(' '),
        };
    }, [daily]);

    return (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-70' : 'opacity-100'}`}>
            {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-semibold">
                    Error cargando Operaciones: {error}
                </div>
            )}

            {/* 1. TARJETAS EJECUTIVAS DE OPERACIÓN (6 KPI CARDS) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                {/* Total Órdenes */}
                <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                            <ClipboardList size={18} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium truncate">Órdenes Totales</span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                            {fmt(kpis?.total_ordenes)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">100% base</span>
                    </div>
                </div>

                {/* Finalizadas (Hit Rate) */}
                <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                            <CheckCircle size={18} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium truncate">Finalizadas (Éxito)</span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                            {fmt(kpis?.finalizadas)}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 tabular-nums">
                            {fmtDec(kpis?.efectividad_pct)}%
                        </span>
                    </div>
                </div>

                {/* En Curso / En Ruta */}
                <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                            <Truck size={18} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium truncate">Iniciadas / En Ruta</span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                            {fmt(kpis?.en_curso)}
                        </span>
                        <span className="text-[11px] font-bold text-sky-700">
                            {kpis?.total_ordenes ? fmtDec((kpis.en_curso / kpis.total_ordenes) * 100) : '0,0'}%
                        </span>
                    </div>
                </div>

                {/* Agendadas / Pendientes */}
                <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                            <Clock size={18} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium truncate">Agendadas / Pend.</span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                            {fmt(kpis?.agendadas)}
                        </span>
                        <span className="text-[11px] font-bold text-amber-700">
                            {kpis?.total_ordenes ? fmtDec((kpis.agendadas / kpis.total_ordenes) * 100) : '0,0'}%
                        </span>
                    </div>
                </div>

                {/* Canceladas / Anuladas */}
                <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                            <XCircle size={18} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium truncate">Canceladas / Anul.</span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                            {fmt(kpis?.canceladas)}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 tabular-nums">
                            {fmtDec(kpis?.cancelacion_pct)}%
                        </span>
                    </div>
                </div>

                {/* Cuadrillas Activas & Productividad */}
                <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-orange-50 text-[#FF5500]">
                            <Users size={18} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium truncate">Cuadrillas y Prod.</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                            {fmt(kpis?.cuadrillas_activas)}
                        </span>
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] leading-none">
                                {fmtDec(kpis?.prod_fin_por_cuadrilla)} fin/cuad
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 leading-none">
                                {fmtDec(kpis?.prod_ot_por_cuadrilla)} asig/cuad
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. FILA EJECUTIVA: DISTRIBUCIÓN REAL DE ESTADOS + GRÁFICA DE AVANCE Y CUADRILLAS + SALUD OPERATIVA */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Desglose por Estado OT en vw_winordetraba */}
                <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                                <BarChart2 size={15} />
                            </div>
                            <h3 className="font-bold text-sm text-slate-900">Cuadro Ejecutivo por Estado OT</h3>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">{byEstado.length} estados</span>
                    </div>

                    <div className="space-y-3 my-auto max-h-64 overflow-y-auto pr-1">
                        {byEstado.map((st, idx) => {
                            const tot = Number(st.total || 0);
                            const base = Number(kpis?.total_ordenes || 1);
                            const pct = base > 0 ? (tot / base) * 100 : 0;
                            const lower = String(st.estado || '').toLowerCase();
                            const barColor =
                                lower.includes('finaliz') || lower.includes('atendid') || lower.includes('ok')
                                    ? 'bg-emerald-500'
                                    : lower.includes('iniciad') || lower.includes('camino') || lower.includes('ruta')
                                        ? 'bg-sky-500'
                                        : lower.includes('cancel') || lower.includes('anul') || lower.includes('quiebre')
                                            ? 'bg-rose-500'
                                            : 'bg-amber-500';

                            return (
                                <div key={idx} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-slate-800 uppercase truncate max-w-[170px]">
                                            {st.estado}
                                        </span>
                                        <div className="flex items-center gap-2 tabular-nums">
                                            <span className="text-[10px] text-slate-400">{st.cuadrillas} cuad.</span>
                                            <span className="font-extrabold text-slate-900">{fmt(tot)}</span>
                                            <span className="text-[11px] font-bold text-slate-500 w-12 text-right">
                                                {pct.toFixed(1).replace('.', ',')}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${barColor}`}
                                            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Gráfico Combinado: Volumen Diario + Finalizadas + Efectividad % */}
                <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                                <TrendingUp size={15} />
                            </div>
                            <h3 className="font-bold text-sm text-slate-900">Avance Diario y Efectividad de Campo</h3>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium">
                            Últimos {dailyChart.points.length} días
                        </span>
                    </div>

                    <div className="h-48 flex items-center my-auto">
                        <svg viewBox="0 0 420 155" className="w-full h-44 overflow-visible">
                            {[20, 48, 75, 102, 130].map((y, i) => (
                                <line key={i} x1="15" y1={y} x2="405" y2={y} stroke="#F1F5F9" strokeDasharray="3 3" />
                            ))}

                            {dailyChart.points.map((pt, idx) => (
                                <g key={idx}>
                                    {/* Barra Total OTs del día */}
                                    <rect
                                        x={pt.x - 9}
                                        y={130 - pt.barH}
                                        width="9"
                                        height={pt.barH}
                                        rx="2"
                                        fill="#94A3B8"
                                        opacity="0.35"
                                    />
                                    {/* Barra OTs Finalizadas del día */}
                                    <rect
                                        x={pt.x}
                                        y={130 - pt.finH}
                                        width="9"
                                        height={pt.finH}
                                        rx="2"
                                        fill="#10B981"
                                    />
                                    {/* Fecha en eje X */}
                                    <text x={pt.x} y={145} textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">
                                        {pt.fecha}
                                    </text>
                                    {/* Etiqueta de cuadrillas activas ese día */}
                                    <text x={pt.x} y={154} textAnchor="middle" fill="#FF5500" fontSize="8" fontWeight="700">
                                        {pt.crw}c
                                    </text>
                                </g>
                            ))}

                            {/* Línea de % Efectividad */}
                            {dailyChart.effLine && (
                                <polyline
                                    fill="none"
                                    stroke="#FF5500"
                                    strokeWidth="2.4"
                                    points={dailyChart.effLine}
                                />
                            )}

                            {dailyChart.points.map((pt, idx) => (
                                <g key={`dot-${idx}`}>
                                    <circle cx={pt.x} cy={pt.yEff} r="3.5" fill="#FF5500" stroke="#FFFFFF" strokeWidth="1.5" />
                                    {(dailyChart.points.length <= 8 || idx % 2 === 0 || idx === dailyChart.points.length - 1) && (
                                        <text x={pt.x} y={pt.yEff - 6} textAnchor="middle" fill="#C2410C" fontSize="8.5" fontWeight="800">
                                            {pt.eff}
                                        </text>
                                    )}
                                </g>
                            ))}
                        </svg>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-4 text-xs pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 font-medium text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-xs bg-slate-400/60" />
                            <span>OTs Generadas</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-medium text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                            <span>OTs Finalizadas</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-medium text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5500]" />
                            <span>% Efectividad (nc = Cuadrillas)</span>
                        </div>
                    </div>
                </div>

                {/* Resumen de Capacidad y Productividad */}
                <div className="lg:col-span-3 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                        <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                            <ShieldCheck size={15} />
                        </div>
                        <h3 className="font-bold text-sm text-slate-900">Capacidad Instalada</h3>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <div className="text-[11px] font-medium text-slate-600">Productividad Efectiva</div>
                            <div className="text-xl font-extrabold text-slate-900 mt-0.5 tabular-nums">
                                {fmtDec(kpis?.prod_fin_por_cuadrilla)} <span className="text-xs font-semibold text-emerald-700">OTs Fin / Cuad</span>
                            </div>
                        </div>
                        <Award size={22} className="text-emerald-600 shrink-0" />
                    </div>

                    <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <div className="text-[11px] font-medium text-slate-600">Carga Asignada por Cuadrilla</div>
                            <div className="text-xl font-extrabold text-slate-900 mt-0.5 tabular-nums">
                                {fmtDec(kpis?.prod_ot_por_cuadrilla)} <span className="text-xs font-semibold text-sky-700">OTs Asig / Cuad</span>
                            </div>
                        </div>
                        <Wrench size={20} className="text-sky-600 shrink-0" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 text-center">
                            <div className="text-lg font-extrabold text-slate-900">{fmt(kpis?.partners_activos)}</div>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase">Partners Activos</div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 text-center">
                            <div className="text-lg font-extrabold text-slate-900">{fmt(kpis?.zonas_activas)}</div>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase">Zonas Cubiertas</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. TABLA DE AVANCE DIARIO Y PRODUCTIVIDAD DE CUADRILLAS POR DÍA */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                            <TrendingUp size={15} />
                        </div>
                        <h3 className="font-bold text-sm text-slate-900">
                            Control de Avance Diario, Cuadrillas en Campo y Productividad
                        </h3>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">{daily.length} días evaluados</span>
                </div>

                <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-xs min-w-[720px]">
                        <thead className="sticky top-0 bg-white">
                            <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                                <th className="py-2.5 text-left">Fecha</th>
                                <th className="py-2.5 text-right">Total OTs</th>
                                <th className="py-2.5 text-right">Finalizadas</th>
                                <th className="py-2.5 text-right">En Ruta</th>
                                <th className="py-2.5 text-right">Agendadas</th>
                                <th className="py-2.5 text-right">Canceladas</th>
                                <th className="py-2.5 text-center">% Efectividad</th>
                                <th className="py-2.5 text-right">Cuadrillas</th>
                                <th className="py-2.5 text-right">Prod. (Asig/Cuad)</th>
                                <th className="py-2.5 text-right">Prod. (Fin/Cuad)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums">
                            {[...daily].reverse().map((d, i) => (
                                <tr key={i} className="hover:bg-slate-50/80 transition">
                                    <td className="py-2.5 font-bold text-slate-900">{d.fecha_full || d.raw_date}</td>
                                    <td className="py-2.5 text-right font-extrabold text-slate-900">{fmt(d.total)}</td>
                                    <td className="py-2.5 text-right font-bold text-emerald-700">{fmt(d.finalizadas)}</td>
                                    <td className="py-2.5 text-right font-semibold text-sky-700">{fmt(d.en_curso)}</td>
                                    <td className="py-2.5 text-right font-semibold text-amber-700">{fmt(d.agendadas)}</td>
                                    <td className="py-2.5 text-right font-semibold text-rose-700">{fmt(d.canceladas)}</td>
                                    <td className="py-2.5 text-center">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                            {fmtDec(d.efectividad_pct)}%
                                        </span>
                                    </td>
                                    <td className="py-2.5 text-right font-extrabold text-[#FF5500]">{fmt(d.cuadrillas)}</td>
                                    <td className="py-2.5 text-right font-semibold text-slate-600">{fmtDec(d.prod_total)}</td>
                                    <td className="py-2.5 text-right">
                                        <span className="px-2 py-0.5 rounded-lg bg-[#FFF0E5] text-[#FF5500] font-extrabold">
                                            {fmtDec(d.prod_fin)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 4. MATRIZ POR PARTNER Y DESEMPEÑO POR ZONA */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Rendimiento por Partner */}
                <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                                <Award size={15} />
                            </div>
                            <h3 className="font-bold text-sm text-slate-900">Productividad y Efectividad por Partner</h3>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">{byPartner.length} contratas</span>
                    </div>

                    <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-xs min-w-[580px]">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="py-2.5 text-left">Partner / Proveedor</th>
                                    <th className="py-2.5 text-right">OTs</th>
                                    <th className="py-2.5 text-right">Finaliz.</th>
                                    <th className="py-2.5 text-right">Cancel.</th>
                                    <th className="py-2.5 text-center">% Efectividad</th>
                                    <th className="py-2.5 text-right">Cuadrillas</th>
                                    <th className="py-2.5 text-right">Fin / Cuad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 tabular-nums">
                                {byPartner.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                                        <td className="py-2.5 font-bold text-slate-900 uppercase">{p.partner}</td>
                                        <td className="py-2.5 text-right font-bold text-slate-900">{fmt(p.total)}</td>
                                        <td className="py-2.5 text-right font-bold text-emerald-700">{fmt(p.finalizadas)}</td>
                                        <td className="py-2.5 text-right text-rose-600 font-semibold">{fmt(p.canceladas)}</td>
                                        <td className="py-2.5">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-emerald-500 rounded-full"
                                                        style={{ width: `${Math.min(100, p.efectividad_pct)}%` }}
                                                    />
                                                </div>
                                                <span className="text-[11px] font-bold text-emerald-800 w-10 text-right">
                                                    {fmtDec(p.efectividad_pct)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 text-right font-bold text-slate-700">{fmt(p.cuadrillas)}</td>
                                        <td className="py-2.5 text-right">
                                            <span className="px-2 py-0.5 rounded-lg bg-[#FFF0E5] text-[#FF5500] font-extrabold">
                                                {fmtDec(p.prod_fin)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Rendimiento por Zona / Distrito */}
                <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                                <MapPin size={15} />
                            </div>
                            <h3 className="font-bold text-sm text-slate-900">Operación por Zona / Distrito</h3>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">Top {byZona.length}</span>
                    </div>

                    <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-xs min-w-[420px]">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="py-2.5 text-left">Zona</th>
                                    <th className="py-2.5 text-right">OTs</th>
                                    <th className="py-2.5 text-right">Finaliz.</th>
                                    <th className="py-2.5 text-center">% Éxito</th>
                                    <th className="py-2.5 text-right">Cuad.</th>
                                    <th className="py-2.5 text-right">Fin/Cuad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 tabular-nums">
                                {byZona.map((z, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                                        <td className="py-2.5 font-bold text-slate-900 uppercase truncate max-w-[140px]">
                                            {z.zona}
                                        </td>
                                        <td className="py-2.5 text-right font-bold text-slate-900">{fmt(z.total)}</td>
                                        <td className="py-2.5 text-right font-bold text-emerald-700">{fmt(z.finalizadas)}</td>
                                        <td className="py-2.5 text-center">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                                                {fmtDec(z.efectividad_pct)}%
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right font-semibold text-slate-600">{fmt(z.cuadrillas)}</td>
                                        <td className="py-2.5 text-right font-extrabold text-[#FF5500]">{fmtDec(z.prod_fin)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 5. TOP 15 CUADRILLAS MÁS PRODUCTIVAS + MOTIVOS DE TRABAJO Y CIERRE */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Leaderboard de Cuadrillas */}
                <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                                <Wrench size={15} />
                            </div>
                            <h3 className="font-bold text-sm text-slate-900">Ranking Top 15 Cuadrillas por Producción</h3>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">Líderes en cierres</span>
                    </div>

                    <div className="overflow-x-auto max-h-80">
                        <table className="w-full text-xs min-w-[520px]">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="py-2 text-left">#</th>
                                    <th className="py-2 text-left">Cuadrilla / Técnico</th>
                                    <th className="py-2 text-left">Partner</th>
                                    <th className="py-2 text-right">Asignadas</th>
                                    <th className="py-2 text-right">Finalizadas</th>
                                    <th className="py-2 text-right">Cancel.</th>
                                    <th className="py-2 text-right">% Efectividad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 tabular-nums">
                                {topCuadrillas.map((c, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                                        <td className="py-2">
                                            <span
                                                className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${idx < 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                                                    }`}
                                            >
                                                {idx + 1}
                                            </span>
                                        </td>
                                        <td className="py-2 font-bold text-slate-900 max-w-[210px] truncate" title={c.cuadrilla}>
                                            {c.cuadrilla}
                                        </td>
                                        <td className="py-2 text-slate-500 font-semibold truncate max-w-[120px]">{c.partner}</td>
                                        <td className="py-2 text-right font-bold text-slate-800">{fmt(c.total)}</td>
                                        <td className="py-2 text-right font-extrabold text-emerald-700">{fmt(c.finalizadas)}</td>
                                        <td className="py-2 text-right text-rose-600">{fmt(c.canceladas)}</td>
                                        <td className="py-2 text-right">
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                                {fmtDec(c.efectividad_pct)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Desglose por Tipo de Trabajo y Diagnóstico / Motivo de Finalización */}
                <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 space-y-5">
                    <div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                                    <Layers size={15} />
                                </div>
                                <h3 className="font-bold text-sm text-slate-900">Por Motivo de Trabajo / Servicio</h3>
                            </div>
                        </div>
                        <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                            {byMotivoTrabajo.map((m, i) => {
                                const tot = Number(m.total || 0);
                                const fin = Number(m.finalizadas || 0);
                                const eff = tot > 0 ? Math.round((fin / tot) * 100) : 0;
                                return (
                                    <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center justify-between text-xs">
                                        <div className="truncate pr-2">
                                            <div className="font-bold text-slate-900 truncate">{m.motivo_trabajo}</div>
                                            <div className="text-[10px] text-slate-400">
                                                {m.tipo_operacion} • {m.cuadrillas} cuadrillas
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 tabular-nums">
                                            <div className="font-extrabold text-slate-900">{fmt(tot)} OTs</div>
                                            <div className="text-[10px] font-bold text-emerald-700">
                                                {fmt(fin)} fin. ({eff}%)
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                                    <AlertTriangle size={15} />
                                </div>
                                <h3 className="font-bold text-sm text-slate-900">Top Motivos de Finalización / Cierre</h3>
                            </div>
                        </div>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 text-xs">
                            {byMotivoFin.map((f, i) => (
                                <div key={i} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                                    <span className="text-slate-700 font-medium truncate max-w-[220px]" title={f.motivo_fin}>
                                        {f.motivo_fin}
                                    </span>
                                    <span className="font-extrabold text-slate-900 tabular-nums">{fmt(f.total)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}