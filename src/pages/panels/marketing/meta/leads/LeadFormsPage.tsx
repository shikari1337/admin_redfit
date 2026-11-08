/**
 * Marketing > Ads > Lead forms (`/panel/marketing/ads/leads`, lane META-15B, META-11): the instant forms on the
 * store's Facebook Page (list, create, archive) and the leads they brought, read from the CRM's intake journal (not a
 * copy). It opens with what to act on: a form whose leads Meta stopped giving (Meta's words), leads not yet in a deal.
 * A lead opens its contact in the CRM (`productUrl('crm', '/contacts?party=...')`; the CRM's Contacts page reads `party`).
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ExternalLink, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusChip } from '@/components/erp';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { useTabParam } from '@/components/messaging/common';
import { useToast } from '@/hooks/use-toast';
import { productUrl } from '@/lib/menu';
import { metaLeadsApi, type LeadForm, type MetaLead } from '@/lib/v2/areas/meta';
import { formatDateTime } from '@/utils/date';
import MetaHeader from '../MetaHeader';
import { Lead, LoadFailure, Section, StateChip, ago, linkCls, num, plural, useLoad, writeError } from '../common';
import { useMetaCtx } from '../useMetaCtx';
import { ADS_ROUTES, connectionsHref, metaHref } from '../routes';
import FormDialog from './FormDialog';

const PAGE = 25;
const crmHref = (partyId: string) => productUrl('crm', `/contacts?party=${encodeURIComponent(partyId)}`);
const isActive = (f: LeadForm) => (f.status ?? 'ACTIVE').toUpperCase() !== 'ARCHIVED';
const statusWord = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const LeadFormsPage: React.FC = () => {
  const ctx = useMetaCtx();
  const { toast } = useToast();
  const [tab, setTab] = useTabParam(['forms', 'leads'] as const, 'forms');
  const formsQ = useLoad(() => metaLeadsApi.forms(), []);
  // The latest leads, read once for "what to act on" (the Leads tab pages on its own).
  const recentQ = useLoad(() => metaLeadsApi.leads({ limit: 100 }), []);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<LeadForm | null>(null);
  const [formFilter, setFormFilter] = useState('');
  const can = ctx.can.marketing;

  const forms = formsQ.data?.rows ?? [];
  const failing = forms.filter((f) => isActive(f) && f.last_read_status === 'failed');
  const recent = recentQ.data?.rows ?? [];
  const noDeal = recent.filter((l) => !l.deal_id);
  const noPage = formsQ.data && !formsQ.data.page_id;

  const showLeads = (formId: string) => { setFormFilter(formId); setTab('leads'); };

  return (
    <div className="space-y-5">
      <MetaHeader title="Lead forms" setup={ctx.setup}
        description="Instant forms people fill in without leaving Facebook or Instagram. Every lead goes to your CRM; use a form in a Leads ad."
        actions={(
          <>
            {can && !noPage && <Button size="sm" onClick={() => setCreating(true)}><Plus /> New form</Button>}
            <Button size="sm" variant="outline" asChild><Link to={metaHref(ADS_ROUTES.create)}>Create a lead ad</Link></Button>
          </>
        )} />

      {noPage ? (
        <Lead tone="warn" title="Pick the Facebook Page for lead ads first"
          actions={<Button size="sm" variant="outline" className="bg-white" asChild><Link to={connectionsHref('meta')}>Open the Meta connection</Link></Button>}>
          Lead forms live on a Facebook Page. Pick it on the Meta connection, then come back.
        </Lead>
      ) : (
        <>
          {failing.map((f) => (
            <Lead key={f.id} tone="bad" title={`Leads from ${f.name ?? f.id} are not being read`}
              actions={<Button size="sm" variant="outline" className="bg-white" asChild><Link to={connectionsHref('meta')}>Open the Meta connection</Link></Button>}>
              The last read failed {ago(f.last_read_at)}: {f.last_read_error ?? 'no reason given'} Leads wait at Meta; they are read again on the next hourly pass once this is fixed.
            </Lead>
          ))}
          {noDeal.length > 0 && (
            <Lead tone="info" title={`${plural(noDeal.length, 'lead')} not in a deal yet`}
              actions={<Button size="sm" variant="outline" className="bg-white" onClick={() => setTab('leads')}>See the leads</Button>}>
              Of the latest {num(recent.length)}. Open each in the CRM to call them back and start a deal.
            </Lead>
          )}
          {!failing.length && !noDeal.length && formsQ.data && recentQ.data && (
            <Lead tone="good" title="Every form is read and every lead is in a deal">New leads reach your CRM as Meta sends them.</Lead>
          )}
        </>
      )}

      <Segmented label="Show" value={tab} onChange={(k) => setTab(k as 'forms' | 'leads')}
        options={[{ key: 'forms', label: `Forms${forms.length ? ` (${forms.filter(isActive).length})` : ''}` }, { key: 'leads', label: `Leads${recentQ.data ? ` (${num(recentQ.data.total)})` : ''}` }]} />

      {tab === 'forms' ? (
        <Section title={formsQ.data?.page_name ? `Forms on ${formsQ.data.page_name}` : 'Forms'} hint="Meta cannot delete a form; archive it so it takes no new leads.">
          {formsQ.error && !formsQ.data ? <LoadFailure failure={formsQ.error} what="Lead forms (GET /api/v2/marketing/meta/leads/forms) are not served yet." onRetry={formsQ.reload} />
            : !formsQ.data ? <p className="text-sm text-gray-500">Loading forms...</p>
              : !forms.length ? <p className="text-sm text-gray-600">No forms yet.{can && !noPage ? ' Make the first one with New form.' : ''}</p> : (
                <FormsList forms={forms} can={can} onLeads={showLeads} onArchive={setArchiving} />
              )}
        </Section>
      ) : (
        <LeadsSection forms={forms} formId={formFilter} onForm={setFormFilter} />
      )}

      {creating && <FormDialog onClose={() => setCreating(false)} onCreated={(n) => { setCreating(false); toast({ title: `${n} is on your Page` }); formsQ.reload(); }} />}
      {archiving && <ArchiveDialog form={archiving} onClose={() => setArchiving(null)} onDone={() => { setArchiving(null); formsQ.reload(); }} />}
    </div>
  );
};

const FormsList: React.FC<{ forms: LeadForm[]; can: boolean; onLeads: (id: string) => void; onArchive: (f: LeadForm) => void }> = ({ forms, can, onLeads, onArchive }) => {
  const sorted = [...forms].sort((a, b) => Number(isActive(b)) - Number(isActive(a)));
  return (
    <ul className="-my-3 divide-y">
      {sorted.map((f) => (
        <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1 basis-60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-900">{f.name ?? 'Untitled form'}</span>
              {isActive(f) ? <StateChip tone="good">Active</StateChip> : <StateChip tone="neutral">Archived</StateChip>}
              {f.locale && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{f.locale}</span>}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">Form {f.id}{f.created_time ? `, made ${formatDateTime(f.created_time)}` : ''}</p>
          </div>
          <div className="w-32 text-sm">
            <p className="text-xs text-gray-500">Leads</p>
            <p className="font-medium tabular-nums">{num(f.leads_captured)}{f.leads_seen != null && f.leads_seen !== f.leads_captured ? <span className="text-xs font-normal text-gray-500"> of {num(f.leads_seen)}</span> : null}</p>
          </div>
          <div className="w-44 text-sm">
            <p className="text-xs text-gray-500">Last read</p>
            <p className={f.last_read_status === 'failed' ? 'font-medium text-red-700' : 'text-gray-900'}>{f.last_read_at ? ago(f.last_read_at) : 'Not yet'}{f.last_read_status === 'failed' ? ', failed' : ''}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-52 sm:justify-end">
            <Button size="sm" variant="outline" onClick={() => onLeads(f.id)}>See leads</Button>
            {can && isActive(f) && <Button size="sm" variant="ghost" onClick={() => onArchive(f)}><Archive /> Archive</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
};

const ArchiveDialog: React.FC<{ form: LeadForm; onClose: () => void; onDone: () => void }> = ({ form, onClose, onDone }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await metaLeadsApi.archiveForm(form.id); toast({ title: `${form.name ?? 'The form'} is archived` }); onDone(); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'The form was not archived.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Archive {form.name ?? 'this form'}?</DialogTitle>
          <DialogDescription>Meta cannot delete a form. Archived, it takes no new leads. The {num(form.leads_captured)} leads already received stay in your CRM.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Keep it</Button>
          <Button variant="destructive" onClick={go} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Archive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LeadsSection: React.FC<{ forms: LeadForm[]; formId: string; onForm: (id: string) => void }> = ({ forms, formId, onForm }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const q = useLoad(() => metaLeadsApi.leads({ form_id: formId || undefined, from: from || undefined, to: to || undefined, limit: PAGE, offset }), [formId, from, to, offset]);
  const formName = useMemo(() => new Map(forms.map((f) => [f.id, f.name ?? f.id])), [forms]);
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const reset = (f: () => void) => { f(); setOffset(0); };
  const nameOf = (l: MetaLead) => l.form?.name ?? (l.form?.id ? formName.get(l.form.id) ?? l.form.id : 'Unknown form');

  return (
    <Section title="Leads" hint="Read from your CRM, newest first. A lead opens its contact in the CRM.">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,16rem)_10rem_10rem]">
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="ld-form">Form</Label>
          <select id="ld-form" value={formId} onChange={(e) => reset(() => onForm(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
            <option value="">Every form</option>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.name ?? f.id}{isActive(f) ? '' : ' (archived)'}</option>)}
          </select>
        </div>
        <div><Label htmlFor="ld-from">From</Label><Input id="ld-from" type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} className="mt-1" /></div>
        <div><Label htmlFor="ld-to">To</Label><Input id="ld-to" type="date" value={to} min={from || undefined} onChange={(e) => reset(() => setTo(e.target.value))} className="mt-1" /></div>
      </div>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="Leads (GET /api/v2/marketing/meta/leads) are not served yet." onRetry={q.reload} />
        : !q.data ? <p className="text-sm text-gray-500">Loading leads...</p>
          : !rows.length ? <p className="text-sm text-gray-600">No leads{formId || from || to ? ' for these choices' : ' yet'}.</p> : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-gray-500">
                    <tr className="border-b"><th className="py-2 pr-3 font-medium">Received</th><th className="py-2 pr-3 font-medium">Name</th><th className="py-2 pr-3 font-medium">Form</th><th className="py-2 pr-3 font-medium">Ad</th><th className="py-2 pr-3 font-medium">Campaign</th><th className="py-2 pr-3 font-medium">In the CRM</th><th className="py-2 font-medium" /></tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((l) => (
                      <tr key={l.capture_id} className="align-top">
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatDateTime(l.meta_created_at ?? l.created_at)}</td>
                        <td className="py-2 pr-3 font-medium text-gray-900">{l.name ?? <span className="font-normal text-gray-500">No name given</span>}</td>
                        <td className="py-2 pr-3">{nameOf(l)}</td>
                        <td className="py-2 pr-3">{l.ad?.name ?? (l.ad?.id ? <span className="font-mono text-xs">{l.ad.id}</span> : <span className="text-gray-500">Not from an ad</span>)}</td>
                        <td className="py-2 pr-3">{l.campaign?.name ?? (l.campaign?.id ? <span className="font-mono text-xs text-gray-600">{l.campaign.id}</span> : '')}</td>
                        <td className="py-2 pr-3"><StatusChip status={l.status} label={statusWord(l.status)} />{l.deal_id && <span className="ml-1.5 text-xs text-gray-500">deal</span>}</td>
                        <td className="py-2 text-right">{l.party_id && <a className={`${linkCls} inline-flex items-center gap-1 whitespace-nowrap`} href={crmHref(l.party_id)}>Open in CRM <ExternalLink className="h-3 w-3" /></a>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="-my-2 divide-y md:hidden">
                {rows.map((l) => (
                  <li key={l.capture_id} className="py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-medium">{l.name ?? 'No name given'}</span>
                      <StatusChip status={l.status} label={statusWord(l.status)} />
                    </div>
                    <p className="text-xs text-gray-600">{nameOf(l)}{l.campaign?.name ? `, ${l.campaign.name}` : ''}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(l.meta_created_at ?? l.created_at)}{l.ad?.name ? `, ${l.ad.name}` : l.ad?.id ? `, ad ${l.ad.id}` : ', not from an ad'}</p>
                    {l.party_id && <a className={`${linkCls} mt-1 inline-flex items-center gap-1 text-sm`} href={crmHref(l.party_id)}>Open in CRM <ExternalLink className="h-3 w-3" /></a>}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                <span className="text-gray-600">{num(offset + 1)} to {num(Math.min(offset + rows.length, total))} of {num(total)}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={offset === 0 || q.loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</Button>
                  <Button size="sm" variant="outline" disabled={offset + rows.length >= total || q.loading} onClick={() => setOffset(offset + PAGE)}>Older</Button>
                </div>
              </div>
            </>
          )}
    </Section>
  );
};

export default LeadFormsPage;
