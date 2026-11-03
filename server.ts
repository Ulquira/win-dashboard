import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import NodeCache from 'node-cache';
import compression from 'compression';

dotenv.config();

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
  connectionLimit: 10,
});

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

async function loadTipoServicioCache() {
  try {
    const [rows]: any = await pool.query(
      `SELECT Servicio, Tipo FROM tiposervicio WHERE Tipo IS NOT NULL`
    );
    const map = new Map<string, string>();
    const setTipos = new Set<string>();
    for (const r of rows) {
      if (r.Servicio && r.Tipo) {
        map.set(String(r.Servicio).trim().toUpperCase(), String(r.Tipo).trim());
        setTipos.add(String(r.Tipo).trim());
      }
    }
    servicioToTipoMap = map;
    tiposUnicosList = Array.from(setTipos).sort();
    console.log(`✅ Catálogo tiposervicio cargado en memoria (${tiposUnicosList.length} tipos)`);
  } catch (err: any) {
    console.warn('⚠️ No se pudo leer la tabla tiposervicio:', err.message);
  }
}

loadTipoServicioCache();

// 1. Endpoint de catálogos para filtros desplegables
app.get('/api/filters', async (_req, res) => {
  try {
    const cachedFilters = queryCache.get('catalog_filters');
    if (cachedFilters) return res.json(cachedFilters);

    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

    const [zonas]: any = await pool.query(`
      SELECT DISTINCT sector_operativo AS zona
      FROM vw_reporte_funnel_casos_360
      WHERE fecha_solicitud_dia >= CURDATE() - INTERVAL 7 DAY
        AND sector_operativo IS NOT NULL
        AND sector_operativo != ''
      ORDER BY sector_operativo
    `);

    const todayStr = new Date().toLocaleDateString('en-CA');
    const payload = {
      ok: true,
      servicios: tiposUnicosList,
      zonas: zonas.map((z: any) => z.zona),
      dateRange: { minDate: todayStr, maxDate: todayStr },
    };

    queryCache.set('catalog_filters', payload, 3600);
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 2. Endpoint principal del Dashboard
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
    // Calculamos siempre mínimo 7 días hacia atrás desde endDate para la gráfica evolutiva
    const endObj = new Date(`${endDate}T00:00:00`);
    const min7StartObj = new Date(endObj);
    min7StartObj.setDate(min7StartObj.getDate() - 6);
    const min7StartStr = min7StartObj.toISOString().split('T')[0];

    const chartStartDate = startDate < min7StartStr ? startDate : min7StartStr;

    // Filtros para vw_reporte_funnel_casos_360 (v), vw_reprogramaciones_detalle (r) y vw_reporte_encuestas_enriquecido (e)
    const extraFilters: string[] = [];
    const extraParams: any[] = [];
    const reprogFilters: string[] = [];
    const reprogParams: any[] = [];
    const encFilters: string[] = [];
    const encParams: any[] = [];

    if (service && service !== 'Todos los servicios') {
      const productosDelTipo: string[] = [];
      servicioToTipoMap.forEach((tipoVal, prodKey) => {
        if (tipoVal === service) productosDelTipo.push(prodKey);
      });

      if (productosDelTipo.length > 0) {
        const placeholders = productosDelTipo.map(() => '?').join(',');
        extraFilters.push(`AND v.producto IN (${placeholders})`);
        extraParams.push(...productosDelTipo);

        reprogFilters.push(`AND (r.producto_servicio IN (${placeholders}) OR r.tipo_servicio = ?)`);
        reprogParams.push(...productosDelTipo, service);

        encFilters.push(`AND (e.producto IN (${placeholders}) OR e.tipo_servicio = ?)`);
        encParams.push(...productosDelTipo, service);
      } else {
        extraFilters.push(`AND v.producto = ?`);
        extraParams.push(service);

        reprogFilters.push(`AND (r.producto_servicio = ? OR r.tipo_servicio = ?)`);
        reprogParams.push(service, service);

        encFilters.push(`AND (e.producto = ? OR e.tipo_servicio = ?)`);
        encParams.push(service, service);
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

    // Consultas principales a vw_reporte_funnel_casos_360
    const [dailyResult, orderResult]: any = await Promise.all([
      pool.query(
        `
        SELECT 
          DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m') AS fecha,
          COUNT(*) AS total,
          COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS enviados,
          COALESCE(SUM(v.estado_wsp = 'read'), 0) AS leidos,
          COALESCE(SUM(v.estado_wsp = 'sent'), 0) AS sent,
          COALESCE(SUM(v.estado_wsp IN ('delivered', 'deliverd')), 0) AS delivered,
          COALESCE(SUM(v.estado_wsp = 'failed'), 0) AS failed,
          COALESCE(SUM(v.se_envio_wsp = 'NO' OR v.estado_wsp = 'NO ENVIADO' OR v.estado_wsp IS NULL), 0) AS no_enviado,
          COALESCE(SUM(v.ingreso_tracking = 'SI'), 0) AS tracking,
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
          v.orden_id, v.ticket, v.cliente, v.telefono, v.producto,
          v.tipo_trabajo, v.estado_ot,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_solicitud_fmt,
          v.sector_operativo, v.distrito, v.partner, v.cuadrilla,
          v.se_envio_wsp, v.estado_wsp, v.ingreso_tracking, v.link_tracking
        FROM vw_reporte_funnel_casos_360 v
        WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
        ${filterSql}
        LIMIT 80
        `,
        [startDate, endDate, ...extraParams]
      ),
    ]);

    // 3. Consulta a vw_reprogramaciones_detalle
    let totalReprogReal = 0;
    try {
      const [reprogRows]: any = await pool.query(
        `
        SELECT COUNT(*) AS total_reprog
        FROM vw_reprogramaciones_detalle r
        WHERE r.fecha_registro >= ? AND r.fecha_registro < DATE_ADD(?, INTERVAL 1 DAY)
        ${reprogFilters.join(' ')}
        `,
        [startDate, endDate, ...reprogParams]
      );
      totalReprogReal = Number(reprogRows?.[0]?.total_reprog || 0);
    } catch (errReprog: any) {
      console.warn('⚠️ Error consultando vw_reprogramaciones_detalle:', errReprog.message);
    }

    // 4. Consulta a vw_reporte_encuestas_enriquecido para KPI y Ranking de Partners
    let totalEncuestasReal = 0;
    let csatAvgGlobal = 0;
    let partnersRanking: any[] = [];

    try {
      // Primero buscamos en el rango exacto seleccionado (startDate a endDate)
      let [encRows]: any = await pool.query(
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
      );

      totalEncuestasReal = (encRows || []).reduce(
        (acc: number, r: any) => acc + Number(r.surveys || 0),
        0
      );

      const sumPonderada = (encRows || []).reduce(
        (acc: number, r: any) => acc + Number(r.avg_score || 0) * Number(r.surveys || 0),
        0
      );
      csatAvgGlobal = totalEncuestasReal > 0 ? sumPonderada / totalEncuestasReal : 0;

      // Si hoy todavía hay 0 encuestas, cargamos el Ranking de Partners de los últimos 7 días (chartStartDate a endDate)
      if ((!encRows || encRows.length === 0) && chartStartDate < startDate) {
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
        encRows = fallbackRows;
      }

      partnersRanking = (encRows || []).slice(0, 6).map((r: any, idx: number) => {
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

      console.log(`📊 Ranking Partners CSAT cargado (${partnersRanking.length} partners)`);
    } catch (errEnc: any) {
      console.warn('⚠️ Error consultando vw_reporte_encuestas_enriquecido:', errEnc.message);
    }

    const dailyRows: any[] = dailyResult[0] || [];

    // Sumamos para los KPIs únicamente los días dentro del rango exacto seleccionado (startDate..endDate)
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
        reprogramaciones: totalReprogReal,
        encuestas_respondidas: totalEncuestasReal,
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
        reprogramaciones: totalReprogReal,
        encuestas_respondidas: totalEncuestasReal,
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

    const ordersWithTipo = (orderResult[0] || []).map((o: any) => ({
      ...o,
      servicio_tipo:
        servicioToTipoMap.get(String(o.producto || '').trim().toUpperCase()) || o.producto || '-',
    }));

    const responsePayload = {
      ok: true,
      kpis,
      evolution: dailyRows,
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API Azure MySQL lista en http://localhost:${PORT}`);
});