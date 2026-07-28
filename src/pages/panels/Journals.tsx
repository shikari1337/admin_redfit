import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMinor } from '../../lib/money';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Card, SectionCard, FilterBar, Field, TextInput, SelectInput,
  StatusChip, TableShell, THead, Th, TBody, Tr, Td,
} from '../../components/erp';

interface JournalLine { accountCode: string; debit: string; credit: string; }

const emptyLine = (): JournalLine => ({ accountCode: '', debit: '', credit: '' });

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

  const load = async () => {
    const res = await api.get('/accounting/journals', { params: { limit: 100 } });
    setJournals(payload(res) ?? []);
  };
  useEffect(() => {
    load();
    api.get('/accounting/accounts').then((r) => setAccounts(payload(r) ?? [])).catch(() => {});
  }, []);

  const toggle = async (id: string) => {
    if (expanded[id]) { setExpanded((e) => ({ ...e, [id]: undefined })); return; }
    const res = await api.get(`/accounting/journals/${id}`);
    setExpanded((e) => ({ ...e, [id]: payload(res) }));
  };

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
        actions={canPost && (
          <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Manual journal'}</Btn>
        )}
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

      <Card className="divide-y divide-gray-100 overflow-hidden">
        {journals.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No journals yet.</div>}
        {journals.map((j) => (
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
              </div>
            )}
          </div>
        ))}
      </Card>
    </Page>
  );
};

export default Journals;
