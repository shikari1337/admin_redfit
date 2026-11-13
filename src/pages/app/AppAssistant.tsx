import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { Btn, Field, Page, PageHeader, SectionCard, StatusChip, TextInput } from '@/components/erp';
import { ChartCard, CompareBars, KpiTile, Segmented, TimeSeries, TwinTable, Unavailable } from '@/components/panelAnalytics/Kit';
import { SERIES } from '@/components/panelAnalytics/vizTheme';
import { ErrorNote, Loading, Notice, OnOff, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useAiStatus } from '@/lib/ai';
import { codeLabel, getAppConfig, getAppSettings, localeName, setAppSwitch } from '@/lib/v2/appSettings';
import {
  getAssistantSettings, getAssistantStatus, getAssistantUsage, putAssistantSettings, type AssistantDoc,
} from '@/lib/v2/appGrowth';

/**
 * APP ASSISTANT AND SCAN (HMAPP-3 points 8 and 9): ordering in words, typed or spoken in any
 * language, and a photo of a bottle, a label or (India, with the customer's consent) a doctor's
 * slip. The server's AI reads the words or the photo, the store's own search finds the products, and
 * the app proposes bag lines the customer confirms. It never gives medical advice: the replies are the
 * store's fixed words, and a health question goes to a person.
 *
 * Server (lane BC, `apps/commerce/core/src/api/app_assistant.rs`):
 * - Switches: the app document's (`assistant`, `scan_ai`, `scan_ai_slip`), off by default; names from
 *   the app config the server answers; saved one at a time with `setAppSwitch`.
 * - `GET /app/assistant`: which helper the app may offer now and the reason code when not.
 * - `GET, PUT /app/assistant/settings` (`settings.read`; `settings.manage`, a person): the daily AI
 *   token budget, the per install and per customer limits, the fixed reply words by language.
 * - `GET /app/assistant/usage?days` (`settings.read`): calls and tokens per day, purpose and outcome.
 *   The log keeps no personal data; the server counts tokens, not money, so no cost is shown.
 */

/** The app switch names this page shows: the assistant and scan family of the server's switch names. */
const isAssistantSwitch = (name: string) => name === 'assistant' || name.startsWith('assistant_') || name.startsWith('scan');

/** The server's reason codes for a helper the app cannot offer (`api/app_assistant.rs` `blocked`, `helper`), in words. */
const REASON_WORDS: Record<string, string> = {
  switched_off: 'Its switch is off.',
  not_set_up: 'The usage log is not set up on this server yet, so no AI call is made.',
  budget_spent: "Today's token budget is spent; it opens again tomorrow.",
  no_ai_key: 'No AI provider key is set for this store.',
  country_store: 'Not offered in a country store.',
};

const purposeWords = (p: string) => codeLabel(p.replace(/^app\./, ''));
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'not given' : v.toLocaleString('en-IN'));
const DAY_CHOICES = [7, 14, 30, 90];
const MAX_LINE = 400;

