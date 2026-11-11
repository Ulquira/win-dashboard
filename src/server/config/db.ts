import mysql from 'mysql2/promise';
import { env } from './env';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  port: Number(env.DB_PORT),
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: Number(env.DB_POOL_LIMIT) || 20,
  queueLimit: 0,
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

export async function endPool(): Promise<void> {
  await pool.end();
}
