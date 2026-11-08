/**
 * Pieces the remarketing quick start, the Create ad flow and the Creative library share (lifted out of
 * RemarketingWizard so there is one copy): Meta's AI feature switches for a format, Meta's placement previews in
 * sandboxed frames, and a library item's square thumbnail.
 */
import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { AiFeature, LibraryItem } from '@/lib/v2/areas/meta';

export const isOn = (d: unknown) => d === true || d === 'on';

/** Each feature's own default from the options data, then what the person switched. */
export const aiValues = (features: AiFeature[], chosen: Record<string, 'on' | 'off'> | undefined): Record<string, 'on' | 'off'> => ({
  ...Object.fromEntries(features.map((f) => [f.key, isOn(f.default) ? 'on' : 'off'])),
  ...(chosen ?? {}),
});

/** Meta's AI features for one format, each a switch with Meta's help line. */
export const AiFeatureList: React.FC<{
  title: React.ReactNode;
  features: AiFeature[];
  value: Record<string, 'on' | 'off'>;
  onChange: (key: string, on: boolean) => void;
}> = ({ title, features, value, onChange }) => {
  if (!features.length) return null;
  return (
    <div className="rounded-md border">
      <p className="border-b bg-gray-50 px-3 py-2 text-sm font-medium">{title}</p>
      <ul className="divide-y">
        {features.map((f) => (
          <li key={f.key} className="flex items-start gap-3 px-3 py-2">
            <Switch checked={value[f.key] === 'on'} onCheckedChange={(v) => onChange(f.key, v)} className="mt-0.5" aria-label={f.label} />
            <span className="text-sm"><span className="font-medium">{f.label}</span><span className="block text-xs text-gray-600">{f.help}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export interface PreviewLike { placement: string; label?: string | null; html?: string | null; url?: string | null }

/** Meta's preview per placement: its HTML in a sandboxed frame, or its preview link. */
export const PreviewGrid: React.FC<{ previews: PreviewLike[]; height?: number; className?: string }> = ({ previews, height = 460, className }) => (
  <div className={className ?? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
    {previews.map((p) => {
      const label = p.label ?? p.placement.replace(/_/g, ' ');
      return (
        <figure key={p.placement} className="min-w-0">
          <figcaption className="mb-1 text-xs font-medium text-gray-600">{label}</figcaption>
          {p.html
            ? <iframe title={`Preview: ${label}`} srcDoc={p.html} sandbox="allow-scripts allow-popups" className="w-full rounded-md border bg-white" style={{ height }} />
            : p.url
              ? <iframe title={`Preview: ${label}`} src={p.url} sandbox="allow-scripts allow-popups allow-same-origin" referrerPolicy="no-referrer" className="w-full rounded-md border bg-white" style={{ height }} />
              : <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-gray-500">Meta sent no preview for this placement.</p>}
        </figure>
      );
    })}
  </div>
);

/** A creative library item as a square thumbnail; videos carry their length. */
export const LibThumb: React.FC<{ l: LibraryItem; className?: string }> = ({ l, className }) => {
  const src = l.thumbnail_url ?? l.url;
  return (
    <span className={cn('relative block aspect-square w-full bg-gray-100', className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="absolute inset-0 m-auto h-6 w-6 text-gray-400" />}
      {l.type === 'video' && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">{l.duration_s ? `${Math.round(l.duration_s)} s` : 'Video'}</span>}
    </span>
  );
};
