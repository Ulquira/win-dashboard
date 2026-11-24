import { Router, Request, Response } from 'express';
import zlib from 'zlib';
import { pool } from '../config/db';
import { buildStrictOrderTypeSql, getVirtualTipoOperacionSql } from '../domain/index';
import { enforceRoleServiceScope } from '../auth/middleware';
import {
  getServicioToTipoMap,
  loadTipoServicioCacheIfNeeded,
  syncMatFunnelIncremental,
  withSingleFlightSwr,
} from '../services/matFunnel.sync';

const router = Router();

// Utilidades de generación nativa OpenXML (.xlsx) sin dependencias externas
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createZip(files: { name: string; data: string | Buffer }[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const dataBuf = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const crc = crc32(dataBuf);
    const compressed = zlib.deflateRawSync(dataBuf);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localHeaders.push(local, compressed);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralBuf, eocd]);
}

function escXml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(colIdx: number): string {
  let s = '';
  let n = colIdx + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function buildWorksheetXml(rows: (string | number)[][]): string {
  const colWidths: number[] = [];
  for (const r of rows) {
    r.forEach((cell, cIdx) => {
      const len = String(cell ?? '').length;
      colWidths[cIdx] = Math.min(48, Math.max(colWidths[cIdx] || 12, len + 4));
    });
  }
  const colsXml =
    '<cols>' +
    colWidths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join('') +
    '</cols>';

  const rowsXml = rows
    .map((r, rIdx) => {
      const isHeader = rIdx === 0;
      const cellsXml = r
        .map((val, cIdx) => {
          const ref = `${colLetter(cIdx)}${rIdx + 1}`;
          if (isHeader) {
            return `<c r="${ref}" t="inlineStr" s="1"><is><t>${escXml(val)}</t></is></c>`;
          }
          if (typeof val === 'number' && Number.isFinite(val)) {
            const isInt = Number.isInteger(val);
            return `<c r="${ref}" s="${isInt ? 2 : 3}"><v>${val}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr" s="0"><is><t>${escXml(val)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rIdx + 1}"${isHeader ? ' ht="24" customHeight="1"' : ''}>${cellsXml}</row>`;
    })
    .join('');

  const lastCol = colLetter(Math.max(0, (rows[0]?.length || 1) - 1));
  const lastRow = Math.max(1, rows.length);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  <autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;
}

export function buildXlsxBuffer(sheets: { name: string; rows: (string | number)[][] }[]): Buffer {
  const files: { name: string; data: string | Buffer }[] = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets
      .map((s, i) => `<sheet name="${escXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('\n    ')}
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n  ')}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="0.00"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFF5500"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`,
    },
  ];

  sheets.forEach((s, i) => {
    files.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: buildWorksheetXml(s.rows),
    });
  });

  return createZip(files);
}

const colEstado = `v.ops_estado`;
const isFin = `(LOWER(${colEstado}) LIKE '%finaliz%' OR LOWER(${colEstado}) LIKE '%atendid%' OR LOWER(${colEstado}) LIKE '%complet%' OR LOWER(${colEstado}) LIKE '%cerrad%' OR LOWER(${colEstado}) LIKE '%ok%')`;
const isCurso = `(LOWER(${colEstado}) LIKE '%iniciad%' OR LOWER(${colEstado}) LIKE '%camino%' OR LOWER(${colEstado}) LIKE '%ruta%' OR LOWER(${colEstado}) LIKE '%ejecuc%' OR LOWER(${colEstado}) LIKE '%proceso%')`;
const isCancel = `(LOWER(${colEstado}) LIKE '%cancel%' OR LOWER(${colEstado}) LIKE '%anul%' OR LOWER(${colEstado}) LIKE '%rechaz%' OR LOWER(${colEstado}) LIKE '%quiebre%' OR LOWER(${colEstado}) LIKE '%suspens%')`;
const isRegestion = `(LOWER(${colEstado}) LIKE '%regesti%')`;
const isAgend = `(NOT ${isFin} AND NOT ${isCurso} AND NOT ${isCancel})`;
const isReprogMotivo = `(UPPER(v.ops_motivo_fin) LIKE '%REPROGRAM%' OR v.reprogramo = 'SI' OR ${isRegestion})`;
const isAusente = `(UPPER(v.ops_motivo_fin) LIKE '%AUSENTE%' OR UPPER(v.ops_motivo_fin) LIKE '%NO CONTESTA%')`;
const isSos = `(UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE'))`;

async function queryCohortDataset(
  startDate: string,
  endDate: string,
  service: string,
  searchQ: string,
  ignoreDates: string
) {
  const whereClauses: string[] = [];
  const queryParams: any[] = [];

  if (ignoreDates !== 'true') {
    whereClauses.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
    queryParams.push(startDate, endDate);
  } else {
    whereClauses.push(`v.fecha_solicitud_dia IS NOT NULL`);
  }

  const srvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
  if (srvFilter.params.length > 0) {
    whereClauses.push(srvFilter.sql);
    queryParams.push(...srvFilter.params);
  }

  if (searchQ) {
    const likeQ = `%${searchQ}%`;
    whereClauses.push(`(
      CAST(v.orden_id AS CHAR) LIKE ? OR
      v.ticket LIKE ? OR
      v.cliente LIKE ? OR
      v.ops_num_doc LIKE ? OR
      v.telefono LIKE ? OR
      v.ops_cuadrilla LIKE ? OR
      v.ops_partner LIKE ?
    )`);
    queryParams.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const virtualTipoSql = getVirtualTipoOperacionSql('v');

  const [dailyCellsRes, estadosRes, motivosRes]: any = await Promise.all([
    pool.query(
      `
      SELECT
        DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
        DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m') AS fecha_corta,
        DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m') AS mes,
        YEARWEEK(v.fecha_solicitud_dia, 1) AS yw,
        ${virtualTipoSql} AS tipo_operacion_virtual,
        COALESCE(NULLIF(TRIM(v.ambito), ''), IF(UPPER(TRIM(COALESCE(v.sector_operativo, ''))) LIKE 'LIMA%' OR UPPER(TRIM(COALESCE(v.region, ''))) = 'LIMA', 'LIMA', 'PROVINCIA')) AS ambito_clean,
        COALESCE(v.ingreso_tracking, 'NO') AS ingreso_trk_clean,
        COUNT(*) AS total,
        COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS con_wsp,
        COALESCE(SUM(${isFin}), 0) AS finalizadas,
        COALESCE(SUM(CASE WHEN v.se_envio_wsp = 'SI' THEN ${isFin} ELSE 0 END), 0) AS fin_wsp,
        COALESCE(SUM(${isCancel}), 0) AS canceladas,
        COALESCE(SUM(CASE WHEN v.se_envio_wsp = 'SI' THEN ${isCancel} ELSE 0 END), 0) AS can_wsp,
        COALESCE(SUM(${isRegestion}), 0) AS regestion,
        COALESCE(SUM(CASE WHEN v.se_envio_wsp = 'SI' THEN ${isRegestion} ELSE 0 END), 0) AS reg_wsp,
        COALESCE(SUM(${isReprogMotivo}), 0) AS reprog_total,
        COALESCE(SUM(CASE WHEN v.se_envio_wsp = 'SI' THEN ${isReprogMotivo} ELSE 0 END), 0) AS reprog_wsp,
        COALESCE(SUM(v.reprogramo = 'SI' OR v.intento_reprogramar = 'SI'), 0) AS reprog_web,
        COALESCE(SUM(CASE WHEN v.se_envio_wsp = 'SI' AND (v.reprogramo = 'SI' OR v.intento_reprogramar = 'SI') THEN 1 ELSE 0 END), 0) AS reprog_web_wsp,
        COALESCE(SUM(${isAusente}), 0) AS ausente,
        COALESCE(SUM(CASE WHEN v.se_envio_wsp = 'SI' THEN ${isAusente} ELSE 0 END), 0) AS ausente_wsp,
        COALESCE(SUM(${isSos}), 0) AS sos,
        COALESCE(SUM(CASE WHEN v.se_envio_wsp = 'SI' THEN ${isSos} ELSE 0 END), 0) AS sos_wsp,
        COALESCE(SUM(${isCurso}), 0) AS en_curso,
        COALESCE(SUM(${isAgend}), 0) AS agendadas
      FROM mat_funnel_casos_360 v
      ${whereSql}
      GROUP BY
        v.fecha_solicitud_dia,
        tipo_operacion_virtual,
        ambito_clean,
        ingreso_trk_clean
      ORDER BY raw_date ASC
      `,
      queryParams
    ),
    pool.query(
      `
      SELECT
        ${virtualTipoSql} AS tipo_operacion_virtual,
        COALESCE(NULLIF(TRIM(v.ambito), ''), IF(UPPER(TRIM(COALESCE(v.sector_operativo, ''))) LIKE 'LIMA%' OR UPPER(TRIM(COALESCE(v.region, ''))) = 'LIMA', 'LIMA', 'PROVINCIA')) AS ambito_clean,
        COALESCE(v.ingreso_tracking, 'NO') AS ingreso_trk_clean,
        COALESCE(NULLIF(TRIM(v.ops_estado), ''), 'SIN ESTADO') AS estado_clean,
        COUNT(*) AS total,
        COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS con_wsp
      FROM mat_funnel_casos_360 v
      ${whereSql}
      GROUP BY
        tipo_operacion_virtual,
        ambito_clean,
        ingreso_trk_clean,
        estado_clean
      `,
      queryParams
    ),
    pool.query(
      `
      SELECT
        ${virtualTipoSql} AS tipo_operacion_virtual,
        COALESCE(NULLIF(TRIM(v.ambito), ''), IF(UPPER(TRIM(COALESCE(v.sector_operativo, ''))) LIKE 'LIMA%' OR UPPER(TRIM(COALESCE(v.region, ''))) = 'LIMA', 'LIMA', 'PROVINCIA')) AS ambito_clean,
        COALESCE(v.ingreso_tracking, 'NO') AS ingreso_trk_clean,
        COALESCE(NULLIF(TRIM(v.ops_motivo_fin), ''), 'Sin especificar') AS motivo_fin_clean,
        COUNT(*) AS total,
        COALESCE(SUM(v.se_envio_wsp = 'SI'), 0) AS con_wsp
      FROM mat_funnel_casos_360 v
      ${whereSql}
      ${whereSql ? 'AND' : 'WHERE'} (${isCancel} OR ${isRegestion})
      GROUP BY
        tipo_operacion_virtual,
        ambito_clean,
        ingreso_trk_clean,
        motivo_fin_clean
      `,
      queryParams
    ),
  ]);

  return {
    ok: true,
    startDate,
    endDate,
    dailyCells: (dailyCellsRes?.[0] || []).map((r: any) => ({
      raw_date: r.raw_date,
      fecha_corta: r.fecha_corta,
      mes: r.mes,
      yw: Number(r.yw || 0),
      tipo_operacion: String(r.tipo_operacion_virtual || 'OTROS'),
      ambito: String(r.ambito_clean || 'LIMA'),
      ingreso_tracking: r.ingreso_trk_clean === 'SI' ? 'SI' : 'NO',
      total: Number(r.total || 0),
      con_wsp: Number(r.con_wsp || 0),
      finalizadas: Number(r.finalizadas || 0),
      fin_wsp: Number(r.fin_wsp || 0),
      canceladas: Number(r.canceladas || 0),
      can_wsp: Number(r.can_wsp || 0),
      regestion: Number(r.regestion || 0),
      reg_wsp: Number(r.reg_wsp || 0),
      reprog_total: Number(r.reprog_total || 0),
      reprog_wsp: Number(r.reprog_wsp || 0),
      reprog_web: Number(r.reprog_web || 0),
      reprog_web_wsp: Number(r.reprog_web_wsp || 0),
      ausente: Number(r.ausente || 0),
      ausente_wsp: Number(r.ausente_wsp || 0),
      sos: Number(r.sos || 0),
      sos_wsp: Number(r.sos_wsp || 0),
      en_curso: Number(r.en_curso || 0),
      agendadas: Number(r.agendadas || 0),
    })),
    estadosCells: (estadosRes?.[0] || []).map((r: any) => ({
      tipo_operacion: String(r.tipo_operacion_virtual || 'OTROS'),
      ambito: String(r.ambito_clean || 'LIMA'),
      ingreso_tracking: r.ingreso_trk_clean === 'SI' ? 'SI' : 'NO',
      estado: String(r.estado_clean || 'SIN ESTADO'),
      total: Number(r.total || 0),
      con_wsp: Number(r.con_wsp || 0),
    })),
    motivosCells: (motivosRes?.[0] || []).map((r: any) => ({
      tipo_operacion: String(r.tipo_operacion_virtual || 'OTROS'),
      ambito: String(r.ambito_clean || 'LIMA'),
      ingreso_tracking: r.ingreso_trk_clean === 'SI' ? 'SI' : 'NO',
      motivo_fin: String(r.motivo_fin_clean || 'Sin especificar'),
      total: Number(r.total || 0),
      con_wsp: Number(r.con_wsp || 0),
    })),
  };
}

async function queryAtcCohortImpact(
  startDate: string,
  endDate: string,
  service: string,
  searchQ: string,
  ignoreDates: string,
  windowDays: number = 3
) {
  // Verificar si existe atc_llamadas antes de cruzar
  try {
    await pool.query(`SELECT 1 FROM atc_llamadas LIMIT 1`);
  } catch {
    return {
      ok: true,
      hasAtcData: false,
      windowDays,
      orderCells: [],
      motivoCells: [],
    };
  }

  const whereClauses: string[] = [];
  const queryParams: any[] = [];

  if (ignoreDates !== 'true') {
    whereClauses.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
    queryParams.push(startDate, endDate);
  } else {
    whereClauses.push(`v.fecha_solicitud_dia IS NOT NULL`);
  }

  const srvFilter = buildStrictOrderTypeSql(service, getServicioToTipoMap(), 'v.tipo_operacion');
  if (srvFilter.params.length > 0) {
    whereClauses.push(srvFilter.sql);
    queryParams.push(...srvFilter.params);
  }

  if (searchQ) {
    const likeQ = `%${searchQ}%`;
    whereClauses.push(`(
      CAST(v.orden_id AS CHAR) LIKE ? OR
      v.ticket LIKE ? OR
      v.cliente LIKE ? OR
      v.ops_num_doc LIKE ? OR
      v.telefono LIKE ? OR
      v.ops_cuadrilla LIKE ? OR
      v.ops_partner LIKE ?
    )`);
    queryParams.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const virtualTipoSql = getVirtualTipoOperacionSql('v');

  const callWhereSql =
    ignoreDates !== 'true'
      ? `WHERE a.fecha >= ? AND a.fecha <= DATE_ADD(?, INTERVAL ? DAY)`
      : `WHERE a.fecha IS NOT NULL`;
  const callParams = ignoreDates !== 'true' ? [startDate, endDate, windowDays] : [];

  const [ordersRes, callsRes]: any = await Promise.all([
    pool.query(
      `
      SELECT
        v.orden_id,
        DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
        DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m') AS fecha_corta,
        DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m') AS mes,
        YEARWEEK(v.fecha_solicitud_dia, 1) AS yw,
        ${virtualTipoSql} AS tipo_operacion,
        COALESCE(NULLIF(TRIM(v.ambito), ''), IF(UPPER(TRIM(COALESCE(v.sector_operativo, ''))) LIKE 'LIMA%' OR UPPER(TRIM(COALESCE(v.region, ''))) = 'LIMA', 'LIMA', 'PROVINCIA')) AS ambito,
        CASE
          WHEN v.ingreso_tracking = 'SI' THEN 'INGRESO'
          WHEN v.se_envio_wsp = 'SI' THEN 'WSP_SIN_INGRESO'
          ELSE 'SIN_WSP'
        END AS cohorte_3,
        TRIM(COALESCE(v.ops_num_doc, '')) AS dni,
        RIGHT(REPLACE(REPLACE(TRIM(COALESCE(v.telefono, '')), ' ', ''), '+', ''), 9) AS phone9
      FROM mat_funnel_casos_360 v
      ${whereSql}
      `,
      queryParams
    ),
    pool.query(
      `
      SELECT
        a.id,
        DATE_FORMAT(a.fecha, '%Y-%m-%d') AS call_date,
        TRIM(COALESCE(a.dni_cliente, '')) AS dni,
        RIGHT(REPLACE(REPLACE(TRIM(COALESCE(a.telf_cliente, '')), ' ', ''), '+', ''), 9) AS phone9,
        COALESCE(NULLIF(TRIM(a.tipo), ''), 'SIN TIPO') AS tipo,
        COALESCE(NULLIF(TRIM(a.motivo), ''), 'SIN MOTIVO') AS motivo
      FROM atc_llamadas a
      ${callWhereSql}
      `,
      callParams
    ),
  ]);

  const orders: any[] = ordersRes?.[0] || [];
  const calls: any[] = callsRes?.[0] || [];

  if (calls.length === 0) {
    return {
      ok: true,
      hasAtcData: false,
      windowDays,
      totalAtcInPeriod: 0,
      orderCells: [],
      motivoCells: [],
    };
  }

  const parseDayEpoch = (ymd: string): number => {
    if (!ymd || ymd.length < 10) return NaN;
    return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86400000);
  };

  interface CallItem {
    id: number;
    dayNum: number;
    motivo: string;
    tipo: string;
    isVtMotivo: boolean;
  }

  const byDni = new Map<string, CallItem[]>();
  const byPhone = new Map<string, CallItem[]>();

  for (const c of calls) {
    const dayNum = parseDayEpoch(c.call_date);
    if (Number.isNaN(dayNum)) continue;

    const motUpper = `${c.tipo} ${c.motivo}`.toUpperCase();
    const isVtMotivo =
      motUpper.includes('VISITA') ||
      motUpper.includes('VT') ||
      motUpper.includes('INSTAL') ||
      motUpper.includes('TECNIC') ||
      motUpper.includes('TÉCNIC') ||
      motUpper.includes('AVERIA') ||
      motUpper.includes('AVERÍA') ||
      motUpper.includes('AGENDA') ||
      motUpper.includes('ORDEN') ||
      motUpper.includes('REPROGRAM');

    const item: CallItem = {
      id: Number(c.id),
      dayNum,
      motivo: c.motivo,
      tipo: c.tipo,
      isVtMotivo,
    };

    const cleanDni = String(c.dni || '').replace(/^0+/, '');
    if (cleanDni.length >= 6) {
      let arr = byDni.get(cleanDni);
      if (!arr) {
        arr = [];
        byDni.set(cleanDni, arr);
      }
      arr.push(item);
    }

    const p9 = String(c.phone9 || '').replace(/\D/g, '');
    if (p9.length === 9) {
      let arr = byPhone.get(p9);
      if (!arr) {
        arr = [];
        byPhone.set(p9, arr);
      }
      arr.push(item);
    }
  }

  const cellMap = new Map<string, any>();
  const motivoMap = new Map<string, any>();

  for (const o of orders) {
    const ordDay = parseDayEpoch(o.raw_date);
    if (Number.isNaN(ordDay)) continue;

    const matchedMap = new Map<number, CallItem>();
    const cleanDni = String(o.dni || '').replace(/^0+/, '');
    const p9 = String(o.phone9 || '').replace(/\D/g, '');

    if (cleanDni.length >= 6) {
      const list = byDni.get(cleanDni);
      if (list) {
        for (const cl of list) {
          if (cl.dayNum >= ordDay && cl.dayNum <= ordDay + windowDays) {
            matchedMap.set(cl.id, cl);
          }
        }
      }
    }

    if (p9.length === 9) {
      const list = byPhone.get(p9);
      if (list) {
        for (const cl of list) {
          if (cl.dayNum >= ordDay && cl.dayNum <= ordDay + windowDays) {
            matchedMap.set(cl.id, cl);
          }
        }
      }
    }

    let callsAll = 0;
    let callsVt = 0;

    if (matchedMap.size > 0) {
      for (const cl of matchedMap.values()) {
        callsAll++;
        if (cl.isVtMotivo) callsVt++;

        const mKey = `${o.tipo_operacion}|${o.cohorte_3}|${cl.motivo}|${cl.isVtMotivo ? 1 : 0}`;
        let mNode = motivoMap.get(mKey);
        if (!mNode) {
          mNode = {
            tipo_operacion: o.tipo_operacion,
            cohorte_3: o.cohorte_3,
            motivo: cl.motivo,
            is_vt: cl.isVtMotivo,
            llamadas: 0,
          };
          motivoMap.set(mKey, mNode);
        }
        mNode.llamadas++;
      }
    }

    const cKey = `${o.raw_date}|${o.tipo_operacion}|${o.ambito}|${o.cohorte_3}`;
    let cell = cellMap.get(cKey);
    if (!cell) {
      cell = {
        raw_date: o.raw_date,
        fecha_corta: o.fecha_corta,
        mes: o.mes,
        yw: Number(o.yw || 0),
        tipo_operacion: o.tipo_operacion,
        ambito: o.ambito,
        cohorte_3: o.cohorte_3,
        total_ordenes: 0,
        ordenes_llamaron_all: 0,
        total_llamadas_all: 0,
        ordenes_llamaron_vt: 0,
        total_llamadas_vt: 0,
      };
      cellMap.set(cKey, cell);
    }

    cell.total_ordenes++;
    if (callsAll > 0) {
      cell.ordenes_llamaron_all++;
      cell.total_llamadas_all += callsAll;
    }
    if (callsVt > 0) {
      cell.ordenes_llamaron_vt++;
      cell.total_llamadas_vt += callsVt;
    }
  }

  return {
    ok: true,
    hasAtcData: true,
    windowDays,
    totalAtcInPeriod: calls.length,
    orderCells: Array.from(cellMap.values()),
    motivoCells: Array.from(motivoMap.values()),
  };
}

// GET /api/cohorts -> Datos del Comparativo A/B WIN en Ruta (Ingresó vs No Ingresó)
router.get('/cohorts', async (req: Request, res: Response) => {
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
  const cacheKey = `cohorts_v2_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}`;

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
        return queryCohortDataset(startDate, endDate, service, searchQ, ignoreDates);
      }
    );

    console.log(`✅ /api/cohorts completado en ${Date.now() - startTime}ms`);
    return res.json(payload);
  } catch (error: any) {
    console.error('❌ Error en /api/cohorts:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/cohorts/export -> Descarga directa de Excel (.xlsx) multi-pestaña
router.get('/cohorts/export', async (req: Request, res: Response) => {
  const todayDefault = new Date().toLocaleDateString('en-CA');
  const {
    startDate = '2026-09-01',
    endDate = todayDefault,
    service: rawService = 'Todos los servicios',
    q = '',
    ignoreDates = 'false',
  } = req.query as Record<string, string>;

  const service = enforceRoleServiceScope(req, rawService);
  const searchQ = String(q || '').trim();
  const cacheKey = `cohorts_v2_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}`;

  try {
    await loadTipoServicioCacheIfNeeded();
    const dataset = await withSingleFlightSwr(cacheKey, 120, false, () =>
      queryCohortDataset(startDate, endDate, service, searchQ, ignoreDates)
    );

    const pct = (num: number, den: number) =>
      den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0;

    // 1. Agrupar por Mes + Cohorte
    const monthMap = new Map<string, any>();
    const monthTypeMap = new Map<string, any>();
    const weekMap = new Map<string, any>();
    const weekTypeMap = new Map<string, any>();
    const weekRangeMap = new Map<number, { min: string; max: string }>();

    for (const c of dataset.dailyCells) {
      const wr = weekRangeMap.get(c.yw) || { min: c.raw_date, max: c.raw_date };
      if (c.raw_date < wr.min) wr.min = c.raw_date;
      if (c.raw_date > wr.max) wr.max = c.raw_date;
      weekRangeMap.set(c.yw, wr);

      const macro = c.tipo_operacion.startsWith('INSTA') ? 'INSTALACIÓN' : 'VISITA TÉCNICA';

      const accumulate = (map: Map<string, any>, key: string, meta: Record<string, any>) => {
        let node = map.get(key);
        if (!node) {
          node = {
            ...meta,
            total: 0,
            con_wsp: 0,
            finalizadas: 0,
            fin_wsp: 0,
            canceladas: 0,
            can_wsp: 0,
            reprog_total: 0,
            reprog_wsp: 0,
            reprog_web: 0,
            ausente: 0,
            ausente_wsp: 0,
            sos: 0,
          };
          map.set(key, node);
        }
        node.total += c.total;
        node.con_wsp += c.con_wsp;
        node.finalizadas += c.finalizadas;
        node.fin_wsp += c.fin_wsp;
        node.canceladas += c.canceladas;
        node.can_wsp += c.can_wsp;
        node.reprog_total += c.reprog_total;
        node.reprog_wsp += c.reprog_wsp;
        node.reprog_web += c.reprog_web;
        node.ausente += c.ausente;
        node.ausente_wsp += c.ausente_wsp;
        node.sos += c.sos;
      };

      accumulate(monthMap, `${c.mes}|${c.ingreso_tracking}`, {
        mes: c.mes,
        ingreso_tracking: c.ingreso_tracking,
      });
      accumulate(monthTypeMap, `${c.mes}|${macro}|${c.ambito}|${c.tipo_operacion}|${c.ingreso_tracking}`, {
        mes: c.mes,
        macro_tipo: macro,
        ambito: c.ambito,
        tipo_operacion: c.tipo_operacion,
        ingreso_tracking: c.ingreso_tracking,
      });
      accumulate(weekMap, `${c.yw}|${c.ingreso_tracking}`, {
        yw: c.yw,
        ingreso_tracking: c.ingreso_tracking,
      });
      accumulate(weekTypeMap, `${c.yw}|${macro}|${c.ambito}|${c.ingreso_tracking}`, {
        yw: c.yw,
        macro_tipo: macro,
        ambito: c.ambito,
        ingreso_tracking: c.ingreso_tracking,
      });
    }

    const sheet1Rows: (string | number)[][] = [
      [
        'Mes',
        'Cohorte WIN en Ruta',
        'Total Órdenes',
        'Con WSP Enviado',
        'Efectivas (#)',
        '% Efectividad (Total)',
        '% Efectividad (Sobre WSP)',
        'Canceladas (#)',
        '% Cancelación (Total)',
        '% Cancelación (Sobre WSP)',
        'Reprogramación / Regestión (#)',
        '% Reprogramación',
        'Autogestión Reprog. Web (#)',
        'Cliente Ausente (#)',
        '% Cliente Ausente',
        'Botón SOS Soporte (#)',
        '% Uso SOS',
      ],
    ];
    Array.from(monthMap.values())
      .sort((a, b) => a.mes.localeCompare(b.mes) || b.ingreso_tracking.localeCompare(a.ingreso_tracking))
      .forEach((r) => {
        sheet1Rows.push([
          r.mes,
          r.ingreso_tracking === 'SI' ? '1. INGRESÓ A WIN EN RUTA (SI)' : '2. NO INGRESÓ (NO)',
          r.total,
          r.con_wsp,
          r.finalizadas,
          pct(r.finalizadas, r.total),
          pct(r.fin_wsp, r.con_wsp),
          r.canceladas,
          pct(r.canceladas, r.total),
          pct(r.can_wsp, r.con_wsp),
          r.reprog_total,
          pct(r.reprog_total, r.total),
          r.reprog_web,
          r.ausente,
          pct(r.ausente, r.total),
          r.sos,
          pct(r.sos, r.total),
        ]);
      });

    const sheet2Rows: (string | number)[][] = [
      [
        'Mes',
        'Macro Tipo',
        'Ámbito',
        'Servicio Específico',
        'Cohorte WIN en Ruta',
        'Total Órdenes',
        'Con WSP Enviado',
        'Efectivas (#)',
        '% Efectividad (Total)',
        '% Efectividad (Sobre WSP)',
        'Canceladas (#)',
        '% Cancelación (Total)',
        '% Cancelación (Sobre WSP)',
        'Reprogramación / Regestión (#)',
        '% Reprogramación',
        'Autogestión Reprog. Web (#)',
        'Cliente Ausente (#)',
        '% Cliente Ausente',
        'SOS Soporte (#)',
      ],
    ];
    Array.from(monthTypeMap.values())
      .sort(
        (a, b) =>
          a.mes.localeCompare(b.mes) ||
          a.macro_tipo.localeCompare(b.macro_tipo) ||
          a.ambito.localeCompare(b.ambito) ||
          a.tipo_operacion.localeCompare(b.tipo_operacion) ||
          b.ingreso_tracking.localeCompare(a.ingreso_tracking)
      )
      .forEach((r) => {
        sheet2Rows.push([
          r.mes,
          r.macro_tipo,
          r.ambito,
          r.tipo_operacion,
          r.ingreso_tracking === 'SI' ? 'INGRESÓ (SI)' : 'NO INGRESÓ (NO)',
          r.total,
          r.con_wsp,
          r.finalizadas,
          pct(r.finalizadas, r.total),
          pct(r.fin_wsp, r.con_wsp),
          r.canceladas,
          pct(r.canceladas, r.total),
          pct(r.can_wsp, r.con_wsp),
          r.reprog_total,
          pct(r.reprog_total, r.total),
          r.reprog_web,
          r.ausente,
          pct(r.ausente, r.total),
          r.sos,
        ]);
      });

    const sheet3Rows: (string | number)[][] = [
      [
        'Semana ISO',
        'Rango Semana (Lun-Dom)',
        'Cohorte WIN en Ruta',
        'Total Órdenes',
        'Con WSP Enviado',
        'Efectivas (#)',
        '% Efectividad (Total)',
        '% Efectividad (Sobre WSP)',
        'Canceladas (#)',
        '% Cancelación (Total)',
        '% Cancelación (Sobre WSP)',
        'Reprogramación / Regestión (#)',
        '% Reprogramación',
        'Autogestión Reprog. Web (#)',
        'Cliente Ausente (#)',
        '% Cliente Ausente',
        'SOS Soporte (#)',
      ],
    ];
    Array.from(weekMap.values())
      .sort((a, b) => a.yw - b.yw || b.ingreso_tracking.localeCompare(a.ingreso_tracking))
      .forEach((r) => {
        const rng = weekRangeMap.get(r.yw) || { min: '', max: '' };
        sheet3Rows.push([
          `W${String(r.yw).slice(4)} (${String(r.yw).slice(0, 4)})`,
          `${rng.min} al ${rng.max}`,
          r.ingreso_tracking === 'SI' ? 'INGRESÓ (SI)' : 'NO INGRESÓ (NO)',
          r.total,
          r.con_wsp,
          r.finalizadas,
          pct(r.finalizadas, r.total),
          pct(r.fin_wsp, r.con_wsp),
          r.canceladas,
          pct(r.canceladas, r.total),
          pct(r.can_wsp, r.con_wsp),
          r.reprog_total,
          pct(r.reprog_total, r.total),
          r.reprog_web,
          r.ausente,
          pct(r.ausente, r.total),
          r.sos,
        ]);
      });

    const sheet4Rows: (string | number)[][] = [
      [
        'Semana ISO',
        'Rango Semana (Lun-Dom)',
        'Macro Tipo',
        'Ámbito',
        'Cohorte WIN en Ruta',
        'Total Órdenes',
        'Con WSP Enviado',
        'Efectivas (#)',
        '% Efectividad (Total)',
        '% Efectividad (Sobre WSP)',
        'Canceladas (#)',
        '% Cancelación (Total)',
        '% Cancelación (Sobre WSP)',
        'Reprogramación / Regestión (#)',
        '% Reprogramación',
        'Cliente Ausente (#)',
        '% Cliente Ausente',
        'SOS Soporte (#)',
      ],
    ];
    Array.from(weekTypeMap.values())
      .sort(
        (a, b) =>
          a.yw - b.yw ||
          a.macro_tipo.localeCompare(b.macro_tipo) ||
          a.ambito.localeCompare(b.ambito) ||
          b.ingreso_tracking.localeCompare(a.ingreso_tracking)
      )
      .forEach((r) => {
        const rng = weekRangeMap.get(r.yw) || { min: '', max: '' };
        sheet4Rows.push([
          `W${String(r.yw).slice(4)} (${String(r.yw).slice(0, 4)})`,
          `${rng.min} al ${rng.max}`,
          r.macro_tipo,
          r.ambito,
          r.ingreso_tracking === 'SI' ? 'INGRESÓ (SI)' : 'NO INGRESÓ (NO)',
          r.total,
          r.con_wsp,
          r.finalizadas,
          pct(r.finalizadas, r.total),
          pct(r.fin_wsp, r.con_wsp),
          r.canceladas,
          pct(r.canceladas, r.total),
          pct(r.can_wsp, r.con_wsp),
          r.reprog_total,
          pct(r.reprog_total, r.total),
          r.ausente,
          pct(r.ausente, r.total),
          r.sos,
        ]);
      });

    const estMap = new Map<string, { si: number; no: number; noWsp: number }>();
    let totSiAll = 0;
    let totNoAll = 0;
    for (const e of dataset.estadosCells) {
      const cur = estMap.get(e.estado) || { si: 0, no: 0, noWsp: 0 };
      if (e.ingreso_tracking === 'SI') {
        cur.si += e.total;
        totSiAll += e.total;
      } else {
        cur.no += e.total;
        cur.noWsp += e.con_wsp;
        totNoAll += e.total;
      }
      estMap.set(e.estado, cur);
    }

    const motMap = new Map<string, { si: number; no: number; noWsp: number }>();
    for (const m of dataset.motivosCells) {
      const cur = motMap.get(m.motivo_fin) || { si: 0, no: 0, noWsp: 0 };
      if (m.ingreso_tracking === 'SI') cur.si += m.total;
      else {
        cur.no += m.total;
        cur.noWsp += m.con_wsp;
      }
      motMap.set(m.motivo_fin, cur);
    }

    const sheet5Rows: (string | number)[][] = [
      [
        'Categoría',
        'Estado OT / Motivo de Quiebre o Incidencia',
        'Con Ingreso WIN en Ruta (#)',
        '% sobre Cohorte Con Ingreso',
        'Sin Ingreso Total (#)',
        '% sobre Cohorte Sin Ingreso',
        'Sin Ingreso Con WSP (#)',
        'Total Órdenes',
      ],
    ];
    Array.from(estMap.entries())
      .sort((a, b) => b[1].si + b[1].no - (a[1].si + a[1].no))
      .forEach(([estado, v]) => {
        sheet5Rows.push([
          '1. ESTADO OT',
          estado,
          v.si,
          pct(v.si, totSiAll),
          v.no,
          pct(v.no, totNoAll),
          v.noWsp,
          v.si + v.no,
        ]);
      });
    Array.from(motMap.entries())
      .sort((a, b) => b[1].si + b[1].no - (a[1].si + a[1].no))
      .slice(0, 30)
      .forEach(([motivo, v]) => {
        sheet5Rows.push([
          '2. INCIDENCIA / MOTIVO QUIEBRE',
          motivo,
          v.si,
          pct(v.si, totSiAll),
          v.no,
          pct(v.no, totNoAll),
          v.noWsp,
          v.si + v.no,
        ]);
      });

    const atcImpact = await queryAtcCohortImpact(startDate, endDate, service, searchQ, ignoreDates, 3);
    const atcAggMap = new Map<string, any>();
    for (const ac of atcImpact.orderCells || []) {
      const k = `${ac.mes}|${ac.tipo_operacion}|${ac.cohorte_3}`;
      const cur = atcAggMap.get(k) || {
        mes: ac.mes,
        tipo_operacion: ac.tipo_operacion,
        cohorte_3: ac.cohorte_3,
        total_ordenes: 0,
        ordenes_llamaron_all: 0,
        total_llamadas_all: 0,
        ordenes_llamaron_vt: 0,
        total_llamadas_vt: 0,
      };
      cur.total_ordenes += ac.total_ordenes;
      cur.ordenes_llamaron_all += ac.ordenes_llamaron_all;
      cur.total_llamadas_all += ac.total_llamadas_all;
      cur.ordenes_llamaron_vt += ac.ordenes_llamaron_vt;
      cur.total_llamadas_vt += ac.total_llamadas_vt;
      atcAggMap.set(k, cur);
    }

    const sheet6Rows: (string | number)[][] = [
      [
        'Mes',
        'Servicio',
        'Cohorte Seguimiento',
        'Total Órdenes',
        'Órdenes con Llamada ATC (#)',
        '% Contactabilidad ATC (Todas)',
        'Volumen Total Llamadas (#)',
        'Llamadas por cada 100 OTs',
        'Órdenes con Llamada VT/Instal (#)',
        '% Contactabilidad VT/Instal',
      ],
    ];
    Array.from(atcAggMap.values())
      .sort(
        (a, b) =>
          a.mes.localeCompare(b.mes) ||
          a.tipo_operacion.localeCompare(b.tipo_operacion) ||
          a.cohorte_3.localeCompare(b.cohorte_3)
      )
      .forEach((r) => {
        sheet6Rows.push([
          r.mes,
          r.tipo_operacion,
          r.cohorte_3 === 'INGRESO'
            ? '1. INGRESÓ AL TRACKING'
            : r.cohorte_3 === 'WSP_SIN_INGRESO'
              ? '2. CON WSP SIN INGRESO'
              : '3. SIN WSP ENVIADO',
          r.total_ordenes,
          r.ordenes_llamaron_all,
          pct(r.ordenes_llamaron_all, r.total_ordenes),
          r.total_llamadas_all,
          pct(r.total_llamadas_all, r.total_ordenes),
          r.ordenes_llamaron_vt,
          pct(r.ordenes_llamaron_vt, r.total_ordenes),
        ]);
      });

    const buf = buildXlsxBuffer([
      { name: '1_Resumen_Mensual', rows: sheet1Rows },
      { name: '2_Mensual_Tipo_Ambito', rows: sheet2Rows },
      { name: '3_Evolucion_Semanal', rows: sheet3Rows },
      { name: '4_Semanal_Tipo_Ambito', rows: sheet4Rows },
      { name: '5_Estados_e_Incidencias', rows: sheet5Rows },
      { name: '6_Deflexion_ATC', rows: sheet6Rows },
    ]);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Analisis_WIN_en_Ruta_${startDate}_al_${endDate}.xlsx"`
    );
    return res.send(buf);
  } catch (error: any) {
    console.error('❌ Error en /api/cohorts/export:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/cohorts/atc-impact -> Estudio de Deflexión de Llamadas ATC vs WIN en Ruta
router.get('/cohorts/atc-impact', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const todayDefault = new Date().toLocaleDateString('en-CA');
  const {
    startDate = todayDefault,
    endDate = todayDefault,
    service: rawService = 'Todos los servicios',
    q = '',
    ignoreDates = 'false',
    windowDays: rawWindow = '3',
    refresh = 'false',
  } = req.query as Record<string, string>;

  const service = enforceRoleServiceScope(req, rawService);
  const searchQ = String(q || '').trim();
  const windowDays = Math.min(15, Math.max(0, Number(rawWindow) || 3));
  const cacheKey = `cohorts_atc_v1_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}_${windowDays}`;

  try {
    await loadTipoServicioCacheIfNeeded();

    const payload = await withSingleFlightSwr(
      cacheKey,
      120,
      refresh === 'true',
      () => queryAtcCohortImpact(startDate, endDate, service, searchQ, ignoreDates, windowDays)
    );

    console.log(`✅ /api/cohorts/atc-impact completado en ${Date.now() - startTime}ms`);
    return res.json(payload);
  } catch (error: any) {
    console.error('❌ Error en /api/cohorts/atc-impact:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
