import { z } from 'zod';
import dotenv from 'dotenv';

// Cargar variables de entorno desde .env antes de validar
dotenv.config();

const envSchema = z.object({
  DB_HOST: z.string().min(1, 'DB_HOST es requerido'),
  DB_USER: z.string().min(1, 'DB_USER es requerido'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD es requerido'),
  DB_NAME: z.string().min(1, 'DB_NAME es requerido'),
  DB_PORT: z.string().default('3306'),
  DB_POOL_LIMIT: z.string().default('20'),
  PORT: z.string().default('8080'),
  WEBSITES_PORT: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('win-en-ruta-production-secret-key-2026-secure'),
  SECRET_API_KEY: z.string().optional(),
  CAPA_INTERMEDIA_URL: z.string().optional(),
  MANTRA_API_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().default('development'),
});

type Env = z.infer<typeof envSchema>;

let _env: Env;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

export const env = getEnv();
