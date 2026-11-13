import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MailX, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, BlockSkeleton } from '@/components/erp';
import { messagingAPI, fmtCount, type EmailConfig } from '@/lib/v2/messaging';
import { failureOf, type LoadFailure } from './common';

/**
 * The Email page's Overview, first: what to act on before the numbers. Whose mail server sends and whether
 * it can (the server's own `note` when it cannot), whether replies have somewhere to go, and how
 * many addresses get no offers or reminders. Reads the same routes the Sender & SMTP and
 * Unsubscribed tabs read (`GET /comms/email/config`, `GET /comms/suppressions?channel=email`);
 * each card says nothing rather than guessing when its read is refused. Lane MENU-1 email.
 */
type Tab = 'sender' | 'branding' | 'unsubscribed';

const EmailHealth: React.FC<{ canReadSender: boolean; onOpen: (tab: Tab) => void }> = ({ canReadSender, onOpen }) => {
  const [cfg, setCfg] = useState<EmailConfig | null>(null);
  const [cfgFail, setCfgFail] = useState<LoadFailure | null>(null);
  const [blocked, setBlocked] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, b] = await Promise.allSettled([
      canReadSender ? messagingAPI.emailConfig() : Promise.resolve(null),
      messagingAPI.suppressions({ channel: 'email', limit: 1 }),
    ]);
    if (c.status === 'fulfilled') { setCfg(c.value); setCfgFail(null); } else { setCfg(null); setCfgFail(failureOf(c.reason, 'Could not read the email sender.')); }
    setBlocked(b.status === 'fulfilled' ? b.value.total : null);
    setLoading(false);
  }, [canReadSender]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div aria-busy="true"><BlockSkeleton lines={3} /></div>;

  const cannotSend = !!cfg?.note;
  return (
    <div className="space-y-2" data-testid="email-health">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-lg border p-4 ${cannotSend ? 'border-bad bg-bad-bg' : 'border-line bg-surface'}`}>
          <div className="flex items-start gap-2.5">
            {cannotSend
              ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad-ink" aria-hidden />
              : <Send className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />}
            <div className="min-w-0 flex-1 text-sm">
              {!canReadSender ? (
                <p className="text-ink-soft">Who sends your email shows with the <span className="font-mono text-xs">settings.read</span> permission.</p>
              ) : cfgFail ? (
                <p className="text-ink-soft">{cfgFail.gap ? 'This server does not say who sends your email yet.' : cfgFail.message}</p>
              ) : cfg && (
                <>
                  <p className={`font-semibold ${cannotSend ? 'text-bad-ink' : 'text-ink'}`}>
                    {cannotSend ? 'Email may not go out'
                      : cfg.mode === 'own' ? `Sent from your own server${cfg.host ? ` (${cfg.host})` : ''}` : "Sent by Growcord's mail service"}
                  </p>
                  {cannotSend
                    ? <p className="mt-0.5 text-xs text-bad-ink">{cfg.note}</p>
                    : <p className="mt-0.5 break-all text-xs text-ink-soft">From {cfg.from_name || 'your store'}{cfg.from_email ? `, ${cfg.from_email}` : ''}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Chip tone={cfg.live ? 'green' : 'amber'}>{cfg.live ? 'Live' : 'Test mode'}</Chip>
                    {!cfg.reply_to && <Chip tone="amber">No reply address</Chip>}
                  </div>
                  {!cfg.reply_to && (
                    <p className="mt-1.5 text-xs text-ink-soft">
                      Replies go to the sending address.{' '}
                      <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => onOpen('branding')}>Add a support email</button>
                    </p>
                  )}
                  {(cannotSend || !cfg.live) && (
                    <Button size="sm" variant="outline" className="mt-2 h-8" onClick={() => onOpen('sender')}>Open Sender &amp; SMTP</Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start gap-2.5">
            <MailX className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              {blocked === null ? (
                <p className="text-ink-soft">The list of addresses that unsubscribed could not be read.</p>
              ) : (
                <>
                  <p className="font-semibold text-ink">
                    {blocked === 0 ? 'No one has unsubscribed' : `${fmtCount(blocked)} ${blocked === 1 ? 'address gets' : 'addresses get'} no offers or reminders`}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">They unsubscribed or their mailbox refused your email. Order emails still reach them.</p>
                  {blocked > 0 && (
                    <Button size="sm" variant="outline" className="mt-2 h-8" onClick={() => onOpen('unsubscribed')}>See who</Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-ink-soft">
        A mail server only confirms that it accepted each email, so Delivered and Opened stay empty until a provider reports them.
      </p>
    </div>
  );
};

export default EmailHealth;
