/**
 * Every catalogue price the daily run, a revert or a person wrote (`GET /commerce/pricing/changes`,
 * newest first), with Undo: `POST /pricing/changes/{id}/revert {note?, freeze?}` puts the price back
 * to what it was before and, with freeze, keeps the daily run off that item from then on.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import {
  Btn, FilterBar, Field, Pagination, SearchInput, SelectInput, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from '@/components/erp';
import { ConfirmDialog, ErrorNote, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { errorCode } from '@/lib/v2/erp';
import { fmtRupees } from '@/lib/money';
import { saveBlob } from '@/lib/saveBlob';
import { shownActor } from '@/lib/v2/activityLog';
import { formatDateTime } from '@/utils/date';
import {
  PRICING_CODES, SOURCE_WORDS, exportChanges, listChanges, revertChange, wordsOf,
  type ChangeFilters, type PriceChangeRow,
} from '@/lib/v2/pricing';

const PAGE = 50;

function changePct(before: number, after: number): string {
  if (!before) return '';
  const p = ((after - before) / before) * 100;
  const r = Math.round(p * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}%`;
}

const PriceChanges: React.FC<{
  canManage: boolean;
  /** A run's changes only (from the Runs tab). */
  runId?: string | null;
  /** One item's changes only (from the product form). */
  variationId?: string | null;
  /** Drops the run or item filter. */
  onClearFilter?: () => void;
}> = ({ canManage, runId, variationId, onClearFilter }) => {
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [undo, setUndo] = useState<PriceChangeRow | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>(null);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [source, query, runId, variationId]);

  const filters: ChangeFilters = useMemo(() => ({
    source: source || undefined,
    q: query || undefined,
    run_id: runId || undefined,
    variation_id: variationId || undefined,
  }), [source, query, runId, variationId]);

  const list = useLoad(() => listChanges(filters, PAGE, (page - 1) * PAGE), [filters, page]);
  const rows = list.data?.rows ?? [];
  /** Changes on this page that a later row already undid. */
  const undone = useMemo(() => new Set(rows.map((r) => r.reverts_id).filter(Boolean) as string[]), [rows]);

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await exportChanges(filters);
      saveBlob(blob instanceof Blob ? blob : new Blob([blob as BlobPart]), 'price-changes.csv');
    } catch (e) {
      setDownloadError(e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="Search">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU or reason" className="w-56" />
        </Field>
        <Field label="Made by">
          <SelectInput value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Everyone</option>
            <option value="discovery">The daily run</option>
            <option value="revert">Undo</option>
            <option value="person">A person</option>
          </SelectInput>
        </Field>
        <Btn type="button" variant="outline" onClick={() => void download()} disabled={downloading}>
          <Download aria-hidden /> {downloading ? 'Preparing' : 'Download'}
        </Btn>
      </FilterBar>

      {(runId || variationId) && (
        <Notice tone="info">
          Showing {runId ? "one run's" : "one item's"} changes only.{' '}
          {onClearFilter && <button type="button" className="font-medium underline" onClick={onClearFilter}>Show every change</button>}
        </Notice>
      )}
      {done && <Notice tone="good">{done}</Notice>}
      {downloadError ? <ErrorNote error={downloadError} what="The download" /> : null}
      {list.error ? <ErrorNote error={list.error} what="The price changes" onRetry={() => void list.reload()} /> : null}

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>When</Th>
            <Th>SKU</Th>
            <Th num>Before</Th>
            <Th num>After</Th>
            <Th num>Change</Th>
            <Th>Why</Th>
            <Th>By</Th>
            <Th className="text-right">Undo</Th>
          </THead>
          <TBody>
            {list.loading && !rows.length ? (
              <EmptyRow colSpan={8}>Loading the changes</EmptyRow>
            ) : !rows.length ? (
              <EmptyRow colSpan={8}>No price has been changed yet{runId ? ' by this run' : variationId ? ' for this item' : ''}.</EmptyRow>
            ) : rows.map((r) => {
              const isUndo = r.source === 'revert';
              const wasUndone = undone.has(r.id);
              const blocked = whyDisabled(canManage, [
                isUndo && 'An undo cannot itself be undone.',
                wasUndone && 'Already undone.',
              ], 'Manage products');
              return (
                <Tr key={r.id}>
                  <Td muted className="whitespace-nowrap">{formatDateTime(r.at, '')}</Td>
                  <Td className="font-mono text-xs">{r.sku || 'No SKU'}</Td>
                  <Td num>{fmtRupees(r.price_before)}</Td>
                  <Td num className="font-medium">{fmtRupees(r.price_after)}</Td>
                  <Td num muted>{changePct(Number(r.price_before), Number(r.price_after))}</Td>
                  <Td className="max-w-md text-xs text-gray-700">
                    {isUndo ? <StatusChip status="reversed" label="Undo of an earlier change" /> : (r.reason || 'No reason recorded')}
                    {wasUndone && <span className="ml-2"><StatusChip status="reversed" label="Undone" /></span>}
                  </Td>
                  <Td muted className="whitespace-nowrap text-xs">
                    {r.actor_kind === 'service' ? 'Daily run' : (shownActor(r.actor_name, r.actor_kind) || wordsOf(r.source, SOURCE_WORDS))}
                  </Td>
                  <Td className="text-right">
                    <Btn type="button" size="sm" variant="outline" disabled={!!blocked} title={blocked ?? 'Put the price back to what it was before'}
                      onClick={() => { setDone(null); setUndo(r); }}>
                      <RotateCcw aria-hidden /> Undo
                    </Btn>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </table>
      </TableShell>
      <Pagination page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />

      <UndoDialog
        change={undo}
        onClose={() => setUndo(null)}
        onDone={(frozen) => {
          setDone(`Price put back to ${fmtRupees(undo?.price_before ?? 0)}${frozen ? ', and the daily run now leaves this item alone' : ''}.`);
          setUndo(null);
          void list.reload();
        }}
      />
    </div>
  );
};

/** Undo one change, with a note and an optional freeze. */
const UndoDialog: React.FC<{
  change: PriceChangeRow | null;
  onClose: () => void;
  onDone: (frozen: boolean) => void;
}> = ({ change, onClose, onDone }) => {
  const [note, setNote] = useState('');
  const [freeze, setFreeze] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => { if (change) { setNote(''); setFreeze(false); setError(null); } }, [change]);

  const go = async () => {
    if (!change) return;
    setBusy(true);
    setError(null);
    try {
      const out = await revertChange(change.id, { note: note.trim() || undefined, freeze });
      onDone(!!out?.frozen);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const code = error ? errorCode(error) : '';
  return (
    <ConfirmDialog
      open={!!change}
      title="Undo this price change?"
      confirmLabel="Undo the change"
      busy={busy}
      confirmDisabled={note.length > 500}
      onClose={onClose}
      onConfirm={() => void go()}
    >
      {change && (
        <p>
          {change.sku || 'This item'} goes back from {fmtRupees(change.price_after)} to {fmtRupees(change.price_before)}.
          The undo is logged too.
        </p>
      )}
      <label className="block pt-1 text-xs font-medium text-gray-700" htmlFor="undo-note">Note (optional)</label>
      <textarea
        id="undo-note"
        value={note}
        maxLength={500}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
      />
      <label className="flex items-start gap-2 pt-1 text-sm text-gray-700">
        <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} className="mt-0.5" />
        <span>Also freeze this item, so the daily run never changes its price again (until you switch freeze off on the item).</span>
      </label>
      {code === PRICING_CODES.notRevertible && (
        <Notice tone="warn">This change cannot be undone: it was undone already, or it is itself an undo.</Notice>
      )}
      {code === PRICING_CODES.changedSince && (
        <Notice tone="warn">The price changed again after this change. Undo the later change first.</Notice>
      )}
      {error && code !== PRICING_CODES.notRevertible && code !== PRICING_CODES.changedSince ? <ErrorNote error={error} /> : null}
    </ConfirmDialog>
  );
};

export default PriceChanges;
