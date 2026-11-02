/**
 * Stock sync — the tab the store owner comes to most (DEC-068 / DEC-069).
 *
 * The ERP is the stock master for a store whose stock apply is on: every hour the stock
 * feed is fetched and each matching SKU's on-hand is SET to the ERP's figure (ERP item code
 * = store SKU). This tab shows what the last update did, lets an admin run it now, switch
 * it on/off and limit it to some branches, lists every past update, and the ERP codes that
 * matched no SKU (copy / CSV). It also shows the inventory lock and its history: while the
 * apply is on, manual stock changes are locked; only an admin can unlock.
 *
 * Routes (ERP-STOCK-1, INV-LOCK-1) may not be on an older server yet: each card then says
 * so plainly instead of breaking the page.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Copy, Download, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Btn, EmptyRow, Field, Pagination, SearchInput, SectionCard, StatCard, StatGrid, StatusChip, TBody, Td, TextInput, Th, THead, Tr,
  downloadCsv,
} from '@/components/erp';
import {
  applySecs, durationText, erpApi, erpConnUrl, errorText, isNotServed, n, outcomeText, plural, statusTone, stockFeed, whenText,
  type ErpBranch, type ErpConnection, type ErpConnector, type StockApplyView,
} from '../../../lib/v2/erp';
import { useInventoryLock } from '../../../hooks/useInventoryLock';
import { useErpStockRun } from '../../../hooks/useErpStockRun';
import InventoryLockBanner from '../../../components/inventory/InventoryLockBanner';
import { ErpStockRunPanel } from '../../../components/inventory/ErpStockRunPanel';
import { isoDate } from '../../../utils/date';
import { ErrorNote, Loading, MANAGE, Notice, NotServed, useLoad, whyDisabled, Code } from './shared';

const PAGE = 20;
const APPLY = 'apply_stock';
const BRANCHES = 'stock_branches';

/**
 * A saved setting's value. The connection view names which keys are SET (`configured`) but
 * not their values; a server that also publishes non-secret values (as `config`) is read.
 * `null` = set, but this server does not show the value.
 */
function settingValue(c: ErpConnection, connector: ErpConnector | null, key: string): { value: string | null; isDefault: boolean } {
  const published = (c as unknown as { config?: Record<string, unknown> }).config;
  if (published && typeof published[key] === 'string') return { value: published[key] as string, isDefault: false };
  if (!c.configured.includes(key)) {
    const def = connector?.config_fields.find((f) => f.key === key)?.default ?? null;
    return { value: def ?? '', isDefault: true };
  }
  return { value: null, isDefault: false };
}

