import React, { useMemo } from 'react';
import {
  Filter, Info, ClipboardList, Send, CheckCheck, MapPin,
  TrendingUp, Settings, Laptop, Clock, Crown, Gem, Award,
  AlertTriangle, Target, CheckCircle
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
      const yTrkLei = toY(pTrkLei);
      const yTrk = toY(pTrk);

      whsPts.push(`${x},${yWhs}`);
      lecPts.push(`${x},${yLec}`);
      trkPts.push(`${x},${yTrk}`);
      trkLeiPts.push(`${x},${yTrkLei}`);

      return {
        x,
        fecha: pt.fecha,
        yWhs,
        yLec,
        yTrkLei,
        yTrk,
        vWhs: fmtPct(pWhs),
        vLec: fmtPct(pLec),
        vTrkLei: fmtPct(pTrkLei),
        vTrk: fmtPct(pTrk),
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between overflow-hidden">
          <div className="border-b border-gray-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-[#FF6B00]" />
              <h3 className="font-bold text-sm text-white">Embudo de Interacción del Cliente</h3>
              <Info size={13} className="text-gray-500" />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Desde la orden hasta el ingreso a tracking</p>
          </div>

          <div className="space-y-2 my-auto py-1">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 shadow-lg"
                  style={{ clipPath: 'polygon(0% 0%, 100% 0%, 93% 100%, 7% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                    <ClipboardList size={15} />
                  </div>
                  <div className="text-left leading-tight">
                    <div className="font-extrabold text-base text-white tracking-tight">{calc.ordenes}</div>
                    <div className="text-[11px] font-medium text-blue-100">Órdenes</div>
                  </div>
                </div>
              </div>
              <div className="w-28 text-right shrink-0">
                <div className="font-extrabold text-sm text-white">100%</div>
                <div className="text-[10px] text-gray-500">Total base</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 shadow-lg"
                  style={{ clipPath: 'polygon(7% 0%, 93% 0%, 86% 100%, 14% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                    <Send size={14} />
                  </div>
                  <div className="text-left leading-tight">
                    <div className="font-extrabold text-base text-white tracking-tight">{calc.whsEnviados}</div>
                    <div className="text-[11px] font-medium text-emerald-50 whitespace-nowrap">Mensajes enviados</div>
                  </div>
                </div>
              </div>
              <div className="w-28 text-right shrink-0">
                <div className="font-extrabold text-sm text-emerald-400">{calc.whsPct}%</div>
                <div className="text-[10px] text-gray-400">del total</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-cyan-700 via-cyan-600 to-cyan-500 shadow-lg"
                  style={{ clipPath: 'polygon(14% 0%, 86% 0%, 79% 100%, 21% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                    <CheckCheck size={15} />
                  </div>
                  <div className="text-left leading-tight">
                    <div className="font-extrabold text-base text-white tracking-tight">{calc.leidos}</div>
                    <div className="text-[11px] font-medium text-cyan-50 whitespace-nowrap">Mensajes leídos</div>
                  </div>
                </div>
              </div>
              <div className="w-28 text-right shrink-0">
                <div className="font-extrabold text-sm text-cyan-300">{calc.readPct}%</div>
                <div className="text-[10px] text-gray-400">del enviado</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative flex-1 h-12 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 shadow-lg"
                  style={{ clipPath: 'polygon(21% 0%, 79% 0%, 72% 100%, 28% 100%)' }}
                />
                <div className="relative z-10 grid grid-cols-[28px_115px] items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
                    <MapPin size={15} />
                  </div>
                  <div className="text-left leading-tight">
                    <div className="font-extrabold text-base text-white tracking-tight">{calc.tracking}</div>
                    <div className="text-[11px] font-medium text-amber-50 whitespace-nowrap">Ingreso a tracking</div>
                  </div>
                </div>
              </div>
              <div className="w-28 flex flex-col items-end justify-center gap-1 shrink-0">
                <div className="flex items-center justify-between w-full px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px]">
                  <span className="text-gray-300">s/env.</span>
                  <span className="font-extrabold text-white">{calc.trackPct}%</span>
                </div>
                <div className="flex items-center justify-between w-full px-1.5 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/30 text-[10px]">
                  <span className="text-yellow-200/80">s/leído</span>
                  <span className="font-extrabold text-yellow-300">{calc.trackOverReadPct}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-[#FF6B00]" />
              <h3 className="font-bold text-sm text-white">Evolución de Indicadores Clave</h3>
            </div>
            <span className="text-[11px] text-gray-400">Diario (Últimos {chartPolylines.points.length || 7} días)</span>
          </div>

          <div className="flex items-center gap-2 h-48 my-auto">
            <div className="flex flex-col justify-between h-36 text-[10px] text-gray-500 pr-1 text-right self-start mt-2">
              <span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span>
            </div>

            <div className="flex-1 h-full flex items-center">
              <svg viewBox="0 0 400 152" className="w-full h-44 overflow-visible">
                {[15, 38, 61, 84, 107, 130].map((y, idx) => (
                  <line key={idx} x1="10" y1={y} x2="390" y2={y} stroke="#1F2937" strokeDasharray="3 3" />
                ))}

                {chartPolylines.points.map((pt, idx) => (
                  <line key={`v-${idx}`} x1={pt.x} y1="15" x2={pt.x} y2="130" stroke="#1F2937" strokeWidth="0.6" strokeDasharray="2 2" />
                ))}

                <polyline fill="none" stroke="#10B981" strokeWidth="2.2" points={chartPolylines.whs} />
                <polyline fill="none" stroke="#3B82F6" strokeWidth="2.2" points={chartPolylines.lectura} />
                <polyline fill="none" stroke="#FDE047" strokeWidth="1.8" strokeDasharray="4 3" points={chartPolylines.trackingLeidos} />
                <polyline fill="none" stroke="#F59E0B" strokeWidth="2.2" points={chartPolylines.tracking} />

                {chartPolylines.points.map((pt, idx) => {
                  const showLabel = chartPolylines.points.length <= 10 || idx % 2 === 0 || idx === chartPolylines.points.length - 1;
                  return (
                    <g key={idx}>
                      <text x={pt.x} y={146} textAnchor="middle" fill="#9CA3AF" fontSize="9.5" fontWeight="500">
                        {pt.fecha}
                      </text>
                      <circle cx={pt.x} cy={pt.yWhs} r="3.5" fill="#10B981" stroke="#090D16" strokeWidth="1.5">
                        <title>{`${pt.fecha} • Envío WHS: ${pt.vWhs}`}</title>
                      </circle>
                      {showLabel && (
                        <text x={pt.x} y={pt.yWhs - 6} textAnchor="middle" fill="#6EE7B7" fontSize="8.5" fontWeight="700">
                          {pt.vWhs}
                        </text>
                      )}
                      <circle cx={pt.x} cy={pt.yLec} r="3.5" fill="#3B82F6" stroke="#090D16" strokeWidth="1.5">
                        <title>{`${pt.fecha} • Lectura: ${pt.vLec}`}</title>
                      </circle>
                      {showLabel && (
                        <text x={pt.x} y={pt.yLec - 6} textAnchor="middle" fill="#93C5FD" fontSize="8.5" fontWeight="700">
                          {pt.vLec}
                        </text>
                      )}
                      <circle cx={pt.x} cy={pt.yTrkLei} r="3.2" fill="#FDE047" stroke="#090D16" strokeWidth="1.5">
                        <title>{`${pt.fecha} • Tracking (s/Leído): ${pt.vTrkLei}`}</title>
                      </circle>
                      {showLabel && (
                        <text x={pt.x} y={pt.yTrkLei - 6} textAnchor="middle" fill="#FEF08A" fontSize="8.5" fontWeight="700">
                          {pt.vTrkLei}
                        </text>
                      )}
                      <circle cx={pt.x} cy={pt.yTrk} r="3.5" fill="#F59E0B" stroke="#090D16" strokeWidth="1.5">
                        <title>{`${pt.fecha} • Tracking (s/Env.): ${pt.vTrk}`}</title>
                      </circle>
                      {showLabel && (
                        <text x={pt.x} y={pt.yTrk + 11} textAnchor="middle" fill="#FCD34D" fontSize="8.5" fontWeight="700">
                          {pt.vTrk}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex flex-col justify-between h-36 py-1 text-[10px] font-bold text-right shrink-0">
              <span className="px-2 py-0.5 rounded bg-emerald-500 text-gray-950">{calc.whsPct}%</span>
              <span className="px-2 py-0.5 rounded bg-blue-500 text-white">{calc.readPct}%</span>
              <span className="px-2 py-0.5 rounded bg-yellow-300 text-gray-950">{calc.trackOverReadPct}% (leído)</span>
              <span className="px-2 py-0.5 rounded bg-amber-500 text-gray-950">{calc.trackPct}% (env.)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-gray-800/60 text-[11px] text-gray-300">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Envío WHS</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>Lectura</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-300"></span><span>Tracking (% s/Leído)</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Tracking (% s/Env.)</span></div>
          </div>
        </div>

        <div className="lg:col-span-3 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between space-y-2.5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-2">
              <Settings size={15} className="text-[#FF6B00]" />
              <h3 className="font-bold text-sm text-white">Eficiencia Operativa</h3>
            </div>
          </div>
          <div className="bg-[#0D1F1C]/50 border border-emerald-500/30 rounded-lg p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-400"><Settings size={16} /></div>
              <div>
                <div className="text-[11px] text-gray-300">Gestiones automatizadas</div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-extrabold text-white">{calc.noEnviado}</span>
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{calc.noEnviadoPct}%</span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[#0D1F1C]/50 border border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400"><Laptop size={16} /></div>
              <div>
                <div className="flex items-center gap-1 text-[11px] text-gray-200 font-medium"><span>Tasa de Autogestión Web</span></div>
                <div className="text-2xl font-extrabold text-white mt-0.5">75,8%</div>
              </div>
            </div>
            <div className="border-l border-gray-700 pl-3 text-right"><div className="text-sm font-extrabold text-white">{calc.tracking}</div><div className="text-[10px] text-gray-400">tracking</div></div>
          </div>
          <div className="flex items-center justify-between px-1 py-1">
            <div className="flex items-center gap-2"><Clock size={15} className="text-cyan-400" /><span className="text-[11px] text-gray-300 leading-tight">Tiempo promedio de<br />respuesta al cliente</span></div>
            <div className="flex items-center gap-2"><span className="text-base font-extrabold text-white">2,6 min</span></div>
          </div>
          <div className="bg-[#1F2937]/50 rounded-lg p-2 flex items-start gap-2 text-[10px] text-gray-400 leading-snug">
            <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <span>Clientes que ingresaron al tracking sin contacto en MANTRA.</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 overflow-hidden">
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
              <div className="absolute text-center leading-tight"><div className="font-extrabold text-sm text-white">{calc.whsEnviados}</div><div className="text-[10px] text-gray-400">Enviados</div></div>
            </div>
            <div className="flex-1 space-y-1.5 text-xs">
              <StatusRow color="bg-emerald-500" label="Leído (read)" count={calc.leidos} pct={`${calc.readPct}%`} />
              <StatusRow color="bg-blue-500" label="Enviado (sent)" count={calc.sent} pct={`${calc.sentPct}%`} />
              <StatusRow color="bg-sky-400" label="Entregado (delivered)" count={calc.delivered} pct={`${calc.deliveredPct}%`} />
              <StatusRow color="bg-gray-500" label="No enviado" count={calc.noEnviado} pct={`${calc.noEnviadoPct}%`} />
              <StatusRow color="bg-red-500" label="Fallido (failed)" count={calc.failed} pct={`${calc.failedPct}%`} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-[#FF6B00]" />
              <h3 className="font-bold text-sm text-white">Ingreso a Tracking por Segmento</h3>
            </div>
            <span className="text-[10px] text-gray-400">Por distrito</span>
          </div>

          <div className="space-y-5 my-auto py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-32 shrink-0">
                <Crown size={18} className="text-amber-400 shrink-0" />
                <div className="leading-tight">
                  <div className="text-xs font-semibold text-white">Alto Valor</div>
                  <div className="text-[10px] text-gray-400">{calc.avTotalFmt} casos</div>
                </div>
              </div>
              <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${calc.avBarWidth}%` }}
                />
              </div>
              <div className="text-right w-36 leading-tight shrink-0">
                <div className="font-extrabold text-xs text-white">
                  {calc.avPct}% <span className="text-[10px] font-normal text-amber-300">({calc.avOverReadPct}% leído)</span>
                </div>
                <div className="text-[10px] text-gray-400">
                  {calc.avTrackingFmt} ing. / {calc.avEnviadosFmt} env.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-32 shrink-0">
                <Gem size={18} className="text-amber-500 shrink-0" />
                <div className="leading-tight">
                  <div className="text-xs font-semibold text-white">Preferente</div>
                  <div className="text-[10px] text-gray-400">{calc.prefTotalFmt} casos</div>
                </div>
              </div>
              <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                  style={{ width: `${calc.prefBarWidth}%` }}
                />
              </div>
              <div className="text-right w-36 leading-tight shrink-0">
                <div className="font-extrabold text-xs text-white">
                  {calc.prefPct}% <span className="text-[10px] font-normal text-yellow-300">({calc.prefOverReadPct}% leído)</span>
                </div>
                <div className="text-[10px] text-gray-400">
                  {calc.prefTrackingFmt} ing. / {calc.prefEnviadosFmt} env.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 lg:col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <Award size={15} className="text-[#FF6B00]" />
              <h3 className="font-bold text-sm text-white">Ranking de Partners (CSAT)</h3>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                <th className="py-1 text-left">#</th><th className="py-1 text-left">Partner</th><th className="py-1 text-center">Encuestas</th><th className="py-1 text-center">Nota (1–5)</th><th className="py-1 text-right">CSAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {partners.length > 0 ? (
                partners.map((p) => (
                  <PartnerRow key={p.name} rank={p.rank} name={p.name} surveys={p.surveys} score={p.score} csat={p.csat} />
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500 text-xs">
                    Sin encuestas en este rango
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-2">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="font-bold text-sm text-white">Alertas Operativas</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800 text-[11px]">
                <th className="py-1.5 text-left">Motivo</th><th className="py-1.5 text-center">Cantidad</th><th className="py-1.5 text-center">% sobre base</th><th className="py-1.5 text-left">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              <tr>
                <td className="py-2 flex items-center gap-2 font-medium text-white"><AlertTriangle size={14} className="text-red-500" /> Mensajes no enviados</td>
                <td className="py-2 text-center font-bold">{calc.noEnviado}</td>
                <td className="py-2 text-center">{calc.noEnviadoPct}%</td>
                <td className="py-2 text-gray-400 text-[11px]">Órdenes con se_envio_wsp = 'NO' o estado_wsp = 'NO ENVIADO'.</td>
              </tr>
              <tr>
                <td className="py-2 flex items-center gap-2 font-medium text-white"><AlertTriangle size={14} className="text-amber-400" /> Mensajes leídos sin ingreso</td>
                <td className="py-2 text-center font-bold">{calc.leidosSinIngreso}</td>
                <td className="py-2 text-center">{calc.leidosSinIngresoPct}%</td>
                <td className="py-2 text-gray-400 text-[11px]">Clientes con estado_wsp = 'read' pero ingreso_tracking = 'NO'.</td>
              </tr>
              <tr>
                <td className="py-2 flex items-center gap-2 font-medium text-white"><AlertTriangle size={14} className="text-amber-400" /> Fallidos en envío</td>
                <td className="py-2 text-center font-bold">{calc.failed}</td>
                <td className="py-2 text-center">{calc.failedPct}%</td>
                <td className="py-2 text-gray-400 text-[11px]">Errores de entrega con estado_wsp = 'failed'.</td>
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
            <li className="flex items-start gap-2"><CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" /><span>Incrementar el ingreso a tracking en segmento Preferente (+2,5 pp).</span></li>
            <li className="flex items-start gap-2"><CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" /><span>Elevar la tasa de autogestión web ≥ 80%.</span></li>
            <li className="flex items-start gap-2"><CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" /><span>Mantener la satisfacción de partners ≥ 4,5 (≥ 92% CSAT).</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ color, label, count, pct }: { color: string; label: string; count: string; pct: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-sm ${color}`}></span><span className="text-gray-300">{label}</span></div>
      <div className="flex items-center gap-3"><span className="text-gray-200 font-semibold">{count}</span><span className="text-gray-400 w-12 text-right">{pct}</span></div>
    </div>
  );
}

function PartnerRow({ rank, name, surveys, score, csat }: PartnerRankItem) {
  return (
    <tr>
      <td className="py-1.5"><span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${rank <= 3 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-gray-400'}`}>{rank}</span></td>
      <td className="py-1.5 font-semibold text-white">{name}</td>
      <td className="py-1.5 text-center text-gray-300">{surveys}</td>
      <td className="py-1.5 text-center font-bold text-white">{score} <span className="text-amber-400">★</span></td>
      <td className="py-1.5 text-right"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">{csat}</span></td>
    </tr>
  );
}