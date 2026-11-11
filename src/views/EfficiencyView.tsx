import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, ShieldAlert, CheckCircle2, UserCheck, MessageSquare,
  Play, RefreshCw, CalendarRange, Filter, AlertTriangle, Bot
} from 'lucide-react';
import { apiFetch } from '../config/api';
import { RealOrder } from '../types/dashboard';

interface EfficiencyViewProps {
  startDate: string;
  endDate: string;
  service: string;
  globalSearch: string;
  ignoreDates: boolean;
  consultTrigger?: number;
  onSetDateRange?: (start: string, end: string) => void;
  onSelectOrder?: (order: RealOrder) => void;
}

const MOTIVO_LABELS: Record<string, string> = {
  HORARIO_LLEGADA: 'Horario de llegada',
  DEMORA_TECNICO: 'Demora del técnico',
  TECNICO_NO_LLEGO: 'Técnico no llegó (Incumplimiento)',
  CAMBIO_FECHA_CITA: 'Cambio de fecha / Reprogramación',
  CONSULTA_ESTADO_OT: 'Consulta de estado OT',
  PROBLEMA_INSTALACION: 'Problema técnico / Instalación',
  VALIDACION_DATOS_TECNICO: 'Validación datos del técnico',
  CANCELACION_SERVICIO: 'Solicitud de cancelación',
  SIN_RESPUESTA_CLIENTE: 'Sin respuesta del cliente',
  OTRO: 'Otros motivos',
};

