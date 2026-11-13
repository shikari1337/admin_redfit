import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, RefreshCw, X } from 'lucide-react';
import { Btn, EmptyRow, Field, StatusChip, TableShell, TBody, Td, Th, THead, TextInput, Tr } from '@/components/erp';
import { FilterChip } from '@/components/sales/ListChrome';
import { ConfirmDialog, ErrorNote, Loading, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/utils/date';
import { codeLabel } from '@/lib/v2/appSettings';
import { B2B_PERMS, answerQuote, listQuotes, type QuoteRequest } from '@/lib/v2/business';

/**
 * Quote requests (HMAPP-T6 B11 (e); design 60 BZ08): a business asks for prices on many lines from
 * the app; a person answers with a note (and, when it was priced there, the CRM opportunity id of
 * its quotation) or closes it. Pricing stays CRM's quotation; this only answers the request.
 *
 * Server (Trade): `GET /api/v2/trade/quotes?status&limit` (`b2b.read`),
 * `POST /api/v2/trade/quotes/{id}/answer` {status: answered | closed, note 2 to 2000,
 * crm_opportunity_id?} (`b2b.manage` and a person).
 */

type Line = { sku?: string; variation_id?: string; quantity?: number };
const linesOf = (v: unknown): Line[] => (Array.isArray(v) ? (v as Line[]) : []);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const B2BQuotes: React.FC = () => {
  const { hasPerm } = useAuth();
  const canAnswer = hasPerm(B2B_PERMS.manage);
  const [rows, setRows] = useState<QuoteRequest[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [answering, setAnswering] = useState<{ q: QuoteRequest; status: 'answered' | 'closed' } | null>(null);
  const [form, setForm] = useState({ note: '', opp: '' });
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listQuotes()); } catch (e) { setError(e); setRows([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const statuses = [...new Set(rows.map((r) => r.status))];
  const shown = status ? rows.filter((r) => r.status === status) : rows;
  const off = whyDisabled(canAnswer, [], 'Manage B2B');
  const noteOk = form.note.trim().length >= 2 && form.note.trim().length <= 2000;
  const oppOk = form.opp.trim() === '' || UUID.test(form.opp.trim());

  const answer = async () => {
    if (!answering) return;
    setBusy(true); setActError(null);
    try {
      const updated = await answerQuote(answering.q.id, {
        status: answering.status, note: form.note.trim(), ...(form.opp.trim() ? { crm_opportunity_id: form.opp.trim() } : {}),
      });
      setRows((cur) => cur.map((r) => (r.id === updated.id ? updated : r)));
      setAnswering(null);
    } catch (e) { setActError(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip on={status === ''} onClick={() => setStatus('')} count={rows.length}>All</FilterChip>
        {statuses.map((s) => (
          <FilterChip key={s} on={status === s} tone={s === 'requested' ? 'warn' : undefined} count={rows.filter((r) => r.status === s).length} onClick={() => setStatus(s)}>
            {codeLabel(s)}
          </FilterChip>
        ))}
        <Btn variant="outline" size="sm" className="ml-auto" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Btn>
      </div>
      {error ? <ErrorNote error={error} what="Quote requests" onRetry={() => void load()} /> : (
        <TableShell>
          <table className="w-full text-sm">
            <THead><Th>Asked</Th><Th>Business</Th><Th>Lines</Th><Th>Their note</Th><Th>Status</Th><Th>Answer</Th><Th><span className="sr-only">Actions</span></Th></THead>
            <TBody>
              {!loading && shown.length === 0 && <EmptyRow colSpan={7}>No quote request yet. Business accounts ask for quotes in the app.</EmptyRow>}
              {shown.map((q) => (
                <Tr key={q.id}>
                  <Td muted>{formatDateTime(q.created_at, 'not recorded')}</Td>
                  <Td><Link to={`/customers/${q.customer_id}`} className="text-blue-700 underline">Open the customer</Link></Td>
                  <Td>
                    <ul className="space-y-0.5 text-xs">
                      {linesOf(q.lines).map((l, i) => (
                        <li key={i}><span className="font-mono">{l.sku ?? l.variation_id ?? 'item'}</span> x {l.quantity ?? 0}</li>
                      ))}
                    </ul>
                  </Td>
                  <Td className="max-w-xs break-words">{q.note ?? 'none'}</Td>
                  <Td><StatusChip status={q.status} label={codeLabel(q.status)} /></Td>
                  <Td className="max-w-xs break-words text-xs text-gray-600">
                    {q.answer_note ?? ''}{q.answered_at ? ` (${formatDateTime(q.answered_at, '')})` : ''}
                    {q.crm_opportunity_id && <div className="font-mono">CRM {q.crm_opportunity_id.split('-')[0]}</div>}
                  </Td>
                  <Td>
                    {q.status === 'requested' && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Btn size="sm" variant="success" disabled={!!off} title={off ?? undefined}
                          onClick={() => { setActError(null); setForm({ note: '', opp: '' }); setAnswering({ q, status: 'answered' }); }}>
                          <Check className="h-4 w-4" />Answer
                        </Btn>
                        <Btn size="sm" variant="dangerOutline" disabled={!!off} title={off ?? undefined}
                          onClick={() => { setActError(null); setForm({ note: '', opp: '' }); setAnswering({ q, status: 'closed' }); }}>
                          <X className="h-4 w-4" />Close
                        </Btn>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      )}
      {loading && <Loading label="Reading quote requests" />}

      <ConfirmDialog
        open={!!answering}
        title={answering?.status === 'closed' ? 'Close this request' : 'Answer this request'}
        confirmLabel={answering?.status === 'closed' ? 'Close request' : 'Send answer'}
        danger={answering?.status === 'closed'}
        busy={busy}
        confirmDisabled={!noteOk || !oppOk}
        onClose={() => setAnswering(null)}
        onConfirm={() => void answer()}
      >
        <p>The business reads your note in the app. Price it as a CRM quotation first when it needs prices.</p>
        <Field label="Note to the business (2 to 2000 characters)">
          <textarea rows={4} maxLength={2000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 p-2 text-sm" />
        </Field>
        {answering?.status === 'answered' && (
          <Field label="CRM opportunity id of the quotation (optional)">
            <TextInput value={form.opp} onChange={(e) => setForm((f) => ({ ...f, opp: e.target.value }))} className="font-mono text-xs" />
          </Field>
        )}
        {!oppOk && <p className="text-xs text-red-700">An opportunity id is the long id shown in CRM.</p>}
        {actError ? <ErrorNote error={actError} /> : null}
      </ConfirmDialog>
    </div>
  );
};

export default B2BQuotes;
