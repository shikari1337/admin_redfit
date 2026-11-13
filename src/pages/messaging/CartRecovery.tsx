import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { BlockSkeleton } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { messagingAppsAPI, errText } from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';
import SentLog from '@/components/messaging/SentLog';
import RecoverySummary from '@/components/carts/RecoverySummary';
import { ErrorNotice, GapNotice, MessagingHeader, MessagingTabs, failureOf, useNotificationRows, useTabParam, type LoadFailure } from '@/components/messaging/common';

/**
 * MESSAGING ▸ CART RECOVERY (MSG-0 §5): the messages sent when a cart is left
 * behind. On top, the store's ONE arm switch — Commerce's
 * `cartSettings.recoveryAutomationEnabled` (`GET|PATCH /api/v2/commerce/cart-settings`,
 * default off): until it is on, the Retain job messages no shopper.
 * Steps = the existing Cart Recovery Automation screen, reused as it is (its
 * rows call Retain's routes `/api/v2/retain/carts/{recovery-steps,whatsapp-templates}`,
 * `areas/carts.ts`); Log = every `cart_recovery` message sent, from the comms
 * dispatch log (all channels). One cart's own attempt log and "send now" are
 * on that cart in Abandoned Carts (`/commerce/carts/{id}/recovery-log`,
 * `/retain/carts/{id}/send-recovery`). Lane ADMIN-MSG-1, reconciled by ADMIN-MSG-2.
 */
const CartRecoveryAutomation = lazy(() => import('@/pages/CartRecoveryAutomation'));

const TABS = [
  { key: 'steps', label: 'Steps' },
  { key: 'log', label: 'Log' },
] as const;

const CartRecovery: React.FC = () => {
  const [tab, setTab] = useTabParam(TABS.map((t) => t.key), 'steps');
  const { messages } = useNotificationRows();
  // The summary reads again after the arm switch moves (MENU-1).
  const [summaryKey, setSummaryKey] = useState(0);
  return (
    <div className="space-y-4 pb-12">
      <MessagingHeader icon={ShoppingCart} title="Cart recovery"
        purpose="The reminders a shopper gets after leaving a cart: when each goes out, on which channel, with which discount, and what was sent." />
      <AutomationSwitch onChanged={() => setSummaryKey((k) => k + 1)} />
      <RecoverySummary armStateShown logHref="/messaging/cart-recovery?tab=log" refreshKey={summaryKey} />
      <MessagingTabs label="Cart recovery" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'steps' && <Suspense fallback={<BlockSkeleton lines={8} />}><CartRecoveryAutomation embedded /></Suspense>}
      {tab === 'log' && (
        <div className="space-y-2">
          <p className="text-xs text-ink-soft">
            Every cart-recovery message, on every channel. One cart's own attempts, and sending its next step now, are on that cart in{' '}
            <Link to="/orders/abandoned-carts" className="underline underline-offset-2">Abandoned Carts</Link>.
          </p>
          <SentLog fixedKey="cart_recovery" messages={messages} />
        </div>
      )}
    </div>
  );
};

/** The arm switch: off = no shopper is messaged automatically (a staff "send now" still works). */
const AutomationSwitch: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('settings.manage');
  const { toast } = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try { setOn((await messagingAppsAPI.cartAutomation()).enabled); }
    catch (e: any) { setFailure(failureOf(e, 'Could not read whether cart recovery is switched on.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flip = async (next: boolean) => {
    // Arming is a send to many people at once: the next pass messages every contactable
    // shopper whose cart went idle in the last 7 days. Say so before it happens.
    if (next && !window.confirm('Switch on automatic cart reminders?\n\nThe next pass (every 15 minutes) messages every contactable shopper whose cart went idle in the last 7 days, so the first batch can be large. You can switch it off again at any time.')) return;
    setBusy(true);
    try {
      setOn((await messagingAppsAPI.setCartAutomation(next)).enabled);
      toast({ title: next ? 'Cart recovery switched on' : 'Cart recovery switched off' });
      onChanged?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not changed', description: errText(e, 'The server refused the change.') });
    } finally { setBusy(false); }
  };

  if (failure?.gap) return <GapNotice what="The cart settings route (GET /commerce/cart-settings) is not on this server yet, so whether recovery messages go out cannot be read here." />;
  if (failure) return <ErrorNotice message={failure.message} onRetry={load} />;
  if (on === null) return <BlockSkeleton lines={1} />;
  return (
    <div role="status" data-testid="cart-recovery-switch"
      className={cn('flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm', on ? 'border-good bg-good-bg text-good-ink' : 'border-warn bg-warn-bg text-warn-ink')}>
      <Switch checked={on} onCheckedChange={flip} disabled={!canWrite || busy} aria-label="Send cart-recovery messages automatically"
        title={!canWrite ? 'Needs the settings.manage permission' : undefined} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{on ? 'On: shoppers who leave a cart get the steps below' : 'Off: no shopper is messaged until you turn it on'}</p>
        <p className="text-xs opacity-90">
          {on
            ? 'It stops as soon as the cart becomes an order or the shopper opts out.'
            : 'Set the steps first, then switch this on. You can still send one cart its next step by hand from Abandoned Carts.'}
          {!canWrite && ' Changing it needs the settings.manage permission.'}
        </p>
      </div>
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" />}
    </div>
  );
};

export default CartRecovery;
