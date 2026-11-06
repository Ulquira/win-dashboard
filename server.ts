import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import NodeCache from 'node-cache';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// Caché en RAM por 5 minutos (300 segundos)
const queryCache = new NodeCache({ stdTTL: 300 });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 15,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  maxIdle: 10,
  idleTimeout: 60000,
});

pool.on('error' as never, (err: unknown) => {
  if (err instanceof Error) {
    console.error('❌ Error imprevisto en el pool de conexiones MySQL:', err.message);
  } else {
    console.error('❌ Error imprevisto en el pool de conexiones MySQL:', String(err));
  }
});

// Variables de Capa Intermedia / API en Azure App Service
const CAPA_INTERMEDIA_URL = (
  process.env.CAPA_INTERMEDIA_URL ||
  process.env.MANTRA_API_URL ||
  'https://webwin-api-service-eus.azurewebsites.net'
).replace(/\/+$/, '');

const SECRET_API_KEY =
  process.env.SECRET_API_KEY ||
  process.env.MANTRA_API_TOKEN ||
  'LLAVE_SECRETA_DEL_TERCERO_123';

// Lista de distritos catalogados como Alto Valor (insensible a mayúsculas/minúsculas)
const DISTRITOS_ALTO_VALOR = [
  'MIRAFLORES',
  'SAN ISIDRO',
  'SANTIAGO DE SURCO',
  'SURCO',
  'LA MOLINA',
  'SAN BORJA',
  'BARRANCO',
  'JESUS MARIA',
  'JESÚS MARÍA',
  'LINCE',
  'MAGDALENA DEL MAR',
  'MAGDALENA',
  'PUEBLO LIBRE',
  'SAN MIGUEL',
  'SURQUILLO',
];

let servicioToTipoMap = new Map<string, string>();
let tiposUnicosList: string[] = [];

const SERVICIOS_PERMITIDOS = [
  'INSTA - LIMA',
  'INSTA - PROV',
  'AVER - LIMA',
  'AVER - PROV',
  'POSTVENTA',
] as const;

const HOMOLOGACION_INVERSA_DB: Record<string, string[]> = {
  'INSTA - LIMA': ['INSTA - LIMA', 'INSTALACION', 'INSTALACIÓN', 'INSTALACIONES'],
  'INSTA - PROV': ['INSTA - PROV', 'PROVINCIA', 'INSTALACION PROVINCIA'],
  'AVER - LIMA': ['AVER - LIMA', 'AVERIAS', 'AVERÍAS', 'AVERIA'],
  'AVER - PROV': ['AVER - PROV', 'AVERIAS PRV', 'AVERÍAS PRV', 'AVERIAS PROV'],
  'POSTVENTA': ['POSTVENTA', 'POST VENTA'],
};

/**
 * Homologa estrictamente a los 5 servicios permitidos.
 * Cualquier otro valor ('NO', 'OTROS', etc.) devuelve null y queda bloqueado.
 */
function homologarTipoServicio(rawTipo: string): string | null {
  const upper = String(rawTipo || '').trim().toUpperCase();
  if (!upper) return null;

  if (
    upper === 'INSTALACION' ||
    upper === 'INSTALACIÓN' ||
    upper === 'INSTALACIONES' ||
    upper === 'INSTA - LIMA' ||
    upper === 'INSTA-LIMA'
  ) {
    return 'INSTA - LIMA';
  }
  if (
    upper === 'PROVINCIA' ||
    upper === 'INSTALACION PROVINCIA' ||
    upper === 'INSTA - PROV' ||
    upper === 'INSTA-PROV'
  ) {
    return 'INSTA - PROV';
  }
  if (
    upper === 'AVERIAS' ||
    upper === 'AVERÍAS' ||
    upper === 'AVERIA' ||
    upper === 'AVER - LIMA' ||
    upper === 'AVER-LIMA'
  ) {
    return 'AVER - LIMA';
  }
  if (
    upper === 'AVERIAS PRV' ||
    upper === 'AVERÍAS PRV' ||
    upper === 'AVERIAS PROV' ||
    upper === 'AVER - PROV' ||
    upper === 'AVER-PROV'
  ) {
    return 'AVER - PROV';
  }
  if (upper === 'POSTVENTA' || upper === 'POST VENTA') {
    return 'POSTVENTA';
  }

  return null;
}

async function loadTipoServicioCache() {
  const map = new Map<string, string>();

  try {
    const [rows]: any = await pool.query(`SELECT * FROM tiposervicio`);
    for (const r of rows || []) {
      const entries = Object.entries(r);
      const srvVal =
        r.Servicio ?? r.servicio ?? r.Producto ?? r.producto ?? entries[0]?.[1];
      const rawTipoVal =
        r.Tipo ?? r.tipo ?? r.Categoria ?? r.categoria ?? entries[1]?.[1] ?? srvVal;

      const tipoHomologado = homologarTipoServicio(String(rawTipoVal || ''));
      if (srvVal && tipoHomologado) {
        map.set(String(srvVal).trim().toUpperCase(), tipoHomologado);
      }
    }
  } catch (err: any) {
    console.warn('⚠️ Aviso leyendo tabla tiposervicio:', err.message);
  }

  servicioToTipoMap = map;
  tiposUnicosList = [...SERVICIOS_PERMITIDOS];
  queryCache.flushAll();
  console.log(`✅ Catálogo bloqueado a 5 servicios oficiales:`, tiposUnicosList.join(' | '));
}

await loadTipoServicioCache();

/**
 * Resuelve productos y tipos permitidos.
 * Si el usuario elige "Todos los servicios", aplica automáticamente el filtro de los 5 servicios
 * para bloquear cualquier registro ajeno ('NO', vacíos u otros).
 */
function resolveProductosFromServiceFilter(serviceParam: string): {
  srvList: string[];
  productosDelTipo: string[];
} {
  const rawSelected =
    serviceParam &&
      serviceParam !== 'Todos' &&
      serviceParam !== 'Todos los servicios'
      ? serviceParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      : [...SERVICIOS_PERMITIDOS];

  const canonicalSet = new Set<string>();
  const dbSrvEquivalents = new Set<string>();

  for (const item of rawSelected) {
    const canon = homologarTipoServicio(item);
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
  };
}

