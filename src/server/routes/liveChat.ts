import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../auth/middleware';

const router = Router();

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

/**
 * GET /api/chat-log/activos
 * Devuelve las sesiones de logs_chat priorizando 'esperando_asesor' y luego por updated_at DESC.
 * Si ?scope=todos se incluye también 'en_curso', 'iniciado' y 'resuelto' recientes.
 */
router.get(
  '/chat-log/activos',
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    const scope = String(req.query.scope || 'activos').toLowerCase();

    const whereClause =
      scope === 'todos'
        ? '1=1'
        : `LOWER(TRIM(estado_chat)) IN ('esperando_asesor', 'derivado a asesor', 'en_atencion', 'en atención', 'en_curso', 'en curso')`;

    const [rows]: any = await pool.query(
      `SELECT
         id,
         token,
         orden_id,
         codisegui,
         phone,
         grupo_servicio,
         motivo,
         estado_chat,
         asesor_nombre,
         ultimo_mensaje_por,
         mensajes_json,
         created_at,
         updated_at
       FROM logs_chat
       WHERE ${whereClause}
       ORDER BY
         CASE
           WHEN LOWER(TRIM(estado_chat)) IN ('esperando_asesor', 'derivado a asesor') THEN 0
           WHEN LOWER(TRIM(estado_chat)) IN ('en_atencion', 'en atención') THEN 1
           WHEN LOWER(TRIM(estado_chat)) IN ('en_curso', 'en curso') THEN 2
           ELSE 3
         END ASC,
         updated_at DESC
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

      return {
        id: Number(r.id),
        token: r.token || '',
        orden_id: String(r.orden_id || ''),
        codisegui: String(r.codisegui || ''),
        phone: String(r.phone || ''),
        grupo_servicio: String(r.grupo_servicio || 'General'),
        motivo: String(r.motivo || 'Consulta en Tracking'),
        estado_chat: estadoNorm,
        estado_original: r.estado_chat,
        asesor_nombre: r.asesor_nombre || null,
        ultimo_mensaje_por: String(ultimoPor).toLowerCase(),
        mensajes,
        created_at: r.created_at,
        updated_at: r.updated_at,
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
