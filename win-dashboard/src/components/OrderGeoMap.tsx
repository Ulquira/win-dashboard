import React, { useState, useMemo, useEffect } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { GeoPoint, RealOrder } from '../types/dashboard';

function parseCoordPair(raw?: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  const matches = String(raw).match(/-?\d+\.\d+/g);
  if (!matches || matches.length < 2) return null;
  const lat = parseFloat(matches[0]);
  const lng = parseFloat(matches[1]);
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function parseTechnicalData(rawDatos?: string | null, geoCliente?: string | null, geoTecnico?: string | null) {
  const points: GeoPoint[] = [];
  const attributes: { key: string; value: string }[] = [];
  const ctoNames: Record<string, string> = {};

  const cliCoord = parseCoordPair(geoCliente);
  if (cliCoord) {
    points.push({
      id: 'cliente',
      kind: 'cliente',
      label: 'Domicilio Cliente',
      detail: `${cliCoord.lat}, ${cliCoord.lng}`,
      lat: cliCoord.lat,
      lng: cliCoord.lng,
    });
  }

  const tecCoord = parseCoordPair(geoTecnico);
  if (tecCoord) {
    points.push({
      id: 'tecnico',
      kind: 'tecnico',
      label: 'Ubicación Técnico',
      detail: `${tecCoord.lat}, ${tecCoord.lng}`,
      lat: tecCoord.lat,
      lng: tecCoord.lng,
    });
  }

  if (rawDatos) {
    const segments = String(rawDatos)
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const seg of segments) {
      const parts = seg.split('/');
      const rawKey = (parts[0] || '').trim();
      const rawVal = (parts.slice(2).join('/') || parts[1] || '').trim();
      if (!rawKey || !rawVal) continue;

      if (/^CTO\d*$/i.test(rawKey)) {
        ctoNames[rawKey.toUpperCase()] = rawVal;
        attributes.push({ key: rawKey.toUpperCase(), value: rawVal });
      } else if (/COORDENADA\s*(CTO\d*)/i.test(rawKey)) {
        const matchCto = rawKey.match(/(CTO\d*)/i);
        const ctoKey = matchCto ? matchCto[1].toUpperCase() : 'CTO';
        const coord = parseCoordPair(rawVal);
        if (coord) {
          points.push({
            id: `coord_${ctoKey}_${points.length}`,
            kind: 'cto',
            label: ctoKey,
            detail: ctoNames[ctoKey] ? `Código: ${ctoNames[ctoKey]}` : `${coord.lat}, ${coord.lng}`,
            lat: coord.lat,
            lng: coord.lng,
          });
        }
      } else {
        attributes.push({ key: rawKey, value: rawVal });
      }
    }
  }

  return { points, attributes };
}

