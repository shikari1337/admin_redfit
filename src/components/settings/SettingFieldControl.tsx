import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageInputWithActions from '@/components/common/ImageInputWithActions';

/** Mirrors backend/src/config/settingsRegistry.ts — the server is the authority. */
export interface RegistryField {
  path: string;
  label: string;
  type: 'boolean' | 'number' | 'string' | 'text' | 'select' | 'multiselect' | 'secret' | 'json' | 'image' | 'color' | 'tags';
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

    case 'tags':
      return (
        <Input id={id} className="h-9" value={Array.isArray(value) ? value.join(', ') : ''} placeholder="comma-separated" disabled={isDisabled}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
      );

    case 'json':
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
  if (field.type === 'number') return `${value}${field.unit ? ` ${field.unit}` : ''}`;
  if (field.type === 'select') { const o = (field.options ?? []).find((x) => String(x.value) === String(value)); return o ? o.label : String(value); }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return `${Object.keys(value).length} keys`;
  const s = String(value);
  return s.length > 42 ? `${s.slice(0, 40)}…` : s;
}
