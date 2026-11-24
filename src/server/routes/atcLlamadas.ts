import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { requireAuth, requireAdmin } from '../auth/middleware';
import { cacheFlushAll } from '../config/cache';
import { getVirtualTipoOperacionSql } from '../domain/index';
import { buildXlsxBuffer } from './cohorts';

const router = Router();

let tablesChecked = false;
async function ensureAtcTables(): Promise<void> {
  if (tablesChecked) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS atc_llamadas (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      id_reg VARCHAR(80) NULL,
      fecha DATE NULL,
      hora TIME NULL,
      telf_cliente VARCHAR(30) NULL,
      dni_cliente VARCHAR(25) NULL,
      dni_asesor VARCHAR(25) NULL,
      nom_ape VARCHAR(180) NULL,
      medio VARCHAR(80) NULL,
      tipo VARCHAR(100) NULL,
      motivo VARCHAR(180) NULL,
      comentario_llamada TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_atc_id_reg (id_reg),
      INDEX idx_atc_fecha (fecha),
      INDEX idx_atc_telf (telf_cliente),
      INDEX idx_atc_dni_cliente (dni_cliente),
      INDEX idx_atc_tipo_motivo (tipo, motivo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mat_atc_llamadas_360 (
      id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      id_reg VARCHAR(80) NULL,
      fecha_llamada DATE NULL,
      hora_llamada TIME NULL,
      telf_cliente VARCHAR(30) NULL,
      dni_cliente VARCHAR(25) NULL,
      dni_asesor VARCHAR(25) NULL,
      nom_ape_asesor VARCHAR(180) NULL,
      medio VARCHAR(80) NULL,
      tipo_llamada VARCHAR(100) NULL,
      motivo_llamada VARCHAR(180) NULL,
      comentario_llamada TEXT NULL,
      tiene_orden TINYINT(1) NOT NULL DEFAULT 0,
      en_ventana_operativa TINYINT(1) NOT NULL DEFAULT 0,
      tipo_match VARCHAR(35) NOT NULL DEFAULT 'SIN_ORDEN',
      dias_diferencia INT NULL,
      orden_id BIGINT NULL,
      ticket VARCHAR(150) NULL,
      cliente VARCHAR(255) NULL,
      fecha_solicitud_dia DATE NULL,
      tipo_operacion VARCHAR(50) NULL,
      producto VARCHAR(150) NULL,
      tipo_trabajo VARCHAR(150) NULL,
      estado_ot VARCHAR(80) NULL,
      ops_motivo_fin VARCHAR(180) NULL,
      sector_operativo VARCHAR(100) NULL,
      distrito VARCHAR(100) NULL,
      partner VARCHAR(120) NULL,
      cuadrilla VARCHAR(180) NULL,
      se_envio_wsp VARCHAR(10) NULL,
      estado_wsp VARCHAR(30) NULL,
      ingreso_tracking VARCHAR(10) NULL,
      pulso_soporte VARCHAR(10) NULL,
      cohorte_seguimiento VARCHAR(30) NOT NULL DEFAULT 'SIN_ORDEN',
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mat_atc_fecha (fecha_llamada),
      INDEX idx_mat_atc_match (tipo_match, en_ventana_operativa),
      INDEX idx_mat_atc_orden (orden_id),
      INDEX idx_mat_atc_ticket (ticket),
      INDEX idx_mat_atc_cohorte (cohorte_seguimiento, tipo_operacion)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  tablesChecked = true;
}

function normalizeDateSql(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = Math.floor(Number(str));
    if (serial > 25569 && serial < 70000) {
      const utcMs = (serial - 25569) * 86400 * 1000;
      return new Date(utcMs).toISOString().slice(0, 10);
    }
  }

  const datePart = str.split(/[\sT]+/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const dmy = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${m}-${d}`;
  }

  const ymd = datePart.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  return null;
}

function normalizeTimeSql(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str) && !str.includes(':')) {
    const num = Number(str);
    const frac = num >= 1 ? num - Math.floor(num) : num;
    const totalSec = Math.round(frac * 86400) % 86400;
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  const ampm = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|A\.?\s*M\.?|P\.?\s*M\.?)?/i);
  if (ampm) {
    let hh = Number(ampm[1]);
    const mm = ampm[2].padStart(2, '0');
    const ss = (ampm[3] || '00').padStart(2, '0');
    const mer = (ampm[4] || '').toUpperCase().replace(/[^AP]/g, '');
    if (mer === 'P' && hh < 12) hh += 12;
    if (mer === 'A' && hh === 12) hh = 0;
    if (hh >= 0 && hh < 24) {
      return `${String(hh).padStart(2, '0')}:${mm}:${ss}`;
    }
  }

  return null;
}

function cleanCode(raw: unknown, maxLen: number): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\.0+$/, '');
  return s ? s.slice(0, maxLen) : null;
}

function cleanDniKey(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/[^0-9A-Za-z]/g, '')
    .replace(/^0+/, '')
    .toUpperCase();
}

function cleanPhone9Key(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

function parseEpochDay(ymd?: string | null): number {
  if (!ymd || ymd.length < 10) return NaN;
  return Math.floor(Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`) / 86400000);
}

/**
 * Materializa `mat_atc_llamadas_360` cruzando `atc_llamadas` contra `mat_funnel_casos_360`
 * sin modificar ninguna tabla ni vista original del sistema.
 * Ventana operativa principal: llamada entre -1 día y +5 días respecto a fecha_solicitud_dia.
 */
export async function rebuildMatAtcLlamadas360(): Promise<{
  totalProcessed: number;
  matchedInWindow: number;
  matchedOutWindow: number;
  unmatched: number;
}> {
  await ensureAtcTables();

  const [callsRes]: any = await pool.query(`
    SELECT
      id,
      id_reg,
      DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha_str,
      TIME_FORMAT(hora, '%H:%i:%s') AS hora_str,
      telf_cliente,
      dni_cliente,
      dni_asesor,
      nom_ape,
      medio,
      tipo,
      motivo,
      comentario_llamada
    FROM atc_llamadas
    ORDER BY id ASC
  `);

  const calls: any[] = callsRes || [];
  if (calls.length === 0) {
    await pool.query(`TRUNCATE TABLE mat_atc_llamadas_360`);
    return { totalProcessed: 0, matchedInWindow: 0, matchedOutWindow: 0, unmatched: 0 };
  }

  // Rango amplio (-30 a +15 días del min/max de llamadas) para detectar también llamadas fuera de ventana
  let minCallDate = '9999-12-31';
  let maxCallDate = '0000-01-01';
  for (const c of calls) {
    if (c.fecha_str && c.fecha_str < minCallDate) minCallDate = c.fecha_str;
    if (c.fecha_str && c.fecha_str > maxCallDate) maxCallDate = c.fecha_str;
  }

  const virtualTipoSql = getVirtualTipoOperacionSql('v');
  const allowedVtFilter = `(${virtualTipoSql}) IN ('AVER - LIMA', 'AVER - PROV', 'GARANTIA', 'REITERADA')`;
  const orderWhere =
    minCallDate <= maxCallDate
      ? `WHERE ${allowedVtFilter} AND v.fecha_solicitud_dia >= DATE_SUB(?, INTERVAL 45 DAY) AND v.fecha_solicitud_dia <= DATE_ADD(?, INTERVAL 15 DAY)`
      : `WHERE ${allowedVtFilter}`;
  const orderParams = minCallDate <= maxCallDate ? [minCallDate, maxCallDate] : [];

  const [ordersRes]: any = await pool.query(
    `
    SELECT
      v.orden_id,
      v.ticket,
      v.cliente,
      DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS fecha_sol_str,
      ${virtualTipoSql} AS tipo_operacion_virtual,
      v.producto,
      v.tipo_trabajo,
      COALESCE(NULLIF(TRIM(v.ops_estado), ''), NULLIF(TRIM(v.estado_ot), ''), 'SIN ESTADO') AS estado_ot_clean,
      v.ops_motivo_fin,
      v.sector_operativo,
      v.distrito,
      COALESCE(NULLIF(TRIM(v.ops_partner), ''), v.partner) AS partner_clean,
      COALESCE(NULLIF(TRIM(v.ops_cuadrilla), ''), v.cuadrilla) AS cuadrilla_clean,
      COALESCE(v.se_envio_wsp, 'NO') AS se_envio_wsp,
      COALESCE(v.estado_wsp, 'NO ENVIADO') AS estado_wsp,
      COALESCE(v.ingreso_tracking, 'NO') AS ingreso_tracking,
      COALESCE(v.pulso_soporte, 'NO') AS pulso_soporte,
      v.ops_num_doc,
      v.telefono
    FROM mat_funnel_casos_360 v
    ${orderWhere}
    ORDER BY v.orden_id DESC
    `,
    orderParams
  );

  const orders: any[] = ordersRes || [];
  const byDni = new Map<string, any[]>();
  const byPhone = new Map<string, any[]>();
  const byTicketNum = new Map<string, any>();

  for (const o of orders) {
    o._day = parseEpochDay(o.fecha_sol_str);

    const dKey = cleanDniKey(o.ops_num_doc);
    if (dKey.length >= 6) {
      let arr = byDni.get(dKey);
      if (!arr) {
        arr = [];
        byDni.set(dKey, arr);
      }
      arr.push(o);
    }

    const pKey = cleanPhone9Key(o.telefono);
    if (pKey) {
      let arr = byPhone.get(pKey);
      if (!arr) {
        arr = [];
        byPhone.set(pKey, arr);
      }
      arr.push(o);
    }

    // Indexar dígitos del ticket (ej. AT-45785232 o GAR-45968920 -> 45785232)
    const tDigits = String(o.ticket || '').replace(/\D/g, '');
    if (tDigits.length >= 7 && !byTicketNum.has(tDigits)) {
      byTicketNum.set(tDigits, o);
    }
  }

  let matchedInWindow = 0;
  let matchedOutWindow = 0;
  let unmatched = 0;

  // Escoge la mejor orden candidata priorizando:
  // 1) Llamada ocurrida entre [fecha_solicitud - 1 día, fecha_solicitud + 5 días] (ventana operativa)
  // 2) Menor distancia en días (priorizando orden creada antes o el mismo día de la llamada)
  const pickBestOrder = (
    candidates: { ord: any; via: 'DNI' | 'TELF' }[],
    callDay: number
  ): { ord: any; via: 'DNI' | 'TELF'; diffDays: number | null; inWindow: boolean } | null => {
    if (candidates.length === 0) return null;

    let best: { ord: any; via: 'DNI' | 'TELF'; diffDays: number | null; inWindow: boolean; score: number } | null = null;

    for (const cand of candidates) {
      const ordDay = cand.ord._day;
      const diff = !Number.isNaN(callDay) && !Number.isNaN(ordDay) ? callDay - ordDay : null;
      const inWin = diff !== null && diff >= -1 && diff <= 5;

      // Score más bajo = mejor match
      let score = 999999;
      if (diff === null) {
        score = 50000;
      } else if (diff >= 0 && diff <= 5) {
        score = diff; // 0..5 días después de abrir la OT (óptimo)
      } else if (diff === -1) {
        score = 10; // Llamó 1 día antes / cambio de medianoche
      } else if (diff > 5) {
        score = 1000 + diff; // Llamó muchos días después
      } else {
        score = 5000 + Math.abs(diff); // Orden creada varios días después de la llamada
      }

      if (cand.via === 'DNI') score -= 0.2; // Ligera preferencia por DNI a igualdad de fecha

      if (!best || score < best.score) {
        best = { ord: cand.ord, via: cand.via, diffDays: diff, inWindow: inWin, score };
      }
    }

    return best;
  };

  const BATCH = 350;
  for (let i = 0; i < calls.length; i += BATCH) {
    const slice = calls.slice(i, i + BATCH);
    const placeholders: string[] = [];
    const values: any[] = [];

    for (const c of slice) {
      const callDay = parseEpochDay(c.fecha_str);
      let chosenOrd: any = null;
      let tipoMatch = 'SIN_ORDEN';
      let diffDays: number | null = null;
      let inWindow = false;

      // 1. Match directo por número de Ticket en comentario_llamada
      const commentStr = String(c.comentario_llamada || '');
      const ticketMatches = commentStr.match(/\b(?:AT|GAR|VTEXT|VT|INC)[-\s]?(\d{7,10})\b/gi);
      if (ticketMatches) {
        for (const tm of ticketMatches) {
          const digits = tm.replace(/\D/g, '');
          if (byTicketNum.has(digits)) {
            chosenOrd = byTicketNum.get(digits);
            const d = !Number.isNaN(callDay) && !Number.isNaN(chosenOrd._day) ? callDay - chosenOrd._day : null;
            diffDays = d;
            inWindow = true;
            tipoMatch = 'MATCH_TICKET';
            break;
          }
        }
      }

      // 2. Match por DNI y/o Teléfono de 9 dígitos (solo contra VT, Garantía o Reiterada)
      if (!chosenOrd) {
        const cands: { ord: any; via: 'DNI' | 'TELF' }[] = [];
        const seenOrd = new Set<number>();

        const dKey = cleanDniKey(c.dni_cliente);
        if (dKey.length >= 6 && byDni.has(dKey)) {
          for (const o of byDni.get(dKey)!) {
            seenOrd.add(o.orden_id);
            cands.push({ ord: o, via: 'DNI' });
          }
        }

        const pKey = cleanPhone9Key(c.telf_cliente);
        if (pKey && byPhone.has(pKey)) {
          for (const o of byPhone.get(pKey)!) {
            if (!seenOrd.has(o.orden_id)) {
              cands.push({ ord: o, via: 'TELF' });
            }
          }
        }

        const best = pickBestOrder(cands, callDay);
        if (best) {
          chosenOrd = best.ord;
          diffDays = best.diffDays;
          inWindow = true;
          tipoMatch = best.via === 'DNI' ? 'MATCH_DNI' : 'MATCH_TELF';
        }
      }

      let cohorte = 'SIN_ORDEN';
      if (chosenOrd) {
        if (inWindow) matchedInWindow++;
        else matchedOutWindow++;

        cohorte =
          chosenOrd.ingreso_tracking === 'SI'
            ? 'INGRESO_TRACKING'
            : chosenOrd.se_envio_wsp === 'SI'
              ? 'WSP_SIN_INGRESO'
              : 'SIN_WSP';
      } else {
        unmatched++;
      }

      placeholders.push(
        '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      values.push(
        c.id,
        c.id_reg || null,
        c.fecha_str || null,
        c.hora_str || null,
        c.telf_cliente || null,
        c.dni_cliente || null,
        c.dni_asesor || null,
        c.nom_ape || null,
        c.medio || null,
        c.tipo || null,
        c.motivo || null,
        c.comentario_llamada || null,
        chosenOrd ? 1 : 0,
        inWindow ? 1 : 0,
        tipoMatch,
        diffDays,
        chosenOrd ? chosenOrd.orden_id : null,
        chosenOrd ? chosenOrd.ticket : null,
        chosenOrd ? chosenOrd.cliente : null,
        chosenOrd ? chosenOrd.fecha_sol_str : null,
        chosenOrd ? chosenOrd.tipo_operacion_virtual : null,
        chosenOrd ? chosenOrd.producto : null,
        chosenOrd ? chosenOrd.tipo_trabajo : null,
        chosenOrd ? chosenOrd.estado_ot_clean : null,
        chosenOrd ? chosenOrd.ops_motivo_fin : null,
        chosenOrd ? chosenOrd.sector_operativo : null,
        chosenOrd ? chosenOrd.distrito : null,
        chosenOrd ? chosenOrd.partner_clean : null,
        chosenOrd ? chosenOrd.cuadrilla_clean : null,
        chosenOrd ? chosenOrd.se_envio_wsp : null,
        chosenOrd ? chosenOrd.estado_wsp : null,
        chosenOrd ? chosenOrd.ingreso_tracking : null,
        chosenOrd ? chosenOrd.pulso_soporte : null,
        cohorte
      );
    }

    await pool.query(
      `
      INSERT INTO mat_atc_llamadas_360 (
        id, id_reg, fecha_llamada, hora_llamada, telf_cliente, dni_cliente,
        dni_asesor, nom_ape_asesor, medio, tipo_llamada, motivo_llamada, comentario_llamada,
        tiene_orden, en_ventana_operativa, tipo_match, dias_diferencia,
        orden_id, ticket, cliente, fecha_solicitud_dia, tipo_operacion, producto,
        tipo_trabajo, estado_ot, ops_motivo_fin, sector_operativo, distrito,
        partner, cuadrilla, se_envio_wsp, estado_wsp, ingreso_tracking, pulso_soporte,
        cohorte_seguimiento
      ) VALUES ${placeholders.join(',')}
      ON DUPLICATE KEY UPDATE
        id_reg = VALUES(id_reg),
        fecha_llamada = VALUES(fecha_llamada),
        hora_llamada = VALUES(hora_llamada),
        telf_cliente = VALUES(telf_cliente),
        dni_cliente = VALUES(dni_cliente),
        dni_asesor = VALUES(dni_asesor),
        nom_ape_asesor = VALUES(nom_ape_asesor),
        medio = VALUES(medio),
        tipo_llamada = VALUES(tipo_llamada),
        motivo_llamada = VALUES(motivo_llamada),
        comentario_llamada = VALUES(comentario_llamada),
        tiene_orden = VALUES(tiene_orden),
        en_ventana_operativa = VALUES(en_ventana_operativa),
        tipo_match = VALUES(tipo_match),
        dias_diferencia = VALUES(dias_diferencia),
        orden_id = VALUES(orden_id),
        ticket = VALUES(ticket),
        cliente = VALUES(cliente),
        fecha_solicitud_dia = VALUES(fecha_solicitud_dia),
        tipo_operacion = VALUES(tipo_operacion),
        producto = VALUES(producto),
        tipo_trabajo = VALUES(tipo_trabajo),
        estado_ot = VALUES(estado_ot),
        ops_motivo_fin = VALUES(ops_motivo_fin),
        sector_operativo = VALUES(sector_operativo),
        distrito = VALUES(distrito),
        partner = VALUES(partner),
        cuadrilla = VALUES(cuadrilla),
        se_envio_wsp = VALUES(se_envio_wsp),
        estado_wsp = VALUES(estado_wsp),
        ingreso_tracking = VALUES(ingreso_tracking),
        pulso_soporte = VALUES(pulso_soporte),
        cohorte_seguimiento = VALUES(cohorte_seguimiento)
      `,
      values
    );
  }

  cacheFlushAll();
  return {
    totalProcessed: calls.length,
    matchedInWindow,
    matchedOutWindow,
    unmatched,
  };
}

function buildAtc360Filters(query: Record<string, any>, serviceScope?: string) {
  const todayIso = new Date().toLocaleDateString('en-CA');
  const startDate = String(query.startDate || todayIso).trim();
  const endDate = String(query.endDate || todayIso).trim();
  const ignoreDates = query.ignoreDates === 'true';
  const q = String(query.q || '').trim();
  const matchFilter = String(query.matchFilter || 'TODOS').trim().toUpperCase();
  const cohorteFilter = String(query.cohorte || 'TODOS').trim().toUpperCase();
  const estadoOtFilter = String(query.estadoOt || 'TODOS').trim();

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (!ignoreDates) {
    whereClauses.push(`m.fecha_llamada >= ? AND m.fecha_llamada <= ?`);
    params.push(startDate, endDate);
  }

  if (matchFilter === 'CON_ORDEN' || matchFilter === 'EN_VENTANA') {
    whereClauses.push(`m.tiene_orden = 1`);
  } else if (matchFilter === 'INGRESO_SI') {
    whereClauses.push(`m.tiene_orden = 1 AND m.ingreso_tracking = 'SI'`);
  } else if (matchFilter === 'INGRESO_NO') {
    whereClauses.push(`m.tiene_orden = 1 AND COALESCE(m.ingreso_tracking, 'NO') != 'SI'`);
  } else if (matchFilter === 'SIN_ORDEN') {
    whereClauses.push(`m.tiene_orden = 0`);
  }

  if (cohorteFilter !== 'TODOS') {
    whereClauses.push(`m.cohorte_seguimiento = ?`);
    params.push(cohorteFilter);
  }

  if (estadoOtFilter && estadoOtFilter !== 'TODOS') {
    whereClauses.push(`m.estado_ot = ?`);
    params.push(estadoOtFilter);
  }

  const isViewingOrphans = matchFilter === 'SIN_ORDEN' || cohorteFilter === 'SIN_ORDEN';
  if (
    !isViewingOrphans &&
    serviceScope &&
    serviceScope !== 'Todos los servicios' &&
    serviceScope !== 'Todos'
  ) {
    const srvs = serviceScope
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (srvs.length > 0) {
      whereClauses.push(`UPPER(COALESCE(m.tipo_operacion, '')) IN (${srvs.map(() => '?').join(',')})`);
      params.push(...srvs);
    }
  }

  if (q) {
    const likeQ = `%${q}%`;
    whereClauses.push(`(
      m.id_reg LIKE ? OR
      m.telf_cliente LIKE ? OR
      m.dni_cliente LIKE ? OR
      m.cliente LIKE ? OR
      m.ticket LIKE ? OR
      CAST(m.orden_id AS CHAR) LIKE ? OR
      m.motivo_llamada LIKE ? OR
      m.comentario_llamada LIKE ? OR
      m.nom_ape_asesor LIKE ?
    )`);
    params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
  }

  return {
    whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '',
    params,
    startDate,
    endDate,
  };
}

// GET /api/atc-llamadas -> Consulta enriquecida desde mat_atc_llamadas_360
router.get('/atc-llamadas', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    await ensureAtcTables();

    // Si hay llamadas en atc_llamadas pero mat_atc_llamadas_360 aún está vacía, materializar automáticamente
    const [[rawCnt], [matCnt]]: any = await Promise.all([
      pool.query(`SELECT COUNT(*) AS c FROM atc_llamadas`),
      pool.query(`SELECT COUNT(*) AS c FROM mat_atc_llamadas_360`),
    ]);
    if (Number(rawCnt?.[0]?.c || 0) > 0 && Number(matCnt?.[0]?.c || 0) === 0) {
      await rebuildMatAtcLlamadas360();
    }

    const serviceParam = String(req.query.service || 'Todos los servicios');
    const { whereSql, params } = buildAtc360Filters(req.query as Record<string, any>, serviceParam);

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const [kpiRes, motivosRes, estadosOtRes, rowsRes]: any = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*) AS total_llamadas,
          COALESCE(SUM(m.tiene_orden = 1), 0) AS cruzadas_en_ventana,
          0 AS fuera_ventana,
          COALESCE(SUM(m.tiene_orden = 0), 0) AS sin_orden,
          COALESCE(SUM(m.tiene_orden = 1 AND m.ingreso_tracking = 'SI'), 0) AS llamadas_con_tracking,
          COALESCE(SUM(m.tiene_orden = 1 AND COALESCE(m.ingreso_tracking, 'NO') != 'SI'), 0) AS llamadas_sin_tracking,
          COUNT(DISTINCT m.orden_id) AS ordenes_unicas,
          MIN(DATE_FORMAT(m.fecha_llamada, '%Y-%m-%d')) AS min_fecha,
          MAX(DATE_FORMAT(m.fecha_llamada, '%Y-%m-%d')) AS max_fecha
        FROM mat_atc_llamadas_360 m
        ${whereSql}
        `,
        params
      ),
      pool.query(
        `
        SELECT
          COALESCE(NULLIF(TRIM(m.motivo_llamada), ''), 'SIN MOTIVO') AS label,
          COUNT(*) AS total,
          COALESCE(SUM(m.en_ventana_operativa = 1), 0) AS con_ot
        FROM mat_atc_llamadas_360 m
        ${whereSql}
        GROUP BY label
        ORDER BY total DESC
        LIMIT 8
        `,
        params
      ),
      pool.query(
        `
        SELECT
          COALESCE(m.estado_ot, 'SIN ORDEN ASOCIADA') AS estado_ot,
          COUNT(*) AS total
        FROM mat_atc_llamadas_360 m
        ${whereSql}
        GROUP BY COALESCE(m.estado_ot, 'SIN ORDEN ASOCIADA')
        ORDER BY total DESC
        `,
        params
      ),
      pool.query(
        `
        SELECT
          m.*,
          DATE_FORMAT(m.fecha_llamada, '%d/%m/%Y') AS fecha_llamada_fmt,
          TIME_FORMAT(m.hora_llamada, '%H:%i:%s') AS hora_fmt,
          DATE_FORMAT(m.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_sol_fmt
        FROM mat_atc_llamadas_360 m
        ${whereSql}
        ORDER BY m.fecha_llamada DESC, m.hora_llamada DESC, m.id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    const summary = kpiRes?.[0]?.[0] || {};
    const total = Number(summary.total_llamadas || 0);

    return res.json({
      ok: true,
      kpis: {
        total_llamadas: total,
        cruzadas_en_ventana: Number(summary.cruzadas_en_ventana || 0),
        fuera_ventana: Number(summary.fuera_ventana || 0),
        sin_orden: Number(summary.sin_orden || 0),
        llamadas_con_tracking: Number(summary.llamadas_con_tracking || 0),
        llamadas_sin_tracking: Number(summary.llamadas_sin_tracking || 0),
        ordenes_unicas: Number(summary.ordenes_unicas || 0),
        min_fecha: summary.min_fecha || null,
        max_fecha: summary.max_fecha || null,
      },
      byMotivo: motivosRes?.[0] || [],
      byEstadoOt: estadosOtRes?.[0] || [],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows: rowsRes?.[0] || [],
    });
  } catch (err: any) {
    console.error('❌ Error en GET /api/atc-llamadas:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/atc-llamadas/sync -> Reconstruye manualmente mat_atc_llamadas_360
router.post('/atc-llamadas/sync', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const stats = await rebuildMatAtcLlamadas360();
    return res.json({ ok: true, ...stats });
  } catch (err: any) {
    console.error('❌ Error sincronizando mat_atc_llamadas_360:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/atc-llamadas/export -> Exporta la vista materializada mat_atc_llamadas_360 a Excel (.xlsx)
router.get('/atc-llamadas/export', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    await ensureAtcTables();
    const serviceParam = String(req.query.service || 'Todos los servicios');
    const { whereSql, params, startDate, endDate } = buildAtc360Filters(
      req.query as Record<string, any>,
      serviceParam
    );

    const [rows]: any = await pool.query(
      `
      SELECT
        m.id_reg,
        DATE_FORMAT(m.fecha_llamada, '%Y-%m-%d') AS fecha_llamada,
        TIME_FORMAT(m.hora_llamada, '%H:%i:%s') AS hora_llamada,
        m.dni_cliente,
        m.telf_cliente,
        m.tipo_match,
        m.dias_diferencia,
        m.orden_id,
        m.ticket,
        m.cliente,
        DATE_FORMAT(m.fecha_solicitud_dia, '%Y-%m-%d') AS fecha_solicitud,
        m.tipo_operacion,
        m.producto,
        m.estado_ot,
        m.ops_motivo_fin,
        m.partner,
        m.cuadrilla,
        m.sector_operativo,
        m.se_envio_wsp,
        m.estado_wsp,
        m.ingreso_tracking,
        m.cohorte_seguimiento,
        m.medio,
        m.tipo_llamada,
        m.motivo_llamada,
        m.nom_ape_asesor,
        m.comentario_llamada
      FROM mat_atc_llamadas_360 m
      ${whereSql}
      ORDER BY m.fecha_llamada DESC, m.hora_llamada DESC
      LIMIT 15000
      `,
      params
    );

    const sheetRows: (string | number)[][] = [
      [
        'ID Reg ATC',
        'Fecha Llamada',
        'Hora Llamada',
        'DNI Llamada',
        'Teléfono Llamada',
        'Diagnóstico Cruce',
        'Días Dif. (Llamada - OT)',
        'N° Orden',
        'Ticket OT',
        'Cliente OT',
        'Fecha Solicitud OT',
        'Servicio Homologado',
        'Producto',
        'Estado Solicitud (OT)',
        'Motivo Cierre OT',
        'Partner',
        'Cuadrilla',
        'Sector',
        'Se Envió WSP',
        'Estado WSP',
        'Ingresó Tracking',
        'Cohorte Seguimiento',
        'Medio ATC',
        'Tipo ATC',
        'Motivo ATC',
        'Asesor ATC',
        'Comentario Llamada',
      ],
    ];

    for (const r of rows || []) {
      sheetRows.push([
        r.id_reg || '',
        r.fecha_llamada || '',
        r.hora_llamada || '',
        r.dni_cliente || '',
        r.telf_cliente || '',
        r.tipo_match || '',
        r.dias_diferencia !== null && r.dias_diferencia !== undefined ? Number(r.dias_diferencia) : '',
        r.orden_id ? Number(r.orden_id) : '',
        r.ticket || '',
        r.cliente || '',
        r.fecha_solicitud || '',
        r.tipo_operacion || '',
        r.producto || '',
        r.estado_ot || 'SIN ORDEN',
        r.ops_motivo_fin || '',
        r.partner || '',
        r.cuadrilla || '',
        r.sector_operativo || '',
        r.se_envio_wsp || '',
        r.estado_wsp || '',
        r.ingreso_tracking || '',
        r.cohorte_seguimiento || '',
        r.medio || '',
        r.tipo_llamada || '',
        r.motivo_llamada || '',
        r.nom_ape_asesor || '',
        r.comentario_llamada || '',
      ]);
    }

    const buf = buildXlsxBuffer([{ name: 'Auditoria_ATC_360', rows: sheetRows }]);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Auditoria_ATC_360_${startDate}_${endDate}.xlsx"`
    );
    return res.send(buf);
  } catch (err: any) {
    console.error('❌ Error exportando mat_atc_llamadas_360:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/atc-llamadas/import -> Inserta lote y opcionalmente reconstruye la vista materializada al finalizar
router.post('/atc-llamadas/import', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    await ensureAtcTables();

    const rawRows = req.body?.rows;
    const isLastBatch = Boolean(req.body?.isLastBatch);

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ ok: false, error: 'El lote no contiene filas válidas.' });
    }

    if (rawRows.length > 1000) {
      return res.status(400).json({ ok: false, error: 'Máximo 1000 filas por lote.' });
    }

    const values: any[] = [];
    const placeholders: string[] = [];

    for (const r of rawRows) {
      const idReg = cleanCode(r.id_reg, 80);
      const fecha = normalizeDateSql(r.fecha);
      const hora = normalizeTimeSql(r.hora);
      const telfCliente = cleanCode(r.telf_cliente, 30);
      const dniCliente = cleanCode(r.dni_cliente, 25);
      const dniAsesor = cleanCode(r.dni_asesor, 25);
      const nomApe = cleanCode(r.nom_ape, 180);
      const medio = cleanCode(r.medio, 80);
      const tipo = cleanCode(r.tipo, 100);
      const motivo = cleanCode(r.motivo, 180);
      const comentario =
        r.comentario_llamada !== undefined && r.comentario_llamada !== null
          ? String(r.comentario_llamada).trim() || null
          : null;

      if (!idReg && !telfCliente && !dniCliente && !comentario) continue;

      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        idReg,
        fecha,
        hora,
        telfCliente,
        dniCliente,
        dniAsesor,
        nomApe,
        medio,
        tipo,
        motivo,
        comentario
      );
    }

    if (placeholders.length > 0) {
      await pool.query(
        `
        INSERT INTO atc_llamadas (
          id_reg, fecha, hora, telf_cliente, dni_cliente,
          dni_asesor, nom_ape, medio, tipo, motivo, comentario_llamada
        ) VALUES ${placeholders.join(',')}
        ON DUPLICATE KEY UPDATE
          fecha = VALUES(fecha),
          hora = VALUES(hora),
          telf_cliente = VALUES(telf_cliente),
          dni_cliente = VALUES(dni_cliente),
          dni_asesor = VALUES(dni_asesor),
          nom_ape = VALUES(nom_ape),
          medio = VALUES(medio),
          tipo = VALUES(tipo),
          motivo = VALUES(motivo),
          comentario_llamada = VALUES(comentario_llamada)
        `,
        values
      );
    }

    let syncStats = null;
    if (isLastBatch) {
      syncStats = await rebuildMatAtcLlamadas360();
    }

    return res.json({ ok: true, processed: placeholders.length, syncStats });
  } catch (err: any) {
    console.error('❌ Error en POST /api/atc-llamadas/import:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/atc-llamadas -> Vaciar ambas tablas (solo Administradores)
router.delete('/atc-llamadas', async (req: Request, res: Response) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    await ensureAtcTables();
    await pool.query(`TRUNCATE TABLE atc_llamadas`);
    await pool.query(`TRUNCATE TABLE mat_atc_llamadas_360`);
    cacheFlushAll();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;