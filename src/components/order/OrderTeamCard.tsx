import React, { useCallback, useEffect, useState } from 'react';
import { ordersAPI } from '../../services/api';
import { actionLabel } from '../../lib/activityVocab';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  UserCheck, Award, KeyRound, Loader2, History, Gavel, Hand, Lock, AlertTriangle, Bot,
} from 'lucide-react';
import { localeDateTime } from '../../utils/date';

interface StaffLite { id: string; name?: string | null; role?: string }

interface Props {
  orderId: string;                  // internal UUID
  orderNumber?: string;
  salesType?: 'direct' | 'assisted' | null;
  salesAgentId?: string | null;
  assignedTo?: string | null;
  assignedAt?: string | null;
  createdByUserId?: string | null;   // orders.user_id — who KEYED it in
  /** Server-resolved names (GET /orders/:id) — authoritative, no client lookup. */
  createdByName_?: string | null;
  salesAgentName?: string | null;
  assignedToName?: string | null;
  salesperson?: string | null;       // legacy free-text invoice field (mig 118)
  canManage: boolean;
  onChanged?: () => void;
}

const UNSET = '__none__';   // Radix Select cannot hold "" as a real value.
const TS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

const CLAIM_STATE_LABEL: Record<string, { label: string; tone: string }> = {
  none:      { label: 'Nobody credited',       tone: 'bg-gray-100 text-gray-600' },
  auto:      { label: 'Auto-credited',         tone: 'bg-blue-100 text-blue-700' },
  pending:   { label: 'Claim awaiting review', tone: 'bg-amber-100 text-amber-700' },
  contested: { label: 'Contested',             tone: 'bg-red-100 text-red-700' },
  settled:   { label: 'Settled',               tone: 'bg-green-100 text-green-700' },
};

/**
 * Sales credit + ownership on one order (migrations 151/152).
 *
 * The card renders TWO different worlds depending on `sales_type`:
 *
 *   DIRECT   an executive keyed the order in. The salesperson IS its creator,
 *            and that is a fact about what happened — so there is no control
 *            here at all, only a lock and an explanation. The backend 409s any
 *            attempt anyway; showing a disabled picker would imply the rule is
 *            a permission problem rather than a modelling one.
 *
 *   ASSISTED the customer ordered themselves and an executive made it happen.
 *            Credit is earned (a cart-recovery send auto-credits provisionally)
 *            or asserted by a claim — and when two people claim it, NOBODY is
 *            credited until a holder of `orders.approve` decides.
 *
 * Claims are shown in full, including the evidence behind an automatic credit,
 * because the point of the claims table is that a dispute stays visible and
 * reversible rather than collapsing into a single winner field.
 *
 * The legacy free-text `salesperson` (mig 118) is read-only when present: it is
 * the name printed on the tax invoice, and on live data it holds
 * 'Babita'/'BABITA'/'babita' for one person — it must never look like it drives
 * attribution.
 */
