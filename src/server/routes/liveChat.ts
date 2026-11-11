import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../auth/middleware';

const router = Router();

let indexChecked = false;
async function ensureLogsChatMultiSessionIndex(): Promise<void> {
  if (indexChecked) return;
  indexChecked = true;
  try {
    const [idxRows]: any = await pool.query(
      `SHOW INDEX FROM logs_chat WHERE Key_name = 'uk_token'`
    );
    if (Array.isArray(idxRows) && idxRows.length > 0) {
      await pool.query(`ALTER TABLE logs_chat DROP INDEX uk_token, ADD INDEX idx_token (token)`);
    }
  } catch {
    // Ignorar si ya fue migrado
  }
}

export interface NormalizedChatMessage {
  sender: 'bot' | 'user' | 'agent';
  author?: string;
  text: string;
  timestamp: string;
}

function normalizeEstadoChat(raw: any): string {
  const val = String(raw || '').trim();
  const lower = val.toLowerCase();
  if (lower === 'esperando_asesor' || lower === 'derivado a asesor') return 'esperando_asesor';
  if (lower === 'en_atencion' || lower === 'en atención') return 'en_atencion';
  if (lower === 'en_curso' || lower === 'en curso') return 'en_curso';
  if (lower === 'resuelto' || lower === 'finalizado') return 'resuelto';
  if (lower === 'iniciado') return 'iniciado';
  return val || 'iniciado';
}

function normalizeMessages(rawJson: any): NormalizedChatMessage[] {
  if (!rawJson) return [];
  let parsed: any[] = [];
  if (Array.isArray(rawJson)) {
    parsed = rawJson;
  } else if (typeof rawJson === 'string') {
    try {
      const p = JSON.parse(rawJson);
      if (Array.isArray(p)) parsed = p;
    } catch {
      return [];
    }
  }
  return parsed
    .map((m: any): NormalizedChatMessage | null => {
      if (!m || typeof m !== 'object') return null;
      const text = String(m.text ?? m.texto ?? m.mensaje ?? m.content ?? '').trim();
      if (!text) return null;

      let sender: 'bot' | 'user' | 'agent' = 'bot';
      const rawSender = String(m.sender ?? m.rol ?? m.emisor ?? '').toLowerCase();
      if (rawSender === 'user' || rawSender === 'cliente' || rawSender === 'client') {
        sender = 'user';
      } else if (rawSender === 'agent' || rawSender === 'asesor' || rawSender === 'advisor') {
        sender = 'agent';
      } else {
        sender = 'bot';
      }

      const author =
        m.author ||
        (sender === 'agent'
          ? m.emisor || 'Asesor WIN'
          : sender === 'user'
            ? 'Cliente'
            : 'Asistente WIN');

      const timestamp = String(
        m.timestamp ?? m.fecha_utc ?? m.fecha ?? m.created_at ?? new Date().toISOString()
      );

      return { sender, author, text, timestamp };
    })
    .filter((m): m is NormalizedChatMessage => m !== null);
}

function extractClientNameFromGreeting(mensajes: NormalizedChatMessage[]): string | null {
  for (const m of mensajes) {
    if (m.sender === 'bot') {
      const match = m.text.match(/¡?Hola\s+([A-Za-zÁÉÍÓÚÑáéíóúñ\s]{2,35})!/i);
      if (match && match[1]) {
        return match[1].trim().toUpperCase();
      }
    }
  }
  return null;
}

/**
 * GET /api/chat-log/activos
 * Devuelve las sesiones más recientes por orden_id de logs_chat enriquecidas con Ficha Técnica y Mantra.
 */
