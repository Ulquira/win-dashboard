import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { cacheGet, cacheSet, queryCache } from '../config/cache';
import { buildStrictOrderTypeSql, homologarTipoServicio } from '../domain/index';
import { requireAuth, enforceRoleServiceScope } from '../auth/middleware';
import { getServicioToTipoMap } from '../services/matFunnel.sync';
import { loadTipoServicioCacheIfNeeded } from '../services/matFunnel.sync';

const router = Router();

// GET /api/tracking/search -> Endpoint de Búsqueda Paginada para Seguimiento
router.get('/tracking/search', async (req: Request, res: Response) => {
  try {
    await loadTipoServicioCacheIfNeeded();

    const todayIso = new Date().toLocaleDateString('en-CA');
    const rawStart = String(req.query.startDate || '').trim();
    const rawEnd = String(req.query.endDate || '').trim();

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : todayIso;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : todayIso;

    const rawService = String(req.query.service || '').trim();
    const rawZone = String(req.query.zone || '').trim();
    const service = enforceRoleServiceScope(
      req,
      !rawService || rawService === 'undefined' ? 'Todos los servicios' : rawService
    );
    const zone = !rawZone || rawZone === 'undefined' ? 'Todas las zonas' : rawZone;

    const q = String(req.query.q || '').trim();
    const ignoreDates = req.query.ignoreDates === 'true';
    const fEstadoChat = String(req.query.estadoChat || 'Todos');
    const fSla = String(req.query.sla || 'Todos');
    const fTurno = String(req.query.turno || 'Todos');
    const fSoloConChat = req.query.soloConChat === 'true';
    const fSoloSos = req.query.soloSos === 'true';
    const fSoloLogChat = req.query.soloLogChat === 'true';
    const refresh = req.query.refresh === 'true';

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const cacheKey = `trk_${startDate}_${endDate}_${service}_${zone}_${q}_${ignoreDates}_${fEstadoChat}_${fSla}_${fTurno}_${fSoloConChat}_${fSoloSos}_${fSoloLogChat}_${page}_${pageSize}`;
    if (!refresh) {
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json(cached);
    } else {
      await syncMatFunnelIncremental(startDate, endDate);
    }

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (!ignoreDates) {
      whereClauses.push('v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?');
      params.push(startDate, endDate);
    }

    const trkSrvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
    if (trkSrvFilter.params.length > 0) {
      whereClauses.push(trkSrvFilter.sql);
      params.push(...trkSrvFilter.params);
    }

    if (zone !== 'Todas las zonas') {
      whereClauses.push('(v.sector_operativo = ? OR v.distrito = ?)');
      params.push(zone, zone);
    }

    if (fSoloLogChat) {
      whereClauses.push('lc.orden_id IS NOT NULL');
    } else if (fSoloSos) {
      whereClauses.push("(UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE') OR lc.orden_id IS NOT NULL)");
    } else if (fSoloConChat) {
      whereClauses.push('(h.orden_id IS NOT NULL OR h.phone IS NOT NULL OR lc.orden_id IS NOT NULL)');
    }

    if (fEstadoChat !== 'Todos') {
      whereClauses.push("UPPER(COALESCE(h.estado_chat, '')) = ?");
      params.push(fEstadoChat.toUpperCase());
    }

    if (fSla !== 'Todos') {
      whereClauses.push("UPPER(COALESCE(h.semaforo_sla, '')) LIKE ?");
      params.push(`%${fSla.toUpperCase()}%`);
    }

    if (fTurno !== 'Todos') {
      const tUpper = fTurno.toUpperCase();
      if (tUpper === 'BOT') {
        whereClauses.push("(UPPER(COALESCE(h.quien_tiene_la_palabra, 'BOT')) LIKE '%BOT%' OR lc.orden_id IS NOT NULL)");
      } else {
        whereClauses.push("UPPER(COALESCE(h.quien_tiene_la_palabra, '')) LIKE ?");
        params.push(`%${tUpper}%`);
      }
    }

    if (q) {
      const likeQ = `%${q}%`;
      whereClauses.push(`(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.cliente LIKE ? OR
        v.telefono LIKE ? OR
        h.phone LIKE ? OR
        v.ops_num_doc LIKE ? OR
        v.ops_codi_segui_clien LIKE ? OR
        v.ops_cuadrilla LIKE ? OR
        v.cuadrilla LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const logsChatLightJoin = `
      LEFT JOIN (
        SELECT orden_id, MAX(id) AS max_id
        FROM logs_chat
        GROUP BY orden_id
      ) lc ON lc.orden_id = v.orden_id
    `;

    const needsLogsChatInCount = fSoloLogChat || fSoloSos || fSoloConChat || fTurno.toUpperCase() === 'BOT';
    const countLogsChatJoin = needsLogsChatInCount ? logsChatLightJoin : '';
    const countCacheKey = `trk_cnt_${startDate}_${endDate}_${service}_${zone}_${q}_${ignoreDates}_${fEstadoChat}_${fSla}_${fTurno}_${fSoloConChat}_${fSoloSos}_${fSoloLogChat}`;
    const cachedTotal = !refresh ? queryCache.get<number>(countCacheKey) : undefined;

    const [total, pageIdsResult]: [number, any] = await Promise.all([
      typeof cachedTotal === 'number'
        ? Promise.resolve(cachedTotal)
        : pool
            .query(
              `
              SELECT COUNT(*) AS total
              FROM mat_funnel_casos_360 v
              LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
              ${countLogsChatJoin}
              ${whereSql}
              `,
              params
            )
            .then(([r]: any) => {
              const c = Number(r?.[0]?.total || 0);
              queryCache.set(countCacheKey, c, 60);
              return c;
            }),
      pool.query(
        `
        SELECT v.orden_id, lc.max_id AS log_chat_id
        FROM mat_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        ${logsChatLightJoin}
        ${whereSql}
        ORDER BY (lc.max_id IS NOT NULL) DESC, (h.orden_id IS NOT NULL) DESC, v.orden_id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    const pageItems: { orden_id: number; log_chat_id: number | null }[] = pageIdsResult?.[0] || [];
    let rowsResult: any = [[]];

    if (pageItems.length > 0) {
      const idList = pageItems.map((x) => x.orden_id);
      const idPlaceholders = idList.map(() => '?').join(',');
      rowsResult = await pool.query(
        `
        SELECT 
          v.*,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_solicitud_fmt,
          COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), NULLIF(TRIM(v.producto), ''), 'OTROS') AS servicio_tipo,
          w.\`Número Documento\` AS numero_documento,
          w.\`Tipo Documento\` AS tipo_documento,
          w.CodiSeguiClien AS codi_segui_clien,
          w.CodiClien AS codi_clien,
          w.CodiSegui AS codi_segui_ot,
          w.Cuadrilla AS cuadrilla_completa,
          w.Proveedeor AS proveedor_ot,
          w.Tipo AS segmento_cliente,
          w.Provincia AS provincia_cliente,
          w.\`Motivo Trabajo\` AS motivo_trabajo,
          w.Direccion AS direccion_cliente,
          w.IdenServi AS plan_contratado,
          h.phone AS mantra_phone,
          h.estado_chat,
          h.semaforo_sla,
          h.quien_tiene_la_palabra,
          h.ultimos_mensajes_json AS chat_json_mantra,
          lc.id AS log_chat_id,
          lc.token AS log_chat_token,
          lc.grupo_servicio AS log_grupo_servicio,
          lc.motivo AS log_motivo_sos,
          lc.estado_chat AS log_estado_chat,
          lc.asesor_nombre AS log_asesor_nombre,
          lc.ultimo_mensaje_por AS log_ultimo_mensaje_por,
          lc.mensajes_json AS log_mensajes_json,
          lc.updated_at AS log_updated_at
        FROM mat_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        LEFT JOIN (
          SELECT l1.id, l1.orden_id, l1.token, l1.grupo_servicio, l1.motivo, l1.estado_chat, l1.asesor_nombre, l1.ultimo_mensaje_por, l1.mensajes_json, l1.updated_at
          FROM logs_chat l1
          INNER JOIN (
            SELECT orden_id, MAX(id) AS max_id
            FROM logs_chat
            WHERE orden_id IN (${idPlaceholders})
            GROUP BY orden_id
          ) l2 ON l1.id = l2.max_id
        ) lc ON lc.orden_id = v.orden_id
        WHERE v.orden_id IN (${idPlaceholders})
        ORDER BY FIELD(v.orden_id, ${idPlaceholders})
        `,
        [...idList, ...idList, ...idList]
      );
    }

    const rows = (rowsResult?.[0] || []).map((r: any) => ({
      ...r,
      servicio_tipo:
        getServicioToTipoMap().get(String(r.producto || '').trim().toUpperCase()) ||
        homologarTipoServicio(String(r.servicio_tipo || '')) ||
        r.servicio_tipo,
      ultimos_mensajes_json: r.chat_json_mantra || r.ultimos_mensajes_json || null,
    }));

    const payload = {
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      orders: rows,
    };

    await cacheSet(cacheKey, payload, 45);
    return res.json(payload);
  } catch (error: any) {
    console.error('❌ Error en /api/tracking/search:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

async function syncMatFunnelIncremental(startDate: string, endDate: string): Promise<void> {
  const { syncMatFunnelIncremental } = await import('../services/matFunnel.sync');
  await syncMatFunnelIncremental(startDate, endDate);
}

export default router;