// 1. Endpoint de catálogos para filtros desplegables
app.get('/api/filters', async (_req, res) => {
  try {
    const cachedFilters: any = queryCache.get('catalog_filters');
    if (
      cachedFilters &&
      cachedFilters.ok &&
      Array.isArray(cachedFilters.servicios) &&
      cachedFilters.servicios.length > 0
    ) {
      return res.json(cachedFilters);
    }

    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

    const [zonasRes, partnersRes]: any = await Promise.all([
      pool
        .query(`
          SELECT DISTINCT sector_operativo AS zona
          FROM vw_reporte_funnel_casos_360
          WHERE sector_operativo IS NOT NULL AND TRIM(sector_operativo) != ''
          ORDER BY sector_operativo
        `)
        .catch(() => [[]]),
      pool
        .query(`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(partner), ''), 'SIN PARTNER') AS partner
          FROM vw_reporte_funnel_casos_360
          WHERE partner IS NOT NULL AND TRIM(partner) != ''
          ORDER BY partner
        `)
        .catch(() => [[]]),
    ]);

    const todayStr = new Date().toLocaleDateString('en-CA');
    const zList = (zonasRes?.[0] || []).map((z: any) => z.zona).filter(Boolean);
    const pList = (partnersRes?.[0] || []).map((p: any) => p.partner).filter(Boolean);

    const payload = {
      ok: true,
      servicios: tiposUnicosList,
      zonas: zList,
      sectores: zList,
      partners: pList,
      dateRange: { minDate: todayStr, maxDate: todayStr },
    };

    queryCache.set('catalog_filters', payload, 3600);
    return res.json(payload);
  } catch (error: any) {
    return res.json({
      ok: true,
      servicios: tiposUnicosList,
      zonas: [],
      sectores: [],
      partners: [],
    });
  }
});

