import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, SlidersHorizontal, EyeOff, Eye, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, Btn, SectionCard, Field, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Chip, ExportMenu, type CsvColumn,
} from '../../components/erp';

/**
 * CUSTOM FIELDS — "the box the software didn't have" (spec Part I §19; backend
 * migration 084 + db/queries/customFields.ts).
 *
 * The whole page is one sentence, repeated:
 *    "On every [Vendor] add a [text] field called [License number]."
 *
 * Below the sentence sits the list of fields already defined for the chosen
 * record type: what it is, whether it is required, how many records have
 * answered it, and a Hide switch. HIDING IS NOT DELETING — the saved answers are
 * kept, which the page says out loud, because an owner who hides a field by
 * mistake must not lose last year's data.
 *
 * The fields themselves appear on the record's own screen through the reusable
 * `<CustomFieldsCard />` widget (mounted today on the vendor edit page).
 */

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

interface FieldDef {
  id: string;
  entity_type: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  help_text: string | null;
  required: boolean;
  show_in_list: boolean;
  sort_order: number;
  active: boolean;
}

interface Meta {
  entityTypes: Array<{ key: string; label: string }>;
  fieldTypes: Array<{ key: FieldType; label: string }>;
}

/** Where each record type's fields currently show up in the admin. */
const WHERE_IT_SHOWS: Record<string, string> = {
  vendor: 'Shows on the vendor edit screen (Vendors → edit a vendor).',
  product: 'Stored and available through the API; the product form widget is a follow-up.',
  customer: 'Stored and available through the API; the customer screen widget is a follow-up.',
  order: 'Stored and available through the API; the order screen widget is a follow-up.',
  grn: 'Stored and available through the API; the goods-receipt widget is a follow-up.',
  consignment_partner: 'Stored and available through the API; the partner screen widget is a follow-up.',
};

const emptyDraft = {
  label: '',
  fieldKey: '',
  fieldType: 'text' as FieldType,
  options: '',
  helpText: '',
  required: false,
  showInList: false,
  sortOrder: 0,
};

