import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { cacheGet, cacheSet } from '../config/cache';
import { getRedisClient, isRedisReady } from '../config/redis';
import { requireAuth } from '../auth/middleware';
import { parseJsonSafe } from '../auth/rbac';
import { cleanPartnerName, SERVICIOS_PERMITIDOS, homologarTipoServicio, HOMOLOGACION_INVERSA_DB } from '../domain/index';
import { loadTipoServicioCache } from '../services/matFunnel.sync';

const router = Router();

// GET /api/home/status -> Endpoint de telemetría rápida para la vista Inicio
router.get('/home/status', async (_req: Request, res: Response) => {
  try {
    const cached = await cacheGet('home_system_status');
    if (cached) return res.json(cached);

    const [syncRows, sosChatRows]: any = await Promise.all([
      pool
        .query(`SELECT run_id, status, started_at FROM sync_runs ORDER BY started_at DESC LIMIT 1`)
        .catch(() => [[]]),
      pool
        .query(`
          SELECT COUNT(*) AS active_sos
          FROM historial_chats_mantra
          WHERE UPPER(COALESCE(semaforo_sla, '')) LIKE '%ROJO%'
             OR UPPER(COALESCE(estado_chat, '')) = 'ABIERTO'
        `)
        .catch(() => [[{ active_sos: 0 }]]),
    ]);

    const lastSync = syncRows?.[0]?.[0] || null;
    const payload = {
      ok: true,
      sync: lastSync
        ? {
            id: lastSync.run_id,
            status: String(lastSync.status || 'OK').toUpperCase(),
            startedAt: lastSync.started_at,
          }
        : null,
      activeChats: Number(sosChatRows?.[0]?.[0]?.active_sos || 0),
    };

    await cacheSet('home_system_status', payload, 60);
    return res.json(payload);
  } catch (err: any) {
    return res.json({ ok: true, sync: null, activeChats: 0, error: err.message });
  }
});

// GET /api/filters -> Endpoint de catálogos para filtros desplegables
router.get('/filters', async (_req: Request, res: Response) => {
  try {
    const cachedFilters: any = await cacheGet('catalog_filters');
    if (
      cachedFilters &&
      cachedFilters.ok &&
      Array.isArray(cachedFilters.servicios) &&
      cachedFilters.servicios.length > 0
    ) {
      return res.json(cachedFilters);
    }

    await loadTipoServicioCache();

    const [zonasRes, partnersRes]: any = await Promise.all([
      pool
        .query(`
          SELECT DISTINCT sector_operativo AS zona
          FROM mat_funnel_casos_360
          WHERE sector_operativo IS NOT NULL AND TRIM(sector_operativo) != ''
          ORDER BY sector_operativo
        `)
        .catch(() => [[]]),
      pool
        .query(`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(partner), ''), 'SIN PARTNER') AS partner
          FROM mat_funnel_casos_360
          WHERE partner IS NOT NULL AND TRIM(partner) != ''
          ORDER BY partner
        `)
        .catch(() => [[]]),
    ]);

    const todayStr = new Date().toLocaleDateString('en-CA');
    const zList = (zonasRes?.[0] || []).map((z: any) => z.zona).filter(Boolean);
    const pList = Array.from(
      new Set((partnersRes?.[0] || []).map((p: any) => cleanPartnerName(p.partner)).filter(Boolean))
    ).sort();

    const payload = {
      ok: true,
      servicios: Array.from(SERVICIOS_PERMITIDOS),
      zonas: zList,
      sectores: zList,
      partners: pList,
      dateRange: { minDate: todayStr, maxDate: todayStr },
    };
    await cacheSet('catalog_filters', payload, 3600);
    return res.json(payload);

  } catch (error: any) {
    return res.json({
      ok: true,
      servicios: Array.from(SERVICIOS_PERMITIDOS),
      zonas: [],
      sectores: [],
      partners: [],
    });
  }
});

// GET /api/4dm1n_/mantra-chat -> Endpoint ultrarrápido directo desde tabla local historial_chats_mantra
router.get('/4dm1n_/mantra-chat', async (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.query.phone || '').replace(/\D/g, '');
    const phone9 = rawPhone.slice(-9);
    const ordenId = req.query.ordenId ? Number(req.query.ordenId) : null;
    const limit = Number(req.query.limit) || 1000;

    if (!phone9 && !ordenId) {
      return res.status(400).json({ ok: false, error: 'Parámetro phone u ordenId requerido' });
    }

    // Búsqueda indexada prioritaria por orden_id (instantánea) y fallback por teléfono
    let chatRows: any[] = [];
    if (ordenId) {
      const [byOrder]: any = await pool.query(
        `SELECT * FROM historial_chats_mantra WHERE orden_id = ? LIMIT 1`,
        [ordenId]
      );
      chatRows = byOrder || [];
    }

    if (chatRows.length === 0 && phone9) {
      const [byPhone]: any = await pool.query(
        `SELECT * FROM historial_chats_mantra WHERE phone LIKE ? ORDER BY orden_id DESC LIMIT 1`,
        [`%${phone9}`]
      );
      chatRows = byPhone || [];
    }

    const chatRecord = chatRows?.[0] || null;
    let messages: any[] = [];

    if (chatRecord?.ultimos_mensajes_json) {
      try {
        const parsed =
          typeof chatRecord.ultimos_mensajes_json === 'string'
            ? JSON.parse(chatRecord.ultimos_mensajes_json)
            : chatRecord.ultimos_mensajes_json;
        if (Array.isArray(parsed)) {
          messages = parsed.slice(-limit);
        } else if (parsed && Array.isArray(parsed.messages)) {
          messages = parsed.messages.slice(-limit);
        }
      } catch (parseErr: any) {
        console.warn('⚠️ Error al parsear JSON de chat en fallback:', parseErr.message);
      }
    }

    return res.json({
      ok: true,
      source: 'db_fallback',
      chatMeta: chatRecord
        ? {
            estado_chat: chatRecord.estado_chat,
            semaforo_sla: chatRecord.semaforo_sla,
            quien_tiene_la_palabra: chatRecord.quien_tiene_la_palabra,
            phone: chatRecord.phone,
            orden_id: chatRecord.orden_id,
            ticket: chatRecord.ticket,
          }
        : null,
      messages,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
