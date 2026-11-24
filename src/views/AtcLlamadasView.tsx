import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UploadCloud,
  FileSpreadsheet,
  PhoneCall,
  CheckCircle2,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Download,
  Link2,
  Link2Off,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { apiFetch, API_BASE_URL, AUTH_TOKEN_KEY } from '../config/api';
import { RealOrder } from '../types/dashboard';

interface AtcLlamadasViewProps {
  startDate: string;
  endDate: string;
  service?: string;
  globalSearch: string;
  ignoreDates: boolean;
  consultTrigger?: number;
  isAdmin?: boolean;
  onEnableHistory?: () => void;
  onSelectOrder?: (order: RealOrder) => void;
}

interface ParsedAtcRow {
  id_origen?: string;
  id_reg: string;
  fecha: string;
  hora: string;
  telf_cliente: string;
  dni_cliente: string;
  dni_asesor: string;
  nom_ape: string;
  medio: string;
  tipo: string;
  motivo: string;
  comentario_llamada: string;
}

type MatchFilterType = 'TODOS' | 'INGRESO_SI' | 'INGRESO_NO' | 'SIN_ORDEN';

function normalizeHeaderKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatExcelDateIfSerial(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 25569 && serial < 70000) {
      const utcMs = (serial - 25569) * 86400 * 1000;
      return new Date(utcMs).toISOString().slice(0, 10);
    }
  }
  return s;
}

function formatExcelTimeIfDecimal(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s) && !s.includes(':')) {
    const num = Number(s);
    if (Number.isFinite(num) && num >= 0) {
      const frac = num >= 1 ? num - Math.floor(num) : num;
      const totalSec = Math.round(frac * 86400) % 86400;
      const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
  }
  return s;
}

function mapRawRecordToAtc(rec: Record<string, string>): ParsedAtcRow {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (rec[k] !== undefined && rec[k] !== '') return rec[k];
    }
    return '';
  };

  return {
    id_origen: get('id'),
    id_reg: get('id_reg', 'idreg', 'id_registro', 'codigo_registro'),
    fecha: formatExcelDateIfSerial(get('fecha', 'fecha_llamada', 'fec_llamada')),
    hora: formatExcelTimeIfDecimal(get('hora', 'hora_llamada')),
    telf_cliente: get('telf_cliente', 'telefono_cliente', 'telefono', 'celular', 'telf'),
    dni_cliente: get('dni_cliente', 'documento_cliente', 'num_doc', 'dni'),
    dni_asesor: get('dni_asesor', 'doc_asesor', 'asesor_dni'),
    nom_ape: get('nom_ape', 'nombre_apellido', 'nombres', 'asesor', 'cliente'),
    medio: get('medio', 'canal'),
    tipo: get('tipo', 'tipo_llamada'),
    motivo: get('motivo', 'motivo_llamada'),
    comentario_llamada: get(
      'comenatrio_llamada',
      'comentario_llamada',
      'comenatrio',
      'comentario',
      'observacion',
      'observaciones'
    ),
  };
}

function parseDelimitedText(text: string): ParsedAtcRow[] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const sep =
    tabCount >= semiCount && tabCount >= commaCount && tabCount > 0
      ? '\t'
      : semiCount >= commaCount && semiCount > 0
        ? ';'
        : ',';

  const matrix: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some((c) => c !== '')) matrix.push(row);
      row = [];
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur.trim());
    if (row.some((c) => c !== '')) matrix.push(row);
  }

  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normalizeHeaderKey);
  const out: ParsedAtcRow[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = line[idx] ?? '';
    });
    const mapped = mapRawRecordToAtc(obj);
    if (mapped.id_reg || mapped.telf_cliente || mapped.dni_cliente || mapped.comentario_llamada) {
      out.push(mapped);
    }
  }
  return out;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

