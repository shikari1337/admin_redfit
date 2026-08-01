import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMinor } from '../../lib/money';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Card, SectionCard, FilterBar, Field, TextInput, SelectInput, SearchInput,
  StatusChip, TableShell, THead, Th, TBody, Tr, Td,
  ExportMenu, Pagination, AttachmentPanel, useListControls, type CsvColumn,
} from '../../components/erp';

interface JournalLine { accountCode: string; debit: string; credit: string; }

const emptyLine = (): JournalLine => ({ accountCode: '', debit: '', credit: '' });

const journalCols: CsvColumn<any>[] = [
  { key: 'journal_number', label: 'Journal #' },
  { key: 'journal_date', label: 'Date' },
  { key: 'narration', label: 'Narration', format: (j) => j.narration ?? j.document_type ?? '' },
  { key: 'document_type', label: 'Type' },
  { key: 'status', label: 'Status', format: (j) => j.status ?? 'posted' },
  { key: 'total_debit_minor', label: 'Amount', money: true },
];

const Journals: React.FC = () => {
  const { hasPerm } = useAuth();
  const [params] = useSearchParams();
  const [journals, setJournals] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, any>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [jDate, setJDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canPost = hasPerm('accounting.post');
  const canRead = hasPerm('accounting.read');

  // Client-side search/status/date + pagination. The list endpoint only takes
  // limit/offset, so we fetch a full page (server cap 200) and filter in-browser.
  const lc = useListControls({ pageSize: 20 });

  const load = async () => {
    const res = await api.get('/accounting/journals', { params: { limit: 200 } });
    setJournals(payload(res) ?? []);
  };
  useEffect(() => {
    load();
    api.get('/accounting/accounts').then((r) => setAccounts(payload(r) ?? [])).catch(() => {});
    // Drill-through targets: ?open=<id> expands a journal (from the GL page);
    // ?q=<text> pre-fills the search (e.g. from Opening Balances' journal number).
    const openId = params.get('open');
    if (openId) {
      api.get(`/accounting/journals/${openId}`)
        .then((r) => setExpanded((e) => ({ ...e, [openId]: payload(r) })))
        .catch(() => {});
    }
    const q = params.get('q');
    if (q) lc.setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (id: string) => {
    if (expanded[id]) { setExpanded((e) => ({ ...e, [id]: undefined })); return; }
    const res = await api.get(`/accounting/journals/${id}`);
    setExpanded((e) => ({ ...e, [id]: payload(res) }));
  };

  const filtered = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    return journals.filter((j) => {
      if (q && !`${j.journal_number ?? ''} ${j.narration ?? ''} ${j.document_type ?? ''}`.toLowerCase().includes(q)) return false;
      if (lc.status && (j.status ?? 'posted') !== lc.status) return false;
      if (lc.from && j.journal_date && j.journal_date < lc.from) return false;
      if (lc.to && j.journal_date && j.journal_date > lc.to) return false;
      return true;
    });
  }, [journals, lc.debouncedSearch, lc.status, lc.from, lc.to]);

  const paged = filtered.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  const totals = lines.reduce(
    (acc, l) => ({ d: acc.d + (Number(l.debit) || 0), c: acc.c + (Number(l.credit) || 0) }),
    { d: 0, c: 0 });

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await api.post('/accounting/journals', {
        journalDate: jDate,
        narration,
        lines: lines
          .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({
            accountCode: l.accountCode,
            // UI works in rupees; the API takes minor units.
            debitMinor: Number(l.debit) > 0 ? String(Math.round(Number(l.debit) * 100)) : undefined,
            creditMinor: Number(l.credit) > 0 ? String(Math.round(Number(l.credit) * 100)) : undefined,
          })),
      });
      setShowNew(false);
      setLines([emptyLine(), emptyLine()]);
      setNarration('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setBusy(false); }
  };

  const reverse = async (id: string) => {
    if (!window.confirm('Post a reversal journal? The original stays in the books.')) return;
    await api.post(`/accounting/journals/${id}/reverse`, { journalDate: new Date().toISOString().slice(0, 10) });
    setExpanded({});
    await load();
  };

  return (
    <Page>
      <PageHeader
        title="Journals"
        description="Posted entries are immutable — corrections are reversal journals."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu filename="journals" columns={journalCols} rows={filtered} canExport={canRead} disabled={!filtered.length} />
            {canPost && (
              <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Manual journal'}</Btn>
            )}
          </div>
        }
      />

      {showNew && canPost && (
        <SectionCard title="Manual journal">
          <div className="space-y-3">
            <FilterBar>
              <Field label="Date">
                <TextInput type="date" value={jDate} onChange={(e) => setJDate(e.target.value)} />
              </Field>
              <Field label="Narration" className="flex-1 min-w-[220px]">
                <TextInput placeholder="What is this entry for?" value={narration}
                  onChange={(e) => setNarration(e.target.value)} />
              </Field>
            </FilterBar>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <SelectInput className="min-w-[240px]" value={l.accountCode}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, accountCode: e.target.value } : x))}>
                  <option value="">— account —</option>
                  {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                </SelectInput>
                <TextInput type="number" min="0" step="0.01" placeholder="Debit ₹" className="w-32 text-right tabular-nums" value={l.debit}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, debit: e.target.value, credit: '' } : x))} />
                <TextInput type="number" min="0" step="0.01" placeholder="Credit ₹" className="w-32 text-right tabular-nums" value={l.credit}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, credit: e.target.value, debit: '' } : x))} />
                {lines.length > 2 && (
                  <Btn variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</Btn>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Btn variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ line</Btn>
              <span className={totals.d === totals.c ? 'text-emerald-700' : 'text-red-700'}>
                Dr ₹{totals.d.toFixed(2)} / Cr ₹{totals.c.toFixed(2)} {totals.d === totals.c ? '✔ balanced' : '— must balance'}
              </span>
              <Btn variant="success" disabled={busy || totals.d !== totals.c || totals.d === 0} onClick={submit}>
                Post journal
              </Btn>
            </div>
            {error && <div className="text-sm text-red-700">{error}</div>}
          </div>
        </SectionCard>
      )}

      <FilterBar>
        <Field label="Search">
          <SearchInput placeholder="Journal # or narration…" value={lc.search} onChange={(e) => lc.setSearch(e.target.value)} />
        </Field>
        <Field label="Status">
          <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="posted">Posted</option>
            <option value="reversed">Reversed</option>
          </SelectInput>
        </Field>
        <Field label="From"><TextInput type="date" value={lc.from} onChange={(e) => lc.setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={lc.to} onChange={(e) => lc.setTo(e.target.value)} /></Field>
      </FilterBar>

      <Card className="divide-y divide-gray-100 overflow-hidden">
        {journals.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No journals yet.</div>}
        {journals.length > 0 && filtered.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No journals match these filters.</div>}
        {paged.map((j) => (
          <div key={j.id}>
            <button onClick={() => toggle(j.id)} className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{j.journal_number}</span>
                <span className="text-gray-500">{j.narration ?? j.document_type}</span>
                {j.status === 'reversed' && <StatusChip status="reversed" />}
              </div>
              <div className="text-right">
                <span className="font-mono tabular-nums">{fmtMinor(j.total_debit_minor)}</span>
                <span className="ml-3 text-xs text-gray-400">{j.journal_date}</span>
              </div>
            </button>
            {expanded[j.id] && (
              <div className="bg-gray-50 px-6 py-3 text-sm">
                <TableShell>
                  <table className="w-full text-sm">
                    <THead>
                      <Th>Account</Th><Th>Name</Th><Th num>Debit</Th><Th num>Credit</Th>
                    </THead>
                    <TBody>
                      {expanded[j.id].entries.map((e: any, i: number) => (
                        <Tr key={i}>
                          <Td className="font-mono">{e.code}</Td>
                          <Td>{e.name}</Td>
                          <Td num className="font-mono">{Number(e.debit_minor) > 0 ? fmtMinor(e.debit_minor) : ''}</Td>
                          <Td num className="font-mono">{Number(e.credit_minor) > 0 ? fmtMinor(e.credit_minor) : ''}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableShell>
                {canPost && expanded[j.id].status !== 'reversed' && (
                  <Btn variant="dangerOutline" size="sm" className="mt-2" onClick={() => reverse(j.id)}>
                    Reverse this journal
                  </Btn>
                )}
                <div className="mt-3">
                  <AttachmentPanel entityType="journal" entityId={j.id}
                    description="Supporting documents for this journal (contracts, calculations, approvals)." />
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Pagination page={lc.page} pageSize={lc.pageSize} total={filtered.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
    </Page>
  );
};

export default Journals;
