import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { buildStrictOrderTypeSql, classifyOrderServiceType, cleanPartnerName, homologarTipoServicio, HOMOLOGACION_INVERSA_DB } from '../domain/index';
import { requireAuth, enforceRoleServiceScope } from '../auth/middleware';
import { cacheGet, cacheSet } from '../config/cache';
import { loadTipoServicioCache } from '../services/matFunnel.sync';

const router = Router();

// GET /api/dashboard -> Endpoint principal del Dashboard (Ejecutivo + Operativo)
router.get('/dashboard', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const todayDefault = new Date().toLocaleDateString('en-CA');
  const {
    startDate = todayDefault,
    endDate = todayDefault,
    service: rawService = 'Todos los servicios',
    zone = 'Todas las zonas',
    refresh = 'false',
  } = req.query as Record<string, string>;
  const service = enforceRoleServiceScope(req, rawService);

  const cacheKey = `dash_${startDate}_${endDate}_${service}_${zone}`;

  try {
    const responsePayload = await withSingleFlightSwr(
      cacheKey,
      120,
      refresh === 'true',
      async () => {
        await loadTipoServicioCache();
        if (refresh === 'true') {
          await syncMatFunnelIncremental(startDate, endDate);
        }

        // Garantizar siempre mínimo 7 días hacia atrás desde endDate para la gráfica evolutiva
        const [ey, em, ed] = endDate.split('-').map(Number);
        const endTarget = new Date(ey, em - 1, ed);
        const min7D = new Date(endTarget);
        min7D.setDate(min7D.getDate() - 6);
        const min7StartStr = `${min7D.getFullYear()}-${String(min7D.getMonth() + 1).padStart(2, '0')}-${String(min7D.getDate()).padStart(2, '0')}`;
        const chartStartDate = startDate < min7StartStr ? startDate : min7StartStr;

        const extraFilters: string[] = [];
        const extraParams: any[] = [];
        const reprogFilters: string[] = [];
        const reprogParams: any[] = [];
        const encFilters: string[] = [];
        const encParams: any[] = [];

        const dashSrvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
        if (dashSrvFilter.params.length > 0) {
          extraFilters.push(`AND ${dashSrvFilter.sql}`);
          extraParams.push(...dashSrvFilter.params);

          const { canonicalList, productosDelTipo } = resolveProductosFromServiceFilter(service, getServicioToTipoMap());
          const prods = productosDelTipo.length > 0 ? productosDelTipo : dashSrvFilter.params;
          const ph = prods.map(() => '?').join(',');

          let geoClauseR = '';
          const onlyLima = canonicalList.length > 0 && canonicalList.every((c) => c.includes('LIMA'));
          const onlyProv = canonicalList.length > 0 && canonicalList.every((c) => c.includes('PROV'));
          if (onlyLima) {
            geoClauseR = " AND (r.sector_operativo LIKE 'LIMA%' OR r.sector_operativo IS NULL)";
          } else if (onlyProv) {
            geoClauseR = " AND (r.sector_operativo NOT LIKE 'LIMA%' AND r.sector_operativo IS NOT NULL)";
          }

          reprogFilters.push(`AND UPPER(TRIM(r.producto_servicio)) IN (${ph})${geoClauseR}`);
          reprogParams.push(...prods.map((x) => x.toUpperCase()));

          encFilters.push(`AND ${dashSrvFilter.sql}`);
          encParams.push(...dashSrvFilter.params);
        }

        if (zone && zone !== 'Todas las zonas') {
          extraFilters.push(`AND v.sector_operativo = ?`);
          extraParams.push(zone);

          reprogFilters.push(`AND r.sector_operativo = ?`);
          reprogParams.push(zone);

          encFilters.push(`AND v.sector_operativo = ?`);
          encParams.push(zone);
        }

        const filterSql = extraFilters.join(' ');

        const [
          aggregatedResult,
          orderResult,
          reprogResult,
          encResult,
        ]: any = await Promise.all([
          pool.query(
            `
            SELECT 
              DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
              DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m') AS fecha,
              DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_full,
              v.estado_ot,
              v.sector_operativo,
              v.tipo_operacion,
              v.total,
              v.enviados,
              v.leidos,
              v.sent,
              v.delivered,
              v.failed,
              v.no_enviado,
              v.tracking,
              v.sos_soporte,
              v.autogestionados,
              v.reprogramaciones,
              v.encuestas,
              v.leidos_sin_ingreso,
              v.av_total,
              v.av_enviados,
              v.av_leidos,
              v.av_tracking,
              v.pref_total,
              v.pref_enviados,
              v.pref_leidos,
              v.pref_tracking
            FROM mat_daily_kpis_rollup v
            WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
            ${filterSql}
            `,
            [chartStartDate, endDate, ...extraParams]
          ),
          Promise.resolve([[]]),
          pool
            .query(
              `
              SELECT COUNT(*) AS total_reprog
              FROM vw_reprogramaciones_detalle r
              WHERE r.fecha_registro >= ? AND r.fecha_registro < DATE_ADD(?, INTERVAL 1 DAY)
              ${reprogFilters.join(' ')}
              `,
              [startDate, endDate, ...reprogParams]
            )
            .catch((err: any) => {
              console.warn('⚠️ Error consultando vw_reprogramaciones_detalle:', err.message);
              return [[{ total_reprog: 0 }]];
            }),
          pool
            .query(
              `
              SELECT 
                COALESCE(NULLIF(TRIM(v.ops_partner), ''), NULLIF(TRIM(v.partner), ''), 'SIN PARTNER') AS partner_raw,
                COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), 'OTROS') AS tipo_operacion,
                COALESCE(NULLIF(TRIM(v.sector_operativo), ''), 'SIN SECTOR') AS sector_operativo,
                COUNT(DISTINCT ea.id) AS surveys,
                AVG(COALESCE(ea.satisfaccion_atencion, ea.satisfaccion_experiencia) + 0) AS avg_score
              FROM encuesta_app ea
              LEFT JOIN mat_funnel_casos_360 v ON v.orden_id = COALESCE(
                NULLIF(ea.orden_id_num, 0),
                CAST(NULLIF(TRIM(ea.orden_id), '') AS UNSIGNED),
                (SELECT m2.orden_id FROM mat_funnel_casos_360 m2 WHERE m2.token_tracking = ea.token AND ea.token IS NOT NULL AND ea.token != '' LIMIT 1),
                (SELECT m3.orden_id FROM mat_funnel_casos_360 m3 WHERE m3.ticket = ea.codisegui AND ea.codisegui IS NOT NULL AND ea.codisegui != '' LIMIT 1)
              )
              WHERE ea.fecha_registro >= CONCAT(?, ' 00:00:00')
                AND ea.fecha_registro <= CONCAT(?, ' 23:59:59')
              ${encFilters.join(' ')}
              GROUP BY partner_raw, tipo_operacion, sector_operativo
              ORDER BY avg_score DESC, surveys DESC
              `,
              [startDate, endDate, ...encParams]
            )
            .catch((err: any) => {
              console.warn('⚠️ Error consultando encuesta_app:', err.message);
              return [[]];
            }),
        ]);

        const totalReprogReal = Number(reprogResult?.[0]?.[0]?.total_reprog || 0);

        let encRowsRaw: any[] = encResult?.[0] || [];
        const encuestasByService = encRowsRaw.map((r: any) => ({
          partner: cleanPartnerName(r.partner_raw),
          tipo_operacion: classifyOrderServiceType(r.tipo_operacion, r.tipo_operacion),
          sector_operativo: String(r.sector_operativo || 'SIN SECTOR').trim(),
          surveys: Number(r.surveys || 0),
          avg_score: Number(r.avg_score || 0),
        }));

        const partnerAggMap = new Map<string, { partner: string; surveys: number; sumPoints: number }>();
        for (const r of encuestasByService) {
          const pName = r.partner;
          const sv = r.surveys;
          const avg = r.avg_score;
          const cur = partnerAggMap.get(pName) || { partner: pName, surveys: 0, sumPoints: 0 };
          cur.surveys += sv;
          cur.sumPoints += avg * sv;
          partnerAggMap.set(pName, cur);
        }

        const encRows = Array.from(partnerAggMap.values())
          .map((p) => ({
            partner: p.partner,
            surveys: p.surveys,
            avg_score: p.surveys > 0 ? p.sumPoints / p.surveys : 0,
          }))
          .sort((a, b) => b.avg_score - a.avg_score || b.surveys - a.surveys);

        const totalEncuestasReal = encRows.reduce(
          (acc: number, r: any) => acc + Number(r.surveys || 0),
          0
        );

        const sumPonderada = encRows.reduce(
          (acc: number, r: any) => acc + Number(r.avg_score || 0) * Number(r.surveys || 0),
          0
        );
        const csatAvgGlobal = totalEncuestasReal > 0 ? sumPonderada / totalEncuestasReal : 0;

        const partnersRanking = (encRows || []).slice(0, 6).map((r: any, idx: number) => {
          const avg = Number(r.avg_score || 0);
          const csatPct = (avg / 5) * 100;
          return {
            rank: idx + 1,
            name: r.partner,
            surveys: Number(r.surveys || 0),
            score: avg.toFixed(1).replace('.', ','),
            csat: `${csatPct.toFixed(1).replace('.', ',')}%`,
          };
        });

        const rawAggregated: any[] = aggregatedResult[0] || [];

        const dailyMap = new Map<string, any>();
        const estadoOtMap = new Map<string, any>();
        const sectorMap = new Map<string, any>();
        const tipoOpMap = new Map<string, any>();

        for (const r of rawAggregated) {
          const tot = Number(r.total || 0);
          const env = Number(r.enviados || 0);
          const lei = Number(r.leidos || 0);
          const trk = Number(r.tracking || 0);

          const day = dailyMap.get(r.raw_date) || {
            raw_date: r.raw_date,
            fecha: r.fecha,
            fecha_full: r.fecha_full,
            total: 0,
            enviados: 0,
            leidos: 0,
            sent: 0,
            delivered: 0,
            failed: 0,
            no_enviado: 0,
            tracking: 0,
            sos_soporte: 0,
            autogestionados: 0,
            leidos_sin_ingreso: 0,
            av_total: 0,
            av_enviados: 0,
            av_leidos: 0,
            av_tracking: 0,
            pref_total: 0,
            pref_enviados: 0,
            pref_leidos: 0,
            pref_tracking: 0,
          };
          day.total += tot;
          day.enviados += env;
          day.leidos += lei;
          day.sent += Number(r.sent || 0);
          day.delivered += Number(r.delivered || 0);
          day.failed += Number(r.failed || 0);
          day.no_enviado += Number(r.no_enviado || 0);
          day.tracking += trk;
          day.sos_soporte += Number(r.sos_soporte || 0);
          day.autogestionados += Number(r.autogestionados || 0);
          day.leidos_sin_ingreso += Number(r.leidos_sin_ingreso || 0);
          day.av_total += Number(r.av_total || 0);
          day.av_enviados += Number(r.av_enviados || 0);
          day.av_leidos += Number(r.av_leidos || 0);
          day.av_tracking += Number(r.av_tracking || 0);
          day.pref_total += Number(r.pref_total || 0);
          day.pref_enviados += Number(r.pref_enviados || 0);
          day.pref_leidos += Number(r.pref_leidos || 0);
          day.pref_tracking += Number(r.pref_tracking || 0);
          dailyMap.set(r.raw_date, day);

          if (r.raw_date >= startDate && r.raw_date <= endDate) {
            const st = estadoOtMap.get(r.estado_ot) || { estado_ot: r.estado_ot, total: 0, enviados: 0, leidos: 0, tracking: 0 };
            st.total += tot;
            st.enviados += env;
            st.leidos += lei;
            st.tracking += trk;
            estadoOtMap.set(r.estado_ot, st);

            const sec = sectorMap.get(r.sector_operativo) || { sector_operativo: r.sector_operativo, total: 0, enviados: 0, no_enviados: 0, tracking: 0, leidos: 0 };
            sec.total += tot;
            sec.enviados += env;
            sec.no_enviados += Number(r.no_enviado || 0);
            sec.tracking += trk;
            sec.leidos += lei;
            sectorMap.set(r.sector_operativo, sec);

            const top = tipoOpMap.get(r.tipo_operacion) || { tipo: r.tipo_operacion, total: 0, enviados: 0 };
            top.total += tot;
            top.enviados += env;
            tipoOpMap.set(r.tipo_operacion, top);
          }
        }

        const dailyRows = Array.from(dailyMap.values()).sort((a, b) => a.raw_date.localeCompare(b.raw_date));
        const kpiRowsInRange = dailyRows.filter(
          (r) => r.raw_date >= startDate && r.raw_date <= endDate
        );
        const byEstadoOt = Array.from(estadoOtMap.values()).sort((a, b) => b.total - a.total);
        const bySector = Array.from(sectorMap.values()).sort((a, b) => b.total - a.total);
        const byTipoOperacion = Array.from(tipoOpMap.values()).sort((a, b) => b.total - a.total);

        const kpis = kpiRowsInRange.reduce(
          (acc, row) => ({
            total_ordenes: acc.total_ordenes + Number(row.total || 0),
            whs_enviados: acc.whs_enviados + Number(row.enviados || 0),
            whs_leidos: acc.whs_leidos + Number(row.leidos || 0),
            whs_sent: acc.whs_sent + Number(row.sent || 0),
            whs_delivered: acc.whs_delivered + Number(row.delivered || 0),
            whs_failed: acc.whs_failed + Number(row.failed || 0),
            whs_no_enviado: acc.whs_no_enviado + Number(row.no_enviado || 0),
            ingreso_tracking: acc.ingreso_tracking + Number(row.tracking || 0),
            sos_soporte: acc.sos_soporte + Number(row.sos_soporte || 0),
            autogestionados: acc.autogestionados + Number(row.autogestionados || 0),
            reprogramaciones: acc.reprogramaciones + Number(row.reprogramaciones || 0),
            encuestas_respondidas: acc.encuestas_respondidas + Number(row.encuestas || 0),
            csat_avg: csatAvgGlobal,
            leidos_sin_ingreso: acc.leidos_sin_ingreso + Number(row.leidos_sin_ingreso || 0),
            av_total: acc.av_total + Number(row.av_total || 0),
            av_enviados: acc.av_enviados + Number(row.av_enviados || 0),
            av_leidos: acc.av_leidos + Number(row.av_leidos || 0),
            av_tracking: acc.av_tracking + Number(row.av_tracking || 0),
            pref_total: acc.pref_total + Number(row.pref_total || 0),
            pref_enviados: acc.pref_enviados + Number(row.pref_enviados || 0),
            pref_leidos: acc.pref_leidos + Number(row.pref_leidos || 0),
            pref_tracking: acc.pref_tracking + Number(row.pref_tracking || 0),
          }),
          {
            total_ordenes: 0,
            whs_enviados: 0,
            whs_leidos: 0,
            whs_sent: 0,
            whs_delivered: 0,
            whs_failed: 0,
            whs_no_enviado: 0,
            ingreso_tracking: 0,
            sos_soporte: 0,
            autogestionados: 0,
            reprogramaciones: 0,
            encuestas_respondidas: 0,
            csat_avg: csatAvgGlobal,
            leidos_sin_ingreso: 0,
            av_total: 0,
            av_enviados: 0,
            av_leidos: 0,
            av_tracking: 0,
            pref_total: 0,
            pref_enviados: 0,
            pref_leidos: 0,
            pref_tracking: 0,
          }
        );

        kpis.reprogramaciones = totalReprogReal;
        kpis.encuestas_respondidas = totalEncuestasReal;
        kpis.csat_avg = Number(csatAvgGlobal.toFixed(2));

        const ordersWithTipo = (orderResult[0] || []).map((o: any) => ({
          ...o,
          servicio_tipo: classifyOrderServiceType(o.producto, o.tipo_operacion),
        }));

        return {
          ok: true,
          rawAggregated,
          encuestasByService,
          kpis,
          evolution: dailyRows,
          dailyInRange: kpiRowsInRange,
          byEstadoOt,
          bySector,
          byTipoOperacion,
          orders: ordersWithTipo,
          partners: partnersRanking,
        };
      }
    );

    console.log(`✅ /api/dashboard completado en ${Date.now() - startTime}ms`);
    return res.json(responsePayload);
  } catch (error: any) {
    console.error('❌ Error SQL en /api/dashboard:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ===== Helpers locales (migrados desde server.ts) =====

let servicioToTipoMapCache: Map<string, string> | null = null;
let tiposUnicosListCache: string[] = [];

function getServicioToTipoMap(): Map<string, string> {
  return servicioToTipoMapCache || new Map();
}

function getTiposUnicosList(): string[] {
  return tiposUnicosListCache;
}

function setTipoServicioCache(map: Map<string, string>, list: string[]): void {
  servicioToTipoMapCache = map;
  tiposUnicosListCache = list;
}

async function withSingleFlightSwr<T>(
  key: string,
  ttlSeconds: number,
  forceRefresh: boolean,
  computeFn: () => Promise<T>
): Promise<T> {
  const runCompute = (): Promise<T> => {
    const existing = inFlightRequestsGet(key);
    if (existing) return existing as Promise<T>;
    const p = computeFn()
      .then(async (result) => {
        await cacheSet(key, result, ttlSeconds);
        return result;
      })
      .finally(() => {
        inFlightRequestsDelete(key);
      });
    inFlightRequestsSet(key, p);
    return p;
  };

  if (!forceRefresh) {
    const swrEntry = swrMemoryCacheGet<T>(key);
    if (swrEntry) {
      if (Date.now() >= swrEntry.freshUntil && !inFlightRequestsHas(key)) {
        runCompute().catch((err) => console.warn(`⚠️ Error en SWR background (${key}):`, err.message));
      }
      return swrEntry.data;
    }
    const cached = await cacheGet<T>(key);
    if (cached) {
      swrMemoryCacheSet(
        key,
        { data: cached, freshUntil: Date.now() + ttlSeconds * 1000 } as any,
        Math.max(ttlSeconds * 6, 900)
      );
      return cached;
    }
  }

  return runCompute();
}

async function syncMatFunnelIncremental(customStart?: string, customEnd?: string): Promise<void> {
  try {
    if (customStart && customEnd) {
      await pool.query(`CALL sp_sync_mat_funnel_range(?, CONCAT(?, ' 23:59:59'))`, [
        `${customStart} 00:00:00`,
        customEnd,
      ]);
    } else {
      await pool.query(
        `CALL sp_sync_mat_funnel_range(DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY))`
      );
    }
  } catch (err: any) {
    console.warn('⚠️ Aviso en syncMatFunnelIncremental:', err.message);
  }
}

function resolveProductosFromServiceFilter(
  serviceParam: string,
  servicioToTipoMap: Map<string, string>
): { srvList: string[]; productosDelTipo: string[]; canonicalList: string[] } {
  const isAll =
    !serviceParam ||
    serviceParam === 'Todos' ||
    serviceParam === 'Todos los servicios';

  const rawSelected = isAll
    ? []
    : serviceParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const canonicalSet = new Set<string>();
  const dbSrvEquivalents = new Set<string>();

  for (const item of rawSelected) {
    const canon = homologarTipoServicio(item) || (servicioToTipoMap.get(item.toUpperCase()) ?? null);
    if (!canon) continue;
    canonicalSet.add(canon);
    dbSrvEquivalents.add(canon);
    const aliases = HOMOLOGACION_INVERSA_DB[canon] || [];
    aliases.forEach((a) => dbSrvEquivalents.add(a.toUpperCase()));
  }

  const productosDelTipo: string[] = [];
  if (canonicalSet.size > 0) {
    servicioToTipoMap.forEach((tipoHomologado, prodKey) => {
      if (canonicalSet.has(tipoHomologado)) {
        productosDelTipo.push(prodKey);
      }
    });
  }

  return {
    srvList: Array.from(dbSrvEquivalents),
    productosDelTipo,
    canonicalList: Array.from(canonicalSet),
  };
}

// In-memory SWR / single-flight (re-exported from config for simplicity)
const inFlightRequests = new Map<string, Promise<any>>();
function inFlightRequestsGet(key: string): Promise<any> | undefined { return inFlightRequests.get(key); }
function inFlightRequestsSet(key: string, p: Promise<any>): void { inFlightRequests.set(key, p); }
function inFlightRequestsDelete(key: string): void { inFlightRequests.delete(key); }
function inFlightRequestsHas(key: string): boolean { return inFlightRequests.has(key); }

const swrMemoryCache = new Map<string, { data: any; freshUntil: number }>();
function swrMemoryCacheGet<T = any>(key: string): { data: T; freshUntil: number } | undefined {
  return swrMemoryCache.get(key);
}
function swrMemoryCacheSet(key: string, val: any, ttl: number): void {
  swrMemoryCache.set(key, { data: val, freshUntil: Date.now() + ttl });
}

export default router;
