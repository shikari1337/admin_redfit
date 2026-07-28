import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { SectionCard } from './Card';
import { Btn } from './Button';
import { Field, TextInput, SelectInput } from './FilterBar';

/**
 * CustomFieldsCard — the ONE reusable widget for the custom fields engine
 * (backend db/queries/customFields.ts, migration 084; spec Part I §19).
 *
 * Drop it at the bottom of any record's detail/edit screen:
 *
 *     <CustomFieldsCard entityType="vendor" entityId={id} />
 *
 * It fetches that record type's owner-defined fields plus this record's saved
 * answers, renders the right control per type (text / number / date / yes-no /
 * choice) and saves them itself through
 * `PUT /custom-fields/values/:entityType/:entityId`. It is DELIBERATELY
 * self-contained — it owns its own load, save, error and success state — so a
 * host page needs no new state, no new submit logic, and no change to its own
 * save path. Nothing here touches the host form's fields.
 *
 * Save semantics are PATCH: only the keys this card shows are sent, so it can
 * never wipe answers some other screen owns.
 *
 * When the store has defined NO fields for this record type, the card renders
 * nothing at all (unless `alwaysShow`), so mounting it is free.
 */

export type CustomFieldEntityType =
  | 'product' | 'customer' | 'vendor' | 'order' | 'grn' | 'consignment_partner';

interface FieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options: string[];
  help_text: string | null;
  required: boolean;
  sort_order: number;
}

type ValueMap = Record<string, string | number | boolean | null>;

/** Everything arrives from the API as JSON; forms want strings. */
const toInput = (v: any): string =>
  v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);

export const CustomFieldsCard: React.FC<{
  entityType: CustomFieldEntityType;
  /** The record's UUID. Empty/undefined → the card explains it needs saving first. */
  entityId?: string;
  title?: string;
  description?: string;
  /** Show the card (with a "no fields yet" hint) even when nothing is defined. */
  alwaysShow?: boolean;
  className?: string;
  /** Called after a successful save, with the record's answers as stored. */
  onSaved?: (values: ValueMap) => void;
}> = ({ entityType, entityId, title = 'Extra details', description, alwaysShow, className, onSaved }) => {
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (entityId) {
        const res = await api.get(`/custom-fields/values/${entityType}/${entityId}`);
        const data = payload<{ defs: FieldDef[]; values: ValueMap }>(res) ?? { defs: [], values: {} };
        setDefs(data.defs ?? []);
        const next: Record<string, string> = {};
        for (const d of data.defs ?? []) next[d.field_key] = toInput(data.values?.[d.field_key]);
        setForm(next);
      } else {
        // No record yet (a "create" screen): show the fields read-only-ish so the
        // owner sees what they will be asked, but there is nothing to save onto.
        const res = await api.get('/custom-fields/defs', { params: { entityType } });
        const list = payload<FieldDef[]>(res) ?? [];
        setDefs(list);
        setForm(Object.fromEntries(list.map((d) => [d.field_key, ''])));
      }
    } catch (e: any) {
      const status = e?.response?.status;
      // 403 = this user may not see this record type's fields; stay quiet rather
      // than shouting an error onto someone else's page.
      if (status === 403) setDenied(true);
      else setError(e?.response?.data?.message || e?.message || 'Could not load the extra fields.');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!entityId) return;
    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      // Send only what this card shows (PATCH semantics), converting blanks to
      // null so the backend clears the answer.
      const values: Record<string, any> = {};
      for (const d of defs) {
        const raw = form[d.field_key] ?? '';
        values[d.field_key] = raw === '' ? null : raw;
      }
      const res = await api.put(`/custom-fields/values/${entityType}/${entityId}`, { values });
      const out = payload<{ values: ValueMap }>(res);
      setOkMsg('Saved.');
      if (out?.values) {
        const next: Record<string, string> = {};
        for (const d of defs) next[d.field_key] = toInput(out.values[d.field_key]);
        setForm(next);
        onSaved?.(out.values);
      }
      window.setTimeout(() => setOkMsg(''), 2500);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not save the extra fields.');
    } finally {
      setSaving(false);
    }
  };

  if (denied) return null;
  if (loading) {
    return (
      <SectionCard title={title} className={className}>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading extra fields…
        </div>
      </SectionCard>
    );
  }
  if (!defs.length && !alwaysShow) return null;

  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gray-500" />
          {title}
        </span>
      }
      description={description ?? 'Fields your business added under Settings → Custom Fields.'}
      className={className}
    >
      {!defs.length ? (
        <p className="text-sm text-gray-500">
          No extra fields yet. Add one under Settings → Custom Fields and it will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {!entityId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Save this record first — then these extra details can be filled in.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {defs.map((d) => (
              <Field
                key={d.id}
                label={
                  <span>
                    {d.label}
                    {d.required && <span className="ml-0.5 text-red-600">*</span>}
                  </span>
                }
              >
                {d.field_type === 'select' ? (
                  <SelectInput
                    value={form[d.field_key] ?? ''}
                    disabled={!entityId}
                    onChange={(e) => setForm((f) => ({ ...f, [d.field_key]: e.target.value }))}
                  >
                    <option value="">— not set —</option>
                    {(d.options ?? []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </SelectInput>
                ) : d.field_type === 'boolean' ? (
                  <SelectInput
                    value={form[d.field_key] ?? ''}
                    disabled={!entityId}
                    onChange={(e) => setForm((f) => ({ ...f, [d.field_key]: e.target.value }))}
                  >
                    <option value="">— not set —</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </SelectInput>
                ) : (
                  <TextInput
                    type={d.field_type === 'number' ? 'number' : d.field_type === 'date' ? 'date' : 'text'}
                    step={d.field_type === 'number' ? 'any' : undefined}
                    value={form[d.field_key] ?? ''}
                    disabled={!entityId}
                    onChange={(e) => setForm((f) => ({ ...f, [d.field_key]: e.target.value }))}
                  />
                )}
                {d.help_text && <span className="text-xs text-gray-500">{d.help_text}</span>}
              </Field>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {entityId && (
            <div className="flex items-center gap-3">
              <Btn type="button" variant="success" onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving…' : 'Save extra details'}
              </Btn>
              {okMsg && <span className="text-sm text-emerald-700">{okMsg}</span>}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
};

export default CustomFieldsCard;
