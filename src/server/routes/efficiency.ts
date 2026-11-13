import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { buildStrictOrderTypeSql, cleanPartnerName, classifyOrderServiceType } from '../domain/index';
import { enforceRoleServiceScope } from '../auth/middleware';
import { getServicioToTipoMap, loadTipoServicioCacheIfNeeded } from '../services/matFunnel.sync';
import crypto from 'crypto';

const router = Router();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite').trim();

let schemaChecked = false;
async function ensureAuditSchema(): Promise<void> {
  if (schemaChecked) return;
  schemaChecked = true;
  try {
    await pool.query(
      `ALTER TABLE chat_ai_audits ADD COLUMN responsable_quiebre VARCHAR(30) NOT NULL DEFAULT 'NINGUNO'`
    );
  } catch {
    // Columna ya existe
  }
  try {
    await pool.query(
      `ALTER TABLE chat_ai_audits ADD COLUMN accion_recomendada VARCHAR(40) NOT NULL DEFAULT 'NO_ACCIONAR'`
    );
  } catch {
    // Columna ya existe
  }
}

export interface ParsedChatMessage {
  rol: 'CLIENTE' | 'ASESOR' | 'BOT';
  emisor: string;
  texto: string;
  fecha: string;
}

/**
 * Extrae y ordena cronológicamente los mensajes reales desde historial_chats_mantra y logs_chat.
 * Soporta los esquemas reales de BD_Phoenix ({ texto, emisor, rol, fecha_utc, orden }).
 */
export function parseChronologicalMessages(
  mantraRaw: any,
  logBotRaw: any
): { messages: ParsedChatMessage[]; hasMantra: boolean; hasBot: boolean } {
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

  const sortChronologically = (arr: any[]): any[] => {
    if (arr.length <= 1) return arr;
    const copy = [...arr];
    const firstDate = copy[0]?.fecha_utc ? Date.parse(String(copy[0].fecha_utc)) : NaN;
    const lastDate = copy[copy.length - 1]?.fecha_utc
      ? Date.parse(String(copy[copy.length - 1].fecha_utc))
      : NaN;

    if (!Number.isNaN(firstDate) && !Number.isNaN(lastDate)) {
      if (firstDate > lastDate) {
        return copy.reverse();
      }
      return copy;
    }
    return copy;
  };

  const botMsgs = sortChronologically(parseMsgArray(logBotRaw));
  const mantraMsgs = sortChronologically(parseMsgArray(mantraRaw));

  const messages: ParsedChatMessage[] = [];
  let hasBot = false;
  let hasMantra = false;

  for (const m of botMsgs.slice(-25)) {
    const txt = String(
      m.texto ?? m.text ?? m.body ?? m.mensaje ?? m.message ?? m.content ?? ''
    )
      .trim()
      .replace(/\s+/g, ' ');
    if (!txt) continue;
    hasBot = true;
    const rawSender = String(m.emisor ?? m.rol ?? m.sender ?? m.from ?? m.role ?? m.autor ?? 'BOT').toUpperCase();
    const rol: 'CLIENTE' | 'ASESOR' | 'BOT' =
      rawSender.includes('CLI') || rawSender.includes('USER') ? 'CLIENTE' : 'BOT';
    messages.push({
      rol,
      emisor: rol === 'CLIENTE' ? 'Cliente' : 'Asistente Virtual WIN',
      texto: txt,
      fecha: String(m.fecha_utc || m.timestamp || m.fecha || ''),
    });
  }

  for (const m of mantraMsgs.slice(-30)) {
    const txt = String(
      m.texto ?? m.text ?? m.body ?? m.mensaje ?? m.message ?? m.content ?? ''
    )
      .trim()
      .replace(/\s+/g, ' ');
    if (!txt) continue;
    hasMantra = true;
    const rawSender = String(
      m.emisor ?? m.rol ?? m.direction ?? m.from_me ?? m.sender ?? m.role ?? m.author ?? ''
    ).toUpperCase();
    const rol: 'CLIENTE' | 'ASESOR' | 'BOT' =
      rawSender === 'IN' ||
      rawSender === 'FALSE' ||
      rawSender.includes('CLI') ||
      rawSender.includes('USER')
        ? 'CLIENTE'
        : rawSender.includes('BOT') || rawSender.includes('ASISTENTE')
          ? 'BOT'
          : 'ASESOR';
    messages.push({
      rol,
      emisor:
        rol === 'CLIENTE'
          ? 'Cliente'
          : rol === 'BOT'
            ? 'Bot WIN'
            : String(m.agente || 'Asesor Mantra'),
      texto: txt,
      fecha: String(m.fecha_utc || m.timestamp || m.fecha || ''),
    });
  }

  return { messages, hasMantra, hasBot };
}

