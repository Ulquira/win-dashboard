import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Sparkles, Headset, ExternalLink, MessageSquare,
  ChevronLeft, ChevronRight, RefreshCw, CheckCheck,
  MapPin, Phone, ShieldCheck, Copy, Check, Layers, Wrench,
  ChevronDown, ChevronUp, Bot, LifeBuoy, Send, CheckCircle2, AlertCircle
} from 'lucide-react';
import { AuthUser, RealOrder } from '../types/dashboard';
import { apiFetch } from '../config/api';

export interface RawChatMessage {
  id?: string | number;
  orden?: number;
  fecha_utc?: string;
  fecha?: string;
  timestamp?: string;
  emisor?: string;
  rol?: string;
  sender?: 'bot' | 'user' | 'agent' | string;
  author?: string;
  direction?: string;
  from_me?: boolean;
  tipo?: string;
  es_plantilla?: boolean;
  nombre_plantilla?: string;
  agente?: string;
  usuario?: string;
  texto?: string;
  text?: string;
  mensaje?: string;
  body?: string;
  contenido?: string;
  estado?: string;
  _fromLogChat?: boolean;
  _firstLogChatMsg?: boolean;
  [key: string]: any;
}

interface TrackingViewProps {
  orders: RealOrder[];
  startDate: string;
  endDate: string;
  service: string;
  globalSearch: string;
  ignoreDates: boolean;
  consultTrigger?: number;
  authUser?: AuthUser | null;
  onSelectOrder: (order: RealOrder) => void;
}

const QUICK_REPLIES = [
  '¡Hola! Te saluda tu asesor de Soporte WIN. Estoy revisando el estado de tu orden en este momento.',
  'Hemos verificado con la cuadrilla asignada y están en ruta hacia tu domicilio.',
  '¿Me confirmas por favor si te encuentras disponible en el domicilio para recibir al técnico?',
  'Hemos registrado tu solicitud prioritaria. ¿Puedo ayudarte con alguna consulta adicional?',
];

function normalizeLogEstado(raw?: string | null): string {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'esperando_asesor' || val === 'derivado a asesor') return 'esperando_asesor';
  if (val === 'en_atencion' || val === 'en atención') return 'en_atencion';
  if (val === 'en_curso' || val === 'en curso') return 'en_curso';
  if (val === 'resuelto' || val === 'finalizado') return 'resuelto';
  return val || '';
}

function formatChatDateTime(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return trimmed.replace('T', ' ').replace(/\.\d+Z?$/, '');
  }

  const fecha = parsed.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Lima',
  });

  const hora = parsed.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Lima',
  });

  return `${fecha} • ${hora}`;
}

