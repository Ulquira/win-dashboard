import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { buildStrictOrderTypeSql, cleanPartnerName, classifyOrderServiceType } from '../domain/index';
import { requireAuth, enforceRoleServiceScope } from '../auth/middleware';
import { getServicioToTipoMap } from '../services/matFunnel.sync';
import { loadTipoServicioCacheIfNeeded } from '../services/matFunnel.sync';
import crypto from 'crypto';

const router = Router();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite').trim();

// GET /api/efficiency -> Obtiene KPIs, cobertura y listado de auditorías IA
router.get('/efficiency', async (req: Request, res: Response) => {
  try {
    const todayDefault = new Date().toLocaleDateString('en-CA');
    const {
      startDate = todayDefault,
      endDate = todayDefault,
      service: rawService = 'Todos los servicios',
      q = '',
      ignoreDates = 'false',
    } = req.query as Record<string, string>;

    const service = enforceRoleServiceScope(req, rawService);
    const searchQ = String(q || '').trim();

    const whereAudit: string[] = [];
    const paramsAudit: any[] = [];
    const whereUniverse: string[] = [];
    const paramsUniverse: any[] = [];

    if (ignoreDates !== 'true') {
      whereAudit.push(`a.fecha_solicitud_dia >= ? AND a.fecha_solicitud_dia <= ?`);
      paramsAudit.push(startDate, endDate);

      whereUniverse.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
      paramsUniverse.push(startDate, endDate);
    }

    const srvAuditFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'a.tipo_operacion');
    if (srvAuditFilter.params.length > 0) {
      whereAudit.push(srvAuditFilter.sql);
      paramsAudit.push(...srvAuditFilter.params);
    }

    const srvUnivFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
    if (srvUnivFilter.params.length > 0) {
      whereUniverse.push(srvUnivFilter.sql);
      paramsUniverse.push(...srvUnivFilter.params);
    }

    if (searchQ) {
      const likeQ = `%${searchQ}%`;
      whereAudit.push(`(
        CAST(a.orden_id AS CHAR) LIKE ? OR
        a.ticket LIKE ? OR
        a.resumen_ejecutivo LIKE ? OR
        a.motivo_homologado LIKE ? OR
        a.partner LIKE ?
      )`);
      paramsAudit.push(likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereAuditSql = whereAudit.length > 0 ? `WHERE ${whereAudit.join(' AND ')}` : '';
    const whereUnivSql = whereUniverse.length > 0 ? `WHERE ${whereUniverse.join(' AND ')}` : '';

    const [universeRes, auditRowsRes]: any = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(DISTINCT v.orden_id) AS total_chats_rango
        FROM mat_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        LEFT JOIN (SELECT DISTINCT orden_id FROM logs_chat) lc ON lc.orden_id = v.orden_id
        ${whereUnivSql ? `${whereUnivSql} AND` : 'WHERE'} (
          h.orden_id IS NOT NULL
          OR lc.orden_id IS NOT NULL
          OR UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE')
        )
        `,
        paramsUniverse
      ),
      pool.query(
        `
        SELECT
          a.*,
          DATE_FORMAT(a.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_fmt,
          DATE_FORMAT(a.analyzed_at, '%d/%m %H:%i') AS analyzed_fmt,
          COALESCE(NULLIF(TRIM(v.cliente), ''), 'Cliente WIN') AS cliente,
          v.telefono,
          COALESCE(NULLIF(TRIM(v.ops_estado), ''), v.estado_ot, 'Sin estado') AS estado_ot,
          COALESCE(NULLIF(TRIM(v.ops_cuadrilla), ''), v.cuadrilla, 'SIN CUADRILLA') AS cuadrilla
        FROM chat_ai_audits a
        LEFT JOIN mat_funnel_casos_360 v ON v.orden_id = a.orden_id
        ${whereAuditSql}
        ORDER BY a.severidad_score DESC, a.orden_id DESC
        LIMIT 500
        `,
        paramsAudit
      ),
    ]);

    const totalChatsUniverse = Number(universeRes?.[0]?.[0]?.total_chats_rango || 0);
    const audits: any[] = auditRowsRes?.[0] || [];
    const totalAudited = audits.length;

    let resueltos = 0;
    let criticosOAltos = 0;
    let sumSeveridad = 0;
    let sumNotaAsesor = 0;
    let countNotaAsesor = 0;

    const byTipoSolicitudMap = new Map<string, number>();
    const byMotivoMap = new Map<string, { motivo: string; count: number; resueltos: number; criticos: number }>();
    const byGravedadMap: Record<string, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAJA: 0 };
    const byDesempenoMap: Record<string, number> = { CORRECTO: 0, MEJORABLE: 0, DEFICIENTE: 0, SOLO_BOT: 0 };

    for (const a of audits) {
      const grav = String(a.gravedad || 'BAJA').toUpperCase();
      const resEst = String(a.estado_resolucion || '').toUpperCase();
      const des = String(a.desempeno_asesor || 'SOLO_BOT').toUpperCase();
      const tipoSol = String(a.tipo_solicitud || 'CONSULTA').toUpperCase();
      const mot = String(a.motivo_homologado || 'OTRO').toUpperCase();
      const sev = Number(a.severidad_score || 1);
      const nota = Number(a.nota_asesor || 0);

      if (resEst === 'RESUELTO') resueltos++;
      if (grav === 'CRITICA' || grav === 'ALTA') criticosOAltos++;
      sumSeveridad += sev;

      if (nota >= 1 && nota <= 5 && des !== 'SOLO_BOT') {
        sumNotaAsesor += nota;
        countNotaAsesor++;
      }

      byTipoSolicitudMap.set(tipoSol, (byTipoSolicitudMap.get(tipoSol) || 0) + 1);
      if (byGravedadMap[grav] !== undefined) byGravedadMap[grav]++;
      if (byDesempenoMap[des] !== undefined) byDesempenoMap[des]++;

      const mNode = byMotivoMap.get(mot) || { motivo: mot, count: 0, resueltos: 0, criticos: 0 };
      mNode.count++;
      if (resEst === 'RESUELTO') mNode.resueltos++;
      if (grav === 'CRITICA' || grav === 'ALTA') mNode.criticos++;
      byMotivoMap.set(mot, mNode);
    }

    return res.json({
      ok: true,
      hasApiKey: Boolean(GEMINI_API_KEY),
      model: GEMINI_MODEL,
      coverage: {
        total_chats_rango: Math.max(totalChatsUniverse, totalAudited),
        total_auditados: totalAudited,
        pendientes: Math.max(0, totalChatsUniverse - totalAudited),
        cobertura_pct:
          totalChatsUniverse > 0
            ? Number((Math.min(100, (totalAudited / totalChatsUniverse) * 100)).toFixed(1))
            : 0,
      },
      kpis: {
        total_auditados: totalAudited,
        tasa_resolucion_pct: totalAudited > 0 ? Number(((resueltos / totalAudited) * 100).toFixed(1)) : 0,
        resueltos,
        criticos_altos: criticosOAltos,
        criticos_pct: totalAudited > 0 ? Number(((criticosOAltos / totalAudited) * 100).toFixed(1)) : 0,
        avg_severidad: totalAudited > 0 ? Number((sumSeveridad / totalAudited).toFixed(2)) : 0,
        avg_nota_asesor: countNotaAsesor > 0 ? Number((sumNotaAsesor / countNotaAsesor).toFixed(2)) : 0,
        asesores_evaluados: countNotaAsesor,
      },
      byTipoSolicitud: Array.from(byTipoSolicitudMap.entries())
        .map(([tipo, count]) => ({
          tipo,
          count,
          pct: totalAudited > 0 ? Number(((count / totalAudited) * 100).toFixed(1)) : 0,
        }))
        .sort((a: any, b: any) => b.count - a.count),
      byMotivo: Array.from(byMotivoMap.values())
        .map((m) => ({
          ...m,
          pct: totalAudited > 0 ? Number(((m.count / totalAudited) * 100).toFixed(1)) : 0,
          resolucion_pct: m.count > 0 ? Number(((m.resueltos / m.count) * 100).toFixed(1)) : 0,
        }))
        .sort((a: any, b: any) => b.count - a.count),
      byGravedad: Object.entries(byGravedadMap).map(([gravedad, count]) => ({
        gravedad,
        count,
        pct: totalAudited > 0 ? Number(((count / totalAudited) * 100).toFixed(1)) : 0,
      })),
      byDesempeno: Object.entries(byDesempenoMap).map(([desempeno, count]) => ({
        desempeno,
        count,
        pct: totalAudited > 0 ? Number(((count / totalAudited) * 100).toFixed(1)) : 0,
      })),
      audits,
    });
  } catch (err: any) {
    console.error('❌ Error en /api/efficiency:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/efficiency/analyze-batch -> Audita con Gemini un lote de chats pendientes
router.post('/efficiency/analyze-batch', async (req: Request, res: Response) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(400).json({
        ok: false,
        error: 'Configura GEMINI_API_KEY en tu archivo .env y reinicia el servidor.',
      });
    }

    const todayDefault = new Date().toLocaleDateString('en-CA');
    const startDate = String(req.body?.startDate || todayDefault).trim();
    const endDate = String(req.body?.endDate || todayDefault).trim();
    const rawService = String(req.body?.service || 'Todos los servicios').trim();
    const ignoreDates = Boolean(req.body?.ignoreDates);
    const batchSize = Math.min(30, Math.max(5, Number(req.body?.batchSize) || 15));

    const service = enforceRoleServiceScope(req, rawService);

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (!ignoreDates) {
      whereClauses.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
      params.push(startDate, endDate);
    }

    const srvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
    if (srvFilter.params.length > 0) {
      whereClauses.push(srvFilter.sql);
      params.push(...srvFilter.params);
    }

    const whereSql = whereClauses.length > 0 ? `${whereClauses.join(' AND ')} AND` : '';

    const [candidates]: any = await pool.query(
      `
      SELECT
        v.orden_id,
        v.ticket,
        DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS fecha_solicitud_dia,
        COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), 'OTROS') AS tipo_operacion,
        COALESCE(NULLIF(TRIM(v.sector_operativo), ''), 'SIN SECTOR') AS sector_operativo,
        COALESCE(NULLIF(TRIM(v.ops_partner), ''), NULLIF(TRIM(v.partner), ''), 'SIN PARTNER') AS partner_raw,
        COALESCE(NULLIF(TRIM(v.ops_estado), ''), v.estado_ot, 'Sin estado') AS estado_ot,
        h.ultimos_mensajes_json AS chat_json_mantra,
        lc.mensajes_json AS log_mensajes_json,
        lc.motivo AS log_motivo_sos
      FROM mat_funnel_casos_360 v
      LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
      LEFT JOIN (
        SELECT l1.orden_id, l1.motivo, l1.mensajes_json
        FROM logs_chat l1
        INNER JOIN (SELECT orden_id, MAX(id) AS max_id FROM logs_chat GROUP BY orden_id) l2
          ON l1.id = l2.max_id
      ) lc ON lc.orden_id = v.orden_id
      LEFT JOIN chat_ai_audits a ON a.orden_id = v.orden_id
      WHERE ${whereSql}
        (
          h.orden_id IS NOT NULL
          OR lc.orden_id IS NOT NULL
          OR UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE')
        )
        AND a.orden_id IS NULL
      ORDER BY v.fecha_solicitud_dia DESC, v.orden_id DESC
      LIMIT ?
      `,
      [...params, batchSize]
    );

    const rows: any[] = candidates || [];
    if (rows.length === 0) {
      return res.json({ ok: true, processed: 0, message: 'No hay chats pendientes por auditar en este rango.' });
    }

    let processed = 0;
    const CONCURRENCY = 5;

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (row) => {
          const { transcript, msgCount, fuente, hash } = extractCompactTranscript(
            row.chat_json_mantra,
            row.log_mensajes_json,
            row.log_motivo_sos
          );

          const aiResult = await classifyChatWithGemini(transcript, {
            servicio: row.tipo_operacion,
            estadoOt: row.estado_ot,
          });

          const notaAsesor =
            aiResult.desempeno_asesor === 'SOLO_BOT' || !aiResult.nota_asesor
              ? null
              : Math.min(5, Math.max(1, Number(aiResult.nota_asesor)));

          await pool.query(
            `
            INSERT INTO chat_ai_audits (
              orden_id, ticket, fecha_solicitud_dia, tipo_operacion, sector_operativo,
              partner, fuente_chat, num_mensajes, hash_mensajes, tipo_solicitud,
              motivo_homologado, gravedad, severidad_score, estado_resolucion,
              desempeno_asesor, nota_asesor, resumen_ejecutivo, model_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              fuente_chat = VALUES(fuente_chat),
              num_mensajes = VALUES(num_mensajes),
              hash_mensajes = VALUES(hash_mensajes),
              tipo_solicitud = VALUES(tipo_solicitud),
              motivo_homologado = VALUES(motivo_homologado),
              gravedad = VALUES(gravedad),
              severidad_score = VALUES(severidad_score),
              estado_resolucion = VALUES(estado_resolucion),
              desempeno_asesor = VALUES(desempeno_asesor),
              nota_asesor = VALUES(nota_asesor),
              resumen_ejecutivo = VALUES(resumen_ejecutivo),
              model_version = VALUES(model_version)
            `,
            [
              row.orden_id,
              row.ticket || null,
              row.fecha_solicitud_dia,
              classifyOrderServiceType(row.tipo_operacion, row.tipo_operacion),
              row.sector_operativo,
              cleanPartnerName(row.partner_raw),
              fuente,
              msgCount,
              hash,
              String(aiResult.tipo_solicitud || 'CONSULTA').toUpperCase(),
              String(aiResult.motivo_homologado || 'OTRO').toUpperCase(),
              String(aiResult.gravedad || 'BAJA').toUpperCase(),
              Math.min(5, Math.max(1, Number(aiResult.severidad_score || 1))),
              String(aiResult.estado_resolucion || 'EN_GESTION').toUpperCase(),
              String(aiResult.desempeno_asesor || 'SOLO_BOT').toUpperCase(),
              notaAsesor,
              String(aiResult.resumen_ejecutivo || 'Sin resumen').slice(0, 250),
              GEMINI_MODEL,
            ]
          );
          processed++;
        })
      );
    }

    return res.json({ ok: true, processed, batchTotal: rows.length });
  } catch (err: any) {
    console.error('❌ Error en /api/efficiency/analyze-batch:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

function extractCompactTranscript(mantraRaw: any, logBotRaw: any, motivoSos?: string | null): {
  transcript: string;
  msgCount: number;
  fuente: 'MANTRA' | 'BOT_SOS' | 'AMBOS';
  hash: string;
} {
  const lines: string[] = [];
  let hasMantra = false;
  let hasBot = false;

  const parseMsgArray = (raw: any): any[] => {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.messages)) return parsed.messages;
    } catch {
      // Ignorar JSON malformado
    }
    return [];
  };

  const botMsgs = parseMsgArray(logBotRaw);
  const mantraMsgs = parseMsgArray(mantraRaw);

  if (motivoSos && String(motivoSos).trim()) {
    lines.push(`[MOTIVO_SOS]: ${String(motivoSos).trim()}`);
  }

  for (const m of botMsgs.slice(-25)) {
    const txt = String(m.text || m.body || m.mensaje || m.content || '').trim().replace(/\s+/g, ' ');
    if (!txt) continue;
    hasBot = true;
    const sender = String(m.sender || m.from || m.role || m.autor || 'BOT').toUpperCase();
    const rol = sender.includes('USER') || sender.includes('CLI') ? 'CLIENTE' : 'BOT';
    lines.push(`[${rol}]: ${txt.slice(0, 280)}`);
  }

  for (const m of mantraMsgs.slice(-30)) {
    const txt = String(m.text || m.body || m.mensaje || m.message || m.content || '').trim().replace(/\s+/g, ' ');
    if (!txt) continue;
    hasMantra = true;
    const dir = String(m.direction || m.from_me || m.sender || m.role || m.author || '').toUpperCase();
    const rol =
      dir === 'IN' || dir === 'FALSE' || dir.includes('CLI') || dir.includes('USER')
        ? 'CLIENTE'
        : dir.includes('BOT')
          ? 'BOT'
          : 'ASESOR';
    lines.push(`[${rol}]: ${txt.slice(0, 280)}`);
  }

  if (lines.length === 0) {
    lines.push('[SISTEMA]: Cliente registró interacción de soporte / seguimiento en el canal.');
  }

  const transcript = lines.join('\n').slice(0, 4500);
  const msgCount = Math.max(1, botMsgs.length + mantraMsgs.length);
  const fuente: 'MANTRA' | 'BOT_SOS' | 'AMBOS' =
    hasMantra && hasBot ? 'AMBOS' : hasMantra ? 'MANTRA' : 'BOT_SOS';
  const hash = crypto.createHash('md5').update(transcript).digest('hex');

  return { transcript, msgCount, fuente, hash };
}

async function classifyChatWithGemini(transcript: string, meta: { servicio: string; estadoOt: string }) {
  if (!GEMINI_API_KEY) {
    throw new Error('Falta configurar GEMINI_API_KEY en el archivo .env');
  }

  const prompt = `Analiza esta conversación de atención al cliente de telecomunicaciones (WIN en Ruta - Perú).
Contexto OT: Servicio=${meta.servicio}, Estado_OT=${meta.estadoOt}.

Reglas de clasificación:
- tipo_solicitud: CONSULTA | DUDA | PROBLEMA | RECLAMO | REPROGRAMACION | SIN_INTERACCION
- motivo_homologado:
  * HORARIO_LLEGADA (pregunta a qué hora llega el técnico o ventana horaria)
  * DEMORA_TECNICO (técnico tarda o venció rango horario)
  * TECNICO_NO_LLEGO (incumplimiento de visita)
  * CAMBIO_FECHA_CITA (solicita reprogramar día/turno)
  * CONSULTA_ESTADO_OT (consulta general sobre su orden)
  * PROBLEMA_INSTALACION (problema técnico, cableado, equipos o avería)
  * VALIDACION_DATOS_TECNICO (confirma identidad/placa/datos de cuadrilla)
  * CANCELACION_SERVICIO (pide anular o cancelar orden)
  * SIN_RESPUESTA_CLIENTE (solo mensajes salientes sin respuesta del cliente)
  * OTRO
- gravedad: BAJA | MEDIA | ALTA | CRITICA
- severidad_score: entero 1 a 5 (1=consulta simple, 5=reclamo crítico o riesgo de cancelación)
- estado_resolucion: RESUELTO | PARCIAL | NO_RESUELTO | EN_GESTION
- desempeno_asesor: CORRECTO | MEJORABLE | DEFICIENTE | SOLO_BOT
- nota_asesor: entero 1 a 5 (0 si desempeno_asesor es SOLO_BOT)
- resumen_ejecutivo: máximo 140 caracteres en español explicando qué solicitó el cliente y qué respuesta recibió.

Conversación:
${transcript}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            tipo_solicitud: {
              type: 'STRING',
              enum: ['CONSULTA', 'DUDA', 'PROBLEMA', 'RECLAMO', 'REPROGRAMACION', 'SIN_INTERACCION'],
            },
            motivo_homologado: {
              type: 'STRING',
              enum: [
                'HORARIO_LLEGADA',
                'DEMORA_TECNICO',
                'TECNICO_NO_LLEGO',
                'CAMBIO_FECHA_CITA',
                'CONSULTA_ESTADO_OT',
                'PROBLEMA_INSTALACION',
                'VALIDACION_DATOS_TECNICO',
                'CANCELACION_SERVICIO',
                'SIN_RESPUESTA_CLIENTE',
                'OTRO',
              ],
            },
            gravedad: {
              type: 'STRING',
              enum: ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'],
            },
            severidad_score: { type: 'INTEGER' },
            estado_resolucion: {
              type: 'STRING',
              enum: ['RESUELTO', 'PARCIAL', 'NO_RESUELTO', 'EN_GESTION'],
            },
            desempeno_asesor: {
              type: 'STRING',
              enum: ['CORRECTO', 'MEJORABLE', 'DEFICIENTE', 'SOLO_BOT'],
            },
            nota_asesor: { type: 'INTEGER' },
            resumen_ejecutivo: { type: 'STRING' },
          },
          required: [
            'tipo_solicitud',
            'motivo_homologado',
            'gravedad',
            'severidad_score',
            'estado_resolucion',
            'desempeno_asesor',
            'nota_asesor',
            'resumen_ejecutivo',
          ],
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data: any = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(rawText);
}

export default router;
