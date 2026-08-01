import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Card, SectionCard, FilterBar, Field, TextInput, SelectInput, SearchInput,
  StatusChip, TableShell, THead, Th, TBody, Tr, Td,
  ExportMenu, Pagination, DrillLink, useListControls, type CsvColumn,
} from '../../components/erp';

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
  parent_code: string | null;
  is_system: boolean;
  is_active: boolean;
  has_entries: boolean;
}

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

const coaCols: CsvColumn<Account>[] = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Name' },
  { key: 'account_type', label: 'Type' },
  { key: 'parent_code', label: 'Parent' },
  { key: 'is_active', label: 'Status', format: (a) => (a.is_system ? 'system' : a.is_active ? 'active' : 'inactive') },
  { key: 'has_entries', label: 'Has entries', format: (a) => (a.has_entries ? 'yes' : 'no') },
];

const ChartOfAccounts: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Client-side filter/search + pagination over the full account list (server returns all).
  const lc = useListControls({ pageSize: 25 });
  const [activeOnly, setActiveOnly] = useState(false);

  // add form
  const [showNew, setShowNew] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('asset');
  const [parentCode, setParentCode] = useState('');
  const [busy, setBusy] = useState(false);

  // inline edit
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/coa/accounts');
      setAccounts(payload(res) ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    setError(''); setBusy(true);
    try {
      await api.post('/accounting/coa/accounts', {
        code: code.trim(), name: name.trim(), accountType: type,
        parentCode: parentCode || undefined,
      });
      setShowNew(false); setCode(''); setName(''); setType('asset'); setParentCode('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setBusy(false); }
  };

  const saveEdit = async (a: Account) => {
    setError('');
    try {
      await api.patch(`/accounting/coa/accounts/${encodeURIComponent(a.code)}`, { name: editName.trim() });
      setEditCode(null);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const toggleActive = async (a: Account) => {
    setError('');
    try {
      await api.patch(`/accounting/coa/accounts/${encodeURIComponent(a.code)}`, { isActive: !a.is_active });
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const remove = async (a: Account) => {
    if (!window.confirm(`Delete account ${a.code} · ${a.name}? This cannot be undone.`)) return;
    setError('');
    try {
      await api.delete(`/accounting/coa/accounts/${encodeURIComponent(a.code)}`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const filtered = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    return accounts.filter((a) => {
      if (q && !`${a.code} ${a.name}`.toLowerCase().includes(q)) return false;
      if (lc.status && a.account_type !== lc.status) return false;
      if (activeOnly && !a.is_active) return false;
      return true;
    });
  }, [accounts, lc.debouncedSearch, lc.status, activeOnly]);

  const paged = filtered.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  return (
    <Page>
      <PageHeader
        title="Chart of Accounts"
        description="The seeded double-entry spine is locked; add, rename or retire your own accounts. Deactivated accounts keep their history but take no new posts."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu filename="chart-of-accounts" columns={coaCols} rows={filtered} disabled={!filtered.length} />
            {canPost && (
              <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Add account'}</Btn>
            )}
          </div>
        }
      />

      {showNew && canPost && (
        <SectionCard title="New account">
          <FilterBar>
            <Field label="Code">
              <TextInput className="w-28" placeholder="e.g. 1500" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field label="Name" className="flex-1 min-w-[220px]">
              <TextInput placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Type">
              <SelectInput value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
            </Field>
            <Field label="Parent (optional)">
              <SelectInput className="min-w-[180px]" value={parentCode} onChange={(e) => setParentCode(e.target.value)}>
                <option value="">— none —</option>
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </SelectInput>
            </Field>
            <Btn variant="success" disabled={busy || !code.trim() || !name.trim()} onClick={add}>Create</Btn>
          </FilterBar>
        </SectionCard>
      )}

      {error && <div className="mb-3 text-sm text-red-700">{error}</div>}

      <FilterBar>
        <Field label="Search">
          <SearchInput placeholder="Code or name…" value={lc.search} onChange={(e) => lc.setSearch(e.target.value)} />
        </Field>
        <Field label="Type">
          <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
        </Field>
        <Field label="&nbsp;">
          <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); lc.setPage(1); }} />
            Active only
          </label>
        </Field>
      </FilterBar>

      <Card className="overflow-hidden">
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Code</Th><Th>Name</Th><Th>Type</Th><Th>Parent</Th><Th>Status</Th><Th>Actions</Th>
            </THead>
            <TBody>
              {loading && <Tr><Td className="text-gray-500">Loading…</Td></Tr>}
              {!loading && accounts.length === 0 && <Tr><Td className="text-gray-500">No accounts.</Td></Tr>}
              {!loading && accounts.length > 0 && filtered.length === 0 && <Tr><Td className="text-gray-500">No accounts match these filters.</Td></Tr>}
              {paged.map((a) => (
                <Tr key={a.id} className={a.is_active ? '' : 'opacity-60'}>
                  <Td className="font-mono font-medium">
                    <DrillLink to={`/panel/accounting/general-ledger?account=${a.code}`} title="View this account's ledger">{a.code}</DrillLink>
                  </Td>
                  <Td>
                    {editCode === a.code ? (
                      <TextInput className="w-56" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    ) : a.name}
                  </Td>
                  <Td className="text-gray-500">{a.account_type}</Td>
                  <Td className="font-mono text-gray-500">{a.parent_code ?? ''}</Td>
                  <Td>
                    {a.is_system
                      ? <StatusChip status="system" tone="blue" label="🔒 system" />
                      : a.is_active
                        ? <StatusChip status="active" />
                        : <StatusChip status="inactive" />}
                  </Td>
                  <Td>
                    {a.is_system ? (
                      <span className="text-xs text-gray-400">protected</span>
                    ) : !canPost ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : editCode === a.code ? (
                      <span className="flex gap-2">
                        <Btn size="sm" variant="success" onClick={() => saveEdit(a)}>Save</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setEditCode(null)}>Cancel</Btn>
                      </span>
                    ) : (
                      <span className="flex gap-2">
                        <Btn size="sm" variant="ghost" onClick={() => { setEditCode(a.code); setEditName(a.name); }}>Rename</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => toggleActive(a)}>{a.is_active ? 'Deactivate' : 'Activate'}</Btn>
                        {!a.has_entries && (
                          <Btn size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => remove(a)}>Delete</Btn>
                        )}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </Card>

      <Pagination page={lc.page} pageSize={lc.pageSize} total={filtered.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
    </Page>
  );
};

export default ChartOfAccounts;
