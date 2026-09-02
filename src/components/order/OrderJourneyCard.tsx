import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from '../../utils/date';

/**
 * How the order was won and who placed it — the `order_attribution` snapshot
 * taken at checkout: campaign/channel (first + last touch), click ids, device,
 * location, journey length and checkout attempts.
 */
interface Props {
  attribution?: Record<string, any> | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  google_ads: 'Google Ads', meta_ads: 'Meta Ads', microsoft_ads: 'Microsoft Ads',
  tiktok_ads: 'TikTok Ads', organic_search: 'Organic Search', organic_social: 'Organic Social',
  referral: 'Referral', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp',
  affiliate: 'Affiliate', direct: 'Direct', other: 'Other',
};

const channelBadge = (channel?: string) => {
  if (!channel) return null;
  const paid = ['google_ads', 'meta_ads', 'microsoft_ads', 'tiktok_ads'].includes(channel);
  return (
    <Badge className={paid
      ? 'bg-purple-500/15 text-purple-700 border-purple-200 hover:bg-purple-500/25'
      : 'bg-slate-500/15 text-slate-700 border-slate-200 hover:bg-slate-500/25'}>
      {CHANNEL_LABEL[channel] ?? channel}
    </Badge>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="text-right text-foreground font-medium break-all">{children}</span>
  </div>
);

const OrderJourneyCard: React.FC<Props> = ({ attribution }) => {
  const a = attribution;
  return (
    <Card className="shadow-sm">
      <CardHeader className="px-4 py-2.5 border-b">
        <CardTitle className="text-base">Marketing &amp; Journey</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-2.5">
        {!a ? (
          <p className="text-sm text-muted-foreground">
            No attribution captured for this order — it was placed before journey
            tracking, or the shopper declined analytics consent.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Won by (last touch)</p>
                {channelBadge(a.lastChannel ?? a.last_channel)}
              </div>
              <div className="space-y-1 text-right">
                <p className="text-xs text-muted-foreground">Introduced by (first touch)</p>
                {channelBadge(a.firstChannel ?? a.first_channel)}
              </div>
            </div>

            {(a.lastCampaign ?? a.last_campaign ?? a.lastSource ?? a.last_source) && (
              <div className="text-sm bg-muted/50 rounded-md px-3 py-2">
                {(a.lastSource ?? a.last_source) && <div>Source: <span className="font-medium">{a.lastSource ?? a.last_source}</span>{(a.lastMedium ?? a.last_medium) ? ` / ${a.lastMedium ?? a.last_medium}` : ''}</div>}
                {(a.lastCampaign ?? a.last_campaign) && <div>Campaign: <span className="font-medium">{a.lastCampaign ?? a.last_campaign}</span></div>}
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <Row label="Touches before purchase">{a.touchCount ?? a.touch_count ?? 0}</Row>
              {(a.daysToConvert ?? a.days_to_convert) != null && (
                <Row label="Time to convert">{Number(a.daysToConvert ?? a.days_to_convert) < 1
                  ? `${Math.round(Number(a.daysToConvert ?? a.days_to_convert) * 24 * 10) / 10} hours`
                  : `${a.daysToConvert ?? a.days_to_convert} days`}</Row>
              )}
              <Row label="Checkout attempts">{a.checkoutAttempts ?? a.checkout_attempts ?? 1}</Row>
              <Row label="Customer">{(a.isRepeatCustomer ?? a.is_repeat_customer)
                ? `Repeat — ${a.previousOrderCount ?? a.previous_order_count ?? 0} prior order(s)`
                : 'First order'}</Row>
              {(a.deviceType ?? a.device_type) && (
                <Row label="Device">{`${a.deviceType ?? a.device_type} · ${a.browser ?? '?'} · ${a.os ?? '?'}`}</Row>
              )}
              {(a.city || a.region || a.country) && (
                <Row label="Location">{[a.city, a.region, a.country].filter(Boolean).join(', ')}</Row>
              )}
              {(a.ipAddress ?? a.ip_address) && (
                <Row label="IP">{a.ipAddress ?? a.ip_address}</Row>
              )}
              {a.referrer && <Row label="Referrer">{a.referrer}</Row>}
              {(a.landingPage ?? a.landing_page) && (
                <Row label="Landing page">{a.landingPage ?? a.landing_page}</Row>
              )}
              {(a.firstTouchAt ?? a.first_touch_at) && (
                <Row label="First seen">{formatDate(a.firstTouchAt ?? a.first_touch_at, 'MMM dd, yyyy HH:mm', '—')}</Row>
              )}
            </div>

            {(a.gclid || a.fbclid || a.msclkid || a.ttclid || a.gbraid || a.wbraid) && (
              <div className="text-xs text-muted-foreground pt-2 border-t">
                Ad click ids on file:{' '}
                {[a.gclid && 'gclid', a.gbraid && 'gbraid', a.wbraid && 'wbraid',
                  a.fbclid && 'fbclid', a.msclkid && 'msclkid', a.ttclid && 'ttclid']
                  .filter(Boolean).join(', ')}{' '}
                — usable for offline conversion upload.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderJourneyCard;
