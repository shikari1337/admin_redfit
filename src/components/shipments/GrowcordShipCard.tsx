import React, { useState } from 'react';
import { Truck, Loader2, Copy, Power, PowerOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ConnectionStatus, { type ConnState } from '../common/ConnectionStatus';
import { shippingAPI, errorText, type GrowcordShipConnection, type ShippingProviderStatus } from '../../services/api';
import { formatDay } from '../../utils/date';

/**
 * Growcord Ship, the one aggregator (owner, 13 Nov 2026): every courier connector lives there, so
 * a store switches it on here once and then books any courier through it. Switching on makes the
 * store a shipper of Growcord Ship and mints its own key (Rust `POST /ship/growcord-ship/enable`),
 * shown ONCE; switching off stops new bookings while booked parcels keep moving and tracking.
 */
interface Props {
  connection: GrowcordShipConnection | null;
  /** The carrier's row from `GET /shipping/providers/status`, when the host lists it. */
  status?: ShippingProviderStatus;
  canManage: boolean;
  /** Read the connection again after a change. */
  onChanged: () => void | Promise<void>;
}

const GrowcordShipCard: React.FC<Props> = ({ connection, status, canManage, onChanged }) => {
  const [busy, setBusy] = useState<'enable' | 'disable' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [conn, setConn] = useState<{ state: ConnState; message?: string }>({ state: 'unknown' });

  const on = !!connection?.isEnabled;

  const enable = async () => {
    if (connection?.keySet && !confirm('Switching Growcord Ship on again issues a new key for this store. Continue?')) return;
    setBusy('enable'); setError(null); setNotice(null); setShownKey(null);
    try {
      const r = await shippingAPI.enableGrowcordShip();
      setShownKey(r.apiKey || null);
      setNotice(r.nextSteps?.length ? r.nextSteps.join(' ') : 'Growcord Ship is on for this store.');
      setConn({ state: 'unknown' });
      await onChanged();
    } catch (e) {
      setError(errorText(e, 'Growcord Ship could not be switched on.'));
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    if (!confirm('Stop offering Growcord Ship for new shipments? Parcels already booked keep moving and keep tracking.')) return;
    setBusy('disable'); setError(null); setNotice(null); setShownKey(null);
    try {
      await shippingAPI.disableGrowcordShip();
      setNotice('Growcord Ship will not be offered for new shipments.');
      setConn({ state: 'unknown' });
      await onChanged();
    } catch (e) {
      setError(errorText(e, 'Growcord Ship could not be switched off.'));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setConn({ state: 'testing' });
    try {
      const r = await shippingAPI.testConnection('growcord_ship');
      setConn({ state: r.ok ? 'ok' : 'fail', message: r.message });
    } catch (e) {
      setConn({ state: 'fail', message: errorText(e, 'Test failed') });
    }
  };

  const copyKey = async () => {
    if (!shownKey) return;
    try {
      await navigator.clipboard.writeText(shownKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the key is visible to select by hand */ }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            <Truck className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              Growcord Ship
              {on
                ? <Badge className="bg-green-500/15 text-green-700 border-green-200">On</Badge>
                : <Badge variant="secondary">Off</Badge>}
            </CardTitle>
            <CardDescription>
              One account for every courier. Growcord Ship picks the courier for each parcel and takes freight from
              your wallet, with no markup on top.
            </CardDescription>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {on ? (
              <Button type="button" variant="outline" size="sm" onClick={disable} disabled={busy !== null}>
                {busy === 'disable' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PowerOff className="mr-1.5 h-3.5 w-3.5" />}
                Switch off
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={enable} disabled={busy !== null}>
                {busy === 'enable' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Power className="mr-1.5 h-3.5 w-3.5" />}
                Switch on
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>
        )}
        {notice && !error && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>
        )}
        {shownKey && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-1.5">
            <p className="text-[11px] font-medium text-amber-800">
              This store&apos;s Growcord Ship key. It is shown only now and stored as a hash; you only need it to book
              from outside this admin.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 min-w-0 truncate rounded bg-white px-2 py-1.5 text-xs border">{shownKey}</code>
              <Button type="button" variant="outline" size="sm" onClick={copyKey}>
                <Copy className="h-3.5 w-3.5 mr-1" />{copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}

        {on || connection?.keySet ? (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Shipper</dt>
              <dd className="font-medium break-all">{connection?.shipperCode || 'Not named'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Key</dt>
              <dd className="font-mono text-xs break-all">{connection?.keyPrefix ? `${connection.keyPrefix}...` : 'Held'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Switched on</dt>
              <dd>{connection?.enabledAt ? formatDay(connection.enabledAt) : 'Not recorded'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not switched on yet. Switch it on to book couriers from one place, without a courier account of your own.
          </p>
        )}

        {on && (
          <ConnectionStatus
            configured={status ? !!status.configured : true}
            source={status?.source ?? 'platform'}
            accountName={status?.account_name ?? 'Growcord Ship'}
            missing={status?.missing ?? []}
            details={{}}
            connection={conn.state}
            connectionMessage={conn.message}
            onTest={test}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default GrowcordShipCard;
