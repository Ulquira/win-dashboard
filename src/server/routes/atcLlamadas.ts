import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { requireAuth, requireAdmin } from '../auth/middleware';

const router = Router();

let tableChecked = false;
async function ensureAtcTable(): Promise<void> {
  if (tableChecked) return;
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
  tableChecked = true;
}

function normalizeDateSql(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // Serial numérico de Excel (ej. 46346)
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

  // Fracción decimal de Excel (ej. 0.58333 o 46346.58333)
  if (/^\d+(\.\d+)?$/.test(str)) {
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

// GET /api/atc-llamadas -> Consulta paginada y KPIs de llamadas importadas
router.get('/atc-llamadas', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    await ensureAtcTable();

    const todayIso = new Date().toLocaleDateString('en-CA');
    const startDate = String(req.query.startDate || todayIso).trim();
    const endDate = String(req.query.endDate || todayIso).trim();
    const ignoreDates = req.query.ignoreDates === 'true';
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (!ignoreDates) {
      whereClauses.push(`a.fecha >= ? AND a.fecha <= ?`);
      params.push(startDate, endDate);
    }

    if (q) {
      const likeQ = `%${q}%`;
      whereClauses.push(`(
        a.id_reg LIKE ? OR
        a.telf_cliente LIKE ? OR
        a.dni_cliente LIKE ? OR
        a.dni_asesor LIKE ? OR
        a.nom_ape LIKE ? OR
        a.medio LIKE ? OR
        a.tipo LIKE ? OR
        a.motivo LIKE ? OR
        a.comentario_llamada LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [kpiRes, motivosRes, mediosRes, rowsRes]: any = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*) AS total_llamadas,
          COUNT(DISTINCT NULLIF(a.dni_cliente, '')) AS clientes_dni,
          COUNT(DISTINCT NULLIF(a.telf_cliente, '')) AS clientes_telf,
          COUNT(DISTINCT NULLIF(a.dni_asesor, '')) AS asesores_activos,
          MIN(DATE_FORMAT(a.fecha, '%Y-%m-%d')) AS min_fecha,
          MAX(DATE_FORMAT(a.fecha, '%Y-%m-%d')) AS max_fecha
        FROM atc_llamadas a
        ${whereSql}
        `,
        params
      ),
      pool.query(
        `
        SELECT COALESCE(NULLIF(TRIM(a.motivo), ''), 'SIN MOTIVO') AS label, COUNT(*) AS total
        FROM atc_llamadas a
        ${whereSql}
        GROUP BY label
        ORDER BY total DESC
        LIMIT 8
        `,
        params
      ),
      pool.query(
        `
        SELECT COALESCE(NULLIF(TRIM(a.medio), ''), 'SIN MEDIO') AS label, COUNT(*) AS total
        FROM atc_llamadas a
        ${whereSql}
        GROUP BY label
        ORDER BY total DESC
        LIMIT 6
        `,
        params
      ),
      pool.query(
        `
        SELECT
          a.id,
          a.id_reg,
          DATE_FORMAT(a.fecha, '%d/%m/%Y') AS fecha_fmt,
          DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
          TIME_FORMAT(a.hora, '%H:%i:%s') AS hora,
          a.telf_cliente,
          a.dni_cliente,
          a.dni_asesor,
          a.nom_ape,
          a.medio,
          a.tipo,
          a.motivo,
          a.comentario_llamada
        FROM atc_llamadas a
        ${whereSql}
        ORDER BY a.fecha DESC, a.hora DESC, a.id DESC
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
        clientes_dni: Number(summary.clientes_dni || 0),
        clientes_telf: Number(summary.clientes_telf || 0),
        asesores_activos: Number(summary.asesores_activos || 0),
        min_fecha: summary.min_fecha || null,
        max_fecha: summary.max_fecha || null,
      },
      byMotivo: motivosRes?.[0] || [],
      byMedio: mediosRes?.[0] || [],
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

// POST /api/atc-llamadas/import -> Inserción masiva por lotes (idempotente por id_reg)
router.post('/atc-llamadas/import', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    await ensureAtcTable();

    const rawRows = req.body?.rows;
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

    if (placeholders.length === 0) {
      return res.json({ ok: true, processed: 0 });
    }

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

    return res.json({ ok: true, processed: placeholders.length });
  } catch (err: any) {
    console.error('❌ Error en POST /api/atc-llamadas/import:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/atc-llamadas -> Vaciar tabla completa (solo Administradores)
router.delete('/atc-llamadas', async (req: Request, res: Response) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    await ensureAtcTable();
    await pool.query(`TRUNCATE TABLE atc_llamadas`);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;