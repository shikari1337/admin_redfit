import React, { useState } from 'react';
import { Barcode, Printer, ScanLine, Trash2 } from 'lucide-react';
import { api, searchAPI } from '../../services/api';
import {
  Page, PageHeader, SectionCard, EmptyState, Btn, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td,
} from '../../components/erp';
import InfoTip from '../../components/common/InfoTip';

/**
 * Barcodes & labels (WMS slice 4): per-variant barcode manager (vendor codes
 * validated with the GS1 check digit; internal restricted-range GTIN
 * allocation), universal scan tester, and ZPL/PDF label generation.
 *
 * The page used to open with a four-line paragraph of GS1 detail and print the
 * scan result as raw JSON. Both are now where they belong: the detail behind a
 * tooltip, the scan result as named facts — a person at a label printer should
 * not have to read `"matchedBy":"barcode"` off a code block.
 */

/** What a resolved scan actually carries (db/queries/barcodes.ts resolveScan). */
type ScanHit = {
  type?: 'variation' | 'bin' | 'batch' | 'serial' | 'none';
  scan_kind?: string;
  matchedBy?: string;
  sku?: string;
  product_name?: string;
  barcode?: string;
  pack_qty?: number | null;
  is_internal?: boolean;
  legacy_stock?: number;
  code?: string;
  kind?: string;
  status?: string;
  units?: number;
  batch_number?: string;
  qty_on_hand?: number;
  expiry_date?: string | null;
  mrp?: number | null;
  siblings?: unknown[];
  [k: string]: unknown;
};

/** Plain words for what a code turned out to be. */
const SCAN_LABEL: Record<string, string> = {
  variation: 'A product (SKU)',
  bin: 'A shelf or bin',
  batch: 'A batch (lot)',
  serial: 'A single serial-numbered unit',
};
const MATCHED_BY: Record<string, string> = {
  barcode: 'its barcode',
  sku: 'its SKU',
  location_code: 'its shelf code',
  batch_number: 'its batch number',
  serial_number: 'its serial number',
};

/** One "label: value" line of the scan answer. */
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex gap-2 py-0.5 text-sm">
    <span className="w-32 shrink-0 text-ink-soft">{label}</span>
    <span className="min-w-0 font-medium text-ink">{children}</span>
  </div>
);

