import React from 'react';
import { Eye } from 'lucide-react';
import LayoutPreview, { type LayoutDraft } from '@/components/templates/LayoutPreview';

/**
 * Settings Center 8.6 `messageLayout` — the live preview beside the generated
 * form (docs/MESSAGE_TEMPLATES_PLAN.md §3). The FIELDS are the registry's own
 * (SettingFieldControl: logo is an `image` field → upload · library · URL);
 * this adds the one thing a generated form cannot: what the frame looks like
 * while it is still being typed.
 *
 * Draft value wins, then the effective saved value the Settings Center sent
 * (which the server resolves through store → Growcord), then nothing — and a
 * blank there is drawn in the theme's own colours.
 */
const getPath = (obj: any, path: string): any =>
  (!path ? obj : path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj));

const setPath = (obj: any, path: string, value: any) => {
  const keys = path.split('.');
  let cur = obj;
  keys.slice(0, -1).forEach((k) => { if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}; cur = cur[k]; });
  cur[keys[keys.length - 1]] = value;
};

export function draftLayout(value: any, work: Record<string, any>, fields: Array<{ path: string }>): LayoutDraft {
  const out: any = JSON.parse(JSON.stringify(value ?? {}));
  for (const f of fields) {
    if (!f.path) continue;
    const v = Object.prototype.hasOwnProperty.call(work, f.path) ? work[f.path] : getPath(value, f.path);
    if (v !== undefined && v !== null && v !== '') setPath(out, f.path, v);
  }
  return out as LayoutDraft;
}

const MessageLayoutForm: React.FC<{
  def: { value: any; fields: Array<{ path: string; readonly?: boolean }> };
  work: Record<string, any>;
}> = ({ def, work }) => {
  const layout = draftLayout(def.value, work, def.fields);
  const smsField = def.fields.find((f) => f.path === 'smsSignature');
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4" data-testid="message-layout-preview">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
        <Eye className="h-3.5 w-3.5" /> Live preview
      </div>
      <p className="mb-3 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-soft">
        Anything left blank uses Growcord's header and footer.
      </p>
      <LayoutPreview layout={layout} smsFixed={!!smsField?.readonly} />
    </div>
  );
};

export default MessageLayoutForm;

/**
 * Gate G-M5 on the generated form: the server says (in 8.6's own value) whether
 * this store may set its SMS signature — only a store with its own registered DLT
 * header may. When it may not, the field is READ-ONLY at "-GROWCORD" with the
 * server's reason as its help. A read-only field is never dirty, so it is never
 * sent; `smsSignatureEditable`/`smsSignatureReason` are not fields at all, so the
 * save path cannot echo them back.
 */
export function gateMessageLayoutDef<T extends { key: string; value: any; fields: Array<{ path: string; readonly?: boolean; help?: string; description?: string }> }>(def: T): T {
  if (def.key !== 'messageLayout' || def.value?.smsSignatureEditable !== false) return def;
  const reason = String(def.value?.smsSignatureReason || 'Your store has no registered SMS sender (DLT header) of its own, so messages end with -GROWCORD.');
  return {
    ...def,
    fields: def.fields.map((f) => (f.path === 'smsSignature' ? { ...f, readonly: true, help: reason, description: reason } : f)),
  };
}
