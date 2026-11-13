import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Users } from 'lucide-react';
import { Btn, EmptyRow, Field, SectionCard, SelectInput, TableShell, TBody, Td, Th, THead, Tr } from '@/components/erp';
import { SearchBox } from '@/components/sales/ListChrome';
import { ConfirmDialog, ErrorNote, Loading, ReasonDialog, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { customersAPI } from '@/services/api';
import { formatDateTime } from '@/utils/date';
import { codeLabel } from '@/lib/v2/appSettings';
import { B2B_PERMS, addTeamMember, getTeam, removeTeamMember, type TeamMember } from '@/lib/v2/business';

/**
 * A business account's team (HMAPP-T6 B11 (d); design 60 BZ07): other logins that order for the
 * same business. A buyer gets a copy of the owner's B2B grant (tier, price list, GSTIN; never its
 * own credit, so the business keeps one credit limit); a viewer only sees. Removing takes the copy
 * back, unless the member holds an approved application of their own.
 *
 * Server (Trade): `GET/POST /api/v2/trade/accounts/{customer_id}/team`,
 * `POST .../team/{member_id}/remove` {reason 3 to 300} (`b2b.read`; change `b2b.manage` and a person).
 * The role codes are the server's (it answers no list yet; design 60 owner question 6).
 */
const ROLES: Array<{ code: string; words: string }> = [
  { code: 'buyer', words: 'Buyer: orders at the business\'s prices' },
  { code: 'viewer', words: 'Viewer: sees prices and orders, cannot order' },
];

const B2BTeamCard: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(B2B_PERMS.manage);
  const team = useLoad(() => getTeam(customerId), [customerId]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [role, setRole] = useState(ROLES[0].code);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<unknown>(null);

  // The same customer search the Add B2B customer form uses (350 ms, 3 characters at least).
  useEffect(() => {
    if (!adding || picked || search.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r: any = await customersAPI.getAll({ search: search.trim(), limit: 8 });
        setResults(Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
      } catch { setResults([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [search, adding, picked]);

  const pickedId = picked ? String(picked.customerId ?? picked.customer_id ?? picked.id ?? '') : '';
  const off = whyDisabled(canManage, [], 'Manage B2B');

  const add = async () => {
    if (!pickedId) return;
    setBusy(true); setActError(null);
    try { await addTeamMember(customerId, { member_customer_id: pickedId, role }); setAdding(false); await team.reload(); } catch (e) { setActError(e); } finally { setBusy(false); }
  };
  const remove = async (reason: string) => {
    if (!removing) return;
    setBusy(true); setActError(null);
    // The route names the member by their CUSTOMER id (`team/{member_customer_id}/remove`).
    try { await removeTeamMember(customerId, removing.member_customer_id, reason); setRemoving(null); await team.reload(); } catch (e) { setActError(e); } finally { setBusy(false); }
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" aria-hidden />Team</span>}
      description="Other logins that buy for this business. One credit limit for the whole business."
      action={<Btn size="sm" variant="outline" disabled={!!off} title={off ?? undefined}
        onClick={() => { setActError(null); setPicked(null); setSearch(''); setRole(ROLES[0].code); setAdding(true); }}><Plus className="h-4 w-4" />Add a person</Btn>}
    >
      {team.loading && !team.data ? <Loading label="Reading the team" /> : team.error ? (
        <ErrorNote error={team.error} what="Business teams" onRetry={() => void team.reload()} />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <THead><Th>Person</Th><Th>Role</Th><Th>Added</Th><Th><span className="sr-only">Remove</span></Th></THead>
            <TBody>
              {(team.data?.members ?? []).length === 0 && <EmptyRow colSpan={4}>Only the owner so far.</EmptyRow>}
              {(team.data?.members ?? []).map((m) => (
                <Tr key={m.id}>
                  <Td><Link to={`/customers/${m.member_customer_id}`} className="text-blue-700 underline">Open the customer</Link></Td>
                  <Td>{codeLabel(m.role)}</Td>
                  <Td muted>{formatDateTime(m.added_at, 'not recorded')}</Td>
                  <Td>
                    <Btn size="sm" variant="dangerOutline" disabled={!!off} title={off ?? undefined} onClick={() => { setActError(null); setRemoving(m); }}>
                      <Trash2 className="h-4 w-4" />Remove
                    </Btn>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      )}

      <ConfirmDialog open={adding} title="Add a person to this business" confirmLabel="Add" busy={busy} confirmDisabled={!pickedId}
        onClose={() => setAdding(false)} onConfirm={() => void add()}>
        {picked ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{picked.name || picked.email || picked.phone || pickedId}</span>
            <button type="button" className="text-xs underline" onClick={() => setPicked(null)}>Pick someone else</button>
          </p>
        ) : (
          <div className="space-y-1">
            <SearchBox value={search} onChange={setSearch} placeholder="Name, phone or e-mail" label="Search customers" />
            {results.length > 0 && (
              <ul className="max-h-48 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200">
                {results.map((c) => (
                  <li key={String(c.customerId ?? c.customer_id ?? c.id)}>
                    <button type="button" onClick={() => setPicked(c)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                      {c.name || 'No name'} <span className="text-xs text-gray-500">{[c.phone, c.email].filter(Boolean).join(', ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500">The person needs a customer account first: they sign in once on the shop or the app.</p>
          </div>
        )}
        <Field label="Role">
          <SelectInput value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.code} value={r.code}>{r.words}</option>)}
          </SelectInput>
        </Field>
        {actError ? <ErrorNote error={actError} /> : null}
      </ConfirmDialog>

      <ReasonDialog open={!!removing} title="Remove this person" confirmLabel="Remove" danger min={3} max={300} busy={busy} error={actError}
        onClose={() => setRemoving(null)} onConfirm={(reason) => void remove(reason)}>
        <p>They can no longer order or see invoices for this business, unless their own application was approved.</p>
      </ReasonDialog>
    </SectionCard>
  );
};

export default B2BTeamCard;
