import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react';
import { gstSettingsAPI, invoicesAPI } from '../services/api';
import { fmtRupees } from '../lib/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/**
 * GST Display: whether the store charges GST, the rate for products with no tax rule, how prices
 * show, and the store's GSTIN.
 *
 * On v2 the GST block is the registry key `gst` (PATCH /commerce/settings/registry/gst, through
 * `gstSettingsAPI.update`; it declares exactly these four fields). The GSTIN is saved through the
 * invoice configuration (PUT /invoices/config `seller.gstin`): the server checks it, carries a change to
 * the documents already raised and to the audit trail, and writes the `gstin` setting the tax engine
 * and the shop read in the same step. So invoices, GST returns and checkout always name one number.
 *
 * Engine facts the page states (growcord-rs `apps/gst/core/src/settings.rs load`): an explicit switch
 * wins, else GST is on when a default rate is set; no GST is charged at all without a positive default
 * rate; prices are taken as excluding GST unless "Prices include GST" is on.
 */

interface GstBlock {
  enabled: boolean;
  /** Text while editing; blank means not set (never a guessed rate). */
  defaultRate: string;
  showPriceIncludingGst: boolean;
  showGstOnCheckout: boolean;
}

const EMPTY_GST: GstBlock = { enabled: false, defaultRate: '', showPriceIncludingGst: false, showGstOnCheckout: true };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

const errText = (e: any, fallback: string): string =>
  e?.response?.data?.message || e?.message || fallback;

/** The example price the page works through (rupees). */
const EXAMPLE_PRICE = 1000;

const parseGst = (g: any): GstBlock => {
  const rate = num(g?.defaultRate);
  return {
    enabled: typeof g?.enabled === 'boolean' ? g.enabled : (rate ?? 0) > 0,
    defaultRate: rate === null ? '' : String(rate),
    showPriceIncludingGst: g?.showPriceIncludingGst === true,
    showGstOnCheckout: g?.showGstOnCheckout !== false,
  };
};

