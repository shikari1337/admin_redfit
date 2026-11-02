/**
 * The mapping editor: "which of the ERP's fields is our field?", asked once per feed.
 * Port of the generated console's `screens/erp/Mapping.tsx` onto this admin's kit.
 *
 * Both sides come from the server: our side is the entity's declared fields, their side is
 * every path REAL rows carry, and the conversions on offer are the ones the engine runs.
 * Preview writes nothing and fetches nothing — it runs the candidate mapping over rows
 * already held, so a mapping that drops every row is caught before it costs a night's sync.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Btn, Chip, Field, SectionCard, SelectInput, TextInput, THead, Th, TBody, Tr, Td } from '@/components/erp';
import {
  erpApi, erpConnUrl, errorText, outcomeText, plural, prettyJson, readFieldMaps, readPath,
  type ErpCanonicalField, type ErpConnection, type ErpFieldMap, type ErpMappingState, type ErpPreview,
  type ErpTransform, type ErpTransformSpec,
} from '../../../lib/v2/erp';
import { Code, ErrorNote, Loading, MANAGE, Notice, Pre, useLoad, whyDisabled } from './shared';

const ErpMapping: React.FC<{ c: ErpConnection; feed: string; onChange: () => void }> = ({ c, feed, onChange }) => {
  const nav = useNavigate();
  const key = c.feeds.some((f) => f.key === feed) ? feed : (c.feeds.find((f) => f.entity === 'stock') ?? c.feeds[0])?.key ?? '';
  // Unsaved edits live in the editor; the state is re-read only after a save (`reload`).
  const state = useLoad(() => erpApi.mapping(c.id, key), [c.id, key], !!key);
  if (!c.feeds.length) return <Notice tone="info">This connector declares no feeds, so there is nothing to map.</Notice>;
  const label = c.feeds.find((f) => f.key === key)?.label ?? key;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Feed">
          <SelectInput aria-label="Which feed to map" value={key} onChange={(e) => nav(erpConnUrl(c.id, `mapping/${encodeURIComponent(e.target.value)}`))}>
            {c.feeds.map((f) => <option key={f.key} value={f.key}>{f.label}{f.mapping_saved ? '' : ' (suggested)'}</option>)}
          </SelectInput>
        </Field>
      </div>
      {state.loading && <Loading label="Reading the mapping…" />}
      {!!state.error && <ErrorNote error={state.error} what="The mapping editor" onRetry={() => void state.reload()} />}
      {state.data && !state.loading && (
        <Editor key={`${c.id}:${key}`} id={c.id} label={label} state={state.data} onSaved={() => { void state.reload(); onChange(); }} />
      )}
    </div>
  );
};

export default ErpMapping;

/** `scheme_tiers[0].buy_qty` names the field `scheme_tiers`; the rest is which slot. */
function baseKey(target: string): string {
  const cut = target.search(/[[.]/);
  return cut === -1 ? target : target.slice(0, cut);
}

const toWire = (r: ErpFieldMap): ErpFieldMap => ({ target: r.target.trim(), source: r.source.trim(), transforms: r.transforms });

const OURS = 'erp-canonical-fields';
const THEIRS = 'erp-source-paths';

function Editor({ id, label, state, onSaved }: { id: string; label: string; state: ErpMappingState; onSaved: () => void }) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const saved = useMemo(() => readFieldMaps(state.fields), [state.fields]);
  const [rows, setRows] = useState<ErpFieldMap[]>(saved);
  const [preview, setPreview] = useState<ErpPreview | null>(null);
  // Rows read by a live test, for a feed never fetched (nothing stored to map against). Never saved.
  const [live, setLive] = useState<{ sample: unknown[]; paths: string[] } | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'save' | 'remap' | 'sample'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setRows(saved); setPreview(null); }, [saved]);

  const sample = live?.sample ?? state.sample;
  const available = live?.paths ?? state.available;
  const byKey = useMemo(() => new Map(state.canonical.map((f) => [f.key, f])), [state.canonical]);
  const filled = new Set(rows.filter((r) => r.target.trim()).map((r) => baseKey(r.target)));
  const missing = state.canonical.filter((f) => f.required && !filled.has(f.key));
  const unknown = rows.filter((r) => r.target.trim() && !byKey.has(baseKey(r.target)));
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const noPerm = canManage ? undefined : 'You need the Manage settings permission.';

  const blockedSave = whyDisabled(canManage, [
    missing.length > 0 && `${missing.map((f) => f.label).join(', ')} must be mapped: without them a record cannot be identified.`,
    unknown.length > 0 && `${unknown.map((r) => r.target).join(', ')} is not a field this app has.`,
  ]);
  const blockedPreview = whyDisabled(canManage, [!sample.length && 'There are no rows to try it on yet.']);

  const act = async (which: typeof busy, fn: () => Promise<void>) => {
    setBusy(which);
    setNote(null);
    try { await fn(); } catch (e) { setNote({ ok: false, text: errorText(e) }); } finally { setBusy(''); }
  };

  const fetchSample = () => act('sample', async () => {
    const p = await erpApi.test(id, state.feed);
    if (!p.reachable || !p.sample.length) throw new Error(p.warning || p.message || 'The ERP answered, but with no rows we could read.');
    setLive({ sample: p.sample, paths: p.paths });
    setNote({ ok: true, text: `Read ${plural(p.sample.length, 'row')} to map against. Nothing was saved.` });
  });
  const runPreview = () => act('preview', async () => {
    setPreview(await erpApi.preview(id, state.feed, rows.map(toWire), live ? live.sample : null));
  });
  const save = () => act('save', async () => {
    await erpApi.saveMapping(id, state.feed, rows.map(toWire));
    setNote({ ok: true, text: 'Mapping saved. Every later fetch uses it.' });
    onSaved();
  });
  const remap = () => act('remap', async () => {
    const { run: out, already_running } = await erpApi.remap(id, state.feed);
    if (out.status === 'running') {
      // The server rebuilds in the background now; the Run log shows it to its end.
      setNote({ ok: true, text: already_running
        ? 'A rebuild of this feed is already running. Follow it on the Run log tab.'
        : 'Rebuilding from the rows already held, in the background. Follow it on the Run log tab.' });
    } else if (out.status === 'failed') {
      setNote({ ok: false, text: out.message || 'The rebuild failed.' });
    } else {
      setNote({ ok: true, text: `Rebuilt from the rows already held: ${outcomeText(out)}.` });
    }
    onSaved();
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        <span className="font-medium text-gray-900">{label}</span> fills our <Code>{state.entity}</Code> records.{' '}
        {state.source === 'admin' ? 'This is your own mapping.' : 'This is the connector’s suggestion, until you save your own.'}
      </p>

      {!sample.length && (
        <Notice tone="warn" title="No rows to map against yet">
          <p>This feed has never been fetched, so nothing is stored to show the ERP’s own field names. Read a few rows now — nothing is saved and nothing moves.</p>
          <Btn size="sm" disabled={!canManage || !!busy} title={noPerm} onClick={() => void fetchSample()}>
            {busy === 'sample' ? 'Reading…' : 'Read a few rows'}
          </Btn>
        </Notice>
      )}
      {live && (
        <Notice tone="info" title="Mapping against rows read just now">
          {plural(live.sample.length, 'row')} came straight from the ERP. Saving the mapping makes it count; the next fetch fills the copy.
        </Notice>
      )}
      {missing.length > 0 && (
        <Notice tone="bad" title="This mapping cannot be saved yet">
          {missing.map((f) => f.label).join(', ')} {missing.length === 1 ? 'is' : 'are'} how a record is identified. Without {missing.length === 1 ? 'it' : 'them'} every row would be read and thrown away.
        </Notice>
      )}

      <SectionCard
        title="The mapping"
        action={(
          <span className="flex gap-1.5">
            <Chip tone={state.source === 'admin' ? 'green' : 'amber'}>{state.source === 'admin' ? 'Yours' : 'Suggested'}</Chip>
            {dirty && <Chip tone="amber">Unsaved</Chip>}
          </span>
        )}
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <THead sticky={false}>
              <Th>Our field</Th><Th>Their field</Th><Th>What that looks like</Th><Th>Conversions</Th><Th><span className="sr-only">Remove</span></Th>
            </THead>
            <TBody>
              {rows.map((row, i) => (
                <MapRow
                  key={i}
                  row={row}
                  canonical={state.canonical}
                  transforms={state.transforms}
                  sample={sample}
                  readOnly={!canManage}
                  onChange={(next) => setRows(rows.map((r, j) => (j === i ? next : r)))}
                  onRemove={() => setRows(rows.filter((_, j) => j !== i))}
                />
              ))}
              {!rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">Nothing is mapped. Add a field below.</td></tr>}
            </TBody>
          </table>
        </div>
        <datalist id={OURS}>
          {state.canonical.map((f) => <option key={f.key} value={f.repeated ? `${f.key}[0]` : f.key}>{f.label}</option>)}
        </datalist>
        <datalist id={THEIRS}>
          {available.map((p) => <option key={p} value={p} />)}
        </datalist>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          <Btn variant="outline" size="sm" disabled={!canManage} title={noPerm} onClick={() => setRows([...rows, { target: '', source: '', transforms: [] }])}>
            Add a field
          </Btn>
          <span className="flex-1" />
          <Btn variant="outline" size="sm" disabled={!!blockedPreview || !!busy} title={blockedPreview ?? 'Run this mapping over real rows; nothing is saved'} onClick={() => void runPreview()}>
            {busy === 'preview' ? 'Trying it…' : 'Try it on real rows'}
          </Btn>
          <Btn size="sm" disabled={!!blockedSave || !!busy || !dirty} title={blockedSave ?? (dirty ? undefined : 'Nothing has changed.')} onClick={() => void save()}>
            {busy === 'save' ? 'Saving…' : 'Save the mapping'}
          </Btn>
        </div>
        {blockedSave && canManage && <p className="px-5 pb-3 text-xs text-gray-500">{blockedSave}</p>}
      </SectionCard>

      {note && <Notice tone={note.ok ? 'good' : 'bad'}>{note.text}</Notice>}

      <SectionCard title="Unmapped fields this app understands" description="Anything not mapped is simply not kept. Required fields are marked.">
        <ul className="space-y-2 text-sm">
          {state.canonical.filter((f) => !filled.has(f.key)).map((f) => (
            <li key={f.key} className="flex flex-wrap items-start gap-2">
              <Code>{f.key}</Code>
              <span className="font-medium text-gray-900">{f.label}</span>
              {f.required && <Chip tone="red">required</Chip>}
              {f.repeated && <Chip>repeating</Chip>}
              <span className="basis-full text-xs text-gray-500">{f.description}</span>
              {canManage && (
                <Btn size="sm" variant="ghost" onClick={() => setRows([...rows, { target: f.repeated ? `${f.key}[0]` : f.key, source: '', transforms: [] }])}>
                  Map it
                </Btn>
              )}
            </li>
          ))}
          {state.canonical.every((f) => filled.has(f.key)) && <li className="text-gray-500">Every field is mapped.</li>}
        </ul>
      </SectionCard>

      {preview && <PreviewCard preview={preview} />}

      {state.source === 'admin' && (
        <SectionCard title="Correct what is already stored">
          <p className="text-sm text-gray-700">
            Changing a mapping only changes what later fetches make of the ERP’s rows. Every row ever fetched is still held as it arrived,
            so the corrected mapping can be run over them again — without asking the distributor’s server for any of it.
          </p>
          <Btn className="mt-3" variant="outline" disabled={!canManage || !!busy} title={noPerm} onClick={() => void remap()}>
            {busy === 'remap' ? 'Rebuilding…' : 'Rebuild from the rows already held'}
          </Btn>
        </SectionCard>
      )}
    </div>
  );
}

/* ── one line of the mapping ────────────────────────────────────────────── */

function MapRow({ row, canonical, transforms, sample, readOnly, onChange, onRemove }: {
  row: ErpFieldMap;
  canonical: ErpCanonicalField[];
  transforms: ErpTransformSpec[];
  sample: unknown[];
  readOnly: boolean;
  onChange: (next: ErpFieldMap) => void;
  onRemove: () => void;
}) {
  const field = canonical.find((f) => f.key === baseKey(row.target)) ?? null;
  const example = sample.length ? readPath(sample[0], row.source) : undefined;
  return (
    <Tr className="align-top">
      <Td className="align-top">
        <TextInput aria-label="Our field" list={OURS} value={row.target} disabled={readOnly} placeholder="code" className="w-44"
          onChange={(e) => onChange({ ...row, target: e.target.value })} />
        <div className="mt-1 text-xs">
          {field
            ? <span className="text-gray-500">{field.label} · {field.kind}{field.required ? ' · required' : ''}</span>
            : row.target && <span className="text-red-600">not a field this app has</span>}
        </div>
      </Td>
      <Td className="align-top">
        <TextInput aria-label="Their field" list={THEIRS} value={row.source} disabled={readOnly} placeholder="itemCode" className="w-44"
          onChange={(e) => onChange({ ...row, source: e.target.value })} />
        {!row.source && <div className="mt-1 text-xs text-gray-500">Blank uses the conversions alone.</div>}
      </Td>
      <Td className="align-top">
        {example === undefined ? <span className="text-gray-400">—</span> : <Code>{String(JSON.stringify(example)).slice(0, 60)}</Code>}
      </Td>
      <Td className="align-top">
        <Transforms value={row.transforms} catalogue={transforms} readOnly={readOnly} onChange={(t) => onChange({ ...row, transforms: t })} />
      </Td>
      <Td className="align-top">
        <Btn size="sm" variant="dangerOutline" disabled={readOnly} onClick={onRemove} aria-label={`Remove ${row.target || 'this line'}`}>Remove</Btn>
      </Td>
    </Tr>
  );
}

function argText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (v === null || v === undefined) return '';
  return String(v);
}

