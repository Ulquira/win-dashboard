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
    // 1. Simular query de /api/orders/search con service = 'AVER - LIMA'
    const [ordersLima] = await pool.query(`
      SELECT 
        v.orden_id,
        v.ticket,
        v.producto,
        v.tipo_operacion,
        v.sector_operativo,
        v.ambito
      FROM vw_reporte_funnel_casos_360 v
      WHERE UPPER(TRIM(v.tipo_operacion)) IN ('AVER - LIMA')
      LIMIT 20
    `);

    console.log('Total órdenes devueltas para AVER - LIMA:', ordersLima.length);
    const noLima = ordersLima.filter(o => !o.sector_operativo.startsWith('LIMA'));
    console.log('¿Hay alguna orden que NO sea Lima?:', noLima.length);

    // 2. Simular desglose por tipo_operacion en /api/dashboard
    const [breakdown] = await pool.query(`
      SELECT 
        UPPER(TRIM(COALESCE(v.tipo_operacion, 'OTROS'))) AS tipo,
        COUNT(*) AS total
      FROM vw_reporte_funnel_casos_360 v
      WHERE v.fecha_solicitud_dia >= CURDATE() - INTERVAL 7 DAY
      GROUP BY UPPER(TRIM(COALESCE(v.tipo_operacion, 'OTROS')))
      ORDER BY total DESC
    `);
    console.log('Desglose dashboard:');
    console.table(breakdown);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
