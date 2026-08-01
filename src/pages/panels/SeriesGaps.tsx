import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid, StatusChip, Chip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, num,
  FilterBar, Field, SelectInput, SearchInput, ExportMenu, type CsvColumn,
} from '../../components/erp';

/**
 * NUMBER SERIES & GAPS — invariant I7's second clause made visible
 * ("Every document series has no gaps; every gap has a recorded, approved
 * reason" — Part II §C.2, CGST Rule 46(b)).
 *
 * Plain-language purpose: "The GST officer will ask about every missing number —
 * write the answer down now." Invoice, receipt, journal and challan numbers must
 * run 1, 2, 3 with no holes. Because numbers are allocated inside the same
 * transaction as the document, a cancelled entry gives its number back and no
 * hole appears. A hole can therefore only mean a numbered document was DELETED
 * after it was saved — and that is exactly what an assessment asks about.
 *
 * Recording a reason does NOT fill the hole and never re-issues a number: the
 * total hole count on this page never drops. What changes is that each hole
 * stops being "unexplained" and starts carrying a written answer, the person who
 * approved it, and the date. The `auditor` role can read every word of this page
 * and change nothing (accounting.read without accounting.post).
 */

interface SeriesRow {
  docType: string;
  seriesCode: string;
  fy: string;
  key: string;
  nextNumberFormatted: string;
  lastNumber: number;
  issued: number;
  totalGaps: number;
  registeredGaps: number;
  unregisteredGaps: number;
  duplicates: number;
  beyondCounter: number;
  verifiable: boolean;
  unverifiableReason: string | null;
  consumer: string | null;
  status: 'clean' | 'adjudicated' | 'action_needed' | 'unverifiable';
}

interface Summary {
  registerPresent: boolean;
  applicable: boolean;
  detail: string;
  totals: {
    seriesScanned: number; seriesVerified: number; seriesUnverifiable: number;
    seriesWithGaps: number; totalGaps: number; registeredGaps: number;
    unregisteredGaps: number; duplicates: number; beyondCounter: number;
  };
  rows: SeriesRow[];
}

interface GapRow {
  docType: string; seriesCode: string; fy: string; key: string;
  gapNumber: number; documentNumber: string;
  status: 'registered' | 'unadjudicated';
  reason: string | null;
  approvedBy: string | null; approvedByName: string | null;
  approvedAt: string | null;
  source: 'auto' | 'manual' | null;
  detectedAt: string | null;
}

interface GapLedger {
  registerPresent: boolean;
  rows: GapRow[];
  counts: { total: number; registered: number; unadjudicated: number; returned: number };
  truncated: boolean;
}

const STATUS_LABEL: Record<SeriesRow['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  clean: { label: 'No gaps', tone: 'green' },
  adjudicated: { label: 'All answered', tone: 'green' },
  action_needed: { label: 'Answer needed', tone: 'red' },
  unverifiable: { label: 'Cannot check', tone: 'neutral' },
};

