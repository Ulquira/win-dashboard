import React from 'react';
import { ExternalLink } from 'lucide-react';
import { RealOrder } from '../types/dashboard';
import { OrderGeoMap } from './OrderGeoMap';

export function OrderDetailDrawer({
  selectedOrder,
  onClose,
}: {
  selectedOrder: RealOrder | null;
  onClose: () => void;
}) {
  if (!selectedOrder) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white border-l border-slate-200 h-full overflow-y-auto p-6 space-y-5 shadow-2xl text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-[#FF5500] text-white font-black text-sm shadow-xs shadow-orange-500/20">
                Orden #{selectedOrder.orden_id}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">
                {selectedOrder.estado_ot || 'Sin Estado OT'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Ticket: <strong className="text-slate-800">{selectedOrder.ticket || '-'}</strong> • Fecha Solicitud:{' '}
              <strong className="text-slate-800">{selectedOrder.fecha_solicitud_fmt || '-'}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            ✕ Cerrar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 font-semibold uppercase">Envío WhatsApp</div>
            <div className={`text-sm font-extrabold mt-1 ${selectedOrder.se_envio_wsp === 'SI' ? 'text-emerald-600' : 'text-slate-400'}`}>
              {selectedOrder.se_envio_wsp || 'NO'}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 font-semibold uppercase">Estado Mensaje</div>
            <div className="text-sm font-extrabold text-sky-700 mt-1 uppercase">
              {selectedOrder.estado_wsp || 'NO ENVIADO'}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 font-semibold uppercase">Ingreso Tracking</div>
            <div className={`text-sm font-extrabold mt-1 ${selectedOrder.ingreso_tracking === 'SI' ? 'text-amber-600' : 'text-slate-400'}`}>
              {selectedOrder.ingreso_tracking || 'NO'}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 font-semibold uppercase">Reprogramó / CSAT</div>
            <div className="text-sm font-extrabold text-purple-700 mt-1">
              {selectedOrder.reprogramo || 'NO'} / {selectedOrder.respondio_encuesta || 'NO'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-1.5">
            <div className="text-[11px] font-bold text-[#FF5500] uppercase tracking-wider mb-1">Datos del Cliente y Ubicación</div>
            <div><span className="text-slate-500">Cliente:</span> <strong className="text-slate-900">{selectedOrder.cliente || '-'}</strong></div>
            <div><span className="text-slate-500">Documento:</span> <strong className="text-slate-900">{selectedOrder.numero_documento || '-'}</strong> <span className="text-slate-400 text-[10px]">({selectedOrder.tipo_documento || 'DNI'})</span></div>
            <div><span className="text-slate-500">Cód. Seguimiento Cliente:</span> <strong className="text-sky-700">{selectedOrder.codi_segui_clien || selectedOrder.codi_clien || '-'}</strong></div>
            <div><span className="text-slate-500">Teléfono / Email:</span> <strong className="text-slate-900">{selectedOrder.telefono || '-'}</strong> {selectedOrder.email_cliente ? `• ${selectedOrder.email_cliente}` : ''}</div>
            <div><span className="text-slate-500">Sector / Distrito:</span> <strong className="text-slate-900">{selectedOrder.sector_operativo || '-'} • {selectedOrder.distrito || '-'}</strong></div>
            <div><span className="text-slate-500">Dirección:</span> <strong className="text-slate-700">{selectedOrder.direccion_cliente || '-'}</strong></div>
          </div>

          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-1.5">
            <div className="text-[11px] font-bold text-[#FF5500] uppercase tracking-wider mb-1">Asignación Técnica</div>
            <div><span className="text-slate-500">Tipo Operación:</span> <strong className="text-emerald-700">{selectedOrder.servicio_tipo || '-'}</strong></div>
            <div><span className="text-slate-500">Producto / Trabajo:</span> <strong className="text-slate-900">{selectedOrder.producto || '-'} ({selectedOrder.tipo_trabajo || '-'})</strong></div>
            <div><span className="text-slate-500">Partner:</span> <strong className="text-slate-900">{selectedOrder.partner || selectedOrder.proveedor_ot || '-'}</strong></div>
            <div><span className="text-slate-500">Cuadrilla Completa:</span> <strong className="text-amber-700">{selectedOrder.cuadrilla_completa || selectedOrder.cuadrilla || '-'}</strong></div>
            {selectedOrder.plan_contratado && (
              <div className="pt-1.5 border-t border-slate-200 text-[11px]">
                <span className="text-slate-500">Detalle Plan:</span>{' '}
                <span className="text-slate-700 font-medium">{String(selectedOrder.plan_contratado).replace(/<br\s*\/?>/gi, ' • ')}</span>
              </div>
            )}
          </div>
        </div>

        <OrderGeoMap order={selectedOrder} />

        {selectedOrder.link_tracking && (
          <div className="bg-[#FFF0E5]/60 border border-orange-200/80 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="text-xs min-w-0">
              <div className="font-bold text-slate-900">Enlace de Seguimiento WIN en Ruta</div>
              <div className="text-[11px] text-slate-500 truncate max-w-md">{selectedOrder.link_tracking}</div>
            </div>
            <a
              href={selectedOrder.link_tracking}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold rounded-xl text-xs transition shrink-0 shadow-xs shadow-orange-500/20"
            >
              <span>Abrir Tracking</span>
              <ExternalLink size={13} />
            </a>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 border-b border-slate-200 pb-2">
            Ficha Completa de Campos (vw_reporte_funnel_casos_360)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {Object.entries(selectedOrder)
              .filter(([k]) => k !== 'fecha_solicitud_fmt')
              .map(([key, val]) => (
                <div key={key} className="bg-white border border-slate-200/70 rounded-xl p-2.5 shadow-2xs">
                  <div className="text-[10px] font-semibold uppercase text-slate-400">
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5 break-all">
                    {val !== null && val !== undefined && String(val) !== '' ? String(val) : '-'}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}