/**
 * ERP connection ▸ Warehouses (ERP-WH-1, DEC-068/069).
 *
 * The ERP's only warehouse information is a branch code on each stock row. This tab turns
 * those codes into something staff can work with: one card per branch — this store's own
 * label for it, the warehouse (WMS facility) it stands for, whether it counts towards
 * store stock (the `stock_branches` setting, written through the branch route), and what
 * the ERP holds there. "Stock by branch" lists the ERP's items with a column per counted
 * branch; a row opens the item's batches.
 *
 * Branch figures are READ from the ERP copy; store stock is still one pooled figure per
 * SKU, set by the stock update from the counted branches. Nothing here writes stock.
 *
 *   /panel/inventory/erp/c/:id/warehouses         branches
 *   /panel/inventory/erp/c/:id/warehouses/stock   stock by branch
 *
 * Reading needs `settings.read`, every change `settings.manage`. On a server without the
 * ERP-WH-1 routes each part says "not available on this server yet".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus, RefreshCw, Warehouse } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Btn, Card, Chip, EmptyRow, EmptyState, Field, FilterBar, Pagination, SearchInput, SectionCard, SelectInput,
  TBody, Td, TextInput, Th, THead, Tr, downloadCsv,
} from '@/components/erp';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  allStockItems, daysUntil, erpApi, erpConnUrl, errorText, isNotServed, n, plural, stockFeed, unitsNum, unitsText, whenText,
  type ErpBranch, type ErpConnection, type ErpFacility, type ErpStockItem,
} from '../../../lib/v2/erp';
import ErpBatchTable, { ExpiryChip, branchName } from '../../../components/inventory/ErpBatchTable';
import {
  Code, ConfirmDialog, ErrorNote, Loading, MANAGE, Notice, NotServed, OnOff, useLoad, whyDisabled, type Loaded,
} from './shared';

const WAREHOUSES_PAGE = '/warehouses';

const ErpWarehouses: React.FC<{ c: ErpConnection; view: string; onChange: () => void }> = ({ c, view, onChange }) => {
  const branches = useLoad(() => erpApi.branches(c.id), [c.id]);
  const facilities = useLoad(() => erpApi.facilities(), []);
  const stockView = view === 'stock';

  if (!stockFeed(c)) {
    return <Notice tone="info" title="This ERP sends no stock">This connection has no stock feed, so it reports no branches.</Notice>;
  }
  if (branches.error && isNotServed(branches.error)) {
    return <NotServed what="The ERP's branches as warehouses" />;
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Warehouses views" className="flex flex-wrap items-center gap-2">
        <Btn asChild size="sm" variant={stockView ? 'outline' : 'primary'}>
          <Link to={erpConnUrl(c.id, 'warehouses')} aria-current={stockView ? undefined : 'page'}>Branches</Link>
        </Btn>
        <Btn asChild size="sm" variant={stockView ? 'primary' : 'outline'}>
          <Link to={erpConnUrl(c.id, 'warehouses/stock')} aria-current={stockView ? 'page' : undefined}>Stock by branch</Link>
        </Btn>
        <span className="flex-1" />
        <Btn variant="outline" size="sm" onClick={() => { void branches.reload(); void facilities.reload(); }} disabled={branches.loading}>
          <RefreshCw /> Refresh
        </Btn>
      </nav>
      {branches.loading && !branches.data && <Loading label="Reading the ERP's branches…" />}
      {!!branches.error && <ErrorNote error={branches.error} what="The ERP's branches" onRetry={() => void branches.reload()} />}
      {branches.data && (stockView
        ? <StockByBranch c={c} branches={branches.data} facilities={facilities.data ?? []} />
        : <Branches c={c} branches={branches} facilities={facilities} onChange={onChange} />)}
    </div>
  );
};

export default ErpWarehouses;

/* ── branches ───────────────────────────────────────────────────────────── */

