import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { couponsAPI } from '../services/api';
import { codeLabel } from '@/lib/v2/appSettings';
import { APP_SALES_CHANNEL, couponChannels, couponFirstChannelOrder } from '@/lib/v2/appGrowth';
import { useAuth } from '../contexts/AuthContext';
import { FaPlus, FaEdit, FaTrash, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { localeDate } from '../utils/date';
import { fmtRupees, fmtNumber } from '@/lib/money';
import { FilterChip, SearchBox, ListHeader } from '../components/sales/ListChrome';
import { ExportMenu, StatCard, StatGrid, type CsvColumn } from '@/components/erp';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Coupon {
  _id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'b2g1';
  value?: number;
  description: string;
  minPurchase?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usageCount: number;
  userLimit?: number;
  isPublic?: boolean;
  is_public?: boolean;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** One code's use on orders (GET /coupons/usage): cancelled orders left out. */
interface CouponUsage {
  code: string;
  orders: number;
  customers: number;
  sales: number | null;
  lastUsedAt?: string | null;
}

/** v2 pages the list (at most 200 a call); the page reads them all, up to this many. */
const PAGE = 200;
const MAX_ROWS = 5000;
/** "Ends soon" = a running coupon whose last day is within this many days. */
const SOON_DAYS = 7;

const codeKey = (code: unknown) => String(code ?? '').trim().toUpperCase();
const isPublicOf = (c: Coupon) => (c.isPublic ?? c.is_public ?? true) !== false;
/** A code made for one shopper: one use in all and not advertised (cart recovery, rewards). */
const isOneTime = (c: Coupon) => Number(c.usageLimit ?? 0) === 1 && !isPublicOf(c);

/** Where a coupon is in its life: the question the list is really asked. */
type CouponState = 'live' | 'scheduled' | 'expired' | 'off' | 'used_up';
function couponState(c: Coupon): CouponState {
  if (!c.isActive) return 'off';
  const limit = Number(c.usageLimit ?? 0);
  if (limit > 0 && Number(c.usageCount ?? 0) >= limit) return 'used_up';
  const now = Date.now();
  const from = c.validFrom ? Date.parse(c.validFrom) : NaN;
  const until = c.validUntil ? Date.parse(c.validUntil) : NaN;
  if (Number.isFinite(from) && from > now) return 'scheduled';
  if (Number.isFinite(until) && until < now) return 'expired';
  return 'live';
}
const endsSoon = (c: Coupon) => {
  if (couponState(c) !== 'live') return false;
  const until = c.validUntil ? Date.parse(c.validUntil) : NaN;
  return Number.isFinite(until) && until - Date.now() <= SOON_DAYS * 86_400_000;
};

const STATE_LABEL: Record<CouponState, string> = {
  live: 'Running now',
  scheduled: 'Starts later',
  expired: 'Finished',
  used_up: 'Fully used',
  off: 'Switched off',
};
const STATE_TONE: Record<CouponState, string> = {
  live: 'text-green-700 bg-green-50 border-green-200',
  scheduled: 'text-blue-700 bg-blue-50 border-blue-200',
  expired: 'text-amber-700 bg-amber-50 border-amber-200',
  used_up: 'text-amber-700 bg-amber-50 border-amber-200',
  off: 'text-slate-600 bg-slate-100 border-slate-200',
};

type Filter = '' | CouponState | 'ending' | 'one_time';

const typeLabel = (type: string) => {
  switch (type) {
    case 'percentage': return 'Percent off';
    case 'fixed': return 'Amount off';
    case 'b2g1': return 'Buy 2 get 1';
    default: return type;
  }
};

/** What the shopper gets, in one phrase. */
const gives = (c: Coupon) => {
  if (c.type === 'b2g1') return 'Buy 2 get 1 free';
  if (c.type === 'percentage') {
    const cap = Number(c.maxDiscount ?? 0) > 0 ? ` up to ${fmtRupees(c.maxDiscount)}` : '';
    return `${Number(c.value ?? 0)}% off${cap}`;
  }
  if (c.type === 'fixed') return `${fmtRupees(c.value ?? 0)} off`;
  return '-';
};

/** The rows of a list answer, whatever the wrapper. */
const rowsOf = (response: any): any[] => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  return [];
};

/** Every coupon: v2 answers 200 at a time with a total; the old API answered all at once. App Offers reads its list here too. */
export async function fetchAllCoupons(): Promise<Coupon[]> {
  const all: any[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const response = await couponsAPI.getAll({ limit: PAGE, offset });
    const rows = rowsOf(response);
    for (const row of rows) {
      const id = typeof row._id === 'string' ? row._id : String(row._id ?? row.id ?? '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      all.push({ ...row, _id: id });
    }
    const total = Number((response as any)?.total);
    if (rows.length < PAGE || !Number.isFinite(total) || all.length >= total) break;
  }
  return all;
}

const Coupons: React.FC = () => {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  // marketing.manage creates, changes and switches; marketing.delete removes (the v2 coupon resource).
  const canManageCoupons = hasPerm('marketing.manage');
  const canDeleteCoupons = hasPerm('marketing.delete');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [usage, setUsage] = useState<Record<string, CouponUsage> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');

  const fetchCoupons = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCoupons(await fetchAllCoupons());
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Could not load the coupons');
      setCoupons([]);
    } finally {
      setLoading(false);
    }
    // Best effort: the list works without the usage figures.
    try {
      const rows = rowsOf(await couponsAPI.usage());
      const byCode: Record<string, CouponUsage> = {};
      for (const r of rows) {
        const key = codeKey(r.code);
        if (!key) continue;
        byCode[key] = {
          code: key,
          orders: Number(r.orders ?? 0),
          customers: Number(r.customers ?? 0),
          sales: r.sales == null ? null : Number(r.sales),
          lastUsedAt: r.lastUsedAt ?? r.last_used_at ?? null,
        };
      }
      setUsage(byCode);
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleDelete = async (coupon: Coupon) => {
    const used = Number(coupon.usageCount ?? 0);
    const ask = used > 0
      ? `${coupon.code} was used ${used} time${used === 1 ? '' : 's'}. Deleting it cannot be undone; switching it off keeps it for your records. Delete it anyway?`
      : `Delete ${coupon.code}? This cannot be undone.`;
    if (!window.confirm(ask)) return;
    try {
      setBusyId(coupon._id);
      await couponsAPI.delete(coupon._id);
      setNotice(`${coupon.code} deleted.`);
      fetchCoupons();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Could not delete the coupon');
    } finally {
      setBusyId(null);
    }
  };

  // Only the switch is sent: the row also carries its stored (snake_case) fields, and the v2
  // body shaper keeps those over the camelCase twin, so spreading the row sent the OLD value.
  const handleToggleActive = async (coupon: Coupon) => {
    try {
      setBusyId(coupon._id);
      await couponsAPI.update(coupon._id, { isActive: !coupon.isActive });
      setNotice(`${coupon.code} switched ${coupon.isActive ? 'off' : 'on'}.`);
      fetchCoupons();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Could not change the coupon');
    } finally {
      setBusyId(null);
    }
  };

  const term = search.trim().toLowerCase();
  const shown = useMemo(() => coupons.filter((c) => {
    if (filter === 'ending' && !endsSoon(c)) return false;
    if (filter === 'one_time' && !isOneTime(c)) return false;
    if (filter && filter !== 'ending' && filter !== 'one_time' && couponState(c) !== filter) return false;
    if (!term) return true;
    return `${c.code ?? ''} ${c.description ?? ''}`.toLowerCase().includes(term);
  }), [coupons, filter, term]);

  /** One count per state, from the same function the chips filter by. */
  const counts = useMemo(() => coupons.reduce((acc, c) => {
    const st = couponState(c); acc[st] = (acc[st] ?? 0) + 1; return acc;
  }, {} as Record<CouponState, number>), [coupons]);
  const endingCount = useMemo(() => coupons.filter(endsSoon).length, [coupons]);
  const oneTimeCount = useMemo(() => coupons.filter(isOneTime).length, [coupons]);
  const livePublic = useMemo(() => coupons.filter((c) => couponState(c) === 'live' && isPublicOf(c)).length, [coupons]);

  /** Orders and sales of the codes on this list (cancelled orders left out). */
  const totals = useMemo(() => {
    if (!usage) return null;
    let orders = 0;
    let sales = 0;
    for (const c of coupons) {
      const u = usage[codeKey(c.code)];
      if (!u) continue;
      orders += u.orders;
      sales += Number(u.sales ?? 0);
    }
    return { orders, sales };
  }, [usage, coupons]);

  const exportRows = useMemo(() => shown.map((c) => {
    const u = usage?.[codeKey(c.code)];
    return { ...c, state: STATE_LABEL[couponState(c)], orders: u?.orders ?? '', sales: u?.sales ?? '' };
  }), [shown, usage]);

  const csvColumns: CsvColumn<any>[] = [
    { key: 'code', label: 'Code' },
    { key: 'type', label: 'Type', format: (c: any) => typeLabel(c.type) },
    { key: 'value', label: 'Value' },
    { key: 'description', label: 'Description' },
    { key: 'minPurchase', label: 'Minimum purchase' },
    { key: 'maxDiscount', label: 'Largest discount' },
    { key: 'usageCount', label: 'Times used' },
    { key: 'usageLimit', label: 'Usage limit' },
    { key: 'userLimit', label: 'Per shopper' },
    { key: 'orders', label: 'Orders' },
    { key: 'sales', label: 'Sales' },
    { key: 'validFrom', label: 'Valid from' },
    { key: 'validUntil', label: 'Valid until' },
    { key: 'state', label: 'State' },
    { key: 'isPublic', label: 'Shown to shoppers', format: (c: any) => (isPublicOf(c) ? 'Yes' : 'No') },
  ];

  const pick = (next: Filter) => setFilter(filter === next ? '' : next);

  /** What to act on, first. */
  const attention: Array<{ key: Filter; text: string }> = [];
  if (endingCount > 0) attention.push({ key: 'ending', text: `${endingCount} running coupon${endingCount === 1 ? ' ends' : 's end'} within ${SOON_DAYS} days. Extend ${endingCount === 1 ? 'it' : 'them'} if the offer should stay.` });
  if ((counts.used_up ?? 0) > 0) attention.push({ key: 'used_up', text: `${counts.used_up} coupon${counts.used_up === 1 ? ' has' : 's have'} reached ${counts.used_up === 1 ? 'its' : 'their'} usage limit. Raise the limit or switch ${counts.used_up === 1 ? 'it' : 'them'} off.` });
  if ((counts.expired ?? 0) > 0) attention.push({ key: 'expired', text: `${counts.expired} finished coupon${counts.expired === 1 ? ' is' : 's are'} still switched on. Shoppers can no longer use ${counts.expired === 1 ? 'it' : 'them'}.` });

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-surface-2" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListHeader
        title="Coupons"
        purpose="Discount codes a shopper types at checkout: what each one gives, who may use it, until when, and what it brought in."
        aside={<ExportMenu filename="coupons" columns={csvColumns} rows={exportRows} canExport />}
        action={canManageCoupons && (
          <Button onClick={() => navigate('/coupons/new')}>
            <FaPlus className="mr-2 h-4 w-4" /> New coupon
          </Button>
        )}
      />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => fetchCoupons()}>Try again</Button>
        </div>
      )}
      {notice && !error && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          <span>{notice}</span>
          <button type="button" className="text-xs underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {(attention.length > 0 || (coupons.length > 0 && livePublic === 0)) && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Needs a look</p>
            {coupons.length > 0 && livePublic === 0 && (
              <p className="text-sm text-ink">
                No coupon is running and shown to shoppers, so the deals page and the offer strips are empty.
              </p>
            )}
            {attention.map((a) => (
              <button key={a.key} type="button" onClick={() => setFilter(a.key)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-2">
                {a.text} <span className="text-primary underline underline-offset-2">Show</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {coupons.length > 0 && (
        <StatGrid cols={3}>
          <StatCard label="Running now" value={fmtNumber(counts.live ?? 0)} sub={`${livePublic} shown to shoppers`} tone={(counts.live ?? 0) > 0 ? 'good' : 'default'} />
          <StatCard label="Orders with a coupon" value={totals ? fmtNumber(totals.orders) : '-'} sub={totals ? 'Cancelled orders left out' : 'Usage could not be read'} />
          <StatCard label="Sales with a coupon" value={totals ? fmtRupees(totals.sales) : '-'} sub="Order totals, all time" className="col-span-2 lg:col-span-1" />
        </StatGrid>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={search} onChange={setSearch}
            placeholder="Search by code or description" label="Search coupons" />
          <span className="text-sm tabular-nums text-ink-soft">
            {shown.length} of {coupons.length} coupon{coupons.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip on={!filter} onClick={() => setFilter('')}>All</FilterChip>
          <FilterChip on={filter === 'live'} tone="good" count={counts.live} onClick={() => pick('live')}>Running now</FilterChip>
          <FilterChip on={filter === 'ending'} tone="warn" count={endingCount} onClick={() => pick('ending')}>Ends soon</FilterChip>
          <FilterChip on={filter === 'scheduled'} count={counts.scheduled} onClick={() => pick('scheduled')}>Starts later</FilterChip>
          <FilterChip on={filter === 'expired'} tone="warn" count={counts.expired} onClick={() => pick('expired')}>Finished</FilterChip>
          <FilterChip on={filter === 'used_up'} tone="warn" count={counts.used_up} onClick={() => pick('used_up')}>Fully used</FilterChip>
          <FilterChip on={filter === 'off'} count={counts.off} onClick={() => pick('off')}>Switched off</FilterChip>
          {oneTimeCount > 0 && (
            <FilterChip on={filter === 'one_time'} count={oneTimeCount} onClick={() => pick('one_time')}>One-shopper codes</FilterChip>
          )}
          {(filter || search) && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-ink-soft"
              onClick={() => { setFilter(''); setSearch(''); }}>Clear</Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Gives</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead className="hidden md:table-cell">Brought in</TableHead>
                  <TableHead className="hidden md:table-cell">Validity</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <p className="text-sm font-medium text-ink">
                        {coupons.length === 0 ? 'No coupons yet' : 'Nothing matches those filters'}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {coupons.length === 0
                          ? 'A coupon is a code a shopper types at checkout. Make the first one and it appears here.'
                          : 'Clear a chip above, or search by code.'}
                      </p>
                      {coupons.length === 0 && canManageCoupons && (
                        <Button size="sm" className="mt-3" onClick={() => navigate('/coupons/new')}>
                          <FaPlus className="mr-2 h-3 w-3" /> New coupon
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((coupon) => {
                    const st = couponState(coupon);
                    const u = usage?.[codeKey(coupon.code)];
                    const busy = busyId === coupon._id;
                    return (
                      <TableRow key={coupon._id}>
                        <TableCell className="font-medium">
                          <Badge variant="outline" className="font-mono text-sm bg-slate-50">
                            {coupon.code}
                          </Badge>
                          {coupon.description && (
                            <p className="mt-1 max-w-[16rem] truncate text-xs text-muted-foreground" title={coupon.description}>
                              {coupon.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-green-700">{gives(coupon)}</span>
                          {Number(coupon.minPurchase ?? 0) > 0 && (
                            <p className="text-xs text-muted-foreground">On orders from {fmtRupees(coupon.minPurchase)}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium tabular-nums">
                              {fmtNumber(coupon.usageCount || 0)}{Number(coupon.usageLimit ?? 0) > 0 ? ` of ${fmtNumber(coupon.usageLimit)}` : ''}
                            </span>
                            {Number(coupon.userLimit ?? 0) > 0 && (
                              <span className="text-[11px] text-muted-foreground">{coupon.userLimit} per shopper</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {u ? (
                            <div className="flex flex-col text-sm">
                              <span className="tabular-nums">{fmtRupees(u.sales ?? 0)}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {fmtNumber(u.orders)} order{u.orders === 1 ? '' : 's'}{u.lastUsedAt ? `, last ${localeDate(u.lastUsedAt)}` : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{usage ? 'No orders yet' : '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-col text-sm text-muted-foreground">
                            <span>{localeDate(coupon.validFrom)}</span>
                            {coupon.validUntil && (
                              <span className="text-xs">to {localeDate(coupon.validUntil)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="outline" className={`text-xs font-medium ${STATE_TONE[st]}`}>
                              {STATE_LABEL[st]}
                            </Badge>
                            <span className={`text-[11px] ${isPublicOf(coupon) ? 'text-blue-600' : 'text-muted-foreground'}`}>
                              {isPublicOf(coupon) ? 'Shown to shoppers' : 'Hidden, works when typed'}
                            </span>
                            {/* HMAPP-3 point 6: a coupon limited to channels (an app offer is limited to the app). */}
                            {couponChannels(coupon).length > 0 && (
                              <span className="text-[11px] text-indigo-700">
                                {couponChannels(coupon).join() === APP_SALES_CHANNEL ? 'App only' : `Only: ${couponChannels(coupon).map(codeLabel).join(', ')}`}
                                {couponFirstChannelOrder(coupon) ? ', first order' : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canManageCoupons && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                className={`h-8 px-2 text-xs font-medium ${coupon.isActive
                                  ? 'text-slate-700 hover:bg-slate-100'
                                  : 'text-green-700 hover:bg-green-50'}`}
                                onClick={() => handleToggleActive(coupon)}
                                title={coupon.isActive ? 'Switch off' : 'Switch on'}
                              >
                                {coupon.isActive ? <FaTimesCircle className="mr-1 h-3 w-3" /> : <FaCheckCircle className="mr-1 h-3 w-3" />}
                                {coupon.isActive ? 'Switch off' : 'Switch on'}
                              </Button>
                            )}
                            {canManageCoupons && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => navigate(`/coupons/${coupon._id}/edit`)}
                                title="Edit coupon"
                                aria-label={`Edit ${coupon.code}`}
                              >
                                <FaEdit className="h-4 w-4" />
                              </Button>
                            )}
                            {canDeleteCoupons && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={busy}
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(coupon)}
                                title="Delete coupon"
                                aria-label={`Delete ${coupon.code}`}
                              >
                                <FaTrash className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Coupons;
