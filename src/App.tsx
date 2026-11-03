import React, { useState, useMemo, useEffect } from 'react';
import { Activity, ClipboardList } from 'lucide-react';
import {
  ViewMode, NavSection, KpiData, EvolutionPoint,
  RealOrder, PartnerRankItem, CalculatedMetrics
} from './types/dashboard';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { OrderDetailDrawer } from './components/OrderDetailDrawer';
import { ExecutiveView } from './views/ExecutiveView';
import { OperationalView } from './views/OperationalView';
import { OrdersView } from './views/OrdersView';

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('Dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('ejecutiva');

  const todayStr = new Date().toLocaleDateString('en-CA');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [service, setService] = useState<string>('Todos los servicios');
  const [zone, setZone] = useState<string>('Todas las zonas');

  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [zoneOptions, setZoneOptions] = useState<string[]>([]);

  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [evolution, setEvolution] = useState<EvolutionPoint[]>([]);
  const [dailyInRange, setDailyInRange] = useState<any[]>([]);
  const [byEstadoOt, setByEstadoOt] = useState<any[]>([]);
  const [bySector, setBySector] = useState<any[]>([]);
  const [byTipoOperacion, setByTipoOperacion] = useState<any[]>([]);
  const [orders, setOrders] = useState<RealOrder[]>([]);
  const [partners, setPartners] = useState<PartnerRankItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dbOnline, setDbOnline] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<RealOrder | null>(null);

  const fetchDashboardData = (
    sDate = startDate,
    eDate = endDate,
    srv = service,
    zn = zone,
    forceRefresh = false
  ) => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams({
      startDate: sDate,
      endDate: eDate,
      service: srv,
      zone: zn,
      refresh: forceRefresh ? 'true' : 'false',
    });

    fetch(`http://localhost:3001/api/dashboard?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setKpis(data.kpis);
          setEvolution(data.evolution || []);
          setDailyInRange(data.dailyInRange || []);
          setByEstadoOt(data.byEstadoOt || []);
          setBySector(data.bySector || []);
          setByTipoOperacion(data.byTipoOperacion || []);
          setOrders(data.orders || []);
          setPartners(data.partners || []);
          setDbOnline(true);
        } else {
          setDbOnline(false);
          setErrorMsg(data.error || 'Error desconocido en la consulta');
        }
      })
      .catch((err) => {
        setDbOnline(false);
        setErrorMsg(`No se pudo conectar a localhost:3001 (${err.message})`);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();

    fetch('http://localhost:3001/api/filters')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setServiceOptions(data.servicios || []);
          setZoneOptions(data.zonas || []);
        }
      })
      .catch((err) => console.error('Error cargando filtros:', err));
  }, []);

  const calc: CalculatedMetrics = useMemo(() => {
    const total = Number(kpis?.total_ordenes || 0);
    const enviados = Number(kpis?.whs_enviados || 0);
    const leidos = Number(kpis?.whs_leidos || 0);
    const sent = Number(kpis?.whs_sent || 0);
    const delivered = Number(kpis?.whs_delivered || 0);
    const failed = Number(kpis?.whs_failed || 0);
    const noEnviado = Number(kpis?.whs_no_enviado || 0);
    const tracking = Number(kpis?.ingreso_tracking || 0);
    const reprog = Number(kpis?.reprogramaciones || 0);
    const encuestas = Number(kpis?.encuestas_respondidas || 0);
    const leidosSinIngreso = Number(kpis?.leidos_sin_ingreso || 0);

    const avTotal = Number(kpis?.av_total || 0);
    const avEnviados = Number(kpis?.av_enviados || 0);
    const avLeidos = Number(kpis?.av_leidos || 0);
    const avTracking = Number(kpis?.av_tracking || 0);

    const prefTotal = Number(kpis?.pref_total || 0);
    const prefEnviados = Number(kpis?.pref_enviados || 0);
    const prefLeidos = Number(kpis?.pref_leidos || 0);
    const prefTracking = Number(kpis?.pref_tracking || 0);

    const fmt = (n: number) => n.toLocaleString('es-PE');
    const pct = (num: number, den: number) =>
      den > 0 ? ((num / den) * 100).toFixed(1).replace('.', ',') : '0,0';

    const avPctNum = avEnviados > 0 ? (avTracking / avEnviados) * 100 : 0;
    const prefPctNum = prefEnviados > 0 ? (prefTracking / prefEnviados) * 100 : 0;

    return {
      ordenes: fmt(total),
      whsEnviados: fmt(enviados),
      whsPct: pct(enviados, total),
      leidos: fmt(leidos),
      readPct: pct(leidos, enviados),
      tracking: fmt(tracking),
      trackPct: pct(tracking, enviados),
      trackOverReadPct: pct(tracking, leidos),
      reprog: fmt(reprog),
      csatCount: fmt(encuestas),
      sent: fmt(sent),
      sentPct: pct(sent, enviados),
      delivered: fmt(delivered),
      deliveredPct: pct(delivered, enviados),
      failed: fmt(failed),
      failedPct: pct(failed, total),
      noEnviado: fmt(noEnviado),
      noEnviadoPct: pct(noEnviado, total),
      leidosSinIngreso: fmt(leidosSinIngreso),
      leidosSinIngresoPct: pct(leidosSinIngreso, enviados),
      avTotalFmt: fmt(avTotal),
      avEnviadosFmt: fmt(avEnviados),
      avTrackingFmt: fmt(avTracking),
      avPct: pct(avTracking, avEnviados),
      avOverReadPct: pct(avTracking, avLeidos),
      avBarWidth: avTracking > 0 ? Math.min(100, Math.max(8, Math.round(avPctNum * 2.2))) : 0,
      prefTotalFmt: fmt(prefTotal),
      prefEnviadosFmt: fmt(prefEnviados),
      prefTrackingFmt: fmt(prefTracking),
      prefPct: pct(prefTracking, prefEnviados),
      prefOverReadPct: pct(prefTracking, prefLeidos),
      prefBarWidth: prefTracking > 0 ? Math.min(100, Math.max(8, Math.round(prefPctNum * 2.2))) : 0,
    };
  }, [kpis]);

  return (
    <div className="flex min-h-screen bg-[#090D16] text-gray-100 font-sans select-none">
      <Sidebar
        activeNav={activeNav}
        viewMode={viewMode}
        setActiveNav={setActiveNav}
        setViewMode={setViewMode}
      />

      <main className="flex-1 p-5 overflow-y-auto space-y-4">
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between">
            <span><strong>Aviso de conexión:</strong> {errorMsg}</span>
            <button
              onClick={() => fetchDashboardData(startDate, endDate, service, zone, true)}
              className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded font-semibold"
            >
              Reintentar
            </button>
          </div>
        )}

        <Header
          activeNav={activeNav}
          viewMode={viewMode}
          loading={loading}
          dbOnline={dbOnline}
          startDate={startDate}
          endDate={endDate}
          service={service}
          zone={zone}
          serviceOptions={serviceOptions}
          zoneOptions={zoneOptions}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          setService={setService}
          setZone={setZone}
          onConsult={() => fetchDashboardData(startDate, endDate, service, zone, true)}
        />

        {activeNav === 'Dashboard' && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('ejecutiva')}
                  className={`flex items-center gap-2 px-4 py-1.5 font-semibold text-xs rounded-lg transition ${
                    viewMode === 'ejecutiva'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-orange-500/10'
                      : 'bg-[#111827] text-gray-400 hover:text-gray-200 border border-gray-800'
                  }`}
                >
                  <Activity size={14} />
                  Vista Ejecutiva
                </button>
                <button
                  onClick={() => setViewMode('operativa')}
                  className={`flex items-center gap-2 px-4 py-1.5 font-semibold text-xs rounded-lg transition ${
                    viewMode === 'operativa'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-orange-500/10'
                      : 'bg-[#111827] text-gray-400 hover:text-gray-200 border border-gray-800'
                  }`}
                >
                  <ClipboardList size={14} />
                  Vista Operativa
                </button>
              </div>
            </div>

            <KpiCards calc={calc} kpis={kpis} />

            {viewMode === 'ejecutiva' ? (
              <ExecutiveView calc={calc} evolution={evolution} partners={partners} />
            ) : (
              <OperationalView
                calc={calc}
                kpis={kpis}
                dailyInRange={dailyInRange}
                byEstadoOt={byEstadoOt}
                bySector={bySector}
                byTipoOperacion={byTipoOperacion}
              />
            )}
          </>
        )}

        {activeNav === 'Órdenes' && (
          <OrdersView orders={orders} onSelectOrder={setSelectedOrder} />
        )}

        <OrderDetailDrawer
          selectedOrder={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      </main>
    </div>
  );
}