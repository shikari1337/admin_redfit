import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Printer, FileDown } from 'lucide-react';
import { shipmentsAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  LABEL_PRINT_DEFAULTS, LABEL_SIZES, LABEL_SIZE_GROUPS, labelsHtml, narrowAwbCount, printHtml, readLabelData, readLabelPrint,
  type LabelData, type LabelMissing, type LabelPrintSetting, type LabelSizeKey,
} from '@/lib/shippingLabels';

/** This print's choices: they start from the store's label setting and change for this print only. */
interface Prefs {
  kind: 'growcord' | 'courier';
  size: LabelSizeKey;
  courierSize: '4R' | 'A4';
  items: boolean;
  invoiceValue: boolean;
  logo: boolean;
}
const fromSetting = (s = LABEL_PRINT_DEFAULTS, growcordShip = false): Prefs => ({
  // Growcord Ship parcels start on Growcord's own label: the courier's PDF shows the courier account's name.
  kind: growcordShip ? 'growcord' : s.defaultKind,
  size: s.size, courierSize: '4R', items: s.showProducts, invoiceValue: s.showInvoiceValue, logo: s.showLogo,
});

/** A route the server does not serve yet. */
const notServed = (e: any) => [404, 405, 501].includes(Number(e?.response?.status));

interface Props {
  open: boolean;
  /** The shipments to print. */
  shipmentIds: string[];
  /** Shipment numbers by id, to name a label that cannot be made. */
  names?: Record<string, string>;
  /** How many of them were booked through Growcord Ship (they start on Growcord's own label). */
  growcordShipCount?: number;
  onClose: () => void;
}

/**
 * Print labels (owner 26 Nov 2026): Growcord's own label, every selected parcel in one document, one per page at A5
 * (the default size; Homeomed prints on A5), 4 x 6 inch thermal, 4 x 4 inch or A6, or several per sheet: A5 with 2,
 * A4 with 2, 4, 6, 8 or 16, with or without product names, invoice value and the store logo; or the courier's own
 * label, downloaded as one PDF for all of them. The window starts from the store's label setting (Growcord Ship,
 * Settings) and a change here is for this print only. A shipment with no label is listed with the reason.
 */
