import { MessageSquare, Mail, Bell, Send, type LucideIcon } from 'lucide-react';

/**
 * ONE definition of how each campaign channel presents itself — label, icon,
 * accent, the sentence that explains it, and what its composer/preview needs.
 *
 * Every campaign surface (the hub cards, the per-channel panel, the composer
 * preview, the campaign table) reads this map instead of carrying its own copy
 * of "whatsapp is green and its icon is a bubble". The four panels differ in
 * data and constraints, not in four hand-maintained sets of strings.
 */
export const CHANNEL_KEYS = ['sms', 'whatsapp', 'email', 'push'] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

export interface ChannelMeta {
  key: ChannelKey;
  label: string;
  icon: LucideIcon;
  /** Tailwind text colour for the bare icon + accents (no tinted icon boxes). */
  accent: string;
  /** Hex used for the StatCard accent dot. */
  dot: string;
  blurb: string;
  /** What the audience is addressed by — decides which contact field matters. */
  addressedBy: 'phone' | 'email' | 'device';
  /** True when the provider (not us) must pre-approve the message body. */
  preApproved: boolean;
  /** Composer help shown under the template picker. */
  composerHint: string;
  /** Where a campaign for this channel can go wrong most often. */
  gotcha: string;
  /** Soft limit surfaced in the composer preview (chars for text channels). */
  softLimit?: number;
}

export const CHANNEL_META: Record<ChannelKey, ChannelMeta> = {
  sms: {
    key: 'sms',
    label: 'SMS',
    icon: MessageSquare,
    accent: 'text-sky-600',
    dot: '#0284c7',
    blurb: 'DLT-registered transactional and promotional text. Reaches every phone, no app needed.',
    addressedBy: 'phone',
    preApproved: true,
    composerHint:
      'Only DLT-approved templates can send. Use “Sync SMS panel” on Templates to pull the approved list.',
    gotcha: 'A ₹ sign switches the message to UCS-2 and halves the per-part length.',
    softLimit: 160,
  },
  whatsapp: {
    key: 'whatsapp',
    label: 'WhatsApp',
    icon: Send,
    accent: 'text-emerald-600',
    dot: '#059669',
    blurb: 'Meta-approved template messages over the store’s own gateway. Richest and cheapest per message.',
    addressedBy: 'phone',
    preApproved: true,
    composerHint:
      'Meta must approve each template before it can send. “Sync WhatsApp” imports the approved ones.',
    gotcha: 'Outside the 24-hour session window only an approved TEMPLATE can be delivered.',
    softLimit: 1024,
  },
  email: {
    key: 'email',
    label: 'Email',
    icon: Mail,
    accent: 'text-violet-600',
    dot: '#7c3aed',
    blurb: 'Full-length HTML over the store’s own SMTP mailbox. No provider approval needed.',
    addressedBy: 'email',
    preApproved: false,
    composerHint: 'Subject and body are yours — approval is this panel’s own workflow, not a provider’s.',
    gotcha: 'A campaign sent from an unauthenticated domain lands in spam — check SPF/DKIM first.',
  },
  push: {
    key: 'push',
    label: 'Push',
    icon: Bell,
    accent: 'text-amber-600',
    dot: '#d97706',
    blurb: 'Browser notifications to visitors who opted in. No contact details involved at all.',
    addressedBy: 'device',
    preApproved: false,
    composerHint: 'Push has no audience picker — it always goes to every active subscriber.',
    gotcha: 'Subscribers are per-browser: the same person on phone and laptop counts twice.',
    softLimit: 120,
  },
};

export const CHANNEL_LIST = CHANNEL_KEYS.map((k) => CHANNEL_META[k]);

export function isChannelKey(v: string | undefined): v is ChannelKey {
  return !!v && (CHANNEL_KEYS as readonly string[]).includes(v);
}

/** Campaign status → the ERP StatusChip tone vocabulary. */
export const CAMPAIGN_STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  draft: 'neutral',
  scheduled: 'blue',
  sending: 'amber',
  sent: 'green',
  partial: 'amber',
  failed: 'red',
};