function Branches({ c, branches, facilities, onChange }: {
  c: ErpConnection;
  branches: Loaded<ErpBranch[]>;
  facilities: Loaded<ErpFacility[]>;
  onChange: () => void;
}) {
  const list = branches.data ?? [];
  const seen = list.filter((b) => b.seen);
  const counted = list.filter((b) => b.counted);
  const saved = () => { void branches.reload(); onChange(); };

  if (list.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Warehouse}
          title="The ERP has not reported any branch yet."
          description="Branches appear here once the stock feed has been fetched: each stock row the ERP sends names the branch holding it."
          action={<Btn asChild variant="outline"><Link to={erpConnUrl(c.id, 'feeds')}>Go to the feeds</Link></Btn>}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="The ERP's branches"
        description="The ERP names only a branch code on each stock row. Give each one a name, say which of your warehouses it is, and choose which branches make up the store's stock."
      >
        <p className="text-sm text-gray-700">
          Store stock counts{' '}
          <strong>{counted.length === list.length ? `every branch (${n(list.length)})` : `${n(counted.length)} of ${n(list.length)} branches`}</strong>
          {counted.length > 0 && counted.length < list.length && <>: {counted.map((b) => branchName(b.code, b.label)).join(', ')}</>}.
          {' '}The ERP reported {plural(seen.length, 'branch', 'branches')} in its last fetch.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          While every branch counts, a branch the ERP starts reporting later counts automatically. Once you switch one off, a new branch counts only after you switch it on here. Changes take effect at the next stock update.
        </p>
        {!!facilities.error && (
          <Notice tone={isNotServed(facilities.error) ? 'info' : 'warn'} className="mt-3">
            Your warehouses could not be read ({errorText(facilities.error)}), so branches cannot be mapped to them just now.
          </Notice>
        )}
      </SectionCard>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((b) => (
          <BranchCard key={b.code} c={c} b={b} facilities={facilities.data} facilitiesLoading={facilities.loading} onSaved={saved} />
        ))}
      </div>
    </div>
  );
}

