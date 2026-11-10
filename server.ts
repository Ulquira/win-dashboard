import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import NodeCache from 'node-cache';
import { Redis } from 'ioredis';
import compression from 'compression';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Requerido en Azure App Service (detrás de Load Balancer / Auto-Scaling) para leer la IP real del cliente
app.set('trust proxy', 1);

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Rate Limiters (Plan 1.4)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Máx 10 intentos fallidos por IP cada 15 min
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos.',
  },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 180, // 180 peticiones por minuto por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Límite de peticiones excedido. Por favor espera unos segundos.',
  },
});

app.use('/api', apiLimiter);

// ============================================================================
// FASE 2: CACHÉ DISTRIBUIDO REDIS + SWR (STALE-WHILE-REVALIDATE) + SINGLE-FLIGHT
// ============================================================================
const queryCache = new NodeCache({ stdTTL: 300 });
const swrMemoryCache = new NodeCache({ stdTTL: 1800 });
const inFlightRequests = new Map<string, Promise<any>>();
const REDIS_URL = (process.env.REDIS_URL || '').trim();
let redisClient: Redis | null = null;

if (REDIS_URL) {
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    tls: REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });
  redisClient.on('connect', () => console.log('🚀 Conectado a Azure Cache for Redis (Auto-Scaling activo)'));
  redisClient.on('error', (err) => console.warn('⚠️ Aviso Redis (usando fallback RAM):', err.message));
}

async function cacheGet<T = any>(key: string): Promise<T | null> {
  const swrEntry = swrMemoryCache.get<{ data: T; freshUntil: number }>(key);
  if (swrEntry && Date.now() < swrEntry.freshUntil) {
    return swrEntry.data;
  }
  if (redisClient && redisClient.status === 'ready') {
    try {
      const raw = await redisClient.get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // Fallback silencioso a RAM
    }
  }
  return (queryCache.get(key) as T) || null;
}

async function cacheSet(key: string, val: any, ttlSeconds = 300): Promise<void> {
  queryCache.set(key, val, ttlSeconds);
  swrMemoryCache.set(
    key,
    { data: val, freshUntil: Date.now() + ttlSeconds * 1000 },
    Math.max(ttlSeconds * 6, 900)
  );
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.set(key, JSON.stringify(val), 'EX', ttlSeconds);
    } catch {
      // Ignorar fallo de escritura en Redis
    }
  }
}

async function withSingleFlightSwr<T>(
  key: string,
  ttlSeconds: number,
  forceRefresh: boolean,
  computeFn: () => Promise<T>
): Promise<T> {
  const runCompute = (): Promise<T> => {
    const existing = inFlightRequests.get(key);
    if (existing) return existing as Promise<T>;
    const p = computeFn()
      .then(async (result) => {
        await cacheSet(key, result, ttlSeconds);
        return result;
      })
      .finally(() => {
        inFlightRequests.delete(key);
      });
    inFlightRequests.set(key, p);
    return p;
  };

  if (!forceRefresh) {
    const swrEntry = swrMemoryCache.get<{ data: T; freshUntil: number }>(key);
    if (swrEntry) {
      if (Date.now() >= swrEntry.freshUntil && !inFlightRequests.has(key)) {
        // Stale-While-Revalidate: sirve instantáneamente y refresca en segundo plano
        runCompute().catch((err) => console.warn(`⚠️ Error en SWR background (${key}):`, err.message));
      }
      return swrEntry.data;
    }
    const cached = await cacheGet<T>(key);
    if (cached) {
      swrMemoryCache.set(
        key,
        { data: cached, freshUntil: Date.now() + ttlSeconds * 1000 },
        Math.max(ttlSeconds * 6, 900)
      );
      return cached;
    }
  }

  return runCompute();
}

// Pool MySQL optimizado para Auto-Scaling (configurable vía DB_POOL_LIMIT)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT) || 20,
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

// Variables de Capa Intermedia / API en Azure App Service
const CAPA_INTERMEDIA_URL = (
  process.env.CAPA_INTERMEDIA_URL ||
  process.env.MANTRA_API_URL ||
  'https://webwin-api-service-eus.azurewebsites.net'
).replace(/\/+$/, '');

const SECRET_API_KEY =
  process.env.SECRET_API_KEY ||
  process.env.MANTRA_API_TOKEN ||
  'LLAVE_SECRETA_DEL_TERCERO_123';

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

const SERVICIOS_PERMITIDOS = [
  'INSTA - LIMA',
  'INSTA - PROV',
  'AVER - LIMA',
  'AVER - PROV',
  'POSTVENTA',
] as const;

const HOMOLOGACION_INVERSA_DB: Record<string, string[]> = {
  'INSTA - LIMA': ['INSTA - LIMA', 'INSTALACION', 'INSTALACIÓN', 'INSTALACIONES'],
  'INSTA - PROV': ['INSTA - PROV', 'PROVINCIA', 'INSTALACION PROVINCIA'],
  'AVER - LIMA': ['AVER - LIMA', 'AVERIAS', 'AVERÍAS', 'AVERIA'],
  'AVER - PROV': ['AVER - PROV', 'AVERIAS PRV', 'AVERÍAS PRV', 'AVERIAS PROV'],
  'POSTVENTA': ['POSTVENTA', 'POST VENTA'],
};

/**
 * Homologa estrictamente a los 5 servicios permitidos.
 * Cualquier otro valor ('NO', 'OTROS', etc.) devuelve null y queda bloqueado.
 */
function homologarTipoServicio(rawTipo: string): string | null {
  const upper = String(rawTipo || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!upper || upper === 'NO' || upper === 'OTROS' || upper === 'NULL') return null;

  // 1. POSTVENTA primero para que nunca sea absorbido por Instalaciones
  if (upper.includes('POSTVENTA') || upper.includes('POST VENTA') || upper.includes('TRASLADO') || upper.includes('MIGRACION') || upper.includes('CAMBIO DE PLAN') || upper.includes('MESH')) {
    if (upper === 'INSTA - LIMA' || upper === 'INSTA - PROV' || upper === 'AVER - LIMA' || upper === 'AVER - PROV') {
      // Respetar si ya viene con el nombre canónico exacto
    } else if (upper === 'POSTVENTA' || upper === 'POST VENTA') {
      return 'POSTVENTA';
    }
  }

  if (
    upper === 'INSTALACION' ||
    upper === 'INSTALACIONES' ||
    upper === 'INSTA - LIMA' ||
    upper === 'INSTA-LIMA' ||
    upper === 'INSTALACION LIMA'
  ) {
    return 'INSTA - LIMA';
  }
  if (
    upper === 'PROVINCIA' ||
    upper === 'INSTALACION PROVINCIA' ||
    upper === 'INSTALACIONES PROVINCIA' ||
    upper === 'INSTA - PROV' ||
    upper === 'INSTA-PROV'
  ) {
    return 'INSTA - PROV';
  }
  if (
    upper === 'AVERIAS' ||
    upper === 'AVERIA' ||
    upper === 'AVER - LIMA' ||
    upper === 'AVER-LIMA' ||
    upper === 'AVERIAS LIMA'
  ) {
    return 'AVER - LIMA';
  }
  if (
    upper === 'AVERIAS PRV' ||
    upper === 'AVERIAS PROV' ||
    upper === 'AVERIAS PROVINCIA' ||
    upper === 'AVER - PROV' ||
    upper === 'AVER-PROV'
  ) {
    return 'AVER - PROV';
  }
  if (upper === 'POSTVENTA' || upper === 'POST VENTA') {
    return 'POSTVENTA';
  }

  return null;
}

/**
 * Clasifica cualquier nombre de producto/motivo de trabajo en uno de los 5 tipos oficiales.
 * Usa primero el mapa cargado desde la tabla `tiposervicio` y, si no está, aplica reglas de negocio.
 */
function classifyOrderServiceType(productoRaw?: any, tipoOperacionRaw?: any): string {
  const tipoOpKey = String(tipoOperacionRaw || '').trim().toUpperCase();
  const prodKey = String(productoRaw || '').trim().toUpperCase();

  // 1. Prioridad: Lo que calculó la vista limpia en tipo_operacion (INSTA - LIMA, AVER - LIMA, etc.)
  const fromTipoOp = homologarTipoServicio(tipoOpKey);
  if (fromTipoOp) return fromTipoOp;

  // 2. Si no viene tipo_operacion o no es canónico, consultar mapa
  if (prodKey && servicioToTipoMap.has(prodKey)) {
    return servicioToTipoMap.get(prodKey)!;
  }

  const fromProd = homologarTipoServicio(prodKey);
  if (fromProd) return fromProd;

  return 'OTROS';
}

async function loadTipoServicioCache() {
  const map = new Map<string, string>();
  try {
    const [rows]: any = await pool.query(`SELECT * FROM tiposervicio`);
    for (const r of rows || []) {
      const textValues = Object.entries(r)
        .filter(
          ([k, v]) =>
            !['id', 'id_tipo', 'codigo_id', 'created_at'].includes(k.toLowerCase()) &&
            v !== null &&
            v !== undefined
        )
        .map(([, v]) => String(v).trim())
        .filter((v) => v.length > 0 && !/^\d+$/.test(v));

      let detectedCategory: string | null = null;
      let detectedOrderType: string | null = null;

      for (const val of textValues) {
        const cat = homologarTipoServicio(val);
        if (cat && !detectedCategory) {
          detectedCategory = cat;
        } else if (!detectedOrderType) {
          detectedOrderType = val;
        }
      }

      if (detectedCategory && detectedOrderType) {
        map.set(detectedOrderType.toUpperCase(), detectedCategory);
      } else if (detectedCategory && textValues.length === 1) {
        map.set(textValues[0].toUpperCase(), detectedCategory);
      }
    }
  } catch (err: any) {
    console.warn('⚠️ Aviso leyendo tabla tiposervicio:', err.message);
  }

  servicioToTipoMap = map;
  tiposUnicosList = [...SERVICIOS_PERMITIDOS];
  queryCache.flushAll();
  console.log(
    `✅ Catálogo tiposervicio cargado (${map.size} tipos de orden mapeados):`,
    Array.from(map.entries())
      .map(([k, v]) => `${k} => ${v}`)
      .join(' | ')
  );
}
await loadTipoServicioCache();

// ============================================================================
// FASE 1: SINCRONIZACIÓN AUTOMÁTICA DE TABLA MATERIALIZADA (mat_funnel_casos_360)
// ============================================================================
let isSyncingMatFunnel = false;

async function syncMatFunnelIncremental(customStart?: string, customEnd?: string): Promise<void> {
  if (isSyncingMatFunnel && !customStart) return;
  isSyncingMatFunnel = true;
  try {
    if (customStart && customEnd) {
      await pool.query(`CALL sp_sync_mat_funnel_range(?, CONCAT(?, ' 23:59:59'))`, [
        `${customStart} 00:00:00`,
        customEnd,
      ]);
    } else {
      await pool.query(
        `CALL sp_sync_mat_funnel_range(DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY))`
      );
    }
  } catch (err: any) {
    console.warn('⚠️ Aviso en syncMatFunnelIncremental:', err.message);
  } finally {
    isSyncingMatFunnel = false;
  }
}

// Alimentar y actualizar automáticamente mat_funnel_casos_360 cada 60 segundos en segundo plano
const matSyncInterval = setInterval(() => {
  syncMatFunnelIncremental().catch(() => {});
}, 60 * 1000);
matSyncInterval.unref();

/**
 * Resuelve estrictamente la lista de productos (de la tabla `tiposervicio`)
 * que pertenecen al tipo de servicio seleccionado.
 */