function argValue(kind: string, text: string): unknown {
  if (kind === 'list') return text.split(',').map((s) => s.trim()).filter(Boolean);
  if (kind === 'number') {
    const num = Number(text.trim());
    return Number.isFinite(num) ? Math.trunc(num) : 0;
  }
  return text;
}

function Transforms({ value, catalogue, readOnly, onChange }: {
  value: ErpTransform[];
  catalogue: ErpTransformSpec[];
  readOnly: boolean;
  onChange: (next: ErpTransform[]) => void;
}) {
  const add = (op: string) => {
    const spec = catalogue.find((t) => t.op === op);
    if (!spec) return;
    const made: ErpTransform = { op };
    for (const a of spec.args) made[a.key] = a.kind === 'number' ? 0 : a.kind === 'list' ? [] : '';
    onChange([...value, made]);
  };
  return (
    <div className="space-y-2">
      {value.map((t, i) => {
        const spec = catalogue.find((s) => s.op === t.op) ?? null;
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-800" title={spec?.description}>{spec?.label ?? t.op}</span>
              <Btn size="sm" variant="ghost" disabled={readOnly} aria-label={`Remove ${spec?.label ?? t.op}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}>×</Btn>
            </div>
            {(spec?.args ?? []).map((a) => (
              <Field key={a.key} label={a.label}>
                <TextInput
                  value={argText(t[a.key])}
                  disabled={readOnly}
                  inputMode={a.kind === 'number' ? 'numeric' : undefined}
                  placeholder={a.kind === 'list' ? 'one, two, three' : ''}
                  title={a.help}
                  className="h-8 w-full"
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, [a.key]: argValue(a.kind, e.target.value) } : x)))}
                />
              </Field>
            ))}
            {!spec && <span className="text-xs text-red-600">this server does not know this conversion</span>}
          </div>
        );
      })}
      {!readOnly && (
        <SelectInput aria-label="Add a conversion" value="" onChange={(e) => add(e.target.value)} className="h-8 w-full text-xs">
          <option value="">Add a conversion…</option>
          {catalogue.map((t) => <option key={t.op} value={t.op} title={t.description}>{t.label}</option>)}
        </SelectInput>
      )}
    </div>
  );
}

/* ── what the mapping would make of real rows ───────────────────────────── */

function PreviewCard({ preview }: { preview: ErpPreview }) {
  const bad = preview.rows.filter((r) => !r.natural_key || r.rejected.length > 0).length;
  return (
    <SectionCard
      title="What this mapping would make of real rows"
      description="Nothing was fetched and nothing was saved."
      action={bad ? <Chip tone="red">{plural(bad, 'row')} with a problem</Chip> : <Chip tone="green">All {preview.rows.length} read cleanly</Chip>}
    >
      {preview.unkeyed > 0 && (
        <Notice tone="bad" title="Some rows could not be identified" className="mb-3">
          {plural(preview.unkeyed, 'row')} would be read and thrown away, because the fields that identify a record came out empty.
        </Notice>
      )}
      <ul className="max-h-[32rem] divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200">
        {preview.rows.map((r, i) => (
          <li key={i} className={`p-3 ${!r.natural_key || r.rejected.length ? 'bg-red-50/40' : ''}`}>
            <details>
              <summary className="cursor-pointer space-x-2">
                {r.natural_key ? <Code>{r.natural_key}</Code> : <Chip tone="red">could not be identified</Chip>}
                {r.rejected.length > 0 && <Chip tone="amber">{r.rejected.join(', ')} would not convert</Chip>}
              </summary>
              <div className="mt-2 space-y-2">
                <Pre>{prettyJson(r.mapped)}</Pre>
                <details>
                  <summary className="cursor-pointer text-xs text-gray-600">The row exactly as the ERP sent it</summary>
                  <div className="mt-2"><Pre>{prettyJson(r.raw)}</Pre></div>
                </details>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
