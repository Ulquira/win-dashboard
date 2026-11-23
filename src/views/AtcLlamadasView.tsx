import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UploadCloud,
  FileSpreadsheet,
  PhoneCall,
  Users,
  UserCheck,
  Headphones,
  CheckCircle2,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../config/api';

interface AtcLlamadasViewProps {
  startDate: string;
  endDate: string;
  globalSearch: string;
  ignoreDates: boolean;
  consultTrigger?: number;
  isAdmin?: boolean;
  onEnableHistory?: () => void;
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
  globalSearch,
  ignoreDates,
  consultTrigger = 0,
  isAdmin = false,
  onEnableHistory,
}: AtcLlamadasViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [page, setPage] = useState(1);
  const [readingFile, setReadingFile] = useState(false);
  const [stagedRows, setStagedRows] = useState<ParsedAtcRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const {
    data: atcData,
    isFetching: loading,
    refetch,
  } = useQuery<any>({
    queryKey: ['atcLlamadas', startDate, endDate, globalSearch, ignoreDates, page, consultTrigger],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        q: globalSearch,
        ignoreDates: ignoreDates ? 'true' : 'false',
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

    // Lotes de 100 filas (~40 KB) para no exceder jamás el límite de payload de Express/Nginx
    const BATCH_SIZE = 100;
    let totalInserted = 0;

    try {
      for (let i = 0; i < stagedRows.length; i += BATCH_SIZE) {
        const chunk = stagedRows.slice(i, i + BATCH_SIZE);
        const res = await apiFetch<{ ok: boolean; processed: number }>('/api/atc-llamadas/import', {
          method: 'POST',
          body: JSON.stringify({ rows: chunk }),
        });
        totalInserted += Number(res?.processed || 0);
        setProgressPct(Math.min(100, Math.round(((i + chunk.length) / stagedRows.length) * 100)));
      }

      setUploadResult(`${totalInserted.toLocaleString('es-PE')} registros guardados en atc_llamadas.`);
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

  const handleClearTable = async () => {
    if (!window.confirm('¿Vaciar todos los registros de atc_llamadas?')) return;
    try {
      await apiFetch('/api/atc-llamadas', { method: 'DELETE' });
      setUploadResult('Tabla atc_llamadas vaciada.');
      await refetch();
    } catch (err: any) {
      setParseError(err.message);
    }
  };

  const kpis = atcData?.kpis || {};
  const rows: any[] = atcData?.rows || [];
  const byMotivo: any[] = atcData?.byMotivo || [];
  const totalPages = Number(atcData?.totalPages || 1);
  const totalRecords = Number(atcData?.total || 0);
  const fmt = (n?: number) => Number(n || 0).toLocaleString('es-PE');

  return (
    <div className={`space-y-6 transition-opacity ${loading && !uploading ? 'opacity-75' : 'opacity-100'}`}>
      <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-50 text-[#FF5500]">
              <UploadCloud size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Importar Base ATC Llamadas</h3>
              <p className="text-[11px] text-slate-400">
                Formatos admitidos: .xlsx, .csv o .txt
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || readingFile}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] disabled:opacity-50 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              {readingFile ? <RefreshCw size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              <span>{readingFile ? 'Leyendo archivo...' : 'Seleccionar Archivo'}</span>
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
                  • <strong>{fmt(stagedRows.length)}</strong> filas detectadas
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
                      ? `Subiendo a BD (${progressPct}%)...`
                      : `Subir a Base de Datos (${fmt(stagedRows.length)})`}
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

            <div className="overflow-x-auto max-h-44 bg-white rounded-xl border border-slate-200">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-1.5 px-2.5 text-left">ID Reg</th>
                    <th className="py-1.5 px-2.5 text-left">Fecha / Hora</th>
                    <th className="py-1.5 px-2.5 text-left">Telf / DNI Cliente</th>
                    <th className="py-1.5 px-2.5 text-left">Asesor / Medio</th>
                    <th className="py-1.5 px-2.5 text-left">Tipo / Motivo</th>
                    <th className="py-1.5 px-2.5 text-left">Comentario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stagedRows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800">{r.id_reg || '-'}</td>
                      <td className="py-1.5 px-2.5 whitespace-nowrap">{r.fecha} {r.hora}</td>
                      <td className="py-1.5 px-2.5">{r.telf_cliente || '-'} • {r.dni_cliente || '-'}</td>
                      <td className="py-1.5 px-2.5 truncate max-w-[160px]">{r.nom_ape || r.dni_asesor || '-'} ({r.medio || '-'})</td>
                      <td className="py-1.5 px-2.5 truncate max-w-[160px]">{r.tipo} • {r.motivo}</td>
                      <td className="py-1.5 px-2.5 truncate max-w-[220px] text-slate-500">{r.comentario_llamada || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <div className="p-2 rounded-xl bg-orange-50 text-[#FF5500]"><PhoneCall size={16} /></div>
            <span>Llamadas en Rango</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3 tabular-nums">{fmt(kpis.total_llamadas)}</div>
          {kpis.min_fecha && (
            <div className="text-[10px] text-slate-400 mt-0.5">{kpis.min_fecha} al {kpis.max_fecha}</div>
          )}
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600"><Users size={16} /></div>
            <span>DNIs Únicos</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3 tabular-nums">{fmt(kpis.clientes_dni)}</div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><Headphones size={16} /></div>
            <span>Teléfonos Únicos</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3 tabular-nums">{fmt(kpis.clientes_telf)}</div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600"><UserCheck size={16} /></div>
            <span>Asesores Activos</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3 tabular-nums">{fmt(kpis.asesores_activos)}</div>
        </div>
      </div>

      {byMotivo.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byMotivo.map((m, idx) => (
            <span
              key={idx}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs"
            >
              {m.label}: <strong className="text-[#FF5500]">{fmt(m.total)}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-800">
            Registros en <code className="text-[#FF5500]">atc_llamadas</code> ({fmt(totalRecords)})
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

        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-xs min-w-[980px]">
            <thead className="sticky top-0 bg-white border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400">
              <tr>
                <th className="py-2 text-left">ID / ID Reg</th>
                <th className="py-2 text-left">Fecha / Hora</th>
                <th className="py-2 text-left">Telf / DNI Cliente</th>
                <th className="py-2 text-left">Asesor (DNI / Nombre)</th>
                <th className="py-2 text-left">Medio / Tipo</th>
                <th className="py-2 text-left">Motivo</th>
                <th className="py-2 text-left">Comentario Llamada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.length > 0 ? (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5">
                      <div className="font-extrabold text-[#FF5500]">#{r.id}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.id_reg || '-'}</div>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{r.fecha_fmt || '-'}</div>
                      <div className="text-[10px] text-slate-400">{r.hora || '-'}</div>
                    </td>
                    <td className="py-2.5">
                      <div className="font-bold text-slate-900">{r.telf_cliente || '-'}</div>
                      <div className="text-[10px] text-slate-500">DNI: {r.dni_cliente || '-'}</div>
                    </td>
                    <td className="py-2.5">
                      <div className="font-semibold text-slate-800 truncate max-w-[170px]">{r.nom_ape || '-'}</div>
                      <div className="text-[10px] text-slate-400">{r.dni_asesor || '-'}</div>
                    </td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                        {r.medio || '-'}
                      </span>
                      <div className="text-[11px] font-semibold text-slate-700 mt-1">{r.tipo || '-'}</div>
                    </td>
                    <td className="py-2.5 font-bold text-slate-800 max-w-[180px] truncate" title={r.motivo}>
                      {r.motivo || '-'}
                    </td>
                    <td className="py-2.5 text-slate-600 max-w-[280px] truncate" title={r.comentario_llamada}>
                      {r.comentario_llamada || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Sin registros en este rango. Pulsa "Todo el Histórico" arriba o importa un archivo.
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