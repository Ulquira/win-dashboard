import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  UserCheck,
  MessageSquare,
  Play,
  RefreshCw,
  CalendarRange,
  Filter,
  AlertTriangle,
  Bot,
  Target,
  Wrench,
  PhoneCall,
  Building2,
  X,
  ExternalLink,
  RotateCcw,
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

const ACCION_META: Record<
  string,
  { label: string; desc: string; badge: string; border: string }
> = {
  ESCALAR_PARTNER: {
    label: 'Escalar a Partner en Campo',
    desc: 'Exigir llegada o contacto inmediato de cuadrilla',
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    border: 'border-rose-200 bg-rose-50/50',
  },
  CONTACTAR_URGENTE: {
    label: 'Contactar Cliente Urgente',
    desc: 'Atender desde Torre de Control / Mantra sin demora',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    border: 'border-amber-200 bg-amber-50/50',
  },
  RETENER_CANCELACION: {
    label: 'Retener Riesgo de Baja',
    desc: 'Protocolo de retención por intención de anular OT',
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    border: 'border-purple-200 bg-purple-50/50',
  },
  REPROGRAMAR_VISITA: {
    label: 'Confirmar Reprogramación',
    desc: 'Asegurar nueva ventana horaria con el cliente',
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
    border: 'border-sky-200 bg-sky-50/50',
  },
  MEJORAR_PROTOCOLO_ASESOR: {
    label: 'Coaching a Asesor Mantra',
    desc: 'Corregir respuesta plantillera o demora de atención',
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    border: 'border-orange-200 bg-orange-50/50',
  },
  NO_ACCIONAR: {
    label: 'Sin Acción Pendiente',
    desc: 'Consulta informativa o caso ya resuelto',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    border: 'border-slate-200 bg-slate-50/60',
  },
};

