import React, { useEffect, useRef, useState } from 'react';
import { Search, User, X, Loader2, BadgeCheck, Store } from 'lucide-react';
import { customersAPI } from '../../services/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import InfoTip from '../common/InfoTip';

/**
 * WHO IS THIS ORDER FOR — one box, and then the answer.
 *
 * The desk types a phone number, an email, a name or a GSTIN; a registered
 * customer comes back and everything the store already holds about them fills
 * itself in. Nothing that can be looked up is ever typed.
 *
 * The part that was missing and made the screen guessable: when NOBODY matches,
 * the operator has to be told, in words, what happens on save — an account is
 * created for this phone number, or it is not. That choice is now on the
 * screen, with what each one means, instead of being a paragraph under the
 * form describing behaviour the operator could not change.
 */

export interface PickedCustomer {
  /** GLOBAL customer id — the one B2B pricing resolves on. */
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string | null;
  isB2b: boolean;
  b2bTier: string | null;
  companyName: string | null;
  orderCount: number;
  totalSpent: number;
  addresses: any[];
  /** The address used on this store's most recent order (a guest checkout). */
  lastOrderAddress: any | null;
}

export type AccountChoice = 'create' | 'guest';

const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** The row shape the directory returns varies by age; read every spelling once. */
const readRow = (c: any) => ({
  id: String(c.customerId ?? c.customer_id ?? c.id ?? ''),
  name: c.name ?? '',
  phone: c.phone ?? c.phoneNumber ?? c.phone_number ?? '',
  email: c.email ?? '',
  isB2b: Boolean(c.isB2b ?? c.is_b2b),
  b2bTier: c.b2bTier ?? c.b2b_tier ?? null,
});

interface Props {
  customer: PickedCustomer | null;
  onPick: (c: PickedCustomer) => void;
  onClear: () => void;
  /** What to do when nobody was found — the explicit choice. */
  accountChoice: AccountChoice;
  onAccountChoice: (c: AccountChoice) => void;
  /** Shown beside the choice so the operator knows which number it applies to. */
  newPhone?: string;
  /** Re-apply one of this customer's saved addresses. */
  onUseAddress?: (addr: any) => void;
}

