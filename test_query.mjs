import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
        DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m') AS fecha,
        COUNT(*) AS total
      FROM vw_reporte_funnel_casos_360 v
      WHERE v.fecha_solicitud_dia >= '2026-10-28' AND v.fecha_solicitud_dia <= '2026-11-03'
      GROUP BY v.fecha_solicitud_dia
      ORDER BY v.fecha_solicitud_dia ASC
    `);
    console.log('Result rows:', rows);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
