import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Field, SelectInput, inrMinor,
  FilterBar, SearchInput, ExportMenu, Pagination, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * Bank Reconciliation — the month-end tick-off. The accountant uploads the
 * statement they downloaded from their bank; we auto-match every line we can
 * against the bank book (the GL), they match the rest by hand or ignore noise,
 * and the summary shows book vs bank with an honest difference. Plain language,
 * no accounting jargon — built for a non-technical shop owner.
 */

const rup = (m: string | number | null | undefined) => inrMinor(m ?? '0');
const signedRup = (m: string) => {
  const n = Number(m);
  return (n < 0 ? '-' : '') + inrMinor(String(Math.abs(n)));
};

interface StatementRow {
  id: string; account: 'bank' | 'cash'; file_name: string | null;
  period_from: string | null; period_to: string | null;
  row_count: number; created_at: string;
  matched_count: number; unmatched_count: number; ignored_count: number;
}

// Client-side CSV of the uploaded-statements list.
const STATEMENT_COLS: CsvColumn<StatementRow>[] = [
  { key: 'created_at', label: 'Uploaded', format: (s) => (s.created_at || '').slice(0, 10) },
  { key: 'account', label: 'Account' },
  { key: 'file_name', label: 'File', format: (s) => s.file_name ?? '' },
  { key: 'period_from', label: 'Period from', format: (s) => s.period_from ?? '' },
  { key: 'period_to', label: 'Period to', format: (s) => s.period_to ?? '' },
  { key: 'row_count', label: 'Lines' },
  { key: 'matched_count', label: 'Matched' },
  { key: 'unmatched_count', label: 'To review' },
  { key: 'ignored_count', label: 'Ignored' },
];