const RESPONSABLE_LABELS: Record<string, { label: string; color: string }> = {
  PARTNER_CAMPO: { label: 'Partner / Técnico en Campo', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  ASESOR_MANTRA: { label: 'Asesor Mantra (Atención)', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  BOT_FLUJO: { label: 'Flujo Bot Automático', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  CLIENTE: { label: 'Disponibilidad del Cliente', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  NINGUNO: { label: 'Sin Quiebre Operativo', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
};

export function EfficiencyView({
  startDate,
  endDate,
  service,
  globalSearch,
  ignoreDates,
  consultTrigger = 0,
  onSetDateRange,
  onSelectOrder,
}: EfficiencyViewProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [filterGravedad, setFilterGravedad] = useState<string>('Todos');
  const [filterMotivo, setFilterMotivo] = useState<string>('Todos');
  const [filterDesempeno, setFilterDesempeno] = useState<string>('Todos');
  const [filterAccion, setFilterAccion] = useState<string>('Todos');
  const [filterResponsable, setFilterResponsable] = useState<string>('Todos');
  const [filterPartner, setFilterPartner] = useState<string>('Todos');
  const [selectedAudit, setSelectedAudit] = useState<any | null>(null);

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
  const byAccion: any[] = effData?.byAccion || [];
  const byResponsable: any[] = effData?.byResponsable || [];
  const byPartner: any[] = effData?.byPartner || [];
  const byDesempeno: any[] = effData?.byDesempeno || [];
  const audits: any[] = effData?.audits || [];

  const filteredAudits = useMemo(() => {
    return audits.filter((a) => {
      if (filterGravedad !== 'Todos' && a.gravedad !== filterGravedad) return false;
      if (filterMotivo !== 'Todos' && a.motivo_homologado !== filterMotivo) return false;
      if (filterDesempeno !== 'Todos' && a.desempeno_asesor !== filterDesempeno) return false;
      if (filterAccion !== 'Todos' && a.accion_recomendada !== filterAccion) return false;
      if (filterResponsable !== 'Todos' && a.responsable_quiebre !== filterResponsable) return false;
      if (filterPartner !== 'Todos' && a.partner !== filterPartner) return false;
      return true;
    });
  }, [
    audits,
    filterGravedad,
    filterMotivo,
    filterDesempeno,
    filterAccion,
    filterResponsable,
    filterPartner,
  ]);

  const hasActiveFilters =
    filterGravedad !== 'Todos' ||
    filterMotivo !== 'Todos' ||
    filterDesempeno !== 'Todos' ||
    filterAccion !== 'Todos' ||
    filterResponsable !== 'Todos' ||
    filterPartner !== 'Todos';

  const clearAllLocalFilters = () => {
    setFilterGravedad('Todos');
    setFilterMotivo('Todos');
    setFilterDesempeno('Todos');
    setFilterAccion('Todos');
    setFilterResponsable('Todos');
    setFilterPartner('Todos');
  };

  const handleSetLastDays = (days: number) => {
    if (!onSetDateRange) return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    onSetDateRange(start.toLocaleDateString('en-CA'), end.toLocaleDateString('en-CA'));
  };

  const handleRunAiBatch = async (autoLoop = false, forceReaudit = false) => {
    if (analyzing) return;
    setAnalyzing(true);
    setBatchStatus(
      forceReaudit
        ? 'Re-auditando conversaciones con el nuevo motor de diagnóstico Gemini...'
        : 'Procesando lote de conversaciones reales con Gemini IA...'
    );
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
            forceReaudit,
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
              ? `¡Listo! ${totalProcessedSession} conversaciones reales auditadas con plan de acción.`
              : 'Todos los chats de este rango ya están auditados.'
          );
          break;
        } else {
          setBatchStatus(`Auditados ${totalProcessedSession} chats... procesando siguiente lote...`);
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
      {/* 1. BARRA DE CONTROL DE AUDITORÍA IA + COBERTURA */}
      <div className="bg-[#090D16] text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#FF5500]/15 border border-[#FF5500]/30 text-[#FF5500] text-[11px] font-extrabold uppercase tracking-wider">
            <Sparkles size={12} />
            <span>Auditoría Operativa IA ({effData?.model || 'Gemini Flash-Lite'})</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">
            Diagnóstico de Quiebres, Responsables y Plan de Ataque en Chats
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
            disabled={analyzing}
            onClick={() => handleRunAiBatch(false, true)}
            title="Re-analiza un lote de chats actualizando responsable y acción recomendada"
            className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw size={13} className={analyzing ? 'animate-spin' : ''} />
            <span>Re-auditar (20)</span>
          </button>

          <button
            type="button"
            disabled={analyzing || coverage.pendientes === 0}
            onClick={() => handleRunAiBatch(false, false)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer"
          >
            {analyzing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>Auditar Lote (20)</span>
          </button>

          <button
            type="button"
            disabled={analyzing || coverage.pendientes === 0}
            onClick={() => handleRunAiBatch(true, false)}
            className="px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition cursor-pointer"
          >
            {analyzing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>Auditar Rango ({fmt(coverage.pendientes)})</span>
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
            <div className="text-xs font-bold text-slate-700 mt-1">Conversaciones Auditadas</div>
            <div className="text-[11px] text-slate-400">Lectura cronológica Mantra + Bot SOS</div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <Target size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
              Severidad {kpis?.avg_severidad ?? 0}/5
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {fmt(kpis?.accionables_urgentes ?? kpis?.criticos_altos)}
            </div>
            <div className="text-xs font-bold text-slate-700 mt-1">Casos que Requieren Acción</div>
            <div className="text-[11px] text-slate-400">
              {fmt(kpis?.criticos_altos)} de gravedad Alta/Crítica ({kpis?.criticos_pct ?? 0}%)
            </div>
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
            <div className="text-xs font-bold text-slate-700 mt-1">Tasa de Solución en Chat</div>
            <div className="text-[11px] text-slate-400">Clientes atendidos con solución efectiva</div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-orange-50 text-[#FF5500]">
              <UserCheck size={18} />
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] text-[11px] font-bold">
              {fmt(kpis?.asesores_evaluados)} con humano
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
            <div className="text-[11px] text-slate-400">Evaluación de resolución y tiempos</div>
          </div>
        </div>
      </div>

      {/* 3. PLAN DE ATAQUE OPERATIVO: QUÉ HACER AHORA + A QUIÉN ATACAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Qué Hacer Ahora (Acciones Recomendadas por IA) */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <PhoneCall size={16} className="text-[#FF5500]" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Plan de Acción Inmediata (¿Qué hacer y qué no?)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Haz clic en una acción para filtrar las órdenes que debes gestionar ahora
                </p>
              </div>
            </div>
            {filterAccion !== 'Todos' && (
              <button
                type="button"
                onClick={() => setFilterAccion('Todos')}
                className="text-[11px] font-bold text-[#FF5500] cursor-pointer"
              >
                Ver todas ✕
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {byAccion.length > 0 ? (
              byAccion.map((item) => {
                const meta = ACCION_META[item.accion] || {
                  label: item.accion,
                  desc: 'Acción operativa sugerida',
                  badge: 'bg-slate-100 text-slate-700 border-slate-200',
                  border: 'border-slate-200 bg-slate-50',
                };
                const isSelected = filterAccion === item.accion;
                return (
                  <button
                    key={item.accion}
                    type="button"
                    onClick={() => setFilterAccion(isSelected ? 'Todos' : item.accion)}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'ring-2 ring-[#FF5500] bg-[#FFF0E5]/50 border-[#FF5500]'
                        : `${meta.border} hover:shadow-sm`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900">{meta.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{meta.desc}</div>
                      </div>
                      <span className="text-xl font-black text-slate-900 tabular-nums">
                        {fmt(item.count)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60 w-full">
                      <span className="font-bold text-slate-500">{item.pct}% del total</span>
                      {item.criticos > 0 ? (
                        <span className="font-extrabold text-rose-600">
                          {fmt(item.criticos)} críticos/altos
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">Baja severidad</span>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="col-span-2 py-8 text-center text-xs text-slate-400">
                Ejecuta "Auditar Lote (20)" para generar el plan de acción con conversaciones reales.
              </div>
            )}
          </div>
        </div>

        {/* A Quién Atacar (Origen del Quiebre Operativo) */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Wrench size={16} className="text-[#FF5500]" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Origen del Quiebre (¿A quién atacar?)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Identifica si el fallo viene de Campo, Mantra, Bot o Cliente
                  </p>
                </div>
              </div>
              {filterResponsable !== 'Todos' && (
                <button
                  type="button"
                  onClick={() => setFilterResponsable('Todos')}
                  className="text-[11px] font-bold text-[#FF5500] cursor-pointer"
                >
                  Limpiar ✕
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {byResponsable.map((r) => {
                const info = RESPONSABLE_LABELS[r.responsable] || {
                  label: r.responsable,
                  color: 'text-slate-700 bg-slate-50 border-slate-200',
                };
                const active = filterResponsable === r.responsable;
                return (
                  <button
                    key={r.responsable}
                    type="button"
                    onClick={() => setFilterResponsable(active ? 'Todos' : r.responsable)}
                    className={`w-full p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      active
                        ? 'ring-2 ring-[#FF5500] bg-[#FFF0E5]/60 border-[#FF5500]'
                        : `${info.color} hover:opacity-90`
                    }`}
                  >
                    <div>
                      <div className="text-xs font-extrabold">{info.label}</div>
                      <div className="text-[10px] opacity-80">
                        {r.pct}% de los casos • {fmt(r.criticos)} de alta gravedad
                      </div>
                    </div>
                    <div className="text-lg font-black tabular-nums">{fmt(r.count)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Evaluación de Desempeño del Asesor */}
          <div className="pt-4 border-t border-slate-100 mt-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-800">Desempeño Asesor / Canal</span>
              {filterDesempeno !== 'Todos' && (
                <button
                  type="button"
                  onClick={() => setFilterDesempeno('Todos')}
                  className="text-[10px] font-bold text-[#FF5500] cursor-pointer"
                >
                  Limpiar ✕
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {byDesempeno.map((d) => (
                <button
                  key={d.desempeno}
                  type="button"
                  onClick={() =>
                    setFilterDesempeno(filterDesempeno === d.desempeno ? 'Todos' : d.desempeno)
                  }
                  className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                    filterDesempeno === d.desempeno
                      ? 'bg-[#FFF0E5] border-orange-300'
                      : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-[10px] font-bold text-slate-700 truncate">{d.desempeno}</div>
                  <div className="text-sm font-black text-slate-900 tabular-nums mt-0.5">
                    {fmt(d.count)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. MOTIVOS HOMOLOGADOS + RANKING DE PARTNERS CON INCUMPLIMIENTOS EN CHAT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Motivos Homologados */}
        <div className="lg:col-span-6 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
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

          <div className="space-y-2.5">
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
                      {m.criticos > 0 && (
                        <span className="text-[10px] font-bold text-rose-600">
                          {m.criticos} crít.
                        </span>
                      )}
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
                Sin motivos auditados en este rango.
              </div>
            )}
          </div>
        </div>

        {/* Ranking de Partners por Reclamos / Incumplimiento en Chat */}
        <div className="lg:col-span-6 bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-[#FF5500]" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Partners con Quiebres Reportados en Chat
                </h3>
                <p className="text-[11px] text-slate-400">
                  Demoras, incumplimientos de visita y casos críticos por contrata
                </p>
              </div>
            </div>
            {filterPartner !== 'Todos' && (
              <button
                type="button"
                onClick={() => setFilterPartner('Todos')}
                className="text-[11px] font-bold text-[#FF5500] cursor-pointer"
              >
                Ver todos ✕
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[320px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase">
                  <th className="py-2 text-left">Partner</th>
                  <th className="py-2 text-center">Chats</th>
                  <th className="py-2 text-center">Quiebre Campo</th>
                  <th className="py-2 text-center">Críticos/Altos</th>
                  <th className="py-2 text-right">% Solución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {byPartner.slice(0, 10).map((p) => {
                  const selected = filterPartner === p.partner;
                  return (
                    <tr
                      key={p.partner}
                      onClick={() => setFilterPartner(selected ? 'Todos' : p.partner)}
                      className={`cursor-pointer transition ${
                        selected ? 'bg-[#FFF0E5]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 font-extrabold text-slate-900">{p.partner}</td>
                      <td className="py-2.5 text-center font-bold text-slate-700">{fmt(p.total)}</td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.incumplimiento_campo > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {fmt(p.incumplimiento_campo)} ({p.incumplimiento_pct}%)
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            p.criticos > 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {fmt(p.criticos)} ({p.criticos_pct}%)
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-emerald-700">
                        {p.resolucion_pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. TABLA DE TRAZABILIDAD ORDEN POR ORDEN (CLIC PARA VER CONVERSACIÓN REAL) */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-[#FF5500]" />
            <h3 className="font-bold text-sm text-slate-900">
              Matriz de Conversaciones Auditadas ({filteredAudits.length})
            </h3>
            <span className="text-[11px] text-slate-400">
              • Haz clic en cualquier fila para leer el chat real
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllLocalFilters}
                className="ml-2 px-2.5 py-0.5 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-bold hover:bg-rose-100 transition cursor-pointer"
              >
                Limpiar filtros activos ✕
              </button>
            )}
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

        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-xs min-w-[1050px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2.5 text-left">Fecha / Orden</th>
                <th className="py-2.5 text-left">Cliente / Partner</th>
                <th className="py-2.5 text-left">Motivo Detectado</th>
                <th className="py-2.5 text-center">Responsable Quiebre</th>
                <th className="py-2.5 text-center">Acción Recomendada</th>
                <th className="py-2.5 text-center">Gravedad / Solución</th>
                <th className="py-2.5 text-left">Diagnóstico Ejecutivo IA</th>
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

                  const accMeta = ACCION_META[a.accion_recomendada] || ACCION_META.NO_ACCIONAR;
                  const respMeta =
                    RESPONSABLE_LABELS[a.responsable_quiebre] || RESPONSABLE_LABELS.NINGUNO;

                  return (
                    <tr
                      key={a.orden_id}
                      onClick={() => setSelectedAudit(a)}
                      className="hover:bg-orange-50/40 transition cursor-pointer"
                    >
                      <td className="py-2.5 whitespace-nowrap">
                        <div className="font-extrabold text-[#FF5500] flex items-center gap-1">
                          <span>#{a.orden_id}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {a.fecha_fmt} • {a.num_mensajes} msjs
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="font-bold text-slate-900 truncate max-w-[165px]">
                          {a.cliente}
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold">
                          {a.partner} • {a.tipo_operacion}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-[10px]">
                          {a.tipo_solicitud}
                        </span>
                        <div className="font-bold text-slate-800 mt-1">
                          {MOTIVO_LABELS[a.motivo_homologado] || a.motivo_homologado}
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${respMeta.color}`}
                        >
                          {respMeta.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${accMeta.badge}`}
                        >
                          {accMeta.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-center space-y-1">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${gravBadge}`}
                          >
                            {a.gravedad === 'CRITICA' && <AlertTriangle size={10} />}
                            {a.gravedad} ({a.severidad_score}/5)
                          </span>
                        </div>
                        <div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${resBadge}`}>
                            {a.estado_resolucion}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-700 max-w-[290px] leading-snug">
                        {a.resumen_ejecutivo}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No hay conversaciones auditadas para los filtros actuales. Pulsa "Auditar Lote (20)" arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. VISOR MODAL DE CONVERSACIÓN REAL Y DIAGNÓSTICO IA */}
      {selectedAudit && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end"
          onClick={() => setSelectedAudit(null)}
        >
          <div
            className="w-full max-w-2xl bg-white h-full overflow-y-auto p-6 space-y-5 shadow-2xl border-l border-slate-200 flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              {/* Cabecera */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-[#FF5500] text-white font-black text-sm">
                      Orden #{selectedAudit.orden_id}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                      {selectedAudit.partner}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-50 text-sky-800">
                      {selectedAudit.tipo_operacion}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Cliente: <strong className="text-slate-900">{selectedAudit.cliente}</strong> • Tel:{' '}
                    <strong className="text-slate-900">{selectedAudit.telefono || '-'}</strong> • Cuadrilla:{' '}
                    <strong className="text-slate-900">{selectedAudit.cuadrilla}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {onSelectOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        const ord = selectedAudit;
                        setSelectedAudit(null);
                        onSelectOrder(ord as unknown as RealOrder);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <ExternalLink size={13} />
                      <span>Ver Ficha OT</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedAudit(null)}
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Dictamen de Auditoría IA */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF5500] flex items-center gap-1.5">
                    <Sparkles size={13} /> Dictamen del Auditor IA
                  </span>
                  <span className="text-[11px] text-slate-300">
                    Severidad: <strong className="text-white">{selectedAudit.severidad_score}/5</strong> ({selectedAudit.gravedad})
                  </span>
                </div>

                <p className="text-xs text-slate-100 leading-relaxed font-medium">
                  {selectedAudit.resumen_ejecutivo}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="bg-white/10 rounded-xl p-2.5">
                    <div className="text-slate-400 text-[10px]">Motivo Homologado</div>
                    <div className="font-bold text-white mt-0.5">
                      {MOTIVO_LABELS[selectedAudit.motivo_homologado] || selectedAudit.motivo_homologado}
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2.5">
                    <div className="text-slate-400 text-[10px]">Responsable del Quiebre</div>
                    <div className="font-bold text-amber-300 mt-0.5">
                      {RESPONSABLE_LABELS[selectedAudit.responsable_quiebre]?.label ||
                        selectedAudit.responsable_quiebre}
                    </div>
                  </div>
                  <div className="bg-[#FF5500]/25 border border-[#FF5500]/40 rounded-xl p-2.5">
                    <div className="text-orange-200 text-[10px]">Acción Recomendada</div>
                    <div className="font-extrabold text-white mt-0.5">
                      {ACCION_META[selectedAudit.accion_recomendada]?.label ||
                        selectedAudit.accion_recomendada}
                    </div>
                  </div>
                </div>
              </div>

              {/* Historial Cronológico del Chat */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Transcripción Cronológica ({selectedAudit.messages?.length || 0} mensajes)
                  </h4>
                  {selectedAudit.log_motivo_sos && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                      Alerta SOS: {selectedAudit.log_motivo_sos}
                    </span>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3 max-h-[420px] overflow-y-auto">
                  {Array.isArray(selectedAudit.messages) && selectedAudit.messages.length > 0 ? (
                    selectedAudit.messages.map((msg: any, idx: number) => {
                      const isClient = msg.rol === 'CLIENTE';
                      const isBot = msg.rol === 'BOT';
                      return (
                        <div
                          key={idx}
                          className={`flex flex-col ${isClient ? 'items-start' : 'items-end'}`}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                            <span className="font-bold text-slate-600">{msg.emisor}</span>
                            {msg.fecha && <span>• {String(msg.fecha).slice(0, 19).replace('T', ' ')}</span>}
                          </div>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs ${
                              isClient
                                ? 'bg-white border border-slate-200 text-slate-900 rounded-tl-xs'
                                : isBot
                                  ? 'bg-slate-800 text-slate-100 rounded-tr-xs'
                                  : 'bg-[#FF5500] text-white rounded-tr-xs'
                            }`}
                          >
                            {msg.texto}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Este registro corresponde a un toque de soporte SOS sin mensajes de texto adicionales.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAudit(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
              >
                Cerrar visor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
