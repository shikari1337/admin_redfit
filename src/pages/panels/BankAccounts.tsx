import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Field, TextInput, SelectInput, inrMinor,
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

const TYPE_LABEL: Record<BankAccountRow['account_type'], string> = {
  bank: 'Bank', cash: 'Cash', credit_card: 'Credit card',
};

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

  return (
    <Page>
      <PageHeader
        title="Bank Accounts"
        description="Every bank account, cash drawer and credit card in one place — with live balances. Record money in, money out, card charges and transfers; each posts to your books automatically."
        actions={canPost && <Btn onClick={() => { setShowAdd((s) => !s); setBanner(''); }}>{showAdd ? 'Close' : '+ Add account'}</Btn>}
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

      <SectionCard title="Your accounts" flush>
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Account</Th><Th>Type</Th><Th>Ledger</Th><Th>Number</Th>
              <Th num>Balance</Th><Th>Status</Th>{canPost && <Th>Actions</Th>}
            </THead>
            <TBody>
              {accounts.length === 0 && <EmptyRow colSpan={canPost ? 7 : 6}>No accounts yet. Add your first bank account above.</EmptyRow>}
              {accounts.map((a) => (
                <Tr key={a.id}>
                  <Td className="font-medium text-gray-900">{a.name}</Td>
                  <Td>{TYPE_LABEL[a.account_type]}</Td>
                  <Td className="font-mono text-xs text-gray-500" title={a.gl_account_name}>{a.gl_account_code}</Td>
                  <Td className="font-mono text-xs">{a.account_number || '—'}</Td>
                  <Td num className={Number(a.balance_minor) < 0 ? 'text-red-700' : 'text-gray-900'}>{rup(a.balance_minor)}</Td>
                  <Td>{a.is_active ? <StatusChip status="matched" label="Active" /> : <StatusChip status="unmatched" label="Inactive" />}</Td>
                  {canPost && (
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {a.account_type === 'credit_card' ? (
                          <Btn size="sm" variant="outline" onClick={() => setAction({ kind: 'card_payment', account: a })}>Charge</Btn>
                        ) : (
                          <>
                            <Btn size="sm" variant="success" onClick={() => setAction({ kind: 'deposit', account: a })}>Money in</Btn>
                            <Btn size="sm" variant="dangerOutline" onClick={() => setAction({ kind: 'withdraw', account: a })}>Money out</Btn>
                          </>
                        )}
                        <Btn size="sm" variant="outline" onClick={() => setAction({ kind: 'transfer', account: a })}>Transfer</Btn>
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
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
    </Page>
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
