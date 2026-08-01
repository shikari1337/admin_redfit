import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Field, TextInput, SelectInput, inrMinor,
  FilterBar, SearchInput, ExportMenu, Pagination, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * Bank Accounts — the money hub. List every real-world account (bank / cash /
 * credit card) with its LIVE balance (derived from the ledger), add new ones, and
 * record money in, money out, a card charge or a transfer between accounts. Each
 * account has its OWN ledger code so balances never blend; every movement posts a
 * balanced, immutable journal behind the scenes.
 */

const rup = (m: string | number | null | undefined) => inrMinor(m ?? '0');
const today = () => new Date().toISOString().slice(0, 10);

interface BankAccountRow {
  id: string; name: string; account_type: 'bank' | 'credit_card' | 'cash';
  account_number: string | null; ifsc: string | null;
  gl_account_code: string; gl_account_name: string; gl_account_type: string;
  opening_balance_minor: string; currency: string;
  is_active: boolean; is_system: boolean;
  balance_minor: string; txn_count: number;
}
interface CoaRow { code: string; name: string; account_type: string; is_active: boolean; }
interface BankTxnRow {
  id: string; txn_type: string; amount_minor: string; txn_date: string;
  contra_account_code: string | null; contra_account_name: string | null;
  counterparty_name: string | null; reference: string | null; narration: string | null;
  journal_number: string | null; direction: 'in' | 'out';
}

const TYPE_LABEL: Record<BankAccountRow['account_type'], string> = {
  bank: 'Bank', cash: 'Cash', credit_card: 'Credit card',
};

// Client-side CSV of the accounts list (money columns as ₹ from minor units).
const ACCOUNT_COLS: CsvColumn<BankAccountRow>[] = [
  { key: 'name', label: 'Account' },
  { key: 'account_type', label: 'Type', format: (a) => TYPE_LABEL[a.account_type] },
  { key: 'gl_account_code', label: 'Ledger code' },
  { key: 'gl_account_name', label: 'Ledger name' },
  { key: 'account_number', label: 'Number', format: (a) => a.account_number ?? '' },
  { key: 'ifsc', label: 'IFSC', format: (a) => a.ifsc ?? '' },
  { key: 'currency', label: 'Currency' },
  { key: 'balance_minor', label: 'Balance', money: true },
  { key: 'is_active', label: 'Status', format: (a) => (a.is_active ? 'Active' : 'Inactive') },
];

type Action =
  | { kind: 'deposit' | 'withdraw' | 'card_payment'; account: BankAccountRow }
  | { kind: 'transfer'; account: BankAccountRow }
  | null;

