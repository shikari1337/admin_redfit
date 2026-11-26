import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, FileDown } from 'lucide-react';
import { shipmentsAPI, errorText } from '../../services/api';
import { storeKeyNow } from '@/lib/v2/tenant';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  LABEL_SIZES, LABEL_SIZE_KEYS, labelsHtml, printHtml, readLabelData,
  type LabelData, type LabelMissing, type LabelSizeKey,
} from '@/lib/shippingLabels';

/** What the window remembers, per store, in this browser (as the lists remember their columns: ListKit useColumnChoice). */
interface Prefs {
  kind: 'growcord' | 'courier';
  size: LabelSizeKey;
  courierSize: '4R' | 'A4';
  items: boolean;
  invoiceValue: boolean;
  logo: boolean;
}
const DEFAULTS: Prefs = { kind: 'growcord', size: '4x6', courierSize: '4R', items: true, invoiceValue: true, logo: true };
const prefKey = () => `labels.print.${storeKeyNow() || 'store'}`;

function readPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(prefKey()) || '{}');
    const p = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) } as Prefs;
    if (!LABEL_SIZE_KEYS.includes(p.size)) p.size = DEFAULTS.size;
    if (p.kind !== 'growcord' && p.kind !== 'courier') p.kind = DEFAULTS.kind;
    if (p.courierSize !== '4R' && p.courierSize !== 'A4') p.courierSize = DEFAULTS.courierSize;
    return p;
  } catch { return DEFAULTS; }
}
function writePrefs(p: Prefs): void {
  try { localStorage.setItem(prefKey(), JSON.stringify(p)); } catch { /* this visit only */ }
}

/** A route the server does not serve yet. */
const notServed = (e: any) => [404, 405, 501].includes(Number(e?.response?.status));

interface Props {
  open: boolean;
  /** The shipments to print. */
  shipmentIds: string[];
  /** Shipment numbers by id, to name a label that cannot be made. */
  names?: Record<string, string>;
  onClose: () => void;
}

/**
 * Print labels (owner 26 Nov 2026): Growcord's own label (the default) at 4 x 6 inch thermal, 4 x 4 inch, A6, or A4
 * sheets of 2, 4, 6, 8 or 16, with or without product names, invoice value and the store logo; or the courier's own
 * label, the download the board always had. The choice is kept for the store. A shipment with no label is listed
 * with the reason.
 */
