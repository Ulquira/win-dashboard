/**
 * Unifica nombres de Partners eliminando SGI, SGA y sufijos numéricos.
 */
export function cleanPartnerName(raw: any): string {
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
