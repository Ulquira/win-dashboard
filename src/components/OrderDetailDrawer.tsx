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
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0B101B] border-l border-gray-800 h-full overflow-y-auto p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-[#FF6B00] text-white font-black text-sm">
                Orden #{selectedOrder.orden_id}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                {selectedOrder.estado_ot || 'Sin Estado OT'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Ticket: <strong className="text-gray-200">{selectedOrder.ticket || '-'}</strong> • Fecha Solicitud:{' '}
              <strong className="text-gray-200">{selectedOrder.fecha_solicitud_fmt || '-'}</strong>
            </p>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition"
          >
            ✕ Cerrar
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
            <div className="text-[10px] text-gray-400 uppercase">Envío WhatsApp</div>
            <div className={`text-sm font-extrabold mt-1 ${selectedOrder.se_envio_wsp === 'SI' ? 'text-emerald-400' : 'text-gray-400'}`}>
              {selectedOrder.se_envio_wsp || 'NO'}
            </div>
          </div>
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
            <div className="text-[10px] text-gray-400 uppercase">Estado Mensaje</div>
            <div className="text-sm font-extrabold text-cyan-400 mt-1 uppercase">
              {selectedOrder.estado_wsp || 'NO ENVIADO'}
            </div>
          </div>
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
            <div className="text-[10px] text-gray-400 uppercase">Ingreso Tracking</div>
            <div className={`text-sm font-extrabold mt-1 ${selectedOrder.ingreso_tracking === 'SI' ? 'text-amber-400' : 'text-gray-400'}`}>
              {selectedOrder.ingreso_tracking || 'NO'}
            </div>
          </div>
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
            <div className="text-[10px] text-gray-400 uppercase">Reprogramó / CSAT</div>
            <div className="text-sm font-extrabold text-purple-300 mt-1">
              {selectedOrder.reprogramo || 'NO'} / {selectedOrder.respondio_encuesta || 'NO'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 space-y-1.5">
            <div className="text-[11px] font-bold text-[#FF6B00] uppercase tracking-wider mb-1">Datos del Cliente y Ubicación</div>
            <div><span className="text-gray-400">Cliente:</span> <strong className="text-white">{selectedOrder.cliente || '-'}</strong></div>
            <div><span className="text-gray-400">Documento:</span> <strong className="text-white">{selectedOrder.numero_documento || '-'}</strong> <span className="text-gray-500 text-[10px]">({selectedOrder.tipo_documento || 'DNI'})</span></div>
            <div><span className="text-gray-400">Cód. Seguimiento Cliente:</span> <strong className="text-cyan-300">{selectedOrder.codi_segui_clien || selectedOrder.codi_clien || '-'}</strong></div>
            <div><span className="text-gray-400">Teléfono / Email:</span> <strong className="text-white">{selectedOrder.telefono || '-'}</strong> {selectedOrder.email_cliente ? `• ${selectedOrder.email_cliente}` : ''}</div>
            <div><span className="text-gray-400">Sector / Distrito:</span> <strong className="text-white">{selectedOrder.sector_operativo || '-'} • {selectedOrder.distrito || '-'}</strong></div>
            <div><span className="text-gray-400">Dirección:</span> <strong className="text-gray-200">{selectedOrder.direccion_cliente || '-'}</strong></div>
          </div>

          <div className="bg-[#111827]/90 border border-gray-800 rounded-xl p-3.5 space-y-1.5">
            <div className="text-[11px] font-bold text-[#FF6B00] uppercase tracking-wider mb-1">Asignación Técnica</div>
            <div><span className="text-gray-400">Tipo Operación:</span> <strong className="text-emerald-300">{selectedOrder.servicio_tipo || '-'}</strong></div>
            <div><span className="text-gray-400">Producto / Trabajo:</span> <strong className="text-white">{selectedOrder.producto || '-'} ({selectedOrder.tipo_trabajo || '-'})</strong></div>
            <div><span className="text-gray-400">Partner:</span> <strong className="text-white">{selectedOrder.partner || selectedOrder.proveedor_ot || '-'}</strong></div>
            <div><span className="text-gray-400">Cuadrilla Completa:</span> <strong className="text-amber-300">{selectedOrder.cuadrilla_completa || selectedOrder.cuadrilla || '-'}</strong></div>
            {selectedOrder.plan_contratado && (
              <div className="pt-1 border-t border-gray-800/80 text-[11px]">
                <span className="text-gray-400">Detalle Plan:</span>{' '}
                <span className="text-gray-300">{String(selectedOrder.plan_contratado).replace(/<br\s*\/?>/gi, ' • ')}</span>
              </div>
            )}
          </div>
        </div>

        <OrderGeoMap order={selectedOrder} />

        {selectedOrder.link_tracking && (
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-3.5 flex items-center justify-between">
            <div className="text-xs">
              <div className="font-bold text-white">Enlace de Seguimiento WIN en Ruta</div>
              <div className="text-[11px] text-gray-400 truncate max-w-md">{selectedOrder.link_tracking}</div>
            </div>
            <a
              href={selectedOrder.link_tracking}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold rounded-lg text-xs transition shrink-0"
            >
              <span>Abrir Tracking</span>
              <ExternalLink size={13} />
            </a>
          </div>
        )}

        <div className="bg-[#111827]/80 border border-gray-800 rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-3 border-b border-gray-800 pb-2">
            Ficha Completa de Campos (vw_reporte_funnel_casos_360)
          </h4>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {Object.entries(selectedOrder)
              .filter(([k]) => k !== 'fecha_solicitud_fmt')
              .map(([key, val]) => (
                <div key={key} className="bg-[#090D16] border border-gray-800/80 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold uppercase text-gray-400">
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs font-bold text-gray-100 mt-0.5 break-all">
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