function colRefToIndex(cellRef: string): number {
  const letters = cellRef.replace(/[0-9]/g, '').toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedAtcRow[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  let eocdPos = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error('El archivo no tiene estructura .xlsx válida.');

  const totalEntries = view.getUint16(eocdPos + 10, true);
  let cdOffset = view.getUint32(eocdPos + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, { method: number; compSize: number; localOffset: number }>();

  for (let e = 0; e < totalEntries; e++) {
    if (cdOffset + 46 > bytes.length || view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const fileName = decoder
      .decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen))
      .replace(/\\/g, '/');
    entries.set(fileName.toLowerCase(), { method, compSize, localOffset });
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  const readXmlEntry = async (lowerName: string): Promise<Document | null> => {
    const info = entries.get(lowerName.toLowerCase());
    if (!info) return null;
    const lNameLen = view.getUint16(info.localOffset + 26, true);
    const lExtraLen = view.getUint16(info.localOffset + 28, true);
    const dataStart = info.localOffset + 30 + lNameLen + lExtraLen;
    const slice = bytes.subarray(dataStart, dataStart + info.compSize);
    const rawBytes = info.method === 8 ? await inflateRawBytes(slice) : slice;
    const xmlStr = decoder.decode(rawBytes);
    return new DOMParser().parseFromString(xmlStr, 'application/xml');
  };

  const sharedStrings: string[] = [];
  const sstDoc = await readXmlEntry('xl/sharedstrings.xml');
  if (sstDoc) {
    const siNodes = sstDoc.getElementsByTagNameNS('*', 'si');
    for (let i = 0; i < siNodes.length; i++) {
      const tNodes = siNodes[i].getElementsByTagNameNS('*', 't');
      let val = '';
      for (let j = 0; j < tNodes.length; j++) {
        val += tNodes[j].textContent || '';
      }
      sharedStrings.push(val);
    }
  }

  const sheetKey =
    Array.from(entries.keys())
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] ||
    'xl/worksheets/sheet1.xml';

  const sheetDoc = await readXmlEntry(sheetKey);
  if (!sheetDoc) throw new Error('No se encontró ninguna hoja de cálculo dentro del .xlsx.');

  const rowNodes = sheetDoc.getElementsByTagNameNS('*', 'row');
  if (rowNodes.length < 2) return [];

  const extractRowCells = (rNode: Element): string[] => {
    const cells = rNode.getElementsByTagNameNS('*', 'c');
    const arr: string[] = [];
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const ref = cell.getAttribute('r') || '';
      const colIdx = ref ? colRefToIndex(ref) : c;
      const cellType = cell.getAttribute('t') || '';
      let val = '';

      if (cellType === 'inlineStr') {
        const tNodes = cell.getElementsByTagNameNS('*', 't');
        for (let k = 0; k < tNodes.length; k++) val += tNodes[k].textContent || '';
      } else {
        const vNode = cell.getElementsByTagNameNS('*', 'v')[0];
        const rawV = vNode?.textContent ?? '';
        if (cellType === 's') {
          val = sharedStrings[Number(rawV)] ?? '';
        } else {
          val = rawV;
        }
      }
      arr[colIdx] = val.trim();
    }
    return arr;
  };

  let headerRowIdx = 0;
  let headers: string[] = [];
  for (let r = 0; r < Math.min(5, rowNodes.length); r++) {
    const candidate = extractRowCells(rowNodes[r]).map(normalizeHeaderKey);
    if (
      candidate.includes('id_reg') ||
      candidate.includes('telf_cliente') ||
      candidate.includes('dni_cliente')
    ) {
      headerRowIdx = r;
      headers = candidate;
      break;
    }
  }
  if (headers.length === 0) {
    headers = extractRowCells(rowNodes[0]).map(normalizeHeaderKey);
  }

  const out: ParsedAtcRow[] = [];
  for (let i = headerRowIdx + 1; i < rowNodes.length; i++) {
    const vals = extractRowCells(rowNodes[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) rec[h] = vals[idx] ?? '';
    });
    const mapped = mapRawRecordToAtc(rec);
    if (mapped.id_reg || mapped.telf_cliente || mapped.dni_cliente || mapped.comentario_llamada) {
      out.push(mapped);
    }
  }

  return out;
}

