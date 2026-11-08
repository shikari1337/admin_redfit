/**
 * Marketing > Inbox > Messenger settings (`/panel/marketing/inbox/settings`, lane META-15B, META-13
 * `GET|PUT /comms/inbox/settings`, `POST /comms/inbox/settings/push`): the greeting, the ice breakers and the
 * persistent menu people see when they open a chat with the store's Page, and on Instagram when switched on. Saving
 * stores them and pushes them to Meta; a refused push keeps the save and shows Meta's own words per platform. Meta's
 * limits are checked by the server (it answers in words), so no count or length is typed here.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { INBOX_CHANNEL_LABEL, messagingAPI, type InboxChannel, type InboxSettings, type MessengerProfile } from '@/lib/v2/messaging';
import { metaApi } from '@/lib/v2/areas/meta';
import MetaHeader from '../MetaHeader';
import { Lead, LoadFailure, Section, StateChip, ago, linkCls, useLoad, writeError } from '../common';
import { SOCIAL_ROUTES, metaHref } from '../routes';

type Menu = MessengerProfile['persistent_menu'][number];
type Breakers = MessengerProfile['ice_breakers'][number];

const platformName = (p: string) => INBOX_CHANNEL_LABEL[p as InboxChannel] ?? p;
/** Meta's own word for "every language" is the locale `default`; shown in words. */
const localeName = (l: string) => (l === 'default' ? 'Every language (default)' : l);

const MessengerSettingsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const can = hasPerm('marketing.manage');
  const { toast } = useToast();
  const setupQ = useLoad(() => metaApi.setup(), []);
  const q = useLoad(() => messagingAPI.inboxSettings(), []);
  const [form, setForm] = useState<MessengerProfile | null>(null);
  const [busy, setBusy] = useState<'save' | 'push' | null>(null);

  useEffect(() => { if (q.data && !form) setForm(structuredClone(q.data.profile)); }, [q.data, form]);

  const apply = (s: InboxSettings, what: string) => {
    q.setData(s); setForm(structuredClone(s.profile));
    const bad = s.pushed.filter((p) => !p.ok);
    toast(bad.length
      ? { title: `${what}, but ${bad.map((p) => platformName(p.platform)).join(' and ')} refused it`, description: bad.map((p) => p.error).join(' '), variant: 'destructive' }
      : { title: `${what} and live on Meta` });
  };
  const save = async () => {
    if (!form) return;
    setBusy('save');
    try { apply(await messagingAPI.saveInboxSettings(form), 'Saved'); }
    catch (e) { toast({ title: 'Not saved', description: writeError(e, 'The settings were refused.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const push = async () => {
    setBusy('push');
    try { apply(await messagingAPI.pushInboxSettings(), 'Pushed again'); }
    catch (e) { toast({ title: 'Not pushed', description: writeError(e, 'Meta did not answer.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const pushed = q.data?.pushed ?? [];
  const failed = pushed.filter((p) => !p.ok);
  const dirty = !!form && !!q.data && JSON.stringify(form) !== JSON.stringify(q.data.profile);
  const set = (patch: Partial<MessengerProfile>) => form && setForm({ ...form, ...patch });

  return (
    <div className="space-y-5">
      <MetaHeader title="Messenger settings" setup={setupQ.data}
        description="What people see when they open a chat with your Page or Instagram account: a greeting, questions to tap and a menu."
        actions={<Button size="sm" variant="outline" asChild><Link to={metaHref(SOCIAL_ROUTES.inbox)}>Back to the inbox</Link></Button>} />

      {q.error && !q.data ? <LoadFailure failure={q.error} what="The Messenger settings (GET /api/v2/comms/inbox/settings) are not served yet." onRetry={q.reload} />
        : !form || !q.data ? <p className="text-sm text-gray-500">Loading...</p> : (
          <>
            {failed.length ? (
              <Lead tone="bad" title={`${failed.map((p) => platformName(p.platform)).join(' and ')} did not take these settings`}
                actions={can && <Button size="sm" variant="outline" className="bg-white" onClick={push} disabled={!!busy}>{busy === 'push' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Push again</Button>}>
                {failed.map((p) => <p key={p.platform}><b>{platformName(p.platform)}:</b> {p.error ?? 'Meta gave no reason.'}{p.at ? ` (${ago(p.at)}${p.by ? `, ${p.by}` : ''})` : ''}</p>)}
                <p className="mt-1">Your settings are saved here; fix what Meta says, then push again.</p>
              </Lead>
            ) : pushed.length ? (
              <Lead tone="good" title={`Live on ${pushed.map((p) => platformName(p.platform)).join(' and ')}`}>
                Pushed {ago(pushed[0].at)}{pushed[0].by ? ` by ${pushed[0].by}` : ''}. Meta can take up to a day to show a changed menu.
              </Lead>
            ) : (
              <Lead tone="info" title="Not on Meta yet">Save once to push these settings to Messenger{form.instagram ? ' and Instagram' : ''}.</Lead>
            )}
            {dirty && (
              <Lead tone="warn" title="Unsaved changes"
                actions={can && <Button size="sm" onClick={save} disabled={!!busy}>{busy === 'save' && <Loader2 className="animate-spin" />} Save and push to Meta</Button>}>
                Save to push them to Meta.
              </Lead>
            )}

            <Section title="Greeting" hint="Shown before someone writes to your Page for the first time. Add a language to greet people in it.">
              <LocaleList
                rows={form.greeting}
                onChange={(greeting) => set({ greeting })}
                blank={() => ({ locale: form.greeting.length ? '' : 'default', text: '' })}
                disabled={!can}
                addLabel="Add a language"
                render={(g, upd) => (
                  <Textarea aria-label={`Greeting, ${localeName(g.locale)}`} rows={2} value={g.text} onChange={(e) => upd({ ...g, text: e.target.value })} disabled={!can} />
                )}
              />
            </Section>

            <Section title="Ice breakers" hint="Questions people can tap to start a chat. The code is what your inbox receives when one is tapped; leave it empty to receive the question.">
              <LocaleList<Breakers>
                rows={form.ice_breakers}
                onChange={(ice_breakers) => set({ ice_breakers })}
                blank={() => ({ locale: form.ice_breakers.length ? '' : 'default', questions: [{ question: '', payload: '' }] })}
                disabled={!can}
                addLabel="Add a language"
                render={(b, upd) => (
                  <div className="space-y-2">
                    {b.questions.map((qq, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_12rem_auto]">
                        <Input aria-label={`Question ${i + 1}`} placeholder="Question" value={qq.question} disabled={!can} className="order-1"
                          onChange={(e) => upd({ ...b, questions: b.questions.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
                        <Input aria-label={`Code for question ${i + 1}`} placeholder="Code (optional)" className="order-3 font-mono text-xs sm:order-2" value={qq.payload ?? ''} disabled={!can}
                          onChange={(e) => upd({ ...b, questions: b.questions.map((x, j) => (j === i ? { ...x, payload: e.target.value } : x)) })} />
                        <div className="order-2 sm:order-3"><RemoveButton label={`Remove question ${i + 1}`} disabled={!can} onClick={() => upd({ ...b, questions: b.questions.filter((_, j) => j !== i) })} /></div>
                      </div>
                    ))}
                    {can && <Button type="button" size="sm" variant="ghost" onClick={() => upd({ ...b, questions: [...b.questions, { question: '', payload: '' }] })}><Plus /> Add a question</Button>}
                  </div>
                )}
              />
            </Section>

            <Section title="Menu" hint="The menu beside the message box: a link to your store, or a button that sends a code to your inbox.">
              <LocaleList<Menu>
                rows={form.persistent_menu}
                onChange={(persistent_menu) => set({ persistent_menu })}
                blank={() => ({ locale: form.persistent_menu.length ? '' : 'default', composer_input_disabled: false, items: [{ type: 'web_url', title: '', url: '' }] })}
                disabled={!can}
                addLabel="Add a language"
                render={(m, upd) => (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 text-sm">
                      <Switch checked={!m.composer_input_disabled} onCheckedChange={(v) => upd({ ...m, composer_input_disabled: !v })} disabled={!can} className="mt-0.5" />
                      <span>People can type their own messages<span className="block text-xs text-gray-500">Off: people can only tap the menu. Instagram ignores this.</span></span>
                    </label>
                    {m.items.map((it, i) => (
                      <div key={i} className="grid gap-2 rounded-md border bg-gray-50 p-2 sm:grid-cols-[9rem_1fr_1fr_auto] sm:border-0 sm:bg-transparent sm:p-0">
                        <select aria-label={`Kind of item ${i + 1}`} value={it.type} disabled={!can}
                          onChange={(e) => upd({ ...m, items: m.items.map((x, j) => (j === i ? { type: e.target.value, title: x.title, url: e.target.value === 'web_url' ? x.url ?? '' : null, payload: e.target.value === 'postback' ? x.payload ?? '' : null } : x)) })}
                          className="h-9 rounded-md border bg-white px-2 text-sm">
                          <option value="web_url">Link</option>
                          <option value="postback">Button</option>
                        </select>
                        <Input aria-label={`Title of item ${i + 1}`} placeholder="Title" value={it.title} disabled={!can}
                          onChange={(e) => upd({ ...m, items: m.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                        {it.type === 'web_url'
                          ? <Input aria-label={`Link of item ${i + 1}`} placeholder="https://" inputMode="url" value={it.url ?? ''} disabled={!can}
                            onChange={(e) => upd({ ...m, items: m.items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                          : <Input aria-label={`Code of item ${i + 1}`} placeholder="Code sent to your inbox" className="font-mono text-xs" value={it.payload ?? ''} disabled={!can}
                            onChange={(e) => upd({ ...m, items: m.items.map((x, j) => (j === i ? { ...x, payload: e.target.value } : x)) })} />}
                        <RemoveButton label={`Remove item ${i + 1}`} disabled={!can} onClick={() => upd({ ...m, items: m.items.filter((_, j) => j !== i) })} />
                      </div>
                    ))}
                    {can && <Button type="button" size="sm" variant="ghost" onClick={() => upd({ ...m, items: [...m.items, { type: 'web_url', title: '', url: '' }] })}><Plus /> Add an item</Button>}
                  </div>
                )}
              />
            </Section>

            <Section title="Instagram" hint="The same ice breakers and menu on your Instagram account. The greeting is not sent to Instagram.">
              <label className="flex items-start gap-3 text-sm">
                <Switch checked={form.instagram} onCheckedChange={(v) => set({ instagram: v })} disabled={!can} className="mt-0.5" />
                <span>Also on Instagram<span className="block text-xs text-gray-500">The Instagram account owner must allow access to messages in the Instagram app first.</span></span>
              </label>
              {pushed.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {pushed.map((p) => (
                    <li key={p.platform} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{platformName(p.platform)}</span>
                      {p.ok ? <StateChip tone="good">Pushed</StateChip> : <StateChip tone="bad">Refused</StateChip>}
                      <span className="text-xs text-gray-500">{ago(p.at)}{p.by ? `, ${p.by}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {!can && <p className="mr-auto text-sm text-gray-600">Changing these needs the marketing manage permission.</p>}
              {can && <Button variant="outline" onClick={push} disabled={!!busy || dirty} title={dirty ? 'Save first' : undefined}>{busy === 'push' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Push again</Button>}
              {can && <Button onClick={save} disabled={!!busy || !dirty}>{busy === 'save' && <Loader2 className="animate-spin" />} Save and push to Meta</Button>}
            </div>
            <p className="text-xs text-gray-500">Chats themselves are in the <Link className={linkCls} to={metaHref(SOCIAL_ROUTES.inbox)}>inbox</Link>.</p>
          </>
        )}
    </div>
  );
};

/** Rows that each belong to one language (`locale`), with add and remove. */
function LocaleList<T extends { locale: string }>({ rows, onChange, blank, render, disabled, addLabel }: {
  rows: T[]; onChange: (rows: T[]) => void; blank: () => T; render: (row: T, update: (row: T) => void) => React.ReactNode; disabled: boolean; addLabel: string;
}) {
  return (
    <div className="space-y-4">
      {rows.length === 0 && <p className="text-sm text-gray-600">None yet.</p>}
      {rows.map((r, i) => (
        <div key={i} className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0">
              <Label htmlFor={`loc-${addLabel}-${i}`} className="text-xs text-gray-500">Language</Label>
              {r.locale === 'default'
                ? <p id={`loc-${addLabel}-${i}`} className="text-sm font-medium">{localeName(r.locale)}</p>
                : <Input id={`loc-${addLabel}-${i}`} value={r.locale} placeholder="For example hi_IN" className="mt-1 h-8 w-40 font-mono text-xs" disabled={disabled}
                  onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, locale: e.target.value } : x)))} />}
            </div>
            {r.locale !== 'default' && <RemoveButton label={`Remove ${r.locale || 'this language'}`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))} />}
          </div>
          {render(r, (next) => onChange(rows.map((x, j) => (j === i ? next : x))))}
        </div>
      ))}
      {!disabled && <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, blank()])}><Plus /> {rows.length ? addLabel : 'Add'}</Button>}
    </div>
  );
}

const RemoveButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({ label, onClick, disabled }) => (
  <button type="button" aria-label={label} onClick={onClick} disabled={disabled}
    className="h-9 w-9 justify-self-start rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40">
    <Trash2 className="h-4 w-4" />
  </button>
);

export default MessengerSettingsPage;
