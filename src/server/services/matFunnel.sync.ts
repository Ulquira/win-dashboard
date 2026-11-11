import { pool } from '../config/db';
import {
  cacheGet,
  cacheSet,
  queryCache,
  swrMemoryCache,
  inFlightRequests,
  inFlightGet,
  inFlightSet,
  inFlightDelete,
  cacheFlushAll,
  type SwrEntry,
} from '../config/cache';
import {
  SERVICIOS_PERMITIDOS,
  HOMOLOGACION_INVERSA_DB,
  homologarTipoServicio,
  resolveProductosFromServiceFilter,
  type ServiceFilterResult,
} from '../domain/index';

export { resolveProductosFromServiceFilter };

let servicioToTipoMap = new Map<string, string>();
let tiposUnicosList: string[] = [...SERVICIOS_PERMITIDOS];
let isSyncingMatFunnel = false;

/**
 * Obtiene el mapa actualizado de productos a tipos homologados.
 */
export function getServicioToTipoMap(): Map<string, string> {
  return servicioToTipoMap;
}

/**
 * Obtiene la lista de tipos únicos de servicio.
 */
export function getTiposUnicosList(): string[] {
  return tiposUnicosList;
}

/**
 * Carga el catálogo de tipos de servicio desde la tabla `tiposervicio`.
 * Pobla servicioToTipoMap y tiposUnicosList.
 */
export async function loadTipoServicioCache(): Promise<void> {
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

/**
 * Sincronización incremental de tabla materializada mat_funnel_casos_360.
 */
export async function syncMatFunnelIncremental(customStart?: string, customEnd?: string): Promise<void> {
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

/**
 * SWR + Single-Flight: ejecuta computeFn una sola vez por clave, comparte el resultado
 * entre llamadas concurrentes, y sirve datos stale mientras se revalida en fondo.
 */
export async function withSingleFlightSwr<T>(
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
    const swrEntry = swrMemoryCache.get<SwrEntry<T>>(key);
    if (swrEntry) {
      if (Date.now() >= swrEntry.freshUntil && !inFlightRequests.has(key)) {
        runCompute().catch((err) => console.warn(`⚠️ Error en SWR background (${key}):`, err.message));
      }
      return swrEntry.data;
    }
    const cached = await cacheGet<T>(key);
    if (cached) {
      swrMemoryCache.set(
        key,
        { data: cached, freshUntil: Date.now() + ttlSeconds * 1000 } as SwrEntry<T>,
        Math.max(ttlSeconds * 6, 900)
      );
      return cached;
    }
  }

  return runCompute();
}

export async function loadTipoServicioCacheIfNeeded(): Promise<void> {
  if (servicioToTipoMap.size === 0) {
    await loadTipoServicioCache();
  }
}

export { servicioToTipoMap, tiposUnicosList, isSyncingMatFunnel };
