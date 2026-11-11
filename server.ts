import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './src/server/config/env';
import { pool, endPool } from './src/server/config/db';
import { quitRedis } from './src/server/config/redis';
import { errorHandler } from './src/server/middleware/errorHandler';
import { apiLimiter } from './src/server/middleware/rateLimit';
import { ensureRbacTables } from './src/server/routes/auth';

import authRoutes from './src/server/routes/auth';
import dashboardRoutes from './src/server/routes/dashboard';
import ordersRoutes from './src/server/routes/orders';
import trackingRoutes from './src/server/routes/tracking';
import operationsRoutes from './src/server/routes/operations';
import csatRoutes from './src/server/routes/csat';
import efficiencyRoutes from './src/server/routes/efficiency';
import filtersRoutes from './src/server/routes/filters';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

// Middlewares globales
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Rate limiters
app.use('/api', apiLimiter);

// Healthcheck público para Azure App Service Load Balancer
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'UP', timestamp: new Date().toISOString() });
});

// Montar rutas en ambos prefijos (/api/auth y /api) para evitar 404 por doble prefijo
app.use('/api/auth', authRoutes);
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', ordersRoutes);
app.use('/api', trackingRoutes);
app.use('/api', operationsRoutes);
app.use('/api', csatRoutes);
app.use('/api', efficiencyRoutes);
app.use('/api', filtersRoutes);

// Middleware global de manejo de errores
app.use(errorHandler);

// Servir archivos estáticos del Frontend compilado (dist) en producción
const distPath = path.join(__dirname, 'dist');
app.use(
  '/assets',
  express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  })
);
app.use(express.static(distPath, { maxAge: 0 }));

app.get(/(.*)/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = Number(process.env.PORT || process.env.WEBSITES_PORT || 8080);
const serverInstance = app.listen(PORT, async () => {
  console.log(`✅ Servidor WIN en RUTA activo en puerto ${PORT}`);
  try {
    await ensureRbacTables();
    console.log('✅ Tablas RBAC verificadas');
  } catch (err: any) {
    console.warn('⚠️ Aviso verificando tablas RBAC:', err.message);
  }
});

async function gracefulShutdown(signal: string) {
  console.log(`🛑 Recibida señal ${signal}. Cerrando conexiones de forma segura...`);
  serverInstance.close();
  try {
    await quitRedis();
    await endPool();
  } catch {
    // Ignorar errores al cerrar
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));