import React, { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { SectionCard } from '@/components/erp';
import { ErrorNote, Loading, Notice, OnOff, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { getAppCustomersSteps, putAppCustomersSteps } from '@/lib/v2/appSettings';

/**
 * App customers also on WhatsApp (HMAPP-T4b section 4, CQ3): a customer with the store's app gets
 * order updates by push first; the WhatsApp or SMS message then goes only when no device took the
 * push, unless this is on. Store setting `whatsapp_settings.appCustomersAlsoPhone` (default off).
 *
 * Server (Comms): `GET/PUT /api/v2/comms/whatsapp/app-customers` {also_phone} answers
 * {also_phone, app_push} (`settings.read`, `settings.manage`). Not on the live server yet.
 */
const AppCustomersWhatsAppCard: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const data = useLoad(getAppCustomersSteps, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const toggle = async () => {
    if (!data.data) return;
    setBusy(true); setError(null);
    try { await putAppCustomersSteps(!data.data.also_phone); await data.reload(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const off = whyDisabled(canWrite, []);

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4" aria-hidden />Customers who have the app</span>}
      description="Order updates go to the app first. Choose whether they also come on WhatsApp or SMS."
    >
      {data.loading && !data.data ? <Loading label="Reading the app customers setting" /> : data.error ? (
        <ErrorNote error={data.error} what="The app customers setting" onRetry={() => void data.reload()} />
      ) : data.data ? (
        <div className="space-y-3">
          {!data.data.app_push && (
            <Notice tone="info">App push is not running on this server yet, so every customer still gets WhatsApp or SMS as today.</Notice>
          )}
          <div className="flex items-center gap-3">
            <OnOff on={data.data.also_phone} busy={busy} disabled={!!off} title={off ?? undefined}
              label="Also send WhatsApp or SMS to customers who got the app message" onToggle={() => void toggle()} />
            <span className="text-sm text-gray-700">
              {data.data.also_phone
                ? 'They get the app message and the WhatsApp or SMS message.'
                : 'WhatsApp or SMS goes only when no phone with the app took the message.'}
            </span>
          </div>
          {off && <p className="text-xs text-gray-500">{off}</p>}
          {error ? <ErrorNote error={error} /> : null}
        </div>
      ) : null}
    </SectionCard>
  );
};

export default AppCustomersWhatsAppCard;