const PrintLabelsDialog: React.FC<Props> = ({ open, shipmentIds, names, growcordShipCount = 0, onClose }) => {
  const { hasPerm } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(() => fromSetting(LABEL_PRINT_DEFAULTS, growcordShipCount > 0));
  // Where this print's starting choices came from: the store setting in the registry, else the copy the label read
  // answers with (`print_defaults`), else the defaults. A choice made in the window is never overwritten.
  const source = useRef<'pending' | 'registry' | 'none'>('pending');
  const touched = useRef(false);
  const serverDefaults = useRef<LabelPrintSetting | null>(null);
  const set = (patch: Partial<Prefs>) => { touched.current = true; setPrefs((p) => ({ ...p, ...patch })); };
  const fallBack = () => {
    if (source.current !== 'registry' && !touched.current && serverDefaults.current) {
      setPrefs(fromSetting(serverDefaults.current, growcordShipCount > 0));
    }
  };
  const [data, setData] = useState<{ labels: LabelData[]; missing: LabelMissing[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [courierNote, setCourierNote] = useState<string | null>(null);
  const [courierFailed, setCourierFailed] = useState<Array<{ shipmentId: string; shipmentNumber?: string; message: string }>>([]);
  const idsKey = shipmentIds.join(',');

  // Each opening starts from the store's label setting (the defaults when it cannot be read).
  useEffect(() => {
    if (!open) return;
    setCourierNote(null); setCourierFailed([]);
    let live = true;
    source.current = 'pending'; touched.current = false; serverDefaults.current = null;
    setPrefs(fromSetting(LABEL_PRINT_DEFAULTS, growcordShipCount > 0));
    readLabelPrint()
      .then((r) => {
        if (!live) return;
        if (r.exists) { source.current = 'registry'; if (!touched.current) setPrefs(fromSetting(r.setting, growcordShipCount > 0)); }
        else { source.current = 'none'; fallBack(); }
      })
      .catch(() => { if (live) { source.current = 'none'; fallBack(); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);

  // Growcord's label: the facts of these shipments, read when the window shows them.
  useEffect(() => {
    if (!open || prefs.kind !== 'growcord' || !shipmentIds.length) return;
    let live = true;
    setLoading(true); setError(null); setData(null);
    readLabelData(shipmentIds)
      .then((d) => {
        if (!live) return;
        setData(d);
        serverDefaults.current = d.printDefaults;
        if (source.current === 'none') fallBack();
      })
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
  const narrow = useMemo(() => (data?.labels.length ? narrowAwbCount(data.labels, prefs.size) : 0), [data, prefs.size]);

  const printGrowcord = () => {
    if (!data?.labels.length) return;
    printHtml(labelsHtml(data.labels, prefs.size, options));
  };

  /** The courier's own label for all of them, as one PDF (the server merges them), with those it could not add. */
  const downloadCourier = async () => {
    setBusy(true); setCourierNote(null); setCourierFailed([]);
    try {
      const r = await shipmentsAPI.downloadDocumentsBulk('labels', shipmentIds, prefs.courierSize);
      const parcels = r.documents.reduce((n, d) => n + (d.shipmentNumbers?.length ?? 0), 0);
      setCourierNote(r.documents.length
        ? `${r.documents.length === 1 ? 'One PDF' : `${r.documents.length} PDFs`} downloaded for ${parcels || shipmentIds.length - r.failed.length} shipment(s).`
        : 'No label file came back.');
      setCourierFailed(r.failed);
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
          <DialogDescription>
            {shipmentIds.length} shipment{shipmentIds.length === 1 ? '' : 's'}, in one document. This print starts from the store's label setting; a change here is for this print only.
            {hasPerm('settings.manage') && <> <Link to="/growship/settings" className="text-blue-700 hover:underline" onClick={onClose}>Change the store's setting</Link></>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${radio} ${prefs.kind === 'growcord' ? 'border-blue-600 bg-blue-50' : ''}`}>
            <input type="radio" name="label-kind" checked={prefs.kind === 'growcord'} onChange={() => set({ kind: 'growcord' })} className="mt-0.5" />
            <span><span className="font-medium">Growcord label</span><span className="block text-xs text-muted-foreground">Your own label with barcodes, any size, printed from this window.</span></span>
          </label>
          <label className={`${radio} ${prefs.kind === 'courier' ? 'border-blue-600 bg-blue-50' : ''}`}>
            <input type="radio" name="label-kind" checked={prefs.kind === 'courier'} onChange={() => set({ kind: 'courier' })} className="mt-0.5" />
            <span>
              <span className="font-medium">Courier's label</span>
              <span className="block text-xs text-muted-foreground">The PDF the courier makes, one file for all of them.</span>
              {growcordShipCount > 0 && <span className="block text-xs text-amber-800">Shows the courier account name.</span>}
            </span>
          </label>
        </div>

        {prefs.kind === 'growcord' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Size</span>
                <select className="h-9 rounded-md border px-2" value={prefs.size} onChange={(e) => set({ size: e.target.value as LabelSizeKey })}>
                  {LABEL_SIZE_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.keys.map((k) => <option key={k} value={k}>{LABEL_SIZES[k].label}</option>)}
                    </optgroup>
                  ))}
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
            {prefs.kind === 'growcord' && narrow > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
                {narrow} AWB{narrow === 1 ? ' is' : 's are'} too long for this size: the barcode prints thinner than the standard allows and a
                scanner may not read it. Choose a larger size.
              </p>
            )}
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
            {courierFailed.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
                <p className="font-medium">{courierFailed.length} not in the file</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {courierFailed.map((f) => <li key={f.shipmentId}>{f.shipmentNumber || names?.[f.shipmentId] || f.shipmentId}: {f.message}</li>)}
                </ul>
              </div>
            )}
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
