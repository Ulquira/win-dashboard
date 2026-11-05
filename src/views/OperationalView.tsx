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
    <div className="space-y-6">
      {/* FILA 1: RESUMEN DIARIO + DISTRIBUCIÓN WSP */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 flex flex-col justify-start overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Calendar size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Resumen Diario de Operaciones</h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              {dailyInRange.length} {dailyInRange.length === 1 ? 'día' : 'días'}
            </span>
          </div>

          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 text-left">Fecha</th>
                  <th className="py-2.5 text-right">Total Base</th>
                  <th className="py-2.5 text-right">WSP Env.</th>
                  <th className="py-2.5 text-right">Leídos (Read)</th>
                  <th className="py-2.5 text-right">Tracking</th>
                  <th className="py-2.5 text-right">Reprog.</th>
                  <th className="py-2.5 text-right">Encuestas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                    <tr key={i} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 font-semibold text-slate-900">{d.fecha_full || d.raw_date}</td>
                      <td className="py-2.5 text-right font-bold text-slate-900">{tot.toLocaleString('es-PE')}</td>
                      <td className="py-2.5 text-right">
                        <span className="text-emerald-700 font-bold">{env.toLocaleString('es-PE')}</span>{' '}
                        <span className="text-[10px] text-slate-400">({pEnv}%)</span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="text-sky-700 font-bold">{lei.toLocaleString('es-PE')}</span>{' '}
                        <span className="text-[10px] text-slate-400">({pLei}%)</span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="text-amber-700 font-bold">{trk.toLocaleString('es-PE')}</span>{' '}
                        <span className="text-[10px] text-slate-400">({pTrkEnv}%)</span>{' '}
                        <span className="text-[10px] font-semibold text-sky-700">[{pTrkLei}%]</span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-purple-700">{Number(d.reprogramaciones || 0)}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-700">{Number(d.encuestas || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Distribución WSP */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Send size={14} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Distribución por Estado WSP</h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">{calc.ordenes} msgs</span>
          </div>

          <div className="space-y-3.5">
            {[
              { label: 'READ', count: Number(kpis?.whs_leidos || 0), badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
              { label: 'DELIVERED', count: Number(kpis?.whs_delivered || 0), badge: 'bg-sky-100 text-sky-800', bar: 'bg-sky-500' },
              { label: 'NO ENVIADO', count: Number(kpis?.whs_no_enviado || 0), badge: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400' },
              { label: 'SENT', count: Number(kpis?.whs_sent || 0), badge: 'bg-blue-100 text-blue-800', bar: 'bg-blue-500' },
              { label: 'FAILED', count: Number(kpis?.whs_failed || 0), badge: 'bg-rose-100 text-rose-800', bar: 'bg-rose-500' },
            ].map((st) => {
              const tot = Number(kpis?.total_ordenes || 0);
              const pctVal = tot > 0 ? (st.count / tot) * 100 : 0;
              return (
                <div key={st.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${st.badge}`}>{st.label}</span>
                    <div>
                      <span className="font-extrabold text-slate-900 mr-1.5">{st.count.toLocaleString('es-PE')}</span>
                      <span className="text-[11px] text-slate-400">({pctVal.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${st.bar}`} style={{ width: `${Math.min(100, pctVal)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FILA 2: CONVERSIÓN POR ESTADO OT */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
              <Activity size={15} />
            </div>
            <h3 className="font-bold text-sm text-slate-900">Conversión por Estado OT (% Leído & % Ingreso)</h3>
          </div>
          <span className="text-[11px] font-medium text-slate-400">{byEstadoOt.length} estados</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[620px]">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2.5 text-left">Estado OT</th>
                <th className="py-2.5 text-right">Total OTs</th>
                <th className="py-2.5 text-right">WSP Env.</th>
                <th className="py-2.5 text-right">Leídos (Read)</th>
                <th className="py-2.5 text-right">% Leído</th>
                <th className="py-2.5 text-right">Tracking</th>
                <th className="py-2.5 text-right">% Ingreso s/Env</th>
                <th className="py-2.5 text-right">% Ingreso s/Read</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
                    ? 'bg-emerald-100 text-emerald-800'
                    : stLower.includes('agendada')
                    ? 'bg-sky-100 text-sky-800'
                    : stLower.includes('cancel') || stLower.includes('anul')
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800';

                return (
                  <tr key={i} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${badgeCls}`}>
                        {r.estado_ot}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-900">{tot.toLocaleString('es-PE')}</td>
                    <td className="py-2.5 text-right">
                      <span className="text-emerald-700 font-bold">{env.toLocaleString('es-PE')}</span>{' '}
                      <span className="text-[10px] text-slate-400">({pEnv}%)</span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-sky-700">{lei.toLocaleString('es-PE')}</td>
                    <td className="py-2.5 text-right font-bold text-sky-800">{pLei}%</td>
                    <td className="py-2.5 text-right font-bold text-amber-700">{trk.toLocaleString('es-PE')}</td>
                    <td className="py-2.5 text-right font-bold text-amber-800">{pTrkEnv}%</td>
                    <td className="py-2.5 text-right font-bold text-sky-700">[{pTrkLei}%]</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* FILA 3: SECTOR OPERATIVO + TIPO OPERACIÓN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <MapPin size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Rendimiento por Sector Operativo (Top Sectores)</h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">{bySector.length} sectores</span>
          </div>

          <div className="overflow-y-auto max-h-80 pr-1">
            <table className="w-full text-xs min-w-[500px]">
              <thead className="sticky top-0 bg-white">
                <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 text-left">Sector Operativo</th>
                  <th className="py-2.5 text-right">Total OTs</th>
                  <th className="py-2.5 text-right">Enviados</th>
                  <th className="py-2.5 text-right">No Env.</th>
                  <th className="py-2.5 text-center">% Cobertura WSP</th>
                  <th className="py-2.5 text-right">Tracking</th>
                  <th className="py-2.5 text-right">Leídos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bySector.map((s, i) => {
                  const tot = Number(s.total || 0);
                  const env = Number(s.enviados || 0);
                  const noEnv = Number(s.no_enviados || 0);
                  const cobPct = tot > 0 ? Math.round((env / tot) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 font-bold text-slate-900 uppercase">{s.sector_operativo}</td>
                      <td className="py-2.5 text-right font-bold text-slate-900">{tot.toLocaleString('es-PE')}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-700">{env.toLocaleString('es-PE')}</td>
                      <td className="py-2.5 text-right text-slate-400">{noEnv.toLocaleString('es-PE')}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, cobPct)}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-amber-700 w-8">{cobPct}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-bold text-amber-700">{Number(s.tracking || 0)}</td>
                      <td className="py-2.5 text-right font-bold text-sky-700">{Number(s.leidos || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-50 text-[#FF5500]">
                <Layers size={15} />
              </div>
              <h3 className="font-bold text-sm text-slate-900">Tipo de Operación</h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">{byTipoOperacion.length} tipos</span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-80 pr-1">
            {byTipoOperacion.map((t, i) => {
              const totalGlobal = Number(kpis?.total_ordenes || 0);
              const totalTipo = Number(t.total || 0);
              const envTipo = Number(t.enviados || 0);
              const sharePct = totalGlobal > 0 ? ((totalTipo / totalGlobal) * 100).toFixed(1) : '0.0';
              const cobPct = totalTipo > 0 ? Math.round((envTipo / totalTipo) * 100) : 0;
              return (
                <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 uppercase">{t.tipo}</span>
                    <span className="font-bold text-slate-700">
                      {totalTipo.toLocaleString('es-PE')} <span className="text-slate-400 font-normal">({sharePct}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      Enviados: <strong className="text-emerald-700">{envTipo.toLocaleString('es-PE')}</strong>
                    </span>
                    <span className="text-slate-500">
                      Cobertura: <strong className="text-[#FF5500]">{cobPct}%</strong>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#FF5500] to-amber-500 rounded-full" style={{ width: `${Math.min(100, cobPct)}%` }} />
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