function extractCompactTranscript(
  mantraRaw: any,
  logBotRaw: any,
  motivoSos?: string | null,
  chatMeta?: { estadoChat?: string; semaforoSla?: string; turno?: string }
): {
  transcript: string;
  msgCount: number;
  fuente: 'MANTRA' | 'BOT_SOS' | 'AMBOS';
  hash: string;
} {
  const { messages, hasMantra, hasBot } = parseChronologicalMessages(mantraRaw, logBotRaw);
  const lines: string[] = [];

  if (motivoSos && String(motivoSos).trim()) {
    lines.push(`[MOTIVO_SOS_REPORTADO]: ${String(motivoSos).trim()}`);
  }
  if (chatMeta?.estadoChat || chatMeta?.semaforoSla || chatMeta?.turno) {
    lines.push(
      `[META_CANAL]: Estado_Chat=${chatMeta.estadoChat || '-'} | SLA=${chatMeta.semaforoSla || '-'} | Turno_Actual=${chatMeta.turno || '-'}`
    );
  }

  for (const msg of messages) {
    lines.push(`[${msg.rol}]: ${msg.texto.slice(0, 300)}`);
  }

  if (messages.length === 0) {
    lines.push('[SISTEMA]: Cliente pulsó botón SOS de soporte o seguimiento sin mensajes de texto adicionales.');
  }

  const transcript = lines.join('\n').slice(0, 4800);
  const msgCount = messages.length;
  const fuente: 'MANTRA' | 'BOT_SOS' | 'AMBOS' =
    hasMantra && hasBot ? 'AMBOS' : hasMantra ? 'MANTRA' : 'BOT_SOS';
  const hash = crypto.createHash('md5').update(transcript).digest('hex');

  return { transcript, msgCount, fuente, hash };
}