const CustomerPicker: React.FC<Props> = ({
  customer, onPick, onClear, accountChoice, onAccountChoice, newPhone, onUseAddress,
}) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searched, setSearched] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setResults([]); setSearched(false); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r: any = await customersAPI.getAll({ search: term, limit: 8 });
        const list = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
        setResults(list);
      } catch { setResults([]); } finally { setSearching(false); setSearched(true); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  /** Close the dropdown when the pointer leaves it — a list that never closes eats clicks. */
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setResults([]); setSearched(false); }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const choose = async (row: any) => {
    const base = readRow(row);
    setResults([]); setQ(''); setSearched(false);
    if (!base.id) return;
    setLoadingDetail(true);
    try {
      const d: any = (await customersAPI.getById(base.id)) ?? {};
      onPick({
        id: base.id,
        name: d.name ?? base.name,
        phone: d.phone ?? base.phone,
        email: d.email ?? base.email,
        gstin: d.gstin ?? d.b2b?.gstin ?? null,
        isB2b: Boolean(d.b2b?.is_b2b ?? base.isB2b),
        b2bTier: d.b2b?.b2b_tier ?? base.b2bTier,
        companyName: d.b2b?.company_name ?? null,
        orderCount: Number(d.order_count ?? d.orderCount ?? 0),
        totalSpent: Number(d.total_spent ?? d.totalSpent ?? 0),
        addresses: Array.isArray(d.addresses) ? d.addresses : [],
        lastOrderAddress: d.last_order_address ?? d.lastOrderAddress ?? null,
      });
    } catch {
      // The directory row is still enough to key an order in.
      onPick({
        ...base, gstin: null, companyName: null, orderCount: 0, totalSpent: 0,
        addresses: [], lastOrderAddress: null,
      });
    } finally { setLoadingDetail(false); }
  };

  if (customer) {
    return (
      <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{customer.name || 'Customer'}</span>
              <Badge variant="outline" className="gap-1 border-good bg-good-bg text-good-ink">
                <BadgeCheck className="h-3 w-3" /> Registered
              </Badge>
              {customer.isB2b && (
                <Badge variant="outline" className="border-info bg-info-bg text-info-ink">
                  Wholesale{customer.b2bTier ? ` · ${customer.b2bTier}` : ''}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">
              {[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact recorded'}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
              {customer.orderCount} past order{customer.orderCount === 1 ? '' : 's'}
              {customer.totalSpent > 0 ? ` · ${money(customer.totalSpent)} lifetime` : ''}
              {customer.gstin ? ` · GSTIN ${customer.gstin}` : ''}
              {customer.companyName ? ` · ${customer.companyName}` : ''}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClear} className="shrink-0">
            <X className="mr-1 h-3.5 w-3.5" /> Change
          </Button>
        </div>
        {customer.addresses.length > 1 && onUseAddress && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-soft">Ship to a different saved address:</span>
            {customer.addresses.map((a: any) => (
              <Button key={a.id} size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => onUseAddress(a)}>
                {a.label || a.district || a.city || a.pincode || 'Address'}
                {(a.is_default ?? a.isDefault) ? ' ★' : ''}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const nothingFound = searched && !searching && results.length === 0 && q.trim().length >= 3;

  return (
    <div className="space-y-2.5">
      <div className="relative" ref={boxRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
        <Input
          className="pl-9"
          placeholder="Find a customer — phone, email, name or GSTIN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find a customer"
        />
        {(searching || loadingDetail) && (
          <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-mute" />
        )}
        {(results.length > 0 || nothingFound) && (
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface-raised shadow-lg">
            {results.map((row: any) => {
              const r = readRow(row);
              return (
                <button key={r.id} type="button" onClick={() => choose(row)}
                  className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-b-0 hover:bg-brand-soft">
                  <User className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
                  <span className="font-medium text-ink">{r.name || 'Unnamed'}</span>
                  <span className="truncate text-xs text-ink-soft">
                    {[r.phone, r.email].filter(Boolean).join(' · ')}
                  </span>
                  {r.isB2b && <Badge variant="outline" className="ml-auto shrink-0 border-info bg-info-bg text-info-ink">Wholesale</Badge>}
                </button>
              );
            })}
            {nothingFound && (
              <div className="px-3 py-2.5 text-sm text-ink-soft">
                Nobody here matches “{q.trim()}”. Fill the details in below — this is a new customer.
              </div>
            )}
          </div>
        )}
      </div>

      {/* The choice the screen used to make silently. */}
      <div className="rounded-md border border-line bg-surface-2 p-3">
        <div className="flex items-center gap-1.5">
          <Store className="h-3.5 w-3.5 text-ink-soft" />
          <span className="text-sm font-medium text-ink">New customer — do they get an account?</span>
          <InfoTip text="An account is what lets this person sign in later, see this order in their history, and be priced at a wholesale tier. Without one the order still ships; it just is not attached to anybody." />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([
            {
              code: 'create' as AccountChoice,
              title: 'Create an account',
              body: newPhone
                ? `${newPhone} becomes a customer. If that number is already registered, this order joins that existing account instead of making a second one.`
                : 'The phone number becomes a customer. An existing account on that number is used rather than duplicated.',
            },
            {
              code: 'guest' as AccountChoice,
              title: 'No account (one-off)',
              body: 'The order keeps the name and address typed here and is attached to nobody. It will not appear in Customers or in anyone’s order history.',
            },
          ]).map((opt) => {
            const on = accountChoice === opt.code;
            return (
              <button key={opt.code} type="button" onClick={() => onAccountChoice(opt.code)}
                aria-pressed={on}
                className={`rounded-md border p-2.5 text-left transition-colors ${
                  on ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-line-strong'}`}>
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <span className={`inline-block h-3 w-3 shrink-0 rounded-full border-2 ${
                    on ? 'border-brand bg-brand' : 'border-line-strong'}`} />
                  {opt.title}
                </span>
                <span className="mt-1 block text-xs leading-snug text-ink-soft">{opt.body}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomerPicker;