const GstSettings: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gst, setGst] = useState<GstBlock>(EMPTY_GST);
  const [gstSaved, setGstSaved] = useState<GstBlock>(EMPTY_GST);
  const [gstError, setGstError] = useState<string | null>(null);

  /** The invoice configuration's seller block: the GSTIN lives there. */
  const [seller, setSeller] = useState<Record<string, any> | null>(null);
  const [gstin, setGstin] = useState('');
  const [gstinSaved, setGstinSaved] = useState('');
  const [invoiceMissing, setInvoiceMissing] = useState<Array<{ field: string; label: string }>>([]);
  const [sellerError, setSellerError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setGstError(null);
    setSellerError(null);
    const [g, inv] = await Promise.allSettled([gstSettingsAPI.get(), invoicesAPI.getConfig()]);
    if (g.status === 'fulfilled') {
      const block = parseGst(g.value);
      setGst(block);
      setGstSaved(block);
    } else if (g.reason?.response?.status === 404) {
      // Nothing saved yet on a fresh store: the empty block, never a guessed rate.
      setGst(EMPTY_GST);
      setGstSaved(EMPTY_GST);
    } else {
      setGstError(errText(g.reason, 'The GST settings could not be loaded.'));
    }
    if (inv.status === 'fulfilled') {
      const d = inv.value?.data ?? inv.value ?? {};
      const s = d.config?.seller ?? {};
      setSeller(s);
      const current = String(s.gstin ?? '').toUpperCase();
      setGstin(current);
      setGstinSaved(current);
      setInvoiceMissing(Array.isArray(d.missing) ? d.missing : []);
    } else {
      setSeller(null);
      setSellerError(errText(inv.reason, 'The GSTIN could not be loaded.'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const gstDirty = useMemo(() => JSON.stringify(gst) !== JSON.stringify(gstSaved), [gst, gstSaved]);
  const gstinDirty = gstin.trim() !== gstinSaved.trim();
  const dirty = (gstDirty && !gstError) || (gstinDirty && !!seller);

  const rate = num(gst.defaultRate);
  const savedRate = num(gstSaved.defaultRate);
  const collecting = gstSaved.enabled && (savedRate ?? 0) > 0;
  const otherMissing = invoiceMissing.filter((m) => m.field !== 'seller.gstin');

  /** What a shopper pays for the example price at the default rate, under each display choice. */
  const example = useMemo(() => {
    if (rate === null || rate <= 0) return null;
    const inside = EXAMPLE_PRICE - EXAMPLE_PRICE / (1 + rate / 100);
    const onTop = (EXAMPLE_PRICE * rate) / 100;
    return gst.showPriceIncludingGst
      ? { line: `GST of ${fmtRupees(inside)} is inside the price; the shopper pays ${fmtRupees(EXAMPLE_PRICE)}.` }
      : { line: `GST of ${fmtRupees(onTop)} is added at checkout; the shopper pays ${fmtRupees(EXAMPLE_PRICE + onTop)}.` };
  }, [rate, gst.showPriceIncludingGst]);

  const save = async () => {
    setError(null);
    setNotice(null);
    if (gstDirty && gst.enabled && !(rate !== null && rate > 0)) {
      setError('Set the default GST rate: without a rate above 0 no GST is charged on any order, even on products with a tax rule.');
      return;
    }
    setSaving(true);
    const done: string[] = [];
    try {
      if (gstinDirty && seller) {
        const res = await invoicesAPI.updateConfig({ seller: { ...seller, gstin: gstin.replace(/\s+/g, '').toUpperCase() } });
        const d = res?.data ?? res ?? {};
        const s = d.config?.seller ?? { ...seller, gstin };
        setSeller(s);
        const now = String(s.gstin ?? '').toUpperCase();
        setGstin(now);
        setGstinSaved(now);
        if (Array.isArray(d.missing)) setInvoiceMissing(d.missing);
        done.push(d.gstin_change?.message || 'GSTIN saved.');
      }
      if (gstDirty && !gstError) {
        await gstSettingsAPI.update({
          enabled: gst.enabled,
          showPriceIncludingGst: gst.showPriceIncludingGst,
          showGstOnCheckout: gst.showGstOnCheckout,
          ...(rate !== null ? { defaultRate: rate } : {}),
        });
        setGstSaved(gst);
        done.push('GST settings saved.');
      }
      setNotice(done.join(' '));
    } catch (e: any) {
      const why = errText(e, 'The changes could not be saved.');
      setError(done.length ? `${done.join(' ')} Not saved: ${why}` : why);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-16">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="mb-3 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">GST Display</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Whether you charge GST, the rate for products without a tax rule, how prices show, and your GSTIN.
          Rates per product are set in <Link to="/settings/tax-rules" className="font-medium text-primary underline underline-offset-2">Tax Rules</Link>.
        </p>
      </div>

      {/* What to act on first */}
      {!gstError && !collecting && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            {gstSaved.enabled
              ? 'GST is switched on but no default rate is saved, so no GST is charged on any order.'
              : 'GST is not charged: orders are saved with no tax and no GST invoice can be issued.'}
          </div>
        </div>
      )}
      {seller && !gstinSaved && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>No GSTIN is saved. A tax invoice cannot be issued without one.</div>
        </div>
      )}
      {otherMissing.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>Invoices still need: {otherMissing.map((m) => m.label).join(', ')}.</span>
          <Button asChild variant="outline" size="sm" className="flex-shrink-0 bg-white">
            <Link to="/settings/invoice">Invoice settings</Link>
          </Button>
        </div>
      )}
      {!gstError && collecting && gstinSaved && otherMissing.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Charging GST, {pct(savedRate ?? 0)} by default, prices {gstSaved.showPriceIncludingGst ? 'including' : 'excluding'} GST.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}

      {/* GSTIN */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GSTIN</CardTitle>
          <CardDescription>Printed on every invoice and filed in your GST returns.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sellerError ? (
            <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <span>{sellerError}</span>
              <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again</Button>
            </div>
          ) : (
            <>
              <Label htmlFor="gstin" className="sr-only">GSTIN</Label>
              <Input
                id="gstin"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
                placeholder="15 characters"
                maxLength={15}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Checked when you save. A changed GSTIN also changes on documents already raised in the same state,
                and each one records the change; your <Link to="/settings/invoice" className="underline underline-offset-2">invoice settings</Link> show the same number.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {gstError ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{gstError}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again</Button>
        </div>
      ) : (
        <>
          {/* Charging */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Charging GST</CardTitle>
              <CardDescription>
                Each order records CGST and SGST within your state, IGST to another state.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="gst-enabled" className="cursor-pointer text-sm font-medium">Charge GST on orders</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">While this is off, orders carry no tax.</p>
                </div>
                <Switch id="gst-enabled" checked={gst.enabled} onCheckedChange={(v) => setGst((p) => ({ ...p, enabled: v }))} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex-1">
                  <Label htmlFor="gst-rate" className="text-sm font-medium">Default GST rate (%)</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    For products with no tax rule. Needed for GST to be charged at all.
                  </p>
                </div>
                <Input
                  id="gst-rate"
                  type="number" inputMode="decimal" min={0} max={28} step={0.01}
                  value={gst.defaultRate}
                  placeholder="Not set"
                  onChange={(e) => setGst((p) => ({ ...p, defaultRate: e.target.value }))}
                  className="w-full sm:w-28"
                />
              </div>
            </CardContent>
          </Card>

          {/* Display */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How prices show</CardTitle>
              <CardDescription>What shoppers see on the product page, the cart and checkout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="gst-incl" className="cursor-pointer text-sm font-medium">Prices include GST</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    On: the GST is taken out of the price you set. Off: it is added on top at checkout.
                  </p>
                </div>
                <Switch id="gst-incl" checked={gst.showPriceIncludingGst} onCheckedChange={(v) => setGst((p) => ({ ...p, showPriceIncludingGst: v }))} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="gst-breakdown" className="cursor-pointer text-sm font-medium">Show the GST split at checkout</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">CGST and SGST, or IGST, as lines in the order summary.</p>
                </div>
                <Switch id="gst-breakdown" checked={gst.showGstOnCheckout} onCheckedChange={(v) => setGst((p) => ({ ...p, showGstOnCheckout: v }))} />
              </div>
              {example && gst.enabled && (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  A product priced at {fmtRupees(EXAMPLE_PRICE)} at {pct(rate ?? 0)}: {example.line}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Rates per product</div>
            <div className="mt-0.5 text-xs text-muted-foreground">A GST rate with its HSN or SAC code, picked on each product.</div>
          </div>
          <Button asChild variant="outline" size="sm" className="flex-shrink-0">
            <Link to="/settings/tax-rules">Tax Rules <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link>
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => { setGst(gstSaved); setGstin(gstinSaved); setError(null); }}
        >
          Undo changes
        </Button>
        <Button onClick={() => void save()} disabled={!dirty || saving} className="sm:min-w-[120px]">
          {saving
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving</>
            : <><Save className="mr-2 h-4 w-4" /> Save changes</>}
        </Button>
      </div>
    </div>
  );
};

export default GstSettings;