/** Human doc type: 'purchase_order' → 'Purchase order'. */
const human = (s: string) => {
  const t = s.replace(/_+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// CSV of the on-screen series table (the register itself is the audit output).
const seriesCols: CsvColumn<SeriesRow>[] = [
  { key: 'docType', label: 'Document', format: (r) => human(r.docType) },
  { key: 'seriesCode', label: 'Series' },
  { key: 'fy', label: 'Year' },
  { key: 'nextNumberFormatted', label: 'Next number' },
  { key: 'issued', label: 'Issued' },
  { key: 'totalGaps', label: 'Missing' },
  { key: 'registeredGaps', label: 'Answered' },
  { key: 'unregisteredGaps', label: 'Unexplained' },
  { key: 'status', label: 'Status', format: (r) => STATUS_LABEL[r.status].label },
];
// CSV of one series' gap ledger (the assessment-pack detail).
const gapCols: CsvColumn<GapRow>[] = [
  { key: 'documentNumber', label: 'Missing number' },
  { key: 'status', label: 'Status', format: (r) => (r.status === 'registered' ? 'Answered' : 'Unexplained') },
  { key: 'reason', label: 'Recorded reason', format: (r) => r.reason ?? '' },
  { key: 'approvedByName', label: 'Approved by', format: (r) => r.approvedByName ?? (r.approvedBy ? 'recorded' : '') },
  { key: 'approvedAt', label: 'When', format: (r) => (r.approvedAt ? String(r.approvedAt).slice(0, 10) : '') },
  { key: 'source', label: 'Entry', format: (r) => (r.source === 'auto' ? 'bulk' : r.source === 'manual' ? 'by hand' : '') },
];

const SeriesGaps: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [openSeries, setOpenSeries] = useState<SeriesRow | null>(null);
  const [ledger, setLedger] = useState<GapLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);

  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState('');

  // Client-side filter/search over the detected series (one row per series).
  const [seriesSearch, setSeriesSearch] = useState('');
  const [seriesStatus, setSeriesStatus] = useState<'' | SeriesRow['status']>('');

  const loadSummary = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setSummary(payload<Summary>(await api.get('/accounting/series-gaps/summary')));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setLoading(false); }
  }, []);

  const loadLedger = useCallback(async (s: SeriesRow, unadjudicatedOnly: boolean) => {
    setLedgerLoading(true); setError('');
    try {
      const data = payload<GapLedger>(await api.get('/accounting/series-gaps', {
        params: {
          docType: s.docType, seriesCode: s.seriesCode, fy: s.fy,
          ...(unadjudicatedOnly ? { unadjudicated: 1 } : {}),
          limit: 2000,
        },
      }));
      setLedger(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setLedgerLoading(false); }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const openDrill = (s: SeriesRow) => {
    setOpenSeries(s); setSelected([]); setReason(''); setNotice('');
    setOnlyOpen(s.unregisteredGaps > 0);
    loadLedger(s, s.unregisteredGaps > 0);
  };

  const closeDrill = () => { setOpenSeries(null); setLedger(null); setSelected([]); setReason(''); };

  const openRows = useMemo(
    () => (ledger?.rows ?? []).filter((r) => r.status === 'unadjudicated'),
    [ledger],
  );

  const filteredSeries = useMemo(() => {
    const q = seriesSearch.trim().toLowerCase();
    return (summary?.rows ?? []).filter((s) => {
      if (seriesStatus && s.status !== seriesStatus) return false;
      if (q && !`${human(s.docType)} ${s.seriesCode} ${s.fy}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [summary, seriesSearch, seriesStatus]);

  const toggle = (n: number) =>
    setSelected((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  const selectAllOpen = () => setSelected(openRows.map((r) => r.gapNumber));

  const record = async () => {
    if (!openSeries || !selected.length) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const res = payload<any>(await api.post('/accounting/series-gaps/record', {
        docType: openSeries.docType, seriesCode: openSeries.seriesCode, fy: openSeries.fy,
        gapNumbers: selected, reason,
      }));
      const bits = [`${res.recorded} gap(s) answered`];
      if (res.alreadyRegistered) bits.push(`${res.alreadyRegistered} already had an answer`);
      if (res.rejected?.length) bits.push(`${res.rejected.length} refused: ${res.rejected[0].why}`);
      setNotice(bits.join(' · '));
      setSelected([]); setReason('');
      await loadLedger(openSeries, onlyOpen);
      await loadSummary();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setSaving(false); }
  };

  const bulkAdjudicate = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const res = payload<any>(await api.post('/accounting/series-gaps/adjudicate-all', {
        reason: bulkReason,
      }));
      setNotice(`${res.recorded} gap(s) answered across ${res.seriesTouched} series · `
        + `${res.remainingUnregistered} still unanswered`);
      setBulkOpen(false); setBulkReason('');
      await loadSummary();
      if (openSeries) await loadLedger(openSeries, onlyOpen);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setSaving(false); }
  };

  const t = summary?.totals;

  return (
    <Page>
      <PageHeader
        title="Number Series & Gaps"
        description="The GST officer will ask about every missing number — write the answer down now. Invoice, receipt and journal numbers must run without holes; where a hole exists, this is the register of why."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu filename="number-series-gaps" columns={seriesCols} rows={filteredSeries} disabled={!filteredSeries.length} />
            <Btn variant="outline" onClick={loadSummary} disabled={loading}>
              {loading ? 'Checking…' : 'Re-check'}
            </Btn>
            {canPost && (t?.unregisteredGaps ?? 0) > 0 && (
              <Btn onClick={() => setBulkOpen((v) => !v)}>Answer all unexplained</Btn>
            )}
          </div>
        }
      />

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
        A number is allocated in the same breath as the document, so cancelling an entry hands its
        number straight back — nothing is lost. A hole therefore means a numbered document was
        <span className="font-medium"> deleted after it was saved</span>. Writing the reason down here
        does not fill the hole and never re-issues the number: the total never falls. What changes is
        that the hole stops being unexplained.
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      {summary && !summary.registerPresent && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This store's database has not received the gap register yet (migration 080), so reasons
          cannot be recorded. Holes are still detected and listed below.
        </div>
      )}

      {t && (
        <StatGrid cols={4}>
          <StatCard label="Missing numbers" value={num(t.totalGaps)}
            tone={t.totalGaps > 0 ? 'warn' : 'good'}
            sub={`across ${t.seriesWithGaps} of ${t.seriesScanned} series`} />
          <StatCard label="Unexplained" value={num(t.unregisteredGaps)}
            tone={t.unregisteredGaps > 0 ? 'bad' : 'good'}
            sub={t.unregisteredGaps > 0 ? 'an assessment would ask about these' : 'every hole has a written answer'} />
          <StatCard label="Answered" value={num(t.registeredGaps)} tone="good"
            sub="reason + approver on record" />
          <StatCard label="Duplicate / past-counter"
            value={num(t.duplicates + t.beyondCounter)}
            tone={t.duplicates + t.beyondCounter > 0 ? 'bad' : 'good'}
            sub="a number issued twice, or ahead of the counter" />
        </StatGrid>
      )}

      {bulkOpen && canPost && (
        <SectionCard
          title="Answer every unexplained gap with one reason"
          description="Use this only when one sentence honestly covers all of them — for example a data migration or a development back-fill. The same words are stored against every hole and marked as a bulk entry, so an auditor can see it was not decided hole by hole."
        >
          <div className="space-y-3 px-4 pb-4">
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={2}
              maxLength={500}
              placeholder="e.g. test fixtures deleted during development, before this register existed"
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Btn onClick={bulkAdjudicate} disabled={saving || bulkReason.trim().length < 3}>
                {saving ? 'Recording…' : `Answer all ${num(t?.unregisteredGaps ?? 0)}`}
              </Btn>
              <Btn variant="ghost" onClick={() => setBulkOpen(false)}>Cancel</Btn>
            </div>
          </div>
        </SectionCard>
      )}

      {(summary?.rows.length ?? 0) > 0 && (
        <FilterBar>
          <Field label="Search">
            <SearchInput placeholder="Document, series or year…" value={seriesSearch} onChange={(e) => setSeriesSearch(e.target.value)} />
          </Field>
          <Field label="Status">
            <SelectInput value={seriesStatus} onChange={(e) => setSeriesStatus(e.target.value as any)}>
              <option value="">All</option>
              <option value="action_needed">Answer needed</option>
              <option value="adjudicated">All answered</option>
              <option value="clean">No gaps</option>
              <option value="unverifiable">Cannot check</option>
            </SelectInput>
          </Field>
        </FilterBar>
      )}

      <SectionCard
        title="Your number series"
        description="One row per series. “Next number” is what the next document will carry; “Issued” is how many documents are actually in the books behind it."
        flush
      >
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Document</Th><Th>Series</Th><Th>Year</Th><Th>Next number</Th>
              <Th num>Issued</Th><Th num>Missing</Th><Th num>Answered</Th><Th num>Unexplained</Th>
              <Th>Status</Th><Th />
            </THead>
            <TBody>
              {!loading && (summary?.rows.length ?? 0) === 0 && (
                <EmptyRow colSpan={10}>
                  No document numbers have been issued on this store yet.
                </EmptyRow>
              )}
              {!loading && (summary?.rows.length ?? 0) > 0 && filteredSeries.length === 0 && (
                <EmptyRow colSpan={10}>No series match these filters.</EmptyRow>
              )}
              {loading && <EmptyRow colSpan={10}>Checking every series…</EmptyRow>}
              {filteredSeries.map((s) => {
                const st = STATUS_LABEL[s.status];
                return (
                  <Tr key={s.key} className={s.unregisteredGaps > 0 ? 'bg-red-50/40' : ''}>
                    <Td className="font-medium text-gray-900">{human(s.docType)}</Td>
                    <Td muted>{s.seriesCode}</Td>
                    <Td muted>{s.fy}</Td>
                    <Td className="font-mono text-xs">{s.nextNumberFormatted}</Td>
                    <Td num className="tabular-nums">{num(s.issued)}</Td>
                    <Td num className="tabular-nums">{num(s.totalGaps)}</Td>
                    <Td num className="tabular-nums text-emerald-700">{num(s.registeredGaps)}</Td>
                    <Td num className={`tabular-nums ${s.unregisteredGaps > 0 ? 'font-semibold text-red-700' : ''}`}>
                      {num(s.unregisteredGaps)}
                    </Td>
                    <Td>
                      <StatusChip status={s.status} tone={st.tone} label={st.label} />
                      {!s.verifiable && s.unverifiableReason && (
                        <div className="mt-0.5 text-[11px] text-gray-500">{s.unverifiableReason}</div>
                      )}
                    </Td>
                    <Td num>
                      {s.totalGaps > 0 && (
                        <Btn variant="outline" onClick={() => openDrill(s)}>View gaps</Btn>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      {openSeries && (
        <SectionCard
          title={`${human(openSeries.docType)} · ${openSeries.seriesCode} · ${openSeries.fy}`}
          description={openSeries.consumer
            ? `Checked against ${openSeries.consumer}. Every number below was handed out but has no document behind it.`
            : 'Every number below was handed out but has no document behind it.'}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={(e) => {
                    setOnlyOpen(e.target.checked);
                    setSelected([]);
                    loadLedger(openSeries, e.target.checked);
                  }}
                />
                Unexplained only
              </label>
              <Btn variant="ghost" onClick={closeDrill}>Close</Btn>
            </div>
          }
        >
          <div className="space-y-3 px-4 pb-4">
            {ledgerLoading && <div className="text-sm text-gray-500">Loading gaps…</div>}

            {!ledgerLoading && ledger && ledger.rows.length === 0 && (
              <EmptyState
                title="Nothing to answer"
                description="Every missing number in this series already carries a written reason."
              />
            )}

            {!ledgerLoading && ledger && ledger.rows.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <Chip tone="neutral">{ledger.counts.total} missing in this series</Chip>
                  <Chip tone="green">{ledger.counts.registered} answered</Chip>
                  <Chip tone={ledger.counts.unadjudicated > 0 ? 'red' : 'green'}>
                    {ledger.counts.unadjudicated} unexplained
                  </Chip>
                  {ledger.truncated && <Chip tone="amber">list shortened — narrow the filter</Chip>}
                  <ExportMenu
                    className="ml-auto"
                    filename={`gaps-${openSeries.docType}-${openSeries.seriesCode}-${openSeries.fy}`}
                    columns={gapCols}
                    rows={ledger.rows}
                    disabled={!ledger.rows.length}
                  />
                </div>

                <TableShell maxHeight="26rem">
                  <table className="w-full text-sm">
                    <THead>
                      {canPost ? <Th /> : null}
                      <Th>Missing number</Th><Th>Status</Th><Th>Recorded reason</Th>
                      <Th>Approved by</Th><Th>When</Th><Th>Entry</Th>
                    </THead>
                    <TBody>
                      {ledger.rows.map((r) => (
                        <Tr key={`${r.key}#${r.gapNumber}`}
                          className={r.status === 'unadjudicated' ? 'bg-red-50/40' : ''}>
                          {canPost ? (
                            <Td>
                              {r.status === 'unadjudicated' && (
                                <input
                                  type="checkbox"
                                  checked={selected.includes(r.gapNumber)}
                                  onChange={() => toggle(r.gapNumber)}
                                />
                              )}
                            </Td>
                          ) : null}
                          <Td className="font-mono text-xs text-gray-900">{r.documentNumber}</Td>
                          <Td>
                            <StatusChip
                              status={r.status}
                              tone={r.status === 'registered' ? 'green' : 'red'}
                              label={r.status === 'registered' ? 'Answered' : 'Unexplained'}
                            />
                          </Td>
                          <Td className="max-w-md text-gray-700">{r.reason ?? '—'}</Td>
                          <Td muted>{r.approvedByName ?? (r.approvedBy ? 'recorded' : '—')}</Td>
                          <Td className="text-xs text-gray-500">
                            {r.approvedAt ? String(r.approvedAt).slice(0, 10) : '—'}
                          </Td>
                          <Td muted className="text-xs">
                            {r.source === 'auto' ? 'bulk' : r.source === 'manual' ? 'by hand' : '—'}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableShell>

                {canPost && openRows.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-gray-800">
                        {selected.length} selected
                      </span>
                      <Btn variant="ghost" onClick={selectAllOpen}>
                        Select all {openRows.length} unexplained
                      </Btn>
                      {selected.length > 0 && (
                        <Btn variant="ghost" onClick={() => setSelected([])}>Clear</Btn>
                      )}
                    </div>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      rows={2}
                      maxLength={500}
                      placeholder="What happened to these numbers? e.g. invoice cancelled and deleted in error on 12 Apr; number not reissued"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <Btn
                        onClick={record}
                        disabled={saving || !selected.length || reason.trim().length < 3}
                      >
                        {saving ? 'Recording…' : 'Record reason'}
                      </Btn>
                      <span className="text-xs text-gray-500">
                        You are the approver on record. An answer cannot be edited afterwards.
                      </span>
                    </div>
                  </div>
                )}

                {!canPost && (
                  <div className="text-xs text-gray-500">
                    Read-only: your role can review every gap and its recorded reason but cannot
                    record one.
                  </div>
                )}
              </>
            )}
          </div>
        </SectionCard>
      )}

      {summary && summary.totals.seriesUnverifiable > 0 && (
        <SectionCard title="Series that cannot be checked" flush>
          <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
            {summary.rows.filter((r) => !r.verifiable).map((r) => (
              <li key={r.key}>
                <span className="font-medium">{human(r.docType)} · {r.fy}</span> — {r.unverifiableReason}.
                {r.unverifiableReason === 'no consumer table'
                  ? ' This document type does not store its numbers anywhere this check can read yet.'
                  : ' Two series share a year and produce numbers that look identical, so a hole cannot be told from a sibling series’ number.'}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </Page>
  );
};

export default SeriesGaps;