const LabelsBarcodes: React.FC = () => {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // variation context
  const [sku, setSku] = useState('');
  const [variation, setVariation] = useState<any | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [newCode, setNewCode] = useState('');
  const [packQty, setPackQty] = useState('');
  // scan tester
  const [scanQ, setScanQ] = useState('');
  const [scanResult, setScanResult] = useState<ScanHit | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  // labels
  const [labelSize, setLabelSize] = useState<'4x6' | '2x1' | '50x25mm'>('50x25mm');

  const fail = (e: any) => setError(e?.response?.data?.message ?? e.message);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 4000); };

  const loadCodes = async (variationId: string) => {
    const res = await api.get('/wms/barcodes', { params: { variationId } });
    setCodes(res.data.rows ?? []);
  };

  const resolveSku = async () => {
    setError(''); setVariation(null); setCodes([]);
    const hits = await searchAPI.query('variation', sku, 1);
    const hit = hits[0];
    if (!hit) { setError(`Nothing matches "${sku}". Type at least 3 letters of a product name or SKU.`); return; }
    setVariation(hit);
    loadCodes(hit.id).catch(fail);
  };

  const addCode = async () => {
    if (!variation || !newCode.trim()) return;
    try {
      await api.post('/wms/barcodes', {
        variationId: variation.id, barcode: newCode.trim(), source: 'vendor',
        packQty: packQty ? parseInt(packQty) : null,
      });
      setNewCode(''); setPackQty(''); flash('Barcode added');
      loadCodes(variation.id);
    } catch (e) { fail(e); }
  };

  const allocateInternal = async () => {
    if (!variation) return;
    try {
      const res = await api.post('/wms/barcodes/allocate-internal', { variationId: variation.id });
      flash(`Internal barcode ${res.data?.barcode ?? ''} created. It is for your own shelves — never send it to a marketplace.`);
      loadCodes(variation.id);
    } catch (e) { fail(e); }
  };

  const removeCode = async (id: string) => {
    if (!confirm('Remove this barcode from the SKU?')) return;
    try { await api.delete(`/wms/barcodes/${id}`); if (variation) loadCodes(variation.id); } catch (e) { fail(e); }
  };

  const runScan = async () => {
    setScanResult(null); setError('');
    if (!scanQ.trim()) return;
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(scanQ.trim())}`);
      setScanResult(res.data);
    } catch (e: any) {
      if (e?.response?.status === 404) setScanResult({ type: 'none' });
      else fail(e);
    }
  };

  const downloadLabels = async (format: 'zpl' | 'pdf') => {
    if (!variation) { setError('Load a SKU first — a label needs to know what it is for.'); return; }
    try {
      const res = await api.post('/wms/labels',
        { type: 'product', ids: [variation.id], format, size: labelSize },
        { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `label-${variation.sublabel ?? 'product'}.${format === 'zpl' ? 'zpl' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { fail(e); }
  };

  const hitType = scanResult?.type ?? 'none';

  return (
    <Page>
      <PageHeader
        title="Barcodes & labels"
        icon={Barcode}
        description="Give a SKU the barcodes it is sold under, print its shelf labels, and check what any code on a pack resolves to."
      />
      {error && <div className="rounded-lg border border-bad-200 bg-bad-bg px-3 py-2 text-sm text-bad-ink">{error}</div>}
      {notice && <div className="rounded-lg border border-good-200 bg-good-bg px-3 py-2 text-sm text-good-ink">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionCard
            title="Barcodes on a SKU"
            description="Every code a pack of this SKU can be scanned by."
          >
            <div className="flex gap-2">
              <TextInput
                placeholder="Search a product name or SKU…"
                aria-label="Search for a SKU"
                data-testid="labels-search"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && resolveSku()}
                className="min-w-0 flex-1 font-mono"
              />
              <Btn onClick={resolveSku}>Load</Btn>
            </div>

            {!variation ? (
              <EmptyState
                icon={Barcode}
                title="No SKU loaded"
                description="Search for a product above to see and change its barcodes."
              />
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <div className="text-xs text-good-ink">✓ {variation.label} ({variation.sublabel})</div>

                <TableShell>
                  <table className="w-full text-xs">
                    <THead sticky={false}>
                      <Th>Barcode</Th>
                      <Th>
                        Type
                        <InfoTip
                          className="ml-1"
                          text="A GTIN is the code printed by the maker. An internal barcode is one you created for your own shelves."
                          where="Internal codes use the GS1 restricted range (20–29) and are never sent to a marketplace feed."
                        />
                      </Th>
                      <Th>Where from</Th>
                      <Th num>Units in the pack</Th>
                      <Th />
                    </THead>
                    <TBody>
                      {codes.map((c: any) => (
                        <Tr key={c.id}>
                          <Td className="font-mono">{c.barcode}{c.is_internal ? ' 🔒' : ''}</Td>
                          <Td>{c.is_internal ? 'Internal' : c.kind}</Td>
                          <Td>{c.source === 'vendor' ? 'From the maker' : c.source}</Td>
                          <Td num>{c.pack_qty ?? '—'}</Td>
                          <Td>
                            <button
                              className="rounded border border-line px-1.5 py-0.5 text-bad-ink hover:bg-bad-bg"
                              title="Remove this barcode"
                              aria-label="Remove this barcode"
                              onClick={() => removeCode(c.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Td>
                        </Tr>
                      ))}
                      {codes.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-3 text-ink-soft">No barcodes on this SKU yet.</td></tr>
                      )}
                    </TBody>
                  </table>
                </TableShell>

                <div className="flex flex-wrap items-center gap-2">
                  <TextInput
                    placeholder="Barcode printed on the pack" value={newCode}
                    aria-label="Barcode to add"
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-56 font-mono text-xs"
                  />
                  <TextInput
                    placeholder="Units" type="number" min={1} value={packQty}
                    aria-label="Units in the pack this barcode is on"
                    onChange={(e) => setPackQty(e.target.value)}
                    className="w-24 text-xs"
                  />
                  <Btn variant="outline" size="sm" onClick={addCode} disabled={!newCode.trim()}>Add</Btn>
                  <Btn size="sm" onClick={allocateInternal}>Create an internal barcode</Btn>
                  <InfoTip text="For a pack with no printed barcode of its own. It works on your shelves and in the scanner, and is never sent to a marketplace." />
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Print labels" description="For the SKU loaded above.">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <SelectInput
                value={labelSize}
                aria-label="Label size"
                onChange={(e) => setLabelSize(e.target.value as any)}
                className="w-40"
              >
                <option value="50x25mm">50 × 25 mm</option>
                <option value="2x1">2 × 1 in</option>
                <option value="4x6">4 × 6 in</option>
              </SelectInput>
              <Btn onClick={() => downloadLabels('zpl')} disabled={!variation}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Thermal printer (ZPL)
              </Btn>
              <Btn variant="outline" onClick={() => downloadLabels('pdf')} disabled={!variation}>PDF</Btn>
              <InfoTip text="ZPL goes straight to a thermal label printer. PDF is for an ordinary printer, or to check the layout first." />
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="What is this code?"
          description="Scan or type anything on a pack or a shelf — the answer says what it is."
        >
          <div className="flex gap-2">
            <TextInput
              placeholder="Scan or type a barcode, SKU, shelf code or batch number"
              aria-label="Code to look up"
              data-testid="scan-tester"
              value={scanQ}
              onChange={(e) => setScanQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runScan()}
              className="min-w-0 flex-1 font-mono"
            />
            <Btn onClick={runScan}><ScanLine className="mr-1.5 h-3.5 w-3.5" /> Look up</Btn>
          </div>

          {scanResult && hitType === 'none' && (
            <EmptyState
              icon={ScanLine}
              title="Nothing matches that code"
              description="It is not a barcode, SKU, shelf code, batch number or serial number on this store."
            />
          )}

          {scanResult && hitType !== 'none' && (
            <div className="mt-3 space-y-1 rounded-lg border border-line bg-surface-2 p-3">
              <div className="mb-1.5 text-sm font-semibold text-ink">
                {SCAN_LABEL[hitType] ?? 'A match'}
                {scanResult.matchedBy && (
                  <span className="ml-1 font-normal text-ink-soft">
                    — found by {MATCHED_BY[scanResult.matchedBy] ?? scanResult.matchedBy}
                  </span>
                )}
              </div>

              {hitType === 'variation' && (
                <>
                  <Fact label="Product">{scanResult.product_name ?? '—'}</Fact>
                  <Fact label="SKU"><span className="font-mono">{scanResult.sku ?? '—'}</span></Fact>
                  {scanResult.barcode && <Fact label="Barcode"><span className="font-mono">{scanResult.barcode}</span></Fact>}
                  {scanResult.pack_qty != null && <Fact label="Units in the pack">{scanResult.pack_qty}</Fact>}
                  {scanResult.is_internal && <Fact label="Barcode type">Internal — your own, never sent to a marketplace</Fact>}
                </>
              )}
              {hitType === 'bin' && (
                <>
                  <Fact label="Shelf"><span className="font-mono">{scanResult.code ?? '—'}</span></Fact>
                  <Fact label="Kind">{scanResult.kind ?? '—'}</Fact>
                  <Fact label="Status">{scanResult.status ?? '—'}</Fact>
                  <Fact label="Units on it">{scanResult.units ?? 0}</Fact>
                </>
              )}
              {hitType === 'batch' && (
                <>
                  <Fact label="Batch"><span className="font-mono">{scanResult.batch_number ?? '—'}</span></Fact>
                  <Fact label="SKU"><span className="font-mono">{scanResult.sku ?? '—'}</span></Fact>
                  <Fact label="On hand">{scanResult.qty_on_hand ?? 0}</Fact>
                  <Fact label="Expires">{scanResult.expiry_date ?? 'not recorded'}</Fact>
                  <Fact label="Printed MRP">{scanResult.mrp != null ? `₹${scanResult.mrp}` : 'not recorded'}</Fact>
                  {Array.isArray(scanResult.siblings) && scanResult.siblings.length > 0 && (
                    <p className="mt-2 rounded border border-warn-200 bg-warn-bg px-2 py-1.5 text-xs text-warn-ink">
                      This batch number is on {scanResult.siblings.length + 1} lots with different printed MRPs.
                      The one above is the first to expire — the one a picker would be given.
                    </p>
                  )}
                </>
              )}
              {hitType === 'serial' && (
                <>
                  <Fact label="Serial"><span className="font-mono">{String(scanResult.serial_number ?? '—')}</span></Fact>
                  <Fact label="SKU"><span className="font-mono">{scanResult.sku ?? '—'}</span></Fact>
                  <Fact label="Status">{scanResult.status ?? '—'}</Fact>
                </>
              )}

              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="mt-2 text-xs text-ink-soft underline-offset-2 hover:underline"
              >
                {showRaw ? 'Hide the technical detail' : 'Technical detail'}
              </button>
              {showRaw && (
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-surface p-2 text-[11px]">
                  {JSON.stringify(scanResult, null, 2)}
                </pre>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </Page>
  );
};

export default LabelsBarcodes;
