import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Headset,
  Send,
  CheckCircle2,
  Clock,
  User,
  Bot,
  Phone,
  Hash,
  Search,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { AuthUser, RealOrder } from '../types/dashboard';
import { apiFetch } from '../config/api';

export interface LiveChatMessage {
  sender: 'bot' | 'user' | 'agent';
  author?: string;
  text: string;
  timestamp: string;
}

export interface LiveChatSession {
  id: number;
  token: string;
  orden_id: string;
  codisegui: string;
  phone: string;
  grupo_servicio: string;
  motivo: string;
  estado_chat: 'iniciado' | 'en_curso' | 'esperando_asesor' | 'en_atencion' | 'resuelto' | string;
  asesor_nombre: string | null;
  ultimo_mensaje_por: 'cliente' | 'asesor' | 'bot' | string;
  mensajes: LiveChatMessage[];
  created_at: string;
  updated_at: string;
}

interface LiveChatViewProps {
  authUser: AuthUser;
  onSelectOrder?: (order: RealOrder) => void;
}

type EndpointSource = 'internal' | 'staging' | 'production';

const ENDPOINT_URLS: Record<EndpointSource, string> = {
  internal: '',
  staging: 'https://trakingwin-api-eus-ffdahgfvcje8babp.eastus-01.azurewebsites.net',
  production: 'https://webwin-api-service-eus.azurewebsites.net',
};

const QUICK_REPLIES = [
  '¡Hola! Te saluda tu asesor de Soporte WIN. Estoy revisando el estado de tu orden en este momento.',
  'Hemos verificado con la cuadrilla asignada y están en ruta hacia tu domicilio.',
  '¿Me confirmas por favor si te encuentras disponible en el domicilio para recibir al técnico?',
  'Hemos registrado tu solicitud prioritaria. ¿Puedo ayudarte con alguna consulta adicional?',
];

function normalizeSessionItem(raw: any): LiveChatSession {
  const rawState = String(raw.estado_chat || '').trim().toLowerCase();
  const estado_chat =
    rawState === 'derivado a asesor' || rawState === 'esperando_asesor'
      ? 'esperando_asesor'
      : rawState === 'en_atencion' || rawState === 'en atención'
        ? 'en_atencion'
        : rawState === 'en_curso' || rawState === 'en curso'
          ? 'en_curso'
          : rawState === 'finalizado' || rawState === 'resuelto'
            ? 'resuelto'
            : raw.estado_chat || 'iniciado';

  const rawMsgs = Array.isArray(raw.mensajes)
    ? raw.mensajes
    : Array.isArray(raw.mensajes_json)
      ? raw.mensajes_json
      : typeof raw.mensajes_json === 'string'
        ? (() => {
            try {
              return JSON.parse(raw.mensajes_json);
            } catch {
              return [];
            }
          })()
        : [];

  const mensajes: LiveChatMessage[] = (rawMsgs || [])
    .map((m: any): LiveChatMessage | null => {
      if (!m || typeof m !== 'object') return null;
      const text = String(m.text ?? m.texto ?? m.mensaje ?? '').trim();
      if (!text) return null;
      const s = String(m.sender ?? m.rol ?? m.emisor ?? '').toLowerCase();
      const sender: 'bot' | 'user' | 'agent' =
        s === 'user' || s === 'cliente'
          ? 'user'
          : s === 'agent' || s === 'asesor'
            ? 'agent'
            : 'bot';
      return {
        sender,
        author:
          m.author ||
          (sender === 'agent'
            ? m.emisor || raw.asesor_nombre || 'Asesor WIN'
            : sender === 'user'
              ? 'Cliente'
              : 'Asistente WIN'),
        text,
        timestamp: String(m.timestamp ?? m.fecha_utc ?? m.fecha ?? raw.updated_at ?? ''),
      };
    })
    .filter((m: LiveChatMessage | null): m is LiveChatMessage => m !== null);

  return {
    id: Number(raw.id),
    token: String(raw.token || ''),
    orden_id: String(raw.orden_id || ''),
    codisegui: String(raw.codisegui || ''),
    phone: String(raw.phone || ''),
    grupo_servicio: String(raw.grupo_servicio || 'General'),
    motivo: String(raw.motivo || 'Atención en Tracking'),
    estado_chat,
    asesor_nombre: raw.asesor_nombre || null,
    ultimo_mensaje_por: String(raw.ultimo_mensaje_por || 'cliente').toLowerCase(),
    mensajes,
    created_at: String(raw.created_at || ''),
    updated_at: String(raw.updated_at || ''),
  };
}