// GET /api/efficiency -> Obtiene KPIs, matriz de ataque, ranking por partner y listado de auditorías IA
router.get('/efficiency', async (req: Request, res: Response) => {
  try {
    await Promise.all([loadTipoServicioCacheIfNeeded(), ensureAuditSchema()]);

    const todayDefault = new Date().toLocaleDateString('en-CA');
    const {
      startDate = todayDefault,
      endDate = todayDefault,
      service: rawService = 'Todos los servicios',
      q = '',
      ignoreDates = 'false',
      soloSos = 'false',
    } = req.query as Record<string, string>;

    const service = enforceRoleServiceScope(req, rawService);
    const searchQ = String(q || '').trim();
    const isSoloSos = soloSos === 'true';

    // Aplicamos exactamente los mismos filtros base sobre mat_funnel_casos_360 (v) tanto para el universo como para los auditados
    const whereBase: string[] = [];
    const paramsBase: any[] = [];

    if (ignoreDates !== 'true') {
      whereBase.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
      paramsBase.push(startDate, endDate);
    }

    const srvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
    if (srvFilter.params.length > 0) {
      whereBase.push(srvFilter.sql);
      paramsBase.push(...srvFilter.params);
    }

    if (isSoloSos) {
      whereBase.push(`(
        UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE')
        OR lc.orden_id IS NOT NULL
      )`);
    }

    if (searchQ) {
      const likeQ = `%${searchQ}%`;
      whereBase.push(`(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.cliente LIKE ? OR
        v.telefono LIKE ? OR
        v.partner LIKE ? OR
        v.ops_partner LIKE ?
      )`);
      paramsBase.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereBaseSql = whereBase.length > 0 ? `WHERE ${whereBase.join(' AND ')}` : '';

    const [universeRes, auditRowsRes]: any = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(DISTINCT v.orden_id) AS total_chats_rango
        FROM mat_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        LEFT JOIN (SELECT DISTINCT orden_id FROM logs_chat) lc ON lc.orden_id = v.orden_id
        ${whereBaseSql ? `${whereBaseSql} AND` : 'WHERE'} (
          JSON_LENGTH(h.ultimos_mensajes_json) > 1
          OR lc.orden_id IS NOT NULL
          OR UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE')
        )
        `,
        paramsBase
      ),
      pool.query(
        `
        SELECT
          a.*,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_fmt,
          DATE_FORMAT(a.analyzed_at, '%d/%m %H:%i') AS analyzed_fmt,
          COALESCE(NULLIF(TRIM(v.cliente), ''), 'Cliente WIN') AS cliente,
          v.telefono,
          v.pulso_soporte,
          COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), a.tipo_operacion, 'OTROS') AS tipo_operacion_real,
          COALESCE(NULLIF(TRIM(v.ops_partner), ''), NULLIF(TRIM(v.partner), ''), a.partner, 'SIN PARTNER') AS partner_real,
          COALESCE(NULLIF(TRIM(v.ops_estado), ''), v.estado_ot, 'Sin estado') AS estado_ot,
          COALESCE(NULLIF(TRIM(v.ops_cuadrilla), ''), v.cuadrilla, 'SIN CUADRILLA') AS cuadrilla,
          h.estado_chat AS mantra_estado_chat,
          h.semaforo_sla AS mantra_sla,
          h.quien_tiene_la_palabra AS mantra_turno,
          h.ultimos_mensajes_json AS chat_json_mantra,
          lc.orden_id AS lc_orden_id,
          lc.motivo AS log_motivo_sos,
          lc.mensajes_json AS log_mensajes_json
        FROM chat_ai_audits a
        INNER JOIN mat_funnel_casos_360 v ON v.orden_id = a.orden_id
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        LEFT JOIN (
          SELECT l1.orden_id, l1.motivo, l1.mensajes_json
          FROM logs_chat l1
          INNER JOIN (SELECT orden_id, MAX(id) AS max_id FROM logs_chat GROUP BY orden_id) l2
            ON l1.id = l2.max_id
        ) lc ON lc.orden_id = v.orden_id
        ${whereBaseSql}
        ORDER BY a.severidad_score DESC, a.orden_id DESC
        LIMIT 500
        `,
        paramsBase
      ),
    ]);

    const totalChatsUniverse = Number(universeRes?.[0]?.[0]?.total_chats_rango || 0);
    const rawAudits: any[] = auditRowsRes?.[0] || [];
    const totalAudited = rawAudits.length;

    let resueltos = 0;
    let criticosOAltos = 0;
    let accionablesUrgentes = 0;
    let sumSeveridad = 0;
    let sumNotaAsesor = 0;
    let countNotaAsesor = 0;

    const byTipoSolicitudMap = new Map<string, number>();
    const byMotivoMap = new Map<
      string,
      { motivo: string; count: number; resueltos: number; criticos: number }
    >();
    const byAccionMap = new Map<
      string,
      { accion: string; count: number; criticos: number; pendientes: number }
    >();
    const byResponsableMap = new Map<
      string,
      { responsable: string; count: number; criticos: number }
    >();
    const byPartnerMap = new Map<
      string,
      {
        partner: string;
        total: number;
        criticos: number;
        incumplimiento_campo: number;
        resueltos: number;
        sumSeveridad: number;
      }
    >();

    const byGravedadMap: Record<string, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAJA: 0 };
    const byDesempenoMap: Record<string, number> = {
      CORRECTO: 0,
      MEJORABLE: 0,
      DEFICIENTE: 0,
      SOLO_BOT: 0,
    };

    const audits = rawAudits.map((a) => {
      const grav = String(a.gravedad || 'BAJA').toUpperCase();
      const resEst = String(a.estado_resolucion || '').toUpperCase();
      const des = String(a.desempeno_asesor || 'SOLO_BOT').toUpperCase();
      const tipoSol = String(a.tipo_solicitud || 'CONSULTA').toUpperCase();
      const mot = String(a.motivo_homologado || 'OTRO').toUpperCase();
      const respQuiebre = String(a.responsable_quiebre || 'NINGUNO').toUpperCase();
      const accionRec = String(a.accion_recomendada || 'NO_ACCIONAR').toUpperCase();
      const partnerClean = cleanPartnerName(a.partner_real || a.partner);
      const sev = Number(a.severidad_score || 1);
      const nota = Number(a.nota_asesor || 0);

      const isCritOrHigh = grav === 'CRITICA' || grav === 'ALTA';
      const isFieldBreach =
        mot === 'DEMORA_TECNICO' || mot === 'TECNICO_NO_LLEGO' || mot === 'PROBLEMA_INSTALACION';

      if (resEst === 'RESUELTO') resueltos++;
      if (isCritOrHigh) criticosOAltos++;
      if (accionRec !== 'NO_ACCIONAR' && resEst !== 'RESUELTO') accionablesUrgentes++;
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
      if (isCritOrHigh) mNode.criticos++;
      byMotivoMap.set(mot, mNode);

      const accNode = byAccionMap.get(accionRec) || {
        accion: accionRec,
        count: 0,
        criticos: 0,
        pendientes: 0,
      };
      accNode.count++;
      if (isCritOrHigh) accNode.criticos++;
      if (resEst !== 'RESUELTO') accNode.pendientes++;
      byAccionMap.set(accionRec, accNode);

      const respNode = byResponsableMap.get(respQuiebre) || {
        responsable: respQuiebre,
        count: 0,
        criticos: 0,
      };
      respNode.count++;
      if (isCritOrHigh) respNode.criticos++;
      byResponsableMap.set(respQuiebre, respNode);

      const pNode = byPartnerMap.get(partnerClean) || {
        partner: partnerClean,
        total: 0,
        criticos: 0,
        incumplimiento_campo: 0,
        resueltos: 0,
        sumSeveridad: 0,
      };
      pNode.total++;
      if (isCritOrHigh) pNode.criticos++;
      if (isFieldBreach) pNode.incumplimiento_campo++;
      if (resEst === 'RESUELTO') pNode.resueltos++;
      pNode.sumSeveridad += sev;
      byPartnerMap.set(partnerClean, pNode);

      const { messages } = parseChronologicalMessages(a.chat_json_mantra, a.log_mensajes_json);

      return {
        orden_id: a.orden_id,
        ticket: a.ticket,
        fecha_solicitud_dia: a.fecha_solicitud_dia,
        fecha_fmt: a.fecha_fmt,
        analyzed_fmt: a.analyzed_fmt,
        cliente: a.cliente,
        telefono: a.telefono,
        tipo_operacion: a.tipo_operacion_real || a.tipo_operacion,
        sector_operativo: a.sector_operativo,
        partner: partnerClean,
        cuadrilla: a.cuadrilla,
        estado_ot: a.estado_ot,
        fuente_chat: a.fuente_chat,
        num_mensajes: messages.length || a.num_mensajes,
        tipo_solicitud: tipoSol,
        motivo_homologado: mot,
        gravedad: grav,
        severidad_score: sev,
        estado_resolucion: resEst,
        desempeno_asesor: des,
        nota_asesor: a.nota_asesor,
        responsable_quiebre: respQuiebre,
        accion_recomendada: accionRec,
        resumen_ejecutivo: a.resumen_ejecutivo,
        mantra_estado_chat: a.mantra_estado_chat,
        mantra_sla: a.mantra_sla,
        mantra_turno: a.mantra_turno,
        log_motivo_sos: a.log_motivo_sos,
        pulso_soporte: a.pulso_soporte,
        es_sos:
          ['SI', 'SÍ', '1', 'TRUE'].includes(String(a.pulso_soporte || '').trim().toUpperCase()) ||
          Boolean(a.lc_orden_id) ||
          Boolean(a.log_motivo_sos),
        messages,
      };
    });

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
            ? Number(Math.min(100, (totalAudited / totalChatsUniverse) * 100).toFixed(1))
            : 0,
      },
      kpis: {
        total_auditados: totalAudited,
        tasa_resolucion_pct:
          totalAudited > 0 ? Number(((resueltos / totalAudited) * 100).toFixed(1)) : 0,
        resueltos,
        criticos_altos: criticosOAltos,
        criticos_pct:
          totalAudited > 0 ? Number(((criticosOAltos / totalAudited) * 100).toFixed(1)) : 0,
        accionables_urgentes: accionablesUrgentes,
        avg_severidad:
          totalAudited > 0 ? Number((sumSeveridad / totalAudited).toFixed(2)) : 0,
        avg_nota_asesor:
          countNotaAsesor > 0 ? Number((sumNotaAsesor / countNotaAsesor).toFixed(2)) : 0,
        asesores_evaluados: countNotaAsesor,
      },
      byTipoSolicitud: Array.from(byTipoSolicitudMap.entries())
        .map(([tipo, count]) => ({
          tipo,
          count,
          pct: totalAudited > 0 ? Number(((count / totalAudited) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.count - a.count),
      byMotivo: Array.from(byMotivoMap.values())
        .map((m) => ({
          ...m,
          pct: totalAudited > 0 ? Number(((m.count / totalAudited) * 100).toFixed(1)) : 0,
          resolucion_pct: m.count > 0 ? Number(((m.resueltos / m.count) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.count - a.count),
      byAccion: Array.from(byAccionMap.values())
        .map((ac) => ({
          ...ac,
          pct: totalAudited > 0 ? Number(((ac.count / totalAudited) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.count - a.count),
      byResponsable: Array.from(byResponsableMap.values())
        .map((r) => ({
          ...r,
          pct: totalAudited > 0 ? Number(((r.count / totalAudited) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.count - a.count),
      byPartner: Array.from(byPartnerMap.values())
        .map((p) => ({
          partner: p.partner,
          total: p.total,
          criticos: p.criticos,
          criticos_pct: p.total > 0 ? Number(((p.criticos / p.total) * 100).toFixed(1)) : 0,
          incumplimiento_campo: p.incumplimiento_campo,
          incumplimiento_pct:
            p.total > 0 ? Number(((p.incumplimiento_campo / p.total) * 100).toFixed(1)) : 0,
          resueltos: p.resueltos,
          resolucion_pct: p.total > 0 ? Number(((p.resueltos / p.total) * 100).toFixed(1)) : 0,
          avg_severidad: p.total > 0 ? Number((p.sumSeveridad / p.total).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.criticos - a.criticos || b.incumplimiento_campo - a.incumplimiento_campo || b.total - a.total),
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

// POST /api/efficiency/analyze-batch -> Audita con Gemini un lote de chats pendientes respetando todos los filtros
router.post('/efficiency/analyze-batch', async (req: Request, res: Response) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(400).json({
        ok: false,
        error: 'Configura GEMINI_API_KEY en tu archivo .env y reinicia el servidor.',
      });
    }

    await Promise.all([loadTipoServicioCacheIfNeeded(), ensureAuditSchema()]);

    const todayDefault = new Date().toLocaleDateString('en-CA');
    const startDate = String(req.body?.startDate || todayDefault).trim();
    const endDate = String(req.body?.endDate || todayDefault).trim();
    const rawService = String(req.body?.service || 'Todos los servicios').trim();
    const searchQ = String(req.body?.q || '').trim();
    const ignoreDates = Boolean(req.body?.ignoreDates);
    const forceReaudit = Boolean(req.body?.forceReaudit);
    const soloSos = Boolean(req.body?.soloSos);
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

    if (soloSos) {
      whereClauses.push(`(
        UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE')
        OR lc.orden_id IS NOT NULL
      )`);
    }

    if (searchQ) {
      const likeQ = `%${searchQ}%`;
      whereClauses.push(`(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.cliente LIKE ? OR
        v.telefono LIKE ? OR
        v.partner LIKE ? OR
        v.ops_partner LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `${whereClauses.join(' AND ')} AND` : '';
    const auditFilterClause = forceReaudit
      ? `AND (a.orden_id IS NULL OR a.tipo_solicitud = 'SIN_INTERACCION' OR a.responsable_quiebre = 'NINGUNO')`
      : `AND a.orden_id IS NULL`;

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
        h.estado_chat AS mantra_estado_chat,
        h.semaforo_sla AS mantra_sla,
        h.quien_tiene_la_palabra AS mantra_turno,
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
          JSON_LENGTH(h.ultimos_mensajes_json) > 1
          OR lc.orden_id IS NOT NULL
          OR UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE')
        )
        ${auditFilterClause}
      ORDER BY COALESCE(JSON_LENGTH(h.ultimos_mensajes_json), 0) DESC, (lc.mensajes_json IS NOT NULL) DESC, v.fecha_solicitud_dia DESC, v.orden_id DESC
      LIMIT ?
      `,
      [...params, batchSize]
    );

    const rows: any[] = candidates || [];
    if (rows.length === 0) {
      return res.json({
        ok: true,
        processed: 0,
        message: 'No hay chats pendientes por auditar con los filtros actuales.',
      });
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
            row.log_motivo_sos,
            {
              estadoChat: row.mantra_estado_chat,
              semaforoSla: row.mantra_sla,
              turno: row.mantra_turno,
            }
          );

          const aiResult = await classifyChatWithGemini(transcript, {
            servicio: row.tipo_operacion,
            estadoOt: row.estado_ot,
            partner: cleanPartnerName(row.partner_raw),
            sector: row.sector_operativo,
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
              desempeno_asesor, nota_asesor, responsable_quiebre, accion_recomendada,
              resumen_ejecutivo, model_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              responsable_quiebre = VALUES(responsable_quiebre),
              accion_recomendada = VALUES(accion_recomendada),
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
              String(aiResult.responsable_quiebre || 'NINGUNO').toUpperCase(),
              String(aiResult.accion_recomendada || 'NO_ACCIONAR').toUpperCase(),
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

async function classifyChatWithGemini(
  transcript: string,
  meta: { servicio: string; estadoOt: string; partner: string; sector: string }
) {
  if (!GEMINI_API_KEY) {
    throw new Error('Falta configurar GEMINI_API_KEY en el archivo .env');
  }

  const prompt = `Eres un Auditor Senior de Operaciones y Calidad de Atención de WIN Telecomunicaciones (Perú).
Analiza la conversación real en orden cronológico entre CLIENTE, BOT y ASESOR.
Contexto de la Orden: Servicio=${meta.servicio} | Estado_OT=${meta.estadoOt} | Partner_Campo=${meta.partner} | Sector=${meta.sector}.

Determina con precisión operativa:
1. tipo_solicitud: CONSULTA | DUDA | PROBLEMA | RECLAMO | REPROGRAMACION | SIN_INTERACCION (usa SIN_INTERACCION SOLO si no hay ningún mensaje del cliente ni motivo SOS).
2. motivo_homologado:
   - HORARIO_LLEGADA (pregunta hora de llegada o turno de visita)
   - DEMORA_TECNICO (técnico demora, fuera de rango horario o aún no se comunica)
   - TECNICO_NO_LLEGO (incumplimiento de visita programada o falsa visita)
   - CAMBIO_FECHA_CITA (cliente o empresa solicita reprogramar fecha/turno)
   - CONSULTA_ESTADO_OT (consulta estado de su orden o seguimiento)
   - PROBLEMA_INSTALACION (problema técnico, avería, cableado o equipos)
   - VALIDACION_DATOS_TECNICO (confirma identidad/datos de cuadrilla)
   - CANCELACION_SERVICIO (cliente solicita anular/cancelar el servicio o amenaza de baja)
   - SIN_RESPUESTA_CLIENTE (empresa/bot escribe pero el cliente no contesta)
   - OTRO
3. gravedad: BAJA | MEDIA | ALTA | CRITICA
4. severidad_score: entero 1 a 5 (1=consulta simple, 3=demora/reprogramación, 4=incumplimiento o mala atención, 5=reclamo grave o riesgo de cancelación).
5. estado_resolucion: RESUELTO | PARCIAL | NO_RESUELTO | EN_GESTION
6. desempeno_asesor: CORRECTO | MEJORABLE | DEFICIENTE | SOLO_BOT (usa SOLO_BOT únicamente si no participó ningún asesor humano).
7. nota_asesor: entero 1 a 5 (0 si desempeno_asesor es SOLO_BOT).
8. responsable_quiebre (A quién debemos atacar/corregir):
   - PARTNER_CAMPO: el técnico/contrata demoró, no llegó, reprogramó sin acuerdo o ejecutó mal la visita.
   - ASESOR_MANTRA: el asesor humano tardó en responder, dio respuestas plantilleras sin resolver o dejó en visto al cliente.
   - BOT_FLUJO: el bot no resolvió la necesidad del cliente y no hubo pase oportuno a humano.
   - CLIENTE: el cliente no tenía disponibilidad, no contestó o pidió cambio por motivo propio.
   - NINGUNO: consulta atendida en tiempo y forma sin quiebre.
9. accion_recomendada (Qué acción concreta ejecutar ahora):
   - ESCALAR_PARTNER: exigir a la contrata (${meta.partner}) atención/contacto inmediato en campo.
   - CONTACTAR_URGENTE: llamar o responder de inmediato al cliente desde Torre de Control.
   - REPROGRAMAR_VISITA: asegurar nueva fecha/rango horario confirmado en sistema.
   - RETENER_CANCELACION: activar retención inmediata por riesgo de baja/desistimiento.
   - MEJORAR_PROTOCOLO_ASESOR: retroalimentar al asesor por gestión incompleta o tardía.
   - NO_ACCIONAR: caso ya resuelto o meramente informativo.
10. resumen_ejecutivo: máximo 155 caracteres en español directo indicando qué pasó realmente y qué se debe hacer.

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
            responsable_quiebre: {
              type: 'STRING',
              enum: ['PARTNER_CAMPO', 'ASESOR_MANTRA', 'BOT_FLUJO', 'CLIENTE', 'NINGUNO'],
            },
            accion_recomendada: {
              type: 'STRING',
              enum: [
                'ESCALAR_PARTNER',
                'CONTACTAR_URGENTE',
                'REPROGRAMAR_VISITA',
                'RETENER_CANCELACION',
                'MEJORAR_PROTOCOLO_ASESOR',
                'NO_ACCIONAR',
              ],
            },
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
            'responsable_quiebre',
            'accion_recomendada',
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
