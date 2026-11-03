import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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

// 1. Verificar conexión y listar tablas
app.get('/api/test-db', async (_req, res) => {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    res.json({ ok: true, message: 'Conectado a Azure MySQL exitosamente', tables });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 2. Ver las columnas de cualquier tabla (Ej: http://localhost:3001/api/schema/nombre_tabla)
app.get('/api/schema/:table', async (req, res) => {
  try {
    const [columns] = await pool.query(`DESCRIBE ??`, [req.params.table]);
    const [sample] = await pool.query(`SELECT * FROM ?? LIMIT 5`, [req.params.table]);
    res.json({ ok: true, table: req.params.table, columns, sample });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 3. Endpoint principal para alimentar todas las vistas del Dashboard
app.get('/api/dashboard', async (req, res) => {
  const { period, service, zone } = req.query;
  try {
    /* 
     * CUANDO ME PASES EL NOMBRE DE TU TABLA Y COLUMNAS,
     * DESCOMENTAMOS ESTA CONSULTA SQL REAL:
     *
     * const [rows]: any = await pool.query(`
     *   SELECT 
     *     COUNT(*) as total_ordenes,
     *     SUM(CASE WHEN estado_whs IS NOT NULL THEN 1 ELSE 0 END) as whs_enviados
     *   FROM tu_tabla_ordenes
     *   WHERE (? = 'Todas las zonas' OR zona = ?)
     * `, [zone, zone]);
     */

    res.json({
      ok: true,
      dbConnected: true,
      appliedFilters: { period, service, zone },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API Azure MySQL lista en http://localhost:${PORT}`);
});