import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Plus, Loader2, CheckCircle2, Star, RotateCcw, Trash2, Eye } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, Field, TextInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
} from '../../components/erp';

/**
 * Document template designer (migration 070). Plain-language screen:
 * "Make your invoices (and other documents) show your logo and say what you
 * want." Pick a document type → edit its look (logo, header, footer, terms,
 * accent colour, which fields show) with clickable merge-field chips → Save a
 * draft → Publish → make it the Default that actually prints. Old versions are
 * kept so you can roll back.
 */

interface MergeField { key: string; label: string; sample: string }
interface DocTypeOpt { key: string; label: string }
interface ShowFields { hsn: boolean; bankDetails: boolean; signature: boolean }
interface TplConfig { logoUrl: string; headerHtml: string; footerHtml: string; termsText: string; accentColorHex: string; showFields: ShowFields }
interface Tpl { id: string; doc_type: string; name: string; is_default: boolean; published: boolean; version: number; config: TplConfig }

const DocumentTemplates: React.FC = () => {
  const [docTypes, setDocTypes] = useState<DocTypeOpt[]>([]);
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const [defaultConfig, setDefaultConfig] = useState<TplConfig | null>(null);
  const [docType, setDocType] = useState('invoice');
  const [list, setList] = useState<Tpl[] | null>(null);
  const [sel, setSel] = useState<Tpl | null>(null);
  const [name, setName] = useState('');
  const [cfg, setCfg] = useState<TplConfig | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [msg, setMsg] = useState(''); const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // which text box a merge-field chip inserts into
  const activeField = useRef<'headerHtml' | 'footerHtml' | 'termsText'>('termsText');

  const fail = (e: any) => setMsg(e?.response?.data?.message ?? e.message);
  const flash = (m: string) => { setOkMsg(m); setTimeout(() => setOkMsg(''), 4000); };

  useEffect(() => {
    api.get('/document-templates/meta').then((r) => {
      const d = payload<any>(r);
      setDocTypes(d.docTypes ?? []); setMergeFields(d.mergeFields ?? []); setDefaultConfig(d.defaultConfig ?? null);
    }).catch(fail);
  }, []);

  const loadList = (dt: string) => api.get('/document-templates', { params: { docType: dt } })
    .then((r) => setList(payload<Tpl[]>(r) ?? [])).catch(fail);
  useEffect(() => { setList(null); setSel(null); setCfg(null); setPreview(null); loadList(docType); }, [docType]);

  const startNew = () => {
    setSel(null); setName(''); setPreview(null);
    setCfg(defaultConfig ? { ...defaultConfig, showFields: { ...defaultConfig.showFields } } : null);
    setMsg(''); setOkMsg('');
  };
  const openTpl = (t: Tpl) => {
    setSel(t); setName(t.name);
    setCfg({ ...t.config, showFields: { ...t.config.showFields } });
    setPreview(null); setMsg(''); setOkMsg('');
  };

  const setCfgField = (k: keyof TplConfig, v: any) => setCfg((c) => (c ? { ...c, [k]: v } : c));
  const insertChip = (key: string) => {
    const f = activeField.current;
    setCfg((c) => (c ? { ...c, [f]: `${c[f] ?? ''}{{${key}}}` } : c));
  };

  const saveDraft = async () => {
    if (!cfg || !name.trim()) { setMsg('Give the template a name.'); return; }
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      if (sel && !sel.published) {
        await api.put(`/document-templates/${sel.id}`, { name: name.trim(), config: cfg });
        flash('Draft saved.');
      } else {
        const r = payload<Tpl>(await api.post('/document-templates', { docType, name: name.trim(), config: cfg }));
        flash('Draft created. Publish it when you are happy, then set it as the default.');
        if (r?.id) openTpl(r);
      }
      loadList(docType);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const act = async (path: string, done: string) => {
    if (!sel) return;
    setBusy(true); setMsg(''); setOkMsg('');
    try { await api.post(`/document-templates/${sel.id}/${path}`); flash(done); await loadList(docType); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const runPreview = async () => {
    if (!cfg) return;
    setBusy(true); setMsg('');
    try { setPreview(payload<any>(await api.post('/document-templates/preview', { docType, config: cfg }))); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const del = async (t: Tpl) => {
    setBusy(true); setMsg('');
    try { await api.delete(`/document-templates/${t.id}`); flash('Template deleted.'); if (sel?.id === t.id) startNew(); loadList(docType); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const editable = !sel || !sel.published; // published rows are frozen snapshots
  const currentLabel = useMemo(() => docTypes.find((d) => d.key === docType)?.label ?? docType, [docTypes, docType]);

  return (
    <Page>
      <PageHeader
        title="Document Templates"
        icon={FileText}
        description="Design how your printed documents look — logo, header, footer, terms, accent colour. Use the merge-field chips to drop in live values like the customer's name. Publish a version, then make it the Default that prints."
        actions={<Btn onClick={startNew}><Plus className="h-4 w-4" />New template</Btn>}
      />
      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{okMsg}</div>}

      {/* doc-type picker */}
      <div className="flex flex-wrap gap-1.5">
        {docTypes.map((d) => (
          <button key={d.key} onClick={() => setDocType(d.key)}
            className={`rounded-full border px-3 py-1 text-sm ${docType === d.key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        {/* list */}
        <TableShell>
          <table className="w-full text-sm">
            <THead><Th>{currentLabel} templates</Th><Th>State</Th><Th> </Th></THead>
            <TBody>
              {list == null ? (
                <EmptyRow colSpan={3}>Loading…</EmptyRow>
              ) : list.length === 0 ? (
                <EmptyRow colSpan={3}><EmptyState title="No templates yet" description="Create one — until then this document prints with the built-in default layout." /></EmptyRow>
              ) : list.map((t) => (
                <Tr key={t.id} className={`cursor-pointer ${sel?.id === t.id ? 'bg-gray-50' : ''}`} onClick={() => openTpl(t)}>
                  <Td>{t.name}{' '}<span className="text-xs text-gray-400">v{t.version}</span></Td>
                  <Td>
                    {t.is_default && <Chip tone="green">Default</Chip>}
                    {!t.published && <Chip tone="amber">Draft</Chip>}
                    {t.published && !t.is_default && <Chip tone="blue">Published</Chip>}
                  </Td>
                  <Td>{!t.is_default && <button className="text-red-600" onClick={(e) => { e.stopPropagation(); del(t); }}><Trash2 className="h-4 w-4" /></button>}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>

        {/* editor */}
        {cfg ? (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800">
                {sel ? (sel.published ? `Published v${sel.version}` : 'Editing draft') : 'New template'}
                {sel?.is_default && <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-700"><Star className="h-3 w-3" />prints by default</span>}
              </h3>
              <div className="flex flex-wrap gap-2">
                {editable && <Btn variant="success" disabled={busy} onClick={saveDraft}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save draft</Btn>}
                {sel && !sel.published && <Btn variant="outline" disabled={busy} onClick={() => act('publish', `Published version.`)}>Publish</Btn>}
                {sel && sel.published && !sel.is_default && <Btn variant="outline" disabled={busy} onClick={() => act('set-default', 'This version now prints by default.')}><Star className="h-4 w-4" />Set default</Btn>}
                {sel && sel.published && !sel.is_default && <Btn variant="ghost" disabled={busy} onClick={() => act('rollback', 'Rolled back to this version.')}><RotateCcw className="h-4 w-4" />Roll back to this</Btn>}
                <Btn variant="ghost" disabled={busy} onClick={runPreview}><Eye className="h-4 w-4" />Preview</Btn>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Template name"><TextInput value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} placeholder="e.g. Default invoice" /></Field>
              <Field label="Logo image URL"><TextInput value={cfg.logoUrl} disabled={!editable} onChange={(e) => setCfgField('logoUrl', e.target.value)} placeholder="https://…/logo.png" /></Field>
              <Field label="Accent colour">
                <div className="flex items-center gap-2">
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.accentColorHex) ? cfg.accentColorHex : '#1F3A5F'} disabled={!editable}
                    onChange={(e) => setCfgField('accentColorHex', e.target.value)} className="h-9 w-12 rounded border" />
                  <TextInput value={cfg.accentColorHex} disabled={!editable} onChange={(e) => setCfgField('accentColorHex', e.target.value)} className="w-28" />
                </div>
              </Field>
              <Field label="Show on the document">
                <div className="flex flex-wrap gap-3 text-sm">
                  {(['hsn', 'bankDetails', 'signature'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" disabled={!editable} checked={cfg.showFields[k]}
                        onChange={(e) => setCfgField('showFields', { ...cfg.showFields, [k]: e.target.checked })} />
                      {k === 'hsn' ? 'HSN column' : k === 'bankDetails' ? 'Bank details' : 'Signature line'}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            {/* merge-field chips */}
            {editable && (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                <div className="mb-1 text-xs text-gray-500">Click a field to drop it into the box you last clicked (header / footer / terms):</div>
                <div className="flex flex-wrap gap-1">
                  {mergeFields.map((f) => (
                    <button key={f.key} onClick={() => insertChip(f.key)}
                      className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs hover:bg-gray-100" title={f.label}>
                      {`{{${f.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(['headerHtml', 'footerHtml', 'termsText'] as const).map((k) => (
              <Field key={k} label={k === 'headerHtml' ? 'Header' : k === 'footerHtml' ? 'Footer' : 'Terms & conditions'}>
                <textarea rows={k === 'termsText' ? 3 : 2} value={cfg[k]} disabled={!editable}
                  onFocus={() => { activeField.current = k; }}
                  onChange={(e) => setCfgField(k, e.target.value)}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm disabled:bg-gray-50"
                  placeholder={k === 'termsText' ? 'e.g. Payment due within {{terms_days}} days of invoice.' : ''} />
              </Field>
            ))}

            {preview && (
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm" style={{ borderTopColor: cfg.accentColorHex, borderTopWidth: 3 }}>
                <div className="mb-1 text-xs font-semibold uppercase text-gray-400">Preview (with sample data)</div>
                {preview.header && <div className="font-medium">{preview.header}</div>}
                {preview.footer && <div className="text-gray-600">{preview.footer}</div>}
                {preview.terms && <div className="mt-1 text-gray-600">{preview.terms}</div>}
                {!preview.header && !preview.footer && !preview.terms && <div className="text-gray-400">Nothing to preview yet — add some header / footer / terms text.</div>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-8 text-sm text-gray-500">
            Pick a template on the left, or click “New template”.
          </div>
        )}
      </div>
    </Page>
  );
};

export default DocumentTemplates;