export function AtcLlamadasView({
  startDate,
  endDate,
  service = 'Todos los servicios',
  globalSearch,
  ignoreDates,
  consultTrigger = 0,
  isAdmin = false,
  onEnableHistory,
  onSelectOrder,
}: AtcLlamadasViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [page, setPage] = useState(1);
  const [matchFilter, setMatchFilter] = useState<MatchFilterType>('TODOS');
  const [cohorteFilter, setCohorteFilter] = useState<string>('TODOS');
  const [estadoOtFilter, setEstadoOtFilter] = useState<string>('TODOS');

  const [readingFile, setReadingFile] = useState(false);
  const [stagedRows, setStagedRows] = useState<ParsedAtcRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [openingOrderId, setOpeningOrderId] = useState<number | null>(null);

  const {
    data: atcData,
    isFetching: loading,
    refetch,
  } = useQuery<any>({
    queryKey: [
      'atcLlamadas360',
      startDate,
      endDate,
      service,
      globalSearch,
      ignoreDates,
      matchFilter,
      cohorteFilter,
      estadoOtFilter,
      page,
      consultTrigger,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
        matchFilter,
        cohorte: cohorteFilter,
        estadoOt: estadoOtFilter,
        page: String(page),
        pageSize: '50',
      });
      return apiFetch(`/api/atc-llamadas?${params.toString()}`, { signal });
    },
    placeholderData: (prev: any) => prev,
  });

  const handleFileChange = async (file?: File | null) => {
    if (!file) return;
    setReadingFile(true);
    setParseError(null);
    setUploadResult(null);
    setFileName(file.name);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let parsed: ParsedAtcRow[] = [];
      if (ext === 'xlsx') {
        const buf = await file.arrayBuffer();
        parsed = await parseXlsxBuffer(buf);
      } else if (ext === 'xls') {
        throw new Error('El archivo es .xls antiguo (97-2003). Guárdalo como .xlsx o .csv en Excel.');
      } else {
        const txt = await file.text();
        parsed = parseDelimitedText(txt);
      }

      if (parsed.length === 0) {
        setParseError(
          'No se detectaron filas válidas. Verifica los encabezados (id_reg, fecha, hora, telf_cliente, dni_cliente...).'
        );
        setStagedRows([]);
        return;
      }
      setStagedRows(parsed);
    } catch (err: any) {
      setParseError(`Error leyendo "${file.name}": ${err?.message || String(err)}`);
      setStagedRows([]);
    } finally {
      setReadingFile(false);
    }
  };

  const handleUploadBatches = async () => {
    if (stagedRows.length === 0 || uploading) return;
    setUploading(true);
    setProgressPct(0);
    setParseError(null);

    const BATCH_SIZE = 100;
    let totalInserted = 0;
    let finalStats: any = null;

    try {
      for (let i = 0; i < stagedRows.length; i += BATCH_SIZE) {
        const chunk = stagedRows.slice(i, i + BATCH_SIZE);
        const isLastBatch = i + BATCH_SIZE >= stagedRows.length;
        const res = await apiFetch<{ ok: boolean; processed: number; syncStats?: any }>(
          '/api/atc-llamadas/import',
          {
            method: 'POST',
            body: JSON.stringify({ rows: chunk, isLastBatch }),
          }
        );
        totalInserted += Number(res?.processed || 0);
        if (res?.syncStats) finalStats = res.syncStats;
        setProgressPct(Math.min(100, Math.round(((i + chunk.length) / stagedRows.length) * 100)));
      }

      const detailMsg = finalStats
        ? ` (${finalStats.matchedInWindow} cruzadas en ventana, ${finalStats.matchedOutWindow} fuera de ventana, ${finalStats.unmatched} sin orden).`
        : '.';
      setUploadResult(
        `${totalInserted.toLocaleString('es-PE')} llamadas importadas y materializadas en mat_atc_llamadas_360${detailMsg}`
      );
      setStagedRows([]);
      if (onEnableHistory && !ignoreDates) {
        onEnableHistory();
      }
      setPage(1);
      await refetch();
    } catch (err: any) {
      setParseError(`Error al subir al servidor: ${err?.message || String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setParseError(null);
    try {
      const res = await apiFetch<any>('/api/atc-llamadas/sync', { method: 'POST' });
      setUploadResult(
        `Vista mat_atc_llamadas_360 actualizada: ${res.matchedInWindow} en ventana, ${res.matchedOutWindow} fuera de ventana y ${res.unmatched} sin orden.`
      );
      await refetch();
    } catch (err: any) {
      setParseError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleExport360 = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams({
        startDate,
        endDate,
        service,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
        matchFilter,
        cohorte: cohorteFilter,
        estadoOt: estadoOtFilter,
      });
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const res = await fetch(`${API_BASE_URL}/api/atc-llamadas/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('No se pudo exportar Excel');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Auditoria_ATC_360_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setParseError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleOpenOrderDrawer = async (ordenId?: number | null) => {
    if (!ordenId || !onSelectOrder) return;
    setOpeningOrderId(ordenId);
    try {
      const res = await apiFetch<any>(
        `/api/orders/search?orden=${ordenId}&ignoreDates=true&page=1&pageSize=10`
      );
      const found = (res?.orders || []).find((o: any) => Number(o.orden_id) === Number(ordenId));
      if (found) onSelectOrder(found);
    } catch {
      // Ignorar error puntual
    } finally {
      setOpeningOrderId(null);
    }
  };

  const handleClearTable = async () => {
    if (!window.confirm('¿Vaciar todos los registros de atc_llamadas y mat_atc_llamadas_360?')) return;
    try {
      await apiFetch('/api/atc-llamadas', { method: 'DELETE' });
      setUploadResult('Tablas vaciadas correctamente.');
      await refetch();
    } catch (err: any) {
      setParseError(err.message);
    }
  };

  const kpis = atcData?.kpis || {};
  const rows: any[] = atcData?.rows || [];
  const byEstadoOt: any[] = atcData?.byEstadoOt || [];
  const totalPages = Number(atcData?.totalPages || 1);
  const totalRecords = Number(atcData?.total || 0);
  const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');

  return (
    <div className={`space-y-6 transition-opacity ${loading && !uploading ? 'opacity-75' : 'opacity-100'}`}>
      {/* 1. CABECERA DE IMPORTACIÓN Y RECONSTRUCCIÓN DE MAT_ATC_LLAMADAS_360 */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-50 text-[#FF5500]">
              <UploadCloud size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Vista Materializada <code className="text-[#FF5500]">mat_atc_llamadas_360</code>
              </h3>
              <p className="text-[11px] text-slate-400">
                Cruza cada llamada con Cliente, Ticket, N° Orden, Estado de Solicitud, WhatsApp y Tracking para auditar datos exactos
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                handleFileChange(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing || uploading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              title="Volver a cruzar atc_llamadas contra las órdenes más recientes de mat_funnel_casos_360"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin text-[#FF5500]' : ''} />
              <span>{syncing ? 'Cruzando...' : 'Sincronizar Cruce 360'}</span>
            </button>

            <button
              type="button"
              onClick={handleExport360}
              disabled={exporting || totalRecords === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs transition cursor-pointer"
            >
              <Download size={13} />
              <span>{exporting ? 'Exportando...' : 'Exportar 360 (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || readingFile}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] disabled:opacity-50 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              {readingFile ? <RefreshCw size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              <span>{readingFile ? 'Leyendo...' : 'Importar Excel / CSV'}</span>
            </button>

            {isAdmin && totalRecords > 0 && (
              <button
                type="button"
                onClick={handleClearTable}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Vaciar</span>
              </button>
            )}
          </div>
        </div>

        {parseError && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl text-xs font-semibold">
            <AlertCircle size={14} className="shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {uploadResult && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs font-bold">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{uploadResult}</span>
          </div>
        )}

        {stagedRows.length > 0 && (
          <div className="border border-orange-200 bg-[#FFF0E5]/40 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-extrabold text-slate-900">{fileName}</span>{' '}
                <span className="text-slate-500">
                  • <strong>{fmt(stagedRows.length)}</strong> filas listas para subir y cruzar
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setStagedRows([])}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleUploadBatches}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  {uploading ? <RefreshCw size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                  <span>
                    {uploading
                      ? `Subiendo y cruzando (${progressPct}%)...`
                      : `Subir y Materializar (${fmt(stagedRows.length)})`}
                  </span>
                </button>
              </div>
            </div>

            {uploading && (
              <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-orange-200">
                <div
                  className="h-full bg-[#FF5500] transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. 4 TARJETAS DE CRUCE (SOLO VISITAS TÉCNICAS, GARANTÍA Y REITERADA) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => {
            setMatchFilter('TODOS');
            setPage(1);
          }}
          className={`text-left bg-white border rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition cursor-pointer ${
            matchFilter === 'TODOS' ? 'border-[#FF5500] ring-2 ring-orange-100' : 'border-slate-100'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Total Llamadas Evaluadas</span>
            <PhoneCall size={16} className="text-[#FF5500]" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 tabular-nums">
            {fmt(kpis.total_llamadas)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {fmt(kpis.cruzadas_en_ventana)} cruzadas con ticket ({fmt(kpis.ordenes_unicas)} OTs)
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMatchFilter('INGRESO_SI');
            setPage(1);
          }}
          className={`text-left bg-white border rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition cursor-pointer ${
            matchFilter === 'INGRESO_SI'
              ? 'border-emerald-500 ring-2 ring-emerald-100'
              : 'border-slate-100'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-700 font-bold">
            <span>Con Ticket • SÍ Ingresó al Link</span>
            <Link2 size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2 tabular-nums">
            {fmt(kpis.llamadas_con_tracking)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Llamaron aun habiendo abierto WIN en Ruta
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMatchFilter('INGRESO_NO');
            setPage(1);
          }}
          className={`text-left bg-white border rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition cursor-pointer ${
            matchFilter === 'INGRESO_NO'
              ? 'border-amber-500 ring-2 ring-amber-100'
              : 'border-slate-100'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-700 font-bold">
            <span>Con Ticket • NO Ingresó al Link</span>
            <Clock size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 mt-2 tabular-nums">
            {fmt(kpis.llamadas_sin_tracking)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Llamaron sin haber ingresado al tracking web
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMatchFilter('SIN_ORDEN');
            setPage(1);
          }}
          className={`text-left bg-white border rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] transition cursor-pointer ${
            matchFilter === 'SIN_ORDEN' ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-100'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-700 font-bold">
            <span>Sin Ticket VT / Gar. / Reit.</span>
            <Link2Off size={16} className="text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 mt-2 tabular-nums">
            {fmt(kpis.sin_orden)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Sin orden de visita técnica asociada (instalaciones excluidas)
          </div>
        </button>
      </div>

      {/* 3. FILTROS RÁPIDOS DE AUDITORÍA (ESTADO DE LA SOLICITUD Y COHORTE) */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-500">Cohorte:</span>
          {[
            { id: 'TODOS', label: 'Todas' },
            { id: 'INGRESO_TRACKING', label: 'Ingresó Tracking' },
            { id: 'WSP_SIN_INGRESO', label: 'Con WSP sin Ingreso' },
            { id: 'SIN_WSP', label: 'Sin WSP' },
            { id: 'SIN_ORDEN', label: 'Sin Orden' },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCohorteFilter(c.id);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                cohorteFilter === c.id
                  ? 'bg-[#FF5500] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500">Estado Solicitud (OT):</span>
          <select
            value={estadoOtFilter}
            onChange={(e) => {
              setEstadoOtFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#FF5500]"
          >
            <option value="TODOS">Todos los estados</option>
            {byEstadoOt
              .filter((s) => s.estado_ot && s.estado_ot !== 'SIN ORDEN ASOCIADA')
              .map((s) => (
                <option key={s.estado_ot} value={s.estado_ot}>
                  {s.estado_ot} ({s.total})
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* 4. SÁBANA DE AUDITORÍA FILA POR FILA */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-800">
            Detalle Cruzado <code className="text-[#FF5500]">mat_atc_llamadas_360</code> ({fmt(totalRecords)} registros)
          </span>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-semibold text-slate-600 tabular-nums">
              Pág. {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[540px]">
          <table className="w-full text-xs min-w-[1250px]">
            <thead className="sticky top-0 bg-white border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400 z-10">
              <tr>
                <th className="py-2.5 px-2 text-left">Llamada ATC</th>
                <th className="py-2.5 px-2 text-left">Cruce / Dif.</th>
                <th className="py-2.5 px-2 text-left">Orden / Ticket / Fecha OT</th>
                <th className="py-2.5 px-2 text-left">Cliente / DNI / Telf</th>
                <th className="py-2.5 px-2 text-left">Servicio / Partner</th>
                <th className="py-2.5 px-2 text-center">Estado Solicitud</th>
                <th className="py-2.5 px-2 text-center">WSP / Tracking</th>
                <th className="py-2.5 px-2 text-left">Motivo ATC</th>
                <th className="py-2.5 px-2 text-left">Comentario Llamada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.length > 0 ? (
                rows.map((r) => {
                  const matchBadge =
                    r.tiene_orden === 1
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <div className="font-extrabold text-slate-900">{r.fecha_llamada_fmt || '-'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {r.hora_fmt || '-'} • #{r.id_reg || r.id}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${matchBadge}`}>
                          {r.tiene_orden === 1 ? r.tipo_match : 'SIN_TICKET'}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 whitespace-nowrap">
                        {r.orden_id ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => handleOpenOrderDrawer(r.orden_id)}
                              className="inline-flex items-center gap-1 font-black text-[#FF5500] hover:underline cursor-pointer"
                              title="Abrir ficha completa de la Orden"
                            >
                              <span>
                                {openingOrderId === r.orden_id ? 'Cargando...' : `#${r.orden_id}`}
                              </span>
                              <ExternalLink size={11} />
                            </button>
                            <div className="text-[10px] text-slate-600 font-bold">{r.ticket || '-'}</div>
                            <div className="text-[10px] text-slate-400">Sol: {r.fecha_sol_fmt || '-'}</div>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-semibold">Sin OT</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2">
                        <div className="font-bold text-slate-900 truncate max-w-[185px]" title={r.cliente || ''}>
                          {r.cliente || <span className="text-rose-500 italic">No identificado en OTs</span>}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          DNI: <strong>{r.dni_cliente || '-'}</strong> • Telf: <strong>{r.telf_cliente || '-'}</strong>
                        </div>
                      </td>

                      <td className="py-2.5 px-2">
                        {r.tipo_operacion ? (
                          <>
                            <span className="px-2 py-0.5 rounded-md bg-orange-50 text-[#FF5500] font-extrabold text-[10px]">
                              {r.tipo_operacion}
                            </span>
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px] mt-0.5">
                              {r.partner || '-'}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        {r.estado_ot ? (
                          <div>
                            <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[10px]">
                              {r.estado_ot}
                            </span>
                            {r.ops_motivo_fin && (
                              <div className="text-[9.5px] text-slate-400 truncate max-w-[130px] mx-auto mt-0.5" title={r.ops_motivo_fin}>
                                {r.ops_motivo_fin}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        {r.orden_id ? (
                          <div className="space-y-0.5">
                            <div className="text-[10px] font-bold text-slate-700">
                              WSP: {r.se_envio_wsp === 'SI' ? `SÍ (${r.estado_wsp})` : 'NO'}
                            </div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                r.ingreso_tracking === 'SI'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              Trk: {r.ingreso_tracking === 'SI' ? 'SÍ INGRESÓ' : 'NO INGRESÓ'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 max-w-[190px]">
                        <div className="text-[10px] font-bold text-slate-400">{r.tipo_llamada || '-'}</div>
                        <div className="font-bold text-slate-800 truncate" title={r.motivo_llamada}>
                          {r.motivo_llamada || '-'}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-slate-600 max-w-[260px] truncate" title={r.comentario_llamada}>
                        {r.comentario_llamada || '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No hay registros para estos filtros. Pulsa "Todo el Histórico" arriba o "Sincronizar Cruce 360".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}