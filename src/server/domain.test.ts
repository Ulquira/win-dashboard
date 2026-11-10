import { describe, it, expect } from 'vitest';
import { homologarTipoServicio, cleanPartnerName } from './domain.ts';

describe('Reglas de Negocio WIN en RUTA', () => {
    it('homologa correctamente los 5 tipos de servicio oficiales', () => {
        expect(homologarTipoServicio('INSTALACIÓN')).toBe('INSTA - LIMA');
        expect(homologarTipoServicio('INSTALACION PROVINCIA')).toBe('INSTA - PROV');
        expect(homologarTipoServicio('AVERÍAS')).toBe('AVER - LIMA');
        expect(homologarTipoServicio('AVERIAS PRV')).toBe('AVER - PROV');
        expect(homologarTipoServicio('POST VENTA')).toBe('POSTVENTA');
    });

    it('bloquea valores inválidos o excluidos', () => {
        expect(homologarTipoServicio('NO')).toBeNull();
        expect(homologarTipoServicio('OTROS')).toBeNull();
        expect(homologarTipoServicio('')).toBeNull();
    });

    it('unifica nombres de Partners eliminando SGI, SGA y sufijos numéricos', () => {
        expect(cleanPartnerName('M&D SGI')).toBe('M&D');
        expect(cleanPartnerName('COMFICA SGA')).toBe('COMFICA');
        expect(cleanPartnerName('BIO 2')).toBe('BIO');
        expect(cleanPartnerName('BIO 3 SGI')).toBe('BIO');
        expect(cleanPartnerName('   ')).toBe('SIN PARTNER');
    });
});