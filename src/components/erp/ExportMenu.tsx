import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { Btn } from './Button';

/**
 * ExportMenu — the shared export control for every Books/list/report page, so
 * "download this" behaves identically everywhere.
 *
 * - **Export CSV** is always offered client-side via `downloadCsv` from the
 *   `columns` + `rows` the page already holds (no round-trip).
 * - When `serverExports` are supplied, each becomes an extra menu item that GETs
 *   a blob from the given API path (reusing the api.ts `responseType:'blob'`
 *   download pattern) — that is how server-rendered PDFs / server CSVs are pulled
 *   WITHOUT bundling any PDF library.
 * - Permission-aware: pass `canExport={false}` to hide the control entirely
 *   (hide, don't disable, a control the user can never use).
 */

export type ServerExport = {
  /** Menu label, e.g. "Export PDF" or "Server CSV". */
  label: string;
  /** API path returning a file blob, e.g. `/accounting/trial-balance`. */
  path: string;
  /** Query params (e.g. `{ ...range, format: 'pdf' }`). */
  params?: Record<string, unknown>;
  /** Force a filename; else derived from `filename` + the blob's type. */
  filename?: string;
};

export type ExportMenuProps<T> = {
  /** Base download filename (`.csv` appended if missing for the client export). */
  filename: string;
  /** Columns for the client CSV (label + key/format, `money` for ₹ minor units). */
  columns: CsvColumn<T>[];
  /** Rows the page already holds — the client CSV is built from these. */
  rows: T[];
  /** Optional server-rendered exports (PDF / server CSV) as extra menu items. */
  serverExports?: ServerExport[];
  /** Hide the whole control when the user can't export (permission-aware). Default true. */
  canExport?: boolean;
  /** Momentarily unavailable (e.g. data not loaded yet). */
  disabled?: boolean;
  className?: string;
};

/** Guess a file extension from a blob's MIME type for a derived download name. */
function extFor(blob: Blob): string {
  const t = blob.type || '';
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('sheet') || t.includes('excel')) return 'xlsx';
  return 'csv';
}

const MenuItem: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ onClick, disabled, icon, children }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700',
      'hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50',
    )}
  >
    {icon}
    <span className="truncate">{children}</span>
  </button>
);

export function ExportMenu<T>({
  filename, columns, rows, serverExports, canExport = true, disabled, className,
}: ExportMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!canExport) return null;

  const noRows = rows.length === 0;

  const exportClient = () => {
    downloadCsv(filename, columns, rows);
    setOpen(false);
  };

  const exportServer = async (exp: ServerExport) => {
    setBusyPath(exp.path);
    try {
      const res = await api.get(exp.path, { params: exp.params, responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
      const base = filename.replace(/\.csv$/i, '');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exp.filename ?? `${base}.${extFor(blob)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setBusyPath(null);
      setOpen(false);
    }
  };

  // Single-button form when there is nothing but the client CSV.
  if (!serverExports || serverExports.length === 0) {
    return (
      <Btn
        type="button"
        variant="outline"
        size="sm"
        className={className}
        disabled={disabled || noRows}
        onClick={exportClient}
      >
        <Download /> Export CSV
      </Btn>
    );
  }

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <Btn type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <Download /> Export
        <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
      </Btn>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[13rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <MenuItem disabled={noRows} onClick={exportClient} icon={<Download className="h-4 w-4" />}>
            Export CSV
          </MenuItem>
          {serverExports.map((exp) => (
            <MenuItem
              key={`${exp.path}::${exp.label}`}
              disabled={busyPath !== null}
              onClick={() => exportServer(exp)}
              icon={
                busyPath === exp.path
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />
              }
            >
              {exp.label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExportMenu;
