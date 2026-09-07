/**
 * Every link this order can send a customer — one per channel, ready to copy.
 *
 * Before this, "send the customer their payment link" meant copying a
 * 90-character signed URL out of the order payload and pasting it into WhatsApp
 * by hand. That link was untracked, and indistinguishable from the same link sent
 * by SMS an hour later, so nobody could say which message actually got paid.
 *
 * Each row is a purpose (payment, tracking, invoice, abandoned cart) and each
 * column a channel, because the links genuinely differ: three short links to the
 * same pay page are what make "the WhatsApp nudge worked, the SMS did not" a
 * question with an answer.
 *
 * Deliberately lazy — the fetch mints links through the shortener, so it runs
 * when someone opens the panel rather than on every order view. An order desk
 * opens a hundred orders a day and sends links from a handful.
 *
 * Two states are called out rather than hidden, both because a silent version
 * costs a real send:
 *   - `shortened: false` — the long URL is shown and works, but it is long.
 *   - SMS over 30 characters — the DLT gateway rejects the WHOLE message, so a
 *     "working" link that does not fit is worse than no link, and is flagged red.
 */
import { useState } from 'react';
import { FaLink, FaWhatsapp, FaSms, FaEnvelope, FaRegCopy, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { ordersAPI, type OrderChannelLink, type OrderLinkGroup } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const CHANNELS = [
  { key: 'whatsapp' as const, label: 'WhatsApp', Icon: FaWhatsapp, tone: 'text-green-600' },
  { key: 'sms' as const, label: 'SMS', Icon: FaSms, tone: 'text-sky-600' },
  { key: 'email' as const, label: 'Email', Icon: FaEnvelope, tone: 'text-slate-500' },
];

function ChannelCell({ link, channel }: { link?: OrderChannelLink; channel: 'whatsapp' | 'sms' | 'email' }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  if (!link) return <td className="px-2 py-2 text-xs text-muted-foreground">—</td>;

  // Only SMS is actually rejected over the DLT ceiling; flagging it on WhatsApp
  // would be noise, and staff would learn to ignore the warning that matters.
  const tooLongForSms = channel === 'sms' && !link.fits;

  const copy = async () => {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: 'Link copied' });
  };

  return (
    <td className="px-2 py-2 align-top">
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={copy}
          title={link.shortened ? `Copy — full link: ${link.longUrl}` : 'Copy'}
          className="shrink-0 rounded p-1 hover:bg-muted"
          aria-label={`Copy ${channel} link`}
        >
          {copied ? <FaCheck className="h-3 w-3 text-emerald-600" /> : <FaRegCopy className="h-3 w-3" />}
        </button>
        <div className="min-w-0">
          <p className="truncate font-mono text-xs" title={link.url}>{link.url}</p>
          {tooLongForSms && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-red-600">
              <FaExclamationTriangle className="h-2.5 w-2.5 shrink-0" />
              {link.url.length} chars — over the 30-char DLT slot, this SMS will be rejected
            </p>
          )}
          {!link.shortened && (
            <p className="mt-0.5 text-[11px] text-amber-600">
              Not shortened{link.reason === 'disabled' ? ' — switched off for this store' : ''}
              {link.reason === 'no_shortener' ? ' — no shortener configured' : ''}
              {link.reason === 'provider_failed' ? ' — the shortener did not respond' : ''}
            </p>
          )}
        </div>
      </div>
    </td>
  );
}

export function OrderLinksCard({ orderId }: { orderId: string }) {
  const [links, setLinks] = useState<OrderLinkGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ordersAPI.links(orderId);
      setLinks(data.links);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load links');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FaLink className="h-4 w-4 text-muted-foreground" /> Customer links
        </CardTitle>
        <Button type="button" variant="outline" size="sm" className="h-7" disabled={loading} onClick={load}>
          {loading ? 'Loading…' : links ? 'Refresh' : 'Show links'}
        </Button>
      </CardHeader>

      <CardContent>
        {!links && !error && (
          <p className="text-sm text-muted-foreground">
            Short, tracked links for this order — payment, tracking, invoice and the abandoned-cart
            link where there is one. A separate link per channel, so you can tell which message the
            customer actually opened.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {links && links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing to link to yet — this order has no payment link, tracking URL or invoice.
          </p>
        )}

        {links && links.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Link</th>
                  {CHANNELS.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-medium">
                      <span className="flex items-center gap-1.5">
                        <c.Icon className={`h-3 w-3 ${c.tone}`} /> {c.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {links.map((group) => (
                  <tr key={group.key} className="border-b last:border-0 align-top">
                    <td className="px-2 py-2">
                      <p className="font-medium">{group.label}</p>
                      <p className="truncate max-w-[220px] text-[11px] text-muted-foreground" title={group.longUrl}>
                        {group.longUrl}
                      </p>
                    </td>
                    {CHANNELS.map((c) => (
                      <ChannelCell key={c.key} channel={c.key} link={group.channels?.[c.key]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
