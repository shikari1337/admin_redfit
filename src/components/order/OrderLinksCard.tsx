/**
 * Every link this order can send a customer — ONE per destination, ready to copy.
 *
 * Before this, "send the customer their payment link" meant copying a
 * 90-character signed URL out of the order payload and pasting it into WhatsApp
 * by hand. That link was untracked, so nobody could say which message got paid.
 *
 * It then over-corrected: the card minted a SEPARATE short link per channel, so
 * a COD order presented the desk with three near-identical URLs for one pay page
 * and made them choose. Per-channel links are the right answer for messages the
 * system SENDS — that is what makes "the WhatsApp nudge worked, the SMS was
 * wasted" answerable — but a staff member copying a link has not picked a
 * channel yet. Stamping one on records a guess as a fact.
 *
 * So: one link per destination, minted on the `share` channel, which says
 * exactly what it is. Automatic sends still shorten per channel, untouched.
 *
 * Loads with the order, so the link is simply THERE when staff open the page.
 * The shortener memoises long → short for 24h per store/channel/purpose, so
 * every later view of the same order is free, and the fetch is separate from
 * the order payload so a slow shortener never delays the page itself.
 *
 * Two states are called out rather than hidden, both because a silent version
 * costs a real send:
 *   - `shortened: false` — the long URL is shown and works, but it is long.
 *   - over 30 characters — the DLT gateway rejects the WHOLE SMS, so a
 *     "working" link that does not fit is worse than no link.
 */
import { useEffect, useState } from 'react';
import { FaLink, FaRegCopy, FaCheck, FaExclamationTriangle, FaExternalLinkAlt } from 'react-icons/fa';
import { ordersAPI, type OrderLinkGroup } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

function LinkRow({ group }: { group: OrderLinkGroup }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const link = group.link;

  const copy = async () => {
    await navigator.clipboard.writeText(link?.url ?? group.longUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: `${group.label} copied` });
  };

  const url = link?.url ?? group.longUrl;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-800">{group.label}</p>
        <p className="mt-0.5 truncate font-mono text-xs text-slate-600" title={link?.longUrl ?? group.longUrl}>
          {url}
        </p>
        {link && !link.shortened && (
          <p className="mt-1 text-[11px] text-amber-700">
            Not shortened — this is the full link. It works, it is just long.
          </p>
        )}
        {link?.shortened && !link.fits && (
          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
            <FaExclamationTriangle className="h-3 w-3" />
            Over 30 characters — an SMS gateway will reject the whole message.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={copy}>
          {copied ? <FaCheck className="h-3 w-3 text-emerald-600" /> : <FaRegCopy className="h-3 w-3" />}
          <span className="ml-1.5 text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in a new tab"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          <FaExternalLinkAlt className="h-3 w-3" />
        </a>
      </div>
    </div>
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

  // `orderId` in the dependency list, not `[]`: OrderNavigator moves between
  // orders without remounting this card, and an empty list would leave the
  // previous order's links on screen under the new order's number.
  useEffect(() => {
    let cancelled = false;
    setLinks(null);
    setError(null);
    setLoading(true);
    ordersAPI.links(orderId)
      .then((data) => { if (!cancelled) setLinks(data.links); })
      .catch((e: any) => { if (!cancelled) setError(e?.response?.data?.message || 'Could not load links'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-line px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FaLink className="h-3.5 w-3.5 text-slate-400" /> Customer links
        </CardTitle>
        <Button type="button" variant="outline" size="sm" className="h-7" disabled={loading} onClick={load}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </CardHeader>

      <CardContent className="p-4">
        {loading && !links && (
          <p className="text-sm text-muted-foreground">Shortening this order's links…</p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {links && links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing to link to yet — this order has no payment link, tracking URL or invoice.
          </p>
        )}

        {links && links.length > 0 && (
          <div className="space-y-2">
            {links.map((group) => <LinkRow key={group.key} group={group} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OrderLinksCard;