function resolveProductosFromServiceFilter(serviceParam: string): {
  srvList: string[];
  productosDelTipo: string[];
  canonicalList: string[];
} {
  const isAll =
    !serviceParam ||
    serviceParam === 'Todos' ||
    serviceParam === 'Todos los servicios';

  const rawSelected = isAll
    ? []
    : serviceParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const canonicalSet = new Set<string>();
  const dbSrvEquivalents = new Set<string>();

  for (const item of rawSelected) {
    const canon = homologarTipoServicio(item) || (servicioToTipoMap.get(item.toUpperCase()) ?? null);
    if (!canon) continue;
    canonicalSet.add(canon);
    dbSrvEquivalents.add(canon);
    const aliases = HOMOLOGACION_INVERSA_DB[canon] || [];
    aliases.forEach((a) => dbSrvEquivalents.add(a.toUpperCase()));
  }

  const productosDelTipo: string[] = [];
  if (canonicalSet.size > 0) {
    servicioToTipoMap.forEach((tipoHomologado, prodKey) => {
      if (canonicalSet.has(tipoHomologado)) {
        productosDelTipo.push(prodKey);
      }
    });
  }

  return {
    srvList: Array.from(dbSrvEquivalents),
    productosDelTipo,
    canonicalList: Array.from(canonicalSet),
  };
}

/**
 * Construye el filtro SQL exacto por Tipo de Orden homologado en `tiposervicio`
 * (sin usar `w.TipoTraba` para que nunca se mezclen órdenes de Provincia en Lima)
 */
function buildStrictOrderTypeSql(
  serviceParam: string,
  colTipoOrden: string = 'v.tipo_operacion'
): { sql: string; params: any[] } {
  if (!serviceParam || serviceParam === 'Todos' || serviceParam === 'Todos los servicios') {
    return { sql: '1=1', params: [] };
  }

  const { canonicalList, productosDelTipo, srvList } = resolveProductosFromServiceFilter(serviceParam);
  if (canonicalList.length === 0) {
    return { sql: '1=1', params: [] };
  }

  // Si filtramos sobre v.tipo_operacion (la vista ya calculó canonical: INSTA - LIMA, AVER - LIMA, etc.)
  if (colTipoOrden.includes('tipo_operacion')) {
    const placeholders = canonicalList.map(() => '?').join(',');
    return {
      sql: `UPPER(TRIM(${colTipoOrden})) IN (${placeholders})`,
      params: canonicalList.map((x) => x.toUpperCase()),
    };
  }

  // Para columnas de producto genérico (como en vw_winordetraba)
  const targetList = productosDelTipo.length > 0 ? productosDelTipo : srvList;
  if (targetList.length === 0) {
    return { sql: '1=1', params: [] };
  }
  const placeholders = targetList.map(() => '?').join(',');
  return {
    sql: `UPPER(TRIM(${colTipoOrden})) IN (${placeholders})`,
    params: targetList.map((x) => x.toUpperCase()),
  };
}

// ============================================================================
// MÓDULO DE AUTENTICACIÓN (JWT ESTÁNDAR + BCRYPT + ZOD + RBAC)
// ============================================================================
const AUTH_SECRET = process.env.JWT_SECRET || SECRET_API_KEY || 'WIN_ENRUTA_SECRET_2026';
const BCRYPT_ROUNDS = 10;

// Esquemas de validación estricta con Zod (Plan 1.3)
const LoginSchema = z.object({
  documento: z.string().trim().min(3, 'El documento debe tener al menos 3 caracteres.').max(25),
  password: z.string().trim().min(3, 'Ingresa una contraseña válida.').max(128),
});

const RoleUpsertSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  codigo: z.string().trim().min(2, 'Código obligatorio').max(50),
  nombre: z.string().trim().min(2, 'Nombre obligatorio').max(100),
  vistas: z.array(z.string()).default(['Dashboard']),
  subvistas: z.array(z.string()).default(['ejecutiva']),
  servicios: z.array(z.string()).default(['*']),
});

const UserUpsertSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  documento: z.string().trim().min(3, 'Documento obligatorio').max(20),
  nombre: z.string().trim().min(2, 'Nombre obligatorio').max(120),
  email: z.string().trim().max(120).optional().or(z.literal('')),
  password: z.string().trim().max(128).optional(),
  rol_id: z.coerce.number().int().positive().default(1),
  activo: z.union([z.boolean(), z.number()]).default(true),
});

// JWT Estándar con retrocompatibilidad HMAC por si hay sesiones previas abiertas (Plan 1.2)
function signAuthToken(payload: Record<string, any>): string {
  const { exp, iat, ...cleanPayload } = payload;
  return jwt.sign(cleanPayload, AUTH_SECRET, {
    algorithm: 'HS256',
    expiresIn: '12h',
  });
}

function verifyAuthToken(token?: string): Record<string, any> | null {
  if (!token) return null;
  try {
    return jwt.verify(token, AUTH_SECRET) as Record<string, any>;
  } catch {
    // Fallback temporal para tokens de 2 segmentos emitidos antes de esta actualización
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(base64Payload)
      .digest('base64url');
    if (signature !== expectedSig) return null;
    try {
      const decoded = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf8'));
      if (decoded.exp && Date.now() > decoded.exp) return null;
      return decoded;
    } catch {
      return null;
    }
  }
}

function parseJsonSafe(raw: any, fallback: string[] = ['*']): string[] {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function requireAuth(req: express.Request, res: express.Response): Record<string, any> | null {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: 'Sesión expirada o inválida' });
    return null;
  }
  return decoded;
}

function requireAdmin(req: express.Request, res: express.Response): Record<string, any> | null {
  const decoded = requireAuth(req, res);
  if (!decoded) return null;
  const rolCodigo = String(decoded?.permisos?.rolCodigo || '').toUpperCase();
  const vistas: string[] = decoded?.permisos?.vistas || [];
  if (rolCodigo !== 'ADMIN' && !vistas.includes('*') && !vistas.includes('Accesos')) {
    res.status(403).json({ ok: false, error: 'Acceso restringido a Administradores.' });
    return null;
  }
  return decoded;
}

// Helper que restringe cualquier filtro de servicio del frontend a los servicios permitidos por el Rol en el JWT
function enforceRoleServiceScope(req: express.Request, requestedService: string): string {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const decoded = verifyAuthToken(token);
  const allowed: string[] = decoded?.permisos?.servicios || ['*'];

  if (allowed.includes('*') || allowed.length === 0) {
    return requestedService;
  }

  if (
    !requestedService ||
    requestedService === 'Todos' ||
    requestedService === 'Todos los servicios'
  ) {
    return allowed.join(',');
  }

  const reqList = requestedService
    .split(',')
    .map((s) => s.trim())
    .filter((s) => allowed.includes(s));

  return reqList.length > 0 ? reqList.join(',') : allowed.join(',');
}

// POST /api/auth/login -> Valida con Zod + Rate Limit + Bcrypt (con auto-migración a Bcrypt)
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const parsedBody = LoginSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        ok: false,
        error: parsedBody.error.issues[0]?.message || 'Credenciales inválidas.',
      });
    }

    const { documento, password } = parsedBody.data;

    const [rows]: any = await pool.query(
      `
      SELECT 
        u.*,
        r.codigo AS rol_codigo,
        r.nombre AS rol_nombre,
        r.vistas_permitidas,
        r.subvistas_permitidas,
        r.servicios_permitidos
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.documento = ?
      LIMIT 1
      `,
      [documento]
    );
    const userRow: any = rows?.[0] || null;

    if (!userRow) {
      return res.status(401).json({ ok: false, error: 'Documento o contraseña incorrectos.' });
    }

    if (userRow.activo !== undefined && Number(userRow.activo) === 0) {
      return res.status(403).json({
        ok: false,
        error: 'Tu usuario se encuentra inactivo. Contacta al administrador.',
      });
    }

    const dbPass = String(userRow.password ?? userRow.clave ?? userRow.password_hash ?? '');
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(dbPass);
    let isPasswordValid = false;

    if (isBcryptHash) {
      isPasswordValid = await bcrypt.compare(password, dbPass);
    } else {
      const sha256Input = crypto.createHash('sha256').update(password).digest('hex');
      isPasswordValid = dbPass === password || dbPass === sha256Input;

      // Auto-migración transparente: si la contraseña estaba en texto plano, la encripta con Bcrypt en BD
      if (isPasswordValid && userRow.id) {
        const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        pool
          .query(`UPDATE usuarios SET password = ? WHERE id = ?`, [newHash, Number(userRow.id)])
          .catch(() => { });
      }
    }

    if (!isPasswordValid) {
      return res.status(401).json({ ok: false, error: 'Documento o contraseña incorrectos.' });
    }

    const permisos = {
      rolCodigo: String(userRow.rol_codigo || userRow.rol || 'ADMIN').toUpperCase(),
      rolNombre: String(userRow.rol_nombre || userRow.rol || 'Administrador'),
      vistas: parseJsonSafe(userRow.vistas_permitidas, ['*']),
      subvistas: parseJsonSafe(userRow.subvistas_permitidas, ['*']),
      servicios: parseJsonSafe(userRow.servicios_permitidos, ['*']),
    };

    const userPayload = {
      id: Number(userRow.id || 1),
      documento: String(userRow.documento || documento),
      nombre: String(userRow.nombre || `Usuario ${documento}`),
      email: String(userRow.email || ''),
      permisos,
    };

    const token = signAuthToken(userPayload);
    return res.json({ ok: true, token, user: userPayload });
  } catch (err: any) {
    console.error('❌ Error en /api/auth/login:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno al validar credenciales.' });
  }
});

// Inicializar tablas RBAC automáticamente y hashear contraseña inicial
async function ensureRbacTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nombre VARCHAR(100) NOT NULL,
        vistas_permitidas JSON NOT NULL,
        subvistas_permitidas JSON NOT NULL,
        servicios_permitidos JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      INSERT IGNORE INTO roles (id, codigo, nombre, vistas_permitidas, subvistas_permitidas, servicios_permitidos) VALUES
      (1, 'ADMIN', 'Administrador Total', '["*"]', '["*"]', '["*"]'),
      (2, 'INSTALACIONES_LIMA', 'Supervisor Instalaciones Lima', '["Dashboard", "Órdenes", "Seguimiento"]', '["ejecutiva", "operativa", "operaciones"]', '["INSTA - LIMA"]'),
      (3, 'PROVINCIA', 'Coordinador Provincia', '["Dashboard", "Órdenes", "Seguimiento"]', '["operativa", "operaciones"]', '["INSTA - PROV", "AVER - PROV"]'),
      (4, 'VISITA_TECNICA_AVERIAS', 'Supervisor Averías y Postventa', '["Dashboard", "Órdenes", "Seguimiento"]', '["ejecutiva", "operativa", "operaciones"]', '["AVER - LIMA", "AVER - PROV", "POSTVENTA"]')
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        documento VARCHAR(20) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL,
        email VARCHAR(120) NULL,
        password VARCHAR(255) NOT NULL,
        rol_id INT NOT NULL DEFAULT 1,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const defaultHash = await bcrypt.hash('win2026', BCRYPT_ROUNDS);
    await pool.query(
      `INSERT IGNORE INTO usuarios (documento, nombre, email, password, rol_id, activo) VALUES ('99999999', 'Admin General WIN', 'admin@win.pe', ?, 1, 1)`,
      [defaultHash]
    );
  } catch (err: any) {
    console.warn('⚠️ Aviso verificando tablas RBAC:', err.message);
  }
}
await ensureRbacTables();

// Middleware global: exige sesión JWT válida en cualquier ruta /api/* (excepto /api/auth/login)
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  const decoded = requireAuth(req, res);
  if (!decoded) return;
  next();
});

// GET /api/auth/me -> Verifica sesión activa y devuelve permisos actualizados desde BD
app.get('/api/auth/me', async (req, res) => {
  const decoded = requireAuth(req, res);
  if (!decoded) return;
  try {
    const [rows]: any = await pool.query(
      `
      SELECT 
        u.*,
        r.codigo AS rol_codigo,
        r.nombre AS rol_nombre,
        r.vistas_permitidas,
        r.subvistas_permitidas,
        r.servicios_permitidos
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.id = ? OR u.documento = ?
      LIMIT 1
      `,
      [decoded.id || 0, decoded.documento || '']
    );
    const userRow = rows?.[0];
    if (!userRow || Number(userRow.activo) === 0) {
      return res.status(401).json({ ok: false, error: 'Usuario inactivo o no encontrado' });
    }
    const freshUser = {
      id: Number(userRow.id),
      documento: String(userRow.documento),
      nombre: String(userRow.nombre),
      email: String(userRow.email || ''),
      permisos: {
        rolCodigo: String(userRow.rol_codigo || 'ADMIN').toUpperCase(),
        rolNombre: String(userRow.rol_nombre || 'Administrador'),
        vistas: parseJsonSafe(userRow.vistas_permitidas, ['*']),
        subvistas: parseJsonSafe(userRow.subvistas_permitidas, ['*']),
        servicios: parseJsonSafe(userRow.servicios_permitidos, ['*']),
      },
    };
    const freshToken = signAuthToken(freshUser);
    return res.json({ ok: true, token: freshToken, user: freshUser });
  } catch {
    return res.json({ ok: true, user: decoded });
  }
});

