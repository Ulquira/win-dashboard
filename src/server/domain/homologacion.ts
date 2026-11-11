export const SERVICIOS_PERMITIDOS = [
  'INSTA - LIMA',
  'INSTA - PROV',
  'AVER - LIMA',
  'AVER - PROV',
  'POSTVENTA',
] as const;

export type ServicioPermitido = (typeof SERVICIOS_PERMITIDOS)[number];

export const HOMOLOGACION_INVERSA_DB: Record<string, string[]> = {
  'INSTA - LIMA': ['INSTA - LIMA', 'INSTALACION', 'INSTALACIÓN', 'INSTALACIONES'],
  'INSTA - PROV': ['INSTA - PROV', 'PROVINCIA', 'INSTALACION PROVINCIA'],
  'AVER - LIMA': ['AVER - LIMA', 'AVERIAS', 'AVERÍAS', 'AVERIA'],
  'AVER - PROV': ['AVER - PROV', 'AVERIAS PRV', 'AVERÍAS PRV', 'AVERIAS PROV'],
  POSTVENTA: ['POSTVENTA', 'POST VENTA'],
};

/**
 * Homologa estrictamente a los 5 tipos de servicio oficiales.
 * Cualquier otro valor ('NO', 'OTROS', etc.) devuelve null y queda bloqueado.
 */
export function homologarTipoServicio(rawTipo: string): string | null {
  const upper = String(rawTipo || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!upper || upper === 'NO' || upper === 'OTROS' || upper === 'NULL') return null;

  // 1. POSTVENTA primero para que nunca sea absorbido por Instalaciones
  if (
    upper.includes('POSTVENTA') ||
    upper.includes('POST VENTA') ||
    upper.includes('TRASLADO') ||
    upper.includes('MIGRACION') ||
    upper.includes('CAMBIO DE PLAN') ||
    upper.includes('MESH')
  ) {
    if (
      upper === 'INSTA - LIMA' ||
      upper === 'INSTA - PROV' ||
      upper === 'AVER - LIMA' ||
      upper === 'AVER - PROV'
    ) {
      // Respetar nombre canónico
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
