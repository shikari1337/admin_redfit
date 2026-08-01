import React from 'react';
import { X, Upload, FileText, AlertTriangle, CheckCircle2, Loader2, Download } from 'lucide-react';
import { reviewsAPI } from '@/services/api';
import { Btn } from '@/components/erp';
import { StarRating } from './StarRating';
import { cn } from '@/lib/utils';

/**
 * CSV import with a real preview.
 *
 * The old flow read the file, then fired one POST per row from the browser,
 * matching each SKU against a client-side product list that had already been
 * truncated by pagination — so most rows failed and the only feedback was an
 * `alert()` with two numbers. Here the file is parsed and validated locally,
 * shown row-by-row, then sent as ONE request; the server resolves every SKU in a
 * single query and returns per-row outcomes.
 */

const TEMPLATE_HEADERS = [
  'sku', 'customer_name', 'customer_email', 'rating', 'title', 'review',
  'images', 'video', 'status', 'verified',
];

const HEADER_ALIASES: Record<string, string> = {
  productsku: 'sku', product_sku: 'sku', sku: 'sku',
  name: 'customer_name', customername: 'customer_name', customer_name: 'customer_name',
  email: 'customer_email', customeremail: 'customer_email', customer_email: 'customer_email',
  rating: 'rating', stars: 'rating',
  title: 'title', headline: 'title',
  review: 'review', reviewtext: 'review', comment: 'review', body: 'review',
  images: 'images', reviewimages: 'images', review_images: 'images', photos: 'images',
  video: 'video', videos: 'video', videourl: 'video',
  status: 'status', approved: 'status',
  verified: 'verified', isverified: 'verified',
  link: 'link', description: 'description',
  customerimage: 'customer_image', customer_image: 'customer_image',
};

