import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { signAuthToken, verifyAuthToken } from '../auth/jwt';
import { requireAuth, requireAdmin, enforceRoleServiceScope } from '../auth/middleware';
import { ensureRbacTables, parseJsonSafe } from '../auth/rbac';
import { hashPassword, comparePassword, isBcryptHash, sha256Hex, BCRYPT_ROUNDS } from '../auth/password';
import { loginLimiter } from '../middleware/rateLimit';

const router = Router();

// Esquemas de validación estricta con Zod
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

// POST /api/auth/login -> Valida con Zod + Rate Limit + Bcrypt
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
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
    const isBcryptHashValue = isBcryptHash(dbPass);
    let isPasswordValid = false;

    if (isBcryptHashValue) {
      isPasswordValid = await comparePassword(password, dbPass);
    } else {
      const sha256Input = sha256Hex(password);
      isPasswordValid = dbPass === password || dbPass === sha256Input;

      // Auto-migración transparente: si la contraseña estaba en texto plano, la encripta con Bcrypt en BD
      if (isPasswordValid && userRow.id) {
        const newHash = await hashPassword(password);
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

// GET /api/auth/me -> Verifica sesión activa y devuelve permisos actualizados desde BD
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Sesión expirada o inválida' });
  }
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
router.get('/admin/rbac', async (req: Request, res: Response) => {
  const decoded = requireAuth(req, res);
  if (!decoded) return;
  const rolCodigo = String(decoded?.permisos?.rolCodigo || '').toUpperCase();
  const vistas: string[] = decoded?.permisos?.vistas || [];
  if (rolCodigo !== 'ADMIN' && !vistas.includes('*') && !vistas.includes('Accesos')) {
    return res.status(403).json({ ok: false, error: 'Acceso restringido a Administradores.' });
  }
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
router.post('/admin/roles', async (req: Request, res: Response) => {
  const decoded = requireAuth(req, res);
  if (!decoded) return;
  const rolCodigo = String(decoded?.permisos?.rolCodigo || '').toUpperCase();
  const vistas: string[] = decoded?.permisos?.vistas || [];
  if (rolCodigo !== 'ADMIN' && !vistas.includes('*') && !vistas.includes('Accesos')) {
    return res.status(403).json({ ok: false, error: 'Acceso restringido a Administradores.' });
  }
  try {
    const parsed = RoleUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Datos de rol inválidos.',
      });
    }

    const { id, codigo, nombre, vistas: v, subvistas, servicios } = parsed.data;
    const cleanCodigo = codigo.toUpperCase().replace(/\s+/g, '_');

    const vJson = JSON.stringify(v.length > 0 ? v : ['Dashboard']);
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
router.post('/admin/users', async (req: Request, res: Response) => {
  const decoded = requireAuth(req, res);
  if (!decoded) return;
  const rolCodigo = String(decoded?.permisos?.rolCodigo || '').toUpperCase();
  const vistas: string[] = decoded?.permisos?.vistas || [];
  if (rolCodigo !== 'ADMIN' && !vistas.includes('*') && !vistas.includes('Accesos')) {
    return res.status(403).json({ ok: false, error: 'Acceso restringido a Administradores.' });
  }
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
        const passHash = await hashPassword(password);
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
      const passHash = await hashPassword(password);
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
router.delete('/admin/users/:id', async (req: Request, res: Response) => {
  const decoded = requireAuth(req, res);
  if (!decoded) return;
  const rolCodigo = String(decoded?.permisos?.rolCodigo || '').toUpperCase();
  const vistas: string[] = decoded?.permisos?.vistas || [];
  if (rolCodigo !== 'ADMIN' && !vistas.includes('*') && !vistas.includes('Accesos')) {
    return res.status(403).json({ ok: false, error: 'Acceso restringido a Administradores.' });
  }
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

// Exportar para inicialización
export { ensureRbacTables };
export default router;