function BranchCard({ c, b, facilities, facilitiesLoading, onSaved }: {
  c: ErpConnection;
  b: ErpBranch;
  facilities: ErpFacility[] | null;
  facilitiesLoading: boolean;
  onSaved: () => void;
}) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const [label, setLabel] = useState(b.label ?? '');
  const [busy, setBusy] = useState<'' | 'label' | 'facility' | 'counted'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [askOff, setAskOff] = useState(false);
  useEffect(() => { setLabel(b.label ?? ''); }, [b.label]);

  // Stock rows that name no branch arrive as code "": shown, but there is nothing to address.
  const noCode = !b.code.trim();
  const noPerm = whyDisabled(canManage, [noCode && 'Stock rows that name no branch cannot be named, mapped or switched here.']);
  const facility = facilities?.find((f) => f.id === b.facility_id) ?? null;
  const labelChanged = label.trim() !== (b.label ?? '').trim();
  const labelId = `erp-branch-label-${b.code || 'none'}`;
  const whId = `erp-branch-wh-${b.code || 'none'}`;

  const save = async (patch: Parameters<typeof erpApi.setBranch>[2], which: 'label' | 'facility' | 'counted', done: string) => {
    setBusy(which);
    setNote(null);
    try {
      await erpApi.setBranch(c.id, b.code, patch);
      setNote({ ok: true, text: done });
    } catch (e) {
      // e.g. 422 erp.invalid when switching off the last counted branch: the server's own words.
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy('');
      // Always re-read: the server decides what is counted (a list naming every seen branch is
      // stored as "all"), and a refused change must show the switch as it really is.
      onSaved();
    }
  };

  const toggleCounted = () => {
    if (b.counted) { setAskOff(true); return; }
    void save({ counted: true }, 'counted', `${branchName(b.code, b.label)} counts towards store stock from the next update.`);
  };

  return (
    <Card className={cn('flex flex-col', !b.seen && 'bg-gray-50 opacity-80')}>
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {noCode ? <span className="font-semibold text-gray-900">No branch</span> : <Code>{b.code}</Code>}
            {b.label && <span className="truncate font-semibold text-gray-900">{b.label}</span>}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {facility ? <>Warehouse: <span className="font-medium text-gray-700">{facility.name}</span></>
              : b.facility_id ? 'Mapped to a warehouse that is not in your list' : 'Not mapped to a warehouse'}
          </div>
        </div>
        {!b.seen
          ? <Chip tone="neutral">not seen in the last fetch</Chip>
          : b.counted ? <Chip tone="green">Counted</Chip> : <Chip tone="neutral">Not counted</Chip>}
      </div>

      <div className="flex-1 space-y-4 p-5 text-sm">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-gray-50 px-2 py-2"><dt className="text-[11px] uppercase text-gray-500">SKUs</dt><dd className="font-semibold tabular-nums text-gray-900">{n(b.skus)}</dd></div>
          <div className="rounded-lg bg-gray-50 px-2 py-2"><dt className="text-[11px] uppercase text-gray-500">Batches</dt><dd className="font-semibold tabular-nums text-gray-900">{n(b.batches)}</dd></div>
          <div className="rounded-lg bg-gray-50 px-2 py-2"><dt className="text-[11px] uppercase text-gray-500">Units</dt><dd className="font-semibold tabular-nums text-gray-900">{unitsText(b.units)}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-1.5">
          {b.expired_batches > 0 && <Chip tone="red">{plural(b.expired_batches, 'batch', 'batches')} expired</Chip>}
          {b.expiring_30d_batches > 0 && <Chip tone="amber">{plural(b.expiring_30d_batches, 'batch', 'batches')} expiring in 30 days</Chip>}
          {b.expired_batches === 0 && b.expiring_30d_batches === 0 && <span className="text-xs text-gray-500">No batch here expires in the next 30 days.</span>}
        </div>
        <p className="text-xs text-gray-500">
          Last change at the ERP: {whenText(b.last_change_us, 'not known')}
          {!b.seen && ' · The ERP did not report this branch in its last stock fetch; its figures are what it last sent.'}
        </p>

        <div className="space-y-1">
          <label htmlFor={labelId} className="text-xs font-medium text-gray-600">Your name for it</label>
          <div className="flex gap-2">
            <TextInput
              id={labelId}
              value={label}
              maxLength={80}
              placeholder={b.code}
              disabled={!!noPerm || !!busy}
              title={noPerm ?? undefined}
              onChange={(e) => setLabel(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Btn
              size="sm"
              variant="outline"
              disabled={!!noPerm || !!busy || !labelChanged}
              title={noPerm ?? (labelChanged ? 'Save the name' : 'Type a new name first.')}
              onClick={() => void save({ label: label.trim() || null }, 'label', label.trim() ? 'Name saved.' : 'Name cleared; the branch code is shown instead.')}
            >
              {busy === 'label' ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor={whId} className="text-xs font-medium text-gray-600">Which of your warehouses it is</label>
          <SelectInput
            id={whId}
            value={b.facility_id ?? ''}
            disabled={!!noPerm || !!busy || !facilities}
            title={noPerm ?? (facilities ? undefined : facilitiesLoading ? 'Reading your warehouses…' : 'Your warehouses could not be read.')}
            onChange={(e) => {
              const id = e.target.value || null;
              const name = facilities?.find((f) => f.id === id)?.name;
              void save({ facility_id: id }, 'facility', id ? `${branchName(b.code, b.label)} is now ${name ?? 'that warehouse'}.` : 'No longer mapped to a warehouse.');
            }}
          >
            <option value="">Not mapped</option>
            {b.facility_id && !facility && <option value={b.facility_id}>A warehouse not in your list</option>}
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.name}{f.code && f.code !== f.name ? ` (${f.code})` : ''}{f.is_active ? '' : ' — inactive'}</option>
            ))}
          </SelectInput>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>{facilities && facilities.length === 0 ? 'You have no warehouses yet.' : 'For reference only: stock stays one figure per SKU.'}</span>
            <Link to={WAREHOUSES_PAGE} className="inline-flex items-center gap-1 font-medium text-gray-700 underline-offset-2 hover:underline">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Create a warehouse
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <div className="text-sm font-medium text-gray-900">Counts towards store stock</div>
            <div className="text-xs text-gray-500">{b.counted ? 'Its units are part of the stock the store sells.' : 'Its units are left out of store stock.'}</div>
          </div>
          <OnOff
            on={b.counted}
            label={`${branchName(b.code, b.label)} counts towards store stock`}
            busy={busy === 'counted'}
            disabled={!!noPerm || !!busy}
            title={noPerm ?? (b.counted ? 'Stop counting this branch' : 'Count this branch')}
            onToggle={toggleCounted}
          />
        </div>
        {noPerm && <p className="text-xs text-gray-500">{noCode ? noPerm : `${noPerm.replace(/\.$/, '')} to change this branch.`}</p>}
        {note && <Notice tone={note.ok ? 'good' : 'bad'}>{note.text}</Notice>}
      </div>

      <ConfirmDialog
        open={askOff}
        title={`Stop counting ${branchName(b.code, b.label)}?`}
        confirmLabel="Stop counting it"
        busy={busy === 'counted'}
        onClose={() => setAskOff(false)}
        onConfirm={() => {
          void save({ counted: false }, 'counted', `${branchName(b.code, b.label)} is left out of store stock from the next update.`)
            .then(() => setAskOff(false));
        }}
      >
        <p>
          At the next stock update its {unitsText(b.units)} units across {plural(b.skus, 'SKU')} stop counting, so those SKUs’ store stock goes down by what this branch holds.
        </p>
        <p>Every other branch keeps counting. A branch the ERP starts reporting later will count only after you switch it on here.</p>
      </ConfirmDialog>
    </Card>
  );
}

/* ── stock by branch ────────────────────────────────────────────────────── */

