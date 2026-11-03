import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  User, Sparkles, Headset, ExternalLink, MessageSquare,
  ChevronLeft, ChevronRight, RefreshCw, CheckCheck,
  MapPin, Phone, ShieldCheck, Copy, Check, Layers, Wrench,
  ChevronDown, ChevronUp, Bot
} from 'lucide-react';
import { RealOrder } from '../types/dashboard';

export interface RawChatMessage {
  id?: string | number;
  orden?: number;
  fecha_utc?: string;
  fecha?: string;
  timestamp?: string;
  emisor?: string;
  rol?: string;
  direction?: string;
  from_me?: boolean;
  tipo?: string;
  es_plantilla?: boolean;
  nombre_plantilla?: string;
  agente?: string;
  usuario?: string;
  texto?: string;
  mensaje?: string;
  body?: string;
  contenido?: string;
  estado?: string;
  [key: string]: any;
}

interface TrackingViewProps {
  orders: RealOrder[];
  startDate: string;
  endDate: string;
  service: string;
  globalSearch: string;
  ignoreDates: boolean;
  onSelectOrder: (order: RealOrder) => void;
}

export function TrackingView({
  orders: initialOrders,
  startDate,
  endDate,
  service,
  globalSearch,
  ignoreDates,
  onSelectOrder,
}: TrackingViewProps) {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(globalSearch);
  const [soloConChat, setSoloConChat] = useState<boolean>(true);
  const [slaFilter, setSlaFilter] = useState<string>('Todos');
  const [turnoFilter, setTurnoFilter] = useState<string>('Todos');

  // Paginación Server-Side (50 en 50)
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;
  const [totalRecords, setTotalRecords] = useState<number>(initialOrders.length);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [serverOrders, setServerOrders] = useState<RealOrder[]>(initialOrders.slice(0, 50));
  const [loadingPage, setLoadingPage] = useState<boolean>(false);

  // Estados del Visor Derecho y Ficha Técnica Colapsable
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showTechCard, setShowTechCard] = useState<boolean>(true);
  const [loadingChat, setLoadingChat] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<'live_api' | 'db_fallback' | 'snapshot'>('snapshot');
  const [liveMessages, setLiveMessages] = useState<RawChatMessage[] | null>(null);
  const [chatMeta, setChatMeta] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Sincronización con el buscador dinámico del Header superior
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(globalSearch);
      setPage(1);
      setSelectedIndex(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  useEffect(() => {
    setPage(1);
    setSelectedIndex(0);
  }, [soloConChat, slaFilter, turnoFilter, startDate, endDate, service, ignoreDates]);

  const fetchPaginatedTracking = useCallback(() => {
    setLoadingPage(true);
    const params = new URLSearchParams({
      startDate,
      endDate,
      service,
      q: debouncedQuery,
      ignoreDates: ignoreDates ? 'true' : 'false',
      soloConChat: soloConChat ? 'true' : 'false',
      sla: slaFilter,
      turno: turnoFilter,
      page: String(page),
      pageSize: String(pageSize),
    });

    fetch(`http://localhost:3001/api/tracking/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.orders)) {
          setServerOrders(data.orders);
          setTotalRecords(Number(data.total || 0));
          setTotalPages(Number(data.totalPages || 1));
          setSelectedIndex(0);
        }
      })
      .catch((err) => console.error('Error en /api/tracking/search:', err))
      .finally(() => setLoadingPage(false));
  }, [startDate, endDate, service, debouncedQuery, ignoreDates, soloConChat, slaFilter, turnoFilter, page]);

  useEffect(() => {
    fetchPaginatedTracking();
  }, [fetchPaginatedTracking]);

  const selectedRow: RealOrder | null = serverOrders[selectedIndex] || serverOrders[0] || null;

  // Consumo completo de todos los mensajes sin límite de 15/30
  const fetchChatConversation = useCallback(async (row: RealOrder | null) => {
    if (!row) return;
    const phone = String(row.mantra_phone || row.telefono || '').replace(/\D/g, '');
    const grupo = String(row.servicio_tipo || row.producto || 'GENERAL');

    if (!phone && !row.orden_id) {
      setLiveMessages(null);
      setChatMeta(null);
      setDataSource('snapshot');
      return;
    }

    setLoadingChat(true);
    try {
      const res = await fetch(
        `http://localhost:3001/api/4dm1n_/mantra-chat?phone=${encodeURIComponent(
          phone
        )}&ordenId=${encodeURIComponent(String(row.orden_id || ''))}&grupoServicio=${encodeURIComponent(
          grupo
        )}&limit=1000`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.chatMeta) setChatMeta(data.chatMeta);
        if (data.ok && Array.isArray(data.messages) && data.messages.length > 0) {
          setLiveMessages(data.messages);
          setDataSource(data.source === 'live_api' ? 'live_api' : 'db_fallback');
          setLoadingChat(false);
          return;
        }
      }
    } catch (_) {}

    setLiveMessages(null);
    setDataSource('snapshot');
    setLoadingChat(false);
  }, []);

  useEffect(() => {
    fetchChatConversation(selectedRow);
  }, [selectedRow?.orden_id, fetchChatConversation]);

  // Atajos de teclado: F (Expandir/Colapsar Ficha), ← / → / ↑ / ↓ (Recorrer bandeja)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowTechCard((prev) => !prev);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(serverOrders.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [serverOrders.length]);

  const parsedChatMessages = useMemo(() => {
    if (!selectedRow) return [];

    let rawList: RawChatMessage[] = [];

    if (liveMessages && liveMessages.length > 0) {
      rawList = liveMessages;
    } else if (selectedRow.ultimos_mensajes_json) {
      try {
        const parsed =
          typeof selectedRow.ultimos_mensajes_json === 'string'
            ? JSON.parse(selectedRow.ultimos_mensajes_json)
            : selectedRow.ultimos_mensajes_json;
        if (Array.isArray(parsed)) rawList = parsed;
        else if (parsed && Array.isArray(parsed.messages)) rawList = parsed.messages;
      } catch (_) {}
    }

    if (rawList.length === 0 && selectedRow.se_envio_wsp === 'SI') {
      const linkTrk =
        selectedRow.link_tracking ||
        (selectedRow.token ? `https://enruta.win.pe/seguimiento/${selectedRow.token}` : 'https://enruta.win.pe');

      rawList = [
        {
          orden: 1,
          fecha_utc: selectedRow.fecha_solicitud_fmt || selectedRow.fecha_solicitud || 'Hoy',
          tipo: 'template',
          es_plantilla: true,
          nombre_plantilla: 'WIN - Seguimiento de VT',
          emisor: 'HSM_META',
          estado: selectedRow.estado_wsp || 'SENT',
          texto: `Hola *${selectedRow.cliente || 'Cliente'}*, te informamos sobre la Confirmación de Visita Técnica (${selectedRow.producto || selectedRow.servicio_tipo || 'Servicio WIN'}).\n\n📍 *Dirección:* ${selectedRow.direccion_cliente || selectedRow.distrito || '-'}\n👷 *Cuadrilla:* ${selectedRow.cuadrilla_completa || selectedRow.cuadrilla || '-'} | [Ver Tracking en Vivo,${linkTrk}] | [Reprogramar Visita]`,
        },
      ];
    }

    return [...rawList].sort((a, b) => {
      const tA = new Date(a.fecha_utc || a.fecha || a.timestamp || 0).getTime() || 0;
      const tB = new Date(b.fecha_utc || b.fecha || b.timestamp || 0).getTime() || 0;
      if (tA !== tB) return tA - tB;
      return Number(a.orden || 0) - Number(b.orden || 0);
    });
  }, [selectedRow, liveMessages]);

  const activeTurno =
    chatMeta?.quien_tiene_la_palabra ||
    selectedRow?.quien_tiene_la_palabra ||
    (parsedChatMessages.length > 0
      ? String(
          parsedChatMessages[parsedChatMessages.length - 1].emisor ||
            parsedChatMessages[parsedChatMessages.length - 1].rol ||
            ''
        )
          .toLowerCase()
          .includes('cli')
        ? 'CLIENTE'
        : 'ASESOR'
      : 'BOT');

  const activeSla = chatMeta?.semaforo_sla || selectedRow?.semaforo_sla || 'VERDE';
  const activeEstadoChat = chatMeta?.estado_chat || selectedRow?.estado_chat || null;

  // Ícono circular de semáforo (sin texto ROJO/AMARILLO/VERDE)
  const renderSlaTrafficDot = (slaRaw?: string | null) => {
    const s = String(slaRaw || 'VERDE').toUpperCase();
    const isRed = s.includes('ROJO') || s.includes('CRIT') || s.includes('VENC');
    const isYellow = s.includes('AMAR') || s.includes('ALERT');

    const dotCls = isRed
      ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e] ring-rose-500/30'
      : isYellow
      ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24] ring-amber-400/30'
      : 'bg-emerald-400 shadow-[0_0_8px_#34d399] ring-emerald-400/30';

    return (
      <span
        title={`Semáforo SLA: ${s}`}
        className={`inline-block w-2.5 h-2.5 rounded-full ring-2 shrink-0 ${dotCls}`}
      />
    );
  };

  // Etiqueta visual del último que escribió (Cliente, Asesor o Bot)
  const renderLastWriterBadge = (turnoRaw?: string | null) => {
    const t = String(turnoRaw || 'BOT').toUpperCase();
    const isCli = t.includes('CLI');
    const isBot = t.includes('BOT') || t.includes('HSM') || t.includes('SIST');

    if (isCli) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9.5px] font-extrabold uppercase">
          <User size={10} />
          <span>CLIENTE</span>
        </span>
      );
    }
    if (isBot) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9.5px] font-extrabold uppercase">
          <Bot size={10} />
          <span>BOT</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9.5px] font-extrabold uppercase">
        <Headset size={10} />
        <span>{t}</span>
      </span>
    );
  };

  const renderFormattedChatMessage = (rawText: string) => {
    if (!rawText) return null;
    const segments = String(rawText).split(/\|\s*(?=\[)/);
    const bodyText = segments[0]?.trim() || '';
    const buttonSegments = segments.slice(1);

    return (
      <div className="space-y-2.5">
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-100 break-words">
          {bodyText}
        </div>

        {buttonSegments.length > 0 && (
          <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2">
            {buttonSegments.map((seg, i) => {
              const cleaned = seg.trim().replace(/^\[|\]$/g, '');
              const commaIdx = cleaned.indexOf(',');
              const hasUrl = commaIdx !== -1 && /https?:\/\//i.test(cleaned.slice(commaIdx + 1));

              if (hasUrl) {
                const label = cleaned.slice(0, commaIdx).trim();
                const url = cleaned.slice(commaIdx + 1).trim();
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-[11px] shadow-md shadow-orange-500/20 transform hover:scale-[1.03] transition"
                  >
                    <span>{label || 'Abrir enlace'}</span>
                    <ExternalLink size={12} />
                  </a>
                );
              }

              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-600/60 text-slate-200 text-[11px] font-semibold"
                >
                  {cleaned}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const copyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-140px)] min-h-[640px]">
      {/* PANEL IZQUIERDO: BANDEJA DE CONVERSACIONES CONECTADA AL FILTRO GLOBAL SUPERIOR */}
      <div className="col-span-4 bg-[#111827]/95 border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-xl">
        <div className="p-3 border-b border-gray-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <MessageSquare size={16} className="text-[#FF6B00]" />
              <span>Bandeja Mantra / WhatsApp</span>
              {loadingPage && <RefreshCw size={12} className="text-[#FF6B00] animate-spin" />}
            </h3>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSoloConChat(!soloConChat)}
                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition ${
                  soloConChat
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-[#090D16] text-gray-400 border-gray-800 hover:text-gray-200'
                }`}
                title="Alternar entre órdenes con chat en Mantra o todas las órdenes"
              >
                {soloConChat ? '💬 Con Chat' : '📋 Todas'}
              </button>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                {totalRecords.toLocaleString('es-PE')} casos
              </span>
            </div>
          </div>

          {/* Botoncitos rápidos para filtrar por quién escribió último */}
          <div className="grid grid-cols-4 gap-1 bg-[#090D16] p-1 rounded-lg border border-gray-800 text-[10px]">
            {[
              { id: 'Todos', label: 'Todos' },
              { id: 'CLIENTE', label: '👤 Cliente' },
              { id: 'ASESOR', label: '🎧 Asesor' },
              { id: 'BOT', label: '🤖 Bot' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setTurnoFilter(btn.id)}
                className={`py-1 px-1.5 rounded-md font-bold transition truncate ${
                  turnoFilter === btn.id
                    ? 'bg-[#FF6B00] text-white shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Selector de Semáforo SLA */}
          <div className="grid grid-cols-1 text-[11px]">
            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
              className="bg-[#090D16] border border-gray-800 rounded-lg px-2.5 py-1.5 text-gray-300 focus:outline-none focus:border-[#FF6B00]"
            >
              <option value="Todos">Semáforo SLA: Todos</option>
              <option value="ROJO">🔴 Crítico / Vencido</option>
              <option value="AMARILLO">🟡 En Alerta</option>
              <option value="VERDE">🟢 En Tiempo</option>
            </select>
          </div>
        </div>

        {/* Lista de Conversaciones */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
          {serverOrders.length > 0 ? (
            serverOrders.map((item, idx) => {
              const isSelected = selectedRow?.orden_id === item.orden_id;
              const stWsp = String(item.estado_wsp || 'NO ENVIADO').toUpperCase();
              const docVal = item.numero_documento || '-';
              const codSeguiVal = item.codi_segui_ot || item.ticket || item.CodiSegui || '-';
              const lastWriter = item.quien_tiene_la_palabra || 'BOT';

              return (
                <div
                  key={item.orden_id}
                  onClick={() => {
                    const selection = window.getSelection()?.toString();
                    if (selection && selection.length > 0) return;
                    setSelectedIndex(idx);
                  }}
                  className={`p-3 cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#FF6B00]/15 border-l-4 border-l-[#FF6B00]'
                      : 'hover:bg-gray-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs gap-2">
                    {/* Documento y CodiSegui en lugar de OT */}
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-extrabold text-[#FF6B00]">Doc: {docVal}</span>
                      <span className="text-gray-600">•</span>
                      <span className="text-[10.5px] font-bold text-cyan-300 font-mono">
                        Cód: {codSeguiVal}
                      </span>
                    </div>

                    {/* Ícono de Semáforo + Etiqueta del último que escribió */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderSlaTrafficDot(item.semaforo_sla)}
                      {renderLastWriterBadge(lastWriter)}
                    </div>
                  </div>

                  <div className="font-bold text-white text-xs mt-1.5 truncate">
                    {item.cliente || '-'}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                      <Phone size={10} />
                      {item.mantra_phone || item.telefono || 'Sin teléfono'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {item.ingreso_tracking === 'SI' && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold">
                          TRK
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          stWsp === 'READ'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : stWsp.includes('DELIVER')
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : stWsp === 'SENT'
                            ? 'bg-blue-500/20 text-blue-300'
                            : stWsp === 'FAILED'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-gray-800 text-gray-400'
                        }`}
                      >
                        {stWsp}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-gray-500">
              No se encontraron conversaciones con los filtros actuales. Cambia el botón <strong>"💬 Con Chat"</strong> a <strong>"📋 Todas"</strong> o activa <strong>"Todo el Histórico"</strong> arriba.
            </div>
          )}
        </div>

        {/* Paginación de 50 en 50 */}
        <div className="p-2.5 bg-[#090D16] border-t border-gray-800 flex items-center justify-between text-[11px] text-gray-300">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#111827] border border-gray-700 hover:bg-[#FF6B00] hover:text-white disabled:opacity-40 font-semibold transition"
          >
            <ChevronLeft size={12} /> Ant
          </button>

          <span>
            Página <strong className="text-white">{page}</strong> de{' '}
            <strong className="text-white">{totalPages.toLocaleString('es-PE')}</strong>
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#111827] border border-gray-700 hover:bg-[#FF6B00] hover:text-white disabled:opacity-40 font-semibold transition"
          >
            Sig <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* PANEL DERECHO: FICHA TÉCNICA + VISOR CONVERSACIONAL COMPLETO */}
      <div className="col-span-8 bg-[#0B101B] border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-2xl">
        {selectedRow ? (
          <>
            {/* Cabecera Limpia con Documento, CodiSegui, Semáforo y Último Emisor */}
            <div className="p-3.5 bg-[#111827] border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-extrabold text-sm">
                    {String(selectedRow.cliente || 'C').charAt(0)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center">
                    {renderSlaTrafficDot(activeSla)}
                  </span>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-extrabold text-sm text-white uppercase">
                      {selectedRow.cliente || 'Cliente WIN'}
                    </h4>

                    {/* Último que escribió */}
                    {renderLastWriterBadge(activeTurno)}

                    {activeEstadoChat && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold uppercase">
                        {activeEstadoChat}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2.5 mt-1">
                    <span>
                      Móvil: <strong className="text-emerald-400">{selectedRow.mantra_phone || selectedRow.telefono || '-'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Doc: <strong className="text-amber-300">{selectedRow.numero_documento || '-'}</strong>
                    </span>
                    <span>•</span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          String(
                            selectedRow.codi_segui_ot ||
                              selectedRow.ticket ||
                              selectedRow.numero_documento ||
                              selectedRow.orden_id
                          )
                        )
                      }
                      className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 font-bold transition"
                      title="Copiar Cód.Segui"
                    >
                      <span>Cód.Segui: {selectedRow.codi_segui_ot || selectedRow.ticket || '-'}</span>
                      {copiedCode ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Controles Superiores Limpios (Ficha Técnica y Detalle) */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setShowTechCard(!showTechCard)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                    showTechCard
                      ? 'bg-slate-800 text-white border-slate-600'
                      : 'bg-[#090D16] text-gray-400 border-gray-800 hover:text-white'
                  }`}
                  title="Mostrar/Ocultar Ficha Técnica (Tecla F)"
                >
                  <span>Ficha Técnica</span>
                  {showTechCard ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                <button
                  onClick={() => onSelectOrder(selectedRow)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-[11px] transition shadow-md shadow-orange-500/20"
                >
                  <span>Detalle</span>
                </button>
              </div>
            </div>

            {/* FICHA TÉCNICA DE 4 COLUMNAS */}
            {showTechCard && (
              <div className="p-3 bg-[#090D16]/90 border-b border-gray-800 grid grid-cols-4 gap-2.5 text-xs">
                <div className="bg-[#111827] border border-gray-800/90 rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-blue-400 uppercase">
                    <span className="flex items-center gap-1"><User size={12} /> Cliente</span>
                    <span className="text-gray-400">{selectedRow.segmento_cliente || 'Residencial'}</span>
                  </div>
                  <div className="font-bold text-white text-[11px] truncate" title={selectedRow.cliente}>
                    {selectedRow.cliente || '-'}
                  </div>
                  <div className="text-[10px] text-gray-400 flex items-center justify-between pt-1 border-t border-gray-800/80">
                    <span>Doc: <strong className="text-gray-200">{selectedRow.numero_documento || '-'}</strong></span>
                    <span>Cód: <strong className="text-cyan-300">{selectedRow.codi_segui_ot || selectedRow.ticket || '-'}</strong></span>
                  </div>
                </div>

                <div className="bg-[#111827] border border-gray-800/90 rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-rose-400 uppercase">
                    <span className="flex items-center gap-1"><MapPin size={12} /> Ubicación</span>
                    <span className="text-cyan-400 truncate max-w-[90px]">{selectedRow.distrito || '-'}</span>
                  </div>
                  <div className="text-[11px] text-gray-200 font-medium line-clamp-1" title={selectedRow.direccion_cliente}>
                    {selectedRow.direccion_cliente || 'Sin dirección detallada'}
                  </div>
                  <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-800/80 truncate">
                    Sector: <strong className="text-gray-200">{selectedRow.sector_operativo || selectedRow.provincia_cliente || 'LIMA'}</strong>
                  </div>
                </div>

                <div className="bg-[#111827] border border-gray-800/90 rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-indigo-400 uppercase">
                    <span className="flex items-center gap-1"><Wrench size={12} /> Cuadrilla</span>
                    <span className="text-amber-300 truncate max-w-[90px]">{selectedRow.partner || selectedRow.proveedor_ot || '-'}</span>
                  </div>
                  <div className="text-[11px] text-white font-bold line-clamp-1" title={selectedRow.cuadrilla_completa || selectedRow.cuadrilla}>
                    {selectedRow.cuadrilla_completa || selectedRow.cuadrilla || 'Sin cuadrilla asignada'}
                  </div>
                  <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-800/80 flex justify-between">
                    <span>Estado: <strong className="text-emerald-300">{selectedRow.estado_ot || '-'}</strong></span>
                    <span>{selectedRow.fecha_solicitud_fmt || '-'}</span>
                  </div>
                </div>

                <div className="bg-[#111827] border border-gray-800/90 rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-400 uppercase">
                    <span className="flex items-center gap-1"><Layers size={12} /> Servicio</span>
                    <span className="font-mono text-gray-400">{selectedRow.ticket || selectedRow.codi_segui_ot || '-'}</span>
                  </div>
                  <div className="text-[11px] text-white font-bold truncate">
                    {selectedRow.producto || selectedRow.servicio_tipo || '-'}
                  </div>
                  <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-800/80 truncate" title={selectedRow.motivo_trabajo || selectedRow.diagnostico_tecnico}>
                    Motivo: <strong className="text-gray-200">{selectedRow.motivo_trabajo || selectedRow.diagnostico_tecnico || selectedRow.tipo_trabajo || '-'}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* LIENZO DE CHAT COMPLETO (SIN LÍMITE DE MENSAJES) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
              {parsedChatMessages.length > 0 ? (
                parsedChatMessages.map((msg, idx) => {
                  const textContent = msg.texto || msg.mensaje || msg.body || msg.contenido || '';
                  const senderRaw = String(msg.emisor || msg.rol || msg.direction || '').toLowerCase();

                  const isCliente =
                    senderRaw.includes('cli') ||
                    senderRaw.includes('inbound') ||
                    senderRaw.includes('user') ||
                    msg.from_me === false;

                  const isTemplate =
                    !isCliente &&
                    (msg.tipo === 'template' ||
                      Boolean(msg.es_plantilla) ||
                      /enruta\.win\.pe|confirmaci[oó]n de visita|plantilla preaprobada|\|\s*\[/i.test(textContent));

                  const timeLabel = msg.fecha_utc || msg.fecha || msg.timestamp || '';

                  if (isCliente) {
                    return (
                      <div key={idx} className="flex flex-col items-start">
                        <div className="max-w-[78%] rounded-2xl rounded-tl-sm p-3.5 bg-slate-800/95 border border-slate-700/80 shadow-lg space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              <User size={11} />
                              <span>Cliente • {selectedRow.cliente}</span>
                            </span>
                            <span className="text-[10px] text-slate-400">{timeLabel}</span>
                          </div>
                          {renderFormattedChatMessage(textContent)}
                        </div>
                      </div>
                    );
                  }

                  if (isTemplate) {
                    return (
                      <div key={idx} className="flex flex-col items-end">
                        <div className="max-w-[80%] rounded-2xl rounded-tr-sm p-4 bg-gradient-to-br from-purple-950/60 via-slate-900 to-slate-950 border border-purple-500/40 shadow-xl space-y-2.5">
                          <div className="flex items-center justify-between gap-4 border-b border-purple-500/20 pb-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              <Sparkles size={11} />
                              <span>{msg.nombre_plantilla || 'Plantilla Oficial Meta HSM'}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-purple-300/90 font-semibold">
                              <ShieldCheck size={12} className="text-emerald-400" />
                              Disparo Automático HSM
                            </span>
                          </div>

                          {renderFormattedChatMessage(textContent)}

                          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                            <span>{timeLabel}</span>
                            <span className="inline-flex items-center gap-1 font-bold text-cyan-300">
                              <CheckCheck size={12} />
                              {String(msg.estado || selectedRow.estado_wsp || 'SENT').toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={idx} className="flex flex-col items-end">
                      <div className="max-w-[78%] rounded-2xl rounded-tr-sm p-3.5 bg-gradient-to-br from-orange-950/70 to-slate-900 border border-orange-500/40 shadow-lg space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
                            <Headset size={11} />
                            <span>Asesor WIN • {msg.agente || msg.usuario || 'Agente Mantra'}</span>
                          </span>
                          <span className="text-[10px] text-slate-400">{timeLabel}</span>
                        </div>
                        {renderFormattedChatMessage(textContent)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400">
                  <MessageSquare size={32} className="text-gray-600 mb-2" />
                  <p className="text-sm font-bold text-gray-300">Sin mensajes en historial_chats_mantra para este caso</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Estado WSP: {selectedRow.estado_wsp || 'NO ENVIADO'} • Ingreso Tracking: {selectedRow.ingreso_tracking || 'NO'}
                  </p>
                </div>
              )}
            </div>

            {/* Pie del Visor */}
            <div className="px-4 py-2 bg-[#111827] border-t border-gray-800 flex flex-wrap items-center justify-between text-[11px] text-gray-400">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 font-mono">↑</kbd>{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 font-mono">↓</kbd> Recorrer casos
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 font-mono">F</kbd> Ocultar/Ver Ficha Técnica
                </span>
              </div>
              <div>
                Historial completo ({parsedChatMessages.length} mensajes)
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Selecciona una conversación de la bandeja izquierda para inspeccionar el hilo completo.
          </div>
        )}
      </div>
    </div>
  );
}