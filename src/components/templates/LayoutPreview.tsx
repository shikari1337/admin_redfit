import React from 'react';
import { ChannelPreview } from '@/pages/panels/marketing/campaigns/ChannelPreview';

/**
 * The FRAME every message is sent inside — header, footer, signature — drawn
 * from a layout object (docs/MESSAGE_TEMPLATES_PLAN.md §3). Used by Settings
 * Center 8.6 (the store's layout, previewed while it is still being typed) and
 * mirrored by the super admin's Messaging identity.
 *
 * Client-side on purpose: an UNSAVED layout has nothing on the server to
 * render yet. The body is a fixed sample; what the frame does to it is the
 * question this answers. Colours come from the layout's own values, and fall
 * back to the theme's tokens — never a literal of this file.
 */
/** The FLAT stored shape (backend config/messageLayouts.ts StoredLayout) — settings 8.6 and the platform layout alike. */
export interface LayoutDraft {
  brandName?: string; logoUrl?: string; wordmark?: string;
  brandColor?: string; textOnBrand?: string; bgColor?: string; borderColor?: string; mutedColor?: string; textColor?: string;
  supportEmail?: string; supportPhone?: string; address?: string; websiteUrl?: string; legalLine?: string;
  links?: Array<{ label: string; url: string }>; social?: Array<{ kind: string; url: string }>;
  smsSignature?: string; whatsappFooter?: string; pushIcon?: string; pushBadge?: string;
}

const SAMPLE = 'Hi Priya, your order SM-9201 has been shipped. Track it here: https://gc.mw/t/9201';

const LayoutPreview: React.FC<{ layout: LayoutDraft; smsFixed?: boolean }> = ({ layout, smsFixed }) => {
  const brand = layout.brandColor || 'var(--accent)';
  const onBrand = layout.textOnBrand || 'var(--accent-ink)';
  const bg = layout.bgColor || 'var(--surface-2)';
  const border = layout.borderColor || 'var(--line)';
  const muted = layout.mutedColor || 'var(--ink-soft)';
  const name = layout.brandName || 'Growcord';
  const f = layout;
  const signature = layout.smsSignature || '-GROWCORD';
  const contact = [f.supportEmail, f.supportPhone].filter(Boolean).join(' · ');

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="layout-preview">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Email</p>
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: border, background: bg }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: brand, color: onBrand }}>
            {layout.logoUrl
              ? <img src={layout.logoUrl} alt={name} className="h-7 max-w-[140px] object-contain" data-testid="layout-logo" />
              : <span className="text-sm font-bold tracking-tight">{layout.wordmark || name}</span>}
          </div>
          <div className="m-3 rounded-md bg-surface p-3 text-sm text-ink" style={layout.textColor ? { color: layout.textColor } : undefined}>
            <p className="font-semibold">Your order has shipped</p>
            <p className="mt-1 text-ink-soft">{SAMPLE}</p>
            <span className="mt-3 inline-block rounded px-3 py-1.5 text-xs font-semibold" style={{ background: brand, color: onBrand }}>Track order</span>
          </div>
          <div className="space-y-0.5 px-4 pb-3 text-[11px]" style={{ color: muted }}>
            <p className="font-medium">{name}</p>
            {contact && <p>{contact}</p>}
            {f.address && <p>{f.address}</p>}
            {f.websiteUrl && <p>{f.websiteUrl}</p>}
            {f.legalLine && <p>{f.legalLine}</p>}
            {!!f.links?.length && <p>{f.links.map((l) => l.label).join(' · ')}</p>}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">SMS {smsFixed && <span className="font-normal normal-case">(signature fixed until your own DLT header is registered)</span>}</p>
          <ChannelPreview channel="sms" body={`${SAMPLE} ${signature}`} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">WhatsApp</p>
          <ChannelPreview channel="whatsapp" body={`${SAMPLE}${layout.whatsappFooter ? `\n\n${layout.whatsappFooter}` : ''}`} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Push</p>
          <div className="flex items-start gap-2">
            {layout.pushIcon && <img src={layout.pushIcon} alt="" className="mt-1 h-8 w-8 rounded object-cover" />}
            <div className="flex-1"><ChannelPreview channel="push" storeName={name} subject="Order shipped" body="SM-9201 is on its way." /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayoutPreview;