// GET /api/admin/rbac -> Listar todos los usuarios y roles
app.get('/api/admin/rbac', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [rolesResult, usersResult]: any = await Promise.all([
      pool.query(`SELECT * FROM roles ORDER BY id ASC`),
      pool.query(`
        SELECT u.id, u.documento, u.nombre, u.email, u.rol_id, u.activo, r.codigo AS rol_codigo, r.nombre AS rol_nombre
        FROM usuarios u
        LEFT JOIN roles r ON r.id = u.rol_id
        ORDER BY u.id DESC
      `),
    ]);

    const rolesRows = rolesResult?.[0] || [];
    const userRows = usersResult?.[0] || [];

    const roles = rolesRows.map((r: any) => ({
      id: Number(r.id),
      codigo: String(r.codigo || ''),
      nombre: String(r.nombre || ''),
      vistas: parseJsonSafe(r.vistas_permitidas, ['*']),
      subvistas: parseJsonSafe(r.subvistas_permitidas, ['*']),
      servicios: parseJsonSafe(r.servicios_permitidos, ['*']),
    }));

    return res.json({
      ok: true,
      roles,
      usuarios: userRows,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/roles -> Crear o actualizar un Rol validado con Zod
app.post('/api/admin/roles', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const parsed = RoleUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Datos de rol inválidos.',
      });
    }

    const { id, codigo, nombre, vistas, subvistas, servicios } = parsed.data;
    const cleanCodigo = codigo.toUpperCase().replace(/\s+/g, '_');

    const vJson = JSON.stringify(vistas.length > 0 ? vistas : ['Dashboard']);
    const svJson = JSON.stringify(subvistas.length > 0 ? subvistas : ['ejecutiva']);
    const sJson = JSON.stringify(servicios.length > 0 ? servicios : ['*']);

    if (id) {
      await pool.query(
        `UPDATE roles SET codigo = ?, nombre = ?, vistas_permitidas = ?, subvistas_permitidas = ?, servicios_permitidos = ? WHERE id = ?`,
        [cleanCodigo, nombre, vJson, svJson, sJson, id]
      );
    } else {
      await pool.query(
        `INSERT INTO roles (codigo, nombre, vistas_permitidas, subvistas_permitidas, servicios_permitidos) VALUES (?, ?, ?, ?, ?)`,
        [cleanCodigo, nombre, vJson, svJson, sJson]
      );
    }
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/users -> Crear o actualizar un Usuario con hash Bcrypt y Zod
app.post('/api/admin/users', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const parsed = UserUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Datos de usuario inválidos.',
      });
    }

    const { id, documento, nombre, email, password, rol_id, activo } = parsed.data;
    const actNum = activo === false || Number(activo) === 0 ? 0 : 1;

    if (id) {
      if (password && password.length > 0) {
        const passHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await pool.query(
          `UPDATE usuarios SET documento = ?, nombre = ?, email = ?, password = ?, rol_id = ?, activo = ? WHERE id = ?`,
          [documento, nombre, email || '', passHash, rol_id, actNum, id]
        );
      } else {
        await pool.query(
          `UPDATE usuarios SET documento = ?, nombre = ?, email = ?, rol_id = ?, activo = ? WHERE id = ?`,
          [documento, nombre, email || '', rol_id, actNum, id]
        );
      }
    } else {
      if (!password || password.length < 4) {
        return res.status(400).json({
          ok: false,
          error: 'La contraseña es obligatoria (mínimo 4 caracteres) para usuarios nuevos.',
        });
      }
      const passHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await pool.query(
        `INSERT INTO usuarios (documento, nombre, email, password, rol_id, activo) VALUES (?, ?, ?, ?, ?, ?)`,
        [documento, nombre, email || '', passHash, rol_id, actNum]
      );
    }
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/admin/users/:id -> Eliminar usuario
app.delete('/api/admin/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de usuario inválido.' });
    }
    await pool.query(`DELETE FROM usuarios WHERE id = ?`, [userId]);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

function cleanPartnerName(raw: any): string {
  const str = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\b(SGI|SGA)\b/gi, '')
    .replace(/[0-9]+/g, '')
    .replace(/[-_]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return str || 'SIN PARTNER';
}

// 0. Endpoint de telemetría rápida para la vista Inicio (sync_runs + chats SOS activos)
app.get('/api/home/status', async (_req, res) => {
  try {
    const cached = await cacheGet('home_system_status');
    if (cached) return res.json(cached);

    const [syncRows, sosChatRows]: any = await Promise.all([
      pool
        .query(`SELECT run_id, status, started_at FROM sync_runs ORDER BY started_at DESC LIMIT 1`)
        .catch(() => [[]]),
      pool
        .query(`
          SELECT COUNT(*) AS active_sos
          FROM historial_chats_mantra
          WHERE UPPER(COALESCE(semaforo_sla, '')) LIKE '%ROJO%'
             OR UPPER(COALESCE(estado_chat, '')) = 'ABIERTO'
        `)
        .catch(() => [[{ active_sos: 0 }]]),
    ]);

    const lastSync = syncRows?.[0]?.[0] || null;
    const payload = {
      ok: true,
      sync: lastSync
        ? {
            id: lastSync.run_id,
            status: String(lastSync.status || 'OK').toUpperCase(),
            startedAt: lastSync.started_at,
          }
        : null,
      activeChats: Number(sosChatRows?.[0]?.[0]?.active_sos || 0),
    };

    await cacheSet('home_system_status', payload, 60);
    return res.json(payload);
  } catch (err: any) {
    return res.json({ ok: true, sync: null, activeChats: 0, error: err.message });
  }
});

// 1. Endpoint de catálogos para filtros desplegables
app.get('/api/filters', async (_req, res) => {
  try {
    const cachedFilters: any = await cacheGet('catalog_filters');
    if (
      cachedFilters &&
      cachedFilters.ok &&
      Array.isArray(cachedFilters.servicios) &&
      cachedFilters.servicios.length > 0
    ) {
      return res.json(cachedFilters);
    }

    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

    const [zonasRes, partnersRes]: any = await Promise.all([
      pool
        .query(`
          SELECT DISTINCT sector_operativo AS zona
          FROM mat_funnel_casos_360
          WHERE sector_operativo IS NOT NULL AND TRIM(sector_operativo) != ''
          ORDER BY sector_operativo
        `)
        .catch(() => [[]]),
      pool
        .query(`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(partner), ''), 'SIN PARTNER') AS partner
          FROM mat_funnel_casos_360
          WHERE partner IS NOT NULL AND TRIM(partner) != ''
          ORDER BY partner
        `)
        .catch(() => [[]]),
    ]);

    const todayStr = new Date().toLocaleDateString('en-CA');
    const zList = (zonasRes?.[0] || []).map((z: any) => z.zona).filter(Boolean);
    const pList = Array.from(
      new Set((partnersRes?.[0] || []).map((p: any) => cleanPartnerName(p.partner)).filter(Boolean))
    ).sort();

    const payload = {
      ok: true,
      servicios: tiposUnicosList,
      zonas: zList,
      sectores: zList,
      partners: pList,
      dateRange: { minDate: todayStr, maxDate: todayStr },
    };
    await cacheSet('catalog_filters', payload, 3600);
    return res.json(payload);

  } catch (error: any) {
    return res.json({
      ok: true,
      servicios: tiposUnicosList,
      zonas: [],
      sectores: [],
      partners: [],
    });
  }
});

