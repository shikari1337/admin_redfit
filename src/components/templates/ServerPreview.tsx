import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { messageTemplatesAPI, type MsgChannel, type MsgPreview } from '@/services/api';
import { ChannelPreview } from '@/pages/panels/marketing/campaigns/ChannelPreview';
import { Chip } from '@/components/erp/StatusChip';

/**
 * What a send would look like, RENDERED BY THE SERVER (`renderMessage`) — body
 * and frame together — inside either this store's layout or Growcord's. The
 * toggle is the whole point: a store sees its own logo and footer against the
 * one it gets when it sets none.
 *
 * Email HTML is shown in a sandboxed iframe with no script permission; it is
 * the server's own output, but a preview has no reason to run anything.
 */
export type PreviewLayout = 'store' | 'growcord';

const LAYOUT_SOURCE_LABEL: Record<string, string> = {
  store: 'Store header', product: 'Product header', growcord: 'Growcord header',
};

const ServerPreview: React.FC<{
  templateKey: string;
  channel: MsgChannel;
  draft?: { subject?: string; body?: string; components?: any[] } | null;
  layout: PreviewLayout;
  onLayout: (l: PreviewLayout) => void;
  /** Bump to re-fetch after a save. */
  nonce?: number;
}> = ({ templateKey, channel, draft, layout, onLayout, nonce }) => {
  const [data, setData] = useState<MsgPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const draftKey = JSON.stringify(draft ?? null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const t = setTimeout(async () => {
      try {
        const p = await messageTemplatesAPI.preview({ key: templateKey, channel, layout, draft: draft ?? undefined });
        if (!cancelled) setData(p ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setData(null);
        setErr(e?.response?.status === 404
          ? 'The server preview arrives with the backend update. The quick preview above shows the text.'
          : (e?.response?.data?.message || e?.message || 'The server could not render this message.'));
      } finally { if (!cancelled) setLoading(false); }
    }, draft ? 450 : 0);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, channel, layout, draftKey, nonce]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Header and footer" className="inline-flex rounded-md border border-line p-0.5">
          {(['store', 'growcord'] as const).map((l) => (
            <button key={l} type="button" role="tab" aria-selected={layout === l} onClick={() => onLayout(l)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${layout === l ? 'bg-brand text-brand-ink' : 'text-ink-soft hover:text-ink'}`}>
              {l === 'store' ? 'Store layout' : 'Growcord layout'}
            </button>
          ))}
        </div>
        {data?.layoutSource && <Chip tone={data.layoutSource === 'store' ? 'blue' : 'neutral'}>{LAYOUT_SOURCE_LABEL[data.layoutSource] ?? data.layoutSource}</Chip>}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-mute" />}
      </div>

      {err && <p className="text-xs text-ink-soft">{err}</p>}
      {!err && data?.blocked && (
        <p className="rounded-md border border-warn bg-warn-bg px-2.5 py-1.5 text-xs text-warn-ink">
          {data.blocked === 'sms_not_registered'
            ? 'This SMS text is not DLT-registered yet, so a real send skips SMS and goes out on the next channel.'
            : `A real send skips this channel: ${data.blocked}.`}
        </p>
      )}
      {!err && !!data?.missing?.length && (
        <p className="text-xs text-ink-soft">No example for {data.missing.map((m) => `{{${m}}}`).join(', ')} — shown as written.</p>
      )}

      {!err && data && (
        channel === 'email' && data.html ? (
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="border-b border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-ink">{data.subject || '(no subject)'}</div>
            <iframe title="Email preview" sandbox="" srcDoc={data.html} className="h-[420px] w-full bg-surface" data-testid="email-preview-frame" />
          </div>
        ) : (
          <ChannelPreview
            channel={channel}
            subject={data.subject ?? undefined}
            body={data.text ?? ''}
          />
        )
      )}
    </div>
  );
};

export default ServerPreview;
