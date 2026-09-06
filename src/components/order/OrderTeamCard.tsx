import React, { useEffect, useState } from 'react';
import { ordersAPI } from '../../services/api';
import { actionLabel } from '../../lib/activityVocab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserCheck, Award, KeyRound, Loader2, History } from 'lucide-react';

interface StaffLite { id: string; name?: string | null; email?: string; role?: string; isActive?: boolean; is_active?: boolean }

interface Props {
  orderId: string;                  // internal UUID
  orderNumber?: string;
  /** Raw order row fields. The API layer camelCases, so accept both spellings. */
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

/**
 * Sales & ownership on one order (migration 151).
 *
 * Shows the THREE distinct people an order can have, which the admin never
 * surfaced before even though `user_id` had been recorded since manual orders
 * shipped:
 *   Created by     immutable — who keyed it in. No control; it is a fact.
 *   Sales credit   editable — who the sale counts for on the leaderboard.
 *   Managed by     editable — who owns it right now.
 *
 * The legacy free-text `salesperson` (typed on the invoice screen) is shown
 * when it exists but is deliberately NOT editable here: it is the name printed
 * on the tax invoice, and on live data it holds 'Babita'/'BABITA'/'babita' as
 * three different values for one person. Editing it here would imply it drives
 * attribution, which it must not.
 */
const OrderTeamCard: React.FC<Props> = ({
  orderId, salesAgentId, assignedTo, assignedAt, createdByUserId, salesperson,
  createdByName_, salesAgentName, assignedToName, canManage, onChanged,
}) => {
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [agent, setAgent] = useState<string>(salesAgentId || UNSET);
  const [owner, setOwner] = useState<string>(assignedTo || UNSET);
  const [saving, setSaving] = useState<'agent' | 'owner' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activity, setActivity] = useState<any[] | null>(null);

  useEffect(() => { setAgent(salesAgentId || UNSET); }, [salesAgentId]);
  useEffect(() => { setOwner(assignedTo || UNSET); }, [assignedTo]);

  useEffect(() => {
    let alive = true;
    ordersAPI.assignableStaff()
      .then((rows) => { if (alive) setStaff(rows); })
      .catch(() => { if (alive) setStaff([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    ordersAPI.activity(orderId, 50)
      .then((rows) => { if (alive) setActivity(rows); })
      .catch(() => { if (alive) setActivity([]); });
    return () => { alive = false; };
  }, [orderId]);

  // Server-resolved name wins. The picker list loads asynchronously and (before
  // `assignableStaff`) excluded admins entirely, so resolving purely from it
  // rendered "Staff member" on first paint and never named the store owner.
  const nameOf = (id?: string | null, serverName?: string | null) => {
    if (!id) return null;
    if (serverName) return serverName;
    const u = staff.find((s) => s.id === id);
    return u?.name || u?.email || null;
  };

  // Only ACTIVE staff can be picked — the backend enforces this too, so
  // offering a deactivated person would just produce a 400 the user can't act on.
  const assignable = staff.filter((s) => s.isActive !== false && s.is_active !== false);

  async function save(kind: 'agent' | 'owner', value: string) {
    const id = value === UNSET ? null : value;
    setSaving(kind); setErr(null);
    try {
      if (kind === 'agent') { setAgent(value); await ordersAPI.setSalesAgent(orderId, id); }
      else { setOwner(value); await ordersAPI.assign(orderId, id); }
      ordersAPI.activity(orderId, 50).then(setActivity).catch(() => {});
      onChanged?.();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Could not save');
      // Snap back so the control never shows a value the server rejected.
      if (kind === 'agent') setAgent(salesAgentId || UNSET); else setOwner(assignedTo || UNSET);
    } finally { setSaving(null); }
  }

  const createdByName = nameOf(createdByUserId, createdByName_);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4 text-gray-500" /> Sales &amp; ownership
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{err}</div>}

        {/* Created by — a fact, never a control. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <KeyRound className="h-3.5 w-3.5 text-gray-400" /> Created by
          </div>
          <div className="text-right text-sm">
            {createdByUserId
              ? <span className="font-medium text-gray-900">{createdByName ?? 'Staff member'}</span>
              : <span className="text-gray-500">Customer (website)</span>}
          </div>
        </div>

        {/* Sales credit */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Award className="h-3.5 w-3.5 text-gray-400" /> Sales credit
            {saving === 'agent' && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          </div>
          {canManage ? (
            <Select value={agent} onValueChange={(v) => save('agent', v)} disabled={saving !== null}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Nobody credited" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Nobody credited</SelectItem>
                {assignable.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name || s.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-sm font-medium text-gray-900">{nameOf(salesAgentId, salesAgentName) ?? '—'}</div>
          )}
          {salesperson && (
            <p className="text-xs text-gray-500">
              Invoice salesperson: <span className="font-medium">{salesperson}</span> (printed on the tax invoice)
            </p>
          )}
        </div>

        {/* Managed by */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <UserCheck className="h-3.5 w-3.5 text-gray-400" /> Managed by
            {saving === 'owner' && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          </div>
          {canManage ? (
            <Select value={owner} onValueChange={(v) => save('owner', v)} disabled={saving !== null}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Unassigned</SelectItem>
                {assignable.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name || s.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-sm font-medium text-gray-900">{nameOf(assignedTo, assignedToName) ?? 'Unassigned'}</div>
          )}
          {assignedTo && assignedAt && (
            <p className="text-xs text-gray-500">
              since {new Date(assignedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
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
                  <span className="shrink-0 text-gray-400">
                    {new Date(r.occurred_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
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