const AppAssistant: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm('settings.manage');
  const ai = useAiStatus();
  const settings = useLoad(getAssistantSettings, []);
  const status = useLoad(getAssistantStatus, []);
  const app = useLoad(getAppSettings, []);
  const config = useLoad(getAppConfig, []);
  const [days, setDays] = useState(14);
  const usage = useLoad(() => getAssistantUsage(days), [days]);
  const [doc, setDoc] = useState<AssistantDoc>({});
  const [dirty, setDirty] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => { if (settings.data) { setDoc(settings.data.settings); setDirty(false); } }, [settings.data]);

  const switches: Record<string, boolean> = app.data?.settings?.switches ?? {};
  const live: Record<string, boolean> = config.data?.switches && typeof config.data.switches === 'object' ? config.data.switches : {};
  const names = useMemo(
    () => [...new Set([...Object.keys(live), ...Object.keys(switches)])].filter(isAssistantSwitch),
    [live, switches],
  );
  const wordKeys = settings.data?.word_keys ?? [];
  const langs = Object.keys(doc.words ?? {});

  const change = (next: AssistantDoc) => { setDoc(next); setDirty(true); setSaved(null); };
  const setNum = (k: 'daily_tokens' | 'device_per_hour' | 'customer_per_day', text: string) => {
    const t = text.trim();
    const next = { ...doc };
    if (t === '') delete next[k]; else if (/^\d+$/.test(t)) next[k] = Number(t); else return;
    change(next);
  };
  const setLine = (lang: string, key: string, raw: string) => {
    // The server keeps each line on one line (no line breaks or other control characters).
    const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ');
    const words = { ...(doc.words ?? {}) };
    const lines = { ...(words[lang] ?? {}) };
    if (text === '') delete lines[key]; else lines[key] = text;
    words[lang] = lines;
    change({ ...doc, words });
  };

  const toggle = async (name: string) => {
    setBusy(name); setError(null); setSaved(null);
    try {
      await setAppSwitch(name, !(switches[name] === true));
      await Promise.all([app.reload(), config.reload(), status.reload()]);
      setSaved(`${codeLabel(name)} is saved.`);
    } catch (e) { setError(e); } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('settings'); setError(null); setSaved(null);
    try {
      const words = Object.fromEntries(Object.entries(doc.words ?? {}).map(([l, lines]) => [
        l, Object.fromEntries(Object.entries(lines).map(([k, w]) => [k, w.trim()]).filter(([, w]) => w)),
      ]));
      await putAssistantSettings({ ...doc, words });
      await Promise.all([settings.reload(), usage.reload(), status.reload()]);
      setSaved('The assistant settings are saved.');
    } catch (e) { setError(e); } finally { setBusy(null); }
  };

  const tooLong = langs.some((l) => Object.values(doc.words?.[l] ?? {}).some((w) => w.trim().length > MAX_LINE));
  const off = whyDisabled(canSave, []);
  const saveOff = whyDisabled(canSave, [!dirty && 'Nothing has changed.', tooLong && `A line is longer than ${MAX_LINE} characters.`]);

  const u = usage.data;
  const perDay = useMemo(() => {
    const m = new Map<string, { day: string; calls: number; tokens: number }>();
    for (const r of u?.rows ?? []) {
      const x = m.get(r.day) ?? { day: r.day, calls: 0, tokens: 0 };
      x.calls += r.calls; x.tokens += r.input_tokens + r.output_tokens;
      m.set(r.day, x);
    }
    return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [u]);
  const byOutcome = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of u?.rows ?? []) m.set(r.outcome, (m.get(r.outcome) ?? 0) + r.calls);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [u]);
  const calls = perDay.reduce((s, d) => s + d.calls, 0);
  const tokens = perDay.reduce((s, d) => s + d.tokens, 0);

  return (
    <Page>
      <PageHeader
        icon={Bot}
        title="App assistant and scan"
        description="Ordering in words, typed or spoken in any language, and reading a photo of a bottle, a label or a doctor's slip. The AI proposes bag lines and the customer confirms them."
        actions={<Link to="/settings/app?tab=switches" className="text-sm text-blue-700 underline">All app switches</Link>}
      />
      <Notice tone="info">
        The assistant never gives medical advice. Its replies are the fixed words below, and a question about health or a symptom goes to a person on your team.
      </Notice>
      {saved && <Notice tone="good">{saved}</Notice>}
      {error ? <ErrorNote error={error} /> : null}

      <SectionCard title="What the app can offer now" description="As the server answers the app itself.">
        {status.loading && !status.data ? <Loading label="Asking the server" /> : status.error ? (
          <ErrorNote error={status.error} what="The app assistant" onRetry={() => void status.reload()} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {(status.data?.helpers ?? []).map(({ key, helper }) => (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-gray-900">{codeLabel(key)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {helper.available ? <StatusChip status="active" label="Offered" /> : (
                    <>
                      <span className="text-gray-600">{helper.reason ? REASON_WORDS[helper.reason] ?? codeLabel(helper.reason) : 'Not offered.'}</span>
                      {helper.reason === 'no_ai_key' && <Link to={ai.setupPath} className="text-blue-700 underline">Set up an AI key</Link>}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Switches" description="Each is off until a person turns it on. The slip scan works only in an India store, with the customer's consent.">
        {app.loading && !app.data ? <Loading label="Reading the app switches" /> : app.error ? (
          <ErrorNote error={app.error} what="The app's switches" onRetry={() => void app.reload()} />
        ) : names.length === 0 ? (
          <Notice tone="warn">The server named no assistant or scan switch. It is not on this server yet.</Notice>
        ) : (
          <ul className="divide-y divide-gray-100">
            {names.map((name) => (
              <li key={name} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{codeLabel(name)}</div>
                  {name in live && live[name] !== (switches[name] === true) && (
                    <div className="text-xs text-amber-700">Saved {switches[name] ? 'on' : 'off'}, but the server has it {live[name] ? 'on' : 'off'} for this store.</div>
                  )}
                </div>
                <OnOff on={switches[name] === true} label={codeLabel(name)} disabled={!!off} title={off ?? undefined}
                  busy={busy === name} onToggle={() => void toggle(name)} />
              </li>
            ))}
          </ul>
        )}
        {off && <p className="mt-2 text-xs text-gray-500">{off}</p>}
      </SectionCard>

      <SectionCard title="Budget and limits" description="Tokens are what the AI provider counts and bills, in and out together. When today's budget is spent the app stops asking until tomorrow.">
        {settings.loading && !settings.data ? <Loading label="Reading the settings" /> : settings.error ? (
          <ErrorNote error={settings.error} what="The assistant's settings" onRetry={() => void settings.reload()} />
        ) : (
          <div className="space-y-4">
            {!settings.data?.stored && <Notice tone="info">Showing the server's defaults. Save to make them the store's own.</Notice>}
            {settings.data?.problem && <Notice tone="bad" title="The saved settings are not in force">{settings.data.problem}</Notice>}
            <div className="flex flex-wrap gap-4">
              <Field label="Tokens a day (0 to 50,000,000)">
                <TextInput inputMode="numeric" value={doc.daily_tokens ?? ''} disabled={!canSave} onChange={(e) => setNum('daily_tokens', e.target.value)} className="w-44 tabular-nums" />
              </Field>
              <Field label="Asks per install an hour (1 to 1000)">
                <TextInput inputMode="numeric" value={doc.device_per_hour ?? ''} disabled={!canSave} onChange={(e) => setNum('device_per_hour', e.target.value)} className="w-44 tabular-nums" />
              </Field>
              <Field label="Asks per customer a day (1 to 1000)">
                <TextInput inputMode="numeric" value={doc.customer_per_day ?? ''} disabled={!canSave} onChange={(e) => setNum('customer_per_day', e.target.value)} className="w-44 tabular-nums" />
              </Field>
            </div>
            {u && u.today_tokens !== null && (
              <p className="text-sm text-gray-600">Used today: {n(u.today_tokens)} of {n(u.daily_tokens)} tokens.</p>
            )}

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Fixed reply words</p>
                <p className="text-xs text-gray-500">What the app says for each kind of answer, by language, one line of up to {MAX_LINE} characters each. A line left empty uses the built-in words.</p>
              </div>
              {langs.length === 0 && <p className="text-sm text-gray-500">Only the built-in words, in every language.</p>}
              {langs.map((lang) => (
                <div key={lang} className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{localeName(lang)} <span className="font-mono text-xs text-gray-500">{lang}</span></span>
                    <button type="button" disabled={!canSave} aria-label={`Remove ${localeName(lang)}`}
                      onClick={() => { const words = { ...(doc.words ?? {}) }; delete words[lang]; change({ ...doc, words }); }}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {wordKeys.map((k) => {
                      const v = doc.words?.[lang]?.[k] ?? '';
                      const id = `words-${lang}-${k}`;
                      return (
                        <div key={k}>
                          <label htmlFor={id} className="block text-xs font-medium text-gray-700">{codeLabel(k)}</label>
                          <textarea id={id} rows={2} value={v} maxLength={MAX_LINE} disabled={!canSave} placeholder="Built-in words"
                            onChange={(e) => setLine(lang, k, e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {canSave && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Add a language (a tag such as hi, ta or bn)">
                    <TextInput value={newLang} maxLength={20} onChange={(e) => setNewLang(e.target.value)} className="w-40 font-mono text-xs" />
                  </Field>
                  <Btn variant="outline" size="sm" disabled={!newLang.trim() || langs.includes(newLang.trim().toLowerCase())}
                    onClick={() => { change({ ...doc, words: { ...(doc.words ?? {}), [newLang.trim().toLowerCase()]: {} } }); setNewLang(''); }}>
                    <Plus className="h-4 w-4" />Add
                  </Btn>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
              <Btn disabled={!!saveOff || busy === 'settings'} title={saveOff ?? undefined} onClick={() => void save()}>
                <Save className="h-4 w-4" />{busy === 'settings' ? 'Saving' : 'Save the settings'}
              </Btn>
              <Btn variant="ghost" disabled={!dirty || busy === 'settings'} onClick={() => { if (settings.data) setDoc(settings.data.settings); setDirty(false); }}>
                <Undo2 className="h-4 w-4" />Undo changes
              </Btn>
              {saveOff && dirty && <span className="text-xs text-amber-700">{saveOff}</span>}
              {!canSave && <span className="text-xs text-gray-500">{off}</span>}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Usage" description="Calls and tokens by day, by what was asked and how it ended. The server keeps no words the customer said, no photo and no name."
        action={<Segmented label="Days to show" value={String(days)} onChange={(k) => setDays(Number(k))} options={DAY_CHOICES.map((d) => ({ key: String(d), label: `${d} days` }))} />}>
        {usage.loading && !u ? <Loading label="Reading the usage" /> : usage.error ? (
          <ErrorNote error={usage.error} what="The assistant's usage" onRetry={() => void usage.reload()} />
        ) : u ? (
          <div className="space-y-4">
            {!u.set_up && <Notice tone="warn">The usage log is not set up on this server yet, so the app makes no AI call.</Notice>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <KpiTile label={`Calls, last ${days} days`} value={calls.toLocaleString('en-IN')} spark={perDay.map((d) => d.calls)} />
              <KpiTile label={`Tokens, last ${days} days`} value={tokens.toLocaleString('en-IN')} spark={perDay.map((d) => d.tokens)} />
              <KpiTile label="Tokens today" value={n(u.today_tokens)} sub={u.daily_tokens !== null ? `of ${n(u.daily_tokens)} a day` : undefined} />
            </div>
            <p className="text-xs text-gray-500">The server counts tokens, not money; the AI provider's bill shows what they cost.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Tokens by day" table={{
                columns: [
                  { key: 'day', label: 'Day' },
                  { key: 'calls', label: 'Calls', format: (v) => Number(v).toLocaleString('en-IN') },
                  { key: 'tokens', label: 'Tokens', format: (v) => Number(v).toLocaleString('en-IN') },
                ],
                rows: perDay,
                empty: 'No call in these days.',
              }}>
                {perDay.length ? (
                  <TimeSeries data={perDay} xKey="day" granularity="day" height={200} series={[{ key: 'tokens', name: 'Tokens', color: SERIES[0], kind: 'bar' }]} />
                ) : <Unavailable>No call in these days.</Unavailable>}
              </ChartCard>
              <ChartCard title="How the calls ended">
                {byOutcome.length ? (
                  <CompareBars rows={byOutcome.map(([o, c]) => ({ label: codeLabel(o), value: c, text: `${c.toLocaleString('en-IN')}${calls ? ` (${Math.round((c / calls) * 100)}%)` : ''}` }))} />
                ) : <Unavailable>No call in these days.</Unavailable>}
              </ChartCard>
            </div>
            <TwinTable
              columns={[
                { key: 'day', label: 'Day' },
                { key: 'purpose', label: 'What was asked', format: (v) => purposeWords(String(v)) },
                { key: 'outcome', label: 'How it ended', format: (v) => codeLabel(String(v)) },
                { key: 'calls', label: 'Calls', format: (v) => Number(v).toLocaleString('en-IN') },
                { key: 'input_tokens', label: 'Tokens in', format: (v) => Number(v).toLocaleString('en-IN') },
                { key: 'output_tokens', label: 'Tokens out', format: (v) => Number(v).toLocaleString('en-IN') },
              ]}
              rows={[...u.rows].sort((a, b) => b.day.localeCompare(a.day))}
              empty="No call in these days."
              maxHeight={320}
            />
          </div>
        ) : null}
      </SectionCard>
    </Page>
  );
};

export default AppAssistant;
