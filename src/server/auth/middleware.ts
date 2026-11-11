import { Request, Response } from 'express';
import { verifyAuthToken } from './jwt';

export interface JWTPayload {
  id: number;
  documento: string;
  nombre: string;
  email?: string;
  permisos: {
    rolCodigo: string;
    rolNombre: string;
    vistas: string[];
    subvistas: string[];
    servicios: string[];
  };
}

/**
 * Extrae y verifica el token JWT de la cabecera Authorization.
 * Devuelve null si no hay sesión válida (ya envía 401 al cliente).
 */
export function requireAuth(req: Request, res: Response): JWTPayload | null {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: 'Sesión expirada o inválida' });
    return null;
  }
  return decoded as JWTPayload;
}

/**
 * Exige rol ADMIN o permisos de vistas que incluyan '*' o 'Accesos'.
 */
export function requireAdmin(req: Request, res: Response): JWTPayload | null {
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

/**
 * Restringe cualquier filtro de servicio del frontend a los servicios permitidos por el Rol en el JWT.
 */
export function enforceRoleServiceScope(req: Request, requestedService: string): string {
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
