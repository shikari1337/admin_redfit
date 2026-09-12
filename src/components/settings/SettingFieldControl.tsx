import React, { useMemo, useState } from 'react';
import { X, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageInputWithActions from '@/components/common/ImageInputWithActions';

/** Mirrors backend/src/config/settingsRegistry.ts — the server is the authority. */
export interface RegistryField {
  path: string;
  label: string;
  type: 'boolean' | 'number' | 'string' | 'text' | 'select' | 'multiselect' | 'secret' | 'json' | 'image' | 'color' | 'tags' | 'date';
  description?: string;
  options?: FieldOption[];
  optionsSource?: string;
  min?: number; max?: number; step?: number;
  unit?: string;
  placeholder?: string;
  default?: unknown;
  readonly?: boolean;
  showIf?: { path: string; equals: unknown };
}
export interface FieldOption { value: string | number | boolean; label: string; hint?: string }

interface Props {
  field: RegistryField;
  value: any;
  onChange: (v: any) => void;
  options?: FieldOption[];
  disabled?: boolean;
  /** For `secret` fields — whether a value is stored server-side. */
  secretSet?: boolean;
  /** For image fields — the bucket folder uploads land in. */
  folder?: string;
}

const NATIVE_SELECT_FROM = 40;

/**
 * A reorderable set of chips over a fixed, small vocabulary — used wherever
 * array ORDER is the field's actual meaning (a `tags` field with `options`,
 * or a `json` field recognised as one below). Free typing would let a
 * merchant misspell a value the server then silently ignores; a picker
 * cannot produce an invalid entry.
 */
const OrderedChipPicker: React.FC<{ value: any; onChange: (v: string[]) => void; options: FieldOption[]; disabled?: boolean }> = ({ value, onChange, options, disabled }) => {
  const selected: string[] = Array.isArray(value) ? value.map(String) : [];
  const labelOf = (v: string) => options.find((o) => String(o.value) === v)?.label ?? v;
  const available = options.filter((o) => !selected.includes(String(o.value)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (v: string) => onChange(selected.filter((x) => x !== v));
  const add = (v: string) => { if (!selected.includes(v)) onChange([...selected, v]); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 && <span className="text-xs text-muted-foreground">Nothing selected — add from below.</span>}
        {selected.map((v, i) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 py-0.5 pl-2.5 pr-1 text-xs">
            <span className="tabular-nums text-[10px] text-muted-foreground">{i + 1}</span>
            <span className="font-medium">{labelOf(v)}</span>
            {!disabled && (
              <>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${labelOf(v)} earlier`}
                  className="rounded p-0.5 hover:bg-gray-200 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                <button type="button" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${labelOf(v)} later`}
                  className="rounded p-0.5 hover:bg-gray-200 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                <button type="button" onClick={() => remove(v)} aria-label={`Remove ${labelOf(v)}`}
                  className="rounded p-0.5 hover:bg-gray-200"><X className="h-3 w-3" /></button>
              </>
            )}
          </span>
        ))}
      </div>
      {available.length > 0 && !disabled && (
        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
          {available.map((o) => (
            <button key={String(o.value)} type="button" onClick={() => add(String(o.value))}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="h-3 w-3" /> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * The catalogue-naming "part order" array (`settingsRegistry.ts` key
 * `catalogNaming`, field `order` — type `json`, values drawn from
 * `CatalogNamePart` in `backend/src/utils/variationName.ts`) gets the chip
 * picker above instead of a raw JSON textarea. Recognised structurally (a
 * non-empty string array drawn entirely from this fixed 5-part vocabulary)
 * rather than by field path, so it also covers a future `json` field shaped
 * the same way without another registry change.
 */
const CATALOG_NAME_PART_OPTIONS: FieldOption[] = [
  { value: 'brand', label: 'Brand' },
  { value: 'product', label: 'Product name' },
  { value: 'form', label: 'Form' },
  { value: 'potency', label: 'Potency' },
  { value: 'size', label: 'Size' },
];
const CATALOG_NAME_PART_VALUES = new Set(CATALOG_NAME_PART_OPTIONS.map((o) => o.value));
const isCatalogNamePartOrder = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && CATALOG_NAME_PART_VALUES.has(x));

/**
 * ONE renderer per field type. Every setting in the Settings Center is drawn by
 * this component from its registry definition — no page-specific form code.
 */
const SettingFieldControl: React.FC<Props> = ({ field, value, onChange, options, disabled, secretSet, folder }) => {
  const opts = field.options ?? options ?? [];
  const id = `sf-${field.path || 'value'}`;
  const [jsonText, setJsonText] = useState<string>(() => (value == null ? '' : JSON.stringify(value, null, 2)));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [optFilter, setOptFilter] = useState('');
  const isDisabled = disabled || field.readonly;

  const filteredOpts = useMemo(() => {
    const q = optFilter.trim().toLowerCase();
    return q ? opts.filter((o) => `${o.label} ${o.value} ${o.hint ?? ''}`.toLowerCase().includes(q)) : opts;
  }, [opts, optFilter]);

  switch (field.type) {
    case 'boolean':
      return (
        <div className="flex items-center gap-3">
          <Switch id={id} checked={value === true} onCheckedChange={(c) => onChange(!!c)} disabled={isDisabled} />
          <span className="text-sm text-muted-foreground">{value === true ? 'On' : 'Off'}</span>
        </div>
      );

    case 'number':
      return (
        <div className="flex items-center gap-2">
          <Input id={id} type="number" inputMode="decimal" className="h-9 max-w-[220px] tabular-nums"
            value={value ?? ''} min={field.min} max={field.max} step={field.step ?? 'any'}
            placeholder={field.placeholder} disabled={isDisabled}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
          {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
          {(field.min != null || field.max != null) && (
            <span className="text-[11px] text-muted-foreground">
              {field.min != null && `min ${field.min}`}{field.min != null && field.max != null && ' · '}{field.max != null && `max ${field.max}`}
            </span>
          )}
        </div>
      );

    case 'string':
      return <Input id={id} className="h-9" value={value ?? ''} placeholder={field.placeholder} disabled={isDisabled} onChange={(e) => onChange(e.target.value)} />;

    case 'text':
      return <Textarea id={id} rows={3} value={value ?? ''} placeholder={field.placeholder} disabled={isDisabled} onChange={(e) => onChange(e.target.value)} />;

    case 'secret':
      return (
        <div className="space-y-1">
          <Input id={id} type="password" autoComplete="new-password" className="h-9 font-mono"
            value={value ?? ''} disabled={isDisabled}
            placeholder={secretSet ? '•••••••• (stored — type to replace)' : 'not set'}
            onChange={(e) => onChange(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            {secretSet ? 'A value is stored. Leave blank to keep it; the stored value is never shown.' : 'Nothing stored yet.'}
          </p>
        </div>
      );

    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input type="color" aria-label={field.label} className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
            value={/^#[0-9a-fA-F]{6}$/.test(String(value ?? '')) ? String(value) : '#000000'} disabled={isDisabled}
            onChange={(e) => onChange(e.target.value)} />
          <Input id={id} className="h-9 max-w-[160px] font-mono" value={value ?? ''} placeholder="#6A3D7C" disabled={isDisabled} onChange={(e) => onChange(e.target.value)} />
        </div>
      );

    case 'date':
      // A CALENDAR DAY (`YYYY-MM-DD`), read by the backend in the STORE's
      // timezone — never an instant, so nothing is converted on the way in or
      // out and the value means the same day to every viewer (#216).
      return (
        <div className="flex items-center gap-2">
          <Input id={id} type="date" className="h-9 max-w-[200px]" value={typeof value === 'string' ? value : ''}
            disabled={isDisabled} onChange={(e) => onChange(e.target.value)} />
          {!isDisabled && value ? (
            <button type="button" onClick={() => onChange('')} className="text-xs text-muted-foreground underline hover:text-foreground">Clear</button>
          ) : null}
        </div>
      );

    case 'image':
      return (
        <ImageInputWithActions value={value ?? ''} onChange={onChange} placeholder={field.placeholder ?? 'https://… or pick from the library'} folder={folder ?? 'settings'} disabled={isDisabled} />
      );

    case 'select': {
      const current = value == null ? '' : String(value);
      if (opts.length >= NATIVE_SELECT_FROM) {
        return (
          <select id={id} className="h-9 w-full max-w-[420px] rounded-md border border-input bg-background px-3 text-sm" value={current} disabled={isDisabled}
            onChange={(e) => { const o = opts.find((x) => String(x.value) === e.target.value); onChange(o ? o.value : e.target.value); }}>
            <option value="">—</option>
            {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        );
      }
      return (
        <Select value={current || '__unset__'} disabled={isDisabled}
          onValueChange={(v) => { if (v === '__unset__') { onChange(''); return; } const o = opts.find((x) => String(x.value) === v); onChange(o ? o.value : v); }}>
          <SelectTrigger id={id} className="h-9 max-w-[420px]"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__unset__">—</SelectItem>
            {opts.map((o) => (
              <SelectItem key={String(o.value)} value={String(o.value)}>
                {o.label}{o.hint ? <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case 'multiselect': {
      const selected: string[] = Array.isArray(value) ? value.map(String) : [];
      const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div className="rounded-md border border-input">
          {opts.length > 12 && (
            <div className="border-b border-input p-2">
              <Input className="h-8" placeholder="Filter…" value={optFilter} onChange={(e) => setOptFilter(e.target.value)} />
            </div>
          )}
          <div className="max-h-52 overflow-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {filteredOpts.map((o) => {
              const v = String(o.value);
              return (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="h-4 w-4" checked={selected.includes(v)} disabled={isDisabled} onChange={() => toggle(v)} />
                  <span>{o.label}</span>{o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                </label>
              );
            })}
            {!filteredOpts.length && <p className="text-xs text-muted-foreground">No matches.</p>}
          </div>
          <div className="border-t border-input px-2 py-1 text-[11px] text-muted-foreground">{selected.length} selected</div>
        </div>
      );
    }

    case 'tags': {
      // A `tags` field with a fixed vocabulary (e.g. a part order such as
      // brand/product/form/potency/size) gets an ordered chip picker instead of
      // free-text typing — array order IS the field's meaning, so it must be
      // reorderable, not something the merchant types commas into by hand.
      // A `tags` field with no options (a genuinely free-form list) keeps the
      // original comma-separated text box.
      if (opts.length > 0) {
        return <OrderedChipPicker value={value} onChange={onChange} options={opts} disabled={isDisabled} />;
      }
      return (
        <Input id={id} className="h-9" value={Array.isArray(value) ? value.join(', ') : ''} placeholder="comma-separated" disabled={isDisabled}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
      );
    }

    case 'json': {
      const orderCandidate = Array.isArray(value) ? value : (value == null ? field.default : undefined);
      if (isCatalogNamePartOrder(orderCandidate)) {
        return <OrderedChipPicker value={orderCandidate} onChange={onChange} options={CATALOG_NAME_PART_OPTIONS} disabled={isDisabled} />;
      }
      return (
        <div className="space-y-1">
          <Textarea id={id} rows={8} className="font-mono text-xs" value={jsonText} disabled={isDisabled}
            onChange={(e) => {
              setJsonText(e.target.value);
              try { onChange(e.target.value.trim() ? JSON.parse(e.target.value) : null); setJsonError(null); }
              catch (err: any) { setJsonError(err?.message || 'Invalid JSON'); }
            }} />
          {jsonError && <p className="text-[11px] text-destructive">{jsonError}</p>}
        </div>
      );
    }

    default:
      return <Input id={id} className="h-9" value={value ?? ''} disabled={isDisabled} onChange={(e) => onChange(e.target.value)} />;
  }
};

export default SettingFieldControl;

/** Compact, human summary of a field's current value for list rows. */
export function summarizeField(field: RegistryField, value: any, secretSet?: boolean): string {
  if (field.type === 'secret') return secretSet ? 'set' : 'not set';
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'boolean') return value === true ? 'On' : 'Off';
  if (field.type === 'date') return String(value);
  if (field.type === 'number') return `${value}${field.unit ? ` ${field.unit}` : ''}`;
  if (field.type === 'select') { const o = (field.options ?? []).find((x) => String(x.value) === String(value)); return o ? o.label : String(value); }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return `${Object.keys(value).length} keys`;
  const s = String(value);
  return s.length > 42 ? `${s.slice(0, 40)}…` : s;
}
