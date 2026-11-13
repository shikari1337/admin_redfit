import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { vendorsAPI } from '../../services/api';
import { formatDateTime, formatDay } from '../../utils/date';

/**
 * A supplier's portal links (MENU-1 vendors): hand out a new one, see every one handed out (live, expired or
 * revoked) and take one back. The supplier opens the link on a phone and sees its purchase orders and bills; no
 * password, so the link IS the access and the store must be able to revoke it.
 *
 * A new link's address is shown once, right after it is made: the server keeps only a digest of the code, so the
 * list can show the first characters at most and never the full address again.
 */

interface LinkRow {
  id: string;
  label?: string | null;
  token_prefix?: string | null;
  expires_at?: string | null;
  revoked?: boolean;
  state?: 'live' | 'expired' | 'revoked' | string;
  created_at?: string | null;
}

const STATE_STYLE: Record<string, string> = {
  live: 'bg-good-bg text-good-ink',
  expired: 'bg-warn-bg text-warn-ink',
  revoked: 'bg-muted text-ink-soft',
};

/** The end of a picked day, as the instant the server stores (the link works through that whole day). */
const endOfDay = (day: string): string | null => {
  if (!day) return null;
  const d = new Date(`${day}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const VendorPortalLinks: React.FC<{ vendorId: string; vendorName: string; canManage: boolean }> = ({ vendorId, vendorName, canManage }) => {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [validTill, setValidTill] = useState('');
  const [minting, setMinting] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLinks(await vendorsAPI.portalLinks(vendorId));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load the portal links.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => { void load(); }, [load]);

  const mint = async () => {
    setMinting(true);
    setError('');
    try {
      const res = await vendorsAPI.mintPortalToken(vendorId, { label: label.trim() || undefined, expiresAt: endOfDay(validTill) });
      const path = res?.path || (res?.token ? `/vendor/${res.token}` : '');
      if (!path) throw new Error('The server did not return the link.');
      setFresh(`${window.location.origin}${path}`);
      setCopied(false);
      setLabel('');
      setValidTill('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not create a portal link.');
    } finally {
      setMinting(false);
    }
  };

  const revoke = async (row: LinkRow) => {
    if (!confirm(`Revoke this link${row.label ? ` (${row.label})` : ''}? Whoever holds it will no longer see ${vendorName}'s orders and bills.`)) return;
    setRevoking(row.id);
    setError('');
    try {
      await vendorsAPI.revokePortalLink(vendorId, row.id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not revoke the link.');
    } finally {
      setRevoking(null);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the field stays selectable */ }
  };

  const live = links.filter((l) => l.state === 'live').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Send a link to the supplier on WhatsApp or by email. They open it without a password, see their purchase orders,
        confirm them, and see which bills are paid. Anyone holding a live link sees the same, so revoke a link you no
        longer trust.
      </p>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {fresh && (
        <div className="rounded-md border border-good bg-good-bg p-3">
          <p className="text-sm font-medium text-good-ink">New link ready. Copy it now: it is shown only this once.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={fresh} onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-input bg-surface px-3 py-2 font-mono text-xs" />
            <Button type="button" onClick={copy} className="shrink-0">
              {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>}
            </Button>
          </div>
        </div>
      )}

      {canManage && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block text-xs font-medium text-ink-soft">
            Who it is for (optional)
            <input type="text" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Accounts desk"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-ink" />
          </label>
          <label className="block text-xs font-medium text-ink-soft">
            Works until (optional)
            <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-ink" />
          </label>
          <Button type="button" onClick={mint} disabled={minting}>
            {minting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />} New link
          </Button>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
          Links handed out{links.length ? `: ${live} live of ${links.length}` : ''}
        </p>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-ink-soft"><Loader2 className="h-4 w-4 animate-spin" /> Loading the links…</div>
        ) : links.length === 0 ? (
          <p className="py-2 text-sm text-ink-soft">No link has been handed out to this supplier yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{l.label || 'Unnamed link'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATE_STYLE[l.state || ''] || 'bg-muted text-ink-soft'}`}>
                      {l.state || (l.revoked ? 'revoked' : 'live')}
                    </span>
                  </div>
                  <div className="text-xs text-ink-soft">
                    {l.token_prefix ? <span className="font-mono">{l.token_prefix}…</span> : null}
                    {l.token_prefix ? ', ' : ''}made {formatDateTime(l.created_at)}
                    {l.expires_at ? `, works until ${formatDay(l.expires_at)}` : ', no end date'}
                  </div>
                </div>
                {canManage && l.state === 'live' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => revoke(l)} disabled={revoking === l.id}>
                    {revoking === l.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default VendorPortalLinks;
