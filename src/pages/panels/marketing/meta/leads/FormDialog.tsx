/**
 * New instant form (lane META-15B, META-11 `POST /marketing/meta/leads/forms`): questions, language, the privacy
 * policy link (empty: the server uses the store's own privacy policy page), the thank you screen and a follow up link.
 * Question types and thank you buttons come from `GET /meta/leads/forms/options` (META-9D); there is no copy of them
 * here, so when that route cannot be read the form says so and cannot be sent. Meta checks the rest and its refusal is shown in its own words.
 */
import React, { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { metaLeadsApi, type LeadFormInput, type LeadQuestion } from '@/lib/v2/areas/meta';
import { LoadFailure, useLoad, writeError } from '../common';

/** The groups of the options route, in the order the picker shows them. */
const GROUP_LABEL: Record<string, string> = { contact: 'Contact', address: 'Address', work: 'Work', personal: 'About the person', other: 'Other', custom: 'Your own' };

interface QRow { type: string; label: string; key: string; options: string }
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

const FormDialog: React.FC<{ onClose: () => void; onCreated: (name: string) => void }> = ({ onClose, onCreated }) => {
  const optsQ = useLoad(() => metaLeadsApi.formOptions(), []);
  const opts = optsQ.data;
  const types = opts?.question_types ?? [];
  const typeOf = (k: string) => types.find((t) => t.key === k);
  const groups = [...new Set(types.map((t) => t.group ?? ''))];
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<QRow[]>([
    { type: 'FULL_NAME', label: '', key: '', options: '' },
    { type: 'PHONE', label: '', key: '', options: '' },
    { type: 'EMAIL', label: '', key: '', options: '' },
  ]);
  const [locale, setLocale] = useState('');
  const [privacyUrl, setPrivacyUrl] = useState('');
  const [privacyText, setPrivacyText] = useState('');
  const [tyTitle, setTyTitle] = useState('');
  const [tyBody, setTyBody] = useState('');
  const [tyButton, setTyButton] = useState('');
  const [tyUrl, setTyUrl] = useState('');
  const [tyType, setTyType] = useState('');
  const [tyPhone, setTyPhone] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const problem = (): string => {
    if (!opts) return 'The form options are not loaded yet.';
    if (!name.trim()) return 'Give the form a name.';
    if (!questions.length) return 'Add at least one question.';
    const own = questions.findIndex((q) => typeOf(q.type)?.custom && !q.label.trim());
    if (own >= 0) return `Question ${own + 1} needs its words.`;
    if (opts?.max_questions && questions.length > opts.max_questions) return `A form takes at most ${opts.max_questions} questions.`;
    if ((tyBody.trim() || tyButton.trim() || tyUrl.trim() || tyType) && !tyTitle.trim()) return 'The thank you screen needs a title.';
    if (tyType === 'CALL_BUSINESS' && !tyPhone.trim()) return 'Type the phone number the button calls.';
    return '';
  };

  const input = (): LeadFormInput => ({
    name: name.trim(),
    questions: questions.map((q): LeadQuestion => {
      const own = !!typeOf(q.type)?.custom;
      const opts = q.options.split('\n').map((x) => x.trim()).filter(Boolean);
      return {
        type: q.type,
        ...(own ? { label: q.label.trim(), key: q.key.trim() || slug(q.label) } : {}),
        ...(q.type === 'CUSTOM' && opts.length ? { options: opts.map((v) => ({ key: slug(v), value: v })) } : {}),
      };
    }),
    locale: locale.trim() || null,
    privacy_policy_url: privacyUrl.trim() || null,
    privacy_link_text: privacyText.trim() || null,
    thank_you: tyTitle.trim() ? {
      title: tyTitle.trim(), body: tyBody.trim() || null, button_text: tyButton.trim() || null, website_url: tyUrl.trim() || null,
      button_type: tyType || null, business_phone_number: tyType === 'CALL_BUSINESS' ? tyPhone.trim() || null : null,
    } : null,
    follow_up_action_url: followUp.trim() || null,
  });

  const create = async () => {
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true); setError('');
    try { await metaLeadsApi.createForm(input()); onCreated(name.trim()); }
    catch (e) { setError(writeError(e, 'Meta did not create the form.')); }
    finally { setBusy(false); }
  };
  const setQ = (i: number, patch: Partial<QRow>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New instant form</DialogTitle>
          <DialogDescription>It opens inside Facebook and Instagram when someone taps a lead ad. Every lead goes to your CRM.</DialogDescription>
        </DialogHeader>
        {optsQ.error && !opts && <LoadFailure failure={optsQ.error} what="The form options" onRetry={optsQ.reload} />}
        {optsQ.loading && !opts && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Reading what Meta offers for a form</p>}
        {opts && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div>
              <Label htmlFor="lf-name">Form name</Label>
              <Input id="lf-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoFocus placeholder="For example Free consultation" />
            </div>
            <div>
              <Label htmlFor="lf-locale">Language <span className="font-normal text-gray-500">(optional)</span></Label>
              <Input id="lf-locale" value={locale} onChange={(e) => setLocale(e.target.value.toUpperCase())} className="mt-1 font-mono text-xs" placeholder="EN_US" />
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Questions{opts?.max_questions ? <span className="font-normal text-gray-500"> ({questions.length} of {opts.max_questions})</span> : null}</legend>
            <ol className="mt-2 space-y-2">
              {questions.map((q, i) => {
                const own = !!typeOf(q.type)?.custom;
                return (
                  <li key={i} className="rounded-md border bg-gray-50 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-5 text-xs font-semibold text-gray-500">{i + 1}</span>
                      <select aria-label={`Question ${i + 1} type`} value={q.type} onChange={(e) => setQ(i, { type: e.target.value })} className="h-9 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm sm:max-w-[14rem]">
                        {groups.length > 1 ? groups.map((g) => (
                          <optgroup key={g} label={GROUP_LABEL[g] ?? g}>
                            {types.filter((t) => (t.group ?? '') === g).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                          </optgroup>
                        )) : types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setQuestions(questions.filter((_, j) => j !== i))} className="ml-auto rounded p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {own && (
                      <div className="mt-2 grid gap-2 pl-7 sm:grid-cols-[1fr_10rem]">
                        <Input aria-label={`Question ${i + 1} words`} value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} placeholder="The question, as people read it" />
                        <Input aria-label={`Question ${i + 1} key`} value={q.key} onChange={(e) => setQ(i, { key: e.target.value })} placeholder={q.label ? slug(q.label) : 'Key (optional)'} className="font-mono text-xs" />
                        {q.type === 'CUSTOM' && (
                          <Textarea aria-label={`Question ${i + 1} answers`} rows={2} value={q.options} onChange={(e) => setQ(i, { options: e.target.value })} className="sm:col-span-2"
                            placeholder="Answers to pick from, one per line (empty: people type their own answer)" />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => setQuestions([...questions, { type: 'CUSTOM', label: '', key: '', options: '' }])}><Plus /> Add a question</Button>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lf-privacy">Privacy policy link</Label>
              <Input id="lf-privacy" value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} className="mt-1" inputMode="url" placeholder="Your store's privacy policy page" />
              <p className="mt-1 text-xs text-gray-500">Empty: your store's own privacy policy page.</p>
            </div>
            <div>
              <Label htmlFor="lf-privacy-text">Link text</Label>
              <Input id="lf-privacy-text" value={privacyText} onChange={(e) => setPrivacyText(e.target.value)} className="mt-1" placeholder="For example Privacy policy" maxLength={opts?.privacy_link_text_max || undefined} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-900">Thank you screen <span className="font-normal text-gray-500">(optional)</span></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="lf-ty-title">Title</Label><Input id="lf-ty-title" value={tyTitle} onChange={(e) => setTyTitle(e.target.value)} className="mt-1" placeholder="For example Thank you, we will call you" /></div>
              <div><Label htmlFor="lf-ty-button">Button text</Label><Input id="lf-ty-button" value={tyButton} onChange={(e) => setTyButton(e.target.value)} className="mt-1" placeholder="For example Visit our store" /></div>
            </div>
            <div><Label htmlFor="lf-ty-body">Message</Label><Textarea id="lf-ty-body" rows={2} value={tyBody} onChange={(e) => setTyBody(e.target.value)} className="mt-1" /></div>
            {opts?.button_types.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="lf-ty-type">Button</Label>
                  <select id="lf-ty-type" value={tyType} onChange={(e) => setTyType(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                    <option value="">Default: {opts.button_types.find((b) => b.key === (tyUrl.trim() ? opts.default_button_type_with_website : opts.default_button_type))?.label ?? (tyUrl.trim() ? opts.default_button_type_with_website : opts.default_button_type)}</option>
                    {opts.button_types.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                </div>
                {tyType === 'CALL_BUSINESS' && (
                  <div><Label htmlFor="lf-ty-phone">Phone number it calls</Label><Input id="lf-ty-phone" value={tyPhone} onChange={(e) => setTyPhone(e.target.value)} className="mt-1" inputMode="tel" placeholder="+91" /></div>
                )}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="lf-ty-url">Button link</Label><Input id="lf-ty-url" value={tyUrl} onChange={(e) => setTyUrl(e.target.value)} className="mt-1" inputMode="url" placeholder="https://" /></div>
              <div><Label htmlFor="lf-follow">Follow up link</Label><Input id="lf-follow" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="mt-1" inputMode="url" placeholder="https://" /></div>
            </div>
          </fieldset>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy || !opts}>{busy && <Loader2 className="animate-spin" />} Create form on Meta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FormDialog;