export function TrackingView({
  orders: initialOrders,
  startDate,
  endDate,
  service,
  globalSearch,
  ignoreDates,
  consultTrigger = 0,
  authUser,
  onSelectOrder,
}: TrackingViewProps) {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(globalSearch);

  // Persistir filtros de bandeja para que al cambiar de pestaña y volver no se pierda la ubicación
  const [soloConChat, setSoloConChat] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('trk_soloConChat');
    return saved !== null ? saved === 'true' : true;
  });
  const [soloSos, setSoloSos] = useState<boolean>(() => {
    return sessionStorage.getItem('trk_soloSos') === 'true';
  });
  const [soloLogChat, setSoloLogChat] = useState<boolean>(() => {
    return sessionStorage.getItem('trk_soloLogChat') === 'true';
  });
  const [slaFilter, setSlaFilter] = useState<string>(() => {
    return sessionStorage.getItem('trk_sla') || 'Todos';
  });
  const [turnoFilter, setTurnoFilter] = useState<string>(() => {
    return sessionStorage.getItem('trk_turno') || 'Todos';
  });
  const [page, setPage] = useState<number>(() => {
    return Number(sessionStorage.getItem('trk_page')) || 1;
  });
  const pageSize = 50;

  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    return Number(sessionStorage.getItem('trk_selectedIndex')) || 0;
  });
  const [showTechCard, setShowTechCard] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Estado para respuesta en vivo hacia logs_chat (GoWIN | Tracking)
  const [replyText, setReplyText] = useState<string>('');
  const [sendingReply, setSendingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollDownBtn, setShowScrollDownBtn] = useState<boolean>(false);

  // Guardar estado de filtros en sessionStorage automáticamente
  useEffect(() => {
    sessionStorage.setItem('trk_soloConChat', String(soloConChat));
    sessionStorage.setItem('trk_soloSos', String(soloSos));
    sessionStorage.setItem('trk_soloLogChat', String(soloLogChat));
    sessionStorage.setItem('trk_sla', slaFilter);
    sessionStorage.setItem('trk_turno', turnoFilter);
    sessionStorage.setItem('trk_page', String(page));
    sessionStorage.setItem('trk_selectedIndex', String(selectedIndex));
  }, [soloConChat, soloSos, soloLogChat, slaFilter, turnoFilter, page, selectedIndex]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery((prev) => {
        if (prev !== globalSearch) {
          setPage(1);
          setSelectedIndex(0);
        }
        return globalSearch;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // 1. Consulta de Bandeja gestionada con React Query
  const {
    data: trackingData,
    isFetching: loadingPage,
  } = useQuery<any>({
    queryKey: [
      'trackingSearch',
      startDate,
      endDate,
      service,
      debouncedQuery,
      ignoreDates,
      soloConChat,
      soloSos,
      soloLogChat,
      slaFilter,
      turnoFilter,
      page,
      consultTrigger,
    ],
    queryFn: async ({ signal }): Promise<any> => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: debouncedQuery,
        ignoreDates: ignoreDates ? 'true' : 'false',
        soloConChat: soloConChat ? 'true' : 'false',
        soloSos: soloSos ? 'true' : 'false',
        soloLogChat: soloLogChat ? 'true' : 'false',
        sla: slaFilter,
        turno: turnoFilter,
        page: String(page),
        pageSize: String(pageSize),
        refresh: consultTrigger > 0 ? 'true' : 'false',
      });
      return (apiFetch as any)(`/api/tracking/search?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  // 1b. Short Polling cada 3 segundos hacia /api/chat-log/activos?scope=todos para actualizar chats web en vivo al instante
  const { data: liveLogsResponse } = useQuery<any>({
    queryKey: ['liveChatLogsPolling', consultTrigger],
    queryFn: ({ signal }) => apiFetch('/api/chat-log/activos?scope=todos', { signal }),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    staleTime: 1500,
  });

  const liveLogsList: any[] = useMemo(
    () => (Array.isArray(liveLogsResponse?.data) ? liveLogsResponse.data : []),
    [liveLogsResponse]
  );

  const liveWaitingCount = useMemo(
    () =>
      liveLogsList.filter(
        (x) =>
          normalizeLogEstado(x.estado_chat) === 'esperando_asesor' ||
          normalizeLogEstado(x.estado_chat) === 'en_atencion'
      ).length,
    [liveLogsList]
  );

  // Combinar órdenes del servidor con las sesiones activas en tiempo real de logs_chat
  const serverOrders: RealOrder[] = useMemo(() => {
    const baseOrders: RealOrder[] = trackingData?.orders || initialOrders.slice(0, 50);
    const liveByOrden = new Map<string, any>();
    for (const l of liveLogsList) {
      if (l.orden_id) liveByOrden.set(String(l.orden_id), l);
    }

    // Actualizar en caliente cualquier orden de la página actual que tenga sesión en logs_chat
    const enrichedBase = baseOrders.map((ord) => {
      const live = liveByOrden.get(String(ord.orden_id));
      if (!live) return ord;
      const stNorm = normalizeLogEstado(live.estado_chat);
      return {
        ...ord,
        log_chat_id: live.id,
        log_chat_token: live.token,
        log_grupo_servicio: live.grupo_servicio,
        log_motivo_sos: live.motivo,
        log_estado_chat: stNorm,
        log_asesor_nombre: live.asesor_nombre,
        log_ultimo_mensaje_por: live.ultimo_mensaje_por,
        log_mensajes_json: live.mensajes,
        log_updated_at: live.updated_at,
        quien_tiene_la_palabra:
          stNorm === 'esperando_asesor' || live.ultimo_mensaje_por === 'cliente'
            ? 'CLIENTE'
            : stNorm === 'en_atencion' && live.ultimo_mensaje_por === 'asesor'
              ? 'ASESOR'
              : ord.quien_tiene_la_palabra,
        semaforo_sla:
          stNorm === 'esperando_asesor'
            ? 'ROJO'
            : stNorm === 'en_atencion'
              ? 'AMARILLO'
              : ord.semaforo_sla,
      };
    });

    // Inyectar en el tope las sesiones de logs_chat que están activas ('esperando_asesor' o 'en_atencion')
    // o todas las de logs_chat cuando el filtro "Bot SOS / Chat Web" está activo, aunque sean de otra fecha
    const existingIds = new Set(enrichedBase.map((o) => String(o.orden_id)));
    const qLower = debouncedQuery.trim().toLowerCase();

    const injectedLiveOrders: RealOrder[] = liveLogsList
      .filter((live) => {
        if (existingIds.has(String(live.orden_id))) return false;
        const st = normalizeLogEstado(live.estado_chat);
        const isActiveLive = st === 'esperando_asesor' || st === 'en_atencion';
        if (!soloLogChat && !isActiveLive) return false;
        if (qLower) {
          const match =
            String(live.orden_id || '').toLowerCase().includes(qLower) ||
            String(live.cliente || '').toLowerCase().includes(qLower) ||
            String(live.phone || '').toLowerCase().includes(qLower) ||
            String(live.codisegui || '').toLowerCase().includes(qLower);
          if (!match) return false;
        }
        return true;
      })
      .map((live) => {
        const stNorm = normalizeLogEstado(live.estado_chat);
        return {
          orden_id: Number(live.orden_id) || live.id,
          ticket: live.codisegui || String(live.orden_id),
          cliente: live.cliente || `Cliente OT #${live.orden_id}`,
          telefono: live.phone || '',
          mantra_phone: live.mantra_phone || live.phone || '',
          numero_documento: live.numero_documento || live.codisegui || '-',
          codi_segui_ot: live.codisegui || '-',
          producto: live.producto || live.grupo_servicio || 'Servicio WIN',
          servicio_tipo: live.servicio_tipo || live.grupo_servicio || 'INSTA - LIMA',
          tipo_trabajo: live.motivo || 'Atención en Tracking',
          estado_ot: live.estado_ot || 'En Proceso',
          fecha_solicitud_fmt: live.fecha_solicitud_fmt || 'Hoy',
          sector_operativo: live.sector_operativo || 'LIMA',
          distrito: live.distrito || '-',
          partner: live.partner || '-',
          cuadrilla: live.cuadrilla || '-',
          se_envio_wsp: live.se_envio_wsp || 'SI',
          estado_wsp: live.estado_wsp || 'READ',
          ingreso_tracking: 'SI',
          link_tracking: live.token ? `https://enruta.win.pe/seguimiento/${live.token}` : '',
          pulso_soporte: live.pulso_soporte || (stNorm === 'esperando_asesor' ? 'SI' : 'NO'),
          semaforo_sla: live.semaforo_sla || 'ROJO',
          quien_tiene_la_palabra: live.quien_tiene_la_palabra || 'CLIENTE',
          ultimos_mensajes_json: live.chat_json_mantra || null,
          log_chat_id: live.id,
          log_chat_token: live.token,
          log_grupo_servicio: live.grupo_servicio,
          log_motivo_sos: live.motivo,
          log_estado_chat: stNorm,
          log_asesor_nombre: live.asesor_nombre,
          log_ultimo_mensaje_por: live.ultimo_mensaje_por,
          log_mensajes_json: live.mensajes,
          log_updated_at: live.updated_at,
        } as RealOrder;
      });

    const merged = [...injectedLiveOrders, ...enrichedBase];

    // Priorizar arriba de todo los casos con 'esperando_asesor' y luego 'en_atencion'
    return merged.sort((a, b) => {
      const stA = normalizeLogEstado(a.log_estado_chat);
      const stB = normalizeLogEstado(b.log_estado_chat);
      const prioA = stA === 'esperando_asesor' ? 2 : stA === 'en_atencion' ? 1 : 0;
      const prioB = stB === 'esperando_asesor' ? 2 : stB === 'en_atencion' ? 1 : 0;
      if (prioA !== prioB) return prioB - prioA;
      return 0;
    });
  }, [trackingData?.orders, initialOrders, liveLogsList, soloLogChat, debouncedQuery]);

  const totalRecords = Number(trackingData?.total ?? initialOrders.length);
  const totalPages = Number(trackingData?.totalPages ?? 1);

  const queryClient = useQueryClient();

  // Prefetching predictivo de page + 1 en Seguimiento
  useEffect(() => {
    if (!trackingData?.ok || page >= totalPages) return;
    const nextPage = page + 1;
    const params = new URLSearchParams({
      startDate,
      endDate,
      service,
      q: debouncedQuery,
      ignoreDates: ignoreDates ? 'true' : 'false',
      soloConChat: soloConChat ? 'true' : 'false',
      soloSos: soloSos ? 'true' : 'false',
      soloLogChat: soloLogChat ? 'true' : 'false',
      sla: slaFilter,
      turno: turnoFilter,
      page: String(nextPage),
      pageSize: String(pageSize),
      refresh: 'false',
    });
    queryClient.prefetchQuery({
      queryKey: [
        'trackingSearch',
        startDate,
        endDate,
        service,
        debouncedQuery,
        ignoreDates,
        soloConChat,
        soloSos,
        soloLogChat,
        slaFilter,
        turnoFilter,
        nextPage,
        consultTrigger,
      ],
      queryFn: () => (apiFetch as any)(`/api/tracking/search?${params.toString()}`),
      staleTime: 1000 * 60 * 3,
    });
  }, [trackingData?.ok, page, totalPages, startDate, endDate, service, debouncedQuery, ignoreDates, soloConChat, soloSos, soloLogChat, slaFilter, turnoFilter, pageSize, consultTrigger, queryClient]);

  const selectedRow: RealOrder | null =
    serverOrders[selectedIndex] || serverOrders[0] || null;
  const selectedOrderId = selectedRow?.orden_id ?? null;

  // 2. Consulta del Hilo de Chat en Vivo Mantra gestionada por React Query (cacheada por orden_id)
  const {
    data: liveChatData,
    isFetching: loadingChat,
  } = useQuery<any>({
    queryKey: ['mantraLiveChat', selectedOrderId, consultTrigger],
    enabled: Boolean(selectedRow && (selectedRow.mantra_phone || selectedRow.telefono || selectedRow.orden_id)),
    staleTime: 1000 * 45,
    queryFn: async ({ signal }): Promise<any> => {
      const phone = String(selectedRow?.mantra_phone || selectedRow?.telefono || '').replace(/\D/g, '');
      const grupo = String(selectedRow?.servicio_tipo || selectedRow?.producto || 'GENERAL');
      return (apiFetch as any)(
        `/api/4dm1n_/mantra-chat?phone=${encodeURIComponent(
          phone
        )}&ordenId=${encodeURIComponent(String(selectedRow?.orden_id || ''))}&grupoServicio=${encodeURIComponent(
          grupo
        )}&limit=1000`,
        { signal }
      );
    },
  });

  const liveMessages: RawChatMessage[] | null =
    liveChatData?.ok && Array.isArray(liveChatData.messages) && liveChatData.messages.length > 0
      ? liveChatData.messages
      : null;
  const chatMeta = liveChatData?.chatMeta || null;
  const dataSource: 'live_api' | 'db_fallback' | 'snapshot' = liveMessages
    ? liveChatData?.source === 'live_api'
      ? 'live_api'
      : 'db_fallback'
    : 'snapshot';

  // Atajos de teclado: F (Expandir/Colapsar Ficha), ↑ ↓ (Recorrer bandeja)
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
    let mantraList: RawChatMessage[] = [];
    if (liveMessages && liveMessages.length > 0) {
      mantraList = liveMessages;
    } else if (selectedRow.ultimos_mensajes_json) {
      try {
        const parsed =
          typeof selectedRow.ultimos_mensajes_json === 'string'
            ? JSON.parse(selectedRow.ultimos_mensajes_json)
            : selectedRow.ultimos_mensajes_json;
        if (Array.isArray(parsed)) mantraList = parsed;
        else if (parsed && Array.isArray(parsed.messages)) mantraList = parsed.messages;
      } catch (parseErr: any) {
        console.warn('⚠️ Error al parsear JSON de chat Mantra:', parseErr.message);
      }
    }

    let logChatList: RawChatMessage[] = [];
    if (selectedRow.log_mensajes_json) {
      try {
        const parsedLog =
          typeof selectedRow.log_mensajes_json === 'string'
            ? JSON.parse(selectedRow.log_mensajes_json)
            : selectedRow.log_mensajes_json;
        if (Array.isArray(parsedLog)) {
          logChatList = parsedLog.map((m: any, i: number) => ({
            ...m,
            texto: m.text ?? m.texto ?? m.mensaje ?? '',
            fecha_utc: m.timestamp ?? m.fecha_utc ?? m.fecha ?? '',
            _fromLogChat: true,
            _firstLogChatMsg: i === 0,
          }));
        }
      } catch (logErr: any) {
        console.warn('⚠️ Error al parsear log_mensajes_json:', logErr.message);
      }
    }

    let combined: RawChatMessage[] = [...mantraList, ...logChatList];

    // Si tiene disparo WSP pero no hay plantilla explícita en Mantra, mostrar la burbuja inicial HSM como origen del flujo
    const hasTemplateMsg = combined.some(
      (m) => m.tipo === 'template' || Boolean(m.es_plantilla)
    );
    if (!hasTemplateMsg && selectedRow.se_envio_wsp === 'SI') {
      const linkTrk =
        selectedRow.link_tracking ||
        (selectedRow.log_chat_token
          ? `https://enruta.win.pe/seguimiento/${selectedRow.log_chat_token}`
          : selectedRow.token
            ? `https://enruta.win.pe/seguimiento/${selectedRow.token}`
            : 'https://enruta.win.pe');
      combined = [
        {
          orden: 0,
          fecha_utc: selectedRow.fecha_solicitud_fmt || selectedRow.fecha_solicitud || 'Inicio',
          tipo: 'template',
          es_plantilla: true,
          nombre_plantilla: 'WIN - Seguimiento de VT',
          emisor: 'HSM_META',
          estado: selectedRow.estado_wsp || 'SENT',
          texto: `Hola *${selectedRow.cliente || 'Cliente'}*, te informamos sobre la Confirmación de Visita Técnica (${selectedRow.producto || selectedRow.servicio_tipo || 'Servicio WIN'}).\n\n📍 *Dirección:* ${selectedRow.direccion_cliente || selectedRow.distrito || '-'}\n👷 *Cuadrilla:* ${selectedRow.cuadrilla_completa || selectedRow.cuadrilla || '-'} | [Ver Tracking en Vivo,${linkTrk}] | [Reprogramar Visita]`,
        },
        ...combined,
      ];
    }

    return combined.sort((a, b) => {
      if (a.es_plantilla && !b.es_plantilla) return -1;
      if (!a.es_plantilla && b.es_plantilla) return 1;
      const tA = new Date(a.fecha_utc || a.fecha || a.timestamp || 0).getTime() || 0;
      const tB = new Date(b.fecha_utc || b.fecha || b.timestamp || 0).getTime() || 0;
      if (tA !== tB) return tA - tB;
      return Number(a.orden || 0) - Number(b.orden || 0);
    });
  }, [selectedRow, liveMessages]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setShowScrollDownBtn(false);
  }, []);

  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDownBtn(distanceFromBottom > 120);
  };

  // Auto-scroll hacia abajo al abrir un chat o actualizarse el hilo
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollToBottom(false);
    });
  }, [selectedOrderId, parsedChatMessages.length, loadingChat, scrollToBottom]);

  // Enviar mensaje o cambiar estado en el Chat Web (logs_chat)
  const handleSendLiveReply = async (
    nuevoEstado: 'en_atencion' | 'resuelto',
    customText?: string
  ) => {
    if (!selectedRow?.log_chat_id || sendingReply) return;
    const textToSend = (customText !== undefined ? customText : replyText).trim();
    if (nuevoEstado === 'en_atencion' && !textToSend) return;

    setSendingReply(true);
    setReplyError(null);
    try {
      const payload = {
        sender: 'agent',
        asesor_nombre: authUser?.nombre || 'Asesor WIN',
        text:
          textToSend ||
          (nuevoEstado === 'resuelto'
            ? 'Hemos dado por finalizada esta consulta. ¡Gracias por comunicarte con WIN!'
            : ''),
        nuevo_estado: nuevoEstado,
      };

      await apiFetch(`/api/chat-log/${selectedRow.log_chat_id}/mensaje`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (customText === undefined) {
        setReplyText('');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['liveChatLogsPolling'] }),
        queryClient.invalidateQueries({ queryKey: ['trackingSearch'] }),
      ]);
    } catch (err: any) {
      setReplyError(err?.message || 'Error al enviar respuesta al Chat Web');
    } finally {
      setSendingReply(false);
    }
  };

  const isOrderSos = (row?: RealOrder | null) => {
    if (!row) return false;
    const val = String(row.pulso_soporte || '').trim().toUpperCase();
    return val === 'SI' || val === 'SÍ' || val === '1' || val === 'TRUE';
  };

  const sosTimelineInfo = useMemo(() => {
    const hasSosFlag = isOrderSos(selectedRow);
    const rawSosDate =
      selectedRow?.fecha_pulso_soporte ||
      selectedRow?.fecha_soporte ||
      selectedRow?.fh_pulso_soporte ||
      null;

    const triggerRegex =
      /tengo una observaci[oó]n|puls[oó] soporte|solicito soporte|necesito ayuda|bot[oó]n sos|hablar con (un )?asesor|soporte t[eé]cnico|ayuda con mi visita/i;

    let msgIndex = parsedChatMessages.findIndex((m) => {
      if (m._fromLogChat) return false;
      const txt = String(m.texto || m.text || m.mensaje || m.body || m.contenido || '');
      const sender = String(m.emisor || m.rol || m.sender || m.direction || '').toLowerCase();
      const isCli = sender.includes('cli') || sender.includes('inbound') || sender.includes('user') || m.from_me === false;
      return isCli && triggerRegex.test(txt);
    });

    if (msgIndex === -1 && hasSosFlag && rawSosDate && parsedChatMessages.length > 0) {
      const targetMs = new Date(rawSosDate).getTime();
      if (!isNaN(targetMs)) {
        const foundIdx = parsedChatMessages.findIndex((m) => {
          const mMs = new Date(m.fecha_utc || m.fecha || m.timestamp || 0).getTime();
          return !isNaN(mMs) && mMs >= targetMs;
        });
        msgIndex = foundIdx !== -1 ? foundIdx : parsedChatMessages.length - 1;
      }
    }

    if (msgIndex === -1 && hasSosFlag && parsedChatMessages.length > 0 && !selectedRow?.log_chat_id) {
      const firstAgentIdx = parsedChatMessages.findIndex((m) => {
        const sender = String(m.emisor || m.rol || m.sender || m.direction || '').toLowerCase();
        const txt = String(m.texto || m.text || m.mensaje || m.body || m.contenido || '');
        const isCli = sender.includes('cli') || sender.includes('inbound') || sender.includes('user') || m.from_me === false;
        const isTpl = m.tipo === 'template' || Boolean(m.es_plantilla) || /enruta\.win\.pe|confirmaci[oó]n de visita|\|\s*\[/i.test(txt);
        return !isCli && !isTpl;
      });
      if (firstAgentIdx !== -1) {
        msgIndex = firstAgentIdx;
      } else {
        const firstCliIdx = parsedChatMessages.findIndex((m) => {
          const sender = String(m.emisor || m.rol || m.sender || m.direction || '').toLowerCase();
          return sender.includes('cli') || sender.includes('inbound') || sender.includes('user') || m.from_me === false;
        });
        msgIndex = firstCliIdx !== -1 ? firstCliIdx : parsedChatMessages.length - 1;
      }
    }

    const active = hasSosFlag || msgIndex !== -1;
    const rawTs =
      rawSosDate ||
      (msgIndex !== -1
        ? parsedChatMessages[msgIndex]?.fecha_utc ||
          parsedChatMessages[msgIndex]?.fecha ||
          parsedChatMessages[msgIndex]?.timestamp ||
          ''
        : '');

    return {
      active,
      hasSosFlag,
      msgIndex,
      timestampLabel: formatChatDateTime(rawTs),
    };
  }, [selectedRow, parsedChatMessages]);

  const activeTurno =
    chatMeta?.quien_tiene_la_palabra ||
    selectedRow?.quien_tiene_la_palabra ||
    (parsedChatMessages.length > 0
      ? String(
          parsedChatMessages[parsedChatMessages.length - 1].sender ||
            parsedChatMessages[parsedChatMessages.length - 1].emisor ||
            parsedChatMessages[parsedChatMessages.length - 1].rol ||
            ''
        )
          .toLowerCase()
          .includes('cli') ||
        String(parsedChatMessages[parsedChatMessages.length - 1].sender || '').toLowerCase() === 'user'
        ? 'CLIENTE'
        : 'ASESOR'
      : 'BOT');

  const activeSla = chatMeta?.semaforo_sla || selectedRow?.semaforo_sla || 'VERDE';
  const activeEstadoChat = chatMeta?.estado_chat || selectedRow?.estado_chat || null;
  const activeLogEstado = normalizeLogEstado(selectedRow?.log_estado_chat);

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

  const renderLastWriterBadge = (turnoRaw?: string | null) => {
    const t = String(turnoRaw || 'BOT').toUpperCase();
    const isCli = t.includes('CLI') || t === 'USER';
    const isBot = t.includes('BOT') || t.includes('HSM') || t.includes('SIST');
    if (isCli) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 text-[9.5px] font-extrabold uppercase">
          <User size={10} />
          <span>CLIENTE</span>
        </span>
      );
    }
    if (isBot) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 text-[9.5px] font-extrabold uppercase">
          <Bot size={10} />
          <span>BOT</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] border border-orange-200 text-[9.5px] font-extrabold uppercase">
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
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800 break-words">
          {bodyText}
        </div>
        {buttonSegments.length > 0 && (
          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap gap-2">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold text-[11px] shadow-xs shadow-orange-500/20 transform hover:scale-[1.02] transition"
                  >
                    <span>{label || 'Abrir enlace'}</span>
                    <ExternalLink size={12} />
                  </a>
                );
              }
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold shadow-2xs"
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:h-[calc(100vh-140px)] min-h-[640px]">
      {/* PANEL IZQUIERDO: BANDEJA UNIFICADA (MANTRA + CHAT WEB TRACKING) */}
      <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl flex flex-col overflow-hidden shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
        <div className="p-3 border-b border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h3 className="font-bold text-xs sm:text-[13px] text-slate-900 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <MessageSquare size={15} className="text-[#FF5500] shrink-0" />
              <span>Bandeja Mantra</span>
              {loadingPage && <RefreshCw size={12} className="text-[#FF5500] animate-spin shrink-0" />}
            </h3>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = !soloSos;
                  setSoloSos(next);
                  if (next) setSoloLogChat(false);
                  setPage(1);
                  setSelectedIndex(0);
                }}
                className={`h-6 inline-flex items-center gap-1 px-2 rounded-full border text-[10px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${
                  soloSos
                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
                title="Filtrar chats que pulsaron el botón SOS / Soporte"
              >
                <LifeBuoy size={10} className="shrink-0" />
                <span>SOS</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !soloLogChat;
                  setSoloLogChat(next);
                  if (next) setSoloSos(false);
                  setPage(1);
                  setSelectedIndex(0);
                }}
                className={`h-6 inline-flex items-center gap-1 px-2 rounded-full border text-[10px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${
                  soloLogChat
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : liveWaitingCount > 0
                      ? 'bg-[#FF5500] text-white border-[#FF5500] animate-pulse'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}
                title="Filtrar chats en vivo del Asistente Web de Tracking (logs_chat)"
              >
                <Bot size={11} className="shrink-0" />
                <span>
                  {liveWaitingCount > 0 ? `Chat Web (${liveWaitingCount})` : 'Bot SOS'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSoloConChat((prev) => !prev);
                  setPage(1);
                  setSelectedIndex(0);
                }}
                className={`h-6 inline-flex items-center gap-1 px-2 rounded-full border text-[10px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${
                  soloConChat
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title="Alternar entre órdenes con chat o todas las órdenes"
              >
                <span>{soloConChat ? '💬 Con Chat' : '📋 Todas'}</span>
              </button>

              <span className="h-6 inline-flex items-center px-2 text-[10px] font-extrabold rounded-full bg-[#FFF0E5] text-[#FF5500] border border-orange-200 whitespace-nowrap shrink-0 tabular-nums">
                {totalRecords.toLocaleString('es-PE')} casos
              </span>
            </div>
          </div>

          {/* Botoncitos rápidos para filtrar por quién escribió último */}
          <div className="grid grid-cols-4 gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70 text-[10px]">
            {[
              { id: 'Todos', label: 'Todos' },
              { id: 'CLIENTE', label: '👤 Cliente' },
              { id: 'ASESOR', label: '🎧 Asesor' },
              { id: 'BOT', label: '🤖 Bot' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => {
                  setTurnoFilter(btn.id);
                  if (btn.id === 'Todos') {
                    setSoloSos(false);
                    setSoloLogChat(false);
                  }
                  setPage(1);
                  setSelectedIndex(0);
                }}
                className={`py-1.5 px-1.5 rounded-lg font-bold transition truncate cursor-pointer ${
                  turnoFilter === btn.id
                    ? 'bg-[#FF5500] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
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
              onChange={(e) => {
                setSlaFilter(e.target.value);
                setPage(1);
                setSelectedIndex(0);
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:border-[#FF5500]"
            >
              <option value="Todos">Semáforo SLA: Todos</option>
              <option value="ROJO">🔴 Crítico / Vencido</option>
              <option value="AMARILLO">🟡 En Alerta</option>
              <option value="VERDE">🟢 En Tiempo</option>
            </select>
          </div>
        </div>

        {/* Lista de Conversaciones */}
        <div
          className={`flex-1 overflow-y-auto divide-y divide-slate-100 transition-opacity ${
            loadingPage ? 'opacity-60' : 'opacity-100'
          }`}
        >
          {serverOrders.length > 0 ? (
            serverOrders.map((item, idx) => {
              const isSelected = selectedRow?.orden_id === item.orden_id;
              const stWsp = String(item.estado_wsp || 'NO ENVIADO').toUpperCase();
              const docVal = item.numero_documento || '-';
              const codSeguiVal = item.codi_segui_ot || item.ticket || item.CodiSegui || '-';
              const lastWriter = item.quien_tiene_la_palabra || 'BOT';
              const itemLogState = normalizeLogEstado(item.log_estado_chat);
              const isWaitingWebAdvisor = itemLogState === 'esperando_asesor';
              const isInWebAttention = itemLogState === 'en_atencion';

              return (
                <div
                  key={`${item.orden_id}-${item.log_chat_id || idx}`}
                  onClick={() => {
                    const selection = window.getSelection()?.toString();
                    if (selection && selection.length > 0) return;
                    setSelectedIndex(idx);
                    setReplyError(null);
                  }}
                  className={`p-3 cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#FFF0E5]/70 border-l-4 border-l-[#FF5500]'
                      : isWaitingWebAdvisor
                        ? 'bg-orange-50/50 hover:bg-orange-50/80 border-l-4 border-l-[#FF5500]'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-extrabold text-[#FF5500]">Doc: {docVal}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[10.5px] font-bold text-sky-700 font-mono">
                        Cód: {codSeguiVal}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderSlaTrafficDot(item.semaforo_sla)}
                      {renderLastWriterBadge(lastWriter)}
                    </div>
                  </div>

                  <div className="font-bold text-slate-900 text-xs mt-1.5 truncate">
                    {item.cliente || '-'}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                    <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                      <Phone size={10} />
                      {item.mantra_phone || item.telefono || 'Sin teléfono'}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {isWaitingWebAdvisor && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF5500] text-white text-[9px] font-extrabold uppercase animate-pulse">
                          <AlertCircle size={9} />
                          Espera Web
                        </span>
                      )}
                      {isInWebAttention && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] font-extrabold uppercase">
                          <Headset size={9} />
                          Atención Web
                        </span>
                      )}
                      {(item.log_motivo_sos || item.log_chat_id) &&
                        !isWaitingWebAdvisor &&
                        !isInWebAttention && (
                          <span
                            className="inline-flex items-center justify-center w-5 h-4 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200"
                            title={`Bot SOS / Chat Web: ${item.log_motivo_sos || 'Soporte'}`}
                          >
                            <Bot size={10} />
                          </span>
                        )}
                      {isOrderSos(item) && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[9px] font-extrabold"
                          title="El cliente pulsó el botón SOS / Soporte"
                        >
                          <LifeBuoy size={9} />
                          <span>SOS</span>
                        </span>
                      )}
                      {item.ingreso_tracking === 'SI' && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold">
                          TRK
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          stWsp === 'READ'
                            ? 'bg-emerald-100 text-emerald-800'
                            : stWsp.includes('DELIVER')
                              ? 'bg-sky-100 text-sky-800'
                              : stWsp === 'SENT'
                                ? 'bg-blue-100 text-blue-800'
                                : stWsp === 'FAILED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-600'
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
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>No se encontraron conversaciones con los filtros actuales.</p>
              {(soloSos || soloLogChat || turnoFilter !== 'Todos' || slaFilter !== 'Todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setSoloSos(false);
                    setSoloLogChat(false);
                    setTurnoFilter('Todos');
                    setSlaFilter('Todos');
                    setPage(1);
                    setSelectedIndex(0);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-bold text-[11px] hover:bg-orange-100 transition"
                >
                  Restablecer filtros de bandeja
                </button>
              )}
            </div>
          )}
        </div>

        {/* Paginación de 50 en 50 */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
          <button
            type="button"
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              setSelectedIndex(0);
            }}
            disabled={page <= 1 || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-[#FF5500] hover:border-[#FF5500] hover:text-white disabled:opacity-40 font-semibold transition"
          >
            <ChevronLeft size={12} /> Ant
          </button>
          <span>
            Página <strong className="text-slate-900">{page}</strong> de{' '}
            <strong className="text-slate-900">{totalPages.toLocaleString('es-PE')}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setPage((p) => Math.min(totalPages, p + 1));
              setSelectedIndex(0);
            }}
            disabled={page >= totalPages || loadingPage}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-[#FF5500] hover:border-[#FF5500] hover:text-white disabled:opacity-40 font-semibold transition"
          >
            Sig <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* PANEL DERECHO: FICHA TÉCNICA + VISOR CONVERSACIONAL OMNICANAL + CAJA DE RESPUESTA */}
      <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl flex flex-col overflow-hidden shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
        {selectedRow ? (
          <>
            {/* Cabecera Limpia */}
            <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-[#FFF0E5] border border-orange-200 flex items-center justify-center text-[#FF5500] font-extrabold text-sm">
                    {String(selectedRow.cliente || 'C').charAt(0)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center">
                    {renderSlaTrafficDot(activeSla)}
                  </span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-extrabold text-sm text-slate-900 uppercase">
                      {selectedRow.cliente || 'Cliente WIN'}
                    </h4>
                    {sosTimelineInfo.active && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-extrabold uppercase shadow-2xs"
                        title="Cliente pulsó botón SOS"
                      >
                        <LifeBuoy size={11} className="text-rose-600" />
                        <span>SOS</span>
                      </span>
                    )}
                    {selectedRow.log_chat_id && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase shadow-2xs ${
                          activeLogEstado === 'esperando_asesor'
                            ? 'bg-[#FF5500] text-white animate-pulse'
                            : activeLogEstado === 'en_atencion'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : activeLogEstado === 'resuelto'
                                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        <Bot size={11} />
                        <span>
                          {activeLogEstado === 'esperando_asesor'
                            ? 'Chat Web: Esperando Asesor'
                            : activeLogEstado === 'en_atencion'
                              ? 'Chat Web: En Atención'
                              : activeLogEstado === 'resuelto'
                                ? 'Chat Web: Resuelto'
                                : 'Chat Web: En Curso'}
                        </span>
                      </span>
                    )}
                    {renderLastWriterBadge(activeTurno)}
                    {activeEstadoChat && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold uppercase">
                        {activeEstadoChat}
                      </span>
                    )}
                    {loadingChat ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
                        <RefreshCw size={10} className="animate-spin" /> Sincronizando...
                      </span>
                    ) : dataSource === 'live_api' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Mantra Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-medium">
                        Polling 3s
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2.5 mt-1">
                    <span>
                      Móvil:{' '}
                      <strong className="text-emerald-700">
                        {selectedRow.mantra_phone || selectedRow.telefono || '-'}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Doc: <strong className="text-slate-800">{selectedRow.numero_documento || '-'}</strong>
                    </span>
                    <span>•</span>
                    <button
                      type="button"
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
                      className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-bold transition"
                      title="Copiar Cód.Segui"
                    >
                      <span>Cód.Segui: {selectedRow.codi_segui_ot || selectedRow.ticket || '-'}</span>
                      {copiedCode ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Controles Superiores */}
              <div className="flex items-center gap-2 text-xs">
                {selectedRow.log_chat_id && (
                  activeLogEstado !== 'resuelto' ? (
                    <button
                      type="button"
                      disabled={sendingReply}
                      onClick={() => handleSendLiveReply('resuelto')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 size={13} />
                      <span>Marcar Resuelto</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={sendingReply}
                      onClick={() =>
                        handleSendLiveReply(
                          'en_atencion',
                          'Hemos reabierto tu atención en línea. ¿En qué podemos ayudarte?'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                    >
                      <RefreshCw size={12} />
                      <span>Reabrir Chat</span>
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => setShowTechCard(!showTechCard)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                    showTechCard
                      ? 'bg-slate-100 text-slate-900 border-slate-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Mostrar/Ocultar Ficha Técnica (Tecla F)"
                >
                  <span>Ficha Técnica</span>
                  {showTechCard ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectOrder(selectedRow)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold text-[11px] transition shadow-xs shadow-orange-500/20 cursor-pointer"
                >
                  <span>Detalle</span>
                </button>
              </div>
            </div>

            {/* FICHA TÉCNICA DE 4 COLUMNAS */}
            {showTechCard && (
              <div className="p-3.5 bg-slate-50/80 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-blue-600 uppercase">
                    <span className="flex items-center gap-1">
                      <User size={12} /> Cliente
                    </span>
                    <span className="text-slate-400">
                      {selectedRow.segmento_cliente || 'Residencial'}
                    </span>
                  </div>
                  <div
                    className="font-bold text-slate-900 text-[11px] truncate"
                    title={selectedRow.cliente}
                  >
                    {selectedRow.cliente || '-'}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                    <span>
                      Doc: <strong className="text-slate-800">{selectedRow.numero_documento || '-'}</strong>
                    </span>
                    <span>
                      Cód:{' '}
                      <strong className="text-sky-700">
                        {selectedRow.codi_segui_ot || selectedRow.ticket || '-'}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-rose-600 uppercase">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> Ubicación
                    </span>
                    <span className="text-sky-700 truncate max-w-[90px]">
                      {selectedRow.distrito || '-'}
                    </span>
                  </div>
                  <div
                    className="text-[11px] text-slate-700 font-medium line-clamp-1"
                    title={selectedRow.direccion_cliente}
                  >
                    {selectedRow.direccion_cliente || 'Sin dirección detallada'}
                  </div>
                  <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 truncate">
                    Sector:{' '}
                    <strong className="text-slate-800">
                      {selectedRow.sector_operativo || selectedRow.provincia_cliente || 'LIMA'}
                    </strong>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-indigo-600 uppercase">
                    <span className="flex items-center gap-1">
                      <Wrench size={12} /> Cuadrilla
                    </span>
                    <span className="text-amber-700 truncate max-w-[90px]">
                      {selectedRow.partner || selectedRow.proveedor_ot || '-'}
                    </span>
                  </div>
                  <div
                    className="text-[11px] text-slate-900 font-bold line-clamp-1"
                    title={selectedRow.cuadrilla_completa || selectedRow.cuadrilla}
                  >
                    {selectedRow.cuadrilla_completa ||
                      selectedRow.cuadrilla ||
                      'Sin cuadrilla asignada'}
                  </div>
                  <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex justify-between">
                    <span>
                      Estado: <strong className="text-emerald-700">{selectedRow.estado_ot || '-'}</strong>
                    </span>
                    <span>{selectedRow.fecha_solicitud_fmt || '-'}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-600 uppercase">
                    <span className="flex items-center gap-1">
                      <Layers size={12} /> Servicio
                    </span>
                    <span className="font-mono text-slate-400">
                      {selectedRow.ticket || selectedRow.codi_segui_ot || '-'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-900 font-bold truncate">
                    {selectedRow.producto || selectedRow.servicio_tipo || '-'}
                  </div>
                  <div
                    className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 truncate"
                    title={
                      selectedRow.log_motivo_sos ||
                      selectedRow.motivo_trabajo ||
                      selectedRow.diagnostico_tecnico
                    }
                  >
                    Motivo:{' '}
                    <strong className="text-slate-800">
                      {selectedRow.log_motivo_sos ||
                        selectedRow.motivo_trabajo ||
                        selectedRow.diagnostico_tecnico ||
                        selectedRow.tipo_trabajo ||
                        '-'}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* LIENZO DE CHAT COMPLETO CON BOTÓN FLOTANTE */}
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
              <div
                ref={chatContainerRef}
                onScroll={handleChatScroll}
                className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F8F9FA] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]"
              >
                {parsedChatMessages.length > 0 ? (
                  parsedChatMessages.map((msg, idx) => {
                    const textContent =
                      msg.text || msg.texto || msg.mensaje || msg.body || msg.contenido || '';
                    const senderRaw = String(
                      msg.sender || msg.emisor || msg.rol || msg.direction || ''
                    ).toLowerCase();
                    const isFromLogChat = Boolean(msg._fromLogChat);

                    const isCliente =
                      senderRaw === 'user' ||
                      senderRaw.includes('cli') ||
                      senderRaw.includes('inbound') ||
                      msg.from_me === false;

                    const isAgentWeb =
                      !isCliente && isFromLogChat && (senderRaw === 'agent' || senderRaw.includes('asesor'));

                    const isAsistenteWin =
                      !isCliente &&
                      !isAgentWeb &&
                      (isFromLogChat ||
                        senderRaw === 'bot' ||
                        String(msg.emisor || '').toUpperCase() === 'ASISTENTE_WIN' ||
                        String(msg.rol || '').toLowerCase() === 'bot');

                    const isTemplate =
                      !isCliente &&
                      !isAsistenteWin &&
                      !isAgentWeb &&
                      (msg.tipo === 'template' ||
                        Boolean(msg.es_plantilla) ||
                        /enruta\.win\.pe|confirmaci[oó]n de visita|plantilla preaprobada|\|\s*\[/i.test(
                          textContent
                        ));

                    const timeLabel = formatChatDateTime(
                      msg.timestamp || msg.fecha_utc || msg.fecha || ''
                    );
                    const showSosMilestoneHere =
                      sosTimelineInfo.active && sosTimelineInfo.msgIndex === idx;
                    const showLogChatBannerHere = Boolean(msg._firstLogChatMsg);

                    const sosMilestoneBanner = showSosMilestoneHere ? (
                      <div className="my-2.5 flex items-center gap-3 select-none">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-rose-300 to-rose-400" />
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-[10.5px] font-extrabold shadow-2xs">
                          <LifeBuoy size={12} className="text-rose-600 shrink-0" />
                          <span>SOS</span>
                          {sosTimelineInfo.timestampLabel && (
                            <span className="text-[10px] font-medium text-rose-600 pl-1 border-l border-rose-200">
                              {sosTimelineInfo.timestampLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-rose-300 to-rose-400" />
                      </div>
                    ) : null;

                    const logChatMilestoneBanner = showLogChatBannerHere ? (
                      <div className="my-2.5 flex items-center gap-3 select-none">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-300 to-indigo-400" />
                        <div
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10.5px] font-extrabold shadow-2xs"
                          title={selectedRow.log_motivo_sos || 'Chat Web Tracking'}
                        >
                          <Bot size={13} className="text-indigo-600 shrink-0" />
                          <span>Chat Web Tracking • {selectedRow.log_motivo_sos || 'En Vivo'}</span>
                          {timeLabel && (
                            <span className="text-[10px] font-medium text-indigo-600 pl-1 border-l border-indigo-200">
                              {timeLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-indigo-300 to-indigo-400" />
                      </div>
                    ) : null;

                    if (isCliente) {
                      return (
                        <React.Fragment key={idx}>
                          {sosMilestoneBanner}
                          {logChatMilestoneBanner}
                          <div className="flex flex-col items-start">
                            <div
                              className={`max-w-[78%] rounded-2xl rounded-tl-sm p-3.5 shadow-xs space-y-2 ${
                                isFromLogChat
                                  ? 'bg-indigo-50/40 border border-indigo-200/90'
                                  : 'bg-white border border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    isFromLogChat
                                      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                      : 'bg-sky-100 text-sky-800 border-sky-200'
                                  }`}
                                >
                                  <User size={11} />
                                  <span>
                                    {isFromLogChat ? 'Cliente (Web) • ' : 'Cliente (WSP) • '}
                                    {selectedRow.cliente}
                                  </span>
                                </span>
                                <span className="text-[10px] text-slate-400">{timeLabel}</span>
                              </div>
                              {renderFormattedChatMessage(textContent)}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    }

                    if (isAsistenteWin) {
                      return (
                        <React.Fragment key={idx}>
                          {sosMilestoneBanner}
                          {logChatMilestoneBanner}
                          <div className="flex flex-col items-end">
                            <div className="max-w-[78%] rounded-2xl rounded-tr-sm p-3.5 bg-indigo-50/90 border border-indigo-200 shadow-xs space-y-2">
                              <div className="flex items-center justify-between gap-4 border-b border-indigo-200/60 pb-1.5">
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold"
                                  title="Asistente Virtual WIN (Tracking Web)"
                                >
                                  <Bot size={11} />
                                  <span>Asistente WIN (Web)</span>
                                </span>
                                <span className="text-[10px] text-indigo-700 font-semibold">
                                  {timeLabel}
                                </span>
                              </div>
                              {renderFormattedChatMessage(textContent)}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    }

                    if (isTemplate) {
                      return (
                        <React.Fragment key={idx}>
                          {sosMilestoneBanner}
                          {logChatMilestoneBanner}
                          <div className="flex flex-col items-end">
                            <div className="max-w-[80%] rounded-2xl rounded-tr-sm p-4 bg-purple-50/90 border border-purple-200 shadow-xs space-y-2.5">
                              <div className="flex items-center justify-between gap-4 border-b border-purple-200/70 pb-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  <Sparkles size={11} />
                                  <span>{msg.nombre_plantilla || 'Plantilla Oficial Meta HSM'}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] text-purple-800 font-semibold">
                                  <ShieldCheck size={12} className="text-emerald-600" />
                                  Disparo Automático HSM
                                </span>
                              </div>
                              {renderFormattedChatMessage(textContent)}
                              <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                                <span>{timeLabel}</span>
                                <span className="inline-flex items-center gap-1 font-bold text-sky-700">
                                  <CheckCheck size={12} />
                                  {String(msg.estado || selectedRow.estado_wsp || 'SENT').toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    }

                    return (
                      <React.Fragment key={idx}>
                        {sosMilestoneBanner}
                        {logChatMilestoneBanner}
                        <div className="flex flex-col items-end">
                          <div className="max-w-[78%] rounded-2xl rounded-tr-sm p-3.5 bg-[#FFF0E5]/90 border border-orange-200 shadow-xs space-y-2">
                            <div className="flex items-center justify-between gap-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#FF5500] border border-orange-200">
                                <Headset size={11} />
                                <span>
                                  {isAgentWeb ? 'Asesor WIN (Web) • ' : 'Asesor WIN (Mantra) • '}
                                  {msg.author || msg.agente || msg.usuario || 'Agente WIN'}
                                </span>
                              </span>
                              <span className="text-[10px] text-slate-500">{timeLabel}</span>
                            </div>
                            {renderFormattedChatMessage(textContent)}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-400">
                    <MessageSquare size={32} className="text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-600">
                      Sin mensajes registrados para este caso
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Estado WSP: {selectedRow.estado_wsp || 'NO ENVIADO'} • Ingreso Tracking:{' '}
                      {selectedRow.ingreso_tracking || 'NO'}
                    </p>
                  </div>
                )}
              </div>

              {/* Botón flotante para bajar al mensaje más reciente */}
              {showScrollDownBtn && (
                <button
                  type="button"
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-4 right-5 z-20 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold text-xs shadow-lg shadow-orange-500/30 transition transform hover:scale-105 cursor-pointer"
                  title="Ir al mensaje más reciente"
                >
                  <span>Ir al último mensaje</span>
                  <ChevronDown size={15} />
                </button>
              )}
            </div>

            {/* PIE INTERACTIVO: CAJA DE RESPUESTA EN VIVO (SI TIENE CHAT WEB) O BARRA DE ATAJOS */}
            {selectedRow.log_chat_id ? (
              <div className="p-3 bg-white border-t border-slate-200 space-y-2">
                {replyError && (
                  <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                    {replyError}
                  </div>
                )}

                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
                    <Sparkles size={11} className="text-[#FF5500]" />
                    Rápidas:
                  </span>
                  {QUICK_REPLIES.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReplyText(tpl)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#FFF0E5] hover:text-[#FF5500] text-slate-600 text-[10.5px] font-medium truncate max-w-[210px] shrink-0 transition cursor-pointer"
                      title={tpl}
                    >
                      {tpl}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendLiveReply('en_atencion');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={sendingReply}
                    placeholder={
                      activeLogEstado === 'resuelto'
                        ? 'Chat Web resuelto. Escribe para reabrir y responder al cliente...'
                        : 'Escribe tu respuesta directa al Chat Web de GoWIN | Tracking...'
                    }
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#FF5500]"
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm shadow-orange-500/20 transition cursor-pointer shrink-0"
                  >
                    <Send size={13} />
                    <span>{sendingReply ? 'Enviando...' : 'Responder Web'}</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="px-4 py-2.5 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-3">
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono">
                      ↑
                    </kbd>{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono">
                      ↓
                    </kbd>{' '}
                    Recorrer casos
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono">
                      F
                    </kbd>{' '}
                    Ocultar/Ver Ficha Técnica
                  </span>
                </div>
                <div className="font-medium text-slate-600">
                  Historial completo ({parsedChatMessages.length} mensajes)
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            Selecciona una conversación de la bandeja izquierda para inspeccionar el hilo completo.
          </div>
        )}
      </div>
    </div>
  );
}