router.get(
  '/chat-log/activos',
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    await ensureLogsChatMultiSessionIndex();

    const scope = String(req.query.scope || 'activos').toLowerCase();

    const whereClause =
      scope === 'todos'
        ? '1=1'
        : `LOWER(TRIM(lc.estado_chat)) IN ('esperando_asesor', 'derivado a asesor', 'en_atencion', 'en atención', 'en_curso', 'en curso')`;

    const [rows]: any = await pool.query(
      `SELECT
         lc.id,
         lc.token,
         lc.orden_id,
         lc.codisegui,
         lc.phone,
         lc.grupo_servicio,
         lc.motivo,
         lc.estado_chat,
         lc.asesor_nombre,
         lc.ultimo_mensaje_por,
         lc.mensajes_json,
         lc.created_at,
         lc.updated_at,
         v.cliente,
         v.ticket,
         v.telefono,
         v.producto,
         v.tipo_operacion,
         v.estado_ot,
         DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_solicitud_fmt,
         v.sector_operativo,
         v.distrito,
         v.partner,
         v.cuadrilla,
         v.se_envio_wsp,
         v.estado_wsp,
         v.ingreso_tracking,
         v.link_tracking,
         v.pulso_soporte,
         v.ops_num_doc AS numero_documento,
         v.ops_codi_segui_clien AS codi_segui_clien,
         v.ops_cuadrilla AS cuadrilla_completa,
         h.phone AS mantra_phone,
         h.estado_chat AS mantra_estado_chat,
         h.semaforo_sla,
         h.quien_tiene_la_palabra,
         h.ultimos_mensajes_json AS chat_json_mantra
       FROM logs_chat lc
       INNER JOIN (
         SELECT orden_id, MAX(id) AS max_id
         FROM logs_chat
         GROUP BY orden_id
       ) latest ON lc.id = latest.max_id
       LEFT JOIN mat_funnel_casos_360 v ON v.orden_id = lc.orden_id
       LEFT JOIN historial_chats_mantra h ON h.orden_id = lc.orden_id
       WHERE ${whereClause}
       ORDER BY
         CASE
           WHEN LOWER(TRIM(lc.estado_chat)) IN ('esperando_asesor', 'derivado a asesor') THEN 0
           WHEN LOWER(TRIM(lc.estado_chat)) IN ('en_atencion', 'en atención') THEN 1
           WHEN LOWER(TRIM(lc.estado_chat)) IN ('en_curso', 'en curso') THEN 2
           ELSE 3
         END ASC,
         lc.updated_at DESC
       LIMIT 100`
    );

    const data = (rows || []).map((r: any) => {
      const mensajes = normalizeMessages(r.mensajes_json);
      const estadoNorm = normalizeEstadoChat(r.estado_chat);
      const lastMsg = mensajes.length > 0 ? mensajes[mensajes.length - 1] : null;
      const ultimoPor =
        r.ultimo_mensaje_por ||
        (lastMsg?.sender === 'user'
          ? 'cliente'
          : lastMsg?.sender === 'agent'
            ? 'asesor'
            : 'bot');

      const inferredName = extractClientNameFromGreeting(mensajes);

      return {
        id: Number(r.id),
        token: r.token || '',
        orden_id: String(r.orden_id || ''),
        codisegui: String(r.codisegui || r.ticket || ''),
        phone: String(r.phone || r.telefono || ''),
        grupo_servicio: String(r.grupo_servicio || r.tipo_operacion || 'General'),
        motivo: String(r.motivo || 'Consulta en Tracking'),
        estado_chat: estadoNorm,
        estado_original: r.estado_chat,
        asesor_nombre: r.asesor_nombre || null,
        ultimo_mensaje_por: String(ultimoPor).toLowerCase(),
        mensajes,
        created_at: r.created_at,
        updated_at: r.updated_at,
        // Datos enriquecidos para la vista unificada de Seguimiento
        cliente: r.cliente || (inferredName ? `${inferredName} (Tracking Web)` : `Cliente OT #${r.orden_id}`),
        numero_documento: r.numero_documento || r.codisegui || '-',
        codi_segui_ot: r.codisegui || r.ticket || '-',
        distrito: r.distrito || '-',
        sector_operativo: r.sector_operativo || r.grupo_servicio || 'LIMA',
        partner: r.partner || '-',
        cuadrilla: r.cuadrilla_completa || r.cuadrilla || 'En asignación',
        estado_ot: r.estado_ot || 'En Proceso',
        fecha_solicitud_fmt: r.fecha_solicitud_fmt || 'Hoy',
        producto: r.producto || r.grupo_servicio || 'Servicio WIN',
        servicio_tipo: r.tipo_operacion || r.grupo_servicio || 'INSTA - LIMA',
        se_envio_wsp: r.se_envio_wsp || 'SI',
        estado_wsp: r.estado_wsp || 'READ',
        ingreso_tracking: 'SI',
        pulso_soporte: r.pulso_soporte || (estadoNorm === 'esperando_asesor' ? 'SI' : 'NO'),
        semaforo_sla:
          estadoNorm === 'esperando_asesor'
            ? 'ROJO'
            : estadoNorm === 'en_atencion'
              ? 'AMARILLO'
              : r.semaforo_sla || 'VERDE',
        quien_tiene_la_palabra:
          String(ultimoPor).toLowerCase() === 'cliente'
            ? 'CLIENTE'
            : String(ultimoPor).toLowerCase() === 'asesor'
              ? 'ASESOR'
              : r.quien_tiene_la_palabra || 'BOT',
        chat_json_mantra: r.chat_json_mantra || null,
      };
    });

    res.json({
      ok: true,
      success: true,
      data,
    });
  })
);