const CustomFields: React.FC = () => {
  const { hasPerm } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [entityType, setEntityType] = useState('vendor');
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [usage, setUsage] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [editing, setEditing] = useState<FieldDef | null>(null);

  const entityLabel = useMemo(
    () => meta?.entityTypes.find((e) => e.key === entityType)?.label ?? entityType,
    [meta, entityType]
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [m, all] = await Promise.all([
        api.get('/custom-fields/meta'),
        api.get('/custom-fields/defs/all', { params: { includeInactive: true } }),
      ]);
      setMeta(payload<Meta>(m));
      const data = payload<{ defs: FieldDef[]; usage: Record<string, Record<string, number>> }>(all);
      setDefs(data?.defs ?? []);
      setUsage(data?.usage ?? {});
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load custom fields.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const rows = defs.filter((d) => d.entity_type === entityType)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  const resetDraft = () => { setDraft({ ...emptyDraft }); setEditing(null); };

  const submit = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body: any = {
        entityType,
        label: draft.label,
        fieldType: draft.fieldType,
        helpText: draft.helpText || null,
        required: draft.required,
        showInList: draft.showInList,
        sortOrder: Number(draft.sortOrder) || 0,
      };
      if (draft.fieldType === 'select') body.options = draft.options;
      if (editing) {
        await api.put(`/custom-fields/defs/${editing.id}`, { ...body, active: true });
        setNotice(`"${draft.label}" updated.`);
      } else {
        if (draft.fieldKey.trim()) body.fieldKey = draft.fieldKey.trim();
        await api.post('/custom-fields/defs', body);
        setNotice(`"${draft.label}" added to every ${entityLabel.toLowerCase()}.`);
      }
      resetDraft();
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not save the field.');
    } finally {
      setSaving(false);
    }
  };

  const hide = async (d: FieldDef) => {
    setError('');
    setNotice('');
    try {
      const res = await api.delete(`/custom-fields/defs/${d.id}`);
      const kept = payload<{ retainedValues?: number }>(res)?.retainedValues ?? 0;
      setNotice(`"${d.label}" is now hidden. ${kept} saved answer(s) were kept.`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not hide the field.');
    }
  };

  const unhide = async (d: FieldDef) => {
    setError('');
    setNotice('');
    try {
      await api.put(`/custom-fields/defs/${d.id}`, { active: true });
      setNotice(`"${d.label}" is visible again — its old answers are back too.`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not un-hide the field.');
    }
  };

  const startEdit = (d: FieldDef) => {
    setEditing(d);
    setDraft({
      label: d.label,
      fieldKey: d.field_key,
      fieldType: d.field_type,
      options: (d.options ?? []).join('\n'),
      helpText: d.help_text ?? '',
      required: d.required,
      showInList: d.show_in_list,
      sortOrder: d.sort_order,
    });
  };

  if (loading) {
    return (
      <Page width="wide">
        <div className="flex items-center gap-2 py-16 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading custom fields…
        </div>
      </Page>
    );
  }

  const typeLabel = (t: FieldType) => meta?.fieldTypes.find((f) => f.key === t)?.label ?? t;

  const exportCols: CsvColumn<FieldDef>[] = [
    { key: 'label', label: 'Field' },
    { key: 'field_type', label: 'Type', format: (d) => typeLabel(d.field_type) },
    { key: 'field_key', label: 'Key' },
    { key: 'required', label: 'Required', format: (d) => (d.required ? 'Yes' : 'No') },
    { key: 'usage', label: 'Records answered', format: (d) => usage[d.entity_type]?.[d.field_key] ?? 0 },
    { key: 'active', label: 'Status', format: (d) => (d.active ? 'Visible' : 'Hidden (answers kept)') },
    { key: 'show_in_list', label: 'Show in list', format: (d) => (d.show_in_list ? 'Yes' : 'No') },
    { key: 'sort_order', label: 'Order' },
    { key: 'help_text', label: 'Hint', format: (d) => d.help_text ?? '' },
  ];

  return (
    <Page width="wide">
      <PageHeader
        title="Custom Fields"
        icon={SlidersHorizontal}
        description="Every business has that one thing the software has no box for — a licence number on a supplier, a referral source on a customer. Add your own boxes here and they appear on that record's screen."
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      )}

      {/* ── the sentence ───────────────────────────────────────────────────── */}
      <SectionCard
        title={editing ? `Edit "${editing.label}"` : 'Add a field'}
        description="Read it as a sentence — it does exactly what it says."
        action={editing ? <Btn variant="ghost" onClick={resetDraft}>Cancel edit</Btn> : undefined}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 text-sm text-gray-700">
            <span className="pb-2">On every</span>
            <Field>
              <SelectInput
                value={entityType}
                disabled={!!editing}
                onChange={(e) => { setEntityType(e.target.value); resetDraft(); }}
                className="min-w-[13rem]"
              >
                {meta?.entityTypes.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </SelectInput>
            </Field>
            <span className="pb-2">add a</span>
            <Field>
              <SelectInput
                value={draft.fieldType}
                onChange={(e) => setDraft((d) => ({ ...d, fieldType: e.target.value as FieldType }))}
                className="min-w-[11rem]"
              >
                {meta?.fieldTypes.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </SelectInput>
            </Field>
            <span className="pb-2">field called</span>
            <Field>
              <TextInput
                value={draft.label}
                placeholder="License number"
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                className="min-w-[16rem]"
              />
            </Field>
          </div>

          {draft.fieldType === 'select' && (
            <Field label="The choices (one per line)">
              <textarea
                value={draft.options}
                onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))}
                rows={4}
                placeholder={'Cold chain\nAmbient\nFrozen'}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Hint under the box (optional)">
              <TextInput
                value={draft.helpText}
                placeholder="As printed on the drug licence"
                onChange={(e) => setDraft((d) => ({ ...d, helpText: e.target.value }))}
              />
            </Field>
            <Field label="Order on the form">
              <TextInput
                type="number"
                value={String(draft.sortOrder)}
                onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))}
              />
            </Field>
            {!editing && (
              <Field label="Key (optional — made from the name)">
                <TextInput
                  value={draft.fieldKey}
                  placeholder="license_number"
                  onChange={(e) => setDraft((d) => ({ ...d, fieldKey: e.target.value }))}
                  className="font-mono"
                />
              </Field>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span>Must be filled in</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.showInList}
                onChange={(e) => setDraft((d) => ({ ...d, showInList: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span>Suggest as a list column</span>
            </label>
          </div>

          <p className="text-xs text-gray-500">
            "Must be filled in" applies from now on: it is asked for whenever someone fills this field in, and it
            never blocks records saved before the field existed.
          </p>

          <div className="flex items-center gap-3">
            <Btn onClick={submit} disabled={saving || !draft.label.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing ? 'Save changes' : `Add to every ${entityLabel.toLowerCase()}`}
            </Btn>
            <span className="text-sm text-gray-500">
              Reads as: On every <strong>{entityLabel}</strong> add a <strong>{typeLabel(draft.fieldType)}</strong>{' '}
              field called <strong>{draft.label || '…'}</strong>.
            </span>
          </div>
        </div>
      </SectionCard>

      {/* ── the fields already defined ─────────────────────────────────────── */}
      <SectionCard
        title={`Fields on every ${entityLabel.toLowerCase()}`}
        description={WHERE_IT_SHOWS[entityType]}
        flush
        action={<ExportMenu filename={`custom-fields-${entityType}`} columns={exportCols} rows={rows} canExport={hasPerm('settings.manage')} />}
      >
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Field</Th>
              <Th>Type</Th>
              <Th>Key</Th>
              <Th num>Records answered</Th>
              <Th>Status</Th>
              <Th num>Actions</Th>
            </THead>
            <TBody>
            {!rows.length && (
              <EmptyRow colSpan={6}>
                No extra fields on a {entityLabel.toLowerCase()} yet — add one above.
              </EmptyRow>
            )}
            {rows.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <div className="font-medium text-gray-900">
                    {d.label}
                    {d.required && <span className="ml-1 text-red-600">*</span>}
                  </div>
                  {d.help_text && <div className="text-xs text-gray-500">{d.help_text}</div>}
                  {d.field_type === 'select' && !!d.options?.length && (
                    <div className="mt-0.5 text-xs text-gray-500">Choices: {d.options.join(', ')}</div>
                  )}
                </Td>
                <Td>{typeLabel(d.field_type)}</Td>
                <Td className="font-mono text-xs text-gray-500">{d.field_key}</Td>
                <Td num>{usage[d.entity_type]?.[d.field_key] ?? 0}</Td>
                <Td>
                  {d.active
                    ? <Chip tone="green">Visible</Chip>
                    : <Chip tone="neutral">Hidden (answers kept)</Chip>}
                </Td>
                <Td num>
                  <div className="flex justify-end gap-2">
                    <Btn size="sm" variant="outline" onClick={() => startEdit(d)}>Edit</Btn>
                    {d.active ? (
                      <Btn size="sm" variant="dangerOutline" onClick={() => hide(d)}>
                        <EyeOff className="h-4 w-4" /> Hide
                      </Btn>
                    ) : (
                      <Btn size="sm" variant="outline" onClick={() => unhide(d)}>
                        <Eye className="h-4 w-4" /> Un-hide
                      </Btn>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      <p className="text-xs text-gray-500">
        A field's key never changes once created — the saved answers point at it by name. Rename the visible name
        freely; to change the key, add a new field. Hiding a field keeps every answer, so nothing is ever lost by
        switching one off.
      </p>
    </Page>
  );
};

export default CustomFields;
