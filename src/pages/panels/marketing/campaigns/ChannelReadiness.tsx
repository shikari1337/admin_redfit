import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { StatusChip } from '@/components/erp';
import { CARD } from '@/components/erp';
import { cn } from '@/lib/utils';
import { CHANNEL_META, type ChannelKey } from './channelMeta';

/**
 * One channel's live readiness, straight off `GET /marketing-hub/channels`.
 *
 * The backend answers "configured?" with the SAME resolvers a real send uses,
 * so this card cannot drift from reality the way the old setup checklist did —
 * it read `whatsapp_settings` in a shape that had stopped existing and told
 * stores with working credentials that WhatsApp was not configured.
 *
 * `configured but off` is rendered as its own state on purpose: telling an
 * owner who deliberately paused a channel that it is "not configured" sends
 * them to re-enter credentials that were never the problem.
 */
export interface ChannelStatus {
  channel: ChannelKey;
  campaigns_total: number;
  campaigns_draft: number;
  campaigns_scheduled: number;
  campaigns_sent_30d: number;
  messages_30d: number;
  failed_30d: number;
  spend_30d: number;
  templates_approved: number;
  templates_pending: number;
  last_sent_at: string | null;
  module: string;
  module_enabled: boolean;
  configured: boolean;
  enabled: boolean;
  source: string | null;
  detail: string | null;
  fix_path: string;
  fix_label: string;
  ready: boolean;
  blockers: string[];
}

export function readinessLabel(s: ChannelStatus): { text: string; tone: 'green' | 'amber' | 'red' | 'neutral' } {
  if (!s.module_enabled) return { text: 'Module off', tone: 'neutral' };
  if (!s.configured) return { text: 'Not configured', tone: 'red' };
  if (!s.enabled) return { text: 'Switched off', tone: 'amber' };
  if (!s.templates_approved) return { text: 'No template', tone: 'amber' };
  return { text: 'Ready', tone: 'green' };
}

/** Compact card for the campaigns hub — one per channel, links into its panel. */
export const ChannelCard: React.FC<{ status: ChannelStatus }> = ({ status }) => {
  const meta = CHANNEL_META[status.channel];
  const Icon = meta.icon;
  const state = readinessLabel(status);

  return (
    <Link
      to={`/panel/marketing/campaigns/${status.channel}`}
      className={cn(CARD, 'group block p-4 transition-colors hover:border-gray-300 hover:bg-gray-50/60')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon className={cn('h-5 w-5', meta.accent)} strokeWidth={2.25} />
          <span className="text-base font-semibold text-gray-900">{meta.label}</span>
        </div>
        <StatusChip status={state.text} tone={state.tone} />
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{meta.blurb}</p>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
        {[
          { k: 'Campaigns', v: status.campaigns_total },
          { k: 'Sent 30d', v: status.messages_30d },
          { k: 'Templates', v: status.templates_approved },
        ].map((x) => (
          <div key={x.k}>
            <dt className="text-[10px] uppercase tracking-wide text-gray-400">{x.k}</dt>
            <dd className="text-lg font-bold tabular-nums text-gray-900">{x.v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        {status.ready ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            {status.source ? `via ${status.source}` : 'Ready to send'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 truncate text-amber-700" title={status.blockers.join(' ')}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{status.blockers[0]}</span>
          </span>
        )}
        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-gray-500 group-hover:text-gray-900">
          Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
      </div>
    </Link>
  );
};

/** Full-width banner shown at the top of a single channel's panel. */
export const ChannelReadinessBanner: React.FC<{ status: ChannelStatus }> = ({ status }) => {
  const meta = CHANNEL_META[status.channel];

  if (status.ready) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-900">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.25} />
        <span className="font-medium">{meta.label} is ready.</span>
        {status.source && <span className="text-emerald-800">Sending via {status.source}.</span>}
        {status.detail && <span className="text-emerald-700/80">{status.detail}.</span>}
        <span className="text-emerald-700/80">
          {status.templates_approved} approved template{status.templates_approved === 1 ? '' : 's'}.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={2.25} />
        {meta.label} can’t send yet
      </div>
      <ul className="mt-1.5 space-y-1 text-sm text-amber-800">
        {status.blockers.map((b) => (
          <li key={b}>· {b}</li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {!status.configured || !status.enabled ? (
          <Link to={status.fix_path} className="font-medium text-amber-900 underline">
            {status.fix_label}
          </Link>
        ) : null}
        {!status.templates_approved && (
          <Link to="/panel/marketing/templates" className="font-medium text-amber-900 underline">
            Marketing → Templates
          </Link>
        )}
        {!status.module_enabled && <span className="text-amber-700">A super admin enables store modules.</span>}
      </div>
    </div>
  );
};
