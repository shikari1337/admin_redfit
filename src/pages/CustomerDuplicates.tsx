import React, { useEffect, useState } from 'react';
import { customersAPI } from '../services/api';
import { Users2, Search, Merge, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  created_at: string;
}

interface DuplicateFlag {
  id: string;
  matched_via: 'email' | 'phone' | 'manual';
  matched_value_masked: string | null;
  status: 'open' | 'merged' | 'dismissed';
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  merged_winner_id: string | null;
  a: CustomerSummary;
  b: CustomerSummary;
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** One side of a flagged pair — click to pick as the surviving account. */
const AccountCard: React.FC<{ c: CustomerSummary; picked: boolean; onPick: () => void; disabled: boolean }> = ({ c, picked, onPick, disabled }) => (
  <button
    type="button"
    onClick={onPick}
    disabled={disabled}
    className={`flex-1 min-w-0 text-left rounded-lg border p-3 transition-colors ${
      picked ? 'border-green-500 bg-green-50 ring-1 ring-green-500' : 'border-gray-200 hover:border-gray-300'
    } disabled:cursor-default disabled:opacity-70`}
  >
    <div className="flex items-center gap-2">
      <span className="font-semibold text-sm text-gray-900 truncate">{c.name || 'No name on file'}</span>
      {picked && <CheckCircle2 size={15} className="text-green-600 shrink-0" />}
    </div>
    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
      <div>{c.email || <span className="italic text-gray-400">no email</span>}</div>
      <div>{c.phone_number || <span className="italic text-gray-400">no phone</span>}</div>
      <div className="text-gray-400">Since {fmtDate(c.created_at)}</div>
    </div>
  </button>
);

const FlagRow: React.FC<{ flag: DuplicateFlag; onResolved: () => void }> = ({ flag, onResolved }) => {
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'merge' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const merge = async () => {
    if (!winnerId) return;
    setBusy('merge'); setError(null);
    try {
      await customersAPI.mergeDuplicate(flag.id, winnerId);
      onResolved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Merge failed');
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async () => {
    setBusy('dismiss'); setError(null);
    try {
      await customersAPI.dismissDuplicate(flag.id);
      onResolved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not dismiss');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Badge variant={flag.matched_via === 'manual' ? 'secondary' : 'default'}>
              {flag.matched_via === 'manual' ? 'Manually flagged' : `OTP-proved via ${flag.matched_via}`}
            </Badge>
            {flag.matched_value_masked && <span className="mono">{flag.matched_value_masked}</span>}
            <span>· {fmtDate(flag.created_at)}</span>
          </div>
          {flag.status !== 'open' && (
            <Badge variant={flag.status === 'merged' ? 'default' : 'outline'}>
              {flag.status === 'merged' ? 'Merged' : 'Dismissed'}
              {flag.resolved_by ? ` by ${flag.resolved_by}` : ''}
            </Badge>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch">
          <AccountCard c={flag.a} picked={winnerId === flag.a.id} onPick={() => setWinnerId(flag.a.id)} disabled={flag.status !== 'open'} />
          <div className="flex items-center justify-center text-gray-300 text-xs shrink-0 px-1">vs</div>
          <AccountCard c={flag.b} picked={winnerId === flag.b.id} onPick={() => setWinnerId(flag.b.id)} disabled={flag.status !== 'open'} />
        </div>

        {flag.status === 'open' && (
          <>
            <p className="text-xs text-gray-500">
              Pick which account to keep — the other's orders, addresses, cart, wishlist and reviews move over, then it's deleted. Whichever email/phone/name the surviving account is missing is filled in from the one you remove.
            </p>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={merge} disabled={!winnerId || !!busy}>
                <Merge size={14} className="mr-1.5" /> {busy === 'merge' ? 'Merging…' : 'Merge into selected'}
              </Button>
              <Button size="sm" variant="outline" onClick={dismiss} disabled={!!busy}>
                <X size={14} className="mr-1.5" /> {busy === 'dismiss' ? 'Dismissing…' : 'Not a duplicate'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

/** Search-and-pick two customers to flag manually — for a duplicate spotted
 *  via a support call rather than caught by the automatic OTP-link check. */
const ManualFlagPanel: React.FC<{ onFlagged: () => void }> = ({ onFlagged }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CustomerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await customersAPI.getAll({ search: query.trim(), limit: 8 });
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setResults(list.map((c: any) => ({
          id: c.customer_id || c.id, name: c.name, email: c.email, phone_number: c.phone,
          created_at: c.created_at || '',
        })));
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const toggle = (c: CustomerSummary) => {
    setPicked((p) => {
      if (p.find((x) => x.id === c.id)) return p.filter((x) => x.id !== c.id);
      if (p.length >= 2) return [p[1], c];
      return [...p, c];
    });
  };

  const submit = async () => {
    if (picked.length !== 2) return;
    setFlagging(true); setError(null);
    try {
      await customersAPI.flagDuplicate(picked[0].id, picked[1].id);
      setPicked([]); setQuery(''); setResults([]); setOpen(false);
      onFlagged();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not flag this pair');
    } finally {
      setFlagging(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Search size={14} className="mr-1.5" /> Flag a pair manually
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Search and pick two accounts to flag as duplicates</p>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X size={14} /></Button>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, or email…" className="pl-8" />
        </div>
        {searching && <p className="text-xs text-gray-400">Searching…</p>}
        {results.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.map((c) => {
              const isPicked = !!picked.find((p) => p.id === c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggle(c)}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded border flex items-center justify-between ${isPicked ? 'border-green-500 bg-green-50' : 'border-transparent hover:bg-gray-50'}`}>
                  <span>{c.name || 'No name'} — {c.email || c.phone_number || '—'}</span>
                  {isPicked && <CheckCircle2 size={14} className="text-green-600" />}
                </button>
              );
            })}
          </div>
        )}
        {picked.length > 0 && (
          <p className="text-xs text-gray-500">Selected {picked.length}/2{picked.length === 2 ? ' — ready to flag' : ' — pick one more'}</p>
        )}
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        <Button size="sm" onClick={submit} disabled={picked.length !== 2 || flagging}>
          {flagging ? 'Flagging…' : 'Flag as duplicate'}
        </Button>
      </CardContent>
    </Card>
  );
};

const CustomerDuplicates: React.FC = () => {
  const [status, setStatus] = useState<'open' | 'merged' | 'dismissed' | 'all'>('open');
  const [flags, setFlags] = useState<DuplicateFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await customersAPI.listDuplicates(status);
      setFlags(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load duplicate flags');
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users2 className="h-7 w-7 text-muted-foreground" /> Duplicate Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One person, two accounts — usually one signed up with email, once with phone. Flagged automatically when a
            customer proves (via OTP) they own an identifier already on a different account.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="merged">Merged</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <ManualFlagPanel onFlagged={load} />
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive border border-destructive/20 p-4 rounded-md text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : flags.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-gray-300" />
            {status === 'open' ? 'No open duplicate flags right now.' : `No ${status} flags.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flags.map((f) => <FlagRow key={f.id} flag={f} onResolved={load} />)}
        </div>
      )}
    </div>
  );
};

export default CustomerDuplicates;
