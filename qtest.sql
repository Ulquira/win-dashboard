-- 1. Eliminar índices 100% duplicados que ralentizan escrituras y consumen RAM
DROP INDEX idx_cola_ordenid ON cola_notificaciones_mantra;

DROP INDEX idx_logs_traking_ordenid ON logs_traking;

DROP INDEX idx_rpm_orden_id ON reporte_plantillas_mantra;

DROP INDEX idx_rpm_token ON reporte_plantillas_mantra;

DROP INDEX idx_vw_token ON vw_winordetraba;

-- 2. Crear índice en encuestas.fecha_registro (actualmente hace Full Scan en el Dashboard)
CREATE INDEX idx_encuestas_fecha_token ON encuestas (fecha_registro, token);

-- 3. Crear índice compuesto en vw_winordetraba para filtros de Fecha + Producto + Sector
CREATE INDEX idx_winot_fsoli_prod_sector ON vw_winordetraba (
    `F.Soli`,
    Producto,
    `Sector Operativo`
);

-- 4. Crear índice covering en logs_traking para acelerar el GROUP BY de vw_reporte_funnel_casos_360
CREATE INDEX idx_logs_trk_ord_evento_ts ON logs_traking (OrdenId, evento, `timestamp`);