const PAGE = 50;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function nearest(item: ErpStockItem): string | null {
  let best: string | null = null;
  for (const b of item.branches) if (b.nearest_expiry && (!best || b.nearest_expiry < best)) best = b.nearest_expiry;
  return best;
}

function StockByBranch({ c, branches, facilities }: { c: ErpConnection; branches: ErpBranch[]; facilities: ErpFacility[] }) {
  const [branch, setBranch] = useState('');
  const [qText, setQText] = useState('');
  const [daysText, setDaysText] = useState('');
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<{ ok: boolean; text: string } | null>(null);
  const q = useDebounced(qText.trim());
  const daysRaw = useDebounced(daysText.trim());
  const days = daysRaw === '' ? undefined : Math.max(0, Math.min(3650, Math.floor(Number(daysRaw))));
  const daysOk = days === undefined || Number.isFinite(days);
  const filter = { branch: branch || undefined, q: q || undefined, expiring_days: daysOk ? days : undefined, unmatched: unmatchedOnly || undefined };
  const offset = (page - 1) * PAGE;
  useEffect(() => { setPage(1); }, [branch, q, daysRaw, unmatchedOnly]);

  // Every filter, "no matching SKU" included, is applied by the server before it pages.
  const active = useLoad(() => erpApi.stockItems(c.id, { ...filter, limit: PAGE, offset }), [c.id, branch, q, daysRaw, unmatchedOnly, offset]);
  const rows = active.data?.items ?? [];
  const total = active.data?.total ?? 0;

  const byCode = useMemo(() => new Map(branches.map((b) => [b.code, b])), [branches]);
  const columns = useMemo(() => {
    const cols = branches.filter((b) => b.counted).map((b) => b.code);
    if (branch && !cols.includes(branch)) cols.push(branch);
    return cols;
  }, [branches, branch]);
  const facilityName = (id: string | null) => (id ? facilities.find((f) => f.id === id)?.name ?? null : null);
  const unitsAt = (item: ErpStockItem, code: string) => item.branches.find((b) => b.code === code)?.units ?? null;
  const colLabel = (code: string) => branchName(code, byCode.get(code)?.label);

  const exportCsv = async () => {
    setExporting(true);
    setExportNote(null);
    try {
      const all = await allStockItems(c.id, filter);
      const items = all.items;
      downloadCsv(
        `erp-stock-by-branch-${c.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        [
          { key: 'item_code', label: 'ERP item code' },
          { key: 'sku_matched', label: 'Matches a SKU', format: (r: ErpStockItem) => (r.sku_matched ? 'yes' : 'no') },
          ...columns.map((code) => ({ key: `b:${code}`, label: `${colLabel(code)} units`, format: (r: ErpStockItem) => unitsAt(r, code) ?? '' })),
          { key: 'counted_units', label: 'Counted units' },
          { key: 'total_units', label: 'All branches units' },
          { key: 'nearest', label: 'Nearest expiry', format: (r: ErpStockItem) => nearest(r) ?? '' },
        ],
        items,
      );
      setExportNote(all.capped
        ? { ok: false, text: `Downloaded the first ${n(all.items.length)} of ${n(all.total)} items. Narrow the filter to get the rest.` }
        : { ok: true, text: `Downloaded ${plural(items.length, 'item')}.` });
    } catch (e) {
      setExportNote({ ok: false, text: errorText(e) });
    } finally {
      setExporting(false);
    }
  };

  if (active.error && isNotServed(active.error)) return <NotServed what="Stock by branch" />;

  return (
    <SectionCard
      title="Stock by branch"
      description="What the ERP holds of each item, branch by branch, from the last fetch. Counted is what the store's stock is set from."
      action={(
        <Btn size="sm" variant="outline" onClick={() => void exportCsv()} disabled={exporting} aria-busy={exporting}>
          <Download /> {exporting ? 'Preparing…' : 'CSV'}
        </Btn>
      )}
      flush
    >
      <div className="space-y-3 p-4">
        <FilterBar>
          <Field label="Search by code" className="w-full sm:w-56">
            <SearchInput value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Item code starts with…" aria-label="Search by item code" />
          </Field>
          <Field label="Branch" className="w-full sm:w-48">
            <SelectInput value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
              <option value="">Every branch</option>
              {branches.filter((b) => b.code !== '').map((b) => <option key={b.code} value={b.code}>{colLabel(b.code)}{b.counted ? '' : ' — not counted'}</option>)}
            </SelectInput>
          </Field>
          <Field label="Expiring within (days)" className="w-full sm:w-44">
            <TextInput type="number" inputMode="numeric" min={0} max={3650} value={daysText} placeholder="any" onChange={(e) => setDaysText(e.target.value)} aria-label="Expiring within how many days" />
          </Field>
          <label className="inline-flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input type="checkbox" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} />
            No matching SKU
          </label>
        </FilterBar>
        {!daysOk && <p className="text-xs text-red-700">Type a whole number of days.</p>}
        {exportNote && <Notice tone={exportNote.ok ? 'good' : 'warn'}>{exportNote.text}</Notice>}
      </div>

      {active.loading && !active.data && <div className="px-4 pb-4"><Loading label="Reading the ERP's stock…" /></div>}
      {!!active.error && <div className="px-4 pb-4"><ErrorNote error={active.error} what="Stock by branch" onRetry={() => void active.reload()} /></div>}
      {active.data && (
        <>
          <div className={cn('overflow-x-auto border-t border-gray-100', active.loading && 'opacity-60')} aria-busy={active.loading}>
            <table className="w-full min-w-[640px] text-sm">
              <THead>
                <Th>Item code</Th>
                {columns.map((code) => <Th key={code} num>{colLabel(code)}</Th>)}
                <Th num>Counted</Th>
                <Th num>All branches</Th>
                <Th>Nearest expiry</Th>
              </THead>
              <TBody>
                {rows.length === 0 && (
                  <EmptyRow colSpan={columns.length + 4}>
                    {branch || q || days !== undefined || unmatchedOnly ? 'No ERP item matches these filters.' : 'The ERP copy holds no stock yet. Fetch the stock feed first.'}
                  </EmptyRow>
                )}
                {rows.map((item) => (
                  <Tr key={item.item_code} className="cursor-pointer" onClick={() => setOpen(item.item_code)}>
                    <Td>
                      <button
                        type="button"
                        className="text-left font-mono text-xs font-medium text-gray-900 underline-offset-2 hover:underline"
                        onClick={(e) => { e.stopPropagation(); setOpen(item.item_code); }}
                        aria-label={`Batches of ${item.item_code}`}
                      >
                        {item.item_code}
                      </button>
                      {!item.sku_matched && <div className="mt-0.5"><Chip tone="amber">no matching SKU</Chip></div>}
                    </Td>
                    {columns.map((code) => {
                      const u = unitsAt(item, code);
                      return <Td key={code} num muted={u === null}>{u === null ? '—' : unitsText(u)}</Td>;
                    })}
                    <Td num className="font-semibold">{unitsText(item.counted_units)}</Td>
                    <Td num>{unitsText(item.total_units)}</Td>
                    <Td><ExpiryChip on={nearest(item)} /></Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </div>
          <div className="px-4"><Pagination page={page} pageSize={PAGE} total={total} onPage={setPage} /></div>
          {total > 0 && total <= PAGE && <p className="px-4 pb-3 text-xs text-gray-500">{plural(total, 'item')}.</p>}
        </>
      )}

      <ItemDrawer c={c} code={open} onClose={() => setOpen(null)} facilityName={facilityName} />
    </SectionCard>
  );
}

/* ── one item's batches ─────────────────────────────────────────────────── */

function ItemDrawer({ c, code, onClose, facilityName }: {
  c: ErpConnection;
  code: string | null;
  onClose: () => void;
  facilityName: (id: string | null) => string | null;
}) {
  const one = useLoad(() => erpApi.stockItem(c.id, code ?? ''), [c.id, code], !!code);
  const batches = one.data?.batches ?? [];
  const total = batches.reduce((s, b) => s + unitsNum(b.quantity), 0);
  const expired = batches.filter((b) => (daysUntil(b.expires_on) ?? 0) < 0).length;
  return (
    <Sheet open={!!code} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="break-all font-mono">{code}</SheetTitle>
          <SheetDescription>
            {one.data && !one.loading ? `${plural(batches.length, 'batch', 'batches')} at the ERP · ${unitsText(total)} units in all branches` : 'The ERP’s batches of this item, by branch.'}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {one.loading && <Loading label="Reading its batches…" />}
          {!!one.error && <ErrorNote error={one.error} what="This item's batches" onRetry={() => void one.reload()} />}
          {one.data && !one.loading && batches.length === 0 && <p className="text-sm text-gray-600">The ERP lists no batch of this item.</p>}
          {one.data && !one.loading && batches.length > 0 && (
            <>
              {expired > 0 && <Notice tone="bad">{plural(expired, 'batch', 'batches')} of this item {expired === 1 ? 'has' : 'have'} expired at the ERP.</Notice>}
              <ErpBatchTable batches={batches} currency={c.currency} facilityName={facilityName} connectionId={c.id} onWindowChanged={() => void one.reload()} className="rounded-lg border border-gray-200" />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