export function EfficiencyView({
  startDate,
  endDate,
  service,
  globalSearch,
  ignoreDates,
  consultTrigger = 0,
  onSetDateRange,
}: EfficiencyViewProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [filterGravedad, setFilterGravedad] = useState<string>('Todos');
  const [filterMotivo, setFilterMotivo] = useState<string>('Todos');
  const [filterDesempeno, setFilterDesempeno] = useState<string>('Todos');

  const {
    data: effData,
    isFetching: loading,
    refetch,
  } = useQuery<any>({
    queryKey: ['efficiencyAi', startDate, endDate, service, globalSearch, ignoreDates, consultTrigger],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
      });
      return apiFetch(`/api/efficiency?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
  });

  const coverage = effData?.coverage || {
    total_chats_rango: 0,
    total_auditados: 0,
    pendientes: 0,
    cobertura_pct: 0,
  };
  const kpis = effData?.kpis || null;
  const byMotivo: any[] = effData?.byMotivo || [];
  const byTipoSolicitud: any[] = effData?.byTipoSolicitud || [];
  const byDesempeno: any[] = effData?.byDesempeno || [];
  const audits: any[] = effData?.audits || [];

  const filteredAudits = useMemo(() => {
    return audits.filter((a) => {
      if (filterGravedad !== 'Todos' && a.gravedad !== filterGravedad) return false;
      if (filterMotivo !== 'Todos' && a.motivo_homologado !== filterMotivo) return false;
      if (filterDesempeno !== 'Todos' && a.desempeno_asesor !== filterDesempeno) return false;
      return true;
    });
  }, [audits, filterGravedad, filterMotivo, filterDesempeno]);

  const handleSetLastDays = (days: number) => {
    if (!onSetDateRange) return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    onSetDateRange(start.toLocaleDateString('en-CA'), end.toLocaleDateString('en-CA'));
  };

  const handleRunAiBatch = async (autoLoop = false) => {
    if (analyzing) return;
    setAnalyzing(true);
    setBatchStatus('Procesando lote con Gemini IA...');
    let totalProcessedSession = 0;

    try {
      const maxLoops = autoLoop ? 12 : 1;
      for (let step = 0; step < maxLoops; step++) {
        const res: any = await apiFetch('/api/efficiency/analyze-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate,
            endDate,
            service,
            ignoreDates,
            batchSize: 20,
          }),
        });

        if (!res?.ok) {
          setBatchStatus(`Error: ${res?.error || 'No se pudo procesar'}`);
          break;
        }

        const count = Number(res.processed || 0);
        totalProcessedSession += count;
        await refetch();

        if (count === 0 || !autoLoop) {
          setBatchStatus(
            totalProcessedSession > 0
              ? `¡Listo! ${totalProcessedSession} conversaciones auditadas y homologadas.`
              : 'Todos los chats de este rango ya están auditados.'
          );
          break;
        } else {
          setBatchStatus(`Auditados ${totalProcessedSession} chats... continuando siguiente lote...`);
        }
      }
    } catch (err: any) {
      setBatchStatus(`Error al conectar con Gemini: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');

  return (
    <div className={`space-y-6 transition-opacity ${loading && !analyzing ? 'opacity-75' : 'opacity-100'}`}>
      {/* 1. BARRA DE CONTROL DE AUDITORÍA IA + COBERTURA HISTÓRICA */}
      <div className="bg-[#090D16] text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#FF5500]/15 border border-[#FF5500]/30 text-[#FF5500] text-[11px] font-extrabold uppercase tracking-wider">
            <Sparkles size={12} />
            <span>Auditoría Cognitiva Gemini ({effData?.model || 'Flash-Lite'})</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">
            Homologación de Motivos, Severidad y Calidad de Atención
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-0.5">
            <span>
              Chats con interacción en rango: <strong className="text-white">{fmt(coverage.total_chats_rango)}</strong>
            </span>
            <span>•</span>
            <span>
              Auditados en BD: <strong className="text-emerald-400">{fmt(coverage.total_auditados)}</strong> ({coverage.cobertura_pct}%)
            </span>
            <span>•</span>
            <span>
              Pendientes: <strong className="text-amber-400">{fmt(coverage.pendientes)}</strong>
            </span>
          </div>
          {batchStatus && (
            <div className="text-xs font-semibold text-orange-300 pt-1">{batchStatus}</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onSetDateRange && (
            <button
              type="button"
              onClick={() => handleSetLastDays(3)}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <CalendarRange size={14} className="text-[#FF5500]" />
              <span>Últimos 3 Días</span>
            </button>
          )}

          <button
            type="button"
            disabled={analyzing || coverage.pendientes === 0}
            onClick={() => handleRunAiBatch(false)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer"
          >
            {analyzing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>Auditar Lote (20)</span>
          </button>

          <button
            type="button"
            disabled={analyzing || coverage.pendientes === 0}
            onClick={() => handleRunAiBatch(true)}
            className="px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition cursor-pointer"
          >
            {analyzing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>Auditar Rango Completo ({fmt(coverage.pendientes)})</span>
          </button>
        </div>
      </div>

      {/* 2. 4 TARJETAS KPI DE AUDITORÍA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-600">
              <MessageSquare size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold">
              {coverage.cobertura_pct}% Cobertura
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {fmt(kpis?.total_auditados)}
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Chats Homologados IA</div>
            <div className="text-[11px] text-slate-400">Guardados en BD_Phoenix</div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              {fmt(kpis?.resueltos)} resueltos
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {kpis?.tasa_resolucion_pct ?? 0}%
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Tasa de Solución Efectiva</div>
            <div className="text-[11px] text-slate-400">Casos cerrados con solución</div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <ShieldAlert size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
              Severidad {kpis?.avg_severidad ?? 0}/5
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {fmt(kpis?.criticos_altos)}
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Casos Gravedad Alta / Crítica</div>
            <div className="text-[11px] text-slate-400">{kpis?.criticos_pct ?? 0}% del total auditado</div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-orange-50 text-[#FF5500]">
              <UserCheck size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] text-[11px] font-bold">
              {fmt(kpis?.asesores_evaluados)} con asesor
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900 tabular-nums">
                {kpis?.avg_nota_asesor ?? 0}
              </span>
              <span className="text-xs font-bold text-slate-400">/ 5,00</span>
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Calidad de Gestión Asesor</div>
            <div className="text-[11px] text-slate-400">Evaluación de protocolo y empatía</div>
          </div>
        </div>
      </div>

      {/* 3. DISTRIBUCIÓN DE MOTIVOS HOMOLOGADOS + TIPO DE SOLICITUD Y DESEMPEÑO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Ranking de Motivos Homologados */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-sm text-slate-900">
              Motivos Homologados de Contacto (Clic para filtrar)
            </h3>
            {filterMotivo !== 'Todos' && (
              <button
                type="button"
                onClick={() => setFilterMotivo('Todos')}
                className="text-[11px] font-bold text-[#FF5500] cursor-pointer"
              >
                Limpiar filtro ✕
              </button>
            )}
          </div>

          <div className="space-y-3">
            {byMotivo.length > 0 ? (
              byMotivo.map((m) => (
                <div
                  key={m.motivo}
                  onClick={() => setFilterMotivo(filterMotivo === m.motivo ? 'Todos' : m.motivo)}
                  className={`p-2.5 rounded-xl border transition cursor-pointer ${
                    filterMotivo === m.motivo
                      ? 'bg-[#FFF0E5]/60 border-orange-300'
                      : 'bg-slate-50/70 border-slate-100 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-900">
                      {MOTIVO_LABELS[m.motivo] || m.motivo}
                    </span>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {m.resolucion_pct}% sol.
                      </span>
                      <span className="font-extrabold text-slate-900">{fmt(m.count)}</span>
                      <span className="text-[11px] text-slate-400">({m.pct}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FF5500] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, m.pct)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Pulsa "Auditar Rango Completo" arriba para clasificar los chats con IA.
              </div>
            )}
          </div>
        </div>

        {/* Tipo de Solicitud + Desempeño Asesor */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between space-y-5">
          <div>
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-3">
              Naturaleza del Contacto
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {byTipoSolicitud.map((t) => (
                <div
                  key={t.tipo}
                  className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[11px] font-extrabold text-slate-800">{t.tipo}</div>
                    <div className="text-[10px] text-slate-400">{t.pct}% del total</div>
                  </div>
                  <div className="text-lg font-black text-slate-900 tabular-nums">{fmt(t.count)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-3">
              Evaluación de Desempeño del Asesor
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {byDesempeno.map((d) => (
                <button
                  key={d.desempeno}
                  type="button"
                  onClick={() =>
                    setFilterDesempeno(filterDesempeno === d.desempeno ? 'Todos' : d.desempeno)
                  }
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                    filterDesempeno === d.desempeno
                      ? 'bg-[#FFF0E5] border-orange-300'
                      : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <div className="text-[11px] font-bold text-slate-700">{d.desempeno}</div>
                    <div className="text-[10px] text-slate-400">{d.pct}%</div>
                  </div>
                  <div className="text-base font-black text-slate-900 tabular-nums">
                    {fmt(d.count)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. TABLA DE TRAZABILIDAD ORDEN POR ORDEN */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-[#FF5500]" />
            <h3 className="font-bold text-sm text-slate-900">
              Matriz de Conversaciones Auditadas ({filteredAudits.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(['Todos', 'CRITICA', 'ALTA', 'MEDIA', 'BAJA'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setFilterGravedad(g)}
                className={`px-2.5 py-1 rounded-xl font-bold text-[11px] border transition cursor-pointer ${
                  filterGravedad === g
                    ? 'bg-[#FF5500] text-white border-[#FF5500]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {g === 'Todos' ? 'Todas las gravedades' : g}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-xs min-w-[920px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2.5 text-left">Fecha / Orden</th>
                <th className="py-2.5 text-left">Cliente / Servicio</th>
                <th className="py-2.5 text-left">Tipo / Motivo Homologado</th>
                <th className="py-2.5 text-center">Gravedad</th>
                <th className="py-2.5 text-center">Solución</th>
                <th className="py-2.5 text-center">Evaluación Asesor</th>
                <th className="py-2.5 text-left">Resumen Ejecutivo IA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredAudits.length > 0 ? (
                filteredAudits.map((a) => {
                  const gravBadge =
                    a.gravedad === 'CRITICA'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : a.gravedad === 'ALTA'
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : a.gravedad === 'MEDIA'
                          ? 'bg-sky-100 text-sky-800 border-sky-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200';

                  const resBadge =
                    a.estado_resolucion === 'RESUELTO'
                      ? 'bg-emerald-100 text-emerald-800'
                      : a.estado_resolucion === 'NO_RESUELTO'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800';

                  return (
                    <tr key={a.orden_id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 whitespace-nowrap">
                        <div className="font-extrabold text-[#FF5500]">#{a.orden_id}</div>
                        <div className="text-[10px] text-slate-400">
                          {a.fecha_fmt} • {a.num_mensajes} msjs
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="font-bold text-slate-900 truncate max-w-[170px]">
                          {a.cliente}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {a.tipo_operacion} • {a.partner}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-[10px] mr-1.5">
                          {a.tipo_solicitud}
                        </span>
                        <div className="font-bold text-slate-800 mt-1">
                          {MOTIVO_LABELS[a.motivo_homologado] || a.motivo_homologado}
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${gravBadge}`}
                        >
                          {a.gravedad === 'CRITICA' && <AlertTriangle size={10} />}
                          {a.gravedad} ({a.severidad_score}/5)
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${resBadge}`}>
                          {a.estado_resolucion}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        {a.desempeno_asesor === 'SOLO_BOT' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                            <Bot size={11} /> SOLO BOT
                          </span>
                        ) : (
                          <div>
                            <span className="font-extrabold text-slate-900">
                              {a.desempeno_asesor}
                            </span>
                            {a.nota_asesor && (
                              <div className="text-[10px] text-amber-600 font-bold">
                                {a.nota_asesor}/5 ★
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-700 max-w-[300px] leading-snug">
                        {a.resumen_ejecutivo}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No hay conversaciones auditadas para los filtros actuales.
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