// 2. Endpoint principal del Dashboard (Ejecutivo + Operativo)
app.get('/api/dashboard', async (req, res) => {
  const startTime = Date.now();
  const todayDefault = new Date().toLocaleDateString('en-CA');
  const {
    startDate = todayDefault,
    endDate = todayDefault,
    service = 'Todos los servicios',
    zone = 'Todas las zonas',
    refresh = 'false',
  } = req.query as Record<string, string>;

  const cacheKey = `dash_${startDate}_${endDate}_${service}_${zone}`;
  if (refresh !== 'true') {
    const cachedData = queryCache.get(cacheKey);
    if (cachedData) {
      console.log(`🚀 Respuesta instantánea desde RAM (${Date.now() - startTime}ms)`);
      return res.json(cachedData);
    }
  }

  try {
    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

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

    const { srvList, productosDelTipo } = resolveProductosFromServiceFilter(service);

    if (srvList.length > 0) {
      if (productosDelTipo.length > 0) {
        const prodPh = productosDelTipo.map(() => '?').join(',');
        const srvPh = srvList.map(() => '?').join(',');

        extraFilters.push(`AND v.producto IN (${prodPh})`);
        extraParams.push(...productosDelTipo);

        reprogFilters.push(
          `AND (r.producto_servicio IN (${prodPh}) OR r.tipo_servicio IN (${srvPh}))`
        );
        reprogParams.push(...productosDelTipo, ...srvList);

        encFilters.push(
          `AND (e.producto IN (${prodPh}) OR e.tipo_servicio IN (${srvPh}))`
        );
        encParams.push(...productosDelTipo, ...srvList);
      } else {
        const srvPh = srvList.map(() => '?').join(',');
        extraFilters.push(`AND v.producto IN (${srvPh})`);
        extraParams.push(...srvList);

        reprogFilters.push(
          `AND (r.producto_servicio IN (${srvPh}) OR r.tipo_servicio IN (${srvPh}))`
        );
        reprogParams.push(...srvList, ...srvList);

        encFilters.push(
          `AND (e.producto IN (${srvPh}) OR e.tipo_servicio IN (${srvPh}))`
        );
        encParams.push(...srvList, ...srvList);
      }
    }

    if (zone && zone !== 'Todas las zonas') {
      extraFilters.push(`AND v.sector_operativo = ?`);
      extraParams.push(zone);

      reprogFilters.push(`AND r.sector_operativo = ?`);
      reprogParams.push(zone);

      encFilters.push(`AND e.sector_operativo = ?`);
      encParams.push(zone);
    }

    const filterSql = extraFilters.join(' ');
    const avListSql = DISTRITOS_ALTO_VALOR.map((d) => `'${d.trim().toUpperCase()}'`).join(',');

    const [
      dailyResult,
      orderResult,
      estadoOtResult,
      sectorResult,
      productoResult,
      reprogResult,
      encResult,
    ]: any = await Promise.all([
      pool.query(
        `
        SELECT 
          DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m') AS fecha,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_full,
          COUNT(*) AS total,
          COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS enviados,
          COALESCE(SUM(v.estado_wsp = 'read'), 0) AS leidos,
          COALESCE(SUM(v.estado_wsp = 'sent'), 0) AS sent,
          COALESCE(SUM(v.estado_wsp = 'delivered'), 0) AS delivered,
          COALESCE(SUM(v.estado_wsp = 'failed'), 0) AS failed,
          COALESCE(SUM(v.se_envio_wsp = 'NO' OR v.estado_wsp = 'NO ENVIADO' OR v.estado_wsp IS NULL), 0) AS no_enviado,
          COALESCE(SUM(v.ingreso_tracking = 'SI'), 0) AS tracking,
          COALESCE(SUM(UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE')), 0) AS sos_soporte,
          COALESCE(SUM(v.ingreso_tracking = 'SI' AND UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) NOT IN ('SI', 'SÍ', '1', 'TRUE')), 0) AS autogestionados,
          COALESCE(SUM(v.reprogramo = 'SI'), 0) AS reprogramaciones,
          COALESCE(SUM(v.respondio_encuesta = 'SI'), 0) AS encuestas,
          COALESCE(SUM(v.estado_wsp = 'read' AND v.ingreso_tracking = 'NO'), 0) AS leidos_sin_ingreso,
          COALESCE(SUM(UPPER(TRIM(v.distrito)) IN (${avListSql})), 0) AS av_total,
          COALESCE(SUM(UPPER(TRIM(v.distrito)) IN (${avListSql}) AND v.se_envio_wsp = 'SI'), 0) AS av_enviados,
          COALESCE(SUM(UPPER(TRIM(v.distrito)) IN (${avListSql}) AND v.estado_wsp = 'read'), 0) AS av_leidos,
          COALESCE(SUM(UPPER(TRIM(v.distrito)) IN (${avListSql}) AND v.ingreso_tracking = 'SI'), 0) AS av_tracking,
          COALESCE(SUM(UPPER(TRIM(v.distrito)) NOT IN (${avListSql}) OR v.distrito IS NULL), 0) AS pref_total,
          COALESCE(SUM((UPPER(TRIM(v.distrito)) NOT IN (${avListSql}) OR v.distrito IS NULL) AND v.se_envio_wsp = 'SI'), 0) AS pref_enviados,
          COALESCE(SUM((UPPER(TRIM(v.distrito)) NOT IN (${avListSql}) OR v.distrito IS NULL) AND v.estado_wsp = 'read'), 0) AS pref_leidos,
          COALESCE(SUM((UPPER(TRIM(v.distrito)) NOT IN (${avListSql}) OR v.distrito IS NULL) AND v.ingreso_tracking = 'SI'), 0) AS pref_tracking
        FROM vw_reporte_funnel_casos_360 v
        WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
        ${filterSql}
        GROUP BY v.fecha_solicitud_dia
        ORDER BY v.fecha_solicitud_dia ASC
        `,
        [chartStartDate, endDate, ...extraParams]
      ),
      pool.query(
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
        FROM vw_reporte_funnel_casos_360 v
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
        ${filterSql}
        ORDER BY v.orden_id DESC
        LIMIT 300
        `,
        [startDate, endDate, ...extraParams]
      ),
      pool.query(
        `
        SELECT 
          COALESCE(NULLIF(TRIM(v.estado_ot), ''), 'Sin estado') AS estado_ot,
          COUNT(*) AS total,
          COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS enviados,
          COALESCE(SUM(v.estado_wsp = 'read'), 0) AS leidos,
          COALESCE(SUM(v.ingreso_tracking = 'SI'), 0) AS tracking
        FROM vw_reporte_funnel_casos_360 v
        WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
        ${filterSql}
        GROUP BY COALESCE(NULLIF(TRIM(v.estado_ot), ''), 'Sin estado')
        ORDER BY total DESC
        `,
        [startDate, endDate, ...extraParams]
      ),
      pool.query(
        `
        SELECT 
          COALESCE(NULLIF(TRIM(v.sector_operativo), ''), 'SIN SECTOR') AS sector_operativo,
          COUNT(*) AS total,
          COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS enviados,
          COALESCE(SUM(v.se_envio_wsp = 'NO' OR v.estado_wsp = 'NO ENVIADO' OR v.estado_wsp IS NULL), 0) AS no_enviados,
          COALESCE(SUM(v.ingreso_tracking = 'SI'), 0) AS tracking,
          COALESCE(SUM(v.estado_wsp = 'read'), 0) AS leidos
        FROM vw_reporte_funnel_casos_360 v
        WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
        ${filterSql}
        GROUP BY COALESCE(NULLIF(TRIM(v.sector_operativo), ''), 'SIN SECTOR')
        ORDER BY total DESC
        `,
        [startDate, endDate, ...extraParams]
      ),
      pool.query(
        `
        SELECT 
          UPPER(TRIM(COALESCE(v.producto, ''))) AS producto,
          COUNT(*) AS total,
          COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS enviados
        FROM vw_reporte_funnel_casos_360 v
        WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
        ${filterSql}
        GROUP BY UPPER(TRIM(COALESCE(v.producto, '')))
        `,
        [startDate, endDate, ...extraParams]
      ),
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
            TRIM(e.partner) AS partner,
            COUNT(*) AS surveys,
            AVG(e.satisfaccion_general + 0) AS avg_score
          FROM vw_reporte_encuestas_enriquecido e
          WHERE e.fecha_registro_encuesta_dia >= ? AND e.fecha_registro_encuesta_dia <= ?
            AND e.partner IS NOT NULL AND TRIM(e.partner) != ''
          ${encFilters.join(' ')}
          GROUP BY TRIM(e.partner)
          ORDER BY avg_score DESC, surveys DESC
          `,
          [startDate, endDate, ...encParams]
        )
        .catch((err: any) => {
          console.warn('⚠️ Error consultando vw_reporte_encuestas_enriquecido:', err.message);
          return [[]];
        }),
    ]);

    const totalReprogReal = Number(reprogResult?.[0]?.[0]?.total_reprog || 0);

    let encRows: any[] = encResult?.[0] || [];
    const totalEncuestasReal = encRows.reduce(
      (acc: number, r: any) => acc + Number(r.surveys || 0),
      0
    );

    const sumPonderada = encRows.reduce(
      (acc: number, r: any) => acc + Number(r.avg_score || 0) * Number(r.surveys || 0),
      0
    );
    const csatAvgGlobal = totalEncuestasReal > 0 ? sumPonderada / totalEncuestasReal : 0;

    if (encRows.length === 0 && chartStartDate < startDate) {
      try {
        const [fallbackRows]: any = await pool.query(
          `
          SELECT 
            TRIM(e.partner) AS partner,
            COUNT(*) AS surveys,
            AVG(e.satisfaccion_general + 0) AS avg_score
          FROM vw_reporte_encuestas_enriquecido e
          WHERE e.fecha_registro_encuesta_dia >= ? AND e.fecha_registro_encuesta_dia <= ?
            AND e.partner IS NOT NULL AND TRIM(e.partner) != ''
          ${encFilters.join(' ')}
          GROUP BY TRIM(e.partner)
          ORDER BY avg_score DESC, surveys DESC
          `,
          [chartStartDate, endDate, ...encParams]
        );
        encRows = fallbackRows || [];
      } catch (errFallback: any) {
        console.warn('⚠️ Error consultando fallback de encuestas:', errFallback.message);
      }
    }

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

    const dailyRows: any[] = dailyResult[0] || [];
    const kpiRowsInRange = dailyRows.filter(
      (r) => r.raw_date >= startDate && r.raw_date <= endDate
    );

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

    if (totalReprogReal > 0) {
      kpis.reprogramaciones = totalReprogReal;
    }
    if (totalEncuestasReal > 0) {
      kpis.encuestas_respondidas = totalEncuestasReal;
    }

    const ordersWithTipo = (orderResult[0] || []).map((o: any) => ({
      ...o,
      servicio_tipo:
        servicioToTipoMap.get(String(o.producto || '').trim().toUpperCase()) || o.producto || '-',
    }));

    const tipoOpMap = new Map<string, { total: number; enviados: number }>();
    for (const r of productoResult[0] || []) {
      const prodKey = String(r.producto || '').trim().toUpperCase();
      const tipoNombre = servicioToTipoMap.get(prodKey) || prodKey || 'OTROS';
      const cur = tipoOpMap.get(tipoNombre) || { total: 0, enviados: 0 };
      cur.total += Number(r.total || 0);
      cur.enviados += Number(r.enviados || 0);
      tipoOpMap.set(tipoNombre, cur);
    }

    const byTipoOperacion = Array.from(tipoOpMap.entries())
      .map(([tipo, val]) => ({
        tipo,
        total: val.total,
        enviados: val.enviados,
      }))
      .sort((a, b) => b.total - a.total);

    const responsePayload = {
      ok: true,
      kpis,
      evolution: dailyRows,
      dailyInRange: kpiRowsInRange,
      byEstadoOt: estadoOtResult[0] || [],
      bySector: sectorResult[0] || [],
      byTipoOperacion,
      orders: ordersWithTipo,
      partners: partnersRanking,
    };

    queryCache.set(cacheKey, responsePayload);
    console.log(`⚡ Consulta Azure completada y guardada en caché en ${Date.now() - startTime}ms`);

    res.json(responsePayload);
  } catch (error: any) {
    console.error('❌ Error SQL en /api/dashboard:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 3. Endpoint de Búsqueda Paginada de Órdenes (/api/orders/search) requerido por OrdersView.tsx
app.get('/api/orders/search', async (req, res) => {
  try {
    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

    const todayIso = new Date().toLocaleDateString('en-CA');
    const rawStart = String(req.query.startDate || '').trim();
    const rawEnd = String(req.query.endDate || '').trim();

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : todayIso;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : todayIso;

    const service = String(req.query.service || 'Todos los servicios').trim();
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

    const { srvList, productosDelTipo } = resolveProductosFromServiceFilter(service);
    if (srvList.length > 0) {
      if (productosDelTipo.length > 0) {
        const ph = productosDelTipo.map(() => '?').join(',');
        whereClauses.push(`v.producto IN (${ph})`);
        params.push(...productosDelTipo);
      } else {
        const ph = srvList.map(() => '?').join(',');
        whereClauses.push(`(v.tipo_operacion IN (${ph}) OR v.producto IN (${ph}))`);
        params.push(...srvList, ...srvList);
      }
    }

    if (fOrden) {
      const likeOrd = `%${fOrden}%`;
      whereClauses.push(
        `(CAST(v.orden_id AS CHAR) LIKE ? OR v.ticket LIKE ? OR w.CodiSegui LIKE ?)`
      );
      params.push(likeOrd, likeOrd, likeOrd);
    }

    if (fCliente) {
      const likeCli = `%${fCliente}%`;
      whereClauses.push(
        `(v.cliente LIKE ? OR v.telefono LIKE ? OR w.\`Número Documento\` LIKE ? OR w.CodiSeguiClien LIKE ? OR w.CodiClien LIKE ?)`
      );
      params.push(likeCli, likeCli, likeCli, likeCli, likeCli);
    }

    if (fOperacion && fOperacion !== 'Todos') {
      const opItems = fOperacion.split(',').map((s) => s.trim()).filter(Boolean);
      const { productosDelTipo: opProds } = resolveProductosFromServiceFilter(opItems.join(','));
      const combined = Array.from(new Set([...opItems, ...opProds]));
      if (combined.length > 0) {
        const ph = combined.map(() => '?').join(',');
        whereClauses.push(`(UPPER(TRIM(v.producto)) IN (${ph}) OR UPPER(TRIM(v.tipo_operacion)) IN (${ph}))`);
        params.push(...combined.map((x) => x.toUpperCase()), ...combined.map((x) => x.toUpperCase()));
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
        whereClauses.push(`COALESCE(NULLIF(TRIM(v.partner), ''), NULLIF(TRIM(w.Proveedeor), ''), 'SIN PARTNER') IN (${ph})`);
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
        w.\`Número Documento\` LIKE ? OR
        w.CodiSeguiClien LIKE ? OR
        w.CodiSegui LIKE ? OR
        w.Cuadrilla LIKE ? OR
        w.\`Datos Técnicos\` LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countResult, rowsResult]: any = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*) AS total
        FROM vw_reporte_funnel_casos_360 v
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        ${whereSql}
        `,
        params
      ),
      pool.query(
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
        FROM vw_reporte_funnel_casos_360 v
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        ${whereSql}
        ORDER BY v.orden_id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    const total = Number(countResult?.[0]?.[0]?.total || 0);
    const rows = (rowsResult?.[0] || []).map((o: any) => ({
      ...o,
      servicio_tipo:
        servicioToTipoMap.get(String(o.producto || '').trim().toUpperCase()) ||
        o.tipo_operacion ||
        o.producto ||
        '-',
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

// 4. Endpoint de Búsqueda Paginada (50 en 50) para Seguimiento (Cruzando con historial_chats_mantra)
app.get('/api/tracking/search', async (req, res) => {
  try {
    const todayIso = new Date().toLocaleDateString('en-CA');
    const rawStart = String(req.query.startDate || '').trim();
    const rawEnd = String(req.query.endDate || '').trim();

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : todayIso;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : todayIso;

    const rawService = String(req.query.service || '').trim();
    const rawZone = String(req.query.zone || '').trim();
    const service = !rawService || rawService === 'undefined' ? 'Todos los servicios' : rawService;
    const zone = !rawZone || rawZone === 'undefined' ? 'Todas las zonas' : rawZone;

    const q = String(req.query.q || '').trim();
    const ignoreDates = req.query.ignoreDates === 'true';
    const fEstadoChat = String(req.query.estadoChat || 'Todos');
    const fSla = String(req.query.sla || 'Todos');
    const fTurno = String(req.query.turno || 'Todos');
    const fSoloConChat = req.query.soloConChat === 'true';
    const fSoloSos = req.query.soloSos === 'true';
    const fSoloLogChat = req.query.soloLogChat === 'true';

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (!ignoreDates) {
      whereClauses.push('v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?');
      params.push(startDate, endDate);
    }

    const { srvList, productosDelTipo } = resolveProductosFromServiceFilter(service);
    if (srvList.length > 0) {
      const allSrvTokens = Array.from(new Set([...srvList, ...productosDelTipo]));
      const ph = allSrvTokens.map(() => '?').join(',');
      whereClauses.push(`(v.tipo_operacion IN (${ph}) OR v.producto IN (${ph}))`);
      params.push(...allSrvTokens, ...allSrvTokens);
    }

    if (zone !== 'Todas las zonas') {
      whereClauses.push('(v.sector_operativo = ? OR v.distrito = ?)');
      params.push(zone, zone);
    }

    if (fSoloConChat) {
      whereClauses.push('(h.orden_id IS NOT NULL OR h.phone IS NOT NULL OR lc.orden_id IS NOT NULL)');
    }

    if (fSoloSos) {
      whereClauses.push("(UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE') OR lc.orden_id IS NOT NULL)");
    }

    if (fSoloLogChat) {
      whereClauses.push('lc.orden_id IS NOT NULL');
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
      whereClauses.push("UPPER(COALESCE(h.quien_tiene_la_palabra, '')) LIKE ?");
      params.push(`%${fTurno.toUpperCase()}%`);
    }

    if (q) {
      const likeQ = `%${q}%`;
      whereClauses.push(`(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.cliente LIKE ? OR
        v.telefono LIKE ? OR
        h.phone LIKE ? OR
        w.\`Número Documento\` LIKE ? OR
        w.CodiSeguiClien LIKE ? OR
        w.Cuadrilla LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const logsChatSubquery = `
      LEFT JOIN (
        SELECT l1.*
        FROM logs_chat l1
        INNER JOIN (
          SELECT orden_id, MAX(id) AS max_id
          FROM logs_chat
          GROUP BY orden_id
        ) l2 ON l1.id = l2.max_id
      ) lc ON lc.orden_id = v.orden_id
    `;

    const [countResult, rowsResult]: any = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*) AS total
        FROM vw_reporte_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        ${logsChatSubquery}
        ${whereSql}
        `,
        params
      ),
      pool.query(
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
          lc.mensajes_json AS log_mensajes_json,
          lc.updated_at AS log_updated_at
        FROM vw_reporte_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        ${logsChatSubquery}
        ${whereSql}
        ORDER BY (lc.id IS NOT NULL) DESC, (h.ultimos_mensajes_json IS NOT NULL) DESC, v.orden_id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    const total = Number(countResult?.[0]?.[0]?.total || 0);
    const rows = (rowsResult?.[0] || []).map((r: any) => ({
      ...r,
      ultimos_mensajes_json: r.chat_json_mantra || r.ultimos_mensajes_json || null,
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
    console.error('❌ Error en /api/tracking/search:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 5. Endpoint Live contra CAPA_INTERMEDIA_URL + Fallback BD usando config_plantillas_mantra e historial_chats_mantra
app.get('/api/4dm1n_/mantra-chat', async (req, res) => {
  try {
    const rawPhone = String(req.query.phone || '').replace(/\D/g, '');
    const phone9 = rawPhone.slice(-9);
    const ordenId = req.query.ordenId ? Number(req.query.ordenId) : null;
    const grupoServicio = String(req.query.grupoServicio || 'GENERAL').trim();
    const limit = Number(req.query.limit) || 1000;

    if (!phone9 && !ordenId) {
      return res.status(400).json({ ok: false, error: 'Parámetro phone u ordenId requerido' });
    }

    let apiKey: string = SECRET_API_KEY;
    let groupId: string | null = null;
    try {
      const [cfgRows]: any = await pool.query(
        `
        SELECT group_id, api_key, tipo_servicio
        FROM config_plantillas_mantra
        WHERE UPPER(tipo_servicio) LIKE ? OR ? LIKE CONCAT('%', UPPER(tipo_servicio), '%')
        LIMIT 1
        `,
        [`%${grupoServicio.toUpperCase()}%`, grupoServicio.toUpperCase()]
      );
      if (cfgRows?.[0]) {
        apiKey = cfgRows[0].api_key || apiKey;
        groupId = cfgRows[0].group_id || null;
      } else {
        const [fallbackCfg]: any = await pool.query(
          `SELECT group_id, api_key FROM config_plantillas_mantra WHERE api_key IS NOT NULL LIMIT 1`
        );
        if (fallbackCfg?.[0]) {
          apiKey = fallbackCfg[0].api_key || apiKey;
          groupId = fallbackCfg[0].group_id || null;
        }
      }
    } catch (cfgErr: any) {
      console.warn('⚠️ No se pudieron consultar credenciales dinámicas en config_plantillas_mantra:', cfgErr.message);
    }

    if (CAPA_INTERMEDIA_URL && apiKey) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const baseEndpoint = CAPA_INTERMEDIA_URL.includes('/api/')
          ? CAPA_INTERMEDIA_URL
          : `${CAPA_INTERMEDIA_URL}/api/4dm1n_/mantra-chat`;

        const liveUrl = `${baseEndpoint}?phone=${encodeURIComponent(
          rawPhone
        )}&ordenId=${encodeURIComponent(String(ordenId || ''))}&group_id=${encodeURIComponent(
          groupId || grupoServicio
        )}&grupoServicio=${encodeURIComponent(grupoServicio)}&limit=${limit}`;

        const liveRes = await fetch(liveUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'x-api-key': apiKey,
            'x-secret-api-key': SECRET_API_KEY,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          const msgs = Array.isArray(liveData)
            ? liveData
            : liveData.messages || liveData.data || liveData.ultimos_mensajes_json || [];
          if (Array.isArray(msgs) && msgs.length > 0) {
            return res.json({
              ok: true,
              source: 'live_api',
              groupId,
              chatMeta: liveData.chatMeta || null,
              messages: msgs.slice(-limit),
            });
          }
        }
      } catch (liveErr: any) {
        clearTimeout(timeout);
        console.warn('⚠️ Falló llamada a API Mantra en vivo:', liveErr.message);
      }
    }

    const [chatRows]: any = await pool.query(
      `
      SELECT *
      FROM historial_chats_mantra
      WHERE (${ordenId ? 'orden_id = ? OR ' : ''} phone LIKE ?)
      ORDER BY orden_id DESC
      LIMIT 1
      `,
      ordenId ? [ordenId, `%${phone9}%`] : [`%${phone9}%`]
    );

    const chatRecord = chatRows?.[0] || null;
    let messages: any[] = [];

    if (chatRecord?.ultimos_mensajes_json) {
      try {
        const parsed =
          typeof chatRecord.ultimos_mensajes_json === 'string'
            ? JSON.parse(chatRecord.ultimos_mensajes_json)
            : chatRecord.ultimos_mensajes_json;
        if (Array.isArray(parsed)) {
          messages = parsed.slice(-limit);
        } else if (parsed && Array.isArray(parsed.messages)) {
          messages = parsed.messages.slice(-limit);
        }
      } catch (parseErr: any) {
        console.warn('⚠️ Error al parsear JSON de chat en fallback:', parseErr.message);
      }
    }

    return res.json({
      ok: true,
      source: 'db_fallback',
      chatMeta: chatRecord
        ? {
          estado_chat: chatRecord.estado_chat,
          semaforo_sla: chatRecord.semaforo_sla,
          quien_tiene_la_palabra: chatRecord.quien_tiene_la_palabra,
          phone: chatRecord.phone,
          orden_id: chatRecord.orden_id,
          ticket: chatRecord.ticket,
        }
        : null,
      messages,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 6. Endpoint exclusivo de Operaciones usando las columnas exactas de vw_winordetraba
app.get('/api/operations', async (req, res) => {
  const startTime = Date.now();
  const todayDefault = new Date().toLocaleDateString('en-CA');
  const {
    startDate = todayDefault,
    endDate = todayDefault,
    service = 'Todos los servicios',
    q = '',
    ignoreDates = 'false',
    refresh = 'false',
  } = req.query as Record<string, string>;

  const searchQ = String(q || '').trim();
  const cacheKey = `ops_raw_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}`;
  if (refresh !== 'true') {
    const cached = queryCache.get(cacheKey);
    if (cached) return res.json(cached);
  }

  try {
    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

    // Expresión de fecha sobre w.`F.Soli` (con fallback a w.`F.Visita`) compatible con YYYY-MM-DD y DD/MM/YYYY
    const rawDateCol = `COALESCE(NULLIF(TRIM(CAST(w.\`F.Soli\` AS CHAR)), ''), NULLIF(TRIM(CAST(w.\`F.Visita\` AS CHAR)), ''))`;
    const dateExpr = `COALESCE(
      STR_TO_DATE(SUBSTRING_INDEX(${rawDateCol}, ' ', 1), '%Y-%m-%d'),
      STR_TO_DATE(SUBSTRING_INDEX(${rawDateCol}, ' ', 1), '%d/%m/%Y'),
      DATE(w.\`F.Soli\`)
    )`;

    const colEstado = `COALESCE(NULLIF(TRIM(w.\`Estado OT\`), ''), NULLIF(TRIM(w.Estado), ''), 'SIN ESTADO')`;
    const colPartner = `COALESCE(NULLIF(TRIM(w.Proveedeor), ''), NULLIF(TRIM(w.Empresa), ''), 'SIN PARTNER')`;
    const colCuadrilla = `COALESCE(NULLIF(TRIM(w.Cuadrilla_nombre), ''), NULLIF(TRIM(w.Cuadrilla), ''))`;
    const colZona = `COALESCE(NULLIF(TRIM(w.\`Sector Operativo\`), ''), NULLIF(TRIM(w.Localidad), ''), NULLIF(TRIM(w.Zona), ''), NULLIF(TRIM(w.Provincia), ''), 'SIN ZONA')`;

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
      whereClauses.push(`${dateExpr} >= ? AND ${dateExpr} <= ?`);
      queryParams.push(startDate, endDate);

      chartWhereClauses.push(`${dateExpr} >= ? AND ${dateExpr} <= ?`);
      chartParams.push(chartStartDate, endDate);
    }

    const { srvList, productosDelTipo } = resolveProductosFromServiceFilter(service);
    if (srvList.length > 0) {
      const allTokens = Array.from(new Set([...srvList, ...productosDelTipo])).map((t) => t.toUpperCase());
      const ph = allTokens.map(() => '?').join(',');
      const srvFilter = `(UPPER(TRIM(w.Producto)) IN (${ph}) OR UPPER(TRIM(w.\`Motivo Trabajo\`)) IN (${ph}) OR UPPER(TRIM(w.TipoTraba)) IN (${ph}))`;
      whereClauses.push(srvFilter);
      queryParams.push(...allTokens, ...allTokens, ...allTokens);

      chartWhereClauses.push(srvFilter);
      chartParams.push(...allTokens, ...allTokens, ...allTokens);
    }

    if (searchQ) {
      const likeQ = `%${searchQ}%`;
      const qClause = `(
        CAST(w.OrdenId AS CHAR) LIKE ? OR
        w.CodiSegui LIKE ? OR
        w.CodiSeguiClien LIKE ? OR
        w.CodiClien LIKE ? OR
        w.Cliente LIKE ? OR
        w.\`Número Documento\` LIKE ? OR
        w.TeleMovilNume LIKE ? OR
        w.Cuadrilla LIKE ? OR
        w.Cuadrilla_nombre LIKE ? OR
        w.Proveedeor LIKE ?
      )`;
      const qArgs = [likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ];
      whereClauses.push(qClause);
      queryParams.push(...qArgs);

      chartWhereClauses.push(qClause);
      chartParams.push(...qArgs);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const chartWhereSql = chartWhereClauses.length > 0 ? `WHERE ${chartWhereClauses.join(' AND ')}` : '';

    // Clasificación de estados reales de vw_winordetraba
    const isFin = `(LOWER(${colEstado}) LIKE '%finaliz%' OR LOWER(${colEstado}) LIKE '%atendid%' OR LOWER(${colEstado}) LIKE '%complet%' OR LOWER(${colEstado}) LIKE '%cerrad%' OR LOWER(${colEstado}) LIKE '%ok%')`;
    const isCurso = `(LOWER(${colEstado}) LIKE '%iniciad%' OR LOWER(${colEstado}) LIKE '%camino%' OR LOWER(${colEstado}) LIKE '%ruta%' OR LOWER(${colEstado}) LIKE '%ejecuc%' OR LOWER(${colEstado}) LIKE '%proceso%')`;
    const isCancel = `(LOWER(${colEstado}) LIKE '%cancel%' OR LOWER(${colEstado}) LIKE '%anul%' OR LOWER(${colEstado}) LIKE '%rechaz%' OR LOWER(${colEstado}) LIKE '%quiebre%' OR LOWER(${colEstado}) LIKE '%suspens%')`;
    const isAgend = `(NOT ${isFin} AND NOT ${isCurso} AND NOT ${isCancel})`;

    // Expresiones explícitas para GROUP BY estricto (sql_mode=only_full_group_by)
    const rawDateGroupExpr = `DATE_FORMAT(${dateExpr}, '%Y-%m-%d')`;
    const cuadrillaGroupExpr = `COALESCE(${colCuadrilla}, 'SIN ASIGNAR')`;
    const motivoTrabajoGroupExpr = `UPPER(COALESCE(NULLIF(TRIM(w.Producto), ''), NULLIF(TRIM(w.\`Motivo Trabajo\`), ''), 'OTROS'))`;
    const motivoFinGroupExpr = `COALESCE(
      NULLIF(TRIM(w.\`Motivo Finalización\`), ''),
      NULLIF(TRIM(w.\`Motivo Cancelación\`), ''),
      NULLIF(TRIM(w.\`Motivo Regestión\`), ''),
      NULLIF(TRIM(w.\`Diagnóstico Técnico\`), ''),
      'Sin especificar'
    )`;

    const [
      summaryRes,
      estadosRes,
      dailyRes,
      partnerRes,
      zonaRes,
      cuadrillasRes,
      motivosRes,
      cierreRes,
    ]: any = await Promise.all([
      // 1. KPIs Globales
      pool.query(
        `
        SELECT
          COUNT(*) AS total_ordenes,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCurso}), 0) AS en_curso,
          COALESCE(SUM(${isAgend}), 0) AS agendadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas_activas,
          COUNT(DISTINCT NULLIF(TRIM(w.Proveedeor), '')) AS partners_activos,
          COUNT(DISTINCT ${colZona}) AS zonas_activas
        FROM vw_winordetraba w
        ${whereSql}
        `,
        queryParams
      ),

      // 2. Desglose por Estado OT
      pool.query(
        `
        SELECT
          ${colEstado} AS estado,
          COUNT(*) AS total,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
        FROM vw_winordetraba w
        ${whereSql}
        GROUP BY ${colEstado}
        ORDER BY total DESC
        `,
        queryParams
      ),

      // 3. Avance Diario (100% compatible con ONLY_FULL_GROUP_BY)
      pool.query(
        `
        SELECT
          ${rawDateGroupExpr} AS raw_date,
          MAX(DATE_FORMAT(${dateExpr}, '%d/%m')) AS fecha,
          MAX(DATE_FORMAT(${dateExpr}, '%d/%m/%Y')) AS fecha_full,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCurso}), 0) AS en_curso,
          COALESCE(SUM(${isAgend}), 0) AS agendadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
        FROM vw_winordetraba w
        ${chartWhereSql}
        GROUP BY ${rawDateGroupExpr}
        HAVING raw_date IS NOT NULL
        ORDER BY raw_date ASC
        `,
        chartParams
      ),

      // 4. Productividad y Efectividad por Partner (Proveedeor)
      pool.query(
        `
        SELECT
          ${colPartner} AS partner,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCurso}), 0) AS en_curso,
          COALESCE(SUM(${isAgend}), 0) AS agendadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
        FROM vw_winordetraba w
        ${whereSql}
        GROUP BY ${colPartner}
        ORDER BY total DESC
        `,
        queryParams
      ),

      // 5. Rendimiento por Zona / Sector Operativo / Localidad
      pool.query(
        `
        SELECT
          ${colZona} AS zona,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCurso}), 0) AS en_curso,
          COALESCE(SUM(${isAgend}), 0) AS agendadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
        FROM vw_winordetraba w
        ${whereSql}
        GROUP BY ${colZona}
        ORDER BY total DESC
        LIMIT 30
        `,
        queryParams
      ),

      // 6. Top 15 Cuadrillas más productivas
      pool.query(
        `
        SELECT
          ${cuadrillaGroupExpr} AS cuadrilla,
          MAX(${colPartner}) AS partner,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCurso}), 0) AS en_curso,
          COALESCE(SUM(${isCancel}), 0) AS canceladas
        FROM vw_winordetraba w
        ${whereSql}
        GROUP BY ${cuadrillaGroupExpr}
        HAVING cuadrilla != 'SIN ASIGNAR'
        ORDER BY finalizadas DESC, total DESC
        LIMIT 15
        `,
        queryParams
      ),

      // 7. Distribución por Producto / Motivo Trabajo
      pool.query(
        `
        SELECT
          ${motivoTrabajoGroupExpr} AS motivo_trabajo,
          MAX(COALESCE(NULLIF(TRIM(w.Tipo), ''), 'RESIDENCIAL')) AS segmento,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
        FROM vw_winordetraba w
        ${whereSql}
        GROUP BY ${motivoTrabajoGroupExpr}
        ORDER BY total DESC
        LIMIT 15
        `,
        queryParams
      ),

      // 8. Top Motivos de Finalización / Cancelación / Regestión
      pool.query(
        `
        SELECT
          ${motivoFinGroupExpr} AS motivo_fin,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas
        FROM vw_winordetraba w
        ${whereSql}
        GROUP BY ${motivoFinGroupExpr}
        ORDER BY total DESC
        LIMIT 10
        `,
        queryParams
      ),
    ]);

    const kpisRaw = summaryRes?.[0]?.[0] || {};
    const totalOrdenes = Number(kpisRaw.total_ordenes || 0);
    const finalizadas = Number(kpisRaw.finalizadas || 0);
    const enCurso = Number(kpisRaw.en_curso || 0);
    const agendadas = Number(kpisRaw.agendadas || 0);
    const canceladas = Number(kpisRaw.canceladas || 0);
    const cuadrillasActivas = Number(kpisRaw.cuadrillas_activas || 0);

    const payload = {
      ok: true,
      source: 'vw_winordetraba',
      kpis: {
        total_ordenes: totalOrdenes,
        finalizadas,
        en_curso: enCurso,
        agendadas,
        canceladas,
        cuadrillas_activas: cuadrillasActivas,
        partners_activos: Number(kpisRaw.partners_activos || 0),
        zonas_activas: Number(kpisRaw.zonas_activas || 0),
        efectividad_pct: totalOrdenes > 0 ? Number(((finalizadas / totalOrdenes) * 100).toFixed(1)) : 0,
        cancelacion_pct: totalOrdenes > 0 ? Number(((canceladas / totalOrdenes) * 100).toFixed(1)) : 0,
        prod_ot_por_cuadrilla: cuadrillasActivas > 0 ? Number((totalOrdenes / cuadrillasActivas).toFixed(1)) : 0,
        prod_fin_por_cuadrilla: cuadrillasActivas > 0 ? Number((finalizadas / cuadrillasActivas).toFixed(1)) : 0,
      },
      byEstado: estadosRes?.[0] || [],
      daily: (dailyRes?.[0] || []).map((d: any) => {
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
      byPartner: (partnerRes?.[0] || []).map((p: any) => {
        const tot = Number(p.total || 0);
        const fin = Number(p.finalizadas || 0);
        const crw = Number(p.cuadrillas || 0);
        return {
          ...p,
          total: tot,
          finalizadas: fin,
          en_curso: Number(p.en_curso || 0),
          agendadas: Number(p.agendadas || 0),
          canceladas: Number(p.canceladas || 0),
          cuadrillas: crw,
          efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
          prod_total: crw > 0 ? Number((tot / crw).toFixed(1)) : 0,
          prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
        };
      }),
      byZona: (zonaRes?.[0] || []).map((z: any) => {
        const tot = Number(z.total || 0);
        const fin = Number(z.finalizadas || 0);
        const crw = Number(z.cuadrillas || 0);
        return {
          ...z,
          total: tot,
          finalizadas: fin,
          en_curso: Number(z.en_curso || 0),
          agendadas: Number(z.agendadas || 0),
          canceladas: Number(z.canceladas || 0),
          cuadrillas: crw,
          efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
          prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
        };
      }),
      topCuadrillas: (cuadrillasRes?.[0] || []).map((c: any) => {
        const tot = Number(c.total || 0);
        const fin = Number(c.finalizadas || 0);
        return {
          ...c,
          total: tot,
          finalizadas: fin,
          en_curso: Number(c.en_curso || 0),
          canceladas: Number(c.canceladas || 0),
          efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
        };
      }),
      byMotivoTrabajo: (motivosRes?.[0] || []).map((m: any) => {
        const prodKey = String(m.motivo_trabajo || '').trim().toUpperCase();
        const tipoMapeado = servicioToTipoMap.get(prodKey) || prodKey || 'OTROS';
        return {
          ...m,
          tipo_operacion: tipoMapeado,
        };
      }),
      byMotivoFin: cierreRes?.[0] || [],
    };

    queryCache.set(cacheKey, payload);
    console.log(`⚡ /api/operations (vw_winordetraba) completado en ${Date.now() - startTime}ms`);
    return res.json(payload);
  } catch (error: any) {
    console.error('❌ Error en /api/operations:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Servir archivos estáticos del Frontend compilado (dist) en producción (Azure App Service)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get(/(.*)/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

async function warmupCache() {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    console.log(`🔥 Precalentando catálogo y caché para: ${today}`);
    if (tiposUnicosList.length === 0) await loadTipoServicioCache();
    if (!queryCache.get('catalog_filters')) {
      const [zonas, partners]: any = await Promise.all([
        pool.query(`
          SELECT DISTINCT sector_operativo AS zona
          FROM vw_reporte_funnel_casos_360
          WHERE sector_operativo IS NOT NULL AND TRIM(sector_operativo) != ''
          ORDER BY sector_operativo
        `),
        pool.query(`
          SELECT DISTINCT TRIM(partner) AS partner
          FROM vw_reporte_encuestas_enriquecido
          WHERE partner IS NOT NULL AND TRIM(partner) != ''
          ORDER BY partner
        `),
      ]);
      const zList = (zonas[0] || []).map((r: any) => r.zona).filter(Boolean);
      const pList = (partners[0] || []).map((r: any) => r.partner).filter(Boolean);
      queryCache.set('catalog_filters', {
        ok: true,
        servicios: tiposUnicosList,
        zonas: zList,
        sectores: zList,
        partners: pList,
      }, 3600);
      console.log('🔥 Catálogo de filtros precalentado en RAM con éxito.');
    }
  } catch (err: any) {
    console.warn('⚠️ Aviso durante warmup:', err.message);
  }
}

const PORT = Number(process.env.PORT || process.env.WEBSITES_PORT || 8080);
app.listen(PORT, () => {
  console.log(`✅ Servidor WIN en RUTA activo en puerto ${PORT} (Capa Intermedia: ${CAPA_INTERMEDIA_URL})`);
  warmupCache().catch(() => { });
});