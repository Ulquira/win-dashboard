import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { cacheGet, cacheSet } from '../config/cache';
import { buildStrictOrderTypeSql } from '../domain/index';
import { requireAuth, enforceRoleServiceScope } from '../auth/middleware';
import { getServicioToTipoMap } from '../services/matFunnel.sync';
import { loadTipoServicioCacheIfNeeded, syncMatFunnelIncremental } from '../services/matFunnel.sync';

const router = Router();

// GET /api/operations -> Endpoint exclusivo de Operaciones
router.get('/operations', async (req: Request, res: Response) => {
  const startTime = Date.now();
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
  const cacheKey = `ops_raw_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}`;

  try {
    await loadTipoServicioCacheIfNeeded();

    const payload = await withSingleFlightSwr(
      cacheKey,
      120,
      refresh === 'true',
      async () => {
        if (refresh === 'true') {
          await syncMatFunnelIncremental(startDate, endDate);
        }

        const colEstado = `v.ops_estado`;
        const colPartner = `v.ops_partner`;
        const colCuadrilla = `v.ops_cuadrilla`;
        const colZona = `v.ops_zona`;

        const [ey, em, ed] = endDate.split('-').map(Number);
        const endTarget = new Date(ey, em - 1, ed);
        const min7D = new Date(endTarget);
        min7D.setDate(min7D.getDate() - 6);
        const min7StartStr = `${min7D.getFullYear()}-${String(min7D.getMonth() + 1).padStart(2, '0')}-${String(min7D.getDate()).padStart(2, '0')}`;
        const chartStartDate = startDate < min7StartStr ? startDate : min7StartStr;

        const whereClauses: string[] = [];
        const queryParams: any[] = [];
        const chartWhereClauses: string[] = [];
        const chartParams: any[] = [];

        if (ignoreDates !== 'true') {
          whereClauses.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
          queryParams.push(startDate, endDate);

          chartWhereClauses.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
          chartParams.push(chartStartDate, endDate);
        }

        const opsSrvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
        if (opsSrvFilter.params.length > 0) {
          whereClauses.push(opsSrvFilter.sql);
          queryParams.push(...opsSrvFilter.params);

          chartWhereClauses.push(opsSrvFilter.sql);
          chartParams.push(...opsSrvFilter.params);
        }

        if (searchQ) {
          const likeQ = `%${searchQ}%`;
          const qClause = `(
            CAST(v.orden_id AS CHAR) LIKE ? OR
            v.ticket LIKE ? OR
            v.ops_codi_segui_clien LIKE ? OR
            v.ops_codi_clien LIKE ? OR
            v.cliente LIKE ? OR
            v.ops_num_doc LIKE ? OR
            v.telefono LIKE ? OR
            v.ops_cuadrilla LIKE ? OR
            v.cuadrilla LIKE ? OR
            v.partner LIKE ?
          )`;
          const qArgs = [likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ];
          whereClauses.push(qClause);
          queryParams.push(...qArgs);

          chartWhereClauses.push(qClause);
          chartParams.push(...qArgs);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const chartWhereSql = chartWhereClauses.length > 0 ? `WHERE ${chartWhereClauses.join(' AND ')}` : '';

        const isFin = `(LOWER(${colEstado}) LIKE '%finaliz%' OR LOWER(${colEstado}) LIKE '%atendid%' OR LOWER(${colEstado}) LIKE '%complet%' OR LOWER(${colEstado}) LIKE '%cerrad%' OR LOWER(${colEstado}) LIKE '%ok%')`;
        const isCurso = `(LOWER(${colEstado}) LIKE '%iniciad%' OR LOWER(${colEstado}) LIKE '%camino%' OR LOWER(${colEstado}) LIKE '%ruta%' OR LOWER(${colEstado}) LIKE '%ejecuc%' OR LOWER(${colEstado}) LIKE '%proceso%')`;
        const isCancel = `(LOWER(${colEstado}) LIKE '%cancel%' OR LOWER(${colEstado}) LIKE '%anul%' OR LOWER(${colEstado}) LIKE '%rechaz%' OR LOWER(${colEstado}) LIKE '%quiebre%' OR LOWER(${colEstado}) LIKE '%suspens%')`;
        const isAgend = `(NOT ${isFin} AND NOT ${isCurso} AND NOT ${isCancel})`;

        const indexHint = !searchQ ? 'USE INDEX (idx_mat_ops_full_cov)' : '';
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const startTarget = new Date(sy, sm - 1, sd);
        const rangeDays = Math.max(1, Math.round((endTarget.getTime() - startTarget.getTime()) / 86400000) + 1);
        const useDirectIndexStream = ignoreDates !== 'true' && rangeDays <= 7 && !searchQ;

        const [rangeRes, dailyRes, dailyBySrvRes]: any = await Promise.all([
          pool.query(
            useDirectIndexStream
              ? `
            SELECT
              v.tipo_operacion AS tipo_operacion,
              v.ops_estado AS estado,
              v.ops_partner AS partner,
              v.ops_cuadrilla AS cuadrilla,
              v.ops_zona AS zona,
              v.ops_motivo_trabajo AS motivo_trabajo,
              v.ops_segmento AS segmento,
              v.ops_motivo_fin AS motivo_fin,
              1 AS total
            FROM mat_funnel_casos_360 v ${indexHint}
            ${whereSql}
            `
              : `
            SELECT
              v.tipo_operacion AS tipo_operacion,
              v.ops_estado AS estado,
              v.ops_partner AS partner,
              v.ops_cuadrilla AS cuadrilla,
              v.ops_zona AS zona,
              v.ops_motivo_trabajo AS motivo_trabajo,
              v.ops_segmento AS segmento,
              v.ops_motivo_fin AS motivo_fin,
              COUNT(*) AS total
            FROM mat_funnel_casos_360 v ${indexHint}
            ${whereSql}
            GROUP BY
              v.tipo_operacion,
              v.ops_estado,
              v.ops_partner,
              v.ops_cuadrilla,
              v.ops_zona,
              v.ops_motivo_trabajo,
              v.ops_segmento,
              v.ops_motivo_fin
            `,
            queryParams
          ),

          pool.query(
            `
            SELECT
              DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
              MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m')) AS fecha,
              MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y')) AS fecha_full,
              COUNT(*) AS total,
              COALESCE(SUM(${isFin}), 0) AS finalizadas,
              COALESCE(SUM(${isCurso}), 0) AS en_curso,
              COALESCE(SUM(${isAgend}), 0) AS agendadas,
              COALESCE(SUM(${isCancel}), 0) AS canceladas,
              COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
            FROM mat_funnel_casos_360 v ${indexHint}
            ${chartWhereSql}
            GROUP BY v.fecha_solicitud_dia
            HAVING raw_date IS NOT NULL
            ORDER BY raw_date ASC
            `,
            chartParams
          ),

          pool.query(
            `
            SELECT
              v.tipo_operacion AS tipo_operacion,
              DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
              MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m')) AS fecha,
              MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y')) AS fecha_full,
              COUNT(*) AS total,
              COALESCE(SUM(${isFin}), 0) AS finalizadas,
              COALESCE(SUM(${isCurso}), 0) AS en_curso,
              COALESCE(SUM(${isAgend}), 0) AS agendadas,
              COALESCE(SUM(${isCancel}), 0) AS canceladas,
              COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
            FROM mat_funnel_casos_360 v ${indexHint}
            ${chartWhereSql}
            GROUP BY v.fecha_solicitud_dia, v.tipo_operacion
            HAVING raw_date IS NOT NULL
            ORDER BY raw_date ASC
            `,
            chartParams
          ),
        ]);

        const classifyEstado = (est: string) => {
          const lower = est.toLowerCase();
          const fin =
            lower.includes('finaliz') ||
            lower.includes('atendid') ||
            lower.includes('complet') ||
            lower.includes('cerrad') ||
            lower.includes('ok');
          const cur =
            lower.includes('iniciad') ||
            lower.includes('camino') ||
            lower.includes('ruta') ||
            lower.includes('ejecuc') ||
            lower.includes('proceso');
          const can =
            lower.includes('cancel') ||
            lower.includes('anul') ||
            lower.includes('rechaz') ||
            lower.includes('quiebre') ||
            lower.includes('suspens');
          const age = !fin && !cur && !can;
          return { fin, cur, can, age };
        };

        const buildOpsSlice = (rows: any[], dailyRowsRaw: any[]) => {
          let totalOrdenes = 0;
          let finalizadas = 0;
          let enCurso = 0;
          let agendadas = 0;
          let canceladas = 0;
          const allCuadrillas = new Set<string>();
          const allPartners = new Set<string>();
          const allZonas = new Set<string>();

          const estadoMap = new Map<string, { estado: string; total: number; cuadrillasSet: Set<string> }>();
          const partnerMap = new Map<
            string,
            {
              partner: string;
              total: number;
              finalizadas: number;
              en_curso: number;
              agendadas: number;
              canceladas: number;
              cuadrillasSet: Set<string>;
            }
          >();
          const zonaMap = new Map<
            string,
            {
              zona: string;
              total: number;
              finalizadas: number;
              en_curso: number;
              agendadas: number;
              canceladas: number;
              cuadrillasSet: Set<string>;
            }
          >();
          const cuadrillaMap = new Map<
            string,
            {
              cuadrilla: string;
              partner: string;
              total: number;
              finalizadas: number;
              en_curso: number;
              canceladas: number;
            }
          >();
          const motivoTrabajoMap = new Map<
            string,
            {
              motivo_trabajo: string;
              segmento: string;
              total: number;
              finalizadas: number;
              canceladas: number;
              cuadrillasSet: Set<string>;
            }
          >();
          const motivoFinMap = new Map<
            string,
            {
              motivo_fin: string;
              total: number;
              finalizadas: number;
              canceladas: number;
            }
          >();

          for (const r of rows) {
            const cnt = Number(r.total || 0);
            const est = String(r.estado || 'SIN ESTADO');
            const par = String(r.partner || 'SIN PARTNER');
            const cua = r.cuadrilla ? String(r.cuadrilla) : null;
            const zon = String(r.zona || 'SIN ZONA');
            const mtr = String(r.motivo_trabajo || 'NO ESPECIFICADO');
            const seg = String(r.segmento || 'RESIDENCIAL');
            const mfi = String(r.motivo_fin || 'SIN MOTIVO DE CIERRE');

            const { fin, cur, can, age } = classifyEstado(est);
            const cFin = fin ? cnt : 0;
            const cCur = cur ? cnt : 0;
            const cCan = can ? cnt : 0;
            const cAge = age ? cnt : 0;

            totalOrdenes += cnt;
            finalizadas += cFin;
            enCurso += cCur;
            agendadas += cAge;
            canceladas += cCan;

            if (cua && cua !== 'SIN ASIGNAR') allCuadrillas.add(cua);
            if (par) allPartners.add(par);
            if (zon) allZonas.add(zon);

            let stNode = estadoMap.get(est);
            if (!stNode) {
              stNode = { estado: est, total: 0, cuadrillasSet: new Set() };
              estadoMap.set(est, stNode);
            }
            stNode.total += cnt;
            if (cua && cua !== 'SIN ASIGNAR') stNode.cuadrillasSet.add(cua);

            let pNode = partnerMap.get(par);
            if (!pNode) {
              pNode = {
                partner: par,
                total: 0,
                finalizadas: 0,
                en_curso: 0,
                agendadas: 0,
                canceladas: 0,
                cuadrillasSet: new Set(),
              };
              partnerMap.set(par, pNode);
            }
            pNode.total += cnt;
            pNode.finalizadas += cFin;
            pNode.en_curso += cCur;
            pNode.agendadas += cAge;
            pNode.canceladas += cCan;
            if (cua && cua !== 'SIN ASIGNAR') pNode.cuadrillasSet.add(cua);

            let zNode = zonaMap.get(zon);
            if (!zNode) {
              zNode = {
                zona: zon,
                total: 0,
                finalizadas: 0,
                en_curso: 0,
                agendadas: 0,
                canceladas: 0,
                cuadrillasSet: new Set(),
              };
              zonaMap.set(zon, zNode);
            }
            zNode.total += cnt;
            zNode.finalizadas += cFin;
            zNode.en_curso += cCur;
            zNode.agendadas += cAge;
            zNode.canceladas += cCan;
            if (cua && cua !== 'SIN ASIGNAR') zNode.cuadrillasSet.add(cua);

            if (cua && cua !== 'SIN ASIGNAR') {
              let cNode = cuadrillaMap.get(cua);
              if (!cNode) {
                cNode = {
                  cuadrilla: cua,
                  partner: par,
                  total: 0,
                  finalizadas: 0,
                  en_curso: 0,
                  canceladas: 0,
                };
                cuadrillaMap.set(cua, cNode);
              }
              cNode.total += cnt;
              cNode.finalizadas += cFin;
              cNode.en_curso += cCur;
              cNode.canceladas += cCan;
              if (par > cNode.partner) cNode.partner = par;
            }

            let mtNode = motivoTrabajoMap.get(mtr);
            if (!mtNode) {
              mtNode = {
                motivo_trabajo: mtr,
                segmento: seg,
                total: 0,
                finalizadas: 0,
                canceladas: 0,
                cuadrillasSet: new Set(),
              };
              motivoTrabajoMap.set(mtr, mtNode);
            }
            mtNode.total += cnt;
            mtNode.finalizadas += cFin;
            mtNode.canceladas += cCan;
            if (seg > mtNode.segmento) mtNode.segmento = seg;
            if (cua && cua !== 'SIN ASIGNAR') mtNode.cuadrillasSet.add(cua);

            let mfNode = motivoFinMap.get(mfi);
            if (!mfNode) {
              mfNode = {
                motivo_fin: mfi,
                total: 0,
                finalizadas: 0,
                canceladas: 0,
              };
              motivoFinMap.set(mfi, mfNode);
            }
            mfNode.total += cnt;
            mfNode.finalizadas += cFin;
            mfNode.canceladas += cCan;
          }

          const cuadrillasActivas = allCuadrillas.size;

          return {
            kpis: {
              total_ordenes: totalOrdenes,
              finalizadas,
              en_curso: enCurso,
              agendadas,
              canceladas,
              cuadrillas_activas: cuadrillasActivas,
              partners_activos: allPartners.size,
              zonas_activas: allZonas.size,
              efectividad_pct: totalOrdenes > 0 ? Number(((finalizadas / totalOrdenes) * 100).toFixed(1)) : 0,
              cancelacion_pct: totalOrdenes > 0 ? Number(((canceladas / totalOrdenes) * 100).toFixed(1)) : 0,
              prod_ot_por_cuadrilla: cuadrillasActivas > 0 ? Number((totalOrdenes / cuadrillasActivas).toFixed(1)) : 0,
              prod_fin_por_cuadrilla: cuadrillasActivas > 0 ? Number((finalizadas / cuadrillasActivas).toFixed(1)) : 0,
            },
            byEstado: Array.from(estadoMap.values())
              .map((st) => ({
                estado: st.estado,
                total: st.total,
                cuadrillas: st.cuadrillasSet.size,
              }))
              .sort((a, b) => b.total - a.total),
            daily: dailyRowsRaw.map((d: any) => {
              const tot = Number(d.total || 0);
              const fin = Number(d.finalizadas || 0);
              const crw = Number(d.cuadrillas || 0);
              return {
                ...d,
                total: tot,
                finalizadas: fin,
                en_curso: Number(d.en_curso || 0),
                agendadas: Number(d.agendadas || 0),
                canceladas: Number(d.canceladas || 0),
                cuadrillas: crw,
                efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
                prod_total: crw > 0 ? Number((tot / crw).toFixed(1)) : 0,
                prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
              };
            }),
            byPartner: Array.from(partnerMap.values())
              .map((p) => {
                const tot = p.total;
                const fin = p.finalizadas;
                const crw = p.cuadrillasSet.size;
                return {
                  partner: p.partner,
                  total: tot,
                  finalizadas: fin,
                  en_curso: p.en_curso,
                  agendadas: p.agendadas,
                  canceladas: p.canceladas,
                  cuadrillas: crw,
                  efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
                  prod_total: crw > 0 ? Number((tot / crw).toFixed(1)) : 0,
                  prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
                };
              })
              .sort((a, b) => b.total - a.total),
            byZona: Array.from(zonaMap.values())
              .map((z) => {
                const tot = z.total;
                const fin = z.finalizadas;
                const crw = z.cuadrillasSet.size;
                return {
                  zona: z.zona,
                  total: tot,
                  finalizadas: fin,
                  en_curso: z.en_curso,
                  agendadas: z.agendadas,
                  canceladas: z.canceladas,
                  cuadrillas: crw,
                  efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
                  prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
                };
              })
              .sort((a, b) => b.total - a.total)
              .slice(0, 30),
            topCuadrillas: Array.from(cuadrillaMap.values())
              .map((c) => {
                const tot = c.total;
                const fin = c.finalizadas;
                return {
                  ...c,
                  efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
                };
              })
              .sort((a, b) => b.finalizadas - a.finalizadas || b.total - a.total)
              .slice(0, 15),
            byMotivoTrabajo: Array.from(motivoTrabajoMap.values())
              .map((m) => {
                const prodKey = String(m.motivo_trabajo || '').trim().toUpperCase();
                const tipoMapeado = getServicioToTipoMap().get(prodKey) || prodKey || 'OTROS';
                return {
                  motivo_trabajo: m.motivo_trabajo,
                  segmento: m.segmento,
                  total: m.total,
                  finalizadas: m.finalizadas,
                  canceladas: m.canceladas,
                  cuadrillas: m.cuadrillasSet.size,
                  tipo_operacion: tipoMapeado,
                };
              })
              .sort((a, b) => b.total - a.total)
              .slice(0, 15),
            byMotivoFin: Array.from(motivoFinMap.values())
              .sort((a, b) => b.total - a.total)
              .slice(0, 10),
          };
        };

        const allRangeRows: any[] = rangeRes?.[0] || [];
        const allDailyRows: any[] = dailyRes?.[0] || [];
        const allDailyBySrvRows: any[] = dailyBySrvRes?.[0] || [];

        const mainSlice = buildOpsSlice(allRangeRows, allDailyRows);
        const byService: Record<string, any> = {};

        const SERVICIOS_PERMITIDOS = [
          'INSTA - LIMA',
          'INSTA - PROV',
          'AVER - LIMA',
          'AVER - PROV',
          'POSTVENTA',
        ];

        for (const srvName of SERVICIOS_PERMITIDOS) {
          const srvRangeRows = allRangeRows.filter(
            (r) => String(r.tipo_operacion || '').trim().toUpperCase() === srvName
          );
          const srvDailyRows = allDailyBySrvRows.filter(
            (d) => String(d.tipo_operacion || '').trim().toUpperCase() === srvName
          );
          byService[srvName] = buildOpsSlice(srvRangeRows, srvDailyRows);
        }

        return {
          ok: true,
          source: 'mat_funnel_casos_360',
          ...mainSlice,
          byService,
        };
      }
    );

    console.log(`✅ /api/operations (mat_funnel_casos_360) completado en ${Date.now() - startTime}ms`);
    return res.json(payload);
  } catch (error: any) {
    console.error('❌ Error en /api/operations:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
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
