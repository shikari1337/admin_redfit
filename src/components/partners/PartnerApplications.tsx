import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Eye, Pause, Percent, Play, RefreshCw, X } from 'lucide-react';
import {
  Btn, EmptyRow, Field, RateInput, StatusChip, TableShell, TBody, Td, Th, THead, TextInput, Tr, inrMinor, rateText,
} from '@/components/erp';
import { FilterChip } from '@/components/sales/ListChrome';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, ErrorNote, Loading, Notice, ReasonDialog, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import {
  PARTNER_PERMS, approvePartner, codeWords, getPartner, listPartners, movePartner, setPartnerRate,
  type PartnerMove, type PartnerRow, type PartnerTermsView,
} from '@/lib/v2/partners';
import { day, Line, shortId, when } from './common';

/**
 * AD03 Partner applications and partners (HMAPP design 60): a person approves, refuses, suspends
 * or resumes, and may set a partner's own rate. No key or agent decides (the server refuses one).
 *
 * Server: `GET /partners?status&cursor&limit`, `GET /partners/{id}`, `POST /partners/{id}/approve`
 * {code?, rate_milli?, reason?}, `/refuse`, `/suspend`, `/resume` {reason 5 to 500},
 * `PUT /partners/{id}/rate` {rate_milli | null, reason}. Read `marketing.read`, decide
 * `marketing.manage`, own rate `settings.manage`.
 */

/** A vanity code: 3 to 32 letters and digits (`ret/service/partners.rs:564-573`). */
const CODE_SHAPE = /^[A-Za-z0-9]{3,32}$/;

const linksOf = (channels: unknown): string[] => (Array.isArray(channels) ? channels.filter((c): c is string => typeof c === 'string') : []);