const OrderTeamCard: React.FC<Props> = ({
  orderId, salesType, salesAgentId, assignedTo, assignedAt, createdByUserId, salesperson,
  createdByName_, salesAgentName, assignedToName, canManage, onChanged,
}) => {
  const { user, hasPerm } = useAuth();
  const meId = user?._id;
  const canDecide = hasPerm('orders.approve');

  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [owner, setOwner] = useState<string>(assignedTo || UNSET);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activity, setActivity] = useState<any[] | null>(null);
  const [claimState, setClaimState] = useState<any | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const [showClaimBox, setShowClaimBox] = useState(false);

  useEffect(() => { setOwner(assignedTo || UNSET); }, [assignedTo]);

  useEffect(() => {
    let alive = true;
    ordersAPI.assignableStaff()
      .then((rows) => { if (alive) setStaff(rows); })
      .catch(() => { if (alive) setStaff([]); });
    return () => { alive = false; };
  }, []);

  const loadActivity = useCallback(() => {
    ordersAPI.activity(orderId, 50).then(setActivity).catch(() => setActivity([]));
  }, [orderId]);
  const loadClaims = useCallback(() => {
    ordersAPI.salesClaims(orderId).then(setClaimState).catch(() => setClaimState(null));
  }, [orderId]);

  useEffect(() => { loadActivity(); loadClaims(); }, [loadActivity, loadClaims]);

  const nameOf = (id?: string | null, serverName?: string | null) => {
    if (!id) return null;
    if (serverName) return serverName;
    return staff.find((s) => s.id === id)?.name ?? null;
  };

  async function run(key: string, fn: () => Promise<any>) {
    setSaving(key); setErr(null);
    try { await fn(); loadClaims(); loadActivity(); onChanged?.(); }
    catch (e: any) { setErr(e?.response?.data?.message ?? e?.message ?? 'Could not save'); }
    finally { setSaving(null); }
  }

  const type = (claimState?.sales_type ?? salesType) as 'direct' | 'assisted' | null;
  const state = claimState?.sales_claim_status ?? 'none';
  const claims: any[] = claimState?.claims ?? [];
  const liveClaims = claims.filter((c) => c.status === 'auto' || c.status === 'pending');
  const myClaim = liveClaims.find((c) => c.agent_id === meId);
  const creditedId = claimState?.sales_agent_id ?? salesAgentId ?? null;
  const awarded = claims.find((c) => c.status === 'approved');
  const badge = CLAIM_STATE_LABEL[state] ?? CLAIM_STATE_LABEL.none;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-gray-500" /> Sales &amp; ownership
          </span>
          {type && (
            <Badge variant="secondary" className="text-[11px] font-medium">
              {type === 'direct' ? 'Direct sale' : 'Assisted sale'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{err}</div>}

        {/* Created by — always a fact, never a control. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <KeyRound className="h-3.5 w-3.5 text-gray-400" /> Created by
          </div>
          <div className="text-right text-sm">
            {createdByUserId
              ? <span className="font-medium text-gray-900">{nameOf(createdByUserId, createdByName_) ?? 'Staff member'}</span>
              : <span className="text-gray-500">Customer (website)</span>}
          </div>
        </div>

        {/* ── DIRECT: settled by definition ─────────────────────────────── */}
        {type === 'direct' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Award className="h-3.5 w-3.5 text-gray-400" /> Salesperson
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {nameOf(creditedId, salesAgentName) ?? nameOf(createdByUserId, createdByName_) ?? '—'}
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                <Lock className="h-3 w-3" /> Fixed
              </span>
            </div>
            <p className="text-xs text-gray-500">
              A staff member keyed this order in, so the salesperson is whoever created it and cannot be reassigned.
            </p>
          </div>
        )}

        {/* ── ASSISTED (or not yet classified) ──────────────────────────── */}
        {type !== 'direct' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Award className="h-3.5 w-3.5 text-gray-400" /> Sales credit
              </div>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.tone}`}>{badge.label}</span>
            </div>

            {creditedId && (
              <div className="text-sm font-medium text-gray-900">
                {nameOf(creditedId, salesAgentName) ?? 'Staff member'}
              </div>
            )}

            {state === 'contested' && (
              <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {liveClaims.length} people claim this sale, so nobody is credited yet.
                  {canDecide ? ' Award one below to settle it.' : ' A manager needs to decide.'}
                </span>
              </div>
            )}

            {liveClaims.length > 0 && (
              <ul className="space-y-2">
                {liveClaims.map((c) => (
                  <li key={c.id} className="rounded border border-gray-200 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                          {c.agent_name ?? 'Staff member'}
                          {c.agent_id === meId && <span className="text-[11px] font-normal text-gray-500">(you)</span>}
                          {c.basis === 'auto_recovery' && (
                            <span title="Credited automatically — they sent the cart-recovery message"
                              className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 text-[10px] text-blue-700">
                              <Bot className="h-2.5 w-2.5" /> auto
                            </span>
                          )}
                        </div>
                        {c.note && <p className="mt-0.5 text-xs text-gray-600">{c.note}</p>}
                        {c.basis === 'auto_recovery' && c.evidence?.channel && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            Sent a {c.evidence.channel} recovery message {Math.round(c.evidence.hours_before_order)}h before this order
                            {c.evidence.other_senders?.length > 0 &&
                              ` · ${c.evidence.other_senders.length} colleague(s) also messaged this cart`}
                          </p>
                        )}
                      </div>
                      {canDecide && (
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" className="h-7 px-2 text-xs" disabled={saving !== null}
                            onClick={() => run(`a${c.id}`, () => ordersAPI.decideSaleClaim(orderId, c.id, 'approve'))}>
                            {saving === `a${c.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Award'}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={saving !== null}
                            onClick={() => run(`r${c.id}`, () => ordersAPI.decideSaleClaim(orderId, c.id, 'reject'))}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Claim / withdraw — acting for YOURSELF only. */}
            {canManage && (
              myClaim ? (
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving !== null}
                  onClick={() => run('withdraw', () => ordersAPI.withdrawSaleClaim(orderId))}>
                  {saving === 'withdraw' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Withdraw my claim
                </Button>
              ) : showClaimBox ? (
                <div className="space-y-2">
                  <Textarea rows={2} value={claimNote} onChange={(e) => setClaimNote(e.target.value)}
                    placeholder="How did you help this customer? (the manager who decides will read this)"
                    className="text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 text-xs" disabled={saving !== null}
                      onClick={() => run('claim', async () => {
                        await ordersAPI.claimSale(orderId, claimNote.trim() || undefined);
                        setClaimNote(''); setShowClaimBox(false);
                      })}>
                      {saving === 'claim' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Submit claim
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs"
                      onClick={() => { setShowClaimBox(false); setClaimNote(''); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowClaimBox(true)}>
                  <Hand className="mr-1 h-3 w-3" /> I helped with this sale
                </Button>
              )
            )}

            {awarded && (
              <p className="flex items-start gap-1 text-xs text-gray-500">
                <Gavel className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Awarded by {awarded.decided_by_name ?? 'a manager'}
                  {awarded.decision_note ? ` — “${awarded.decision_note}”` : ''}
                </span>
              </p>
            )}
          </div>
        )}

        {salesperson && (
          <p className="text-xs text-gray-500">
            Invoice salesperson: <span className="font-medium">{salesperson}</span> (printed on the tax invoice)
          </p>
        )}

        {/* Managed by — who owns the work right now. */}
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <UserCheck className="h-3.5 w-3.5 text-gray-400" /> Managed by
            {saving === 'owner' && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          </div>
          {canManage ? (
            <Select value={owner} disabled={saving !== null}
              onValueChange={(v) => { setOwner(v); run('owner', () => ordersAPI.assign(orderId, v === UNSET ? null : v)); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Unassigned</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-sm font-medium text-gray-900">{nameOf(assignedTo, assignedToName) ?? 'Unassigned'}</div>
          )}
          {assignedTo && assignedAt && (
            <p className="text-xs text-gray-500">since {localeDateTime(assignedAt, TS, 'en-IN')}</p>
          )}
        </div>

        {/* Who did what, on this order */}
        <div className="border-t border-gray-100 pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
            <History className="h-3.5 w-3.5 text-gray-400" /> Staff activity
            {!!activity?.length && <Badge variant="secondary" className="text-xs">{activity.length}</Badge>}
          </div>
          {activity === null && <p className="text-xs text-gray-400">Loading…</p>}
          {activity?.length === 0 && (
            <p className="text-xs text-gray-500">
              No tracked steps yet. Activity is recorded from the moment a staff member acts on this order.
            </p>
          )}
          {!!activity?.length && (
            <ul className="space-y-1.5">
              {activity.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="min-w-0 text-gray-700">
                    <span className="font-medium text-gray-900">{r.actor_name || 'System'}</span>{' '}
                    {actionLabel(r.action)}
                    {r.from_value && r.to_value && (
                      <span className="text-gray-500"> · {r.from_value} → {r.to_value}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-gray-400">{localeDateTime(r.occurred_at, TS, 'en-IN')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderTeamCard;
