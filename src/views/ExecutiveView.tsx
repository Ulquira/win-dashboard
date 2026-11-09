import React, { useMemo } from 'react';
import {
  Filter, Info, ClipboardList, Send, CheckCheck, MapPin,
  TrendingUp, Settings, Laptop, Crown, Gem, Award,
  AlertTriangle, CheckCircle, LifeBuoy
} from 'lucide-react';
import { CalculatedMetrics, EvolutionPoint, PartnerRankItem } from '../types/dashboard';

interface ExecutiveViewProps {
  calc: CalculatedMetrics;
  evolution: EvolutionPoint[];
  partners: PartnerRankItem[];
}

export function ExecutiveView({ calc, evolution, partners }: ExecutiveViewProps) {
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
      const yTrk = toY(pTrk);
      const yTrkLei = toY(pTrkLei);

      whsPts.push(`${x},${yWhs}`);
      lecPts.push(`${x},${yLec}`);
      trkPts.push(`${x},${yTrk}`);
      trkLeiPts.push(`${x},${yTrkLei}`);

      return {
        x,
        fecha: pt.fecha,
        yWhs,
        yLec,
        yTrk,
        yTrkLei,
        vWhs: fmtPct(pWhs),
        vLec: fmtPct(pLec),
        vTrk: fmtPct(pTrk),
        vTrkLei: fmtPct(pTrkLei),
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

  return (
    <div className="space-y-6">
      {/* FILA 1: EMBUDO + GRÁFICO + EFICIENCIA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Embudo de Interacción */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Filter size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Embudo de Interacción del Cliente</h3>
              <Info size={13} className="text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Desde la orden hasta el ingreso a tracking</p>
          </div>

          <div className="space-y-2.5 my-auto py-1">
            {/* Paso 1: Órdenes */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 rounded-xl shadow-xs"
                  style={{ clipPath: 'polygon(0% 0%, 100% 0%, 93% 100%, 7% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[30px_68px] items-center justify-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0">
                    <ClipboardList size={15} />
                  </div>
                  <div className="flex flex-col items-center justify-center text-center leading-none">
                    <div className="font-extrabold text-base text-white tracking-tight tabular-nums">{calc.ordenes}</div>
                    <div className="text-[11px] font-medium text-blue-50 mt-0.5">Órdenes</div>
                  </div>
                </div>
              </div>
              <div className="w-24 text-right shrink-0">
                <div className="font-extrabold text-sm text-slate-900 tabular-nums">100%</div>
                <div className="text-[10px] text-slate-400">Total base</div>
              </div>
            </div>

            {/* Paso 2: Mensajes enviados */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 rounded-xl shadow-xs"
                  style={{ clipPath: 'polygon(7% 0%, 93% 0%, 86% 100%, 14% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[30px_68px] items-center justify-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0">
                    <Send size={14} />
                  </div>
                  <div className="flex flex-col items-center justify-center text-center leading-none">
                    <div className="font-extrabold text-base text-white tracking-tight tabular-nums">{calc.whsEnviados}</div>
                    <div className="text-[11px] font-medium text-emerald-50 mt-0.5">Enviados</div>
                  </div>
                </div>
              </div>
              <div className="w-24 text-right shrink-0">
                <div className="font-extrabold text-sm text-emerald-600 tabular-nums">{calc.whsPct}%</div>
                <div className="text-[10px] text-slate-400">del total</div>
              </div>
            </div>

            {/* Paso 3: Mensajes leídos */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-500 rounded-xl shadow-xs"
                  style={{ clipPath: 'polygon(14% 0%, 86% 0%, 79% 100%, 21% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[30px_68px] items-center justify-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0">
                    <CheckCheck size={15} />
                  </div>
                  <div className="flex flex-col items-center justify-center text-center leading-none">
                    <div className="font-extrabold text-base text-white tracking-tight tabular-nums">{calc.leidos}</div>
                    <div className="text-[11px] font-medium text-cyan-50 mt-0.5">Leídos</div>
                  </div>
                </div>
              </div>
              <div className="w-24 text-right shrink-0">
                <div className="font-extrabold text-sm text-sky-600 tabular-nums">{calc.readPct}%</div>
                <div className="text-[10px] text-slate-400">del enviado</div>
              </div>
            </div>

            {/* Paso 4: Ingreso a tracking */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-[#FF5500] rounded-xl shadow-xs"
                  style={{ clipPath: 'polygon(21% 0%, 79% 0%, 72% 100%, 28% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[30px_68px] items-center justify-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0">
                    <MapPin size={15} />
                  </div>
                  <div className="flex flex-col items-center justify-center text-center leading-none">
                    <div className="font-extrabold text-base text-white tracking-tight tabular-nums">{calc.tracking}</div>
                    <div className="text-[11px] font-medium text-amber-50 mt-0.5">Ingreso</div>
                  </div>
                </div>
              </div>
              <div className="w-24 flex flex-col items-end justify-center gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-xs text-amber-700 tabular-nums">{calc.trackPct}%</span>
                  <span className="text-[9px] text-slate-400">s/env.</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-xs text-[#FF5500] tabular-nums">{calc.trackOverReadPct}%</span>
                  <span className="text-[9px] text-slate-400">s/leído</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Gráfico de Evolución de Indicadores */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <TrendingUp size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Evolución de Indicadores Clave</h3>
            </div>
            <span className="text-[11px] font-medium text-slate-500">Diario (Últimos {chartPolylines.points.length || 7} días)</span>
          </div>

          <div className="flex items-center gap-2 h-48 my-auto">
            <div className="flex flex-col justify-between h-36 text-[10px] text-slate-400 pr-1 text-right self-start mt-2">
              <span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span>
            </div>

            <div className="flex-1 h-full flex items-center">
              <svg viewBox="0 0 400 152" className="w-full h-44 overflow-visible">
                {[15, 38, 61, 84, 107, 130].map((y, idx) => (
                  <line key={idx} x1="10" y1={y} x2="390" y2={y} stroke="#F1F5F9" strokeDasharray="3 3" />
                ))}

                {chartPolylines.points.map((pt, idx) => (
                  <line key={`v-${idx}`} x1={pt.x} y1="15" x2={pt.x} y2="130" stroke="#F1F5F9" strokeWidth="0.8" strokeDasharray="2 2" />
                ))}

                <polyline fill="none" stroke="#10B981" strokeWidth="2.4" points={chartPolylines.whs} />
                <polyline fill="none" stroke="#0284C7" strokeWidth="2.4" points={chartPolylines.lectura} />
                <polyline fill="none" stroke="#EAB308" strokeWidth="2" strokeDasharray="4 3" points={chartPolylines.trackingLeidos} />
                <polyline fill="none" stroke="#FF5500" strokeWidth="2.4" points={chartPolylines.tracking} />

                {chartPolylines.points.map((pt, idx) => {
                  const showLabel = chartPolylines.points.length <= 10 || idx % 2 === 0 || idx === chartPolylines.points.length - 1;

                  // Anti-colisión vertical entre Lectura (azul), Tracking s/Leído (amarillo) y Tracking s/Env (naranja)
                  const closeToBlue = Math.abs(pt.yTrkLei - pt.yLec) < 14;
                  const closeToOrange = Math.abs(pt.yTrk - pt.yTrkLei) < 14;

                  const yLabelLec = closeToBlue && pt.yLec <= pt.yTrkLei ? pt.yLec - 8 : pt.yLec - 6;
                  const yLabelTrkLei =
                    closeToBlue && !closeToOrange
                      ? pt.yTrkLei + 11 // Si está pegado al azul, poner el texto amarillo debajo de su punto
                      : pt.yTrkLei - 6;
                  const yLabelTrk =
                    yLabelTrkLei > pt.yTrkLei && Math.abs(pt.yTrk - yLabelTrkLei) < 10
                      ? pt.yTrk + 14
                      : pt.yTrk + 12;

                  const labelHalo: React.CSSProperties = {
                    paintOrder: 'stroke',
                    stroke: '#FFFFFF',
                    strokeWidth: '3px',
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  };

                  return (
                    <g key={idx}>
                      <text x={pt.x} y={146} textAnchor="middle" fill="#64748B" fontSize="9.5" fontWeight="600">
                        {pt.fecha}
                      </text>
                      <circle cx={pt.x} cy={pt.yWhs} r="3.5" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                      {showLabel && (
                        <text x={pt.x} y={pt.yWhs - 6} textAnchor="middle" fill="#047857" fontSize="8.5" fontWeight="700" style={labelHalo}>
                          {pt.vWhs}
                        </text>
                      )}
                      <circle cx={pt.x} cy={pt.yLec} r="3.5" fill="#0284C7" stroke="#FFFFFF" strokeWidth="1.5" />
                      {showLabel && (
                        <text x={pt.x} y={yLabelLec} textAnchor="middle" fill="#0369A1" fontSize="8.5" fontWeight="700" style={labelHalo}>
                          {pt.vLec}
                        </text>
                      )}
                      <circle cx={pt.x} cy={pt.yTrkLei} r="3.2" fill="#EAB308" stroke="#FFFFFF" strokeWidth="1.5" />
                      {showLabel && (
                        <text x={pt.x} y={yLabelTrkLei} textAnchor="middle" fill="#B45309" fontSize="8.5" fontWeight="700" style={labelHalo}>
                          {pt.vTrkLei}
                        </text>
                      )}
                      <circle cx={pt.x} cy={pt.yTrk} r="3.5" fill="#FF5500" stroke="#FFFFFF" strokeWidth="1.5" />
                      {showLabel && (
                        <text x={pt.x} y={yLabelTrk} textAnchor="middle" fill="#C2410C" fontSize="8.5" fontWeight="700" style={labelHalo}>
                          {pt.vTrk}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5 font-medium text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Envío WHS</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span><span>Lectura</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Tracking (% s/Leído)</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5500]"></span><span>Tracking (% s/Env.)</span>
            </div>
          </div>
        </div>

        {/* 3. Eficiencia Operativa */}
        <div className="lg:col-span-3 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between space-y-2.5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Settings size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Eficiencia Operativa</h3>
            </div>
          </div>

          {/* Tarjeta 1: SOS (Botón Pulso Soporte) */}
          <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
                <LifeBuoy size={16} />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-700">SOS (Botón Soporte)</div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-extrabold text-slate-900 tabular-nums">
                    {calc.sosCount ?? '0'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 tabular-nums">
                    {calc.sosOverEnvPct ?? '0,0'}% s/env
                  </span>
                </div>
              </div>
            </div>
            <div className="border-l border-rose-200 pl-3 text-right shrink-0">
              <div className="text-sm font-extrabold text-rose-700 tabular-nums">
                {calc.sosOverTrackPct ?? '0,0'}%
              </div>
              <div className="text-[10px] text-slate-500">s/tracking</div>
            </div>
          </div>

          {/* Tarjeta 2: Autogestión Web Real (Tracking sin pulsar SOS) */}
          <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
                <Laptop size={16} />
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-600">Autogestión en Tracking</div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-extrabold text-slate-900 tabular-nums">
                    {calc.autogestionCount ?? calc.tracking ?? '0'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 tabular-nums">
                    {calc.autogestionPct ?? '100,0'}%
                  </span>
                </div>
              </div>
            </div>
            <div className="border-l border-sky-200 pl-3 text-right shrink-0">
              <div className="text-sm font-extrabold text-sky-800 tabular-nums">{calc.tracking}</div>
              <div className="text-[10px] text-slate-500">tracking total</div>
            </div>
          </div>

          {/* Tarjeta 3: Sin envío WSP / Gestión interna */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <Settings size={14} />
              </div>
              <div className="text-[11px] font-medium text-slate-600">Órdenes sin envío WSP</div>
            </div>
            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="text-sm font-extrabold text-slate-900">{calc.noEnviado}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {calc.noEnviadoPct}%
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-2.5 flex items-start gap-2 text-[10.5px] text-slate-500 leading-snug">
            <Info size={13} className="text-[#FF5500] shrink-0 mt-0.5" />
            <span>
              <strong>SOS:</strong> clientes con <code>pulso_soporte = 'SI'</code>.{' '}
              <strong>Autogestión:</strong> ingresaron al tracking sin requerir soporte.
            </span>
          </div>
        </div>
      </div>

      {/* FILA 2: DISTRIBUCIÓN ESTADO + SEGMENTOS + RANKING PARTNERS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
        {/* 1. Donut Distribución */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
              <Send size={15} />
            </div>
            <h3 className="font-bold text-sm text-slate-900">Distribución por Estado del Mensaje</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#10B981" strokeWidth="4.5" strokeDasharray="45 100" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#0284C7" strokeWidth="4.5" strokeDasharray="21 100" strokeDashoffset="-45" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#38BDF8" strokeWidth="4.5" strokeDasharray="14 100" strokeDashoffset="-66" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#94A3B8" strokeWidth="4.5" strokeDasharray="13 100" strokeDashoffset="-80" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#EF4444" strokeWidth="4.5" strokeDasharray="7 100" strokeDashoffset="-93" />
              </svg>
              <div className="absolute text-center leading-tight">
                <div className="font-extrabold text-base text-slate-900">{calc.whsEnviados}</div>
                <div className="text-[10px] text-slate-400">Enviados</div>
              </div>
            </div>
            <div className="flex-1 space-y-2 text-xs">
              <StatusRow color="bg-emerald-500" label="Leído (read)" count={calc.leidos} pct={`${calc.readPct}%`} />
              <StatusRow color="bg-sky-600" label="Enviado (sent)" count={calc.sent} pct={`${calc.sentPct}%`} />
              <StatusRow color="bg-blue-400" label="Entregado (deliv.)" count={calc.delivered} pct={`${calc.deliveredPct}%`} />
              <StatusRow color="bg-slate-400" label="No enviado" count={calc.noEnviado} pct={`${calc.noEnviadoPct}%`} />
              <StatusRow color="bg-rose-500" label="Fallido (failed)" count={calc.failed} pct={`${calc.failedPct}%`} />
            </div>
          </div>
        </div>

        {/* 2. Ingreso por Segmento */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <MapPin size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Ingreso a Tracking por Segmento</h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Por distrito</span>
          </div>

          <div className="space-y-4 my-auto py-2">
            {/* Alto Valor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-amber-50 text-amber-600">
                    <Crown size={15} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Alto Valor</div>
                    <div className="text-[10px] text-slate-500">{calc.avTotalFmt} casos</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-xs text-amber-700">{calc.avPct}%</div>
                  <div className="text-[10px] text-slate-400">{calc.avTrackingFmt} ing. / {calc.avEnviadosFmt} env.</div>
                </div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${calc.avBarWidth}%` }}
                />
              </div>
            </div>

            {/* Preferente */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-orange-50 text-[#FF5500]">
                    <Gem size={15} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Preferente</div>
                    <div className="text-[10px] text-slate-500">{calc.prefTotalFmt} casos</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-xs text-[#FF5500]">{calc.prefPct}%</div>
                  <div className="text-[10px] text-slate-400">{calc.prefTrackingFmt} ing. / {calc.prefEnviadosFmt} env.</div>
                </div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-[#FF5500] rounded-full transition-all duration-500"
                  style={{ width: `${calc.prefBarWidth}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Ranking de Partners (CSAT) */}
        <div className="md:col-span-2 lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Award size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Ranking de Partners (CSAT)</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[280px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2 text-left">#</th>
                  <th className="py-2 text-left">Partner</th>
                  <th className="py-2 text-center">Encuestas</th>
                  <th className="py-2 text-center">Nota (1–5)</th>
                  <th className="py-2 text-right">CSAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.length > 0 ? (
                  partners.map((p) => (
                    <PartnerRow key={p.name} rank={p.rank} name={p.name} surveys={p.surveys} score={p.score} csat={p.csat} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                      Sin encuestas en este rango
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FILA 3: ALERTAS OPERATIVAS & OPORTUNIDADES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle size={15} />
            </div>
            <h3 className="font-bold text-sm text-slate-900">Alertas Operativas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[380px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2 text-left">Motivo</th>
                  <th className="py-2 text-center">Cantidad</th>
                  <th className="py-2 text-center">% sobre base</th>
                  <th className="py-2 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50/70 transition">
                  <td className="py-2.5 flex items-center gap-2 font-semibold text-slate-900">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span> Mensajes no enviados
                  </td>
                  <td className="py-2.5 text-center font-bold text-slate-900">{calc.noEnviado}</td>
                  <td className="py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                      {calc.noEnviadoPct}%
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-500 text-[11px]">Órdenes con se_envio_wsp = 'NO' o estado_wsp = 'NO ENVIADO'.</td>
                </tr>
                <tr className="hover:bg-slate-50/70 transition">
                  <td className="py-2.5 flex items-center gap-2 font-semibold text-slate-900">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> Leídos sin ingreso a tracking
                  </td>
                  <td className="py-2.5 text-center font-bold text-slate-900">{calc.leidosSinIngreso}</td>
                  <td className="py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                      {calc.leidosSinIngresoPct}%
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-500 text-[11px]">Clientes que leyeron WhatsApp pero no interactuaron con el link.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle size={15} />
            </div>
            <h3 className="font-bold text-sm text-slate-900">Oportunidades de Mejora</h3>
          </div>
          <ul className="space-y-3 text-xs text-slate-700">
            <li className="flex items-start gap-2.5">
              <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Incrementar el ingreso a tracking en segmento Preferente (+2,5 pp).</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Elevar la tasa de autogestión web ≥ 80%.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Mantener la satisfacción de partners ≥ 4,5 (≥ 92% CSAT).</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ color, label, count, pct }: { color: string; label: string; count: string; pct: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
        <span className="text-slate-600 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-slate-900 font-bold">{count}</span>
        <span className="text-slate-400 w-12 text-right">{pct}</span>
      </div>
    </div>
  );
}

function PartnerRow({ rank, name, surveys, score, csat }: PartnerRankItem) {
  return (
    <tr className="hover:bg-slate-50/80 transition">
      <td className="py-2">
        <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${rank <= 3 ? 'bg-amber-100 text-amber-800' : 'text-slate-400 bg-slate-100'
          }`}>
          {rank}
        </span>
      </td>
      <td className="py-2 font-semibold text-slate-900">{name}</td>
      <td className="py-2 text-center text-slate-600">{surveys}</td>
      <td className="py-2 text-center font-bold text-slate-900">
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/50">
          {score} ★
        </span>
      </td>
      <td className="py-2 text-right">
        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
          {csat}
        </span>
      </td>
    </tr>
  );
}