const BankAccounts: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [coa, setCoa] = useState<CoaRow[]>([]);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [register, setRegister] = useState<BankAccountRow | null>(null);
  const [editing, setEditing] = useState<BankAccountRow | null>(null);

  // Filters + pagination (client-side: GET /bank-accounts returns the full set).
  const lc = useListControls({ pageSize: 20 });
  const [typeFilter, setTypeFilter] = useState('');

  const load = async () => {
    try {
      const [aRes, cRes] = await Promise.all([
        api.get('/bank-accounts'),
        api.get('/accounting/coa/accounts'),
      ]);
      setAccounts(payload<BankAccountRow[]>(aRes) ?? []);
      setCoa((payload<CoaRow[]>(cRes) ?? []).filter((a) => a.is_active));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    let liquid = 0, cardOwed = 0;
    for (const a of accounts) {
      if (a.account_type === 'credit_card') cardOwed += Number(a.balance_minor);
      else liquid += Number(a.balance_minor);
    }
    return { liquid, cardOwed };
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter && a.account_type !== typeFilter) return false;
      if (lc.status === 'active' && !a.is_active) return false;
      if (lc.status === 'inactive' && a.is_active) return false;
      if (q && !`${a.name} ${a.account_number ?? ''} ${a.gl_account_code}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [accounts, typeFilter, lc.status, lc.debouncedSearch]);
  const pageRows = filtered.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  return (
    <Page>
      <PageHeader
        title="Bank Accounts"
        description="Every bank account, cash drawer and credit card in one place — with live balances. Record money in, money out, card charges and transfers; each posts to your books automatically."
        actions={
          <>
            <ExportMenu filename="bank-accounts" columns={ACCOUNT_COLS} rows={filtered} disabled={accounts.length === 0} />
            {canPost && <Btn onClick={() => { setShowAdd((s) => !s); setBanner(''); }}>{showAdd ? 'Close' : '+ Add account'}</Btn>}
          </>
        }
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {banner && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{banner}</div>}

      <StatGrid cols={3}>
        <StatCard label="Cash & bank (available)" value={rup(String(totals.liquid))} sub={`${accounts.filter((a) => a.account_type !== 'credit_card').length} account(s)`} tone={totals.liquid < 0 ? 'bad' : 'good'} />
        <StatCard label="Credit cards (owed)" value={rup(String(totals.cardOwed))} sub={`${accounts.filter((a) => a.account_type === 'credit_card').length} card(s)`} tone={totals.cardOwed > 0 ? 'warn' : 'default'} />
        <StatCard label="Accounts" value={accounts.length} sub={`${accounts.filter((a) => !a.is_active).length} inactive`} />
      </StatGrid>

      {showAdd && canPost && (
        <AddAccountForm
          onError={setError}
          onDone={(msg) => { setShowAdd(false); setBanner(msg); load(); }}
        />
      )}

      {accounts.length > 0 && (
        <FilterBar>
          <Field label="Search"><SearchInput value={lc.search} placeholder="Name, number or ledger…" onChange={(e) => lc.setSearch(e.target.value)} /></Field>
          <Field label="Type">
            <SelectInput value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); lc.setPage(1); }}>
              <option value="">All types</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit card</option>
            </SelectInput>
          </Field>
          <Field label="Status">
            <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectInput>
          </Field>
        </FilterBar>
      )}

      <SectionCard title="Your accounts" flush>
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Account</Th><Th>Type</Th><Th>Ledger</Th><Th>Number</Th>
              <Th num>Balance</Th><Th>Status</Th><Th>Actions</Th>
            </THead>
            <TBody>
              {filtered.length === 0 && (
                <EmptyRow colSpan={7}>
                  {accounts.length === 0 ? 'No accounts yet. Add your first bank account above.' : 'No accounts match your filters.'}
                </EmptyRow>
              )}
              {pageRows.map((a) => (
                <Tr key={a.id}>
                  <Td className="font-medium text-gray-900">{a.name}</Td>
                  <Td>{TYPE_LABEL[a.account_type]}</Td>
                  <Td className="font-mono text-xs text-gray-500" title={a.gl_account_name}>{a.gl_account_code}</Td>
                  <Td className="font-mono text-xs">{a.account_number || '—'}</Td>
                  <Td num className={Number(a.balance_minor) < 0 ? 'text-red-700' : 'text-gray-900'}>{rup(a.balance_minor)}</Td>
                  <Td>{a.is_active ? <StatusChip status="matched" label="Active" /> : <StatusChip status="unmatched" label="Inactive" />}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Btn size="sm" variant="ghost" onClick={() => setRegister(a)}>Register</Btn>
                      {canPost && (
                        <>
                          {a.account_type === 'credit_card' ? (
                            <Btn size="sm" variant="outline" onClick={() => setAction({ kind: 'card_payment', account: a })}>Charge</Btn>
                          ) : (
                            <>
                              <Btn size="sm" variant="success" onClick={() => setAction({ kind: 'deposit', account: a })}>Money in</Btn>
                              <Btn size="sm" variant="dangerOutline" onClick={() => setAction({ kind: 'withdraw', account: a })}>Money out</Btn>
                            </>
                          )}
                          <Btn size="sm" variant="outline" onClick={() => setAction({ kind: 'transfer', account: a })}>Transfer</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Btn>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
        <Pagination page={lc.page} pageSize={lc.pageSize} total={filtered.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
      </SectionCard>

      {action && (
        <MoneyModal
          action={action}
          accounts={accounts}
          coa={coa}
          onClose={() => setAction(null)}
          onError={setError}
          onDone={(msg) => { setAction(null); setBanner(msg); load(); }}
        />
      )}

      {register && <TransactionRegisterModal account={register} onClose={() => setRegister(null)} />}

      {editing && canPost && (
        <EditAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onError={setError}
          onDone={(msg) => { setEditing(null); setBanner(msg); load(); }}
        />
      )}
    </Page>
  );
};

// ── Per-account transaction register (GET /bank-accounts/:id/transactions) ──────
const REGISTER_COLS: CsvColumn<BankTxnRow>[] = [
  { key: 'txn_date', label: 'Date' },
  { key: 'txn_type', label: 'Type' },
  { key: 'direction', label: 'Direction' },
  { key: 'narration', label: 'Details', format: (r) => r.narration ?? '' },
  { key: 'contra_account_name', label: 'Category', format: (r) => r.contra_account_name ?? r.contra_account_code ?? '' },
  { key: 'counterparty_name', label: 'Counterparty', format: (r) => r.counterparty_name ?? '' },
  { key: 'reference', label: 'Reference', format: (r) => r.reference ?? '' },
  { key: 'journal_number', label: 'Journal', format: (r) => r.journal_number ?? '' },
  { key: 'amount_minor', label: 'Amount', money: true },
];

const TransactionRegisterModal: React.FC<{ account: BankAccountRow; onClose: () => void }> = ({ account, onClose }) => {
  const [rows, setRows] = useState<BankTxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/bank-accounts/${account.id}/transactions`);
        if (alive) setRows(payload<BankTxnRow[]>(res) ?? []);
      } catch (e: any) { if (alive) setError(e?.response?.data?.message ?? e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [account.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{account.name} — transaction register</h3>
            <p className="text-xs text-gray-500">Ledger {account.gl_account_code} · balance {rup(account.balance_minor)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu filename={`register-${account.gl_account_code}`} columns={REGISTER_COLS} rows={rows} disabled={rows.length === 0} />
            <Btn size="sm" variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        </div>
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="min-h-0 flex-1 overflow-auto">
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Date</Th><Th>Details</Th><Th>Category</Th><Th>Ref</Th><Th>Journal</Th><Th num>Amount</Th>
              </THead>
              <TBody>
                {loading && <EmptyRow colSpan={6}>Loading…</EmptyRow>}
                {!loading && rows.length === 0 && <EmptyRow colSpan={6}>No movements recorded on this account yet.</EmptyRow>}
                {rows.map((t) => (
                  <Tr key={t.id}>
                    <Td>{t.txn_date}</Td>
                    <Td className="max-w-xs truncate" title={t.narration ?? ''}>{t.narration || '—'}</Td>
                    <Td className="text-xs text-gray-600">{t.contra_account_name || t.counterparty_name || t.contra_account_code || '—'}</Td>
                    <Td className="font-mono text-xs">{t.reference || '—'}</Td>
                    <Td className="font-mono text-xs text-gray-500">{t.journal_number || '—'}</Td>
                    <Td num className={t.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}>
                      {t.direction === 'in' ? '+' : '-'}{rup(t.amount_minor)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      </div>
    </div>
  );
};

// ── Edit account (PATCH /bank-accounts/:id) ────────────────────────────────────
const EditAccountModal: React.FC<{
  account: BankAccountRow;
  onClose: () => void;
  onError: (m: string) => void;
  onDone: (msg: string) => void;
}> = ({ account, onClose, onError, onDone }) => {
  const [name, setName] = useState(account.name);
  const [accountNumber, setAccountNumber] = useState(account.account_number ?? '');
  const [ifsc, setIfsc] = useState(account.ifsc ?? '');
  const [isActive, setIsActive] = useState(account.is_active);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { onError('Enter an account name'); return; }
    setBusy(true); onError('');
    try {
      await api.patch(`/bank-accounts/${account.id}`, {
        name: name.trim(),
        accountNumber: accountNumber.trim() || null,
        ifsc: ifsc.trim() || null,
        isActive,
      });
      onDone(`Updated ${name.trim()}.`);
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-base font-semibold text-gray-900">Edit {TYPE_LABEL[account.account_type].toLowerCase()} account</h3>
        <div className="space-y-3">
          <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} className="w-full" /></Field>
          <Field label="Account number (optional)"><TextInput value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-full" /></Field>
          {account.account_type === 'bank' && (
            <Field label="IFSC (optional)"><TextInput value={ifsc} onChange={(e) => setIfsc(e.target.value)} className="w-full" /></Field>
          )}
          <Field label="Status">
            <SelectInput value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')} className="w-full">
              <option value="active">Active</option>
              <option value="inactive">Inactive (hidden from money actions)</option>
            </SelectInput>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Btn>
        </div>
      </div>
    </div>
  );
};

// ── Add account ────────────────────────────────────────────────────────────────
const AddAccountForm: React.FC<{ onError: (m: string) => void; onDone: (msg: string) => void }> = ({ onError, onDone }) => {
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<BankAccountRow['account_type']>('bank');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [openingRupees, setOpeningRupees] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { onError('Enter an account name'); return; }
    setBusy(true); onError('');
    try {
      await api.post('/bank-accounts', {
        name: name.trim(), accountType,
        accountNumber: accountNumber.trim() || null, ifsc: ifsc.trim() || null,
        openingRupees: openingRupees.trim() === '' ? undefined : openingRupees,
      });
      onDone(`Added ${name.trim()}. A dedicated ledger code was created for it.`);
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <SectionCard title="Add an account" description="We create a dedicated ledger for this account automatically, so its balance is always kept separate.">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Current A/C" className="w-56" /></Field>
        <Field label="Type">
          <SelectInput value={accountType} onChange={(e) => setAccountType(e.target.value as any)}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="credit_card">Credit card</option>
          </SelectInput>
        </Field>
        <Field label="Account number (optional)"><TextInput value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-44" /></Field>
        {accountType === 'bank' && <Field label="IFSC (optional)"><TextInput value={ifsc} onChange={(e) => setIfsc(e.target.value)} className="w-36" /></Field>}
        <Field label="Opening balance (₹, optional)"><TextInput type="number" step="0.01" value={openingRupees} onChange={(e) => setOpeningRupees(e.target.value)} className="w-40 text-right" placeholder="0.00" /></Field>
        <Btn onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add account'}</Btn>
      </div>
    </SectionCard>
  );
};

// ── Money in / out / card / transfer modal ─────────────────────────────────────
const MoneyModal: React.FC<{
  action: NonNullable<Action>;
  accounts: BankAccountRow[];
  coa: CoaRow[];
  onClose: () => void;
  onError: (m: string) => void;
  onDone: (msg: string) => void;
}> = ({ action, accounts, coa, onClose, onError, onDone }) => {
  const isTransfer = action.kind === 'transfer';
  const [amountRupees, setAmountRupees] = useState('');
  const [date, setDate] = useState(today());
  const [contraAccountCode, setContraAccountCode] = useState('');
  const [destId, setDestId] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const title = isTransfer ? `Transfer from ${action.account.name}`
    : action.kind === 'deposit' ? `Money in — ${action.account.name}`
    : action.kind === 'card_payment' ? `Card charge — ${action.account.name}`
    : `Money out — ${action.account.name}`;

  // For a non-transfer, the contra can be any active ledger except this account's own code.
  const contraOptions = coa.filter((c) => c.code !== action.account.gl_account_code);
  const transferTargets = accounts.filter((a) => a.id !== action.account.id && a.is_active);

  const submit = async () => {
    const amt = Number(amountRupees);
    if (!Number.isFinite(amt) || amt <= 0) { onError('Enter an amount greater than zero'); return; }
    setBusy(true); onError('');
    try {
      if (isTransfer) {
        if (!destId) { onError('Choose an account to transfer to'); setBusy(false); return; }
        await api.post('/bank-accounts/transfer', {
          sourceBankAccountId: action.account.id, destBankAccountId: destId,
          amountRupees, date, reference: reference.trim() || null,
        });
      } else {
        if (!contraAccountCode) { onError('Choose a category for this money'); setBusy(false); return; }
        const path = action.kind === 'deposit' ? 'deposit' : action.kind === 'card_payment' ? 'card-payment' : 'withdraw';
        await api.post(`/bank-accounts/${action.account.id}/${path}`, {
          amountRupees, date, contraAccountCode, reference: reference.trim() || null,
        });
      }
      onDone('Recorded and posted to your books.');
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-base font-semibold text-gray-900">{title}</h3>
        <div className="space-y-3">
          <Field label="Amount (₹)"><TextInput autoFocus type="number" step="0.01" value={amountRupees} onChange={(e) => setAmountRupees(e.target.value)} className="w-full text-right" placeholder="0.00" /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" /></Field>

          {isTransfer ? (
            <Field label="Transfer to">
              <SelectInput value={destId} onChange={(e) => setDestId(e.target.value)} className="w-full">
                <option value="">Choose an account…</option>
                {transferTargets.map((a) => <option key={a.id} value={a.id}>{a.name} ({TYPE_LABEL[a.account_type]})</option>)}
              </SelectInput>
            </Field>
          ) : (
            <Field label={action.kind === 'deposit' ? 'Category (where it came from)' : 'Category (what it was for)'}>
              <SelectInput value={contraAccountCode} onChange={(e) => setContraAccountCode(e.target.value)} className="w-full">
                <option value="">Choose a category…</option>
                {contraOptions.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </SelectInput>
            </Field>
          )}

          <Field label="Reference (optional)"><TextInput value={reference} onChange={(e) => setReference(e.target.value)} className="w-full" placeholder="Cheque / UTR / note" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record'}</Btn>
        </div>
      </div>
    </div>
  );
};

export default BankAccounts;
