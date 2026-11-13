import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { BlockSkeleton, Chip } from '@/components/erp';
import { SearchBox, EmptyRowState } from '@/components/sales/ListChrome';
import { useToast } from '@/hooks/use-toast';
import { formatDayShort } from '@/utils/date';
import { cn } from '@/lib/utils';
import { errText, retentionAPI, type RetentionSettings, type StockSignupRow } from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * MESSAGING, RETENTION, BACK-IN-STOCK SIGN-UPS (lane ADMIN-REV-1): who pressed
 * "Notify me" on which product, from Retain's staff read per product
 * (`GET /api/v2/retain/alerts/by-product`, RET-1). Read only. Leads with what
 * to restock: sold-out products with the most people waiting come first.
 */
const COLS = 'md:grid-cols-[minmax(0,2.4fr)_7rem_7rem_6rem_6rem]';

const StockSignups: React.FC = () => {
  const [rows, setRows] = useState<StockSignupRow[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setFailure(null);
    try { setRows(await retentionAPI.stockSignups()); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the back-in-stock sign-ups.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => (rows ?? []).slice().sort((a, b) =>
    (a.in_stock === true ? 1 : 0) - (b.in_stock === true ? 1 : 0)
    || b.back_in_stock - a.back_in_stock
    || b.price_drop - a.price_drop
    || a.product_name.localeCompare(b.product_name)), [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sorted;
    return sorted.filter((r) => `${r.product_name} ${r.variant ?? ''} ${r.sku ?? ''}`.toLowerCase().includes(t));
  }, [sorted, q]);

  if (failure?.gap) {
    return <GapNotice what="Back-in-stock sign-ups per product (GET /retain/alerts/by-product) are not on this server yet." />;
  }
  if (failure) return <ErrorNotice message={failure.message} onRetry={load} />;
  if (!rows) return <div aria-busy="true" className="space-y-3"><BlockSkeleton lines={2} /><BlockSkeleton lines={6} /></div>;

  const fmt = (v: number) => v.toLocaleString('en-IN');
  const people = (v: number) => `${fmt(v)} ${v === 1 ? 'person' : 'people'}`;
  const waiting = rows.reduce((a, r) => a + r.back_in_stock, 0);
  const priceWaiting = rows.reduce((a, r) => a + r.price_drop, 0);
  const soldOut = rows.filter((r) => r.in_stock === false && r.back_in_stock > 0);
  const soldOutPeople = soldOut.reduce((a, r) => a + r.back_in_stock, 0);
  const backPeople = rows.filter((r) => r.in_stock === true).reduce((a, r) => a + r.back_in_stock, 0);
  const lines = [
    soldOut.length > 0 && `${soldOut.length} product${soldOut.length === 1 ? ' is' : 's are'} still sold out with ${people(soldOutPeople)} waiting: restock those first.`,
    backPeople > 0 && `${people(backPeople)} still wait on products already back in stock, and have not been told yet.`,
    priceWaiting > 0 && `${people(priceWaiting)} want a lower price.`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div role="status" data-testid="signups-summary"
        className={cn('rounded-lg border px-4 py-3 text-sm', soldOut.length > 0 || backPeople > 0 ? 'border-warn bg-warn-bg text-warn-ink' : 'border-line bg-surface-2 text-ink')}>
        <p className="font-semibold">
          {rows.length === 0 ? 'Nobody is waiting for a product yet'
            : `${people(waiting)} asked to hear when ${rows.length} product${rows.length === 1 ? ' is' : 's are'} back`}
        </p>
        {rows.length === 0
          ? <p className="text-xs opacity-90">Shoppers sign up with "Notify me" on a sold-out product page.</p>
          : lines.map((l) => <p key={l} className="text-xs opacity-90">{l}</p>)}
      </div>

      <AlertSwitch />

      {rows.length > 0 && (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search products or SKU" className="w-full sm:w-72" />
          <div className="overflow-hidden rounded-lg border border-line bg-surface" data-testid="signups-list">
            <div aria-hidden className={cn('hidden gap-3 border-b border-line bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft md:grid', COLS)}>
              <span>Product</span><span className="text-right">Back in stock</span><span className="text-right">Lower price</span>
              <span className="text-right">Told</span><span className="text-right">Latest</span>
            </div>
            {shown.length === 0 ? (
              <EmptyRowState pristine={false} noun="sign-ups" onClear={() => setQ('')} />
            ) : (
              <ul className="divide-y divide-line">
                {shown.map((r) => (
                  <li key={r.item_id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5', COLS)}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      {r.image ? (
                        <img src={r.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded border border-line object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-surface-2 text-ink-mute"><Package className="h-4 w-4" /></span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{r.product_name || 'Unnamed product'}</p>
                        <p className="truncate text-xs text-ink-soft">
                          {[r.variant, r.sku].filter(Boolean).join(', ')}
                          {r.in_stock === true && <Chip tone="green" className="ml-1.5 text-[10px]">In stock now</Chip>}
                          {r.in_stock === false && <Chip tone="amber" className="ml-1.5 text-[10px]">Sold out</Chip>}
                        </p>
                        <p className="text-xs text-ink-soft md:hidden">
                          {r.price_drop > 0 && `${fmt(r.price_drop)} want a lower price; `}{fmt(r.notified)} told{r.last_signup_at ? `; latest ${formatDayShort(r.last_signup_at, '')}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums text-ink">
                      <BellRing className="h-3.5 w-3.5 text-ink-mute md:hidden" aria-hidden />{fmt(r.back_in_stock)}
                    </span>
                    <span className="hidden text-right text-sm tabular-nums text-ink md:block">{fmt(r.price_drop)}</span>
                    <span className="hidden text-right text-sm tabular-nums text-ink-soft md:block">{fmt(r.notified)}</span>
                    <span className="hidden text-right text-xs text-ink-soft md:block">{formatDayShort(r.last_signup_at, '')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-ink-soft">
            Each person is told once, by message, when the product is back or cheaper, while stock alerts are switched on for your store.
          </p>
        </>
      )}
    </div>
  );
};

/**
 * The store's own switch for these messages (Retain settings `automation.alerts`, on by default,
 * DEC-070), lane MENU-1. Changing it needs marketing.manage, as every Retain setting does. A
 * server without the switch shows nothing here; the list above still works.
 */
const AlertSwitch: React.FC = () => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('marketing.manage');
  const { toast } = useToast();
  const [cfg, setCfg] = useState<RetentionSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    retentionAPI.settings().then((v) => { if (live) setCfg(v); }).catch(() => { /* the list above still works */ });
    return () => { live = false; };
  }, []);
  if (!cfg || cfg.alerts_on === null) return null;

  const flip = async (on: boolean) => {
    setSaving(true);
    try {
      setCfg(await retentionAPI.saveAlertsOn(cfg, on));
      toast({ title: on ? 'Stock alerts are on' : 'Stock alerts are off', description: on ? 'People waiting are told when the product is back or cheaper.' : 'Sign-ups are kept; nobody is told until you turn this on again.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not changed', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3" data-testid="stock-alert-switch">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Tell people when it is back</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {cfg.alerts_on
            ? 'On: each person who signed up gets one message when the product is back in stock or cheaper.'
            : 'Off: sign-ups are kept, but nobody is told. Turn it on to send them.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-mute" aria-label="Saving" />}
        <Switch checked={cfg.alerts_on} onCheckedChange={flip} disabled={!canWrite || saving}
          aria-label="Tell people when it is back" title={!canWrite ? 'Needs the marketing.manage permission' : undefined} />
      </div>
    </div>
  );
};

export default StockSignups;
