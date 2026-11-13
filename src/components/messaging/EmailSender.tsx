import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Loader2, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Chip, BlockSkeleton } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { messagingAPI, errText, type EmailConfig, type EmailConfigInput, type TestResult } from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';
import { AccountBanner, ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * The Email page's Sender & SMTP tab: who the store's email comes from, and through which
 * server: Growcord's own mail service, or the store's SMTP account
 * (`GET/PUT /comms/email/config`, `POST /comms/email/test`, contract §4.5; the
 * SAME `smtp` store setting the email provider reads). The password is
 * write-only: the server only says whether one is saved, and an empty box
 * leaves it as it is.
 *
 * Permissions are the `smtp` setting's own (`settings.read` / `settings.manage`,
 * MSG-2 `channel_config.rs`), not the template pair. The From name is always
 * the store's name and the Reply-To the store's support email, both set in
 * Branding and shown here read-only (the server accepts them only unchanged).
 *
 * The checks before Save are the server's own (`put_email`): your own server needs a host, a
 * port, a username and a password (saved or typed). The test can send any catalogue email
 * (`key`), and its answer stays on screen. Lane ADMIN-MSG-1, reconciled by ADMIN-MSG-2;
 * MENU-1 email.
 */
type Form = {
  mode: 'platform' | 'own'; from_email: string;
  host: string; port: string; secure: boolean; username: string; password: string;
};
const formOf = (c: EmailConfig): Form => ({
  mode: c.mode, from_email: c.from_email ?? '',
  host: c.host ?? '', port: c.port ? String(c.port) : '', secure: c.secure, username: c.username ?? '', password: '',
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The usual TLS setting of the well-known SMTP ports: implicit TLS on 465, STARTTLS (off here) on 587 and 25. */
const TLS_BY_PORT: Record<string, boolean> = { '465': true, '587': false, '25': false };

const EmailSender: React.FC<{
  canWrite: boolean;
  /** Catalogue emails the test may send (key and name); the server's default when none is picked. */
  messages?: Array<{ key: string; label: string }>;
}> = ({ canWrite, messages = [] }) => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<EmailConfig | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [to, setTo] = useState('');
  const [testKey, setTestKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<(TestResult & { to: string }) | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    try { const c = await messagingAPI.emailConfig(); setCfg(c); setForm(formOf(c)); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the email sender.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const base = useMemo(() => (cfg ? formOf(cfg) : null), [cfg]);
  const dirty = !!form && !!base && JSON.stringify(form) !== JSON.stringify(base);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  /** A port the usual TLS setting is known for also sets the switch; it can still be changed. */
  const setPort = (v: string) => setForm((f) => {
    if (!f) return f;
    const tls = TLS_BY_PORT[v.trim()];
    return { ...f, port: v, ...(tls === undefined ? {} : { secure: tls }) };
  });

  const problems = useMemo(() => {
    if (!form || !cfg) return [] as string[];
    const p: string[] = [];
    if (form.mode === 'own') {
      if (form.from_email && !EMAIL.test(form.from_email)) p.push('The sending address is not an email address.');
      if (!form.host.trim()) p.push('Your SMTP server needs a host.');
      const port = Number(form.port);
      if (!form.port || !Number.isInteger(port) || port < 1 || port > 65535) p.push('The port is a number from 1 to 65535 (465 with TLS, 587 without).');
      if (!form.username.trim()) p.push('Your SMTP server needs a username.');
      if (!form.password && !cfg.password_set) p.push('Type the SMTP password: none is saved yet.');
    }
    return p;
  }, [form, cfg]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      // from_name / reply_to are never sent: they come from the store's details and Branding.
      const body: EmailConfigInput = { mode: form.mode };
      if (form.mode === 'own') {
        // On Growcord's account the address is Growcord's sending address (MSG-0 §3); only your own server takes one.
        body.from_email = form.from_email.trim() || null;
        Object.assign(body, { host: form.host.trim() || null, port: Number(form.port) || null, secure: form.secure, username: form.username.trim() || null });
        // Write-only: sent only when typed; an empty box keeps the saved one.
        if (form.password) body.password = form.password;
      }
      const c = await messagingAPI.saveEmailConfig(body);
      setCfg(c); setForm(formOf(c));
      setLastTest(null);
      toast({ title: 'Email sender saved', description: c.note || undefined, variant: c.note ? 'destructive' : undefined });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not saved', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  const test = async () => {
    const addr = to.trim();
    setTesting(true);
    try {
      const r = await messagingAPI.testEmail(addr, testKey || undefined);
      setLastTest({ ...r, to: addr });
      toast({ variant: r.ok ? undefined : 'destructive', title: r.ok ? `Test email sent to ${addr}` : 'Test email not sent', description: r.message });
    } catch (e: any) {
      const message = failureOf(e, '').gap ? 'The test route is not on this server yet.' : errText(e, 'The test was refused.');
      setLastTest({ ok: false, message, to: addr });
      toast({ variant: 'destructive', title: 'Test email not sent', description: message });
    } finally { setTesting(false); }
  };

  if (failure?.gap) {
    return (
      <GapNotice what="The email sender route (GET /comms/email/config) is not on this server yet.">
        The SMTP account can still be entered on <Link className="underline" to="/settings?key=smtp">the Settings Center, Email (SMTP)</Link>.
      </GapNotice>
    );
  }
  if (failure) return <ErrorNotice message={failure.message} onRetry={load} />;
  if (!cfg || !form) return <BlockSkeleton lines={8} />;
  const readOnlyBox = (label: string, value: string, help: React.ReactNode) => (
    <div className="space-y-1 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <p className="flex min-h-9 items-center break-all rounded-md border border-line bg-surface-2 px-3 py-1.5 text-ink-soft">{value}</p>
      <span className="block text-[11px] text-ink-soft">{help}</span>
    </div>
  );
  const brandingLink = <Link className="underline" to="/messaging/email?tab=branding">set in Branding</Link>;
  const noReplyTo = 'Not set: replies go to the sending address';

  const field = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, help?: string) => (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <Input value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value as any)} className="h-9" {...props} />
      {help && <span className="block text-[11px] text-ink-soft">{help}</span>}
    </label>
  );

  const testBlocked = !canWrite ? 'Needs the settings.manage permission'
    : dirty ? 'Save your changes first: the test uses the saved settings'
      : !EMAIL.test(to.trim()) ? 'Type an email address' : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <fieldset className="min-w-0 space-y-4 rounded-lg border border-line bg-surface p-4" disabled={!canWrite}>
        <legend className="px-1 text-sm font-semibold text-ink">Who it comes from</legend>
        {cfg.note && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-bad bg-bad-bg px-3 py-2 text-sm text-bad-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0"><span className="font-semibold">Email may not go out.</span> {cfg.note}</span>
          </div>
        )}
        <AccountBanner own={cfg.mode === 'own'}>
          <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-2 gap-y-0.5">
            <dt>From name</dt><dd className="min-w-0 break-words">{cfg.from_name || "Your store's name"}</dd>
            <dt>Sending address</dt><dd className="min-w-0 break-all">{cfg.from_email || (cfg.mode === 'own' ? 'Not set' : "Growcord's sending address")}</dd>
            <dt>Reply-To</dt><dd className="min-w-0 break-all">{cfg.reply_to || noReplyTo}</dd>
          </dl>
          {cfg.mode !== 'own' && <p className="mt-1">Customers see your store&apos;s name; replies come to your Reply-To address.</p>}
        </AccountBanner>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={cfg.live ? 'green' : 'amber'}>{cfg.live ? 'Live' : 'Test mode'}</Chip>
          {!cfg.live && <span className="text-xs text-ink-soft">The settings below are the store&apos;s test mode ones; live mode keeps its own.</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['platform', "Growcord's mail service", 'Nothing to set up. Your store name is the sender.'],
            ['own', 'Your own SMTP server', 'Mail goes out from your own domain (for example Google Workspace or Zoho).']] as const).map(([v, label, hint]) => (
            <label key={v} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm', form.mode === v ? 'border-brand bg-brand/5' : 'border-line', !canWrite && 'cursor-not-allowed opacity-70')}>
              <input type="radio" name="email-mode" className="mt-0.5" checked={form.mode === v} onChange={() => set('mode', v)} />
              <span><span className="block font-medium text-ink">{label}</span><span className="mt-0.5 block text-xs text-ink-soft">{hint}</span></span>
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {readOnlyBox('From name', cfg.from_name || "Your store's name", <>Always your store&apos;s name, {brandingLink} and the store details.</>)}
          {form.mode === 'own'
            ? field('from_email', 'Sending address', { type: 'email', inputMode: 'email', placeholder: 'orders@yourstore.com' }, 'On your own domain, so mail is not marked as spam.')
            : (
              <div className="space-y-1 text-sm">
                <span className="font-medium text-ink">Sending address</span>
                <p className="flex h-9 items-center break-all rounded-md border border-line bg-surface-2 px-3 text-ink-soft">{cfg.from_email || "Growcord's sending address"}</p>
                <span className="block text-[11px] text-ink-soft">Set by Growcord on its account. Switch to your own server to use your domain.</span>
              </div>
            )}
          {readOnlyBox('Reply-to', cfg.reply_to || noReplyTo, <>Your support email, {brandingLink}. Where a customer&apos;s reply lands.</>)}
        </div>
        {form.mode === 'own' && (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            {field('host', 'SMTP host', { placeholder: 'smtp.yourprovider.com', autoComplete: 'off' })}
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-ink">Port</span>
              <Input value={form.port} onChange={(e) => setPort(e.target.value)} className="h-9" inputMode="numeric" placeholder="465" />
              <span className="block text-[11px] text-ink-soft">465 turns TLS on; 587 and 25 turn it off.</span>
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Switch checked={form.secure} onCheckedChange={(v) => set('secure', v)} aria-label="Use TLS" disabled={!canWrite} />
              <span className="text-ink">Use TLS <span className="text-xs text-ink-soft">(on for port 465, off for 587)</span></span>
            </label>
            {field('username', 'Username', { autoComplete: 'off' })}
            {field('password', 'Password', {
              type: 'password', autoComplete: 'new-password',
              placeholder: cfg.password_set ? 'Saved. Type to replace' : 'Not saved yet',
            }, cfg.password_set ? 'Never shown. Leave empty to keep the saved one.' : 'Needed once; it is stored sealed and never shown again.')}
          </div>
        )}
        {problems.length > 0 && dirty && <ul className="space-y-0.5 text-xs text-bad-ink">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {!canWrite && <span className="mr-auto text-xs text-ink-soft">Read-only: needs the settings.manage permission.</span>}
          <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setForm(formOf(cfg))}>Discard</Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving || problems.length > 0}
            title={!dirty ? 'Nothing changed yet' : problems.length ? problems[0] : undefined}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
          </Button>
        </div>
      </fieldset>

      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Test email</p>
          <p className="mb-2 text-xs text-ink-soft">Sends one real email with the saved settings, on sample data. Save first if you changed anything.</p>
          <div className="space-y-2">
            {messages.length > 0 && (
              <select aria-label="Which email to send" value={testKey} onChange={(e) => setTestKey(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-ink">
                <option value="">Order confirmation (the usual test)</option>
                {messages.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            )}
            <div className="flex flex-wrap gap-2">
              <Input type="email" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com"
                aria-label="Address for the test email" className="h-9 w-full sm:w-64" />
              <Button size="sm" className="h-9" onClick={test} disabled={testing || !!testBlocked} title={testBlocked}>
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send test
              </Button>
            </div>
          </div>
          {lastTest && (
            <p role="status" className={cn('mt-3 rounded-md border px-3 py-2 text-xs', lastTest.ok ? 'border-good bg-good-bg text-good-ink' : 'border-bad bg-bad-bg text-bad-ink')}>
              <span className="font-semibold">{lastTest.ok ? 'Sent.' : 'Not sent.'}</span> {lastTest.message}
              {lastTest.ok && <> It shows in the <Link className="underline" to="/messaging/email?tab=log">Sent log</Link>.</>}
            </p>
          )}
        </div>
        <Link to="/settings?key=smtp" className="inline-flex items-center gap-1 text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
          <ExternalLink className="h-3 w-3" /> The same setting in the Settings Center
        </Link>
      </div>
    </div>
  );
};

export default EmailSender;