const BankRecon: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [error, setError] = useState('');
  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string>('');

  // Account filter is a real backend param (?account=bank|cash); search + paging client-side.
  const [accountFilter, setAccountFilter] = useState('');
  const lc = useListControls({ pageSize: 20 });

  const loadStatements = async () => {
    try {
      const res = await api.get('/bank-recon/statements', {
        params: accountFilter ? { account: accountFilter } : {},
      });
      setStatements(payload<StatementRow[]>(res) ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { loadStatements(); /* eslint-disable-next-line */ }, [accountFilter]);

  const deleteStatement = async (id: string, name: string) => {
    if (!window.confirm(`Delete the statement "${name || 'statement'}"? Its matches are released; the underlying journals are NOT deleted.`)) return;
    setError('');
    try {
      await api.delete(`/bank-recon/statements/${id}`);
      if (selectedId === id) setSelectedId(null);
      setBanner('Statement deleted.');
      loadStatements();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const filteredStatements = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    if (!q) return statements;
    return statements.filter((s) => `${s.file_name ?? ''} ${s.account}`.toLowerCase().includes(q));
  }, [statements, lc.debouncedSearch]);
  const pageStatements = filteredStatements.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  return (
    <Page>
      <PageHeader
        title="Bank Reconciliation"
        description="Upload the statement you downloaded from your bank. We tick off every line that matches your books automatically, then help you clear the rest."
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!selectedId ? (
        <>
          {banner && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{banner}</div>}

          {canPost && (
            <UploadCard
              onError={setError}
              onDone={(id, msg) => { setBanner(msg); setSelectedId(id); loadStatements(); }}
            />
          )}

          {statements.length > 0 && (
            <FilterBar>
              <Field label="Search"><SearchInput value={lc.search} placeholder="File name…" onChange={(e) => lc.setSearch(e.target.value)} /></Field>
              <Field label="Account">
                <SelectInput value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); lc.setPage(1); }}>
                  <option value="">All accounts</option>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                </SelectInput>
              </Field>
            </FilterBar>
          )}

          <SectionCard
            title="Uploaded statements"
            flush
            action={<ExportMenu filename="bank-statements" columns={STATEMENT_COLS} rows={filteredStatements} disabled={statements.length === 0} />}
          >
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th>Uploaded</Th><Th>Account</Th><Th>File</Th><Th>Period</Th>
                  <Th num>Lines</Th><Th num>Matched</Th><Th num>To review</Th><Th></Th>
                  {canPost && <Th></Th>}
                </THead>
                <TBody>
                  {filteredStatements.length === 0 && (
                    <EmptyRow colSpan={canPost ? 9 : 8}>
                      {statements.length === 0 ? 'No statements uploaded yet. Upload one above to begin.' : 'No statements match your filters.'}
                    </EmptyRow>
                  )}
                  {pageStatements.map((s) => (
                    <Tr key={s.id} className="cursor-pointer" onClick={() => { setBanner(''); setSelectedId(s.id); }}>
                      <Td>{(s.created_at || '').slice(0, 10)}</Td>
                      <Td className="capitalize">{s.account}</Td>
                      <Td className="max-w-xs truncate" title={s.file_name ?? ''}>{s.file_name ?? '—'}</Td>
                      <Td>{s.period_from ? `${s.period_from} → ${s.period_to}` : '—'}</Td>
                      <Td num>{s.row_count}</Td>
                      <Td num className="text-emerald-700">{s.matched_count}</Td>
                      <Td num>{s.unmatched_count > 0
                        ? <StatusChip status="unmatched" label={String(s.unmatched_count)} />
                        : <StatusChip status="matched" label="0" />}</Td>
                      <Td num><span className="font-medium text-gray-900 hover:underline">Open →</span></Td>
                      {canPost && (
                        <Td num>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteStatement(s.id, s.file_name ?? ''); }}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >Delete</button>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
            <Pagination page={lc.page} pageSize={lc.pageSize} total={filteredStatements.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
          </SectionCard>
        </>
      ) : (
        <StatementDetail
          key={selectedId}
          statementId={selectedId}
          banner={banner}
          canPost={canPost}
          onError={setError}
          onBack={() => { setSelectedId(null); setBanner(''); setError(''); loadStatements(); }}
          onDeleted={() => { setSelectedId(null); setBanner('Statement deleted.'); setError(''); loadStatements(); }}
        />
      )}
    </Page>
  );
};

// ── Upload card ───────────────────────────────────────────────────────────────
const UploadCard: React.FC<{ onError: (m: string) => void; onDone: (id: string, msg: string) => void }> = ({ onError, onDone }) => {
  const [account, setAccount] = useState<'bank' | 'cash'>('bank');
  const [file, setFile] = useState<File | null>(null);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async () => {
    if (!file) return;
    onError(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('account', account);
      if (opening.trim() !== '') fd.append('openingRupees', opening);
      if (closing.trim() !== '') fd.append('closingRupees', closing);
      const res = await api.post('/bank-recon/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = payload<any>(res);
      const m = d.autoMatch || { matched: 0, total: 0 };
      const msg = `We matched ${m.matched} of ${m.total} line${m.total === 1 ? '' : 's'} automatically.`
        + (m.remaining ? ` ${m.remaining} still need${m.remaining === 1 ? 's' : ''} your attention.` : ' Everything reconciled!');
      setFile(null); setOpening(''); setClosing('');
      onDone(d.statementId, msg);
    } catch (e: any) {
      onError(e?.response?.data?.message ?? e.message);
    } finally { setBusy(false); }
  };

  return (
    <SectionCard
      title="Upload a bank statement"
      description="A CSV or Excel file exported from your bank. We understand the usual columns (Date, Narration, Withdrawal, Deposit, Cheque/Ref)."
    >
      <div className="space-y-4 text-sm">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-300'}`}
        >
          <p className="font-medium text-gray-700">Drop the statement file here, or choose it</p>
          <p className="text-xs text-gray-500">Excel (.xlsx / .xls) or CSV — up to 20 MB</p>
          <label className="mt-1 cursor-pointer rounded-lg bg-gray-900 px-3 py-1.5 text-white">
            Choose file
            <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && <p className="mt-1 text-gray-800">Selected: <span className="font-medium">{file.name}</span></p>}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="text-gray-600">Account</span>
            <select value={account} onChange={(e) => setAccount(e.target.value as any)} className="block rounded border px-2 py-1.5">
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-gray-600">Opening balance (₹, optional)</span>
            <input type="number" step="0.01" value={opening} placeholder="auto from file"
              onChange={(e) => setOpening(e.target.value)} className="block w-40 rounded border px-2 py-1.5 text-right" />
          </label>
          <label className="space-y-1">
            <span className="text-gray-600">Closing balance (₹, optional)</span>
            <input type="number" step="0.01" value={closing} placeholder="auto from file"
              onChange={(e) => setClosing(e.target.value)} className="block w-40 rounded border px-2 py-1.5 text-right" />
          </label>
          <Btn onClick={upload} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload & auto-match'}</Btn>
        </div>
        <p className="text-xs text-gray-400">
          We read the closing balance from the file when it has a Balance column. If your file doesn't, type it here so we can double-check against your books.
        </p>
      </div>
    </SectionCard>
  );
};

// ── Statement detail ────────────────────────────────────────────────────────
// Client-side CSV of the statement's lines.
const LINE_COLS: CsvColumn<any>[] = [
  { key: 'line_date', label: 'Date', format: (l) => l.line_date ?? '' },
  { key: 'description', label: 'Details', format: (l) => l.description ?? '' },
  { key: 'ref_no', label: 'Ref', format: (l) => l.ref_no ?? '' },
  { key: 'credit_minor', label: 'Money in', money: true },
  { key: 'debit_minor', label: 'Money out', money: true },
  { key: 'match_status', label: 'Status' },
  { key: 'matched_journal_number', label: 'Matched to', format: (l) => l.matched_journal_number ?? '' },
];

const StatementDetail: React.FC<{
  statementId: string; banner: string; canPost: boolean;
  onError: (m: string) => void; onBack: () => void; onDeleted: () => void;
}> = ({ statementId, banner, canPost, onError, onBack, onDeleted }) => {
  const [summary, setSummary] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [unmatched, setUnmatched] = useState<{ statementLines: any[]; bookEntries: any[] } | null>(null);
  const [pickLine, setPickLine] = useState<string | null>(null);
  const [pickGl, setPickGl] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [coa, setCoa] = useState<{ code: string; name: string; is_active: boolean }[]>([]);
  const [bookLineId, setBookLineId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const reload = async () => {
    try {
      const [sRes, dRes, uRes] = await Promise.all([
        api.get(`/bank-recon/statements/${statementId}/summary`),
        api.get(`/bank-recon/statements/${statementId}`),
        api.get(`/bank-recon/statements/${statementId}/unmatched`),
      ]);
      setSummary(payload<any>(sRes));
      setDetail(payload<any>(dRes));
      setUnmatched(payload<any>(uRes));
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { reload(); }, [statementId]);
  // Categories (contra accounts) for the "Add as new transaction" feed-to-book flow.
  useEffect(() => {
    api.get('/accounting/coa/accounts')
      .then((r) => setCoa((payload<any[]>(r) ?? []).filter((a) => a.is_active)))
      .catch(() => { /* the picker just stays empty; matching still works */ });
  }, []);

  const bookLine = unmatched?.statementLines.find((l) => l.id === bookLineId) ?? null;
  const doBook = async (contraAccountCode: string) => {
    if (!bookLineId) return;
    setWorking(true); onError('');
    try {
      await api.post(`/bank-recon/lines/${bookLineId}/book`, { contraAccountCode });
      setBookLineId(null); setPickLine(null);
      await reload();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setWorking(false); }
  };

  const doMatch = async () => {
    if (!pickLine || !pickGl) return;
    setWorking(true); onError('');
    try {
      await api.post(`/bank-recon/lines/${pickLine}/match`, { glEntryId: pickGl });
      setPickLine(null); setPickGl(null);
      await reload();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setWorking(false); }
  };
  const doUnmatch = async (lineId: string) => {
    onError('');
    try { await api.post(`/bank-recon/lines/${lineId}/unmatch`, {}); await reload(); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  const doIgnore = async (lineId: string) => {
    const reason = window.prompt('Why are you setting this line aside? (e.g. "bank fee booked elsewhere", "duplicate")');
    if (reason === null) return;
    onError('');
    try { await api.post(`/bank-recon/lines/${lineId}/ignore`, { reason }); setPickLine(null); await reload(); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };

  // Re-run auto-match on the whole statement (POST /statements/:id/auto-match).
  const rerunAutoMatch = async () => {
    setBusyAction(true); onError(''); setNote('');
    try {
      const m = payload<any>(await api.post(`/bank-recon/statements/${statementId}/auto-match`, {}));
      setNote(`Auto-match re-run: matched ${m?.matched ?? 0} of ${m?.total ?? 0} line${(m?.total ?? 0) === 1 ? '' : 's'}.`
        + ((m?.remaining ?? 0) ? ` ${m.remaining} still need attention.` : ''));
      await reload();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setBusyAction(false); }
  };

  // Delete the whole statement (DELETE /statements/:id).
  const deleteThis = async () => {
    if (!window.confirm('Delete this statement? Its matches are released; the underlying journals are NOT deleted.')) return;
    setBusyAction(true); onError('');
    try { await api.delete(`/bank-recon/statements/${statementId}`); onDeleted(); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); setBusyAction(false); }
  };

  const diff = summary ? Number(summary.differenceMinor) : 0;
  const closing = summary?.closingCheck;
  const closingDiff = closing ? Number(closing.differenceMinor) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Btn variant="ghost" onClick={onBack}>← All statements</Btn>
          {detail?.header && (
            <span className="text-sm text-gray-500">
              {detail.header.file_name ?? 'statement'} · <span className="capitalize">{detail.header.account}</span>
              {detail.header.period_from ? ` · ${detail.header.period_from} → ${detail.header.period_to}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu filename={`statement-${(detail?.header?.file_name ?? statementId).toString().replace(/\.[^.]+$/, '')}`}
            columns={LINE_COLS} rows={detail?.lines ?? []} disabled={!detail?.lines?.length} />
          {canPost && (
            <>
              <Btn variant="outline" onClick={rerunAutoMatch} disabled={busyAction}>{busyAction ? 'Working…' : 'Re-run auto-match'}</Btn>
              <Btn variant="dangerOutline" onClick={deleteThis} disabled={busyAction}>Delete statement</Btn>
            </>
          )}
        </div>
      </div>

      {banner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{banner}</div>
      )}
      {note && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</div>
      )}

      {/* Summary: book vs bank vs difference */}
      {summary && (
        <>
          <StatGrid cols={4}>
            <StatCard label="Your books (closing)" value={rup(summary.book.closingMinor)}
              sub={`Opening ${rup(summary.book.openingMinor)}`} />
            <StatCard label="Bank statement (net)" value={signedRup(summary.statement.netMinor)}
              sub={`In ${rup(summary.statement.moneyInMinor)} · Out ${rup(summary.statement.moneyOutMinor)}`} />
            <StatCard label="Difference (statement − books)" value={signedRup(summary.differenceMinor)}
              tone={diff === 0 ? 'good' : 'bad'}
              sub={diff === 0 ? 'Movements agree' : 'Something is missing on one side'} />
            <StatCard label="Lines to review" value={summary.statement.unmatchedCount}
              tone={summary.statement.unmatchedCount === 0 ? 'good' : 'default'}
              sub={`${summary.statement.matchedCount} matched · ${summary.statement.ignoredCount} ignored`} />
          </StatGrid>

          {closing && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${closingDiff === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <span className="font-medium">Closing-balance check: </span>
              statement says <span className="font-semibold">{rup(closing.statementClosingMinor)}</span>, your books say <span className="font-semibold">{rup(closing.bookClosingMinor)}</span>
              {closingDiff === 0
                ? ' — they match exactly. ✓'
                : ` — a difference of ${signedRup(closing.differenceMinor)}. Clear the unmatched lines below until it reaches zero.`}
            </div>
          )}
        </>
      )}

      {/* Two-column unmatched view */}
      {unmatched && (unmatched.statementLines.length > 0 || unmatched.bookEntries.length > 0) && (
        <SectionCard
          title="What's left to reconcile"
          description="Pick one line on the left and its matching entry on the right, then Match. Lines that aren't real (fees you booked elsewhere, duplicates) can be ignored."
          action={canPost && (
            <div className="flex items-center gap-2">
              {pickLine && <Btn variant="success" onClick={() => setBookLineId(pickLine)}>Add as new transaction</Btn>}
              {pickLine && <Btn variant="dangerOutline" onClick={() => doIgnore(pickLine)}>Ignore selected line</Btn>}
              <Btn onClick={doMatch} disabled={!pickLine || !pickGl || working}>{working ? 'Matching…' : 'Match selected'}</Btn>
            </div>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left: unmatched statement lines */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">On the bank statement ({unmatched.statementLines.length})</div>
              <div className="space-y-1.5">
                {unmatched.statementLines.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">Nothing left on the statement side.</div>}
                {unmatched.statementLines.map((l) => (
                  <button key={l.id} disabled={!canPost} onClick={() => setPickLine(l.id === pickLine ? null : l.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${pickLine === l.id ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className="min-w-0">
                      <span className="block truncate">{l.description || '(no description)'}</span>
                      <span className="text-xs text-gray-400">{l.line_date ?? 'no date'}{l.ref_no ? ` · ${l.ref_no}` : ''}</span>
                    </span>
                    <span className={`shrink-0 font-medium tabular-nums ${Number(l.credit_minor) ? 'text-emerald-700' : 'text-red-700'}`}>
                      {Number(l.credit_minor) ? `+${rup(l.credit_minor)}` : `-${rup(l.debit_minor)}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* Right: unmatched book entries */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">In your books ({unmatched.bookEntries.length})</div>
              <div className="space-y-1.5">
                {unmatched.bookEntries.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">Nothing left on the books side.</div>}
                {unmatched.bookEntries.map((b) => (
                  <button key={b.id} disabled={!canPost} onClick={() => setPickGl(b.id === pickGl ? null : b.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${pickGl === b.id ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className="min-w-0">
                      <span className="block truncate">{b.narration || b.document_type || '(journal)'}</span>
                      <span className="text-xs text-gray-400">{b.date}{b.journal_number ? ` · ${b.journal_number}` : ''}</span>
                    </span>
                    <span className={`shrink-0 font-medium tabular-nums ${Number(b.debit_minor) ? 'text-emerald-700' : 'text-red-700'}`}>
                      {Number(b.debit_minor) ? `+${rup(b.debit_minor)}` : `-${rup(b.credit_minor)}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {summary && summary.statement.unmatchedCount === 0 && (summary.book.unmatchedCount ?? 0) === 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Every line on this statement is reconciled against your books. ✓
        </div>
      )}

      {/* All lines */}
      <SectionCard title="All statement lines" flush>
        <TableShell maxHeight="60vh">
          <table className="w-full text-sm">
            <THead>
              <Th>Date</Th><Th>Details</Th><Th>Ref</Th>
              <Th num>Money in</Th><Th num>Money out</Th><Th>Status</Th><Th>Matched to</Th>
              {canPost && <Th num>Action</Th>}
            </THead>
            <TBody>
              {!detail?.lines?.length && <EmptyRow colSpan={canPost ? 8 : 7}>No lines.</EmptyRow>}
              {(detail?.lines ?? []).map((l: any) => (
                <Tr key={l.id}>
                  <Td>{l.line_date ?? '—'}</Td>
                  <Td className="max-w-xs truncate" title={l.description ?? ''}>{l.description ?? '—'}</Td>
                  <Td className="font-mono text-xs">{l.ref_no ?? '—'}</Td>
                  <Td num className="text-emerald-700">{Number(l.credit_minor) ? rup(l.credit_minor) : '—'}</Td>
                  <Td num className="text-red-700">{Number(l.debit_minor) ? rup(l.debit_minor) : '—'}</Td>
                  <Td><StatusChip status={l.match_status} />{l.match_status === 'ignored' && l.ignore_reason ? <span className="ml-1 text-xs text-gray-400" title={l.ignore_reason}>ⓘ</span> : null}</Td>
                  <Td className="text-xs">{l.matched_journal_number
                    ? <span title={l.matched_narration ?? ''}>{l.matched_journal_number} <span className="text-gray-400">({l.matched_date})</span></span>
                    : '—'}</Td>
                  {canPost && (
                    <Td num>
                      {(l.match_status === 'auto' || l.match_status === 'manual' || l.match_status === 'ignored')
                        ? <button onClick={() => doUnmatch(l.id)} className="font-medium text-gray-900 hover:underline">{l.match_status === 'ignored' ? 'Un-ignore' : 'Unmatch'}</button>
                        : '—'}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      {bookLineId && bookLine && (
        <BookModal
          line={bookLine}
          coa={coa}
          working={working}
          onCancel={() => setBookLineId(null)}
          onConfirm={doBook}
        />
      )}
    </>
  );
};

// ── Feed-to-book: create a book entry from an unmatched statement line ──────────
const BookModal: React.FC<{
  line: any;
  coa: { code: string; name: string; is_active: boolean }[];
  working: boolean;
  onCancel: () => void;
  onConfirm: (contraAccountCode: string) => void;
}> = ({ line, coa, working, onCancel, onConfirm }) => {
  const [contra, setContra] = useState('');
  const isIn = Number(line.credit_minor) > 0;
  const amount = isIn ? line.credit_minor : line.debit_minor;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-semibold text-gray-900">Add as a new transaction</h3>
        <p className="mb-4 text-sm text-gray-500">
          We'll record this line in your books ({isIn ? 'money received' : 'money paid'} of{' '}
          <span className="font-medium text-gray-800">{rup(amount)}</span>) and tick it off in one step.
        </p>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <div className="truncate font-medium text-gray-800">{line.description || '(no description)'}</div>
          <div className="text-xs text-gray-400">{line.line_date ?? 'no date'}{line.ref_no ? ` · ${line.ref_no}` : ''}</div>
        </div>
        <div className="mt-3">
          <Field label={isIn ? 'Category (where it came from)' : 'Category (what it was for)'}>
            <SelectInput value={contra} onChange={(e) => setContra(e.target.value)} className="w-full">
              <option value="">Choose a category…</option>
              {coa.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </SelectInput>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="success" onClick={() => onConfirm(contra)} disabled={!contra || working}>{working ? 'Recording…' : 'Record & match'}</Btn>
        </div>
      </div>
    </div>
  );
};

export default BankRecon;