export function OrderGeoMap({ order }: { order: RealOrder }) {
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const [mapStyle, setMapStyle] = useState<'google_streets' | 'google_hybrid' | 'dark'>('google_streets');

  const { points, attributes } = useMemo(
    () =>
      parseTechnicalData(
        order.datos_tecnicos,
        order.georeferencia_cliente || order.Georeferencia,
        order.georeferencia_tecnico || order.Georeferencia_tecnico
      ),
    [order]
  );

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapContainerRef.current || points.length === 0) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    });
    mapInstanceRef.current = map;

    const tileUrl =
      mapStyle === 'google_streets'
        ? 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
        : mapStyle === 'google_hybrid'
        ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, { maxZoom: 20 }).addTo(map);

    const bounds: [number, number][] = [];

    points.forEach((pt, idx) => {
      bounds.push([pt.lat, pt.lng]);

      const borderColor =
        pt.kind === 'cliente' ? '#10B981' : pt.kind === 'tecnico' ? '#3B82F6' : '#F59E0B';
      const bgColor =
        pt.kind === 'cliente' ? '#064E3B' : pt.kind === 'tecnico' ? '#1E3A8A' : '#451A03';
      const subTextColor =
        pt.kind === 'cliente' ? '#6EE7B7' : pt.kind === 'tecnico' ? '#93C5FD' : '#FCD34D';
      const emoji = pt.kind === 'cliente' ? '🏠' : pt.kind === 'tecnico' ? '🚐' : '📦';

      const sameSpotCount = points
        .slice(0, idx)
        .filter((p) => Math.abs(p.lat - pt.lat) < 0.00025 && Math.abs(p.lng - pt.lng) < 0.00025).length;
      const offsetY = sameSpotCount * -42;

      const customIcon = L.divIcon({
        className: '!bg-transparent !border-0',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        html: `
          <div style="
            position: absolute;
            left: 0;
            top: 0;
            transform: translate(-50%, calc(-100% - 10px + ${offsetY}px));
            width: max-content;
            display: flex;
            align-items: center;
            gap: 6px;
            background: ${bgColor};
            color: #FFFFFF;
            padding: 5px 10px;
            border-radius: 9px;
            border: 1.5px solid ${borderColor};
            box-shadow: 0 6px 16px rgba(0,0,0,0.65);
            font-family: system-ui, -apple-system, sans-serif;
            pointer-events: auto;
          ">
            <span style="font-size: 14px; line-height: 1;">${emoji}</span>
            <div style="display: flex; flex-direction: column; line-height: 1.15;">
              <span style="font-weight: 800; font-size: 11px; color: #FFFFFF; white-space: nowrap;">${pt.label}</span>
              ${
                pt.kind === 'cto' && pt.detail
                  ? `<span style="font-weight: 600; font-size: 9.5px; color: ${subTextColor}; white-space: nowrap;">${pt.detail.replace('Código: ', '')}</span>`
                  : ''
              }
            </div>
            <div style="
              position: absolute;
              bottom: -5px;
              left: 50%;
              transform: translateX(-50%) rotate(45deg);
              width: 8px;
              height: 8px;
              background: ${bgColor};
              border-right: 1.5px solid ${borderColor};
              border-bottom: 1.5px solid ${borderColor};
            "></div>
          </div>
          <div style="
            position: absolute;
            left: -5px;
            top: -5px;
            width: 10px;
            height: 10px;
            border-radius: 9999px;
            background: ${borderColor};
            border: 2px solid #0B101B;
            box-shadow: 0 0 6px rgba(0,0,0,0.8);
          "></div>
        `,
      });

      const marker = L.marker([pt.lat, pt.lng], {
        icon: customIcon,
        zIndexOffset: pt.kind === 'cliente' ? 300 : pt.kind === 'tecnico' ? 200 : 100,
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;line-height:1.4;color:#111827;">
          <strong>${emoji} ${pt.label}</strong><br/>
          ${pt.detail ? `<span>${pt.detail}</span><br/>` : ''}
          <span style="color:#4B5563;font-size:11px;">${pt.lat}, ${pt.lng}</span><br/>
          <a href="https://www.google.com/maps?q=${pt.lat},${pt.lng}" target="_blank" rel="noreferrer" style="color:#FF6B00;font-weight:bold;text-decoration:none;">
            Abrir en Google Maps ↗
          </a>
        </div>
      `);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 17);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [55, 55], maxZoom: 18 });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [points, mapStyle]);

  return (
    <div className="bg-[#111827]/95 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <MapPin size={15} className="text-[#FF6B00]" />
            Mapa de Georreferencia (Cliente, Técnico y CTOs)
          </h4>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Ubicación espacial de cajas terminales ópticas (CTO), domicilio y técnico asignado
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-lg border border-gray-800 text-[10px]">
          <button
            onClick={() => setMapStyle('google_streets')}
            className={`px-2 py-1 rounded font-semibold transition ${
              mapStyle === 'google_streets' ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Google Calles
          </button>
          <button
            onClick={() => setMapStyle('google_hybrid')}
            className={`px-2 py-1 rounded font-semibold transition ${
              mapStyle === 'google_hybrid' ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Satélite
          </button>
          <button
            onClick={() => setMapStyle('dark')}
            className={`px-2 py-1 rounded font-semibold transition ${
              mapStyle === 'dark' ? 'bg-[#FF6B00] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Oscuro
          </button>
        </div>
      </div>

      {attributes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attributes.map((attr, idx) => (
            <div
              key={idx}
              className="px-2.5 py-1 rounded-lg bg-[#090D16] border border-gray-800 text-[11px] flex items-center gap-1.5"
            >
              <span className="text-gray-400 font-semibold">{attr.key}:</span>
              <span className="text-amber-300 font-bold">{attr.value}</span>
            </div>
          ))}
        </div>
      )}

      {points.length > 0 ? (
        <>
          <div
            ref={mapContainerRef}
            className="w-full h-72 rounded-xl overflow-hidden border border-gray-700/80 z-0"
          />

          <div className="grid grid-cols-3 gap-2 pt-1">
            {points.map((pt) => {
              const badgeColor =
                pt.kind === 'cliente'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : pt.kind === 'tecnico'
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                  : 'border-orange-500/40 bg-[#FF6B00]/10 text-amber-300';

              return (
                <a
                  key={pt.id}
                  href={`https://www.google.com/maps?q=${pt.lat},${pt.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`p-2 rounded-lg border ${badgeColor} hover:brightness-125 transition flex items-center justify-between text-[11px]`}
                >
                  <div className="truncate pr-1">
                    <div className="font-bold text-white flex items-center gap-1">
                      <span>{pt.kind === 'cliente' ? '🏠' : pt.kind === 'tecnico' ? '🚐' : '📦'}</span>
                      <span>{pt.label}</span>
                    </div>
                    <div className="text-[10px] opacity-80 truncate">{pt.detail}</div>
                  </div>
                  <ExternalLink size={12} className="shrink-0 opacity-75" />
                </a>
              );
            })}
          </div>
        </>
      ) : (
        <div className="py-8 text-center text-xs text-gray-500 bg-[#090D16]/60 rounded-xl border border-gray-800/60">
          Esta orden no registra coordenadas geográficas en Datos Técnicos ni en Georeferencia.
        </div>
      )}
    </div>
  );
}