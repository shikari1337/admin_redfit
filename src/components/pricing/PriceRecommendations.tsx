/**
 * The prices discovery suggested (`GET /commerce/pricing/recommendations`). Items whose policy changes
 * prices automatically are applied by the run itself (status `applied`); the rest wait here for a
 * person: Adopt makes the suggestion a fixed-price rule for the item
 * (`POST /pricing/recommendations/{id}/adopt`), Dismiss closes it (`.../dismiss`).
 */
import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  Btn, FilterBar, Field, Pagination, SearchInput, SelectInput, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, type Tone,
} from '@/components/erp';
import { ConfirmDialog, ErrorNote, Notice, ReasonDialog, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { fmtRupees } from '@/lib/money';
import { formatDateTime } from '@/utils/date';
import {
  RECOMMENDATION_STATUS_WORDS, adoptRecommendation, dismissRecommendation, listRecommendations, wordsOf,
  type RecommendationRow,
} from '@/lib/v2/pricing';

const PAGE = 50;

const STATUS_TONE: Record<string, Tone> = {
  open: 'amber', applied: 'green', adopted: 'green', dismissed: 'neutral', superseded: 'neutral',
};

const PriceRecommendations: React.FC<{ canManage: boolean; onDecided?: () => void }> = ({ canManage, onDecided }) => {
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [adopting, setAdopting] = useState<RecommendationRow | null>(null);
  const [dismissing, setDismissing] = useState<RecommendationRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [status, query]);

  const list = useLoad(
    () => listRecommendations({ status: status || undefined, q: query || undefined }, PAGE, (page - 1) * PAGE),
    [status, query, page],
  );
  const rows = list.data?.rows ?? [];

  const finish = (msg: string) => {
    setDone(msg);
    setAdopting(null);
    setDismissing(null);
    void list.reload();
    onDecided?.();
  };

  const dismiss = async (row: RecommendationRow, note: string) => {
    setBusy(true);
    setError(null);
    try {
      await dismissRecommendation(row.id, note || undefined);
      finish(`Dismissed the suggestion for ${row.sku || 'the item'}.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="Show">
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Waiting for you</option>
            <option value="applied">Applied by the daily run</option>
            <option value="adopted">Adopted</option>
            <option value="dismissed">Dismissed</option>
            <option value="superseded">Replaced by a newer one</option>
            <option value="">All</option>
          </SelectInput>
        </Field>
        <Field label="Search">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU or reason" className="w-56" />
        </Field>
      </FilterBar>

      {status === 'open' && (
        <p className="text-sm text-gray-600">
          These items were not changed automatically (automatic pricing is off for them, or their cost is not known). Adopt to use the suggested price, or dismiss.
        </p>
      )}
      {done && <Notice tone="good">{done}</Notice>}
      {list.error ? <ErrorNote error={list.error} what="The suggested prices" onRetry={() => void list.reload()} /> : null}

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Suggested on</Th>
            <Th>SKU</Th>
            <Th num>Today</Th>
            <Th num>Suggested</Th>
            <Th>Why</Th>
            <Th>Status</Th>
            <Th className="text-right">Decide</Th>
          </THead>
          <TBody>
            {list.loading && !rows.length ? (
              <EmptyRow colSpan={7}>Loading the suggestions</EmptyRow>
            ) : !rows.length ? (
              <EmptyRow colSpan={7}>{status === 'open' ? 'Nothing waits for you.' : 'No suggestions here.'}</EmptyRow>
            ) : rows.map((r) => {
              const blocked = whyDisabled(canManage, [r.status !== 'open' && 'Already decided.'], 'Manage products');
              return (
                <Tr key={r.id}>
                  <Td muted className="whitespace-nowrap">{formatDateTime(r.created_at, '')}</Td>
                  <Td className="font-mono text-xs">{r.sku || 'No SKU'}</Td>
                  <Td num>{fmtRupees(r.current_price)}</Td>
                  <Td num className="font-medium">{fmtRupees(r.suggested_price)}</Td>
                  <Td className="max-w-md text-xs text-gray-700">{r.reason}</Td>
                  <Td>
                    <StatusChip status={r.status} tone={STATUS_TONE[r.status] ?? 'neutral'} label={wordsOf(r.status, RECOMMENDATION_STATUS_WORDS)} />
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {r.status === 'open' && (
                      <span className="inline-flex gap-1.5">
                        <Btn type="button" size="sm" variant="success" disabled={!!blocked} title={blocked ?? undefined}
                          onClick={() => { setDone(null); setError(null); setAdopting(r); }}>
                          <Check aria-hidden /> Adopt
                        </Btn>
                        <Btn type="button" size="sm" variant="outline" disabled={!!blocked} title={blocked ?? undefined}
                          onClick={() => { setDone(null); setError(null); setDismissing(r); }}>
                          <X aria-hidden /> Dismiss
                        </Btn>
                      </span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </table>
      </TableShell>
      <Pagination page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />

      <AdoptDialog row={adopting} onClose={() => setAdopting(null)} onDone={(on) => finish(
        on ? `Adopted: ${adopting?.sku || 'the item'} now sells at ${fmtRupees(adopting?.suggested_price ?? 0)}.`
          : `Adopted as a draft price rule for ${adopting?.sku || 'the item'}; switch the rule on to use it.`,
      )} />

      <ReasonDialog
        open={!!dismissing}
        title="Dismiss this suggestion?"
        confirmLabel="Dismiss"
        label="Note"
        optional
        min={0}
        max={500}
        busy={busy}
        error={error}
        onClose={() => setDismissing(null)}
        onConfirm={(note) => { if (dismissing) void dismiss(dismissing, note); }}
      >
        {dismissing && <p>{dismissing.sku || 'The item'} keeps its price of {fmtRupees(dismissing.current_price)}.</p>}
      </ReasonDialog>
    </div>
  );
};

/** Adopt: the suggestion becomes a fixed-price rule for the item. */
const AdoptDialog: React.FC<{ row: RecommendationRow | null; onClose: () => void; onDone: (activated: boolean) => void }> = ({ row, onClose, onDone }) => {
  const [activate, setActivate] = useState(true);
  const [follow, setFollow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (row) { setActivate(true); setFollow(false); setError(null); } }, [row]);

  const go = async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await adoptRecommendation(row.id, { activate, follow_recommendation: follow });
      onDone(activate);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog open={!!row} title="Adopt this price?" confirmLabel="Adopt" busy={busy} onClose={onClose} onConfirm={() => void go()}>
      {row && (
        <p>
          {row.sku || 'The item'} moves from {fmtRupees(row.current_price)} to {fmtRupees(row.suggested_price)} through a price rule.
        </p>
      )}
      <label className="flex items-start gap-2 pt-1 text-sm text-gray-700">
        <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="mt-0.5" />
        <span>Switch the rule on now (otherwise it is saved as a draft).</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="mt-0.5" />
        <span>Keep following this item's later suggestions.</span>
      </label>
      {error ? <ErrorNote error={error} /> : null}
    </ConfirmDialog>
  );
};

export default PriceRecommendations;
