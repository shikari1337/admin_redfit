import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banknote, Calculator, Check, ChevronDown, ChevronRight, Hammer, Info, RefreshCw, Unlock, X } from 'lucide-react';
import {
  Btn, EmptyRow, Field, FilterBar, SectionCard, SelectInput, StatusChip, TableShell, TBody, Td, Th, THead, TextInput, Tr,
} from '@/components/erp';
import { ConfirmDialog, ErrorNote, Loading, Notice, ReasonDialog, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { todayIso } from '@/utils/date';
import {
  PARTNER_PERMS, approveCommission, buildBatch, cancelBatch, codeWords, getBatch, listBatches, listCommissions, moveBatch,
  payBatch, rejectCommission, samePerson, type CommissionRow, type PayoutBatch,
} from '@/lib/v2/partners';
import { Amount, day, shortId, ValueRows, when } from './common';

/**
 * AD04 Commissions and payout batches (HMAPP design 60). Held commissions are released or refused
 * by a person; each month's batch is built, quoted by Books for the tax, approved by a DIFFERENT
 * person (four eyes, as Approvals does), then its bank payment is recorded.
 *
 * Server (Retain): `GET /partners/commissions`, `POST /partners/commissions/{id}/approve|reject`,
 * `GET|POST /partners/payout-batches`, `GET /partners/payout-batches/{id}`,
 * `POST .../{id}/quote|approve|paid|cancel`. Read `marketing.read`; commissions, build, quote and
 * cancel `marketing.manage`; approve and record payment `accounting.post`. Until Books books
 * partner payouts the server answers `retain.port_not_wired`, shown in its own words.
 */

const PartnerMoney: React.FC = () => (
  <div className="space-y-6">
    <Commissions />
    <Batches />
  </div>
);

/* ── commissions ───────────────────────────────────────────────────────── */

const Commissions: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(PARTNER_PERMS.manage);
  const [params] = useSearchParams();
  const [state, setState] = useState('');
  // A partner's page links here with `?tab=money&partner=<id>`.
  const [partner, setPartner] = useState(params.get('partner') ?? '');
  const [seen, setSeen] = useState<string[]>([]);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [rule, setRule] = useState<CommissionRow | null>(null);
  const [rejecting, setRejecting] = useState<CommissionRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actError, setActError] = useState<unknown>(null);

  const partnerOk = partner.trim() === '' || /^[0-9a-f-]{36}$/i.test(partner.trim());

  const load = useCallback(async (more: string | null) => {
    if (!partnerOk) return;
    setLoading(true); setError(null);
    try {
      const page = await listCommissions({ state, partner_id: partner.trim() || undefined, cursor: more });
      setRows((cur) => (more ? [...cur, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setSeen((cur) => [...new Set([...cur, ...page.items.map((c) => c.state)])]);
    } catch (e) {
      setError(e);
      if (!more) setRows([]);
    } finally { setLoading(false); }
  }, [state, partner, partnerOk]);

  useEffect(() => { void load(null); }, [load]);

  const put = (c: CommissionRow) => setRows((cur) => cur.map((r) => (r.id === c.id ? c : r)));

  const release = async (c: CommissionRow) => {
    setBusy(c.id); setActError(null);
    try { put(await approveCommission(c.id)); } catch (e) { setActError(e); } finally { setBusy(null); }
  };
  const reject = async (reason: string) => {
    if (!rejecting) return;
    setBusy(rejecting.id); setActError(null);
    try { put(await rejectCommission(rejecting.id, reason)); setRejecting(null); } catch (e) { setActError(e); } finally { setBusy(null); }
  };

  const today = todayIso();
  const releaseWhy = (c: CommissionRow) => whyDisabled(canManage, [
    c.state !== 'held' && 'Only a held commission is released by hand.',
    !!c.approve_after && c.approve_after > today && `Its day comes on ${day(c.approve_after)}.`,
  ], 'Manage marketing');
  const rejectWhy = (c: CommissionRow) => whyDisabled(canManage, [
    (c.state === 'paid' || c.state === 'rejected' || c.state === 'reversed') && 'This commission is final.',
    !!c.payout_line_id && 'It is in a payout batch.',
  ], 'Manage marketing');

  return (
    <SectionCard
      title="Commissions"
      description="Each order a partner brought, with the rate it was worked out on. Until trust checks run, every delivered commission waits here for a person."
      action={<Btn variant="outline" size="sm" onClick={() => void load(null)}><RefreshCw className="h-4 w-4" />Refresh</Btn>}
    >
      <div className="space-y-4">
        <FilterBar>
          <Field label="State">
            <SelectInput value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Every state</option>
              {[...new Set([...seen, ...(state ? [state] : [])])].map((s) => <option key={s} value={s}>{codeWords(s)}</option>)}
            </SelectInput>
          </Field>
          <Field label="Partner (open one in Applications and pick See commissions)">
            <TextInput value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Every partner" className="w-80 font-mono text-xs" />
          </Field>
        </FilterBar>
        {!partnerOk && <p className="text-xs text-red-700">A partner id is the long id shown on the partner's page.</p>}
        {actError ? <ErrorNote error={actError} /> : null}
        {error ? <ErrorNote error={error} what="Partner commissions" onRetry={() => void load(null)} /> : (
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Placed</Th><Th>Order</Th><Th>Source</Th><Th num>Order value</Th><Th num>Commission</Th><Th num>Returned</Th>
                <Th>State</Th><Th>Delivered</Th><Th>Approves after</Th><Th><span className="sr-only">Actions</span></Th>
              </THead>
              <TBody>
                {!loading && rows.length === 0 && <EmptyRow colSpan={10}>No commission yet.</EmptyRow>}
                {rows.map((c) => {
                  const rel = releaseWhy(c);
                  const rej = rejectWhy(c);
                  return (
                    <Tr key={c.id}>
                      <Td muted>{day(c.placed_at)}</Td>
                      <Td><Link to={`/orders/${c.order_id}`} className="font-mono text-xs text-blue-700 underline" title={c.order_id}>{shortId(c.order_id)}</Link></Td>
                      <Td>{codeWords(c.source)}</Td>
                      <Td num><Amount rupees={c.base} /></Td>
                      <Td num><Amount rupees={c.amount} /></Td>
                      <Td num><Amount rupees={c.returned} muted /></Td>
                      <Td>
                        <StatusChip status={c.state} label={codeWords(c.state)} />
                        {c.flags.length > 0 && <div className="mt-1 text-xs text-amber-800">{c.flags.map(codeWords).join(', ')}</div>}
                        {(c.rejected_reason || c.reversed_reason) && <div className="mt-1 text-xs text-gray-500">{c.rejected_reason ?? c.reversed_reason}</div>}
                      </Td>
                      <Td muted>{day(c.delivered_on, 'not yet')}</Td>
                      <Td muted>{day(c.approve_after, 'not set')}</Td>
                      <Td>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Btn variant="ghost" size="sm" onClick={() => setRule(c)} aria-label="The rate it was worked out on"><Info className="h-4 w-4" />Rate</Btn>
                          {c.state === 'held' && (
                            <Btn variant="success" size="sm" disabled={!!rel || busy === c.id} title={rel ?? undefined} onClick={() => void release(c)}>
                              <Unlock className="h-4 w-4" />Release
                            </Btn>
                          )}
                          {!rej && (
                            <Btn variant="dangerOutline" size="sm" disabled={busy === c.id} onClick={() => { setActError(null); setRejecting(c); }}>
                              <X className="h-4 w-4" />Refuse
                            </Btn>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </table>
          </TableShell>
        )}
        {loading && <Loading label="Reading commissions" />}
        {cursor && !loading && <Btn variant="outline" onClick={() => void load(cursor)}>Load more</Btn>}
      </div>

      <ConfirmDialog open={!!rule} title="How this commission was worked out" confirmLabel="Close" onClose={() => setRule(null)} onConfirm={() => setRule(null)}>
        {rule && (
          <>
            <p>Terms version id <span className="font-mono text-xs">{rule.terms_version_id ?? 'not recorded'}</span>. The rate below is the one in force on the order's day.</p>
            <ValueRows value={rule.rule} empty="No rate snapshot recorded." />
          </>
        )}
      </ConfirmDialog>

      <ReasonDialog
        open={!!rejecting}
        title="Refuse this commission"
        confirmLabel="Refuse"
        danger
        busy={!!busy}
        error={actError}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => void reject(reason)}
      >
        <p>The partner sees it as not counted. A commission in an approved or paid batch cannot be refused.</p>
      </ReasonDialog>
    </SectionCard>
  );
};

/* ── payout batches ────────────────────────────────────────────────────── */

const Batches: React.FC = () => {
  const { hasPerm, user } = useAuth();
  const canManage = hasPerm(PARTNER_PERMS.manage);
  const canPay = hasPerm(PARTNER_PERMS.payout);
  const [rows, setRows] = useState<PayoutBatch[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayoutBatch | null>(null);
  const [detailError, setDetailError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actError, setActError] = useState<unknown>(null);
  const [building, setBuilding] = useState(false);
  const [approving, setApproving] = useState<PayoutBatch | null>(null);
  const [paying, setPaying] = useState<PayoutBatch | null>(null);
  const [pay, setPay] = useState({ paid_on: todayIso(), reference: '' });
  const [cancelling, setCancelling] = useState<PayoutBatch | null>(null);

  const load = useCallback(async (more: string | null) => {
    setLoading(true); setError(null);
    try {
      const page = await listBatches({ cursor: more });
      setRows((cur) => (more ? [...cur, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e);
      if (!more) setRows([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(null); }, [load]);

  const toggle = async (b: PayoutBatch) => {
    if (openId === b.id) { setOpenId(null); return; }
    setOpenId(b.id); setDetail(null); setDetailError(null);
    try { setDetail(await getBatch(b.id)); } catch (e) { setDetailError(e); }
  };

  const put = (b: PayoutBatch) => {
    setRows((cur) => cur.map((r) => (r.id === b.id ? { ...r, ...b } : r)));
    if (openId === b.id) setDetail(b);
  };

  const act = async (b: PayoutBatch, fn: () => Promise<PayoutBatch>, done?: () => void) => {
    setBusy(b.id); setActError(null);
    try { put(await fn()); done?.(); } catch (e) { setActError(e); } finally { setBusy(null); }
  };

  const build = async () => {
    setBusy('build'); setActError(null);
    try { const b = await buildBatch(); setRows((cur) => [b, ...cur.filter((r) => r.id !== b.id)]); setBuilding(false); } catch (e) { setActError(e); } finally { setBusy(null); }
  };

  const builtByMe = (b: PayoutBatch) => samePerson(b.built_by, user?._id);
  // Four eyes (as Approvals): the builder never approves. When the ids cannot be compared the
  // button stays on and the server's `retain.self_approval` words show.
  const approveWhy = (b: PayoutBatch) => whyDisabled(canPay, [
    builtByMe(b) && 'You built this batch. Another person must approve it.',
  ], 'Post accounting');
  const payWhy = whyDisabled(canPay, [], 'Post accounting');
  const manageWhy = whyDisabled(canManage, [], 'Manage marketing');
  const referenceOk = pay.reference.trim().length >= 3 && pay.reference.trim().length <= 120;
  const paidOnOk = !!pay.paid_on && pay.paid_on <= todayIso();

  return (
    <SectionCard
      title="Payout batches"
      description="One batch a month for partners at or above the minimum payout with a bank account. Books works out the tax; the person who built a batch never approves it."
      action={(
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={() => void load(null)}><RefreshCw className="h-4 w-4" />Refresh</Btn>
          <Btn size="sm" disabled={!!manageWhy || busy === 'build'} title={manageWhy ?? undefined} onClick={() => { setActError(null); setBuilding(true); }}>
            <Hammer className="h-4 w-4" />Build last month
          </Btn>
        </div>
      )}
    >
      <div className="space-y-4">
        {actError ? <ErrorNote error={actError} /> : null}
        {error ? <ErrorNote error={error} what="Payout batches" onRetry={() => void load(null)} /> : (
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th><span className="sr-only">Open</span></Th><Th>Month</Th><Th>State</Th><Th num>Before tax</Th><Th num>Tax</Th><Th num>Paid out</Th>
                <Th num>Partners</Th><Th>Built by</Th><Th>Approved by</Th><Th>Paid</Th>
              </THead>
              <TBody>
                {!loading && rows.length === 0 && <EmptyRow colSpan={10}>No batch yet. One is built on the payout day, or build last month's now.</EmptyRow>}
                {rows.map((b) => {
                  const isOpen = openId === b.id;
                  const d = isOpen ? detail : null;
                  const aWhy = approveWhy(b);
                  return (
                    <React.Fragment key={b.id}>
                      <Tr>
                        <Td>
                          <button type="button" onClick={() => void toggle(b)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Close' : 'Open'} the ${b.period} batch`}
                            className="rounded p-1 text-gray-500 hover:bg-gray-100">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </Td>
                        <Td className="font-medium">{b.period}</Td>
                        <Td><StatusChip status={b.state} label={codeWords(b.state)} /></Td>
                        <Td num><Amount rupees={b.gross} /></Td>
                        <Td num><Amount rupees={b.tax_deducted} /></Td>
                        <Td num><Amount rupees={b.net} /></Td>
                        <Td num>{b.lines_count}</Td>
                        <Td className="font-mono text-xs" title={b.built_by ?? undefined}>{builtByMe(b) ? 'you' : shortId(b.built_by)}</Td>
                        <Td className="font-mono text-xs" title={b.approved_by ?? undefined}>{b.approved_by ? shortId(b.approved_by) : 'not yet'}</Td>
                        <Td muted>{b.paid_on ? `${day(b.paid_on)}${b.payment_reference ? `, ${b.payment_reference}` : ''}` : 'not yet'}</Td>
                      </Tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={10} className="bg-gray-50 px-4 py-4">
                            <div className="space-y-4">
                              <div className="flex flex-wrap gap-2">
                                {b.state === 'draft' && (
                                  <>
                                    <Btn variant="outline" size="sm" disabled={!!manageWhy || busy === b.id} title={manageWhy ?? undefined}
                                      onClick={() => void act(b, () => moveBatch(b.id, 'quote'))}>
                                      <Calculator className="h-4 w-4" />Ask Books for the tax again
                                    </Btn>
                                    <Btn variant="success" size="sm" disabled={!!aWhy || busy === b.id} title={aWhy ?? undefined}
                                      onClick={() => { setActError(null); setApproving(b); }}>
                                      <Check className="h-4 w-4" />Approve
                                    </Btn>
                                    <Btn variant="dangerOutline" size="sm" disabled={!!manageWhy || busy === b.id} title={manageWhy ?? undefined}
                                      onClick={() => { setActError(null); setCancelling(b); }}>
                                      <X className="h-4 w-4" />Cancel batch
                                    </Btn>
                                  </>
                                )}
                                {b.state === 'approved' && (
                                  <Btn variant="success" size="sm" disabled={!!payWhy || busy === b.id} title={payWhy ?? undefined}
                                    onClick={() => { setActError(null); setPay({ paid_on: todayIso(), reference: '' }); setPaying(b); }}>
                                    <Banknote className="h-4 w-4" />Record bank payment
                                  </Btn>
                                )}
                              </div>
                              {b.state === 'draft' && aWhy && <p className="text-xs text-gray-600">{aWhy}</p>}
                              {detailError ? <ErrorNote error={detailError} what="This batch" /> : !d ? <Loading label="Reading the batch" /> : (
                                <>
                                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                                    <div><dt className="inline text-gray-500">Cut-off: </dt><dd className="inline">{day(d.cutoff)}</dd></div>
                                    <div><dt className="inline text-gray-500">Minimum payout: </dt><dd className="inline"><Amount rupees={d.min_payout} /></dd></div>
                                    <div><dt className="inline text-gray-500">Built: </dt><dd className="inline">{when(d.created_at)}</dd></div>
                                    <div><dt className="inline text-gray-500">Paid by: </dt><dd className="inline font-mono text-xs">{d.paid_by ? shortId(d.paid_by) : 'not yet'}</dd></div>
                                    {d.cancel_reason && <div className="sm:col-span-2"><dt className="inline text-gray-500">Cancelled: </dt><dd className="inline">{d.cancel_reason}</dd></div>}
                                    {d.tax_note && <div className="sm:col-span-2"><dt className="inline text-gray-500">Tax: </dt><dd className="inline">{d.tax_note}</dd></div>}
                                  </dl>
                                  {!d.tax_rule && (
                                    <Notice tone="warn">No tax rule is set by Growcord yet, so this batch cannot be approved. Nothing is paid on a guessed rate.</Notice>
                                  )}
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div><div className="mb-1 text-xs font-semibold uppercase text-gray-500">Tax rule</div><ValueRows value={d.tax_rule} empty="Not set." /></div>
                                    <div><div className="mb-1 text-xs font-semibold uppercase text-gray-500">Books reference</div><ValueRows value={d.books_ref} empty="Not booked yet." /></div>
                                  </div>
                                  <div>
                                    <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Left out this month</div>
                                    <ValueRows value={d.skipped} empty="No partner was left out." />
                                  </div>
                                  <TableShell>
                                    <table className="w-full text-sm">
                                      <THead><Th>Partner</Th><Th>Account</Th><Th>IFSC</Th><Th num>Commissions</Th><Th num>Before tax</Th><Th num>Tax</Th><Th num>Paid out</Th><Th>State</Th></THead>
                                      <TBody>
                                        {d.lines.length === 0 && <EmptyRow colSpan={8}>No partner in this batch.</EmptyRow>}
                                        {d.lines.map((l) => (
                                          <Tr key={l.id}>
                                            <Td>{l.display_name}</Td>
                                            <Td className="font-mono text-xs">ending {l.account_last4}</Td>
                                            <Td className="font-mono text-xs">{l.ifsc}</Td>
                                            <Td num>{l.commissions}</Td>
                                            <Td num><Amount rupees={l.gross} /></Td>
                                            <Td num><Amount rupees={l.tax_deducted} /></Td>
                                            <Td num><Amount rupees={l.net} /></Td>
                                            <Td><StatusChip status={l.state} label={codeWords(l.state)} /></Td>
                                          </Tr>
                                        ))}
                                      </TBody>
                                    </table>
                                  </TableShell>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </TBody>
            </table>
          </TableShell>
        )}
        {loading && <Loading label="Reading payout batches" />}
        {cursor && !loading && <Btn variant="outline" onClick={() => void load(cursor)}>Load more</Btn>}
      </div>

      <ConfirmDialog open={building} title="Build last month's batch" confirmLabel="Build" busy={busy === 'build'}
        onClose={() => setBuilding(false)} onConfirm={() => void build()}>
        <p>Builds the draft for the last closed month now. You will not be able to approve it yourself; another person must.</p>
        {actError ? <ErrorNote error={actError} /> : null}
      </ConfirmDialog>

      <ConfirmDialog open={!!approving} title={`Approve the ${approving?.period ?? ''} batch`} confirmLabel="Approve and book" busy={!!busy}
        onClose={() => setApproving(null)} onConfirm={() => approving && void act(approving, () => moveBatch(approving.id, 'approve'), () => setApproving(null))}>
        <p>Books books the batch: the commission expense, the tax deducted and the amount owed to each partner. This cannot be undone here.</p>
        {approving && <p>Paid out <Amount rupees={approving.net} /> to {approving.lines_count} partners, tax <Amount rupees={approving.tax_deducted} />.</p>}
        {actError ? <ErrorNote error={actError} /> : null}
      </ConfirmDialog>

      <ConfirmDialog open={!!paying} title={`Record the bank payment of ${paying?.period ?? ''}`} confirmLabel="Record payment" busy={!!busy}
        confirmDisabled={!referenceOk || !paidOnOk}
        onClose={() => setPaying(null)}
        onConfirm={() => paying && void act(paying, () => payBatch(paying.id, { paid_on: pay.paid_on, reference: pay.reference.trim() }), () => setPaying(null))}>
        <Field label="Paid on (not after today)">
          <TextInput type="date" value={pay.paid_on} max={todayIso()} onChange={(e) => setPay((p) => ({ ...p, paid_on: e.target.value }))} />
        </Field>
        <Field label="Bank reference (3 to 120 characters)">
          <TextInput value={pay.reference} maxLength={120} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} />
        </Field>
        {actError ? <ErrorNote error={actError} /> : null}
      </ConfirmDialog>

      <ReasonDialog
        open={!!cancelling}
        title={`Cancel the ${cancelling?.period ?? ''} draft`}
        confirmLabel="Cancel batch"
        danger
        busy={!!busy}
        error={actError}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => cancelling && void act(cancelling, () => cancelBatch(cancelling.id, reason), () => setCancelling(null))}
      >
        <p>Its partners move to the next payout.</p>
      </ReasonDialog>
    </SectionCard>
  );
};

export default PartnerMoney;
