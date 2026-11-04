import React from 'react';
import { ClipboardList, Send, CheckCheck, MapPin, CalendarClock, MessageSquare } from 'lucide-react';
import { CalculatedMetrics, KpiData } from '../types/dashboard';

export function KpiCards({ calc, kpis }: { calc: CalculatedMetrics; kpis: KpiData | null }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
      <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <ClipboardList size={16} className="sm:w-[18px] sm:h-[18px]" />
          </div>
          <span className="text-[11px] sm:text-xs text-gray-300 font-medium truncate">Órdenes evaluadas</span>
        </div>
        <div className="mt-2 sm:mt-3">
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{calc.ordenes}</span>
        </div>
      </div>

      <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          </div>
          <span className="text-[11px] sm:text-xs text-gray-300 font-medium truncate">Envío de WhatsApp</span>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2.5">
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{calc.whsEnviados}</span>
          <span className="text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
            {calc.whsPct}%
          </span>
        </div>
      </div>

      <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <CheckCheck size={16} className="sm:w-[18px] sm:h-[18px]" />
          </div>
          <span className="text-[11px] sm:text-xs text-gray-300 font-medium truncate">Lectura mensaje</span>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2.5">
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{calc.leidos}</span>
          <span className="text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
            {calc.readPct}%
          </span>
        </div>
      </div>

      <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <MapPin size={16} className="sm:w-[18px] sm:h-[18px]" />
          </div>
          <span className="text-[11px] sm:text-xs text-gray-300 font-medium truncate">Ingreso a Tracking</span>
        </div>
        <div className="mt-2 flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{calc.tracking}</span>
          <div className="flex flex-col gap-1">
            <span className="text-center text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 leading-none">
              {calc.trackPct}% env.
            </span>
            <span className="text-center text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-200 border border-yellow-500/30 leading-none">
              {calc.trackOverReadPct}% leído
            </span>
          </div>
        </div>
      </div>

      <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <CalendarClock size={16} className="sm:w-[18px] sm:h-[18px]" />
          </div>
          <span className="text-[11px] sm:text-xs text-gray-300 font-medium truncate">Reprogramaciones</span>
        </div>
        <div className="mt-2 sm:mt-3">
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{calc.reprog}</span>
        </div>
      </div>

      <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <MessageSquare size={16} className="sm:w-[18px] sm:h-[18px]" />
          </div>
          <span className="text-[11px] sm:text-xs text-gray-300 font-medium truncate">Encuestas (CSAT)</span>
        </div>
        <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2">
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{calc.csatCount}</span>
          {Number(kpis?.csat_avg || 0) > 0 && (
            <span className="text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
              {Number(kpis?.csat_avg).toFixed(1).replace('.', ',')} ★
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
