import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { cacheGet, cacheSet } from '../config/cache';
import { buildStrictOrderTypeSql, classifyOrderServiceType, cleanPartnerName } from '../domain/index';
import { requireAuth, enforceRoleServiceScope } from '../auth/middleware';
import { getServicioToTipoMap } from '../services/matFunnel.sync';
import { loadTipoServicioCacheIfNeeded, syncMatFunnelIncremental } from '../services/matFunnel.sync';

const router = Router();

// GET /api/csat -> Endpoint exclusivo de Experiencia (CSAT)
router.get('/csat', async (req: Request, res: Response) => {
  try {
    await loadTipoServicioCacheIfNeeded();

    const todayDefault = new Date().toLocaleDateString('en-CA');
    const {
      startDate = todayDefault,
      endDate = todayDefault,
      service: rawService = 'Todos los servicios',
      q = '',
      ignoreDates = 'false',
      refresh = 'false',
    } = req.query as Record<string, string>;

    const service = enforceRoleServiceScope(req, rawService);
    const searchQ = String(q || '').trim();
    const cacheKey = `csat_v3_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}`;

    const payload = await withSingleFlightSwr(
      cacheKey,
      120,
      refresh === 'true',
      async () => {
        if (refresh === 'true') {
          await syncMatFunnelIncremental(startDate, endDate);
        }

        const whereClauses: string[] = [];
        const params: any[] = [];

        if (ignoreDates !== 'true') {
          whereClauses.push(
            `ea.fecha_registro >= CONCAT(?, ' 00:00:00') AND ea.fecha_registro <= CONCAT(?, ' 23:59:59')`
          );
          params.push(startDate, endDate);
        }

        const csatSrvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
        if (csatSrvFilter.params.length > 0) {
          whereClauses.push(csatSrvFilter.sql);
          params.push(...csatSrvFilter.params);
        }

        if (searchQ) {
          const likeQ = `%${searchQ}%`;
          whereClauses.push(`(
            CAST(ea.orden_id AS CHAR) LIKE ? OR
            ea.codisegui LIKE ? OR
            ea.comentarios LIKE ? OR
            v.cliente LIKE ? OR
            v.ops_cuadrilla LIKE ? OR
            v.cuadrilla LIKE ? OR
            v.ops_partner LIKE ? OR
            v.partner LIKE ?
          )`);
          params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const [rows]: any = await pool.query(
          `
          SELECT
            ea.id,
            ea.token,
            COALESCE(NULLIF(TRIM(ea.orden_id), ''), CAST(v.orden_id AS CHAR)) AS orden_id,
            COALESCE(NULLIF(TRIM(ea.codisegui), ''), v.ticket) AS codisegui,
            ea.satisfaccion_atencion,
            ea.facilidad_uso,
            ea.satisfaccion_experiencia,
            ea.seguridad_datos_tecnico,
            ea.comentarios,
            SUBSTRING(CAST(ea.fecha_registro AS CHAR), 1, 10) AS raw_date,
            DATE_FORMAT(ea.fecha_registro, '%d/%m') AS fecha_corta,
            DATE_FORMAT(ea.fecha_registro, '%d/%m/%Y %H:%i') AS fecha_fmt,
            COALESCE(NULLIF(TRIM(v.cliente), ''), 'Cliente WIN') AS cliente,
            v.telefono AS telefono,
            v.producto AS producto,
            COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), 'OTROS') AS tipo_operacion_calc,
            COALESCE(NULLIF(TRIM(v.sector_operativo), ''), NULLIF(TRIM(v.ops_zona), ''), 'SIN SECTOR') AS sector_operativo,
            COALESCE(NULLIF(TRIM(v.ops_cuadrilla), ''), NULLIF(TRIM(v.cuadrilla), ''), 'SIN CUADRILLA') AS cuadrilla,
            COALESCE(NULLIF(TRIM(v.ops_partner), ''), v.partner) AS partner_raw,
            COALESCE(NULLIF(TRIM(v.ops_estado), ''), v.estado_ot) AS estado_ot
          FROM encuesta_app ea
          LEFT JOIN mat_funnel_casos_360 v ON v.orden_id = COALESCE(
            NULLIF(ea.orden_id_num, 0),
            CAST(NULLIF(TRIM(ea.orden_id), '') AS UNSIGNED),
            (SELECT m2.orden_id FROM mat_funnel_casos_360 m2 WHERE m2.token_tracking = ea.token AND ea.token IS NOT NULL AND ea.token != '' LIMIT 1),
            (SELECT m3.orden_id FROM mat_funnel_casos_360 m3 WHERE m3.ticket = ea.codisegui AND ea.codisegui IS NOT NULL AND ea.codisegui != '' LIMIT 1)
          )
          ${whereSql}
          ORDER BY ea.fecha_registro DESC
          LIMIT 500
          `,
          params
        );

      const list: any[] = rows || [];
      const total = list.length;

      let sumAtencion = 0;
      let countAtencion = 0;
      let top2Atencion = 0;

      let sumFacilidad = 0;
      let countFacilidad = 0;

      let sumExperiencia = 0;
      let countExperiencia = 0;
      let top2Experiencia = 0;

      let segSi = 0;
      let segNo = 0;

      const distAtencion: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      const partnerMap = new Map<string, {
        partner: string;
        surveys: number;
        sumAtencion: number;
        countAtencion: number;
        sumFacilidad: number;
        countFacilidad: number;
        sumExp: number;
        countExp: number;
        segSi: number;
      }>();
      const dailyMap = new Map<string, {
        raw_date: string;
        fecha: string;
        surveys: number;
        sumAtencion: number;
        countAtencion: number;
        sumExp: number;
        countExp: number;
      }>();

      const enrichedResponses = list.map((r) => {
        const atn = r.satisfaccion_atencion !== null && r.satisfaccion_atencion !== undefined ? Number(r.satisfaccion_atencion) : 0;
        const fac = r.facilidad_uso !== null && r.facilidad_uso !== undefined ? Number(r.facilidad_uso) : 0;
        const exp = r.satisfaccion_experiencia !== null && r.satisfaccion_experiencia !== undefined ? Number(r.satisfaccion_experiencia) : 0;
        const segRaw = String(r.seguridad_datos_tecnico || '').trim().toUpperCase();
        const isSegPositive =
          segRaw.includes('SI') ||
          segRaw.includes('SÍ') ||
          segRaw === '1' ||
          segRaw === 'TRUE' ||
          segRaw === '4' ||
          segRaw === '5';

        if (atn > 0) {
          sumAtencion += atn;
          countAtencion++;
          if (atn >= 4) top2Atencion++;
          if (distAtencion[atn] !== undefined) distAtencion[atn]++;
        }
        if (fac > 0) {
          sumFacilidad += fac;
          countFacilidad++;
        }
        if (exp > 0) {
          sumExperiencia += exp;
          countExperiencia++;
          if (exp >= 4) top2Experiencia++;
        }
        if (segRaw) {
          if (isSegPositive) segSi++;
          else segNo++;
        }

        const partnerClean = cleanPartnerName(r.partner_raw);
        const pEntry = partnerMap.get(partnerClean) || {
          partner: partnerClean,
          surveys: 0,
          sumAtencion: 0,
          countAtencion: 0,
          sumFacilidad: 0,
          countFacilidad: 0,
          sumExp: 0,
          countExp: 0,
          segSi: 0,
        };
        pEntry.surveys++;
        if (atn > 0) {
          pEntry.sumAtencion += atn;
          pEntry.countAtencion++;
        }
        if (fac > 0) {
          pEntry.sumFacilidad += fac;
          pEntry.countFacilidad++;
        }
        if (exp > 0) {
          pEntry.sumExp += exp;
          pEntry.countExp++;
        }
        if (isSegPositive) pEntry.segSi++;
        partnerMap.set(partnerClean, pEntry);

        if (r.raw_date) {
          const dEntry = dailyMap.get(r.raw_date) || {
            raw_date: r.raw_date,
            fecha: r.fecha_corta,
            surveys: 0,
            sumAtencion: 0,
            countAtencion: 0,
            sumExp: 0,
            countExp: 0,
          };
          dEntry.surveys++;
          if (atn > 0) {
            dEntry.sumAtencion += atn;
            dEntry.countAtencion++;
          }
          if (exp > 0) {
            dEntry.sumExp += exp;
            dEntry.countExp++;
          }
          dailyMap.set(r.raw_date, dEntry);
        }

        return {
          ...r,
          partner: partnerClean,
          servicio_tipo: classifyOrderServiceType(r.producto, r.tipo_operacion_calc),
        };
      });

      const avgAtencion = countAtencion > 0 ? sumAtencion / countAtencion : 0;
      const avgFacilidad = countFacilidad > 0 ? sumFacilidad / countFacilidad : 0;
      const avgExperiencia = countExperiencia > 0 ? sumExperiencia / countExperiencia : 0;
      const totalSeg = segSi + segNo;

        return {
          ok: true,
          kpis: {
            total_encuestas: total,
            avg_atencion: Number(avgAtencion.toFixed(2)),
            csat_atencion_pct: countAtencion > 0 ? Number(((top2Atencion / countAtencion) * 100).toFixed(1)) : 0,
            avg_facilidad: Number(avgFacilidad.toFixed(2)),
            ces_pct: countFacilidad > 0 ? Number(((avgFacilidad / 5) * 100).toFixed(1)) : 0,
            avg_experiencia: Number(avgExperiencia.toFixed(2)),
            csat_experiencia_pct: countExperiencia > 0 ? Number(((top2Experiencia / countExperiencia) * 100).toFixed(1)) : 0,
            seguridad_si: segSi,
            seguridad_no: segNo,
            seguridad_pct: totalSeg > 0 ? Number(((segSi / totalSeg) * 100).toFixed(1)) : 0,
          },
          distribution: [5, 4, 3, 2, 1].map((stars) => ({
            stars,
            count: distAtencion[stars] || 0,
            pct: countAtencion > 0 ? Number((((distAtencion[stars] || 0) / countAtencion) * 100).toFixed(1)) : 0,
          })),
          byPartner: Array.from(partnerMap.values())
            .map((p) => {
              const avgAtn = p.countAtencion > 0 ? p.sumAtencion / p.countAtencion : 0;
              const avgFac = p.countFacilidad > 0 ? p.sumFacilidad / p.countFacilidad : 0;
              const avgEx = p.countExp > 0 ? p.sumExp / p.countExp : 0;
              return {
                partner: p.partner,
                surveys: p.surveys,
                avg_atencion: Number(avgAtn.toFixed(2)),
                avg_facilidad: Number(avgFac.toFixed(2)),
                avg_experiencia: Number(avgEx.toFixed(2)),
                csat_pct: Number(((avgAtn / 5) * 100).toFixed(1)),
                seguridad_pct: p.surveys > 0 ? Number(((p.segSi / p.surveys) * 100).toFixed(1)) : 0,
              };
            })
            .sort((a: any, b: any) => b.avg_atencion - a.avg_atencion || b.surveys - a.surveys),
          daily: Array.from(dailyMap.values())
            .sort((a: any, b: any) => a.raw_date.localeCompare(b.raw_date))
            .map((d: any) => ({
              raw_date: d.raw_date,
              fecha: d.fecha,
              surveys: d.surveys,
              avg_atencion: d.countAtencion > 0 ? Number((d.sumAtencion / d.countAtencion).toFixed(2)) : 0,
              avg_experiencia: d.countExp > 0 ? Number((d.sumExp / d.countExp).toFixed(2)) : 0,
            })),
          responses: enrichedResponses,
        };
      }
    );

    return res.json(payload);
  } catch (err: any) {
    console.error('❌ Error en /api/csat:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

async function withSingleFlightSwr<T>(
  key: string,
  ttlSeconds: number,
  forceRefresh: boolean,
  computeFn: () => Promise<T>
): Promise<T> {
  const { withSingleFlightSwr: shared } = await import('../services/matFunnel.sync');
  return shared(key, ttlSeconds, forceRefresh, computeFn);
}

export default router;
