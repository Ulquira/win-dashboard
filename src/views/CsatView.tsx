import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Star, Smile, Sparkles, ShieldCheck, MessageSquare,
  Award, BarChart2, Search, CheckCircle, AlertCircle
} from 'lucide-react';
import { apiFetch } from '../config/api';
import { RealOrder } from '../types/dashboard';

interface CsatViewProps {
  startDate: string;
  endDate: string;
  service: string;
  serviceScope?: string;
  globalSearch: string;
  ignoreDates: boolean;
  consultTrigger?: number;
  onSelectOrder?: (order: RealOrder) => void;
}

export function CsatView({
  startDate,
  endDate,
  service,
  serviceScope = 'Todos los servicios',
  globalSearch,
  ignoreDates,
  consultTrigger = 0,
}: CsatViewProps) {
  const [onlyWithComments, setOnlyWithComments] = useState(false);
  const [partnerFilter, setPartnerFilter] = useState('Todos');

  const { data: csatData, isFetching: loading } = useQuery<any>({
    queryKey: ['csatApp', startDate, endDate, serviceScope, globalSearch, ignoreDates, consultTrigger],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service: serviceScope,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
        refresh: consultTrigger > 0 ? 'true' : 'false',
      });
      return apiFetch(`/api/csat?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const responses: any[] = csatData?.responses || [];

  // Recalculo reactivo en memoria (0 ms) al alternar Servicio, Partner o Comentarios
  const { kpis, distribution, byPartner, filteredResponses } = useMemo(() => {
    const isSpecificService = Boolean(
      service && service !== 'Todos los servicios' && !service.includes(',')
    );

    const serviceFiltered = isSpecificService
      ? responses.filter(
          (r) => String(r.servicio_tipo || r.tipo_operacion_calc || '').toUpperCase() === service.toUpperCase()
        )
      : responses;

    // Si no hay filtro específico de servicio, podemos usar las agregaciones directas del servidor para byPartner
    let sumAtencion = 0;
    let countAtencion = 0;
    let top2Atencion = 0;
    let sumFacilidad = 0;
    let countFacilidad = 0;
    let sumExp = 0;
    let countExp = 0;
    let top2Exp = 0;
    let segSi = 0;
    let segNo = 0;
    const distMap: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const pMap = new Map<
      string,
      {
        partner: string;
        surveys: number;
        sumAtencion: number;
        countAtencion: number;
        sumFacilidad: number;
        countFacilidad: number;
        sumExp: number;
        countExp: number;
        segSi: number;
      }
    >();

    for (const r of serviceFiltered) {
      const atn = Number(r.satisfaccion_atencion || 0);
      const fac = Number(r.facilidad_uso || 0);
      const exp = Number(r.satisfaccion_experiencia || 0);
      const segRaw = String(r.seguridad_datos_tecnico || '')
        .trim()
        .toUpperCase();
      const isSegPos = segRaw === 'SI' || segRaw === 'SÍ' || segRaw === '1' || segRaw === 'TRUE' || Number(segRaw) >= 4;
      const isSegNeg = segRaw === 'NO' || segRaw === '0' || segRaw === 'FALSE' || (Number(segRaw) > 0 && Number(segRaw) < 4);

      const pName = String(r.partner || 'SIN PARTNER');
      let pNode = pMap.get(pName);
      if (!pNode) {
        pNode = {
          partner: pName,
          surveys: 0,
          sumAtencion: 0,
          countAtencion: 0,
          sumFacilidad: 0,
          countFacilidad: 0,
          sumExp: 0,
          countExp: 0,
          segSi: 0,
        };
        pMap.set(pName, pNode);
      }
      pNode.surveys++;
      if (atn >= 1 && atn <= 5) {
        pNode.sumAtencion += atn;
        pNode.countAtencion++;
      }
      if (fac >= 1 && fac <= 5) {
        pNode.sumFacilidad += fac;
        pNode.countFacilidad++;
      }
      if (exp >= 1 && exp <= 5) {
        pNode.sumExp += exp;
        pNode.countExp++;
      }
      if (isSegPos) pNode.segSi++;

      // Para KPIs y distribución también respetamos partnerFilter si está activo
      if (partnerFilter !== 'Todos' && pName !== partnerFilter) continue;

      if (atn >= 1 && atn <= 5) {
        sumAtencion += atn;
        countAtencion++;
        if (atn >= 4) top2Atencion++;
        distMap[Math.round(atn)] = (distMap[Math.round(atn)] || 0) + 1;
      }
      if (fac >= 1 && fac <= 5) {
        sumFacilidad += fac;
        countFacilidad++;
      }
      if (exp >= 1 && exp <= 5) {
        sumExp += exp;
        countExp++;
        if (exp >= 4) top2Exp++;
      }
      if (isSegPos) segSi++;
      else if (isSegNeg) segNo++;
    }

    const activeList = serviceFiltered.filter((r) => {
      if (partnerFilter !== 'Todos' && r.partner !== partnerFilter) return false;
      if (onlyWithComments && (!r.comentarios || !String(r.comentarios).trim())) return false;
      return true;
    });

    const totalFiltered =
      partnerFilter === 'Todos'
        ? serviceFiltered.length
        : serviceFiltered.filter((r) => r.partner === partnerFilter).length;
    const avgAtencion = countAtencion > 0 ? sumAtencion / countAtencion : 0;
    const avgFacilidad = countFacilidad > 0 ? sumFacilidad / countFacilidad : 0;
    const avgExperiencia = countExp > 0 ? sumExp / countExp : 0;
    const totalSeg = segSi + segNo;

    const computedKpis =
      !isSpecificService && partnerFilter === 'Todos' && csatData?.kpis
        ? csatData.kpis
        : {
            total_encuestas: totalFiltered,
            avg_atencion: Number(avgAtencion.toFixed(2)),
            csat_atencion_pct: countAtencion > 0 ? Number(((top2Atencion / countAtencion) * 100).toFixed(1)) : 0,
            avg_facilidad: Number(avgFacilidad.toFixed(2)),
            ces_pct: countFacilidad > 0 ? Number(((avgFacilidad / 5) * 100).toFixed(1)) : 0,
            avg_experiencia: Number(avgExperiencia.toFixed(2)),
            csat_experiencia_pct: countExp > 0 ? Number(((top2Exp / countExp) * 100).toFixed(1)) : 0,
            seguridad_si: segSi,
            seguridad_no: segNo,
            seguridad_pct: totalSeg > 0 ? Number(((segSi / totalSeg) * 100).toFixed(1)) : 0,
          };

    const computedDist = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: distMap[stars] || 0,
      pct: countAtencion > 0 ? Number((((distMap[stars] || 0) / countAtencion) * 100).toFixed(1)) : 0,
    }));

    const computedPartners = Array.from(pMap.values())
      .map((p) => {
        const avgAtn = p.countAtencion > 0 ? p.sumAtencion / p.countAtencion : 0;
        const avgFac = p.countFacilidad > 0 ? p.sumFacilidad / p.countFacilidad : 0;
        const avgEx = p.countExp > 0 ? p.sumExp / p.countExp : 0;
        return {
          partner: p.partner,
          surveys: p.surveys,
          avg_atencion: Number(avgAtn.toFixed(2)),
          avg_facilidad: Number(avgFac.toFixed(2)),
          avg_experiencia: Number(avgEx.toFixed(2)),
          csat_pct: Number(((avgAtn / 5) * 100).toFixed(1)),
          seguridad_pct: p.surveys > 0 ? Number(((p.segSi / p.surveys) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.avg_atencion - a.avg_atencion || b.surveys - a.surveys);

    return {
      kpis: computedKpis,
      distribution: computedDist,
      byPartner: computedPartners,
      filteredResponses: activeList,
    };
  }, [responses, service, partnerFilter, onlyWithComments, csatData?.kpis]);

  const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');
  const fmtDec = (n?: number) => Number(n || 0).toFixed(2).replace('.', ',');

  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-70' : 'opacity-100'}`}>
      {/* 1. 4 TARJETAS DE LAS NUEVAS PREGUNTAS DE ENCUESTA_APP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* P1: Satisfacción con la Atención */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-500">
              <Star size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              {kpis?.csat_atencion_pct ?? 0}% Top 2
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tabular-nums">
                {fmtDec(kpis?.avg_atencion)}
              </span>
              <span className="text-xs font-bold text-slate-400">/ 5,00</span>
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Satisfacción Atención</div>
            <div className="text-[11px] text-slate-400">
              Basado en {fmt(kpis?.total_encuestas)} encuestas App
            </div>
          </div>
        </div>

        {/* P2: Facilidad de Uso (App / Tracking) */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-600">
              <Sparkles size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold">
              {kpis?.ces_pct ?? 0}% CES
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tabular-nums">
                {fmtDec(kpis?.avg_facilidad)}
              </span>
              <span className="text-xs font-bold text-slate-400">/ 5,00</span>
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Facilidad de Uso</div>
            <div className="text-[11px] text-slate-400">Esfuerzo en portal de seguimiento</div>
          </div>
        </div>

        {/* P3: Satisfacción con la Experiencia */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-orange-50 text-[#FF5500]">
              <Smile size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] text-[11px] font-bold">
              {kpis?.csat_experiencia_pct ?? 0}% Positivo
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tabular-nums">
                {fmtDec(kpis?.avg_experiencia)}
              </span>
              <span className="text-xs font-bold text-slate-400">/ 5,00</span>
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Experiencia General</div>
            <div className="text-[11px] text-slate-400">Valoración global del servicio</div>
          </div>
        </div>

        {/* P4: Seguridad y Datos del Técnico */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              {fmt(kpis?.seguridad_si)} Sí / {fmt(kpis?.seguridad_no)} No
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tabular-nums">
                {kpis?.seguridad_pct ?? 0}%
              </span>
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Seguridad Datos Técnico</div>
            <div className="text-[11px] text-slate-400">Confianza e identificación en visita</div>
          </div>
        </div>
      </div>

      {/* 2. DISTRIBUCIÓN DE CALIFICACIONES + MATRIZ POR CONTRATA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Distribución 1 a 5 estrellas */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <BarChart2 size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Desglose de Calificaciones</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {fmt(kpis?.total_encuestas)} respuestas
            </span>
          </div>

          <div className="space-y-3 my-auto">
            {distribution.map((d) => {
              const barColor =
                d.stars >= 4
                  ? 'bg-emerald-500'
                  : d.stars === 3
                    ? 'bg-amber-400'
                    : 'bg-rose-500';
              return (
                <div key={d.stars} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span>{d.stars}</span>
                      <Star size={12} className="text-amber-400 fill-amber-400" />
                    </span>
                    <div className="tabular-nums">
                      <span className="font-extrabold text-slate-900 mr-1.5">{fmt(d.count)}</span>
                      <span className="text-[11px] text-slate-400">({d.pct}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.min(100, d.pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ranking de Partners en las 4 preguntas */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Award size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">
                Desempeño de Experiencia por Partner
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {byPartner.length} contratas evaluadas
            </span>
          </div>

          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs min-w-[560px]">
              <thead className="sticky top-0 bg-white">
                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2 text-left">#</th>
                  <th className="py-2 text-left">Partner</th>
                  <th className="py-2 text-center">Encuestas</th>
                  <th className="py-2 text-center">Atención</th>
                  <th className="py-2 text-center">Facilidad</th>
                  <th className="py-2 text-center">Experiencia</th>
                  <th className="py-2 text-center">Seguridad Téc.</th>
                  <th className="py-2 text-right">CSAT %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {byPartner.map((p, idx) => (
                  <tr
                    key={p.partner}
                    onClick={() =>
                      setPartnerFilter(partnerFilter === p.partner ? 'Todos' : p.partner)
                    }
                    className={`cursor-pointer transition ${
                      partnerFilter === p.partner ? 'bg-[#FFF0E5]/60' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-2.5">
                      <span
                        className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${
                          idx < 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2.5 font-bold text-slate-900">{p.partner}</td>
                    <td className="py-2.5 text-center font-semibold text-slate-600">
                      {fmt(p.surveys)}
                    </td>
                    <td className="py-2.5 text-center font-extrabold text-slate-900">
                      {fmtDec(p.avg_atencion)} ★
                    </td>
                    <td className="py-2.5 text-center font-semibold text-sky-700">
                      {fmtDec(p.avg_facilidad)}
                    </td>
                    <td className="py-2.5 text-center font-semibold text-[#FF5500]">
                      {fmtDec(p.avg_experiencia)}
                    </td>
                    <td className="py-2.5 text-center font-bold text-emerald-700">
                      {p.seguridad_pct}%
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                        {p.csat_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. BANDEJA DETALLADA DE RESPUESTAS Y COMENTARIOS (ENCUESTA_APP) */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
              <MessageSquare size={15} />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              Respuestas y Comentarios de Clientes ({filteredResponses.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {partnerFilter !== 'Todos' && (
              <button
                type="button"
                onClick={() => setPartnerFilter('Todos')}
                className="px-2.5 py-1 rounded-xl bg-[#FFF0E5] text-[#FF5500] font-bold text-[11px] cursor-pointer"
              >
                Partner: {partnerFilter} ✕
              </button>
            )}
            <button
              type="button"
              onClick={() => setOnlyWithComments(!onlyWithComments)}
              className={`px-3 py-1.5 rounded-xl font-bold text-[11px] border transition cursor-pointer ${
                onlyWithComments
                  ? 'bg-[#FF5500] text-white border-[#FF5500]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Solo con comentario escrito
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-xs min-w-[820px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2.5 text-left">Fecha</th>
                <th className="py-2.5 text-left">Orden / Ticket</th>
                <th className="py-2.5 text-left">Cliente / Sector</th>
                <th className="py-2.5 text-left">Partner / Cuadrilla</th>
                <th className="py-2.5 text-center">Atención</th>
                <th className="py-2.5 text-center">Facilidad</th>
                <th className="py-2.5 text-center">Experiencia</th>
                <th className="py-2.5 text-center">Seguridad Téc.</th>
                <th className="py-2.5 text-left">Comentario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredResponses.length > 0 ? (
                filteredResponses.map((r) => {
                  const segStr = String(r.seguridad_datos_tecnico || '-').toUpperCase();
                  const segOk =
                    segStr.includes('SI') ||
                    segStr.includes('SÍ') ||
                    segStr === '1' ||
                    segStr === '5';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 text-slate-500 whitespace-nowrap">{r.fecha_fmt}</td>
                      <td className="py-2.5">
                        <div className="font-extrabold text-[#FF5500]">
                          #{r.orden_id || '-'}
                        </div>
                        <div className="text-[10px] text-slate-400">{r.codisegui || '-'}</div>
                      </td>
                      <td className="py-2.5">
                        <div className="font-bold text-slate-900 truncate max-w-[180px]">
                          {r.cliente}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {r.servicio_tipo} • {r.sector_operativo}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="font-bold text-slate-800">{r.partner}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                          {r.cuadrilla}
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-extrabold">
                          {r.satisfaccion_atencion ?? '-'} ★
                        </span>
                      </td>
                      <td className="py-2.5 text-center font-bold text-sky-700">
                        {r.facilidad_uso ?? '-'}
                      </td>
                      <td className="py-2.5 text-center font-bold text-[#FF5500]">
                        {r.satisfaccion_experiencia ?? '-'}
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            segOk
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {segOk ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                          {r.seguridad_datos_tecnico || '-'}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-700 max-w-[260px]">
                        {r.comentarios ? (
                          <span className="italic">"{r.comentarios}"</span>
                        ) : (
                          <span className="text-slate-300">Sin comentario</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No se encontraron encuestas en este rango de fechas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}