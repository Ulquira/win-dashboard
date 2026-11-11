export type ViewMode = 'ejecutiva' | 'operativa' | 'operaciones';
export type NavSection =
  | 'Inicio'
  | 'Dashboard'
  | 'Órdenes'
  | 'Seguimiento'
  | 'Chat en Vivo'
  | 'Eficiencia'
  | 'Experiencia (CSAT)'
  | 'Accesos';

export interface OperationsKpis {
  total_ordenes: number;
  finalizadas: number;
  en_curso: number;
  agendadas: number;
  canceladas: number;
  cuadrillas_activas: number;
  partners_activos: number;
  zonas_activas: number;
  efectividad_pct: number;
  cancelacion_pct: number;
  prod_ot_por_cuadrilla: number;
  prod_fin_por_cuadrilla: number;
}

export interface KpiData {
  total_ordenes: number;
  whs_enviados: number;
  whs_leidos: number;
  whs_sent: number;
  whs_delivered: number;
  whs_failed: number;
  whs_no_enviado: number;
  ingreso_tracking: number;
  sos_soporte?: number;
  autogestionados?: number;
  reprogramaciones: number;
  encuestas_respondidas: number;
  csat_avg?: number;
  leidos_sin_ingreso: number;
  av_total: number;
  av_enviados: number;
  av_leidos: number;
  av_tracking: number;
  pref_total: number;
  pref_enviados: number;
  pref_leidos: number;
  pref_tracking: number;
}

export interface EvolutionPoint {
  fecha: string;
  total: number;
  enviados: number;
  leidos: number;
  tracking: number;
}

export interface RealOrder {
  orden_id: number;
  ticket: string;
  cliente: string;
  telefono: string;
  producto: string;
  servicio_tipo: string;
  tipo_trabajo: string;
  estado_ot: string;
  fecha_solicitud_fmt: string;
  sector_operativo: string;
  distrito: string;
  partner: string;
  cuadrilla: string;
  se_envio_wsp: string;
  estado_wsp: string;
  ingreso_tracking: string;
  link_tracking: string;
  reprogramo?: string;
  respondio_encuesta?: string;
  [key: string]: any;
}

export interface PartnerRankItem {
  rank: number;
  name: string;
  surveys: number;
  score: string;
  csat: string;
}

export interface GeoPoint {
  id: string;
  kind: 'cliente' | 'tecnico' | 'cto';
  label: string;
  detail?: string;
  lat: number;
  lng: number;
}

export interface CalculatedMetrics {
  ordenes: string;
  whsEnviados: string;
  whsPct: string;
  leidos: string;
  readPct: string;
  tracking: string;
  trackPct: string;
  trackOverReadPct: string;
  sosCount: string;
  sosOverEnvPct: string;
  sosOverTrackPct: string;
  autogestionCount: string;
  autogestionPct: string;
  reprog: string;
  csatCount: string;
  sent: string;
  sentPct: string;
  delivered: string;
  deliveredPct: string;
  failed: string;
  failedPct: string;
  noEnviado: string;
  noEnviadoPct: string;
  leidosSinIngreso: string;
  leidosSinIngresoPct: string;
  avTotalFmt: string;
  avEnviadosFmt: string;
  avTrackingFmt: string;
  avPct: string;
  avOverReadPct: string;
  avBarWidth: number;
  prefTotalFmt: string;
  prefEnviadosFmt: string;
  prefTrackingFmt: string;
  prefPct: string;
  prefOverReadPct: string;
  prefBarWidth: number;
}
export interface RolePermissions {
  rolCodigo: string;
  rolNombre: string;
  vistas: string[];      // ["*"] o lista de NavSection
  subvistas: string[];   // ["*"] o lista de ViewMode
  servicios: string[];   // ["*"] o lista de los 5 servicios homologados
}

export interface AuthUser {
  id: number;
  documento: string;
  nombre: string;
  email?: string;
  permisos: RolePermissions;
}