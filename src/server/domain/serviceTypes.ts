import {
  HOMOLOGACION_INVERSA_DB,
  homologarTipoServicio,
} from '../domain';

export interface ServiceFilterResult {
  srvList: string[];
  productosDelTipo: string[];
  canonicalList: string[];
}

export interface StrictOrderTypeSqlResult {
  sql: string;
  params: any[];
}

/**
 * Expresión SQL virtual que separa GARANTIA y REITERADA leyendo v.producto / v.tipo_trabajo
 * sin modificar ninguna columna ni tabla de MySQL.
 */
export function getVirtualTipoOperacionSql(alias: string = 'v'): string {
  return `CASE
    WHEN UPPER(COALESCE(${alias}.producto, '')) LIKE '%GARANTI%' OR UPPER(COALESCE(${alias}.tipo_trabajo, '')) LIKE '%GARANTI%' THEN 'GARANTIA'
    WHEN UPPER(COALESCE(${alias}.producto, '')) LIKE '%REITERAD%' OR UPPER(COALESCE(${alias}.tipo_trabajo, '')) LIKE '%REITERAD%' THEN 'REITERADA'
    ELSE COALESCE(NULLIF(TRIM(${alias}.tipo_operacion), ''), 'OTROS')
  END`;
}

export function classifyOrderServiceType(
  productoRaw?: any,
  tipoOperacionRaw?: any,
  servicioToTipoMap?: Map<string, string>,
  tipoTrabajoRaw?: any
): string {
  const prodKey = String(productoRaw || '').trim().toUpperCase();
  const trabKey = String(tipoTrabajoRaw || '').trim().toUpperCase();
  const tipoOpKey = String(tipoOperacionRaw || '').trim().toUpperCase();

  if (prodKey.includes('GARANTI') || trabKey.includes('GARANTI') || tipoOpKey.includes('GARANTI')) {
    return 'GARANTIA';
  }
  if (prodKey.includes('REITERAD') || trabKey.includes('REITERAD') || tipoOpKey.includes('REITERAD')) {
    return 'REITERADA';
  }

  const fromTipoOp = homologarTipoServicio(tipoOpKey);
  if (fromTipoOp) return fromTipoOp;

  if (prodKey && servicioToTipoMap?.has(prodKey)) {
    return servicioToTipoMap.get(prodKey)!;
  }

  const fromProd = homologarTipoServicio(prodKey);
  if (fromProd) return fromProd;

  return 'OTROS';
}

export function resolveProductosFromServiceFilter(
  serviceParam: string,
  servicioToTipoMap: Map<string, string>
): ServiceFilterResult {
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
    if (canonicalSet.has('GARANTIA') && !productosDelTipo.includes('GARANTIA')) {
      productosDelTipo.push('GARANTIA');
    }
    if (canonicalSet.has('REITERADA') && !productosDelTipo.includes('REITERADA')) {
      productosDelTipo.push('REITERADA');
    }
  }

  return {
    srvList: Array.from(dbSrvEquivalents),
    productosDelTipo,
    canonicalList: Array.from(canonicalSet),
  };
}

export function buildStrictOrderTypeSql(
  serviceParam: string,
  servicioToTipoMap: Map<string, string>,
  colTipoOrden: string = 'v.tipo_operacion'
): StrictOrderTypeSqlResult {
  if (!serviceParam || serviceParam === 'Todos' || serviceParam === 'Todos los servicios') {
    return { sql: '1=1', params: [] };
  }

  const { canonicalList, productosDelTipo, srvList } = resolveProductosFromServiceFilter(
    serviceParam,
    servicioToTipoMap
  );
  if (canonicalList.length === 0) {
    return { sql: '1=1', params: [] };
  }

  if (colTipoOrden === 'v.tipo_operacion') {
    const placeholders = canonicalList.map(() => '?').join(',');
    return {
      sql: `(${getVirtualTipoOperacionSql('v')}) IN (${placeholders})`,
      params: canonicalList.map((x) => x.toUpperCase()),
    };
  }

  if (colTipoOrden.includes('tipo_operacion')) {
    const placeholders = canonicalList.map(() => '?').join(',');
    return {
      sql: `UPPER(TRIM(${colTipoOrden})) IN (${placeholders})`,
      params: canonicalList.map((x) => x.toUpperCase()),
    };
  }

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