export function LiveChatView({ authUser }: LiveChatViewProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterTab, setFilterTab] = useState<'cola' | 'esperando' | 'atencion' | 'todos'>('cola');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');
  const [asesorName, setAsesorName] = useState<string>(authUser?.nombre || 'Asesor WIN');
  const [sending, setSending] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [apiSource, setApiSource] = useState<EndpointSource>('internal');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Short Polling cada 3 segundos hacia /api/chat-log/activos
  const { data: rawResponse, isFetching, refetch } = useQuery<any>({
    queryKey: ['liveChatsActivos', apiSource, filterTab === 'todos' ? 'todos' : 'activos'],
    queryFn: async ({ signal }) => {
      const scopeParam = filterTab === 'todos' ? '?scope=todos' : '';
      if (apiSource === 'internal') {
        return apiFetch(`/api/chat-log/activos${scopeParam}`, { signal });
      }
      const baseUrl = ENDPOINT_URLS[apiSource];
      const res = await fetch(`${baseUrl}/api/chat-log/activos`, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} desde ${baseUrl}`);
      }
      return res.json();
    },
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    staleTime: 1500,
  });

  const sessions: LiveChatSession[] = useMemo(() => {
    const arr = Array.isArray(rawResponse?.data) ? rawResponse.data : [];
    return arr.map(normalizeSessionItem);
  }, [rawResponse]);

  const filteredSessions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filterTab === 'esperando' && s.estado_chat !== 'esperando_asesor') return false;
      if (filterTab === 'atencion' && s.estado_chat !== 'en_atencion') return false;
      if (
        filterTab === 'cola' &&
        s.estado_chat !== 'esperando_asesor' &&
        s.estado_chat !== 'en_atencion' &&
        s.estado_chat !== 'en_curso'
      ) {
        return false;
      }

      if (!q) return true;
      return (
        s.orden_id.toLowerCase().includes(q) ||
        s.codisegui.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.grupo_servicio.toLowerCase().includes(q) ||
        s.motivo.toLowerCase().includes(q) ||
        (s.asesor_nombre || '').toLowerCase().includes(q)
      );
    });
  }, [sessions, filterTab, searchTerm]);

  // Seleccionar automáticamente un chat activo cuando el actual se cierra o cuando entra una nueva sesión de la misma orden
  useEffect(() => {
    if (filteredSessions.length === 0) return;

    const currentInFiltered = filteredSessions.find((s) => s.id === selectedId);
    if (!currentInFiltered) {
      setSelectedId(filteredSessions[0].id);
      return;
    }

    // Si la sesión seleccionada está resuelta pero el cliente abrió una nueva sesión activa para la misma orden/token, saltar a la nueva
    if (currentInFiltered.estado_chat === 'resuelto') {
      const newerActiveSameOrder = filteredSessions.find(
        (s) =>
          s.id !== currentInFiltered.id &&
          s.estado_chat !== 'resuelto' &&
          ((s.orden_id && s.orden_id === currentInFiltered.orden_id) ||
            (s.token && s.token === currentInFiltered.token))
      );
      if (newerActiveSameOrder) {
        setSelectedId(newerActiveSameOrder.id);
      }
    }
  }, [filteredSessions, selectedId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) || null,
    [sessions, selectedId]
  );

  // Auto-scroll al recibir nuevos mensajes en la conversación activa
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.id, activeSession?.mensajes.length]);

  const counts = useMemo(() => {
    let esperando = 0;
    let atencion = 0;
    let clientePendiente = 0;
    for (const s of sessions) {
      if (s.estado_chat === 'esperando_asesor') esperando++;
      if (s.estado_chat === 'en_atencion') atencion++;
      if (s.ultimo_mensaje_por === 'cliente' && s.estado_chat !== 'resuelto') {
        clientePendiente++;
      }
    }
    return { esperando, atencion, clientePendiente, total: sessions.length };
  }, [sessions]);

  const handleSendAction = async (
    nuevoEstado: 'en_atencion' | 'resuelto',
    customText?: string
  ) => {
    if (!activeSession || sending) return;
    const textToSend = (customText !== undefined ? customText : replyText).trim();

    if (nuevoEstado === 'en_atencion' && !textToSend) return;

    setSending(true);
    setActionError(null);
    try {
      const payload = {
        sender: 'agent',
        asesor_nombre: asesorName.trim() || authUser?.nombre || 'Asesor WIN',
        text:
          textToSend ||
          (nuevoEstado === 'resuelto'
            ? 'Hemos dado por finalizada esta consulta. ¡Gracias por comunicarte con WIN!'
            : ''),
        nuevo_estado: nuevoEstado,
      };

      if (apiSource === 'internal') {
        await apiFetch(`/api/chat-log/${activeSession.id}/mensaje`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        const baseUrl = ENDPOINT_URLS[apiSource];
        const res = await fetch(`${baseUrl}/api/chat-log/${activeSession.id}/mensaje`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`Error HTTP ${res.status} al enviar mensaje`);
        }
      }

      if (customText === undefined) {
        setReplyText('');
      }
      await queryClient.invalidateQueries({ queryKey: ['liveChatsActivos'] });
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'esperando_asesor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-[#FF5A0A] text-white shadow-xs animate-pulse">
            <AlertCircle size={11} />
            Esperando Asesor
          </span>
        );
      case 'en_atencion':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Headset size={11} />
            En Atención
          </span>
        );
      case 'resuelto':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
            <CheckCircle2 size={11} />
            Resuelto
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-sky-100 text-sky-800 border border-sky-200">
            <Bot size={11} />
            En Curso (Bot)
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR CORPORATIVA (#26292E + #FF5A0A) */}
      <div className="bg-[#26292E] text-white rounded-2xl p-4 sm:px-6 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-[#FF5A0A] flex items-center justify-center text-white shadow-md shadow-orange-500/20 shrink-0">
            <Headset size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                Live Chat GoWIN | Tracking
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-extrabold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Polling 3s
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Esperando asesor:{' '}
              <strong className="text-[#FF5A0A]">{counts.esperando}</strong> • En atención:{' '}
              <strong className="text-emerald-400">{counts.atencion}</strong> • Respuesta pendiente
              al cliente: <strong className="text-amber-300">{counts.clientePendiente}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de origen de datos (BD Directa vs Staging/Prod Tracking API) */}
          <div className="flex items-center gap-1.5 bg-black/25 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-400 font-semibold text-[11px]">Origen:</span>
            <select
              value={apiSource}
              onChange={(e) => setApiSource(e.target.value as EndpointSource)}
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="internal" className="text-slate-900">
                BD_Phoenix Directo (logs_chat)
              </option>
              <option value="staging" className="text-slate-900">
                API Tracking Staging
              </option>
              <option value="production" className="text-slate-900">
                API Tracking Producción
              </option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-black/25 border border-white/10 rounded-xl px-3 py-1.5 text-xs">
            <User size={13} className="text-[#FF5A0A]" />
            <span className="text-slate-400 text-[11px]">Asesor:</span>
            <input
              type="text"
              value={asesorName}
              onChange={(e) => setAsesorName(e.target.value)}
              className="bg-transparent text-white font-bold text-xs w-36 focus:outline-none border-b border-transparent focus:border-[#FF5A0A]"
              placeholder="Nombre del asesor"
            />
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin text-[#FF5A0A]' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* PANEL DIVIDIDO EN 2 COLUMNAS: BANDEJA (IZQUIERDA) + CONVERSACIÓN (DERECHA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-235px)] min-h-[600px]">
        {/* COLUMNA IZQUIERDA: BANDEJA DE ENTRADA */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex flex-col overflow-hidden">
          {/* Buscador y Filtros de Estado */}
          <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar orden, teléfono, servicio o motivo..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5A0A]"
              />
            </div>

            <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFilterTab('cola')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  filterTab === 'cola'
                    ? 'bg-[#26292E] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Activos ({counts.esperando + counts.atencion})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('esperando')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  filterTab === 'esperando'
                    ? 'bg-[#FF5A0A] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Espera ({counts.esperando})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('atencion')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  filterTab === 'atencion'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Atención ({counts.atencion})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('todos')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  filterTab === 'todos'
                    ? 'bg-[#26292E] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
            </div>
          </div>

          {/* Lista de Sesiones */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredSessions.length > 0 ? (
              filteredSessions.map((session) => {
                const isSelected = session.id === selectedId;
                const isWaitingAdvisor = session.estado_chat === 'esperando_asesor';
                const isClientLast =
                  session.ultimo_mensaje_por === 'cliente' && session.estado_chat !== 'resuelto';
                const lastMessage =
                  session.mensajes.length > 0
                    ? session.mensajes[session.mensajes.length - 1]
                    : null;

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(session.id);
                      setActionError(null);
                    }}
                    className={`w-full text-left p-3.5 transition flex flex-col gap-2 cursor-pointer border-l-4 ${
                      isSelected
                        ? 'bg-[#FFF0E5]/70 border-l-[#FF5A0A]'
                        : isWaitingAdvisor
                          ? 'bg-orange-50/40 hover:bg-orange-50/70 border-l-[#FF5A0A]'
                          : 'bg-white hover:bg-slate-50 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-xs text-slate-900">
                          OT #{session.orden_id || session.id}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px]">
                          {session.grupo_servicio}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                        {formatDateTime(session.updated_at)}
                      </span>
                    </div>

                    <div className="text-[11px] font-bold text-slate-700 truncate">
                      {session.motivo}
                    </div>

                    {lastMessage && (
                      <p className="text-xs text-slate-500 line-clamp-1">
                        <strong className="text-slate-700">
                          {lastMessage.sender === 'user'
                            ? 'Cliente: '
                            : lastMessage.sender === 'agent'
                              ? 'Asesor: '
                              : 'Bot: '}
                        </strong>
                        {lastMessage.text}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getEstadoBadge(session.estado_chat)}
                        {isClientLast && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A0A]" />
                            Cliente escribió
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                        <Phone size={10} />
                        {session.phone || 'S/N'}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center space-y-2">
                <MessageSquare size={28} className="mx-auto text-slate-300" />
                <div className="text-xs font-bold text-slate-600">
                  No hay chats en esta vista
                </div>
                <p className="text-[11px] text-slate-400">
                  Cambia a la pestaña &ldquo;Todos&rdquo; para consultar sesiones en curso con el Bot o
                  finalizadas.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: VENTANA DE CONVERSACIÓN ACTIVA */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex flex-col overflow-hidden">
          {activeSession ? (
            <>
              {/* Cabecera del Chat Seleccionado */}
              <div className="bg-[#26292E] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-black tracking-tight text-white">
                      Orden #{activeSession.orden_id}
                    </span>
                    {activeSession.codisegui && (
                      <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-200 text-[11px] font-mono">
                        Seg: {activeSession.codisegui}
                      </span>
                    )}
                    {getEstadoBadge(activeSession.estado_chat)}
                    {activeSession.ultimo_mensaje_por === 'cliente' &&
                      activeSession.estado_chat !== 'resuelto' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#FF5A0A]/20 border border-[#FF5A0A] text-[#FF5A0A] text-[10px] font-extrabold">
                          Último mensaje: Cliente
                        </span>
                      )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <span className="flex items-center gap-1">
                      <Phone size={12} className="text-[#FF5A0A]" />
                      <strong>{activeSession.phone || 'Sin teléfono'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Servicio: <strong className="text-white">{activeSession.grupo_servicio}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Motivo: <strong className="text-orange-300">{activeSession.motivo}</strong>
                    </span>
                    {activeSession.asesor_nombre && (
                      <>
                        <span>•</span>
                        <span>
                          Atendido por:{' '}
                          <strong className="text-emerald-400">{activeSession.asesor_nombre}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeSession.phone && (
                    <a
                      href={`https://wa.me/51${activeSession.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition"
                      title="Abrir respaldo en WhatsApp si es necesario"
                    >
                      <ExternalLink size={13} />
                      <span>WSP</span>
                    </a>
                  )}

                  {activeSession.estado_chat !== 'resuelto' ? (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => handleSendAction('resuelto')}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>Marcar como Resuelto</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        handleSendAction(
                          'en_atencion',
                          'Hemos reabierto tu atención en línea. ¿En qué podemos ayudarte?'
                        )
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-[#FF5A0A] hover:bg-[#e04e00] disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <RefreshCw size={13} />
                      <span>Reabrir Chat</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Historial de Mensajes */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-[#F4F6F8]">
                {activeSession.mensajes.length > 0 ? (
                  activeSession.mensajes.map((msg, idx) => {
                    const isAgent = msg.sender === 'agent';
                    const isUser = msg.sender === 'user';

                    return (
                      <div
                        key={`${activeSession.id}-msg-${idx}`}
                        className={`flex flex-col ${
                          isAgent ? 'items-end' : isUser ? 'items-start' : 'items-center'
                        }`}
                      >
                        <div
                          className={`max-w-[82%] sm:max-w-[72%] rounded-2xl px-4 py-2.5 shadow-2xs text-xs leading-relaxed ${
                            isAgent
                              ? 'bg-[#FF5A0A] text-white rounded-br-xs'
                              : isUser
                                ? 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                                : 'bg-[#26292E]/90 text-slate-100 border border-slate-700 rounded-xl'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1 text-[10px] font-bold opacity-85">
                            <span className="flex items-center gap-1">
                              {isAgent ? (
                                <Headset size={11} />
                              ) : isUser ? (
                                <User size={11} className="text-[#FF5A0A]" />
                              ) : (
                                <Bot size={11} className="text-orange-400" />
                              )}
                              {msg.author ||
                                (isAgent
                                  ? 'Asesor WIN'
                                  : isUser
                                    ? 'Cliente'
                                    : 'Bot GoWIN Tracking')}
                            </span>
                            <span>{formatTime(msg.timestamp)}</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words font-medium">
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Sin mensajes registrados en esta sesión.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Respuestas Rápidas + Caja de Respuesta */}
              <div className="p-3.5 bg-white border-t border-slate-200 space-y-2.5">
                {actionError && (
                  <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                    {actionError}
                  </div>
                )}

                {/* Plantillas rápidas de 1 clic */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
                    <Sparkles size={11} className="text-[#FF5A0A]" />
                    Rápidas:
                  </span>
                  {QUICK_REPLIES.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReplyText(tpl)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#FFF0E5] hover:text-[#FF5A0A] text-slate-600 text-[11px] font-medium truncate max-w-[220px] shrink-0 transition cursor-pointer"
                      title={tpl}
                    >
                      {tpl}
                    </button>
                  ))}
                </div>

                {/* Formulario de Envío */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendAction('en_atencion');
                  }}
                  className="flex items-center gap-2.5"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={sending}
                    placeholder={
                      activeSession.estado_chat === 'resuelto'
                        ? 'Esta conversación está resuelta. Escribe para reabrirla en atención...'
                        : 'Escribe tu respuesta al cliente en el Tracking Web...'
                    }
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#FF5A0A]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="px-5 py-2.5 rounded-xl bg-[#FF5A0A] hover:bg-[#e04e00] disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-2 shadow-md shadow-orange-500/20 transition cursor-pointer shrink-0"
                  >
                    <Send size={14} />
                    <span>{sending ? 'Enviando...' : 'Responder'}</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0E5] text-[#FF5A0A] flex items-center justify-center">
                <Headset size={24} />
              </div>
              <div className="text-sm font-extrabold text-slate-800">
                Selecciona una conversación de la bandeja
              </div>
              <p className="text-xs text-slate-400 max-w-md">
                Los chats derivados desde GoWIN | Tracking aparecerán automáticamente cada 3
                segundos.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
