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

async function inspectIndexes() {
  try {
    // 1. Listar todos los índices existentes en BD_Phoenix
    const [indexes] = await pool.query(`
      SELECT 
        TABLE_NAME AS tabla,
        INDEX_NAME AS indice,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columnas,
        NON_UNIQUE AS no_unico,
        INDEX_TYPE AS tipo
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE
      ORDER BY TABLE_NAME, INDEX_NAME
    `);
    console.log('\n=== 1. ÍNDICES ACTUALES EN BD_Phoenix ===');
    console.table(indexes);

    // 2. Ver qué tablas físicas alimentan las vistas principales
    const views = [
      'vw_reporte_funnel_casos_360',
      'vw_winordetraba',
      'vw_reprogramaciones_detalle',
      'vw_reporte_encuestas_enriquecido',
    ];

    console.log('\n=== 2. DEFINICIÓN DE VISTAS PRINCIPALES ===');
    for (const v of views) {
      try {
        const [res] = await pool.query(`SHOW CREATE VIEW \`${v}\``);
        console.log(`\n--- ${v} ---`);
        console.log(res[0]['Create View']);
      } catch (err) {
        console.log(`No es vista o error en ${v}:`, err.message);
      }
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

inspectIndexes();