const PrintLabelsDialog: React.FC<Props> = ({ open, shipmentIds, names, onClose }) => {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const set = (patch: Partial<Prefs>) => setPrefs((p) => { const next = { ...p, ...patch }; writePrefs(next); return next; });
  const [data, setData] = useState<{ labels: LabelData[]; missing: LabelMissing[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [courierNote, setCourierNote] = useState<string | null>(null);
  const idsKey = shipmentIds.join(',');

  useEffect(() => { if (open) { setPrefs(readPrefs()); setCourierNote(null); } }, [open]);

  // Growcord's label: the facts of these shipments, read when the window shows them.
  useEffect(() => {
    if (!open || prefs.kind !== 'growcord' || !shipmentIds.length) return;
    let live = true;
    setLoading(true); setError(null); setData(null);
    readLabelData(shipmentIds)
      .then((d) => { if (live) setData(d); })
      .catch((e) => {
        if (!live) return;
        setError(notServed(e)
          ? 'Growcord labels are not available on this server yet. Use the courier\'s label for now.'
          : errorText(e, 'The label details could not be read.'));
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefs.kind, idsKey]);

  const options = { items: prefs.items, invoiceValue: prefs.invoiceValue, logo: prefs.logo };
  const spec = LABEL_SIZES[prefs.size];
  const previewZoom = spec.pageW > 150 ? 0.42 : 0.85;
  const preview = useMemo(
    () => (data?.labels.length ? labelsHtml(data.labels.slice(0, spec.cols * spec.rows), prefs.size, options, previewZoom) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, prefs.size, prefs.items, prefs.invoiceValue, prefs.logo],
  );
  const sheets = data?.labels.length ? Math.ceil(data.labels.length / (spec.cols * spec.rows)) : 0;

  const printGrowcord = () => {
    if (!data?.labels.length) return;
    printHtml(labelsHtml(data.labels, prefs.size, options));
  };

  /** The courier's own label: the download the board always had (one PDF per courier group). */
  const downloadCourier = async () => {
    setBusy(true); setCourierNote(null);
    try {
      if (shipmentIds.length === 1) {
        await shipmentsAPI.downloadLabel(shipmentIds[0], prefs.courierSize);
        setCourierNote('The courier\'s label is downloaded.');
      } else {
        const r = await shipmentsAPI.downloadDocumentsBulk('labels', shipmentIds, prefs.courierSize);
        const lines: string[] = [];
        if (r.documents.length) {
          lines.push(`${r.documents.length} label file(s) for ${shipmentIds.length - r.failed.length} shipment(s): `
            + r.documents.map((d) => `${d.filename}${d.courier ? `, ${d.courier}` : ''} (${d.shipmentNumbers.length})`).join('; '));
        }
        if (r.failed.length) lines.push(`${r.failed.length} not included: ${r.failed.map((f) => `${f.shipmentNumber || f.shipmentId}: ${f.message}`).join('; ')}`);
        setCourierNote(lines.join(' ') || 'No label files came back.');
      }
    } catch (e) {
      setCourierNote(errorText(e, 'The courier\'s label could not be downloaded.'));
    } finally {
      setBusy(false);
    }
  };

  const radio = 'flex items-start gap-2 rounded-md border p-2.5 text-sm cursor-pointer';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print labels</DialogTitle>
          <DialogDescription>{shipmentIds.length} shipment{shipmentIds.length === 1 ? '' : 's'}. Your choice is kept for this store.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${radio} ${prefs.kind === 'growcord' ? 'border-blue-600 bg-blue-50' : ''}`}>
            <input type="radio" name="label-kind" checked={prefs.kind === 'growcord'} onChange={() => set({ kind: 'growcord' })} className="mt-0.5" />
            <span><span className="font-medium">Growcord label</span><span className="block text-xs text-muted-foreground">Your own label with barcodes, any size, printed from this window.</span></span>
          </label>
          <label className={`${radio} ${prefs.kind === 'courier' ? 'border-blue-600 bg-blue-50' : ''}`}>
            <input type="radio" name="label-kind" checked={prefs.kind === 'courier'} onChange={() => set({ kind: 'courier' })} className="mt-0.5" />
            <span><span className="font-medium">Courier's label</span><span className="block text-xs text-muted-foreground">The PDF the courier makes, downloaded as before.</span></span>
          </label>
        </div>

        {prefs.kind === 'growcord' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Size</span>
                <select className="h-9 rounded-md border px-2" value={prefs.size} onChange={(e) => set({ size: e.target.value as LabelSizeKey })}>
                  {LABEL_SIZE_KEYS.map((k) => <option key={k} value={k}>{LABEL_SIZES[k].label}</option>)}
                </select>
              </label>
              {([['items', 'Product names'], ['invoiceValue', 'Invoice value'], ['logo', 'Store logo or name']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={prefs[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<Prefs>)} />
                  {l}
                </label>
              ))}
            </div>
            {spec.layout === 'compact' && (
              <p className="text-xs text-muted-foreground">Compact labels carry the AWB barcode, courier, payment, the delivery name and pincode and the order; no items or full return address.</p>
            )}
            {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading the label details...</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {data && data.missing.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
                <p className="font-medium">{data.missing.length} without a label</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {data.missing.map((m) => <li key={m.shipment_id}>{names?.[m.shipment_id] || m.shipment_id}: {m.reason || 'no reason given'}</li>)}
                </ul>
              </div>
            )}
            {data && data.labels.length === 0 && !error && <p className="text-sm text-muted-foreground">No label can be made for these shipments.</p>}
            {preview && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Preview of the first {spec.cols * spec.rows === 1 ? 'label' : 'sheet'}. {data?.labels.length} label{data?.labels.length === 1 ? '' : 's'} on {sheets} {spec.cols * spec.rows === 1 ? 'page' : 'sheet'}{sheets === 1 ? '' : 's'}.
                  {' '}Print at 100% scale with no margins.
                </p>
                <iframe title="Label preview" srcDoc={preview} className="h-[420px] w-full rounded-md border bg-gray-100" />
              </div>
            )}
          </div>
        )}

        {prefs.kind === 'courier' && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Size</span>
              <select className="h-9 rounded-md border px-2" value={prefs.courierSize} onChange={(e) => set({ courierSize: e.target.value as '4R' | 'A4' })}>
                <option value="4R">4R (thermal)</option>
                <option value="A4">A4</option>
              </select>
            </label>
            {courierNote && <p className="text-sm text-muted-foreground">{courierNote}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {prefs.kind === 'growcord' ? (
            <Button onClick={printGrowcord} disabled={!data?.labels.length}><Printer className="mr-2 h-4 w-4" /> Print {data?.labels.length || ''}</Button>
          ) : (
            <Button onClick={downloadCourier} disabled={busy || !shipmentIds.length}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Download
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrintLabelsDialog;
