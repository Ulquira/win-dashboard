import { pool } from '../config/db';

export function parseJsonSafe(raw: any, fallback: string[] = ['*']): string[] {
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

/**
 * Inicializa tablas RBAC automáticamente y hashea contraseña inicial.
 */
export async function ensureRbacTables(): Promise<void> {
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
    (4, 'VISITA_TECNICA_AVERIAS', 'Supervisor Averías y Postventa', '["Dashboard", "Órdenes", "Seguimiento"]', '["ejecutiva", "operativa", "operaciones"]', '["AVER - LIMA", "AVER - PROV", "POSTVENTA"])
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
  const { hashPassword } = await import('../auth/password');
  const defaultHash = await hashPassword('win2026');
  await pool.query(
    `INSERT IGNORE INTO usuarios (documento, nombre, email, password, rol_id, activo) VALUES ('99999999', 'Admin General WIN', 'admin@win.pe', ?, 1, 1)`,
    [defaultHash]
  );
}
