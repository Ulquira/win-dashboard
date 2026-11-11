import {
  SERVICIOS_PERMITIDOS,
  HOMOLOGACION_INVERSA_DB,
  homologarTipoServicio,
} from './homologacion';

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
 * Clasifica cualquier nombre de producto/motivo de trabajo en uno de los 5 tipos oficiales.
 * Usa primero el mapa cargado desde la tabla `tiposervicio` y, si no está, aplica reglas de negocio.
 */
export function classifyOrderServiceType(
  productoRaw?: any,
  tipoOperacionRaw?: any,
  servicioToTipoMap?: Map<string, string>
): string {
  const tipoOpKey = String(tipoOperacionRaw || '').trim().toUpperCase();
  const prodKey = String(productoRaw || '').trim().toUpperCase();

  // 1. Prioridad: Lo que calculó la vista limpia en tipo_operacion
  const fromTipoOp = homologarTipoServicio(tipoOpKey);
  if (fromTipoOp) return fromTipoOp;

  // 2. Si no viene tipo_operacion o no es canónico, consultar mapa
  if (prodKey && servicioToTipoMap?.has(prodKey)) {
    return servicioToTipoMap.get(prodKey)!;
  }

  const fromProd = homologarTipoServicio(prodKey);
  if (fromProd) return fromProd;

  return 'OTROS';
}

/**
 * Resuelve estrictamente la lista de productos (de la tabla `tiposervicio`)
 * que pertenecen al tipo de servicio seleccionado.
 */
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
