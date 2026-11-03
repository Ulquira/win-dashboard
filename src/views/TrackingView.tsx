import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  User, Sparkles, Headset, ExternalLink, Search, MessageSquare,
  Code2, ChevronLeft, ChevronRight, RefreshCw, CheckCheck,
  MapPin, Phone, ShieldCheck, Globe, Copy, Check, Layers, Wrench,
  ChevronDown, ChevronUp, Clock, AlertCircle
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
  zone: string;
  onSelectOrder: (order: RealOrder) => void;
}

export function TrackingView({
  orders: initialOrders,
  startDate,
  endDate,
  service,
  zone,
  onSelectOrder,
}: TrackingViewProps) {
  // Estados de Búsqueda Server-Side y Filtros en Bandeja Izquierda
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [ignoreDates, setIgnoreDates] = useState<boolean>(false);
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
  const [chatLimit, setChatLimit] = useState<15 | 30>(15);
  const [viewType, setViewType] = useState<'chat' | 'json'>('chat');
  const [loadingChat, setLoadingChat] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<'live_api' | 'db_fallback' | 'snapshot'>('snapshot');
  const [liveMessages, setLiveMessages] = useState<RawChatMessage[] | null>(null);
  const [chatMeta, setChatMeta] = useState<any>(null);
  const [copiedOt, setCopiedOt] = useState<boolean>(false);

  // Debounce 350ms para búsqueda global en BD
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
      setSelectedIndex(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    setSelectedIndex(0);
  }, [soloConChat, slaFilter, turnoFilter, startDate, endDate, service, zone, ignoreDates]);

  const fetchPaginatedTracking = useCallback(() => {
    setLoadingPage(true);
    const params = new URLSearchParams({
      startDate,
      endDate,
      service,
      zone,
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
  }, [startDate, endDate, service, zone, debouncedQuery, ignoreDates, soloConChat, slaFilter, turnoFilter, page]);

  useEffect(() => {
    fetchPaginatedTracking();
  }, [fetchPaginatedTracking]);

  const selectedRow: RealOrder | null = serverOrders[selectedIndex] || serverOrders[0] || null;

  // Consumo Híbrido: Live API (config_plantillas_mantra) -> Fallback BD (historial_chats_mantra)
  const fetchChatConversation = useCallback(
    async (row: RealOrder | null, limitVal: 15 | 30) => {
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
          )}&limit=${limitVal}`
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
    },
    []
  );

  useEffect(() => {
    fetchChatConversation(selectedRow, chatLimit);
  }, [selectedRow?.orden_id, chatLimit, fetchChatConversation]);

  // Atajos de teclado: V (Chat/JSON), F (Expandir/Colapsar Ficha), ← / → / ↑ / ↓ (Recorrer bandeja), ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        setViewType((prev) => (prev === 'chat' ? 'json' : 'chat'));
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowTechCard((prev) => !prev);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(serverOrders.length - 1, prev + 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setViewType('chat');
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
          texto: `Hola *${selectedRow.cliente || 'Cliente'}*, te informamos sobre la Confirmación de Visita Técnica para tu orden *#${selectedRow.orden_id}* (${selectedRow.producto || selectedRow.servicio_tipo || 'Servicio WIN'}).\n\n📍 *Dirección:* ${selectedRow.direccion_cliente || selectedRow.distrito || '-'}\n👷 *Cuadrilla:* ${selectedRow.cuadrilla_completa || selectedRow.cuadrilla || '-'} | [Ver Tracking en Vivo,${linkTrk}] | [Reprogramar Visita]`,
        },
      ];
    }

    return [...rawList]
      .slice(-chatLimit)
      .sort((a, b) => {
        const tA = new Date(a.fecha_utc || a.fecha || a.timestamp || 0).getTime() || 0;
        const tB = new Date(b.fecha_utc || b.fecha || b.timestamp || 0).getTime() || 0;
        if (tA !== tB) return tA - tB;
        return Number(a.orden || 0) - Number(b.orden || 0);
      });
  }, [selectedRow, liveMessages, chatLimit]);

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
        : 'ASESOR/EMPRESA'
      : 'SIN MENSAJES');

  const activeSla = chatMeta?.semaforo_sla || selectedRow?.semaforo_sla || null;
  const activeEstadoChat = chatMeta?.estado_chat || selectedRow?.estado_chat || null;

  const getSlaBadgeStyle = (slaRaw?: string | null) => {
    const s = String(slaRaw || '').toUpperCase();
    if (s.includes('ROJO') || s.includes('CRIT') || s.includes('VENC')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    if (s.includes('AMAR') || s.includes('ALERT')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
    if (s.includes('VERD') || s.includes('OK') || s.includes('TIEMPO')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
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

  const copyOtToClipboard = (otId: number | string) => {
    navigator.clipboard.writeText(String(otId));
    setCopiedOt(true);
    setTimeout(() => setCopiedOt(false), 1500);
  };

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-140px)] min-h-[640px]">
      {/* PANEL IZQUIERDO: BANDEJA PAGINADA DE CONVERSACIONES (NAVEGACIÓN CÓMODA Y RÁPIDA) */}
      <div className="col-span-4 bg-[#111827]/95 border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-xl">
        {/* Cabecera + Buscador Global + Filtros */}
        <div className="p-3 border-b border-gray-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <MessageSquare size={16} className="text-[#FF6B00]" />
              <span>Bandeja Mantra / WhatsApp</span>
              {loadingPage && <RefreshCw size={12} className="text-[#FF6B00] animate-spin" />}
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              {totalRecords.toLocaleString('es-PE')} casos
            </span>
          </div>

          <div className="flex items-center bg-[#090D16] border border-gray-700/80 rounded-lg px-2.5 py-1.5 focus-within:border-[#FF6B00]">
            <Search size={13} className="text-gray-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Buscar teléfono, DNI, orden, ticket, cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-gray-200 focus:outline-none w-full"
            />
          </div>

          {/* Botones rápidos de alcance: Con Chat vs Todos + Histórico BD */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <button
              onClick={() => setSoloConChat(!soloConChat)}
              className={`py-1.5 px-2 rounded-lg font-bold border transition flex items-center justify-center gap-1 ${
                soloConChat
                  ? 'bg-[#FF6B00]/20 text-[#FF6B00] border-[#FF6B00]/40'
                  : 'bg-[#090D16] text-gray-400 border-gray-800 hover:text-gray-200'
              }`}
            >
              <span>{soloConChat ? '💬 Solo con Chat Mantra' : '📋 Todas las Órdenes'}</span>
            </button>

            <button
              onClick={() => setIgnoreDates(!ignoreDates)}
              className={`py-1.5 px-2 rounded-lg font-bold border transition flex items-center justify-center gap-1 ${
                ignoreDates
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-[#090D16] text-gray-400 border-gray-800 hover:text-gray-200'
              }`}
            >
              <Globe size={11} />
              <span>{ignoreDates ? 'Histórico Total BD' : 'Rango Fechas'}</span>
            </button>
          </div>

          {/* Filtros de SLA y Turno de Palabra */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
              className="bg-[#090D16] border border-gray-800 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:border-[#FF6B00]"
            >
              <option value="Todos">SLA: Todos</option>
              <option value="ROJO">🔴 SLA Rojo / Crítico</option>
              <option value="AMARILLO">🟡 SLA Amarillo</option>
              <option value="VERDE">🟢 SLA Verde</option>
            </select>

            <select
              value={turnoFilter}
              onChange={(e) => setTurnoFilter(e.target.value)}
              className="bg-[#090D16] border border-gray-800 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:border-[#FF6B00]"
            >
              <option value="Todos">Palabra: Todos</option>
              <option value="CLIENTE">👤 Espera Cliente</option>
              <option value="ASESOR">🎧 Turno Asesor</option>
            </select>
          </div>
        </div>

        {/* Lista de Conversaciones Scrolleable */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
          {serverOrders.length > 0 ? (
            serverOrders.map((item, idx) => {
              const isSelected = selectedRow?.orden_id === item.orden_id;
              const stWsp = String(item.estado_wsp || 'NO ENVIADO').toUpperCase();
              const itemSla = item.semaforo_sla;
              const itemTurno = item.quien_tiene_la_palabra;

              return (
                <div
                  key={item.orden_id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`p-3 cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#FF6B00]/15 border-l-4 border-l-[#FF6B00]'
                      : 'hover:bg-gray-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-[#FF6B00]">#{item.orden_id}</span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {item.ticket || item.codi_segui_ot || ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {itemSla && (
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${getSlaBadgeStyle(
                            itemSla
                          )}`}
                        >
                          {itemSla}
                        </span>
                      )}
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

                  <div className="font-bold text-white text-xs mt-1 truncate">
                    {item.cliente || '-'}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                      <Phone size={10} />
                      {item.mantra_phone || item.telefono || 'Sin teléfono'}
                    </span>
                    <span className="truncate max-w-[130px]">
                      {itemTurno ? `Turno: ${itemTurno}` : item.distrito || '-'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-gray-500">
              No se encontraron conversaciones. Desactiva <strong>"Solo con Chat Mantra"</strong> o activa <strong>"Histórico Total BD"</strong>.
            </div>
          )}
        </div>

        {/* Pie de Paginación de la Bandeja Izquierda (50 en 50) */}
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

      {/* PANEL DERECHO: FICHA TÉCNICA RESUMIDA + VISOR CONVERSACIONAL WHATSAPP MANTRA */}
      <div className="col-span-8 bg-[#0B101B] border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-2xl">
        {selectedRow ? (
          <>
            {/* Cabecera del Caso Seleccionado */}
            <div className="p-3.5 bg-[#111827] border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-extrabold text-sm">
                    {String(selectedRow.cliente || 'C').charAt(0)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                    {loadingChat && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-3 w-3 ${
                        loadingChat ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                    ></span>
                  </span>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-extrabold text-sm text-white uppercase">
                      {selectedRow.cliente || 'Cliente WIN'}
                    </h4>
                    <button
                      onClick={() => copyOtToClipboard(selectedRow.orden_id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 font-extrabold text-[11px] hover:bg-[#FF6B00]/30 transition"
                      title="Copiar N° de Orden"
                    >
                      <span>OT #{selectedRow.orden_id}</span>
                      {copiedOt ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    </button>

                    {activeSla && (
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${getSlaBadgeStyle(
                          activeSla
                        )}`}
                      >
                        SLA: {activeSla}
                      </span>
                    )}

                    {activeEstadoChat && (
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase">
                        {activeEstadoChat}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2.5 mt-0.5">
                    <span>
                      Móvil: <strong className="text-emerald-400">{selectedRow.mantra_phone || selectedRow.telefono || '-'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      DNI: <strong className="text-gray-200">{selectedRow.numero_documento || '-'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Palabra: <strong className="text-amber-300">{activeTurno}</strong>
                    </span>
                    <span>•</span>
                    <span className="text-cyan-300 font-semibold">
                      {dataSource === 'live_api' ? '⚡ API Mantra En Vivo' : '🗄️ BD historial_chats_mantra'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Controles Superiores del Visor */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setShowTechCard(!showTechCard)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                    showTechCard
                      ? 'bg-slate-800 text-white border-slate-600'
                      : 'bg-[#090D16] text-gray-400 border-gray-800 hover:text-white'
                  }`}
                  title="Mostrar/Ocultar Ficha Técnica (Tecla F)"
                >
                  <span>Ficha Técnica</span>
                  {showTechCard ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                <div className="flex items-center bg-[#090D16] p-0.5 rounded-lg border border-gray-800 text-[10px]">
                  <button
                    onClick={() => setChatLimit(15)}
                    className={`px-2 py-1 rounded font-bold transition ${
                      chatLimit === 15 ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    15 msgs
                  </button>
                  <button
                    onClick={() => setChatLimit(30)}
                    className={`px-2 py-1 rounded font-bold transition ${
                      chatLimit === 30 ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    30 msgs
                  </button>
                </div>

                <div className="flex items-center bg-[#090D16] p-0.5 rounded-lg border border-gray-800 text-[10px]">
                  <button
                    onClick={() => setViewType('chat')}
                    className={`flex items-center gap-1 px-2 py-1 rounded font-bold transition ${
                      viewType === 'chat' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <MessageSquare size={11} />
                    <span>Chat</span>
                  </button>
                  <button
                    onClick={() => setViewType('json')}
                    className={`flex items-center gap-1 px-2 py-1 rounded font-bold transition ${
                      viewType === 'json' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Code2 size={11} />
                    <span>JSON</span>
                  </button>
                </div>

                <button
                  onClick={() => onSelectOrder(selectedRow)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-[11px] transition shadow-md shadow-orange-500/20"
                >
                  <MapPin size={12} />
                  <span>Mapa / 360°</span>
                </button>
              </div>
            </div>

            {/* FICHA TÉCNICA COMPACTA DE 4 COLUMNAS (COLAPSABLE CON UN CLIC O TECLA F) */}
            {showTechCard && (
              <div className="p-3 bg-[#090D16]/90 border-b border-gray-800 grid grid-cols-4 gap-2.5 text-xs">
                {/* 1. Cliente & Contacto */}
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
                    <span>Cód: <strong className="text-cyan-300">{selectedRow.codi_segui_clien || '-'}</strong></span>
                  </div>
                </div>

                {/* 2. Dirección & Zona */}
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

                {/* 3. Cuadrilla Asignada */}
                <div className="bg-[#111827] border border-gray-800/90 rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-indigo-400 uppercase">
                    <span className="flex items-center gap-1"><Wrench size={12} /> Cuadrilla</span>
                    <span className="text-amber-300 truncate max-w-[90px]">{selectedRow.partner || selectedRow.proveedor_ot || '-'}</span>
                  </div>
                  <div className="text-[11px] text-white font-bold line-clamp-1" title={selectedRow.cuadrilla_completa || selectedRow.cuadrilla}>
                    {selectedRow.cuadrilla_completa || selectedRow.cuadrilla || 'Sin cuadrilla asignada'}
                  </div>
                  <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-800/80 flex justify-between">
                    <span>OT: <strong className="text-emerald-300">{selectedRow.estado_ot || '-'}</strong></span>
                    <span>{selectedRow.fecha_solicitud_fmt || '-'}</span>
                  </div>
                </div>

                {/* 4. Servicio & Detalles */}
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

            {/* LIENZO DE CONVERSACIÓN WHATSAPP / MANTRA */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
              {viewType === 'json' ? (
                <div className="bg-[#090D16] border border-gray-800 rounded-xl p-4 overflow-x-auto">
                  <pre className="font-mono text-xs text-emerald-400 leading-relaxed">
                    {JSON.stringify(
                      {
                        orden_id: selectedRow.orden_id,
                        ticket: selectedRow.ticket,
                        cliente: selectedRow.cliente,
                        phone: selectedRow.mantra_phone || selectedRow.telefono,
                        estado_chat: activeEstadoChat,
                        semaforo_sla: activeSla,
                        quien_tiene_la_palabra: activeTurno,
                        source: dataSource,
                        messages: parsedChatMessages,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              ) : parsedChatMessages.length > 0 ? (
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

                  // 1. Burbuja Cliente (Izquierda)
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

                  // 2. Burbuja Plantilla Oficial Meta HSM (Derecha)
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

                  // 3. Burbuja Asesor WIN (Derecha)
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
                  <p className="text-sm font-bold text-gray-300">Sin mensajes en historial_chats_mantra para esta orden</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Estado WSP: {selectedRow.estado_wsp || 'NO ENVIADO'} • Ingreso Tracking: {selectedRow.ingreso_tracking || 'NO'}
                  </p>
                </div>
              )}
            </div>

            {/* Pie del Visor con Atajos Rápidos */}
            <div className="px-4 py-2 bg-[#111827] border-t border-gray-800 flex flex-wrap items-center justify-between text-[11px] text-gray-400">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 font-mono">↑</kbd>{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 font-mono">↓</kbd> Recorrer bandeja
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 font-mono">F</kbd> Ocultar/Ver Ficha Técnica
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 font-mono">V</kbd> Vista Chat/JSON
                </span>
              </div>
              <div>
                Mostrando {parsedChatMessages.length} mensajes (Límite: {chatLimit})
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Selecciona una conversación de la bandeja izquierda para inspeccionar el hilo y su ficha técnica.
          </div>
        )}
      </div>
    </div>
  );
}