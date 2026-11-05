import React from 'react';
import { ClipboardList, Send, CheckCheck, MapPin, CalendarClock, MessageSquare } from 'lucide-react';
import { CalculatedMetrics, KpiData } from '../types/dashboard';

export function KpiCards({ calc, kpis }: { calc: CalculatedMetrics; kpis: KpiData | null }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {/* 1. Órdenes Evaluadas */}
      <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-200 transition">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <ClipboardList size={18} />
          </div>
          <span className="text-xs text-slate-500 font-medium truncate">Órdenes evaluadas</span>
        </div>
        <div className="mt-3">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{calc.ordenes}</span>
        </div>
      </div>

      {/* 2. Envío de WhatsApp */}
      <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-200 transition">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
            <Send size={18} />
          </div>
          <span className="text-xs text-slate-500 font-medium truncate">Envío de WhatsApp</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{calc.whsEnviados}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            {calc.whsPct}%
          </span>
        </div>
      </div>

      {/* 3. Lectura del Mensaje */}
      <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-200 transition">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
            <CheckCheck size={18} />
          </div>
          <span className="text-xs text-slate-500 font-medium truncate">Lectura mensaje</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{calc.leidos}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
            {calc.readPct}%
          </span>
        </div>
      </div>

      {/* 4. Ingreso a Tracking */}
      <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-200 transition">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
            <MapPin size={18} />
          </div>
          <span className="text-xs text-slate-500 font-medium truncate">Ingreso a Tracking</span>
        </div>
        <div className="mt-2 flex items-center justify-between sm:justify-start gap-2.5">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{calc.tracking}</span>
          <div className="flex flex-col gap-1">
            <span className="text-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 leading-none">
              {calc.trackPct}% env.
            </span>
            <span className="text-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 leading-none">
              {calc.trackOverReadPct}% leído
            </span>
          </div>
        </div>
      </div>

      {/* 5. Reprogramaciones */}
      <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-200 transition">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
            <CalendarClock size={18} />
          </div>
          <span className="text-xs text-slate-500 font-medium truncate">Reprogramaciones</span>
        </div>
        <div className="mt-3">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{calc.reprog}</span>
        </div>
      </div>

      {/* 6. Encuestas (CSAT) */}
      <div className="bg-white border border-slate-100 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-200 transition">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-orange-50 text-[#FF5500]">
            <MessageSquare size={18} />
          </div>
          <span className="text-xs text-slate-500 font-medium truncate">Encuestas (CSAT)</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{calc.csatCount}</span>
          {Number(kpis?.csat_avg || 0) > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500]">
              {Number(kpis?.csat_avg).toFixed(1).replace('.', ',')} ★
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