/** RFC-4180-ish parser: handles quoted fields, embedded commas and "" escapes. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

interface ParsedRow {
  line: number;
  data: Record<string, string>;
  errors: string[];
}

export const ReviewImportModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}> = ({ open, onClose, onImported }) => {
  const [fileName, setFileName] = React.useState('');
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [unknownHeaders, setUnknownHeaders] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ imported: number; failed: number; errors: Array<{ row: number; reason: string }> } | null>(null);

  const reset = () => { setFileName(''); setRows([]); setResult(null); setUnknownHeaders([]); };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    const table = parseCsv(await file.text());
    if (table.length < 2) {
      setRows([{ line: 0, data: {}, errors: ['The file needs a header row and at least one data row.'] }]);
      return;
    }

    const rawHeaders = table[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
    const mapped = rawHeaders.map((h) => HEADER_ALIASES[h] || HEADER_ALIASES[h.replace(/s$/, '')] || null);
    setUnknownHeaders(rawHeaders.filter((h, i) => !mapped[i] && h));

    const parsed: ParsedRow[] = table.slice(1).map((cells, idx) => {
      const data: Record<string, string> = {};
      mapped.forEach((key, i) => { if (key) data[key] = (cells[i] ?? '').trim(); });

      const errors: string[] = [];
      if (!data.sku) errors.push('Missing SKU');
      const rating = Number(data.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push(`Rating "${data.rating || ''}" must be 1–5`);
      if (!data.review || data.review.length < 2) errors.push('Review text is empty');

      // Normalise the loose "approved" spellings people actually put in a sheet.
      if (data.status) {
        const s = data.status.toLowerCase();
        data.status = ['true', '1', 'yes', 'approved'].includes(s) ? 'approved'
          : ['false', '0', 'no', 'pending'].includes(s) ? 'pending'
          : ['pending', 'approved', 'rejected', 'spam', 'hidden'].includes(s) ? s : 'approved';
      }
      return { line: idx + 2, data, errors };
    });

    setRows(parsed);
  };

  const valid = rows.filter((r) => !r.errors.length);

  const doImport = async () => {
    setBusy(true);
    try {
      setResult(await reviewsAPI.import(valid.map((r) => r.data)));
      onImported();
    } catch (e: any) {
      setResult({ imported: 0, failed: valid.length, errors: [{ row: 0, reason: e?.response?.data?.message || 'Import failed' }] });
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const csv = [
      TEMPLATE_HEADERS.join(','),
      '641536,Priya S,priya@example.com,5,Works well,"Helped my seasonal allergies within a week.",,,approved,true',
      '641537,Anil K,,4,Good value,"Packaging could be better but the product is genuine.",,,approved,false',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'reviews-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import reviews</h2>
            <p className="text-sm text-gray-500">
              Bring reviews over from another platform. Rows are matched to products by SKU.
            </p>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {result ? (
            <div className="space-y-4 py-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  Imported {result.imported} review{result.imported === 1 ? '' : 's'}
                </p>
                {result.failed > 0 && (
                  <p className="text-sm text-gray-500">{result.failed} row(s) could not be imported.</p>
                )}
              </div>
              {result.errors?.length > 0 && (
                <div className="mx-auto max-h-52 max-w-lg overflow-y-auto rounded-lg border border-gray-200 text-left">
                  {result.errors.map((e, i) => (
                    <p key={i} className="border-b border-gray-100 px-3 py-1.5 text-xs text-gray-600 last:border-0">
                      {e.row ? `Row ${e.row}: ` : ''}{e.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : !rows.length ? (
            <div className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-14 transition hover:border-indigo-400 hover:bg-indigo-50/40">
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Choose a CSV file</span>
                <span className="text-xs text-gray-500">or drag it here</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>

              <div className="rounded-lg bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">Expected columns</p>
                  <button onClick={downloadTemplate} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                    <Download className="h-3.5 w-3.5" /> Download template
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_HEADERS.map((h) => (
                    <code key={h} className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200">{h}</code>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Only <code className="text-gray-700">sku</code>, <code className="text-gray-700">rating</code> and{' '}
                  <code className="text-gray-700">review</code> are required. Put several image URLs in one cell separated
                  by <code className="text-gray-700">|</code>. Common header spellings (Product SKU, Name, Email…) are
                  recognised automatically.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-700">{fileName}</span>
                <span className="text-emerald-600">{valid.length} ready</span>
                {rows.length - valid.length > 0 && (
                  <span className="text-red-600">{rows.length - valid.length} with problems</span>
                )}
                <button onClick={reset} className="ml-auto text-xs text-gray-500 underline">Choose another file</button>
              </div>

              {unknownHeaders.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Ignored unrecognised column{unknownHeaders.length > 1 ? 's' : ''}: {unknownHeaders.join(', ')}
                </p>
              )}

              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Reviewer</th>
                      <th className="px-3 py-2">Rating</th>
                      <th className="px-3 py-2">Review</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 100).map((r) => (
                      <tr key={r.line} className={cn(r.errors.length && 'bg-red-50/60')}>
                        <td className="px-3 py-2 text-xs text-gray-400">{r.line}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.data.sku || '—'}</td>
                        <td className="max-w-[9rem] truncate px-3 py-2">{r.data.customer_name || 'Anonymous'}</td>
                        <td className="px-3 py-2">
                          {Number(r.data.rating) >= 1 && Number(r.data.rating) <= 5
                            ? <StarRating value={Number(r.data.rating)} size={12} />
                            : <span className="text-xs text-red-600">{r.data.rating || '—'}</span>}
                        </td>
                        <td className="max-w-xs px-3 py-2">
                          <span className="block truncate text-gray-600">{r.data.review || '—'}</span>
                          {r.errors.length > 0 && (
                            <span className="block text-xs text-red-600">{r.errors.join(' · ')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs capitalize text-gray-600">{r.data.status || 'approved'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 100 && (
                <p className="text-center text-xs text-gray-500">Showing the first 100 of {rows.length} rows.</p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          {result ? (
            <Btn onClick={() => { reset(); onClose(); }}>Done</Btn>
          ) : (
            <>
              <Btn variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Btn>
              <Btn onClick={doImport} disabled={!valid.length || busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {valid.length || ''} review{valid.length === 1 ? '' : 's'}
              </Btn>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

export default ReviewImportModal;
