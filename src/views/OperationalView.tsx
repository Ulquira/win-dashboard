import React from 'react';
import { Calendar, Send, Activity, MapPin, Layers } from 'lucide-react';
import { CalculatedMetrics, KpiData } from '../types/dashboard';

interface OperationalViewProps {
  calc: CalculatedMetrics;
  kpis: KpiData | null;
  dailyInRange: any[];
  byEstadoOt: any[];
  bySector: any[];
  byTipoOperacion: any[];
}

export function OperationalView({
  calc, kpis, dailyInRange, byEstadoOt, bySector, byTipoOperacion
}: OperationalViewProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 bg-[#111827]/90 border border-gray-800 rounded-xl p-4 flex flex-col justify-start">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-cyan-400" />
              <h3 className="font-bold text-xs tracking-wider uppercase text-white">Resumen Ejecutivo</h3>
            </div>
            <span className="text-[11px] text-gray-400">{dailyInRange.length} {dailyInRange.length === 1 ? 'día' : 'días'}</span>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-800 text-[10px] uppercase">
                  <th className="py-2 text-left">Fecha</th>
                  <th className="py-2 text-right">Total Base</th>
                  <th className="py-2 text-right">WSP Env.</th>
                  <th className="py-2 text-right">Leídos (Read)</th>
                  <th className="py-2 text-right">Tracking</th>
                  <th className="py-2 text-right">Reprog.</th>
                  <th className="py-2 text-right">Encuestas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {[...dailyInRange].reverse().map((d, i) => {
                  const tot = Number(d.total || 0);
                  const env = Number(d.enviados || 0);
                  const lei = Number(d.leidos || 0);
                  const trk = Number(d.tracking || 0);
                  const pEnv = tot > 0 ? ((env / tot) * 100).toFixed(1) : '0.0';
                  const pLei = env > 0 ? ((lei / env) * 100).toFixed(1) : '0.0';
                  const pTrkEnv = env > 0 ? ((trk / env) * 100).toFixed(1) : '0.0';
                  const pTrkLei = lei > 0 ? ((trk / lei) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={i} className="hover:bg-gray-800/30">
                      <td className="py-2.5 font-bold text-white">{d.fecha_full || d.raw_date}</td>
                      <td className="py-2.5 text-right font-bold text-gray-200">{tot.toLocaleString('es-PE')}</td>
                      <td className="py-2.5 text-right">
                        <span className="text-emerald-400 font-bold">{env.toLocaleString('es-PE')}</span>{' '}
                        <span className="text-[10px] text-emerald-500/80">({pEnv}%)</span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="text-cyan-400 font-bold">{lei.toLocaleString('es-PE')}</span>{' '}
                        <span className="text-[10px] text-cyan-500/80">({pLei}%)</span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="text-amber-400 font-bold">{trk.toLocaleString('es-PE')}</span>{' '}
                        <span className="text-[10px] text-amber-500/90">({pTrkEnv}%)</span>{' '}
                        <span className="text-[10px] text-cyan-300 font-semibold">[{pTrkLei}%]</span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-purple-400">{Number(d.reprogramaciones || 0)}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-400">{Number(d.encuestas || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Send size={14} className="text-emerald-400" />
              <h3 className="font-bold text-xs tracking-wider uppercase text-white">Distribución por Estado WSP</h3>
            </div>
            <span className="text-[11px] text-gray-400">{calc.ordenes} msgs</span>
          </div>

          <div className="space-y-3">
            {[
              { label: 'READ', count: Number(kpis?.whs_leidos || 0), badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', bar: 'bg-emerald-500' },
              { label: 'DELIVERED', count: Number(kpis?.whs_delivered || 0), badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', bar: 'bg-cyan-400' },
              { label: 'NO ENVIADO', count: Number(kpis?.whs_no_enviado || 0), badge: 'bg-gray-700/40 text-gray-300 border-gray-600/40', bar: 'bg-gray-500' },
              { label: 'SENT', count: Number(kpis?.whs_sent || 0), badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', bar: 'bg-blue-500' },
              { label: 'FAILED', count: Number(kpis?.whs_failed || 0), badge: 'bg-red-500/15 text-red-400 border-red-500/30', bar: 'bg-red-500' },
            ].map((st) => {
              const tot = Number(kpis?.total_ordenes || 0);
              const pctVal = tot > 0 ? (st.count / tot) * 100 : 0;
              return (
                <div key={st.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.badge}`}>{st.label}</span>
                    <div>
                      <span className="font-extrabold text-white mr-1.5">{st.count.toLocaleString('es-PE')}</span>
                      <span className="text-[11px] text-gray-400">({pctVal.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.min(100, pctVal)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-emerald-400" />
            <h3 className="font-bold text-xs tracking-wider uppercase text-white">Conversión por Estado OT (% Leído & % Ingreso)</h3>
          </div>
          <span className="text-[11px] text-gray-400">{byEstadoOt.length} estados</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800 text-[10px] uppercase">
                <th className="py-2 text-left">Estado OT</th>
                <th className="py-2 text-right">Total OTs</th>
                <th className="py-2 text-right">WSP Env.</th>
                <th className="py-2 text-right">Leídos (Read)</th>
                <th className="py-2 text-right">% Leído</th>
                <th className="py-2 text-right">Tracking</th>
                <th className="py-2 text-right">% Ingreso s/Env</th>
                <th className="py-2 text-right">% Ingreso s/Read</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {byEstadoOt.map((r, i) => {
                const tot = Number(r.total || 0);
                const env = Number(r.enviados || 0);
                const lei = Number(r.leidos || 0);
                const trk = Number(r.tracking || 0);
                const pEnv = tot > 0 ? ((env / tot) * 100).toFixed(1) : '0.0';
                const pLei = env > 0 ? ((lei / env) * 100).toFixed(1) : '0.0';
                const pTrkEnv = env > 0 ? ((trk / env) * 100).toFixed(1) : '0.0';
                const pTrkLei = lei > 0 ? ((trk / lei) * 100).toFixed(1) : '0.0';

                const stLower = String(r.estado_ot || '').toLowerCase();
                const badgeCls =
                  stLower.includes('iniciada') || stLower.includes('finalizada')
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : stLower.includes('agendada')
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                    : stLower.includes('cancel') || stLower.includes('anul')
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

                return (
                  <tr key={i} className="hover:bg-gray-800/30">
                    <td className="py-2.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeCls}`}>
                        {r.estado_ot}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-white">{tot.toLocaleString('es-PE')}</td>
                    <td className="py-2.5 text-right">
                      <span className="text-emerald-400 font-bold">{env.toLocaleString('es-PE')}</span>{' '}
                      <span className="text-[10px] text-emerald-500/80">({pEnv}%)</span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-cyan-400">{lei.toLocaleString('es-PE')}</td>
                    <td className="py-2.5 text-right font-bold text-cyan-300">{pLei}%</td>
                    <td className="py-2.5 text-right font-bold text-amber-400">{trk.toLocaleString('es-PE')}</td>
                    <td className="py-2.5 text-right font-bold text-amber-400">{pTrkEnv}%</td>
                    <td className="py-2.5 text-right font-bold text-cyan-300">[{pTrkLei}%]</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-[#FF6B00]" />
              <h3 className="font-bold text-xs tracking-wider uppercase text-white">Rendimiento por Sector Operativo (Top Sectores)</h3>
            </div>
            <span className="text-[11px] text-gray-400">{bySector.length} sectores</span>
          </div>

          <div className="overflow-y-auto max-h-80 pr-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#111827]">
                <tr className="text-gray-400 border-b border-gray-800 text-[10px] uppercase">
                  <th className="py-2 text-left">Sector Operativo</th>
                  <th className="py-2 text-right">Total OTs</th>
                  <th className="py-2 text-right">Enviados</th>
                  <th className="py-2 text-right">No Env.</th>
                  <th className="py-2 text-center">% Cobertura WSP</th>
                  <th className="py-2 text-right">Tracking</th>
                  <th className="py-2 text-right">Leídos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {bySector.map((s, i) => {
                  const tot = Number(s.total || 0);
                  const env = Number(s.enviados || 0);
                  const noEnv = Number(s.no_enviados || 0);
                  const cobPct = tot > 0 ? Math.round((env / tot) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-800/30">
                      <td className="py-2.5 font-bold text-white uppercase">{s.sector_operativo}</td>
                      <td className="py-2.5 text-right font-bold text-white">{tot.toLocaleString('es-PE')}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-400">{env.toLocaleString('es-PE')}</td>
                      <td className="py-2.5 text-right text-gray-400">{noEnv.toLocaleString('es-PE')}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, cobPct)}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-amber-400 w-8">{cobPct}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-bold text-amber-400">{Number(s.tracking || 0)}</td>
                      <td className="py-2.5 text-right font-bold text-cyan-400">{Number(s.leidos || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-4 bg-[#111827]/90 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-amber-400" />
              <h3 className="font-bold text-xs tracking-wider uppercase text-white">Tipo de Operación</h3>
            </div>
            <span className="text-[11px] text-gray-400">{byTipoOperacion.length} tipos</span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-80 pr-1">
            {byTipoOperacion.map((t, i) => {
              const totalGlobal = Number(kpis?.total_ordenes || 0);
              const totalTipo = Number(t.total || 0);
              const envTipo = Number(t.enviados || 0);
              const sharePct = totalGlobal > 0 ? ((totalTipo / totalGlobal) * 100).toFixed(1) : '0.0';
              const cobPct = totalTipo > 0 ? Math.round((envTipo / totalTipo) * 100) : 0;
              return (
                <div key={i} className="bg-[#090D16]/70 border border-gray-800/80 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-white uppercase">{t.tipo}</span>
                    <span className="font-bold text-gray-200">
                      {totalTipo.toLocaleString('es-PE')} <span className="text-gray-400 font-normal">({sharePct}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-400">
                      Enviados WSP: <strong className="text-emerald-400">{envTipo.toLocaleString('es-PE')}</strong>
                    </span>
                    <span className="text-gray-400">
                      Cobertura: <strong className="text-[#FF6B00]">{cobPct}%</strong>
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#FF6B00] to-amber-500 rounded-full" style={{ width: `${Math.min(100, cobPct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}