// 2. Endpoint principal del Dashboard (Ejecutivo + Operativo)
app.get('/api/dashboard', async (req, res) => {
  const startTime = Date.now();
  const todayDefault = new Date().toLocaleDateString('en-CA');
  const {
    startDate = todayDefault,
    endDate = todayDefault,
    service: rawService = 'Todos los servicios',
    zone = 'Todas las zonas',
    refresh = 'false',
  } = req.query as Record<string, string>;
  const service = enforceRoleServiceScope(req, rawService);

  const cacheKey = `dash_${startDate}_${endDate}_${service}_${zone}`;

  try {
    const responsePayload = await withSingleFlightSwr(cacheKey, 120, refresh === 'true', async () => {
      if (tiposUnicosList.length === 0) await loadTipoServicioCache();
      if (refresh === 'true') {
        await syncMatFunnelIncremental(startDate, endDate);
      }

      // Garantizar siempre mínimo 7 días hacia atrás desde endDate para la gráfica evolutiva
      const [ey, em, ed] = endDate.split('-').map(Number);
      const endTarget = new Date(ey, em - 1, ed);
      const min7D = new Date(endTarget);
      min7D.setDate(min7D.getDate() - 6);
      const min7StartStr = `${min7D.getFullYear()}-${String(min7D.getMonth() + 1).padStart(2, '0')}-${String(min7D.getDate()).padStart(2, '0')}`;
      const chartStartDate = startDate < min7StartStr ? startDate : min7StartStr;

      const extraFilters: string[] = [];
      const extraParams: any[] = [];
      const reprogFilters: string[] = [];
      const reprogParams: any[] = [];
      const encFilters: string[] = [];
      const encParams: any[] = [];

      const dashSrvFilter = buildStrictOrderTypeSql(service, 'v.tipo_operacion');
      if (dashSrvFilter.params.length > 0) {
        extraFilters.push(`AND ${dashSrvFilter.sql}`);
        extraParams.push(...dashSrvFilter.params);

        const { canonicalList, productosDelTipo } = resolveProductosFromServiceFilter(service);
        const prods = productosDelTipo.length > 0 ? productosDelTipo : dashSrvFilter.params;
        const ph = prods.map(() => '?').join(',');

        let geoClauseR = '';
        const onlyLima = canonicalList.length > 0 && canonicalList.every((c) => c.includes('LIMA'));
        const onlyProv = canonicalList.length > 0 && canonicalList.every((c) => c.includes('PROV'));
        if (onlyLima) {
          geoClauseR = " AND (r.sector_operativo LIKE 'LIMA%' OR r.sector_operativo IS NULL)";
        } else if (onlyProv) {
          geoClauseR = " AND (r.sector_operativo NOT LIKE 'LIMA%' AND r.sector_operativo IS NOT NULL)";
        }

        reprogFilters.push(`AND UPPER(TRIM(r.producto_servicio)) IN (${ph})${geoClauseR}`);
        reprogParams.push(...prods.map((x) => x.toUpperCase()));

        encFilters.push(`AND ${dashSrvFilter.sql}`);
        encParams.push(...dashSrvFilter.params);
      }

      if (zone && zone !== 'Todas las zonas') {
        extraFilters.push(`AND v.sector_operativo = ?`);
        extraParams.push(zone);

        reprogFilters.push(`AND r.sector_operativo = ?`);
        reprogParams.push(zone);

        encFilters.push(`AND v.sector_operativo = ?`);
        encParams.push(zone);
      }

      const filterSql = extraFilters.join(' ');

      const [
        aggregatedResult,
        orderResult,
        reprogResult,
        encResult,
      ]: any = await Promise.all([
        pool.query(
          `
          SELECT 
            DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
            DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m') AS fecha,
            DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_full,
            v.estado_ot,
            v.sector_operativo,
            v.tipo_operacion,
            v.total,
            v.enviados,
            v.leidos,
            v.sent,
            v.delivered,
            v.failed,
            v.no_enviado,
            v.tracking,
            v.sos_soporte,
            v.autogestionados,
            v.reprogramaciones,
            v.encuestas,
            v.leidos_sin_ingreso,
            v.av_total,
            v.av_enviados,
            v.av_leidos,
            v.av_tracking,
            v.pref_total,
            v.pref_enviados,
            v.pref_leidos,
            v.pref_tracking
          FROM mat_daily_kpis_rollup v
          WHERE v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?
          ${filterSql}
          `,
          [chartStartDate, endDate, ...extraParams]
        ),
        // Las vistas de Órdenes y Seguimiento usan sus propios endpoints paginados (/api/orders/search y /api/tracking/search)
        Promise.resolve([[]]),
        pool
          .query(
            `
            SELECT COUNT(*) AS total_reprog
            FROM vw_reprogramaciones_detalle r
            WHERE r.fecha_registro >= ? AND r.fecha_registro < DATE_ADD(?, INTERVAL 1 DAY)
            ${reprogFilters.join(' ')}
            `,
            [startDate, endDate, ...reprogParams]
          )
          .catch((err: any) => {
            console.warn('⚠️ Error consultando vw_reprogramaciones_detalle:', err.message);
            return [[{ total_reprog: 0 }]];
          }),
        pool
          .query(
            `
            SELECT 
              COALESCE(NULLIF(TRIM(v.ops_partner), ''), NULLIF(TRIM(v.partner), ''), 'SIN PARTNER') AS partner_raw,
              COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), 'OTROS') AS tipo_operacion,
              COALESCE(NULLIF(TRIM(v.sector_operativo), ''), 'SIN SECTOR') AS sector_operativo,
              COUNT(DISTINCT ea.id) AS surveys,
              AVG(COALESCE(ea.satisfaccion_atencion, ea.satisfaccion_experiencia) + 0) AS avg_score
            FROM encuesta_app ea
            LEFT JOIN mat_funnel_casos_360 v ON v.orden_id = ea.orden_id_num
            WHERE ea.fecha_registro >= CONCAT(?, ' 00:00:00')
              AND ea.fecha_registro <= CONCAT(?, ' 23:59:59')
            ${encFilters.join(' ')}
            GROUP BY partner_raw, tipo_operacion, sector_operativo
            ORDER BY avg_score DESC, surveys DESC
            `,
            [startDate, endDate, ...encParams]
          )
          .catch((err: any) => {
            console.warn('⚠️ Error consultando encuesta_app:', err.message);
            return [[]];
          }),
      ]);

    const totalReprogReal = Number(reprogResult?.[0]?.[0]?.total_reprog || 0);

    let encRowsRaw: any[] = encResult?.[0] || [];
    const encuestasByService = encRowsRaw.map((r: any) => ({
      partner: cleanPartnerName(r.partner_raw),
      tipo_operacion: classifyOrderServiceType(r.tipo_operacion, r.tipo_operacion),
      sector_operativo: String(r.sector_operativo || 'SIN SECTOR').trim(),
      surveys: Number(r.surveys || 0),
      avg_score: Number(r.avg_score || 0),
    }));

    const partnerAggMap = new Map<string, { partner: string; surveys: number; sumPoints: number }>();
    for (const r of encuestasByService) {
      const pName = r.partner;
      const sv = r.surveys;
      const avg = r.avg_score;
      const cur = partnerAggMap.get(pName) || { partner: pName, surveys: 0, sumPoints: 0 };
      cur.surveys += sv;
      cur.sumPoints += avg * sv;
      partnerAggMap.set(pName, cur);
    }

    const encRows = Array.from(partnerAggMap.values())
      .map((p) => ({
        partner: p.partner,
        surveys: p.surveys,
        avg_score: p.surveys > 0 ? p.sumPoints / p.surveys : 0,
      }))
      .sort((a, b) => b.avg_score - a.avg_score || b.surveys - a.surveys);

    const totalEncuestasReal = encRows.reduce(
      (acc: number, r: any) => acc + Number(r.surveys || 0),
      0
    );

    const sumPonderada = encRows.reduce(
      (acc: number, r: any) => acc + Number(r.avg_score || 0) * Number(r.surveys || 0),
      0
    );
    const csatAvgGlobal = totalEncuestasReal > 0 ? sumPonderada / totalEncuestasReal : 0;

    const partnersRanking = (encRows || []).slice(0, 6).map((r: any, idx: number) => {
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

    const rawAggregated: any[] = aggregatedResult[0] || [];

    const dailyMap = new Map<string, any>();
    const estadoOtMap = new Map<string, any>();
    const sectorMap = new Map<string, any>();
    const tipoOpMap = new Map<string, any>();

    for (const r of rawAggregated) {
      const tot = Number(r.total || 0);
      const env = Number(r.enviados || 0);
      const lei = Number(r.leidos || 0);
      const trk = Number(r.tracking || 0);

      // 1. Agrupación Diaria (para gráfica evolutiva)
      const day = dailyMap.get(r.raw_date) || {
        raw_date: r.raw_date,
        fecha: r.fecha,
        fecha_full: r.fecha_full,
        total: 0,
        enviados: 0,
        leidos: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        no_enviado: 0,
        tracking: 0,
        sos_soporte: 0,
        autogestionados: 0,
        leidos_sin_ingreso: 0,
        av_total: 0,
        av_enviados: 0,
        av_leidos: 0,
        av_tracking: 0,
        pref_total: 0,
        pref_enviados: 0,
        pref_leidos: 0,
        pref_tracking: 0,
      };
      day.total += tot;
      day.enviados += env;
      day.leidos += lei;
      day.sent += Number(r.sent || 0);
      day.delivered += Number(r.delivered || 0);
      day.failed += Number(r.failed || 0);
      day.no_enviado += Number(r.no_enviado || 0);
      day.tracking += trk;
      day.sos_soporte += Number(r.sos_soporte || 0);
      day.autogestionados += Number(r.autogestionados || 0);
      day.leidos_sin_ingreso += Number(r.leidos_sin_ingreso || 0);
      day.av_total += Number(r.av_total || 0);
      day.av_enviados += Number(r.av_enviados || 0);
      day.av_leidos += Number(r.av_leidos || 0);
      day.av_tracking += Number(r.av_tracking || 0);
      day.pref_total += Number(r.pref_total || 0);
      day.pref_enviados += Number(r.pref_enviados || 0);
      day.pref_leidos += Number(r.pref_leidos || 0);
      day.pref_tracking += Number(r.pref_tracking || 0);
      dailyMap.set(r.raw_date, day);

      // Para Estado OT, Sector y Tipo Op solo sumamos las filas que caen en el rango seleccionado (startDate..endDate)
      if (r.raw_date >= startDate && r.raw_date <= endDate) {
        // 2. Por Estado OT
        const st = estadoOtMap.get(r.estado_ot) || { estado_ot: r.estado_ot, total: 0, enviados: 0, leidos: 0, tracking: 0 };
        st.total += tot;
        st.enviados += env;
        st.leidos += lei;
        st.tracking += trk;
        estadoOtMap.set(r.estado_ot, st);

        // 3. Por Sector Operativo
        const sec = sectorMap.get(r.sector_operativo) || { sector_operativo: r.sector_operativo, total: 0, enviados: 0, no_enviados: 0, tracking: 0, leidos: 0 };
        sec.total += tot;
        sec.enviados += env;
        sec.no_enviados += Number(r.no_enviado || 0);
        sec.tracking += trk;
        sec.leidos += lei;
        sectorMap.set(r.sector_operativo, sec);

        // 4. Por Tipo de Operación
        const top = tipoOpMap.get(r.tipo_operacion) || { tipo: r.tipo_operacion, total: 0, enviados: 0 };
        top.total += tot;
        top.enviados += env;
        tipoOpMap.set(r.tipo_operacion, top);
      }
    }

    const dailyRows = Array.from(dailyMap.values()).sort((a, b) => a.raw_date.localeCompare(b.raw_date));
    const kpiRowsInRange = dailyRows.filter(
      (r) => r.raw_date >= startDate && r.raw_date <= endDate
    );
    const byEstadoOt = Array.from(estadoOtMap.values()).sort((a, b) => b.total - a.total);
    const bySector = Array.from(sectorMap.values()).sort((a, b) => b.total - a.total);
    const byTipoOperacion = Array.from(tipoOpMap.values()).sort((a, b) => b.total - a.total);

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
        sos_soporte: acc.sos_soporte + Number(row.sos_soporte || 0),
        autogestionados: acc.autogestionados + Number(row.autogestionados || 0),
        reprogramaciones: acc.reprogramaciones + Number(row.reprogramaciones || 0),
        encuestas_respondidas: acc.encuestas_respondidas + Number(row.encuestas || 0),
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
        sos_soporte: 0,
        autogestionados: 0,
        reprogramaciones: 0,
        encuestas_respondidas: 0,
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

    kpis.reprogramaciones = totalReprogReal;
    kpis.encuestas_respondidas = totalEncuestasReal;
    kpis.csat_avg = Number(csatAvgGlobal.toFixed(2));

    const ordersWithTipo = (orderResult[0] || []).map((o: any) => ({
      ...o,
      servicio_tipo: classifyOrderServiceType(o.producto, o.tipo_operacion),
    }));

      return {
        ok: true,
        rawAggregated,
        encuestasByService,
        kpis,
        evolution: dailyRows,
        dailyInRange: kpiRowsInRange,
        byEstadoOt,
        bySector,
        byTipoOperacion,
        orders: ordersWithTipo,
        partners: partnersRanking,
      };
    });

    console.log(`✅ /api/dashboard completado en ${Date.now() - startTime}ms`);
    return res.json(responsePayload);
  } catch (error: any) {
    console.error('❌ Error SQL en /api/dashboard:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 3. Endpoint de Búsqueda Paginada de Órdenes (/api/orders/search) requerido por OrdersView.tsx
app.get('/api/orders/search', async (req, res) => {
  try {
    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

    const todayIso = new Date().toLocaleDateString('en-CA');
    const rawStart = String(req.query.startDate || '').trim();
    const rawEnd = String(req.query.endDate || '').trim();

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : todayIso;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : todayIso;

    const service = enforceRoleServiceScope(req, String(req.query.service || 'Todos los servicios').trim());
    const q = String(req.query.q || '').trim();
    const ignoreDates = req.query.ignoreDates === 'true';

    const fOrden = String(req.query.orden || '').trim();
    const fCliente = String(req.query.cliente || '').trim();
    const fOperacion = String(req.query.operacion || 'Todos').trim();
    const fSector = String(req.query.sector || 'Todos').trim();
    const fPartner = String(req.query.partner || 'Todos').trim();
    const fEstadoOt = String(req.query.estadoOt || 'Todos').trim();
    const fWsp = String(req.query.wsp || 'Todos').trim();
    const fTracking = String(req.query.tracking || 'Todos').trim();

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (!ignoreDates) {
      whereClauses.push('v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?');
      params.push(startDate, endDate);
    }

    const ordSrvFilter = buildStrictOrderTypeSql(service, 'v.tipo_operacion');
    if (ordSrvFilter.params.length > 0) {
      whereClauses.push(ordSrvFilter.sql);
      params.push(...ordSrvFilter.params);
    }

    if (fOrden) {
      const likeOrd = `%${fOrden}%`;
      whereClauses.push(`(CAST(v.orden_id AS CHAR) LIKE ? OR v.ticket LIKE ?)`);
      params.push(likeOrd, likeOrd);
    }

    if (fCliente) {
      const likeCli = `%${fCliente}%`;
      whereClauses.push(
        `(v.cliente LIKE ? OR v.telefono LIKE ? OR v.ops_num_doc LIKE ? OR v.ops_codi_segui_clien LIKE ? OR v.ops_codi_clien LIKE ?)`
      );
      params.push(likeCli, likeCli, likeCli, likeCli, likeCli);
    }

    if (fOperacion && fOperacion !== 'Todos') {
      const opFilter = buildStrictOrderTypeSql(fOperacion, 'v.tipo_operacion');
      if (opFilter.params.length > 0) {
        whereClauses.push(opFilter.sql);
        params.push(...opFilter.params);
      }
    }

    if (fSector && fSector !== 'Todos') {
      const secItems = fSector.split(',').map((s) => s.trim()).filter(Boolean);
      if (secItems.length > 0) {
        const ph = secItems.map(() => '?').join(',');
        whereClauses.push(`COALESCE(NULLIF(TRIM(v.sector_operativo), ''), 'SIN SECTOR') IN (${ph})`);
        params.push(...secItems);
      }
    }

    if (fPartner && fPartner !== 'Todos') {
      const partItems = fPartner.split(',').map((s) => s.trim()).filter(Boolean);
      if (partItems.length > 0) {
        const ph = partItems.map(() => '?').join(',');
        whereClauses.push(`COALESCE(NULLIF(TRIM(v.partner), ''), NULLIF(TRIM(v.ops_partner), ''), 'SIN PARTNER') IN (${ph})`);
        params.push(...partItems);
      }
    }

    if (fEstadoOt && fEstadoOt !== 'Todos') {
      const estItems = fEstadoOt.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (estItems.length > 0) {
        const ph = estItems.map(() => '?').join(',');
        whereClauses.push(`UPPER(TRIM(COALESCE(v.estado_ot, ''))) IN (${ph})`);
        params.push(...estItems);
      }
    }

    if (fWsp && fWsp !== 'Todos') {
      const wspItems = fWsp.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const rawStates: string[] = [];
      let includeNoEnviado = false;

      for (const item of wspItems) {
        if (item === 'LEÍDO' || item === 'LEIDO' || item === 'READ') rawStates.push('read');
        else if (item === 'ENTREGADO' || item === 'DELIVERED') rawStates.push('delivered');
        else if (item === 'ENVIADO' || item === 'SENT') rawStates.push('sent');
        else if (item === 'FALLIDO' || item === 'FAILED') rawStates.push('failed');
        else if (item === 'NO ENVIADO') includeNoEnviado = true;
      }

      const wspSubClauses: string[] = [];
      if (rawStates.length > 0) {
        const ph = rawStates.map(() => '?').join(',');
        wspSubClauses.push(`LOWER(TRIM(COALESCE(v.estado_wsp, ''))) IN (${ph})`);
        params.push(...rawStates);
      }
      if (includeNoEnviado) {
        wspSubClauses.push(
          `(v.se_envio_wsp = 'NO' OR v.estado_wsp = 'NO ENVIADO' OR v.estado_wsp IS NULL OR TRIM(v.estado_wsp) = '')`
        );
      }
      if (wspSubClauses.length > 0) {
        whereClauses.push(`(${wspSubClauses.join(' OR ')})`);
      }
    }

    if (fTracking && fTracking !== 'Todos') {
      const trkItems = fTracking.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const mappedTrk = trkItems.map((t) => (t.includes('S') ? 'SI' : 'NO'));
      if (mappedTrk.length > 0) {
        const ph = mappedTrk.map(() => '?').join(',');
        whereClauses.push(`COALESCE(v.ingreso_tracking, 'NO') IN (${ph})`);
        params.push(...mappedTrk);
      }
    }

    if (q) {
      const likeQ = `%${q}%`;
      whereClauses.push(`(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.cliente LIKE ? OR
        v.telefono LIKE ? OR
        v.ops_num_doc LIKE ? OR
        v.ops_codi_segui_clien LIKE ? OR
        v.ops_codi_clien LIKE ? OR
        v.ops_cuadrilla LIKE ? OR
        v.cuadrilla LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countCacheKey = `ord_cnt_${startDate}_${endDate}_${service}_${q}_${ignoreDates}_${fOrden}_${fCliente}_${fOperacion}_${fSector}_${fPartner}_${fEstadoOt}_${fWsp}_${fTracking}`;
    const cachedTotal = queryCache.get<number>(countCacheKey);

    const [total, idRowsRes]: [number, any] = await Promise.all([
      typeof cachedTotal === 'number'
        ? Promise.resolve(cachedTotal)
        : pool
            .query(`SELECT COUNT(*) AS total FROM mat_funnel_casos_360 v ${whereSql}`, params)
            .then(([r]: any) => {
              const c = Number(r?.[0]?.total || 0);
              queryCache.set(countCacheKey, c, 60);
              return c;
            }),
      pool.query(
        `
        SELECT v.orden_id
        FROM mat_funnel_casos_360 v
        ${whereSql}
        ORDER BY v.orden_id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    const pageIds: number[] = (idRowsRes?.[0] || []).map((x: any) => x.orden_id);
    let rowsResult: any = [[]];

    if (pageIds.length > 0) {
      const idPh = pageIds.map(() => '?').join(',');
      rowsResult = await pool.query(
        `
        SELECT 
          v.*,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_solicitud_fmt,
          w.\`Número Documento\` AS numero_documento,
          w.\`Tipo Documento\` AS tipo_documento,
          w.CodiSeguiClien AS codi_segui_clien,
          w.CodiClien AS codi_clien,
          w.CodiSegui AS codi_segui_ot,
          w.Cuadrilla AS cuadrilla_completa,
          w.Proveedeor AS proveedor_ot,
          w.Direccion AS direccion_cliente,
          w.IdenServi AS plan_contratado,
          w.Email AS email_cliente,
          w.\`Diagnóstico Técnico\` AS diagnostico_tecnico,
          w.\`Observaciones Tareas\` AS observaciones_tareas,
          w.\`Historial Estados\` AS historial_estados,
          w.\`Datos Técnicos\` AS datos_tecnicos,
          w.Georeferencia AS georeferencia_cliente,
          w.Georeferencia_tecnico AS georeferencia_tecnico,
          w.\`Motivo Finalización\` AS motivo_finalizacion,
          w.\`Usuario Asignó\` AS usuario_asigno
        FROM mat_funnel_casos_360 v
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        WHERE v.orden_id IN (${idPh})
        ORDER BY FIELD(v.orden_id, ${idPh})
        `,
        [...pageIds, ...pageIds]
      );
    }

    const rows = (rowsResult?.[0] || []).map((o: any) => ({
      ...o,
      servicio_tipo: classifyOrderServiceType(o.producto, o.tipo_operacion),
    }));

    return res.json({
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      orders: rows,
    });
  } catch (error: any) {
    console.error('❌ Error en /api/orders/search:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 4. Endpoint de Búsqueda Paginada (50 en 50) para Seguimiento (Optimizado con Caché y Joins ligeros)
app.get('/api/tracking/search', async (req, res) => {
  try {
    const todayIso = new Date().toLocaleDateString('en-CA');
    const rawStart = String(req.query.startDate || '').trim();
    const rawEnd = String(req.query.endDate || '').trim();

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : todayIso;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : todayIso;

    const rawService = String(req.query.service || '').trim();
    const rawZone = String(req.query.zone || '').trim();
    const service = enforceRoleServiceScope(
      req,
      !rawService || rawService === 'undefined' ? 'Todos los servicios' : rawService
    );
    const zone = !rawZone || rawZone === 'undefined' ? 'Todas las zonas' : rawZone;

    const q = String(req.query.q || '').trim();
    const ignoreDates = req.query.ignoreDates === 'true';
    const fEstadoChat = String(req.query.estadoChat || 'Todos');
    const fSla = String(req.query.sla || 'Todos');
    const fTurno = String(req.query.turno || 'Todos');
    const fSoloConChat = req.query.soloConChat === 'true';
    const fSoloSos = req.query.soloSos === 'true';
    const fSoloLogChat = req.query.soloLogChat === 'true';
    const refresh = req.query.refresh === 'true';

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const cacheKey = `trk_${startDate}_${endDate}_${service}_${zone}_${q}_${ignoreDates}_${fEstadoChat}_${fSla}_${fTurno}_${fSoloConChat}_${fSoloSos}_${fSoloLogChat}_${page}_${pageSize}`;
    if (!refresh) {
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json(cached);
    } else {
      await syncMatFunnelIncremental(startDate, endDate);
    }

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (!ignoreDates) {
      whereClauses.push('v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?');
      params.push(startDate, endDate);
    }

    const trkSrvFilter = buildStrictOrderTypeSql(service, 'v.tipo_operacion');
    if (trkSrvFilter.params.length > 0) {
      whereClauses.push(trkSrvFilter.sql);
      params.push(...trkSrvFilter.params);
    }

    if (zone !== 'Todas las zonas') {
      whereClauses.push('(v.sector_operativo = ? OR v.distrito = ?)');
      params.push(zone, zone);
    }

    if (fSoloLogChat) {
      whereClauses.push('lc.orden_id IS NOT NULL');
    } else if (fSoloSos) {
      whereClauses.push("(UPPER(TRIM(COALESCE(v.pulso_soporte, 'NO'))) IN ('SI', 'SÍ', '1', 'TRUE') OR lc.orden_id IS NOT NULL)");
    } else if (fSoloConChat) {
      whereClauses.push('(h.orden_id IS NOT NULL OR h.phone IS NOT NULL OR lc.orden_id IS NOT NULL)');
    }

    if (fEstadoChat !== 'Todos') {
      whereClauses.push("UPPER(COALESCE(h.estado_chat, '')) = ?");
      params.push(fEstadoChat.toUpperCase());
    }

    if (fSla !== 'Todos') {
      whereClauses.push("UPPER(COALESCE(h.semaforo_sla, '')) LIKE ?");
      params.push(`%${fSla.toUpperCase()}%`);
    }

    if (fTurno !== 'Todos') {
      const tUpper = fTurno.toUpperCase();
      if (tUpper === 'BOT') {
        whereClauses.push("(UPPER(COALESCE(h.quien_tiene_la_palabra, 'BOT')) LIKE '%BOT%' OR lc.orden_id IS NOT NULL)");
      } else {
        whereClauses.push("UPPER(COALESCE(h.quien_tiene_la_palabra, '')) LIKE ?");
        params.push(`%${tUpper}%`);
      }
    }

    if (q) {
      const likeQ = `%${q}%`;
      whereClauses.push(`(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.cliente LIKE ? OR
        v.telefono LIKE ? OR
        h.phone LIKE ? OR
        v.ops_num_doc LIKE ? OR
        v.ops_codi_segui_clien LIKE ? OR
        v.ops_cuadrilla LIKE ? OR
        v.cuadrilla LIKE ?
      )`);
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Subconsulta ligera solo de IDs (sin leer LONGTEXT mensajes_json en el escaneo inicial)
    const logsChatLightJoin = `
      LEFT JOIN (
        SELECT orden_id, MAX(id) AS max_id
        FROM logs_chat
        GROUP BY orden_id
      ) lc ON lc.orden_id = v.orden_id
    `;

    const needsLogsChatInCount = fSoloLogChat || fSoloSos || fSoloConChat || fTurno.toUpperCase() === 'BOT';
    const countLogsChatJoin = needsLogsChatInCount ? logsChatLightJoin : '';
    const countCacheKey = `trk_cnt_${startDate}_${endDate}_${service}_${zone}_${q}_${ignoreDates}_${fEstadoChat}_${fSla}_${fTurno}_${fSoloConChat}_${fSoloSos}_${fSoloLogChat}`;
    const cachedTotal = !refresh ? queryCache.get<number>(countCacheKey) : undefined;

    // Fase 1: Obtener COUNT (cacheado por filtro) y solo las 50 llaves ordenadas sin tocar vw_winordetraba
    const [total, pageIdsResult]: [number, any] = await Promise.all([
      typeof cachedTotal === 'number'
        ? Promise.resolve(cachedTotal)
        : pool
            .query(
              `
              SELECT COUNT(*) AS total
              FROM mat_funnel_casos_360 v
              LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
              ${countLogsChatJoin}
              ${whereSql}
              `,
              params
            )
            .then(([r]: any) => {
              const c = Number(r?.[0]?.total || 0);
              queryCache.set(countCacheKey, c, 60);
              return c;
            }),
      pool.query(
        `
        SELECT v.orden_id, lc.max_id AS log_chat_id
        FROM mat_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        ${logsChatLightJoin}
        ${whereSql}
        ORDER BY (lc.max_id IS NOT NULL) DESC, (h.orden_id IS NOT NULL) DESC, v.orden_id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    const pageItems: { orden_id: number; log_chat_id: number | null }[] = pageIdsResult?.[0] || [];
    let rowsResult: any = [[]];

    // Fase 2 (Late Row Lookup): Hidratar datos pesados y JSONs únicamente para las 50 órdenes visibles
    if (pageItems.length > 0) {
      const idList = pageItems.map((x) => x.orden_id);
      const idPlaceholders = idList.map(() => '?').join(',');
      rowsResult = await pool.query(
        `
        SELECT 
          v.*,
          DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y') AS fecha_solicitud_fmt,
          COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), NULLIF(TRIM(v.producto), ''), 'OTROS') AS servicio_tipo,
          w.\`Número Documento\` AS numero_documento,
          w.\`Tipo Documento\` AS tipo_documento,
          w.CodiSeguiClien AS codi_segui_clien,
          w.CodiClien AS codi_clien,
          w.CodiSegui AS codi_segui_ot,
          w.Cuadrilla AS cuadrilla_completa,
          w.Proveedeor AS proveedor_ot,
          w.Tipo AS segmento_cliente,
          w.Provincia AS provincia_cliente,
          w.\`Motivo Trabajo\` AS motivo_trabajo,
          w.Direccion AS direccion_cliente,
          w.IdenServi AS plan_contratado,
          h.phone AS mantra_phone,
          h.estado_chat,
          h.semaforo_sla,
          h.quien_tiene_la_palabra,
          h.ultimos_mensajes_json AS chat_json_mantra,
          lc.id AS log_chat_id,
          lc.token AS log_chat_token,
          lc.grupo_servicio AS log_grupo_servicio,
          lc.motivo AS log_motivo_sos,
          lc.estado_chat AS log_estado_chat,
          lc.mensajes_json AS log_mensajes_json,
          lc.updated_at AS log_updated_at
        FROM mat_funnel_casos_360 v
        LEFT JOIN historial_chats_mantra h ON h.orden_id = v.orden_id
        LEFT JOIN vw_winordetraba w ON w.OrdenId = v.orden_id
        LEFT JOIN (
          SELECT l1.id, l1.orden_id, l1.token, l1.grupo_servicio, l1.motivo, l1.estado_chat, l1.mensajes_json, l1.updated_at
          FROM logs_chat l1
          INNER JOIN (
            SELECT orden_id, MAX(id) AS max_id
            FROM logs_chat
            WHERE orden_id IN (${idPlaceholders})
            GROUP BY orden_id
          ) l2 ON l1.id = l2.max_id
        ) lc ON lc.orden_id = v.orden_id
        WHERE v.orden_id IN (${idPlaceholders})
        ORDER BY FIELD(v.orden_id, ${idPlaceholders})
        `,
        [...idList, ...idList, ...idList]
      );
    }

    const rows = (rowsResult?.[0] || []).map((r: any) => ({
      ...r,
      servicio_tipo:
        servicioToTipoMap.get(String(r.producto || '').trim().toUpperCase()) ||
        homologarTipoServicio(String(r.servicio_tipo || '')) ||
        r.servicio_tipo,
      ultimos_mensajes_json: r.chat_json_mantra || r.ultimos_mensajes_json || null,
    }));

    const payload = {
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      orders: rows,
    };

    await cacheSet(cacheKey, payload, 45);
    return res.json(payload);
  } catch (error: any) {
    console.error('❌ Error en /api/tracking/search:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 5. Endpoint ultrarrápido directo desde tabla local historial_chats_mantra
app.get('/api/4dm1n_/mantra-chat', async (req, res) => {
  try {
    const rawPhone = String(req.query.phone || '').replace(/\D/g, '');
    const phone9 = rawPhone.slice(-9);
    const ordenId = req.query.ordenId ? Number(req.query.ordenId) : null;
    const limit = Number(req.query.limit) || 1000;

    if (!phone9 && !ordenId) {
      return res.status(400).json({ ok: false, error: 'Parámetro phone u ordenId requerido' });
    }

    // Búsqueda indexada prioritaria por orden_id (instantánea) y fallback por teléfono
    let chatRows: any[] = [];
    if (ordenId) {
      const [byOrder]: any = await pool.query(
        `SELECT * FROM historial_chats_mantra WHERE orden_id = ? LIMIT 1`,
        [ordenId]
      );
      chatRows = byOrder || [];
    }

    if (chatRows.length === 0 && phone9) {
      const [byPhone]: any = await pool.query(
        `SELECT * FROM historial_chats_mantra WHERE phone LIKE ? ORDER BY orden_id DESC LIMIT 1`,
        [`%${phone9}`]
      );
      chatRows = byPhone || [];
    }

    const chatRecord = chatRows?.[0] || null;
    let messages: any[] = [];

    if (chatRecord?.ultimos_mensajes_json) {
      try {
        const parsed =
          typeof chatRecord.ultimos_mensajes_json === 'string'
            ? JSON.parse(chatRecord.ultimos_mensajes_json)
            : chatRecord.ultimos_mensajes_json;
        if (Array.isArray(parsed)) {
          messages = parsed.slice(-limit);
        } else if (parsed && Array.isArray(parsed.messages)) {
          messages = parsed.messages.slice(-limit);
        }
      } catch (parseErr: any) {
        console.warn('⚠️ Error al parsear JSON de chat en fallback:', parseErr.message);
      }
    }

    return res.json({
      ok: true,
      source: 'db_fallback',
      chatMeta: chatRecord
        ? {
          estado_chat: chatRecord.estado_chat,
          semaforo_sla: chatRecord.semaforo_sla,
          quien_tiene_la_palabra: chatRecord.quien_tiene_la_palabra,
          phone: chatRecord.phone,
          orden_id: chatRecord.orden_id,
          ticket: chatRecord.ticket,
        }
        : null,
      messages,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 6. Endpoint exclusivo de Operaciones usando las columnas exactas de vw_winordetraba
app.get('/api/operations', async (req, res) => {
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
  const cacheKey = `ops_raw_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}`;

  try {
    const payload = await withSingleFlightSwr(cacheKey, 120, refresh === 'true', async () => {
      if (tiposUnicosList.length === 0) await loadTipoServicioCache();
      if (refresh === 'true') {
        await syncMatFunnelIncremental(startDate, endDate);
      }

    const colEstado = `v.ops_estado`;
    const colPartner = `v.ops_partner`;
    const colCuadrilla = `v.ops_cuadrilla`;
    const colZona = `v.ops_zona`;

    const [ey, em, ed] = endDate.split('-').map(Number);
    const endTarget = new Date(ey, em - 1, ed);
    const min7D = new Date(endTarget);
    min7D.setDate(min7D.getDate() - 6);
    const min7StartStr = `${min7D.getFullYear()}-${String(min7D.getMonth() + 1).padStart(2, '0')}-${String(min7D.getDate()).padStart(2, '0')}`;
    const chartStartDate = startDate < min7StartStr ? startDate : min7StartStr;

    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    const chartWhereClauses: string[] = [];
    const chartParams: any[] = [];

    if (ignoreDates !== 'true') {
      whereClauses.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
      queryParams.push(startDate, endDate);

      chartWhereClauses.push(`v.fecha_solicitud_dia >= ? AND v.fecha_solicitud_dia <= ?`);
      chartParams.push(chartStartDate, endDate);
    }

    const opsSrvFilter = buildStrictOrderTypeSql(service, 'v.tipo_operacion');
    if (opsSrvFilter.params.length > 0) {
      whereClauses.push(opsSrvFilter.sql);
      queryParams.push(...opsSrvFilter.params);

      chartWhereClauses.push(opsSrvFilter.sql);
      chartParams.push(...opsSrvFilter.params);
    }

    if (searchQ) {
      const likeQ = `%${searchQ}%`;
      const qClause = `(
        CAST(v.orden_id AS CHAR) LIKE ? OR
        v.ticket LIKE ? OR
        v.ops_codi_segui_clien LIKE ? OR
        v.ops_codi_clien LIKE ? OR
        v.cliente LIKE ? OR
        v.ops_num_doc LIKE ? OR
        v.telefono LIKE ? OR
        v.ops_cuadrilla LIKE ? OR
        v.cuadrilla LIKE ? OR
        v.partner LIKE ?
      )`;
      const qArgs = [likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ];
      whereClauses.push(qClause);
      queryParams.push(...qArgs);

      chartWhereClauses.push(qClause);
      chartParams.push(...qArgs);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const chartWhereSql = chartWhereClauses.length > 0 ? `WHERE ${chartWhereClauses.join(' AND ')}` : '';

    // Clasificación de estados reales sobre columna pre-limpiada e indexada v.ops_estado
    const isFin = `(LOWER(${colEstado}) LIKE '%finaliz%' OR LOWER(${colEstado}) LIKE '%atendid%' OR LOWER(${colEstado}) LIKE '%complet%' OR LOWER(${colEstado}) LIKE '%cerrad%' OR LOWER(${colEstado}) LIKE '%ok%')`;
    const isCurso = `(LOWER(${colEstado}) LIKE '%iniciad%' OR LOWER(${colEstado}) LIKE '%camino%' OR LOWER(${colEstado}) LIKE '%ruta%' OR LOWER(${colEstado}) LIKE '%ejecuc%' OR LOWER(${colEstado}) LIKE '%proceso%')`;
    const isCancel = `(LOWER(${colEstado}) LIKE '%cancel%' OR LOWER(${colEstado}) LIKE '%anul%' OR LOWER(${colEstado}) LIKE '%rechaz%' OR LOWER(${colEstado}) LIKE '%quiebre%' OR LOWER(${colEstado}) LIKE '%suspens%')`;
    const isAgend = `(NOT ${isFin} AND NOT ${isCurso} AND NOT ${isCancel})`;

    const indexHint = !searchQ ? 'USE INDEX (idx_mat_ops_full_cov)' : '';
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const startTarget = new Date(sy, sm - 1, sd);
    const rangeDays = Math.max(1, Math.round((endTarget.getTime() - startTarget.getTime()) / 86400000) + 1);
    const useDirectIndexStream = ignoreDates !== 'true' && rangeDays <= 7 && !searchQ;

    const [rangeRes, dailyRes, dailyBySrvRes]: any = await Promise.all([
      // 1. Cubo dimensional consolidado (streaming directo sobre covering index para <= 7 días sin tabla temporal SQL)
      pool.query(
        useDirectIndexStream
          ? `
        SELECT
          v.tipo_operacion AS tipo_operacion,
          v.ops_estado AS estado,
          v.ops_partner AS partner,
          v.ops_cuadrilla AS cuadrilla,
          v.ops_zona AS zona,
          v.ops_motivo_trabajo AS motivo_trabajo,
          v.ops_segmento AS segmento,
          v.ops_motivo_fin AS motivo_fin,
          1 AS total
        FROM mat_funnel_casos_360 v ${indexHint}
        ${whereSql}
        `
          : `
        SELECT
          v.tipo_operacion AS tipo_operacion,
          v.ops_estado AS estado,
          v.ops_partner AS partner,
          v.ops_cuadrilla AS cuadrilla,
          v.ops_zona AS zona,
          v.ops_motivo_trabajo AS motivo_trabajo,
          v.ops_segmento AS segmento,
          v.ops_motivo_fin AS motivo_fin,
          COUNT(*) AS total
        FROM mat_funnel_casos_360 v ${indexHint}
        ${whereSql}
        GROUP BY
          v.tipo_operacion,
          v.ops_estado,
          v.ops_partner,
          v.ops_cuadrilla,
          v.ops_zona,
          v.ops_motivo_trabajo,
          v.ops_segmento,
          v.ops_motivo_fin
        `,
        queryParams
      ),

      // 2. Avance Diario global cubierto por índice
      pool.query(
        `
        SELECT
          DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
          MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m')) AS fecha,
          MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y')) AS fecha_full,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCurso}), 0) AS en_curso,
          COALESCE(SUM(${isAgend}), 0) AS agendadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
        FROM mat_funnel_casos_360 v ${indexHint}
        ${chartWhereSql}
        GROUP BY v.fecha_solicitud_dia
        HAVING raw_date IS NOT NULL
        ORDER BY raw_date ASC
        `,
        chartParams
      ),

      // 3. Avance Diario por Servicio (100% ordenado en las 2 primeras columnas de idx_mat_ops_full_cov)
      pool.query(
        `
        SELECT
          v.tipo_operacion AS tipo_operacion,
          DATE_FORMAT(v.fecha_solicitud_dia, '%Y-%m-%d') AS raw_date,
          MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m')) AS fecha,
          MAX(DATE_FORMAT(v.fecha_solicitud_dia, '%d/%m/%Y')) AS fecha_full,
          COUNT(*) AS total,
          COALESCE(SUM(${isFin}), 0) AS finalizadas,
          COALESCE(SUM(${isCurso}), 0) AS en_curso,
          COALESCE(SUM(${isAgend}), 0) AS agendadas,
          COALESCE(SUM(${isCancel}), 0) AS canceladas,
          COUNT(DISTINCT ${colCuadrilla}) AS cuadrillas
        FROM mat_funnel_casos_360 v ${indexHint}
        ${chartWhereSql}
        GROUP BY v.fecha_solicitud_dia, v.tipo_operacion
        HAVING raw_date IS NOT NULL
        ORDER BY raw_date ASC
        `,
        chartParams
      ),
    ]);

    const classifyEstado = (est: string) => {
      const lower = est.toLowerCase();
      const fin =
        lower.includes('finaliz') ||
        lower.includes('atendid') ||
        lower.includes('complet') ||
        lower.includes('cerrad') ||
        lower.includes('ok');
      const cur =
        lower.includes('iniciad') ||
        lower.includes('camino') ||
        lower.includes('ruta') ||
        lower.includes('ejecuc') ||
        lower.includes('proceso');
      const can =
        lower.includes('cancel') ||
        lower.includes('anul') ||
        lower.includes('rechaz') ||
        lower.includes('quiebre') ||
        lower.includes('suspens');
      const age = !fin && !cur && !can;
      return { fin, cur, can, age };
    };

    const buildOpsSlice = (rows: any[], dailyRowsRaw: any[]) => {
      let totalOrdenes = 0;
      let finalizadas = 0;
      let enCurso = 0;
      let agendadas = 0;
      let canceladas = 0;
      const allCuadrillas = new Set<string>();
      const allPartners = new Set<string>();
      const allZonas = new Set<string>();

      const estadoMap = new Map<string, { estado: string; total: number; cuadrillasSet: Set<string> }>();
      const partnerMap = new Map<
        string,
        {
          partner: string;
          total: number;
          finalizadas: number;
          en_curso: number;
          agendadas: number;
          canceladas: number;
          cuadrillasSet: Set<string>;
        }
      >();
      const zonaMap = new Map<
        string,
        {
          zona: string;
          total: number;
          finalizadas: number;
          en_curso: number;
          agendadas: number;
          canceladas: number;
          cuadrillasSet: Set<string>;
        }
      >();
      const cuadrillaMap = new Map<
        string,
        {
          cuadrilla: string;
          partner: string;
          total: number;
          finalizadas: number;
          en_curso: number;
          canceladas: number;
        }
      >();
      const motivoTrabajoMap = new Map<
        string,
        {
          motivo_trabajo: string;
          segmento: string;
          total: number;
          finalizadas: number;
          canceladas: number;
          cuadrillasSet: Set<string>;
        }
      >();
      const motivoFinMap = new Map<
        string,
        {
          motivo_fin: string;
          total: number;
          finalizadas: number;
          canceladas: number;
        }
      >();

      for (const r of rows) {
        const cnt = Number(r.total || 0);
        const est = String(r.estado || 'SIN ESTADO');
        const par = String(r.partner || 'SIN PARTNER');
        const cua = r.cuadrilla ? String(r.cuadrilla) : null;
        const zon = String(r.zona || 'SIN ZONA');
        const mtr = String(r.motivo_trabajo || 'NO ESPECIFICADO');
        const seg = String(r.segmento || 'RESIDENCIAL');
        const mfi = String(r.motivo_fin || 'SIN MOTIVO DE CIERRE');

        const { fin, cur, can, age } = classifyEstado(est);
        const cFin = fin ? cnt : 0;
        const cCur = cur ? cnt : 0;
        const cCan = can ? cnt : 0;
        const cAge = age ? cnt : 0;

        totalOrdenes += cnt;
        finalizadas += cFin;
        enCurso += cCur;
        agendadas += cAge;
        canceladas += cCan;

        if (cua && cua !== 'SIN ASIGNAR') allCuadrillas.add(cua);
        if (par) allPartners.add(par);
        if (zon) allZonas.add(zon);

        let stNode = estadoMap.get(est);
        if (!stNode) {
          stNode = { estado: est, total: 0, cuadrillasSet: new Set() };
          estadoMap.set(est, stNode);
        }
        stNode.total += cnt;
        if (cua && cua !== 'SIN ASIGNAR') stNode.cuadrillasSet.add(cua);

        let pNode = partnerMap.get(par);
        if (!pNode) {
          pNode = {
            partner: par,
            total: 0,
            finalizadas: 0,
            en_curso: 0,
            agendadas: 0,
            canceladas: 0,
            cuadrillasSet: new Set(),
          };
          partnerMap.set(par, pNode);
        }
        pNode.total += cnt;
        pNode.finalizadas += cFin;
        pNode.en_curso += cCur;
        pNode.agendadas += cAge;
        pNode.canceladas += cCan;
        if (cua && cua !== 'SIN ASIGNAR') pNode.cuadrillasSet.add(cua);

        let zNode = zonaMap.get(zon);
        if (!zNode) {
          zNode = {
            zona: zon,
            total: 0,
            finalizadas: 0,
            en_curso: 0,
            agendadas: 0,
            canceladas: 0,
            cuadrillasSet: new Set(),
          };
          zonaMap.set(zon, zNode);
        }
        zNode.total += cnt;
        zNode.finalizadas += cFin;
        zNode.en_curso += cCur;
        zNode.agendadas += cAge;
        zNode.canceladas += cCan;
        if (cua && cua !== 'SIN ASIGNAR') zNode.cuadrillasSet.add(cua);

        if (cua && cua !== 'SIN ASIGNAR') {
          let cNode = cuadrillaMap.get(cua);
          if (!cNode) {
            cNode = {
              cuadrilla: cua,
              partner: par,
              total: 0,
              finalizadas: 0,
              en_curso: 0,
              canceladas: 0,
            };
            cuadrillaMap.set(cua, cNode);
          }
          cNode.total += cnt;
          cNode.finalizadas += cFin;
          cNode.en_curso += cCur;
          cNode.canceladas += cCan;
          if (par > cNode.partner) cNode.partner = par;
        }

        let mtNode = motivoTrabajoMap.get(mtr);
        if (!mtNode) {
          mtNode = {
            motivo_trabajo: mtr,
            segmento: seg,
            total: 0,
            finalizadas: 0,
            canceladas: 0,
            cuadrillasSet: new Set(),
          };
          motivoTrabajoMap.set(mtr, mtNode);
        }
        mtNode.total += cnt;
        mtNode.finalizadas += cFin;
        mtNode.canceladas += cCan;
        if (seg > mtNode.segmento) mtNode.segmento = seg;
        if (cua && cua !== 'SIN ASIGNAR') mtNode.cuadrillasSet.add(cua);

        let mfNode = motivoFinMap.get(mfi);
        if (!mfNode) {
          mfNode = {
            motivo_fin: mfi,
            total: 0,
            finalizadas: 0,
            canceladas: 0,
          };
          motivoFinMap.set(mfi, mfNode);
        }
        mfNode.total += cnt;
        mfNode.finalizadas += cFin;
        mfNode.canceladas += cCan;
      }

      const cuadrillasActivas = allCuadrillas.size;

      return {
        kpis: {
          total_ordenes: totalOrdenes,
          finalizadas,
          en_curso: enCurso,
          agendadas,
          canceladas,
          cuadrillas_activas: cuadrillasActivas,
          partners_activos: allPartners.size,
          zonas_activas: allZonas.size,
          efectividad_pct: totalOrdenes > 0 ? Number(((finalizadas / totalOrdenes) * 100).toFixed(1)) : 0,
          cancelacion_pct: totalOrdenes > 0 ? Number(((canceladas / totalOrdenes) * 100).toFixed(1)) : 0,
          prod_ot_por_cuadrilla: cuadrillasActivas > 0 ? Number((totalOrdenes / cuadrillasActivas).toFixed(1)) : 0,
          prod_fin_por_cuadrilla: cuadrillasActivas > 0 ? Number((finalizadas / cuadrillasActivas).toFixed(1)) : 0,
        },
        byEstado: Array.from(estadoMap.values())
          .map((st) => ({
            estado: st.estado,
            total: st.total,
            cuadrillas: st.cuadrillasSet.size,
          }))
          .sort((a, b) => b.total - a.total),
        daily: dailyRowsRaw.map((d: any) => {
          const tot = Number(d.total || 0);
          const fin = Number(d.finalizadas || 0);
          const crw = Number(d.cuadrillas || 0);
          return {
            ...d,
            total: tot,
            finalizadas: fin,
            en_curso: Number(d.en_curso || 0),
            agendadas: Number(d.agendadas || 0),
            canceladas: Number(d.canceladas || 0),
            cuadrillas: crw,
            efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
            prod_total: crw > 0 ? Number((tot / crw).toFixed(1)) : 0,
            prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
          };
        }),
        byPartner: Array.from(partnerMap.values())
          .map((p) => {
            const tot = p.total;
            const fin = p.finalizadas;
            const crw = p.cuadrillasSet.size;
            return {
              partner: p.partner,
              total: tot,
              finalizadas: fin,
              en_curso: p.en_curso,
              agendadas: p.agendadas,
              canceladas: p.canceladas,
              cuadrillas: crw,
              efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
              prod_total: crw > 0 ? Number((tot / crw).toFixed(1)) : 0,
              prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
            };
          })
          .sort((a, b) => b.total - a.total),
        byZona: Array.from(zonaMap.values())
          .map((z) => {
            const tot = z.total;
            const fin = z.finalizadas;
            const crw = z.cuadrillasSet.size;
            return {
              zona: z.zona,
              total: tot,
              finalizadas: fin,
              en_curso: z.en_curso,
              agendadas: z.agendadas,
              canceladas: z.canceladas,
              cuadrillas: crw,
              efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
              prod_fin: crw > 0 ? Number((fin / crw).toFixed(1)) : 0,
            };
          })
          .sort((a, b) => b.total - a.total)
          .slice(0, 30),
        topCuadrillas: Array.from(cuadrillaMap.values())
          .map((c) => {
            const tot = c.total;
            const fin = c.finalizadas;
            return {
              ...c,
              efectividad_pct: tot > 0 ? Number(((fin / tot) * 100).toFixed(1)) : 0,
            };
          })
          .sort((a, b) => b.finalizadas - a.finalizadas || b.total - a.total)
          .slice(0, 15),
        byMotivoTrabajo: Array.from(motivoTrabajoMap.values())
          .map((m) => {
            const prodKey = String(m.motivo_trabajo || '').trim().toUpperCase();
            const tipoMapeado = servicioToTipoMap.get(prodKey) || prodKey || 'OTROS';
            return {
              motivo_trabajo: m.motivo_trabajo,
              segmento: m.segmento,
              total: m.total,
              finalizadas: m.finalizadas,
              canceladas: m.canceladas,
              cuadrillas: m.cuadrillasSet.size,
              tipo_operacion: tipoMapeado,
            };
          })
          .sort((a, b) => b.total - a.total)
          .slice(0, 15),
        byMotivoFin: Array.from(motivoFinMap.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 10),
      };
    };

    const allRangeRows: any[] = rangeRes?.[0] || [];
    const allDailyRows: any[] = dailyRes?.[0] || [];
    const allDailyBySrvRows: any[] = dailyBySrvRes?.[0] || [];

    const mainSlice = buildOpsSlice(allRangeRows, allDailyRows);
    const byService: Record<string, any> = {};

    for (const srvName of SERVICIOS_PERMITIDOS) {
      const srvRangeRows = allRangeRows.filter(
        (r) => String(r.tipo_operacion || '').trim().toUpperCase() === srvName
      );
      const srvDailyRows = allDailyBySrvRows.filter(
        (d) => String(d.tipo_operacion || '').trim().toUpperCase() === srvName
      );
      byService[srvName] = buildOpsSlice(srvRangeRows, srvDailyRows);
    }

    return {
      ok: true,
      source: 'mat_funnel_casos_360',
      ...mainSlice,
      byService,
    };
    });

    console.log(`✅ /api/operations (mat_funnel_casos_360) completado en ${Date.now() - startTime}ms`);
    return res.json(payload);
  } catch (error: any) {
    console.error('❌ Error en /api/operations:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 7. Endpoint exclusivo de Experiencia (CSAT) basado 100% en la nueva tabla `encuesta_app` + `mat_funnel_casos_360`
app.get('/api/csat', async (req, res) => {
  try {
    if (tiposUnicosList.length === 0) await loadTipoServicioCache();

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
    const cacheKey = `csat_v3_${startDate}_${endDate}_${service}_${searchQ}_${ignoreDates}`;

    const payload = await withSingleFlightSwr(cacheKey, 120, refresh === 'true', async () => {
      if (refresh === 'true') {
        await syncMatFunnelIncremental(startDate, endDate);
      }

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (ignoreDates !== 'true') {
        whereClauses.push(
          `ea.fecha_registro >= CONCAT(?, ' 00:00:00') AND ea.fecha_registro <= CONCAT(?, ' 23:59:59')`
        );
        params.push(startDate, endDate);
      }

      const csatSrvFilter = buildStrictOrderTypeSql(service, 'v.tipo_operacion');
      if (csatSrvFilter.params.length > 0) {
        whereClauses.push(csatSrvFilter.sql);
        params.push(...csatSrvFilter.params);
      }

      if (searchQ) {
        const likeQ = `%${searchQ}%`;
        whereClauses.push(`(
          CAST(ea.orden_id AS CHAR) LIKE ? OR
          ea.codisegui LIKE ? OR
          ea.comentarios LIKE ? OR
          v.cliente LIKE ? OR
          v.ops_cuadrilla LIKE ? OR
          v.cuadrilla LIKE ? OR
          v.ops_partner LIKE ? OR
          v.partner LIKE ?
        )`);
        params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const [rows]: any = await pool.query(
        `
        SELECT
          ea.id,
          ea.token,
          COALESCE(NULLIF(TRIM(ea.orden_id), ''), CAST(v.orden_id AS CHAR)) AS orden_id,
          COALESCE(NULLIF(TRIM(ea.codisegui), ''), v.ticket) AS codisegui,
          ea.satisfaccion_atencion,
          ea.facilidad_uso,
          ea.satisfaccion_experiencia,
          ea.seguridad_datos_tecnico,
          ea.comentarios,
          SUBSTRING(CAST(ea.fecha_registro AS CHAR), 1, 10) AS raw_date,
          DATE_FORMAT(ea.fecha_registro, '%d/%m') AS fecha_corta,
          DATE_FORMAT(ea.fecha_registro, '%d/%m/%Y %H:%i') AS fecha_fmt,
          COALESCE(NULLIF(TRIM(v.cliente), ''), 'Cliente WIN') AS cliente,
          v.telefono AS telefono,
          v.producto AS producto,
          COALESCE(NULLIF(TRIM(v.tipo_operacion), ''), 'OTROS') AS tipo_operacion_calc,
          COALESCE(NULLIF(TRIM(v.sector_operativo), ''), NULLIF(TRIM(v.ops_zona), ''), 'SIN SECTOR') AS sector_operativo,
          COALESCE(NULLIF(TRIM(v.ops_cuadrilla), ''), NULLIF(TRIM(v.cuadrilla), ''), 'SIN CUADRILLA') AS cuadrilla,
          COALESCE(NULLIF(TRIM(v.ops_partner), ''), v.partner) AS partner_raw,
          COALESCE(NULLIF(TRIM(v.ops_estado), ''), v.estado_ot) AS estado_ot
        FROM encuesta_app ea
        LEFT JOIN mat_funnel_casos_360 v ON v.orden_id = ea.orden_id_num
        ${whereSql}
        ORDER BY ea.fecha_registro DESC
        LIMIT 500
        `,
        params
      );

    const list: any[] = rows || [];
    const total = list.length;

    let sumAtencion = 0;
    let countAtencion = 0;
    let top2Atencion = 0;

    let sumFacilidad = 0;
    let countFacilidad = 0;

    let sumExperiencia = 0;
    let countExperiencia = 0;
    let top2Experiencia = 0;

    let segSi = 0;
    let segNo = 0;

    const distAtencion: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const partnerMap = new Map<string, {
      partner: string;
      surveys: number;
      sumAtencion: number;
      countAtencion: number;
      sumFacilidad: number;
      countFacilidad: number;
      sumExp: number;
      countExp: number;
      segSi: number;
    }>();
    const dailyMap = new Map<string, {
      raw_date: string;
      fecha: string;
      surveys: number;
      sumAtencion: number;
      countAtencion: number;
      sumExp: number;
      countExp: number;
    }>();

    const enrichedResponses = list.map((r) => {
      const atn = r.satisfaccion_atencion !== null && r.satisfaccion_atencion !== undefined ? Number(r.satisfaccion_atencion) : 0;
      const fac = r.facilidad_uso !== null && r.facilidad_uso !== undefined ? Number(r.facilidad_uso) : 0;
      const exp = r.satisfaccion_experiencia !== null && r.satisfaccion_experiencia !== undefined ? Number(r.satisfaccion_experiencia) : 0;
      const segRaw = String(r.seguridad_datos_tecnico || '').trim().toUpperCase();
      const isSegPositive =
        segRaw.includes('SI') ||
        segRaw.includes('SÍ') ||
        segRaw === '1' ||
        segRaw === 'TRUE' ||
        segRaw === '4' ||
        segRaw === '5';

      if (atn > 0) {
        sumAtencion += atn;
        countAtencion++;
        if (atn >= 4) top2Atencion++;
        if (distAtencion[atn] !== undefined) distAtencion[atn]++;
      }
      if (fac > 0) {
        sumFacilidad += fac;
        countFacilidad++;
      }
      if (exp > 0) {
        sumExperiencia += exp;
        countExperiencia++;
        if (exp >= 4) top2Experiencia++;
      }
      if (segRaw) {
        if (isSegPositive) segSi++;
        else segNo++;
      }

      const partnerClean = cleanPartnerName(r.partner_raw);
      const pEntry = partnerMap.get(partnerClean) || {
        partner: partnerClean,
        surveys: 0,
        sumAtencion: 0,
        countAtencion: 0,
        sumFacilidad: 0,
        countFacilidad: 0,
        sumExp: 0,
        countExp: 0,
        segSi: 0,
      };
      pEntry.surveys++;
      if (atn > 0) {
        pEntry.sumAtencion += atn;
        pEntry.countAtencion++;
      }
      if (fac > 0) {
        pEntry.sumFacilidad += fac;
        pEntry.countFacilidad++;
      }
      if (exp > 0) {
        pEntry.sumExp += exp;
        pEntry.countExp++;
      }
      if (isSegPositive) pEntry.segSi++;
      partnerMap.set(partnerClean, pEntry);

      if (r.raw_date) {
        const dEntry = dailyMap.get(r.raw_date) || {
          raw_date: r.raw_date,
          fecha: r.fecha_corta,
          surveys: 0,
          sumAtencion: 0,
          countAtencion: 0,
          sumExp: 0,
          countExp: 0,
        };
        dEntry.surveys++;
        if (atn > 0) {
          dEntry.sumAtencion += atn;
          dEntry.countAtencion++;
        }
        if (exp > 0) {
          dEntry.sumExp += exp;
          dEntry.countExp++;
        }
        dailyMap.set(r.raw_date, dEntry);
      }

      return {
        ...r,
        partner: partnerClean,
        servicio_tipo: classifyOrderServiceType(r.producto, r.tipo_operacion_calc),
      };
    });

    const avgAtencion = countAtencion > 0 ? sumAtencion / countAtencion : 0;
    const avgFacilidad = countFacilidad > 0 ? sumFacilidad / countFacilidad : 0;
    const avgExperiencia = countExperiencia > 0 ? sumExperiencia / countExperiencia : 0;
    const totalSeg = segSi + segNo;

      return {
        ok: true,
        kpis: {
          total_encuestas: total,
          avg_atencion: Number(avgAtencion.toFixed(2)),
          csat_atencion_pct: countAtencion > 0 ? Number(((top2Atencion / countAtencion) * 100).toFixed(1)) : 0,
          avg_facilidad: Number(avgFacilidad.toFixed(2)),
          ces_pct: countFacilidad > 0 ? Number(((avgFacilidad / 5) * 100).toFixed(1)) : 0,
          avg_experiencia: Number(avgExperiencia.toFixed(2)),
          csat_experiencia_pct: countExperiencia > 0 ? Number(((top2Experiencia / countExperiencia) * 100).toFixed(1)) : 0,
          seguridad_si: segSi,
          seguridad_no: segNo,
          seguridad_pct: totalSeg > 0 ? Number(((segSi / totalSeg) * 100).toFixed(1)) : 0,
        },
        distribution: [5, 4, 3, 2, 1].map((stars) => ({
          stars,
          count: distAtencion[stars] || 0,
          pct: countAtencion > 0 ? Number((((distAtencion[stars] || 0) / countAtencion) * 100).toFixed(1)) : 0,
        })),
        byPartner: Array.from(partnerMap.values())
          .map((p) => {
            const avgAtn = p.countAtencion > 0 ? p.sumAtencion / p.countAtencion : 0;
            const avgFac = p.countFacilidad > 0 ? p.sumFacilidad / p.countFacilidad : 0;
            const avgEx = p.countExp > 0 ? p.sumExp / p.countExp : 0;
            return {
              partner: p.partner,
              surveys: p.surveys,
              avg_atencion: Number(avgAtn.toFixed(2)),
              avg_facilidad: Number(avgFac.toFixed(2)),
              avg_experiencia: Number(avgEx.toFixed(2)),
              csat_pct: Number(((avgAtn / 5) * 100).toFixed(1)),
              seguridad_pct: p.surveys > 0 ? Number(((p.segSi / p.surveys) * 100).toFixed(1)) : 0,
            };
          })
          .sort((a, b) => b.avg_atencion - a.avg_atencion || b.surveys - a.surveys),
        daily: Array.from(dailyMap.values())
          .sort((a, b) => a.raw_date.localeCompare(b.raw_date))
          .map((d) => ({
            raw_date: d.raw_date,
            fecha: d.fecha,
            surveys: d.surveys,
            avg_atencion: d.countAtencion > 0 ? Number((d.sumAtencion / d.countAtencion).toFixed(2)) : 0,
            avg_experiencia: d.countExp > 0 ? Number((d.sumExp / d.countExp).toFixed(2)) : 0,
          })),
        responses: enrichedResponses,
      };
    });

    return res.json(payload);
  } catch (err: any) {
    console.error('❌ Error en /api/csat:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Servir archivos estáticos del Frontend compilado (dist) en producción (Azure App Service)
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

async function warmupCache() {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    console.log(`🔥 Precalentando catálogo y caché para: ${today}`);
    if (tiposUnicosList.length === 0) await loadTipoServicioCache();
    await syncMatFunnelIncremental();
    if (!queryCache.get('catalog_filters')) {
      const [zonas, partners]: any = await Promise.all([
        pool.query(`
          SELECT DISTINCT sector_operativo AS zona
          FROM mat_funnel_casos_360
          WHERE sector_operativo IS NOT NULL AND TRIM(sector_operativo) != ''
          ORDER BY sector_operativo
        `),
        pool.query(`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(partner), ''), 'SIN PARTNER') AS partner
          FROM mat_funnel_casos_360
          WHERE partner IS NOT NULL AND TRIM(partner) != ''
          ORDER BY partner
        `),
      ]);
      const zList = (zonas[0] || []).map((r: any) => r.zona).filter(Boolean);
      const pList = (partners[0] || []).map((r: any) => r.partner).filter(Boolean);
      queryCache.set('catalog_filters', {
        ok: true,
        servicios: tiposUnicosList,
        zonas: zList,
        sectores: zList,
        partners: pList,
      }, 3600);
      console.log('🔥 Catálogo de filtros precalentado en RAM con éxito.');
    }
  } catch (err: any) {
    console.warn('⚠️ Aviso durante warmup:', err.message);
  }
}

const PORT = Number(process.env.PORT || process.env.WEBSITES_PORT || 8080);
const serverInstance = app.listen(PORT, () => {
  console.log(`✅ Servidor WIN en RUTA activo en puerto ${PORT} (Capa Intermedia: ${CAPA_INTERMEDIA_URL})`);
  warmupCache().catch(() => { });
});

async function gracefulShutdown(signal: string) {
  console.log(`🛑 Recibida señal ${signal}. Cerrando conexiones de forma segura...`);
  serverInstance.close();
  try {
    if (redisClient) await redisClient.quit();
    await pool.end();
  } catch {
    // Ignorar errores al cerrar
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));