/**
 * POST /api/chat-log/:id/mensaje
 * Permite al asesor enviar un mensaje al cliente o marcar el chat como resuelto.
 */
router.post(
  '/chat-log/:id/mensaje',
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    const chatId = Number(req.params.id);
    if (!Number.isFinite(chatId) || chatId <= 0) {
      res.status(400).json({ ok: false, success: false, error: 'ID de sesión inválido' });
      return;
    }

    const sender: 'agent' | 'bot' | 'user' = req.body?.sender || 'agent';
    const asesorNombre = String(
      req.body?.asesor_nombre || authUser?.nombre || 'Asesor WIN'
    ).trim();
    const text = String(req.body?.text || '').trim();
    const nuevoEstado = normalizeEstadoChat(req.body?.nuevo_estado || 'en_atencion');

    if (!text && nuevoEstado !== 'resuelto') {
      res.status(400).json({
        ok: false,
        success: false,
        error: 'El mensaje no puede estar vacío',
      });
      return;
    }

    const [rows]: any = await pool.query(
      `SELECT id, mensajes_json, estado_chat, asesor_nombre FROM logs_chat WHERE id = ? LIMIT 1`,
      [chatId]
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({ ok: false, success: false, error: 'Sesión de chat no encontrada' });
      return;
    }

    const currentRow = rows[0];
    const currentMessages = normalizeMessages(currentRow.mensajes_json);

    if (text) {
      currentMessages.push({
        sender,
        author: asesorNombre,
        text,
        timestamp: new Date().toISOString(),
      });
    } else if (nuevoEstado === 'resuelto') {
      currentMessages.push({
        sender: 'bot',
        author: 'Sistema WIN',
        text: `La atención ha sido marcada como resuelta por ${asesorNombre}.`,
        timestamp: new Date().toISOString(),
      });
    }

    const ultimoMensajePor =
      sender === 'agent' ? 'asesor' : sender === 'user' ? 'cliente' : 'bot';

    await pool.query(
      `UPDATE logs_chat
       SET estado_chat = ?,
           asesor_nombre = ?,
           ultimo_mensaje_por = ?,
           mensajes_json = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        nuevoEstado,
        asesorNombre,
        ultimoMensajePor,
        JSON.stringify(currentMessages),
        chatId,
      ]
    );

    res.json({
      ok: true,
      success: true,
      estado_chat: nuevoEstado,
      asesor_nombre: asesorNombre,
      ultimo_mensaje_por: ultimoMensajePor,
      mensajes: currentMessages,
    });
  })
);

export default router;