const PartnerApplications: React.FC<{ terms: PartnerTermsView | null }> = ({ terms }) => {
  const { hasPerm } = useAuth();
  const canDecide = hasPerm(PARTNER_PERMS.manage);
  const canRate = hasPerm(PARTNER_PERMS.terms);
  const maxRate = terms?.platform_limits?.max_commission_milli ?? null;

  const [status, setStatus] = useState<string>('');
  const [seen, setSeen] = useState<string[]>([]);
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [open, setOpen] = useState<PartnerRow | null>(null);
  const [detailError, setDetailError] = useState<unknown>(null);

  const [approving, setApproving] = useState(false);
  const [approve, setApprove] = useState<{ code: string; rate: number | null; reason: string }>({ code: '', rate: null, reason: '' });
  const [moving, setMoving] = useState<PartnerMove | null>(null);
  const [rating, setRating] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<unknown>(null);

  const load = useCallback(async (more: string | null) => {
    setLoading(true); setError(null);
    try {
      const page = await listPartners({ status, cursor: more });
      setRows((cur) => (more ? [...cur, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setSeen((cur) => [...new Set([...cur, ...page.items.map((p) => p.status)])]);
    } catch (e) {
      setError(e);
      if (!more) setRows([]);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(null); }, [load]);

  const openRow = async (p: PartnerRow) => {
    setOpen(p); setDetailError(null);
    try { setOpen(await getPartner(p.id)); } catch (e) { setDetailError(e); }
  };

  const replace = (p: PartnerRow) => {
    setRows((cur) => cur.map((r) => (r.id === p.id ? { ...r, ...p } : r)));
    setOpen(p);
  };

  const doApprove = async () => {
    if (!open) return;
    setBusy(true); setActError(null);
    try {
      const body: { code?: string; rate_milli?: number; reason?: string } = {};
      if (approve.code.trim()) body.code = approve.code.trim();
      if (approve.rate !== null) body.rate_milli = approve.rate;
      if (approve.reason.trim()) body.reason = approve.reason.trim();
      replace(await approvePartner(open.id, body));
      setApproving(false);
    } catch (e) { setActError(e); } finally { setBusy(false); }
  };

  const doMove = async (reason: string) => {
    if (!open || !moving) return;
    setBusy(true); setActError(null);
    try { replace(await movePartner(open.id, moving, reason)); setMoving(null); } catch (e) { setActError(e); } finally { setBusy(false); }
  };

  const doRate = async (reason: string) => {
    if (!open) return;
    setBusy(true); setActError(null);
    try { replace(await setPartnerRate(open.id, rate, reason)); setRating(false); } catch (e) { setActError(e); } finally { setBusy(false); }
  };

  const programmeOff = terms && !terms.programme_on ? 'The partner programme is off, so no one can be approved.' : null;
  const approveOff = whyDisabled(canDecide, [programmeOff], 'Manage marketing');
  const decideOff = whyDisabled(canDecide, [], 'Manage marketing');
  const rateOff = whyDisabled(canRate, []);
  const codeBad = approve.code.trim() !== '' && !CODE_SHAPE.test(approve.code.trim());

  const MOVE_WORDS: Record<PartnerMove, { title: string; confirm: string }> = {
    refuse: { title: 'Refuse this application', confirm: 'Refuse' },
    suspend: { title: 'Pause this partner', confirm: 'Pause' },
    resume: { title: 'Resume this partner', confirm: 'Resume' },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip on={status === ''} onClick={() => setStatus('')}>All</FilterChip>
        {seen.map((s) => (
          <FilterChip key={s} on={status === s} tone={s === 'applied' ? 'warn' : undefined} onClick={() => setStatus(s)}>
            {codeWords(s)}
          </FilterChip>
        ))}
        <Btn variant="outline" size="sm" className="ml-auto" onClick={() => void load(null)}><RefreshCw className="h-4 w-4" />Refresh</Btn>
      </div>

      {error ? <ErrorNote error={error} what="Partner applications" onRetry={() => void load(null)} /> : (
        <TableShell>
          <table className="w-full text-sm">
            <THead><Th>Name</Th><Th>Kind</Th><Th>Applied</Th><Th>Links</Th><Th>Code</Th><Th>Status</Th><Th><span className="sr-only">Open</span></Th></THead>
            <TBody>
              {!loading && rows.length === 0 && <EmptyRow colSpan={7}>No applications yet. Customers apply in the app once the programme is on.</EmptyRow>}
              {rows.map((p) => (
                <Tr key={p.id} className="cursor-pointer" onClick={() => void openRow(p)}>
                  <Td className="font-medium">{p.display_name}</Td>
                  <Td>{p.kind}</Td>
                  <Td muted>{day(p.applied_at)}</Td>
                  <Td num>{linksOf(p.channels).length}</Td>
                  <Td className="font-mono text-xs">{p.code ?? 'none yet'}</Td>
                  <Td><StatusChip status={p.status} label={codeWords(p.status)} /></Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <Btn variant="ghost" size="sm" onClick={() => void openRow(p)} aria-label={`Open ${p.display_name}`}><Eye className="h-4 w-4" />Open</Btn>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      )}
      {loading && <Loading label="Reading applications" />}
      {cursor && !loading && <Btn variant="outline" onClick={() => void load(cursor)}>Load more</Btn>}

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  {open.display_name}<StatusChip status={open.status} label={codeWords(open.status)} />
                </SheetTitle>
                <SheetDescription>Applied {when(open.applied_at)}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-5">
                {detailError ? <ErrorNote error={detailError} what="This partner" /> : null}

                {open.status === 'applied' && (
                  <Notice tone="warn" title="Before you approve">
                    Doctors and store staff cannot be partners: no referral fees or gifts. Check their links and what they wrote.
                  </Notice>
                )}

                <div className="flex flex-wrap gap-2">
                  {open.status === 'applied' && (
                    <>
                      <Btn variant="success" disabled={!!approveOff} title={approveOff ?? undefined}
                        onClick={() => { setActError(null); setApprove({ code: '', rate: null, reason: '' }); setApproving(true); }}>
                        <Check className="h-4 w-4" />Approve
                      </Btn>
                      <Btn variant="dangerOutline" disabled={!!decideOff} title={decideOff ?? undefined} onClick={() => { setActError(null); setMoving('refuse'); }}>
                        <X className="h-4 w-4" />Refuse
                      </Btn>
                    </>
                  )}
                  {open.status === 'approved' && (
                    <Btn variant="dangerOutline" disabled={!!decideOff} title={decideOff ?? undefined} onClick={() => { setActError(null); setMoving('suspend'); }}>
                      <Pause className="h-4 w-4" />Pause
                    </Btn>
                  )}
                  {open.status === 'suspended' && (
                    <Btn variant="outline" disabled={!!decideOff} title={decideOff ?? undefined} onClick={() => { setActError(null); setMoving('resume'); }}>
                      <Play className="h-4 w-4" />Resume
                    </Btn>
                  )}
                  {(open.status === 'approved' || open.status === 'suspended') && (
                    <Btn variant="outline" disabled={!!rateOff} title={rateOff ?? undefined}
                      onClick={() => { setActError(null); setRate(open.own_rate_milli); setRating(true); }}>
                      <Percent className="h-4 w-4" />Own rate
                    </Btn>
                  )}
                </div>
                {(approveOff || decideOff) && open.status === 'applied' && <p className="text-xs text-gray-500">{approveOff ?? decideOff}</p>}

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Application</h3>
                  <dl className="divide-y divide-gray-100">
                    <Line label="Kind">{open.kind}</Line>
                    <Line label="Name they share under">{open.display_name}</Line>
                    <Line label="About">{open.about ? <span className="whitespace-pre-wrap">{open.about}</span> : 'nothing written'}</Line>
                    <Line label="Links">
                      {linksOf(open.channels).length === 0 ? 'none' : (
                        <ul className="space-y-1">
                          {linksOf(open.channels).map((u) => (
                            <li key={u}>
                              <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-blue-700 underline">
                                {u}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Line>
                    <Line label="Declarations">
                      {open.declarations && typeof open.declarations === 'object' ? (
                        <ul className="space-y-0.5">
                          {Object.entries(open.declarations as Record<string, unknown>).map(([k, v]) => (
                            <li key={k}>{codeWords(k)}: {typeof v === 'boolean' ? (v ? 'yes' : 'no') : k.endsWith('_at') ? when(v) : String(v)}</li>
                          ))}
                        </ul>
                      ) : 'none recorded'}
                    </Line>
                    <Line label="Customer"><Link to={`/customers/${open.customer_id}`} className="text-blue-700 underline">Open the customer</Link></Line>
                    <Line label="Commissions"><Link to={`/partners?tab=money&partner=${open.id}`} onClick={() => setOpen(null)} className="text-blue-700 underline">See commissions</Link></Line>
                  </dl>
                </section>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Decisions</h3>
                  <dl className="divide-y divide-gray-100">
                    <Line label="Code" mono>{open.code ?? 'minted on approval'}</Line>
                    <Line label="Own rate">{open.own_rate_milli != null ? rateText(open.own_rate_milli) : 'the terms\' rate'}</Line>
                    <Line label="Decided by" mono>{shortId(open.decided_by)}</Line>
                    <Line label="Decision reason">{open.decision_reason ?? 'none given'}</Line>
                    <Line label="Status changed by" mono>{shortId(open.status_changed_by)}</Line>
                    <Line label="Status reason">{open.status_reason ?? 'none given'}</Line>
                  </dl>
                </section>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Commissions by state</h3>
                  {Array.isArray(open.totals) && open.totals.length > 0 ? (
                    <dl className="divide-y divide-gray-100">
                      {(open.totals as Array<{ state?: string; count?: number; amount_minor?: number }>).map((r) => (
                        <Line key={String(r.state)} label={codeWords(r.state)}>{r.count ?? 0} orders, {inrMinor(r.amount_minor ?? 0)}</Line>
                      ))}
                    </dl>
                  ) : <p className="text-sm text-gray-500">No commission yet.</p>}
                </section>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Payout account</h3>
                  {open.bank ? (
                    <dl className="divide-y divide-gray-100">
                      <Line label="Holder">{String(open.bank.holder_name ?? '')}</Line>
                      <Line label="Account" mono>ending {String(open.bank.account_last4 ?? '')}</Line>
                      <Line label="IFSC" mono>{String(open.bank.ifsc ?? '')}</Line>
                      <Line label="Bank">{[open.bank.bank_name, open.bank.branch].filter(Boolean).join(', ') || 'not known'}</Line>
                      <Line label="PAN" mono>{open.bank.pan_last4 ? `ending ${String(open.bank.pan_last4)}` : 'not given'}</Line>
                    </dl>
                  ) : <p className="text-sm text-gray-500">No payout account yet.</p>}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={approving}
        title={`Approve ${open?.display_name ?? ''}`}
        confirmLabel="Approve"
        busy={busy}
        confirmDisabled={codeBad}
        onClose={() => setApproving(false)}
        onConfirm={() => void doApprove()}
      >
        <p>Doctors and store staff cannot be partners. Approving mints their code; they can then share it.</p>
        <Field label="Code (optional, 3 to 32 letters and digits)">
          <TextInput value={approve.code} maxLength={32} onChange={(e) => setApprove((a) => ({ ...a, code: e.target.value }))} />
        </Field>
        {codeBad && <p className="text-xs text-red-700">Letters and digits only, 3 to 32.</p>}
        <Field label="Own rate (optional; empty means the terms' rate)">
          <RateInput value={approve.rate} max={maxRate} aria-label="Own rate" onChange={(milli) => setApprove((a) => ({ ...a, rate: milli }))} />
        </Field>
        <Field label="Reason (optional)">
          <TextInput value={approve.reason} maxLength={500} onChange={(e) => setApprove((a) => ({ ...a, reason: e.target.value }))} />
        </Field>
        {actError ? <ErrorNote error={actError} /> : null}
      </ConfirmDialog>

      <ReasonDialog
        open={!!moving}
        title={moving ? MOVE_WORDS[moving].title : ''}
        confirmLabel={moving ? MOVE_WORDS[moving].confirm : ''}
        danger={moving !== 'resume'}
        busy={busy}
        error={actError}
        onClose={() => setMoving(null)}
        onConfirm={(reason) => void doMove(reason)}
      >
        {moving === 'refuse' && <p>They see the reason in the app and may apply again later.</p>}
        {moving === 'suspend' && <p>A paused partner earns nothing and their payouts wait until you resume them.</p>}
      </ReasonDialog>

      <ReasonDialog
        open={rating}
        title="Set this partner's own rate"
        confirmLabel="Save rate"
        busy={busy}
        error={actError}
        onClose={() => setRating(false)}
        onConfirm={(reason) => void doRate(reason)}
      >
        <p>Past orders keep the rate they were worked out on. Leave the box empty to use the terms' rate again.</p>
        <RateInput value={rate} max={maxRate} aria-label="Own rate" onChange={setRate} />
      </ReasonDialog>
    </div>
  );
};

export default PartnerApplications;
