import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { queryCache, cacheGet, cacheSet } from '../config/cache';
import { buildStrictOrderTypeSql, classifyOrderServiceType } from '../domain/index';
import { requireAuth, enforceRoleServiceScope } from '../auth/middleware';
import { getServicioToTipoMap, resolveProductosFromServiceFilter } from '../services/matFunnel.sync';

const router = Router();

// GET /api/orders/search -> Endpoint de Búsqueda Paginada de Órdenes
router.get('/orders/search', async (req: Request, res: Response) => {
  try {
    await loadTipoServicioCacheIfNeeded();

    const todayIso = new Date().toLocaleDateString('en-CA');
    const rawStart = String(req.query.startDate || '').trim();
    const rawEnd = String(req.query.endDate || '').trim();

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : todayIso;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : todayIso;

    const service = enforceRoleServiceScope(req, String(req.query.service || 'Todos los servicios').trim());
    const q = String(req.query.q || '').trim();
    const ignoreDates = req.query.ignoreDates === 'true';

    const fOrden = String(req.query.orden || '').trim();
    const fCliente = String(req.query.cliente || '').trim();
    const fOperacion = String(req.query.operacion || 'Todos').trim();
    const fSector = String(req.query.sector || 'Todos').trim();
    const fPartner = String(req.query.partner || 'Todos').trim();
    const fEstadoOt = String(req.query.estadoOt || 'Todos').trim();
    const fWsp = String(req.query.wsp || 'Todos').trim();
    const fTracking = String(req.query.tracking || 'Todos').trim();

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (!ignoreDates) {
      whereClauses.push('v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?');
      params.push(startDate, endDate);
    }

    const ordSrvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
    if (ordSrvFilter.params.length > 0) {
      whereClauses.push(ordSrvFilter.sql);
      params.push(...ordSrvFilter.params);
    }

    if (fOrden) {
      const likeOrd = `%${fOrden}%`;
      whereClauses.push(`(CAST(v.orden_id AS CHAR) LIKE ? OR v.ticket LIKE ?)`);
      params.push(likeOrd, likeOrd);
    }

    if (fCliente) {
      const likeCli = `%${fCliente}%`;
      whereClauses.push(
        `(v.cliente LIKE ? OR v.telefono LIKE ? OR v.ops_num_doc LIKE ? OR v.ops_codi_segui_clien LIKE ? OR v.ops_codi_clien LIKE ?)`
      );
      params.push(likeCli, likeCli, likeCli, likeCli, likeCli);
    }

    if (fOperacion && fOperacion !== 'Todos') {
      const opFilter = buildStrictOrderTypeSql(fOperacion, getServicioToTipoMap(), 'v.tipo_operacion');
      if (opFilter.params.length > 0) {
        whereClauses.push(opFilter.sql);
        params.push(...opFilter.params);
      }
    }

    if (fSector && fSector !== 'Todos') {
      const secItems = fSector.split(',').map((s) => s.trim()).filter(Boolean);
      if (secItems.length > 0) {
        const ph = secItems.map(() => '?').join(',');
        whereClauses.push(`COALESCE(NULLIF(TRIM(v.sector_operativo), ''), 'SIN SECTOR') IN (${ph})`);
        params.push(...secItems);
      }
    }

    if (fPartner && fPartner !== 'Todos') {
      const partItems = fPartner.split(',').map((s) => s.trim()).filter(Boolean);
      if (partItems.length > 0) {
        const ph = partItems.map(() => '?').join(',');
        whereClauses.push(`COALESCE(NULLIF(TRIM(v.partner), ''), NULLIF(TRIM(v.ops_partner), ''), 'SIN PARTNER') IN (${ph})`);
        params.push(...partItems);
      }
    }

    if (fEstadoOt && fEstadoOt !== 'Todos') {
      const estItems = fEstadoOt.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (estItems.length > 0) {
        const ph = estItems.map(() => '?').join(',');
        whereClauses.push(`UPPER(TRIM(COALESCE(v.estado_ot, ''))) IN (${ph})`);
        params.push(...estItems);
      }
    }

    if (fWsp && fWsp !== 'Todos') {
      const wspItems = fWsp.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const rawStates: string[] = [];
      let includeNoEnviado = false;

      for (const item of wspItems) {
        if (item === 'LEÍDO' || item === 'LEIDO' || item === 'READ') rawStates.push('read');
        else if (item === 'ENTREGADO' || item === 'DELIVERED') rawStates.push('delivered');
        else if (item === 'ENVIADO' || item === 'SENT') rawStates.push('sent');
        else if (item === 'FALLIDO' || item === 'FAILED') rawStates.push('failed');
        else if (item === 'NO ENVIADO') includeNoEnviado = true;
      }

      const wspSubClauses: string[] = [];
      if (rawStates.length > 0) {
        const ph = rawStates.map(() => '?').join(',');
        wspSubClauses.push(`LOWER(TRIM(COALESCE(v.estado_wsp, ''))) IN (${ph})`);
        params.push(...rawStates);
      }
      if (includeNoEnviado) {
        wspSubClauses.push(
          `(v.se_envio_wsp = 'NO' OR v.estado_wsp = 'NO ENVIADO' OR v.estado_wsp IS NULL OR TRIM(v.estado_wsp) = '')`
        );
      }
      if (wspSubClauses.length > 0) {
        whereClauses.push(`(${wspSubClauses.join(' OR ')})`);
      }
    }

    if (fTracking && fTracking !== 'Todos') {
      const trkItems = fTracking.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const mappedTrk = trkItems.map((t) => (t.includes('S') ? 'SI' : 'NO'));
      if (mappedTrk.length > 0) {
        const ph = mappedTrk.map(() => '?').join(',');
        whereClauses.push(`COALESCE(v.ingreso_tracking, 'NO') IN (${ph})`);
        params.push(...mappedTrk);
      }
    }

    if (q) {
      const likeQ = `%${q}%`;
      whereClauses.push(`(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.cliente LIKE ? OR
        v.telefono LIKE ? OR
        v.ops_num_doc LIKE ? OR
        v.ops_codi_segui_clien LIKE ? OR
        v.ops_codi_clien LIKE ? OR
        v.ops_cuadrilla LIKE ? OR
        v.cuadrilla LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countCacheKey = `ord_cnt_${startDate}_${endDate}_${service}_${q}_${ignoreDates}_${fOrden}_${fCliente}_${fOperacion}_${fSector}_${fPartner}_${fEstadoOt}_${fWsp}_${fTracking}`;
    const cachedTotal = queryCache.get<number>(countCacheKey);

    const [total, idRowsRes]: [number, any] = await Promise.all([
      typeof cachedTotal === 'number'
        ? Promise.resolve(cachedTotal)
        : pool
            .query(`SELECT COUNT(*) AS total FROM mat_funnel_casos_360 v ${whereSql}`, params)
            .then(([r]: any) => {
              const c = Number(r?.[0]?.total || 0);
              queryCache.set(countCacheKey, c, 60);
              return c;
            }),
      pool.query(
        `
        SELECT v.orden_id
        FROM mat_funnel_casos_360 v
        ${whereSql}
        ORDER BY v.orden_id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    const pageIds: number[] = (idRowsRes?.[0] || []).map((x: any) => x.orden_id);
    let rowsResult: any = [[]];

    if (pageIds.length > 0) {
      const idPh = pageIds.map(() => '?').join(',');
      rowsResult = await pool.query(
        `
        SELECT 
          v.*,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_solicitud_fmt,
          w.\`Número Documento\` AS numero_documento,
          w.\`Tipo Documento\` AS tipo_documento,
          w.CodiSeguiClien AS codi_segui_clien,
          w.CodiClien AS codi_clien,
          w.CodiSegui AS codi_segui_ot,
          w.Cuadrilla AS cuadrilla_completa,
          w.Proveedeor AS proveedor_ot,
          w.Direccion AS direccion_cliente,
          w.IdenServi AS plan_contratado,
          w.Email AS email_cliente,
          w.\`Diagnóstico Técnico\` AS diagnostico_tecnico,
          w.\`Observaciones Tareas\` AS observaciones_tareas,
          w.\`Historial Estados\` AS historial_estados,
          w.\`Datos Técnicos\` AS datos_tecnicos,
          w.Georeferencia AS georeferencia_cliente,
          w.Georeferencia_tecnico AS georeferencia_tecnico,
          w.\`Motivo Finalización\` AS motivo_finalizacion,
          w.\`Usuario Asignó\` AS usuario_asigno
        FROM mat_funnel_casos_360 v
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        WHERE v.orden_id IN (${idPh})
        ORDER BY FIELD(v.orden_id, ${idPh})
        `,
        [...pageIds, ...pageIds]
      );
    }

    const rows = (rowsResult?.[0] || []).map((o: any) => ({
      ...o,
      servicio_tipo: classifyOrderServiceType(o.producto, o.tipo_operacion),
    }));

    return res.json({
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      orders: rows,
    });
  } catch (error: any) {
    console.error('❌ Error en /api/orders/search:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

async function loadTipoServicioCacheIfNeeded(): Promise<void> {
  const { loadTipoServicioCache } = await import('../services/matFunnel.sync');
  await loadTipoServicioCache();
}

export default router;
