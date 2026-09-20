import React from 'react';
import InfoTip from '../../common/InfoTip';
import { AiTextButton } from '../../common/AiTextButton';
import { DISPLAY_LABELS, FRONTEND_LABELS, type DisplayOption } from './catalog';
import type { DisplaySettings, Frontend } from './types';

/**
 * "How should it reflect on the frontend" — the per-section / per-block
 * display options. Only the options the catalogue lists for that section are
 * shown, so a FAQ never offers "columns" and a banner never offers
 * "collapsed". Values are written to `display` (additive; absent = default).
 */
const inputCls = 'w-full px-2.5 h-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 bg-white';

const Seg: React.FC<{ value: string; options: Array<[string, string]>; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5">
    {options.map(([v, l]) => (
      <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
        className={`px-2.5 h-7 text-xs rounded ${value === v ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{l}</button>
    ))}
  </div>
);

const Row: React.FC<{ opt: DisplayOption; children: React.ReactNode }> = ({ opt, children }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
    <span className="text-[13px] text-gray-700 inline-flex items-center gap-1.5 pt-1">{DISPLAY_LABELS[opt].label}<InfoTip text={DISPLAY_LABELS[opt].help} /></span>
    <div className="shrink-0 max-w-[60%]">{children}</div>
  </div>
);

export const DisplayPanel: React.FC<{
  value: DisplaySettings | undefined;
  onChange: (next: DisplaySettings | undefined) => void;
  options: DisplayOption[];
  /** For the heading ✨. */
  ai?: { entityId?: string | null; draft?: () => any; sectionName: string };
  defaultHeading?: string;
}> = ({ value, onChange, options, ai, defaultHeading }) => {
  const d = value || {};
  const set = (patch: Partial<DisplaySettings>) => {
    const next: DisplaySettings = { ...d, ...patch };
    // Drop empties so an untouched section carries NO display object at all.
    (Object.keys(next) as Array<keyof DisplaySettings>).forEach((k) => {
      const v = next[k];
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || v === false) delete next[k];
    });
    onChange(Object.keys(next).length ? next : undefined);
  };
  const has = (o: DisplayOption) => options.includes(o);
  const hideOn = d.hideOn || [];
  const fronts: Frontend[] = d.frontends || ['storefront', 'ecom', 'template'];
  return (
    <div className="divide-y-0">
      {has('heading') && (
        <Row opt="heading">
          <div className="flex gap-1 items-center">
            <input className={`${inputCls} w-56`} value={d.heading || ''} placeholder={defaultHeading || 'Default'} onChange={(e) => set({ heading: e.target.value })} />
            {ai && <AiTextButton entity="product" entityId={ai.entityId} draft={ai.draft} field="section.heading" label="Heading" variant="icon" value={d.heading} local={{ section: ai.sectionName }} onResult={(v) => set({ heading: String(v) })} />}
          </div>
        </Row>
      )}
      {has('width') && <Row opt="width"><Seg value={d.width || 'contained'} options={[['contained', 'Contained'], ['full', 'Full width']]} onChange={(v) => set({ width: v === 'contained' ? undefined : (v as any) })} /></Row>}
      {has('background') && <Row opt="background"><Seg value={d.background || 'none'} options={[['none', 'None'], ['soft', 'Soft'], ['brand', 'Brand'], ['dark', 'Dark']]} onChange={(v) => set({ background: v === 'none' ? undefined : (v as any) })} /></Row>}
      {has('columns') && <Row opt="columns"><Seg value={String(d.columns || '')} options={[['', 'Auto'], ['2', '2'], ['3', '3'], ['4', '4']]} onChange={(v) => set({ columns: v ? (Number(v) as any) : undefined })} /></Row>}
      {has('imageFit') && <Row opt="imageFit"><Seg value={d.imageFit || 'cover'} options={[['cover', 'Cover'], ['contain', 'Contain']]} onChange={(v) => set({ imageFit: v === 'cover' ? undefined : (v as any) })} /></Row>}
      {has('headingSize') && <Row opt="headingSize"><Seg value={d.headingSize || 'md'} options={[['sm', 'S'], ['md', 'M'], ['lg', 'L']]} onChange={(v) => set({ headingSize: v === 'md' ? undefined : (v as any) })} /></Row>}
      {has('align') && <Row opt="align"><Seg value={d.align || 'left'} options={[['left', 'Left'], ['center', 'Centre']]} onChange={(v) => set({ align: v === 'left' ? undefined : (v as any) })} /></Row>}
      {has('spacing') && <Row opt="spacing"><Seg value={d.spacing || 'normal'} options={[['compact', 'Compact'], ['normal', 'Normal'], ['spacious', 'Spacious']]} onChange={(v) => set({ spacing: v === 'normal' ? undefined : (v as any) })} /></Row>}
      {has('collapsed') && <Row opt="collapsed"><Seg value={d.collapsed ? 'yes' : 'no'} options={[['no', 'Open'], ['yes', 'Collapsed']]} onChange={(v) => set({ collapsed: v === 'yes' ? true : undefined })} /></Row>}
      {has('hideOn') && (
        <Row opt="hideOn">
          <div className="flex gap-3 text-sm">
            {(['mobile', 'desktop'] as const).map((k) => (
              <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-brand-600" checked={hideOn.includes(k)} onChange={(e) => set({ hideOn: e.target.checked ? [...hideOn, k] : hideOn.filter((x) => x !== k) })} /> {k === 'mobile' ? 'Phones' : 'Desktop'}</label>
            ))}
          </div>
        </Row>
      )}
      {has('frontends') && (
        <Row opt="frontends">
          <div className="flex flex-wrap gap-2 text-sm justify-end">
            {(['storefront', 'ecom', 'template'] as Frontend[]).map((f) => (
              <label key={f} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-brand-600" checked={fronts.includes(f)} onChange={(e) => { const next = e.target.checked ? [...fronts, f] : fronts.filter((x) => x !== f); set({ frontends: next.length === 3 ? undefined : next }); }} /> {FRONTEND_LABELS[f]}</label>
            ))}
          </div>
        </Row>
      )}
      {has('anchor') && <Row opt="anchor"><input className={`${inputCls} w-40 font-mono text-xs`} value={d.anchor || ''} placeholder="benefits" onChange={(e) => set({ anchor: e.target.value.replace(/[^a-z0-9-]/gi, '-').toLowerCase() })} /></Row>}
      {options.length === 0 && <p className="text-xs text-gray-400">No display options for this item.</p>}
    </div>
  );
};

export default DisplayPanel;