const ErpStockSync: React.FC<{ c: ErpConnection; connector: ErpConnector | null; connectorError: unknown; onChange: () => void }> = ({
  c, connector, connectorError, onChange,
}) => {
  const location = useLocation();
  const [page, setPage] = useState(1);
  const offset = (page - 1) * PAGE;
  const applies = useLoad(() => erpApi.stockApplies(c.id, PAGE, offset), [c.id, offset]);
  const [picked, setPicked] = useState<StockApplyView | null>(null);

  // `#unmatched` (from the Inventory page's result line) scrolls to the list once it exists.
  useEffect(() => {
    if (location.hash !== '#unmatched' || applies.loading) return;
    document.getElementById('unmatched')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, applies.loading]);

  const notServed = (c.last_stock_apply === undefined && !!applies.error && isNotServed(applies.error));
  const latest = c.last_stock_apply ?? applies.data?.items[0] ?? null;
  const shown = picked ?? latest;

  if (!stockFeed(c)) {
    return <Notice tone="info" title="This ERP sends no stock">This connection has no stock feed, so store stock cannot be set from it.</Notice>;
  }

  const reloadAll = () => { onChange(); void applies.reload(); };

  return (
    <div className="space-y-4">
      {notServed ? (
        <NotServed what="Setting store stock from the ERP" />
      ) : (
        <LastUpdate c={c} last={latest} onApplied={() => { setPicked(null); setPage(1); reloadAll(); }} />
      )}
      <LockCard />
      <ApplySettings c={c} connector={connector} connectorError={connectorError} onSaved={onChange} />
      {!notServed && (
        <SectionCard
          title="Update history"
          description="Every time store stock was set from the ERP — by the hourly run or by hand. Pick one to see its unmatched codes."
          action={<Btn variant="outline" size="sm" onClick={() => void applies.reload()} disabled={applies.loading}><RefreshCw /> Refresh</Btn>}
          flush
        >
          {applies.loading && !applies.data && <div className="p-5"><Loading label="Reading the update history…" /></div>}
          {!!applies.error && <div className="p-5"><ErrorNote error={applies.error} what="The stock update history" onRetry={() => void applies.reload()} /></div>}
          {applies.data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <THead>
                    <Th>Started</Th><Th>How</Th><Th>Result</Th><Th num>Matched</Th><Th num>SKUs changed</Th><Th num>Units ↑ / ↓</Th><Th num>Unchanged</Th><Th num>No SKU</Th><Th num>ERP items</Th><Th num>Took</Th>
                  </THead>
                  <TBody>
                    {applies.data.items.length === 0 && <EmptyRow colSpan={10}>Store stock has not been set from this ERP yet.</EmptyRow>}
                    {applies.data.items.map((a) => {
                      const on = shown?.id === a.id;
                      return (
                        <Tr key={a.id} className={on ? 'bg-gray-50' : undefined}>
                          <Td className="whitespace-nowrap">
                            <button type="button" className="text-left font-medium text-gray-900 underline-offset-2 hover:underline" onClick={() => setPicked(a)} aria-pressed={on}>
                              {whenText(a.started_us)}
                            </button>
                          </Td>
                          <Td>{a.trigger === 'schedule' ? 'Hourly' : a.trigger === 'manual' ? 'By hand' : a.trigger}</Td>
                          <Td>
                            {a.finished_us == null
                              ? <StatusChip status="running" tone="blue" label="Running" />
                              : <StatusChip status={a.status} tone={statusTone(a.status)} />}
                            {a.message && <div className="mt-0.5 max-w-xs text-xs text-gray-500">{a.message}</div>}
                          </Td>
                          <Td num>{n(a.matched)}</Td>
                          <Td num>{n(a.changed)}</Td>
                          <Td num><span className="text-emerald-700">↑{n(a.units_up)}</span> / <span className="text-red-700">↓{n(a.units_down)}</span></Td>
                          <Td num>{n(a.unchanged)}</Td>
                          <Td num>{a.unmatched > 0
                            ? <button type="button" className="font-medium text-amber-700 underline" onClick={() => setPicked(a)}>{n(a.unmatched)}</button>
                            : n(a.unmatched)}</Td>
                          <Td num>{n(a.erp_items)}</Td>
                          <Td num>{a.finished_us == null ? '—' : durationText(applySecs(a))}</Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </table>
              </div>
              <div className="px-4"><Pagination page={page} pageSize={PAGE} total={applies.data.total} onPage={setPage} /></div>
            </>
          )}
        </SectionCard>
      )}
      {!notServed && <Unmatched apply={shown} />}
    </div>
  );
};

export default ErpStockSync;

/* ── the last update, and "Update stock now" ───────────────────────────── */

function LastUpdate({ c, last, onApplied }: { c: ErpConnection; last: StockApplyView | null; onApplied: () => void }) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const [fetchFirst, setFetchFirst] = useState(true);
  // One hook for starting and following the run (also used by Inventory's "Fetch from ERP"):
  // it resumes a run already going when this tab opens, and re-reads the page when one ends.
  const runner = useErpStockRun(c.id, () => onApplied());
  const { state, running, now } = runner;
  const busy = running;
  const blocked = whyDisabled(canManage, [
    c.missing.length > 0 && `Fill in ${c.missing.join(', ')} on the Settings tab first.`,
    running && 'An update is running — its progress is shown above.',
  ]);

  const run = () => void runner.start(fetchFirst);

  return (
    <SectionCard
      title="Store stock from this ERP"
      description="Every hour the ERP’s stock is fetched and each SKU whose code matches is set to the ERP’s quantity. SKUs the ERP does not list are left alone."
    >
      <div className="space-y-4">
        {state ? (
          <ErpStockRunPanel
            run={state}
            now={now}
            label={c.label || 'the ERP'}
            connectionId={c.id}
            onRetry={() => void runner.start(state.fetchFirst)}
            onStop={canManage ? runner.stop : undefined}
            onRestart={canManage ? runner.restart : undefined}
            onDismiss={runner.dismiss}
            onRefreshHistory={onApplied}
          />
        ) : last ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <StatusChip status={last.status} tone={statusTone(last.status)} />
              <span>Last updated {whenText(last.finished_us ?? last.started_us)} ({last.trigger === 'schedule' ? 'hourly run' : 'by hand'}) · every hour</span>
            </div>
            <StatGrid cols={4}>
              <StatCard label="SKUs changed" value={n(last.changed)} sub={`↑${n(last.units_up)} ↓${n(last.units_down)} units`} />
              <StatCard label="Unchanged" value={n(last.unchanged)} sub={`${n(last.matched)} matched a SKU`} />
              <StatCard label="ERP codes with no SKU" value={n(last.unmatched)} tone={last.unmatched > 0 ? 'warn' : 'default'} sub={`of ${n(last.erp_items)} ERP items`} />
              <StatCard label="Part units dropped" value={n(last.fractional)} sub="Non-whole quantities are rounded down" />
            </StatGrid>
            {last.message && <Notice tone={last.status === 'ok' ? 'info' : 'warn'}>{last.message}</Notice>}
            {last.fetch && (
              <p className="text-xs text-gray-500">
                ERP fetch before it: <StatusChip status={last.fetch.status} tone={statusTone(last.fetch.status)} /> {outcomeText(last.fetch)}{last.fetch.message ? ` — ${last.fetch.message}` : ''}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600">Store stock has not been set from this ERP yet. The hourly run will do it, or update it now.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Btn onClick={run} disabled={!!blocked || busy} title={blocked ?? 'Set store stock from the ERP now'} aria-busy={busy}>
            <RefreshCw /> {busy ? 'Updating stock…' : 'Update stock now'}
          </Btn>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={fetchFirst} onChange={(e) => setFetchFirst(e.target.checked)} disabled={busy} />
            Fetch fresh stock from the ERP first
          </label>
        </div>
        {blocked && !running && <p className="text-xs text-gray-500">{blocked}</p>}
        {!c.enabled && <p className="text-xs text-amber-700">This connection is paused, so the hourly run is not updating stock.</p>}
      </div>
    </SectionCard>
  );
}

/* ── the inventory lock and its history (DEC-069) ───────────────────────── */

function LockCard() {
  const lock = useInventoryLock();
  if (lock.loading) return null;
  if (lock.unavailable) {
    return (
      <SectionCard title="Inventory lock">
        <p className="text-sm text-gray-600">
          Locking manual stock changes while the ERP keeps stock is not available on this server yet, so manual changes are still accepted — and overwritten at the next hourly update.
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Inventory lock"
      description="While stock is set from the ERP, manual stock changes are locked so they are not silently overwritten. Downloads and the ERP order export always stay open. Only an admin can unlock."
      flush
    >
      <div className="space-y-3 p-5">
        <InventoryLockBanner />
        {!lock.state?.locked && lock.events.length === 0 && (
          <p className="text-sm text-gray-600">Stock is not locked. Switching the stock update on locks it.</p>
        )}
      </div>
      <div className="overflow-x-auto border-t border-gray-100">
        <table className="w-full min-w-[640px] text-sm">
          <THead><Th>When</Th><Th>What</Th><Th>Who</Th><Th>Why</Th></THead>
          <TBody>
            {lock.events.length === 0 && <EmptyRow colSpan={4}>No lock history yet.</EmptyRow>}
            {lock.events.map((e, i) => (
              <Tr key={`${e.since_us ?? 0}-${i}`}>
                <Td className="whitespace-nowrap">{whenText(e.since_us, '—')}</Td>
                <Td>{e.locked ? <StatusChip status="blocked" label="Locked" /> : <StatusChip status="open" label="Unlocked" />}
                  {e.source && <div className="mt-0.5 text-xs text-gray-500">{e.source.startsWith('erp:') ? 'by the ERP setting' : e.source}</div>}
                </Td>
                <Td>{e.by_name || <span className="text-gray-400">the system</span>}</Td>
                <Td className="max-w-sm break-words">{e.reason || <span className="text-gray-400">—</span>}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </div>
    </SectionCard>
  );
}

/* ── on/off and branches ────────────────────────────────────────────────── */

/** The counted branches in a line: from the branch list when it is read, else from the saved setting. */
function countedSummary(list: ErpBranch[] | null, saved: string | null): string {
  if (list && list.length > 0) {
    const counted = list.filter((b) => b.counted);
    if (counted.length === list.length) return `Every branch (${n(list.length)})`;
    if (counted.length === 0) return 'No branch';
    return counted.map((b) => (b.label ? `${b.label} (${b.code})` : b.code)).join(', ');
  }
  if (saved === null) return 'Set (this server does not show which)';
  return saved.trim() ? saved : 'Every branch';
}

function ApplySettings({ c, connector, connectorError, onSaved }: { c: ErpConnection; connector: ErpConnector | null; connectorError: unknown; onSaved: () => void }) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const lock = useInventoryLock();
  const applyField = connector?.config_fields.find((f) => f.key === APPLY) ?? null;
  const branchField = connector?.config_fields.find((f) => f.key === BRANCHES) ?? null;
  const apply = settingValue(c, connector, APPLY);
  const branches = settingValue(c, connector, BRANCHES);
  // What was saved in this visit, since the server may not echo values back.
  const [savedApply, setSavedApply] = useState<string | null>(null);
  const [branchText, setBranchText] = useState('');
  const [busy, setBusy] = useState<'' | 'apply' | 'branches'>('');
  // ERP-WH-1: which branches count is chosen per branch on the Warehouses tab; the free-text
  // field stays here as a read-only summary. On a server without the branch routes it stays editable.
  const branchList = useLoad(() => erpApi.branches(c.id), [c.id, c.configured.join(',')]);
  const perBranch = !(branchList.error && isNotServed(branchList.error));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const noPerm = canManage ? undefined : 'You need the Manage settings permission.';

  if (connectorError) return <ErrorNote error={connectorError} what="This ERP's settings" />;
  if (!connector) return <Loading label="Reading this ERP’s settings…" />;
  if (!applyField) return <NotServed what="Switching the stock update on or off" />;

  const current = savedApply ?? apply.value;
  const on = current === null ? null : current.trim().toLowerCase() !== 'off';

  const save = async (patch: Record<string, string>, which: 'apply' | 'branches', done: string) => {
    setBusy(which);
    setNote(null);
    try {
      await erpApi.update(c.id, { config: patch });
      if (which === 'apply') setSavedApply(patch[APPLY]);
      if (which === 'branches') setBranchText('');
      setNote({ ok: true, text: done });
      onSaved();
      void lock.reload(); // switching the apply on/off locks / releases the inventory
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy('');
    }
  };

  return (
    <SectionCard title="Stock update settings">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-900">{applyField.label}</div>
          <p className="text-xs text-gray-500">{applyField.help}</p>
          <p className="text-sm text-gray-700">
            Now: {on === null ? <span className="text-gray-500">saved earlier (this server does not show which)</span>
              : <StatusChip status={on ? 'active' : 'inactive'} label={on ? 'On' : 'Off'} />}
            {apply.isDefault && savedApply === null && <span className="ml-1 text-xs text-gray-500">(the default)</span>}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={applyField.label}>
            <Btn size="sm" variant={on === true ? 'primary' : 'outline'} aria-pressed={on === true} disabled={!canManage || !!busy} title={noPerm}
              onClick={() => void save({ [APPLY]: 'on' }, 'apply', 'Stock update switched on. Manual stock changes are now locked; the next hourly run sets stock from the ERP.')}>
              {busy === 'apply' && on !== true ? 'Saving…' : 'On'}
            </Btn>
            <Btn size="sm" variant={on === false ? 'primary' : 'outline'} aria-pressed={on === false} disabled={!canManage || !!busy} title={noPerm}
              onClick={() => void save({ [APPLY]: 'off' }, 'apply', 'Stock update switched off. Store stock is no longer set from the ERP, and manual changes are unlocked.')}>
              {busy === 'apply' && on !== false ? 'Saving…' : 'Off'}
            </Btn>
          </div>
          <p className="text-xs text-gray-500">On locks manual stock changes (only an admin can unlock); Off releases the lock.</p>
        </div>

        {branchField && perBranch ? (
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <Field label={branchField.label}>
              <TextInput
                readOnly
                aria-readonly
                value={countedSummary(branchList.data, branches.value)}
                className="max-w-md bg-gray-50 text-gray-700"
              />
              <span className="text-xs text-gray-500">
                Chosen branch by branch on the Warehouses tab, where each branch also gets a name and a warehouse.
              </span>
            </Field>
            <Btn asChild size="sm" variant="outline"><Link to={erpConnUrl(c.id, 'warehouses')}>Choose branches</Link></Btn>
          </div>
        ) : branchField ? (
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <Field label={branchField.label}>
              <TextInput
                value={branchText}
                disabled={!canManage || !!busy}
                placeholder={branches.value === null ? 'set — type to replace' : branches.value ? branches.value : 'every branch'}
                onChange={(e) => setBranchText(e.target.value)}
                className="max-w-md"
              />
              <span className="text-xs text-gray-500">{branchField.help || 'Comma-separated ERP branch codes to count. Empty counts every branch.'}</span>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Btn size="sm" disabled={!canManage || !!busy || !branchText.trim()} title={noPerm ?? (branchText.trim() ? undefined : 'Type the branch codes first.')}
                onClick={() => void save({ [BRANCHES]: branchText.split(',').map((s) => s.trim()).filter(Boolean).join(',') }, 'branches', 'Branches saved. The next update counts only those.')}>
                {busy === 'branches' ? 'Saving…' : 'Save branches'}
              </Btn>
              {c.configured.includes(BRANCHES) && (
                <Btn size="sm" variant="outline" disabled={!canManage || !!busy} title={noPerm}
                  onClick={() => void save({ [BRANCHES]: '' }, 'branches', 'Every branch is counted again.')}>
                  Count every branch
                </Btn>
              )}
            </div>
          </div>
        ) : (
          <p className="border-t border-gray-100 pt-4 text-xs text-gray-500">Limiting the update to some ERP branches is not available on this server yet.</p>
        )}
        {note && <Notice tone={note.ok ? 'good' : 'bad'}>{note.text}</Notice>}
      </div>
    </SectionCard>
  );
}

/* ── ERP codes with no matching SKU ─────────────────────────────────────── */

function Unmatched({ apply }: { apply: StockApplyView | null }) {
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const codes = apply?.unmatched_codes ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? codes.filter((code) => code.toLowerCase().includes(needle)) : codes;
  }, [codes, q]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(`Copied ${plural(codes.length, 'code')}.`);
    } catch {
      setCopied('This browser would not copy. Use Download CSV instead.');
    }
    setTimeout(() => setCopied(null), 4000);
  };

  const csv = () => downloadCsv(
    `erp-unmatched-codes-${apply ? isoDate(new Date(apply.started_us / 1000)) || 'none' : 'none'}`,
    [{ key: 'code', label: 'ERP item code' }],
    codes.map((code) => ({ code })),
  );

  return (
    <div id="unmatched" className="scroll-mt-20">
      <SectionCard
        title="ERP codes with no matching SKU"
        description={apply
          ? `From the update of ${whenText(apply.started_us)}. Each is an ERP item whose code is not the SKU of any product here, so its stock was not used. Add the SKU (or correct it) and the next update picks it up.`
          : 'Nothing to show until stock has been set from the ERP once.'}
        action={codes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="outline" onClick={() => void copy()}><Copy /> Copy all</Btn>
            <Btn size="sm" variant="outline" onClick={csv}><Download /> CSV</Btn>
          </div>
        )}
      >
        {apply && codes.length === 0 && (
          <p className="text-sm text-gray-600">{apply.unmatched > 0 ? `${plural(apply.unmatched, 'code')} had no SKU, but this update did not keep the list.` : 'Every ERP code matched a SKU.'}</p>
        )}
        {codes.length > 0 && (
          <div className="space-y-3">
            {apply && apply.unmatched > codes.length && (
              <p className="text-xs text-amber-700">Showing the first {n(codes.length)} of {n(apply.unmatched)} — the server keeps a limited list per update.</p>
            )}
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a code" aria-label="Find a code" className="w-full sm:w-64" />
            {copied && <p className="text-xs text-gray-600" role="status">{copied}</p>}
            <ul className="flex max-h-80 flex-wrap gap-1.5 overflow-auto" aria-label="Unmatched ERP codes">
              {filtered.map((code) => <li key={code}><Code>{code}</Code></li>)}
            </ul>
            {filtered.length === 0 && <p className="text-sm text-gray-500">No code contains “{q}”.</p>}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
